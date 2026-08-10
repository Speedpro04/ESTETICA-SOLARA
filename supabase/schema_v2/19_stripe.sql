-- =============================================================================
-- 19 — COBRANÇA PELO STRIPE
-- =============================================================================
-- O trial de 10 dias NÃO é do Stripe. Ele nasce no register_clinic() como
-- subscriptions.status = 'trialing' com trial_ends_at, sem cartão — foi decisão
-- de negócio ("primeiro testa, se gostar compra"). O Stripe só entra quando a
-- clínica decide pagar. Por isso a sessão de checkout é criada SEM
-- trial_period_days: o teste já correu aqui dentro.
--
-- Um detalhe do ambiente muda o desenho deste arquivo: a conta do Stripe é a
-- mesma do CNPJ, compartilhada com outro produto. O endpoint de webhook da
-- Solara recebe TODOS os eventos da conta, inclusive assinaturas que não são
-- daqui. Então tudo abaixo é escrito para *ignorar em silêncio* o que não
-- reconhece, nunca para adivinhar a linha mais próxima.
-- =============================================================================


-- 1. EVENTOS JÁ PROCESSADOS ---------------------------------------------------
-- O Stripe reentrega o mesmo evento quando a resposta demora ou falha, e não
-- promete ordem. Sem esta trava, uma reentrega de 'customer.subscription.updated'
-- antiga pode sobrescrever um estado mais novo — a clínica paga e volta para
-- 'past_due' sozinha.
CREATE TABLE IF NOT EXISTS public.stripe_events (
    id           TEXT PRIMARY KEY,        -- evt_... (o próprio id do Stripe)
    tipo         TEXT NOT NULL,
    recebido_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Nenhuma política: a tabela não interessa ao navegador. Só o backend, que usa
-- a service_role (ignora RLS), escreve aqui. Ligar o RLS sem policy é o jeito
-- de dizer "ninguém autenticado lê isto".
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

-- Serve para a limpeza periódica: eventos velhos não têm valor depois que o
-- Stripe para de reentregar (algumas horas).
CREATE INDEX IF NOT EXISTS idx_stripe_events_recebido
    ON public.stripe_events (recebido_em);


-- 2. RESERVA DO EVENTO --------------------------------------------------------
-- Devolve TRUE só na primeira vez que este id aparece. INSERT ... ON CONFLICT
-- em vez de SELECT-e-depois-INSERT porque duas entregas simultâneas do mesmo
-- evento passariam as duas pelo SELECT e o trabalho rodaria em dobro.
CREATE OR REPLACE FUNCTION public.stripe_reservar_evento(
    p_id TEXT,
    p_tipo TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    -- INTEGER, não BOOLEAN: ROW_COUNT é contagem, e int->bool não é conversão
    -- que o PL/pgSQL faça sozinho na atribuição.
    v_linhas INTEGER;
BEGIN
    INSERT INTO public.stripe_events (id, tipo)
    VALUES (p_id, COALESCE(p_tipo, 'desconhecido'))
    ON CONFLICT (id) DO NOTHING;

    GET DIAGNOSTICS v_linhas = ROW_COUNT;
    RETURN v_linhas > 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.stripe_reservar_evento(TEXT, TEXT) FROM PUBLIC, anon, authenticated;


-- 3. TRADUÇÃO DE STATUS -------------------------------------------------------
-- O vocabulário do Stripe é maior que o nosso, e escreve "canceled" com um L só
-- enquanto o CHECK de subscriptions exige "cancelled". Gravar o valor cru do
-- Stripe estoura o CHECK e a atualização inteira falha — silenciosamente, do
-- ponto de vista de quem pagou.
--
-- Status desconhecido devolve NULL de propósito: o chamador ignora o evento em
-- vez de inventar um estado.
CREATE OR REPLACE FUNCTION public.stripe_status_local(p_status TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT CASE lower(COALESCE(p_status, ''))
        WHEN 'trialing'           THEN 'trialing'
        WHEN 'active'             THEN 'active'
        WHEN 'past_due'           THEN 'past_due'
        -- Cobrança falhou repetidas vezes e o Stripe desistiu de tentar.
        WHEN 'unpaid'             THEN 'past_due'
        -- Trial acabou sem meio de pagamento. Não é dívida, mas bloqueia igual.
        WHEN 'paused'             THEN 'past_due'
        WHEN 'canceled'           THEN 'cancelled'
        -- Primeiro pagamento nunca completou: a assinatura nem chegou a valer.
        WHEN 'incomplete'         THEN 'pending'
        WHEN 'incomplete_expired' THEN 'cancelled'
        ELSE NULL
    END;
$$;


-- 4. APLICAR O ESTADO DA ASSINATURA -------------------------------------------
-- Ponto único de escrita em subscriptions vindo do Stripe. Existe como função
-- (e não como três chamadas do backend) porque a decisão "esta linha é da
-- clínica X?" precisa acontecer junto da escrita — entre um SELECT e um UPDATE
-- separados cabe uma segunda entrega do webhook.
--
-- A busca é por stripe_subscription_id primeiro, e só cai no clinic_id quando a
-- assinatura ainda não foi vinculada (o primeiro checkout). Assinatura que não
-- casa com nenhum dos dois é do outro produto da conta: devolve 'ignorado'.
CREATE OR REPLACE FUNCTION public.stripe_aplicar_assinatura(
    p_stripe_subscription_id TEXT,
    p_status                 TEXT,
    p_clinic_id              UUID        DEFAULT NULL,
    p_stripe_customer_id     TEXT        DEFAULT NULL,
    p_period_start           TIMESTAMPTZ DEFAULT NULL,
    p_period_end             TIMESTAMPTZ DEFAULT NULL,
    p_cancel_at              TIMESTAMPTZ DEFAULT NULL,
    p_plan_slug              TEXT        DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_status  TEXT;
    v_sub_id  UUID;
    v_plan_id UUID;
BEGIN
    IF COALESCE(trim(p_stripe_subscription_id), '') = '' THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'sem_subscription_id');
    END IF;

    v_status := public.stripe_status_local(p_status);
    IF v_status IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'status_desconhecido',
                                  'status_stripe', p_status);
    END IF;

    IF p_plan_slug IS NOT NULL THEN
        SELECT p.id INTO v_plan_id
          FROM public.plans p WHERE p.slug = p_plan_slug LIMIT 1;
    END IF;

    -- subscriptions.plan_id é NOT NULL. Numa assinatura que precise ser criada
    -- do zero (clínica sem linha, ou apagada na mão), sem este resgate o INSERT
    -- lá embaixo falharia bem no evento que confirma o pagamento.
    IF v_plan_id IS NULL AND p_clinic_id IS NOT NULL THEN
        SELECT c.plan_id INTO v_plan_id
          FROM public.clinics c WHERE c.id = p_clinic_id;
    END IF;
    IF v_plan_id IS NULL AND p_clinic_id IS NOT NULL THEN
        SELECT p.id INTO v_plan_id
          FROM public.plans p WHERE p.active ORDER BY p.display_order LIMIT 1;
    END IF;

    -- Caminho normal: a assinatura já está vinculada.
    SELECT s.id INTO v_sub_id
      FROM public.subscriptions s
     WHERE s.stripe_subscription_id = p_stripe_subscription_id
     LIMIT 1;

    -- Primeiro checkout desta clínica: aproveita a linha que o register_clinic
    -- criou (a mais recente) em vez de abrir uma segunda. FOR UPDATE porque
    -- 'checkout.session.completed' e 'customer.subscription.created' chegam
    -- praticamente juntos e disputam esta mesma linha.
    IF v_sub_id IS NULL AND p_clinic_id IS NOT NULL THEN
        SELECT s.id INTO v_sub_id
          FROM public.subscriptions s
         WHERE s.clinic_id = p_clinic_id
           AND s.stripe_subscription_id IS NULL
         ORDER BY s.created_at DESC
         LIMIT 1
           FOR UPDATE;
    END IF;

    -- Nem por assinatura, nem por clínica. É evento do outro produto da conta.
    IF v_sub_id IS NULL AND p_clinic_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'ignorado');
    END IF;

    IF v_sub_id IS NULL THEN
        INSERT INTO public.subscriptions (
            clinic_id, plan_id, status, stripe_subscription_id, stripe_customer_id,
            current_period_start, current_period_end, cancel_at,
            cancelled_at
        )
        VALUES (
            p_clinic_id,
            v_plan_id,
            v_status, p_stripe_subscription_id, p_stripe_customer_id,
            p_period_start, p_period_end, p_cancel_at,
            CASE WHEN v_status = 'cancelled' THEN NOW() END
        )
        RETURNING id INTO v_sub_id;

        RETURN jsonb_build_object('ok', true, 'acao', 'criada',
                                  'subscription_id', v_sub_id, 'status', v_status);
    END IF;

    -- COALESCE em todo campo opcional: evento parcial (invoice.paid, por
    -- exemplo, não carrega período) não pode apagar o que já está gravado.
    UPDATE public.subscriptions s
       SET status                 = v_status,
           stripe_subscription_id = p_stripe_subscription_id,
           stripe_customer_id     = COALESCE(p_stripe_customer_id, s.stripe_customer_id),
           plan_id                = COALESCE(v_plan_id, s.plan_id),
           current_period_start   = COALESCE(p_period_start, s.current_period_start),
           current_period_end     = COALESCE(p_period_end, s.current_period_end),
           cancel_at              = p_cancel_at,
           cancelled_at           = CASE
                                        WHEN v_status = 'cancelled'
                                        THEN COALESCE(s.cancelled_at, NOW())
                                        ELSE NULL
                                    END,
           updated_at             = NOW()
     WHERE s.id = v_sub_id;

    RETURN jsonb_build_object('ok', true, 'acao', 'atualizada',
                              'subscription_id', v_sub_id, 'status', v_status);
END;
$$;

-- Só o backend (service_role) chama. Deixar `authenticated` executar isto seria
-- entregar ao navegador a caneta que escreve 'active'.
REVOKE EXECUTE ON FUNCTION public.stripe_aplicar_assinatura(TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TEXT)
    FROM PUBLIC, anon, authenticated;


-- 5. PLANO ÚNICO, COM OS PREÇOS DO STRIPE -------------------------------------
-- O seed (06) nasceu com preço zero e o nome antigo "Solara Connect". Aqui os
-- dois planos ficam com o preço real e o teto de especialistas cai: "tudo
-- incluso" da landing não combina com limite de 3.
--
-- price_cents guarda o que é COBRADO no período, não o equivalente mensal — no
-- anual são R$4.764 de uma vez. A landing mostra "R$397/mês" como divisão desse
-- valor; guardar 39700 aqui faria o banco discordar da fatura do Stripe.
UPDATE public.plans SET
    name            = 'Solara Estética — Mensal',
    description     = 'Plano único, tudo incluso. Cobrado todo mês, sem fidelidade.',
    price_cents     = 49700,
    billing_period  = 'monthly',
    trial_days      = 10,
    max_specialists = NULL,
    is_highlighted  = false,
    display_order   = 1,
    active          = true,
    updated_at      = NOW()
WHERE slug = 'solara-mensal';

UPDATE public.plans SET
    name            = 'Solara Estética — Anual',
    description     = 'Plano único, tudo incluso. R$4.764 cobrados uma vez por ano.',
    price_cents     = 476400,
    billing_period  = 'yearly',
    trial_days      = 10,
    max_specialists = NULL,
    is_highlighted  = true,
    display_order   = 2,
    active          = true,
    updated_at      = NOW()
WHERE slug = 'solara-anual';


-- 6. OS IDs DE PREÇO DO STRIPE ------------------------------------------------
-- PREENCHER ANTES DE USAR. São os `price_...` do painel do Stripe (Produtos →
-- o produto → seção Preços), não a URL do buy.stripe.com. O backend recusa o
-- checkout de plano sem este campo, e é de propósito: melhor barrar na hora do
-- que mandar a clínica para uma sessão que cobra o valor errado.
--
-- Os IDs de teste e de produção são DIFERENTES. Rodar de novo trocando os
-- valores é o jeito de virar a chave de test para live.
--
-- UPDATE public.plans SET stripe_price_id = 'price_XXXXXXXXXXXX'
--  WHERE slug = 'solara-mensal';
--
-- UPDATE public.plans SET stripe_price_id = 'price_YYYYYYYYYYYY'
--  WHERE slug = 'solara-anual';
