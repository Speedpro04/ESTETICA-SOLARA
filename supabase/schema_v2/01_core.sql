-- =============================================================================
-- 01 — NÚCLEO: planos, clínicas, equipe, assinatura
-- =============================================================================
-- Ordem de execução: 00_reset → 01_core → 02_dominio → 03_agentes → 04_rls → 05_seed.
--
-- Este arquivo cria só o que é infraestrutura de tenant e comercial. Domínio de
-- estética vem no 02; os agentes, no 03. RLS fica todo junto no 04, de propósito:
-- política espalhada por cinco arquivos é política que ninguém audita.
-- =============================================================================

-- 1. FUNÇÕES BASE ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

-- current_clinic_ids() é definida no fim deste arquivo, e não aqui: função em
-- linguagem SQL tem o corpo validado na CRIAÇÃO, então ela precisa vir depois
-- das tabelas clinics e users que consulta.

-- 2. PLANOS ------------------------------------------------------------------
CREATE TABLE public.plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    -- Centavos, não NUMERIC: preço em float é como se perde dinheiro em
    -- arredondamento, e o Stripe também trabalha em centavos.
    price_cents INTEGER NOT NULL DEFAULT 0,
    billing_period TEXT NOT NULL DEFAULT 'monthly'
        CHECK (billing_period IN ('monthly', 'yearly')),
    trial_days INTEGER NOT NULL DEFAULT 0,
    max_specialists INTEGER,          -- NULL = sem teto
    max_conversations_month INTEGER,  -- NULL = sem teto
    stripe_price_id TEXT,
    features JSONB NOT NULL DEFAULT '[]'::JSONB,
    is_highlighted BOOLEAN NOT NULL DEFAULT false,
    active BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. CLÍNICAS (tenant) -------------------------------------------------------
CREATE TABLE public.clinics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    phone TEXT,
    document TEXT,                    -- CNPJ
    address JSONB,
    timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',

    plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL,
    owner_auth_id UUID,               -- auth.users.id do dono

    active BOOLEAN NOT NULL DEFAULT true,
    onboarding_completed BOOLEAN NOT NULL DEFAULT false,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clinics_owner ON public.clinics (owner_auth_id);
CREATE INDEX idx_clinics_plan ON public.clinics (plan_id);

-- 4. EQUIPE DA CLÍNICA -------------------------------------------------------
CREATE TABLE public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    -- Ponte com o Supabase Auth. auth.users guarda e-mail e senha; esta tabela
    -- guarda de qual clínica a pessoa é e o que ela pode fazer. São cadastros
    -- distintos: apagar um não apaga o outro.
    auth_id UUID UNIQUE,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'recepcao'
        CHECK (role IN ('owner', 'admin', 'profissional', 'recepcao')),

    -- Profissional de estética/plástica: CRM (médico) ou registro do conselho
    -- da categoria (biomédico, odonto, enfermagem).
    conselho TEXT,
    registro TEXT,
    especialidade TEXT,

    phone TEXT,
    avatar_url TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- FK sem índice vira varredura sequencial em todo join e em todo ON DELETE.
CREATE INDEX idx_users_clinic ON public.users (clinic_id);
CREATE INDEX idx_users_auth ON public.users (auth_id);

-- Teto de profissionais por plano. A trava vive no banco, não no navegador:
-- checagem em JavaScript é contornada por qualquer um com o console aberto ou
-- com uma chamada direta ao PostgREST.
--
-- Conta só quem ATENDE. Dono e recepção não consomem vaga: limitar quem
-- responde telefone empurra a clínica para senha compartilhada, e aí a trilha
-- de auditoria perde o sentido.
CREATE OR REPLACE FUNCTION public.check_specialist_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_limite INTEGER;
    v_atuais INTEGER;
BEGIN
    IF NEW.role <> 'profissional' OR NEW.active IS NOT TRUE THEN
        RETURN NEW;
    END IF;

    SELECT p.max_specialists INTO v_limite
      FROM public.clinics c
      JOIN public.plans p ON p.id = c.plan_id
     WHERE c.id = NEW.clinic_id;

    IF v_limite IS NULL THEN
        RETURN NEW;   -- sem teto (plano ilimitado ou clínica sem plano ainda)
    END IF;

    SELECT count(*) INTO v_atuais
      FROM public.users
     WHERE clinic_id = NEW.clinic_id
       AND role = 'profissional'
       AND active IS TRUE
       AND (TG_OP = 'INSERT' OR id <> NEW.id);

    IF v_atuais >= v_limite THEN
        RAISE EXCEPTION
            'Seu plano inclui % profissionais e todos estão em uso. Para adicionar mais, fale com a Solara.', v_limite
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_specialist_limit
    BEFORE INSERT OR UPDATE OF role, active ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.check_specialist_limit();

-- 5. ASSINATURAS -------------------------------------------------------------
CREATE TABLE public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES public.plans(id),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'trialing', 'active', 'past_due', 'cancelled')),
    trial_ends_at TIMESTAMPTZ,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    stripe_payment_intent_id TEXT,
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_clinic ON public.subscriptions (clinic_id);
-- Webhook do Stripe chega com o id de lá e precisa achar a linha em O(1).
CREATE UNIQUE INDEX idx_subscriptions_stripe
    ON public.subscriptions (stripe_subscription_id)
    WHERE stripe_subscription_id IS NOT NULL;

-- 6. ONBOARDING E E-MAIL -----------------------------------------------------
CREATE TABLE public.onboarding_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    used BOOLEAN NOT NULL DEFAULT false,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_onboarding_tokens_clinic ON public.onboarding_tokens (clinic_id);

CREATE TABLE public.email_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL,
    to_email TEXT NOT NULL,
    from_email TEXT NOT NULL DEFAULT 'contato@solaraestetica.online',
    subject TEXT NOT NULL,
    template TEXT,
    status TEXT NOT NULL DEFAULT 'sent'
        CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'bounced')),
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_email_logs_clinic ON public.email_logs (clinic_id, sent_at DESC);

-- 7. RESOLUÇÃO DE TENANT -----------------------------------------------------
-- Resolve "quais clínicas são deste usuário" FORA do alcance do RLS. Depende de
-- clinics e users, por isso vem aqui e não no topo.
--
-- Sem esta função, as políticas de clinics e users se consultam em círculo e o
-- Postgres aborta com 42P17 (infinite recursion): ler clinics chama a política
-- que lê users, que chama a política que lê clinics. O sintoma é o pior
-- possível — o cadastro funciona e o painel abre vazio logo depois, parecendo
-- perda de dados.
--
-- SECURITY DEFINER para ignorar o RLS aqui dentro; search_path vazio e nomes
-- qualificados para que ninguém sequestre a resolução de nomes.
CREATE OR REPLACE FUNCTION public.current_clinic_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
    -- Clínicas onde o usuário é membro da equipe...
    SELECT u.clinic_id
      FROM public.users u
     WHERE u.auth_id = (SELECT auth.uid())
       AND u.clinic_id IS NOT NULL
    UNION
    -- ...e as que ele é dono. Cobre a janela entre criar a clínica e a linha em
    -- users existir; sem esta parte, quem acabou de se cadastrar vê painel vazio.
    SELECT c.id
      FROM public.clinics c
     WHERE c.owner_auth_id = (SELECT auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.current_clinic_ids() TO authenticated;

-- 8. updated_at --------------------------------------------------------------
CREATE TRIGGER trg_plans_updated_at BEFORE UPDATE ON public.plans
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_clinics_updated_at BEFORE UPDATE ON public.clinics
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
