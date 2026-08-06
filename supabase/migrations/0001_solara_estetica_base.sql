-- =============================================================================
-- Solara Estética — schema base (projeto szssizgchukffmmcjxoh)
-- =============================================================================
-- Consolida, em um arquivo só, o que antes estava espalhado em schema.sql,
-- sql_parte1/2/3.sql, fix_register_clinic.sql, supabase/clinic_knowledge_schema.sql
-- e supabase/whatsapp_webhook_schema.sql — arquivos que se contradiziam em
-- pontos importantes (quatro planos por especialista contra plano único,
-- register_clinic com e sem telefone).
--
-- Diferenças em relação ao que existia:
--   1. Plano único de R$497/mês (R$397 no anual), no lugar dos quatro planos.
--   2. subscriptions.trial_ends_at: o teste de 10 dias sem cartão que a landing
--      vende não existia no banco. A assinatura nascia 'pending' e barrava o
--      acesso ao painel.
--   3. register_clinic cria a assinatura como 'trialing' com prazo de 10 dias.
-- =============================================================================

-- 1. PLANOS ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    price_cents INTEGER NOT NULL,
    currency TEXT DEFAULT 'BRL',
    billing_interval TEXT DEFAULT 'month',
    min_specialists INTEGER DEFAULT 1,
    max_specialists INTEGER,
    features JSONB DEFAULT '[]'::JSONB,
    stripe_price_id TEXT,
    is_highlighted BOOLEAN DEFAULT false,
    active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. CLÍNICAS ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clinics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    document TEXT,
    address JSONB,
    plan_id UUID REFERENCES plans(id),
    owner_auth_id UUID,
    active BOOLEAN DEFAULT true,
    onboarding_completed BOOLEAN DEFAULT false,
    -- Configuração de WhatsApp por clínica.
    whatsapp_api_url TEXT,
    whatsapp_api_key TEXT,
    whatsapp_instance_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. USUÁRIOS (equipe da clínica) --------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    auth_id UUID UNIQUE,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin'
        CHECK (role IN ('owner', 'admin', 'doctor', 'receptionist', 'staff')),
    specialty TEXT,
    crm TEXT,
    phone TEXT,
    avatar_url TEXT,
    active BOOLEAN DEFAULT true,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. PACIENTES ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    cpf TEXT,
    birth_date DATE,
    gender TEXT CHECK (gender IN ('M', 'F', 'O', NULL)),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(clinic_id, cpf)
);

-- 5. AGENDAMENTOS ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
    doctor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show')),
    type TEXT DEFAULT 'Consulta',
    room TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. ASSINATURAS -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES plans(id),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'active', 'past_due', 'cancelled', 'trialing')),
    -- Fim do teste de 10 dias. Nulo em assinatura que já é paga.
    trial_ends_at TIMESTAMPTZ,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    stripe_payment_intent_id TEXT,
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. TOKENS DE ONBOARDING ----------------------------------------------------
CREATE TABLE IF NOT EXISTS onboarding_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    temp_password TEXT NOT NULL,
    used BOOLEAN DEFAULT false,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. LOG DE E-MAILS ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE SET NULL,
    to_email TEXT NOT NULL,
    from_email TEXT NOT NULL DEFAULT 'contato@solaraestetica.online',
    subject TEXT NOT NULL,
    template TEXT,
    status TEXT DEFAULT 'sent'
        CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'bounced')),
    metadata JSONB,
    sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. MENSAGENS (WhatsApp / recepção) -----------------------------------------
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
    patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    sender_type TEXT NOT NULL DEFAULT 'patient'
        CHECK (sender_type IN ('patient', 'clinic', 'assistant', 'system')),
    status TEXT NOT NULL DEFAULT 'received'
        CHECK (status IN ('queued', 'sent', 'delivered', 'read', 'received', 'failed')),
    metadata JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. BASE DE CONHECIMENTO DA CLÍNICA ----------------------------------------
-- É o que impede a Solara de inventar preço e horário: o backend injeta estas
-- entradas no contexto do modelo.
CREATE TABLE IF NOT EXISTS clinic_knowledge (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'general'
        CHECK (kind IN ('service', 'price', 'hours', 'insurance', 'faq', 'policy', 'general')),
    title TEXT,
    content TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. ÍNDICES ----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_clinics_owner ON clinics(owner_auth_id);
CREATE INDEX IF NOT EXISTS idx_clinics_slug ON clinics(slug);
CREATE INDEX IF NOT EXISTS idx_clinics_whatsapp_instance_id ON clinics(whatsapp_instance_id);
CREATE INDEX IF NOT EXISTS idx_users_clinic ON users(clinic_id);
CREATE INDEX IF NOT EXISTS idx_users_auth ON users(auth_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_patients_clinic ON patients(clinic_id);
CREATE INDEX IF NOT EXISTS idx_patients_cpf ON patients(clinic_id, cpf);
CREATE INDEX IF NOT EXISTS idx_appointments_clinic ON appointments(clinic_id);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor ON appointments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_appointments_time ON appointments(clinic_id, start_time);
CREATE INDEX IF NOT EXISTS idx_subscriptions_clinic ON subscriptions(clinic_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_token ON onboarding_tokens(token);
CREATE INDEX IF NOT EXISTS idx_onboarding_email ON onboarding_tokens(email);
CREATE INDEX IF NOT EXISTS idx_email_logs_clinic ON email_logs(clinic_id);
CREATE INDEX IF NOT EXISTS idx_messages_clinic_id ON messages(clinic_id);
CREATE INDEX IF NOT EXISTS idx_messages_patient_id ON messages(patient_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clinic_knowledge_clinic_id ON clinic_knowledge(clinic_id);
CREATE INDEX IF NOT EXISTS idx_clinic_knowledge_active ON clinic_knowledge(clinic_id, active);

-- 12. updated_at AUTOMÁTICO --------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_clinics_updated_at ON clinics;
CREATE TRIGGER trg_clinics_updated_at BEFORE UPDATE ON clinics FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_patients_updated_at ON patients;
CREATE TRIGGER trg_patients_updated_at BEFORE UPDATE ON patients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_appointments_updated_at ON appointments;
CREATE TRIGGER trg_appointments_updated_at BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_messages_updated_at ON messages;
CREATE TRIGGER trg_messages_updated_at BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_clinic_knowledge_updated_at ON clinic_knowledge;
CREATE TRIGGER trg_clinic_knowledge_updated_at BEFORE UPDATE ON clinic_knowledge FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 13. SEED: plano único ------------------------------------------------------
INSERT INTO plans (
    name, slug, description, price_cents, billing_interval,
    min_specialists, max_specialists, features, is_highlighted, active, display_order
) VALUES
(
    'Solara Estética — Mensal',
    'solara-mensal',
    'Plano único, tudo incluso. Cobrado todo mês, sem fidelidade.',
    49700, 'month', 1, NULL,
    '["Recepcionista de IA no WhatsApp 24h", "Atendimento e lembrete ilimitados", "Até 500 mensagens de campanha por mês", "Agenda, prontuário e ficha de anamnese", "Especialistas, salas e usuários ilimitados", "Relatórios de faturamento, no-show e retorno", "Suporte por WhatsApp"]'::JSONB,
    false, true, 1
),
(
    'Solara Estética — Anual',
    'solara-anual',
    'Plano único, tudo incluso. R$397/mês cobrados uma vez por ano.',
    39700, 'year', 1, NULL,
    '["Recepcionista de IA no WhatsApp 24h", "Atendimento e lembrete ilimitados", "Até 500 mensagens de campanha por mês", "Agenda, prontuário e ficha de anamnese", "Especialistas, salas e usuários ilimitados", "Relatórios de faturamento, no-show e retorno", "Suporte por WhatsApp"]'::JSONB,
    true, true, 2
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    price_cents = EXCLUDED.price_cents,
    billing_interval = EXCLUDED.billing_interval,
    features = EXCLUDED.features,
    is_highlighted = EXCLUDED.is_highlighted,
    active = true,
    display_order = EXCLUDED.display_order;

-- 14. ROW LEVEL SECURITY -----------------------------------------------------
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "plans_public_read" ON plans;
CREATE POLICY "plans_public_read" ON plans FOR SELECT USING (true);

ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clinics_owner_all" ON clinics;
CREATE POLICY "clinics_owner_all" ON clinics FOR ALL USING (owner_auth_id = auth.uid());
DROP POLICY IF EXISTS "clinics_member_read" ON clinics;
CREATE POLICY "clinics_member_read" ON clinics FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE users.clinic_id = clinics.id AND users.auth_id = auth.uid())
);
DROP POLICY IF EXISTS "clinics_insert_authenticated" ON clinics;
CREATE POLICY "clinics_insert_authenticated" ON clinics FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_read_own" ON users;
CREATE POLICY "users_read_own" ON users FOR SELECT USING (
    auth_id = auth.uid()
    OR clinic_id IN (SELECT id FROM clinics WHERE owner_auth_id = auth.uid())
);
DROP POLICY IF EXISTS "users_insert_auth" ON users;
CREATE POLICY "users_insert_auth" ON users FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "users_owner_manage" ON users;
CREATE POLICY "users_owner_manage" ON users FOR UPDATE USING (
    clinic_id IN (SELECT id FROM clinics WHERE owner_auth_id = auth.uid())
);
DROP POLICY IF EXISTS "users_owner_delete" ON users;
CREATE POLICY "users_owner_delete" ON users FOR DELETE USING (
    clinic_id IN (SELECT id FROM clinics WHERE owner_auth_id = auth.uid())
);

ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "patients_clinic_access" ON patients;
CREATE POLICY "patients_clinic_access" ON patients FOR ALL USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE auth_id = auth.uid())
);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "appointments_clinic_access" ON appointments;
CREATE POLICY "appointments_clinic_access" ON appointments FOR ALL USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE auth_id = auth.uid())
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "subscriptions_clinic_owner" ON subscriptions;
CREATE POLICY "subscriptions_clinic_owner" ON subscriptions FOR ALL USING (
    clinic_id IN (SELECT id FROM clinics WHERE owner_auth_id = auth.uid())
);
DROP POLICY IF EXISTS "subscriptions_insert_auth" ON subscriptions;
CREATE POLICY "subscriptions_insert_auth" ON subscriptions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

ALTER TABLE onboarding_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tokens_insert_auth" ON onboarding_tokens;
CREATE POLICY "tokens_insert_auth" ON onboarding_tokens FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "tokens_read_own" ON onboarding_tokens;
CREATE POLICY "tokens_read_own" ON onboarding_tokens FOR SELECT USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
);

ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "email_logs_clinic_owner" ON email_logs;
CREATE POLICY "email_logs_clinic_owner" ON email_logs FOR ALL USING (
    clinic_id IN (SELECT id FROM clinics WHERE owner_auth_id = auth.uid())
);
DROP POLICY IF EXISTS "email_logs_insert_auth" ON email_logs;
CREATE POLICY "email_logs_insert_auth" ON email_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "messages_clinic_access" ON messages;
CREATE POLICY "messages_clinic_access" ON messages FOR ALL USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE auth_id = auth.uid())
);

ALTER TABLE clinic_knowledge ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clinic_knowledge_owner_access" ON clinic_knowledge;
CREATE POLICY "clinic_knowledge_owner_access" ON clinic_knowledge FOR ALL USING (
    clinic_id IN (SELECT id FROM clinics WHERE owner_auth_id = auth.uid())
);

-- 15. CADASTRO DE CLÍNICA ----------------------------------------------------
-- SECURITY DEFINER: no momento do cadastro o usuário ainda não tem clínica, e
-- as políticas acima o barrariam. A função roda com privilégio do dono e é o
-- único caminho de escrita nessas três tabelas durante o cadastro.
CREATE OR REPLACE FUNCTION public.register_clinic(
    p_auth_id UUID,
    p_clinic_name TEXT,
    p_email TEXT,
    p_plan_slug TEXT,
    p_phone TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_plan_id UUID;
    v_clinic_id UUID;
    v_user_id UUID;
    v_slug TEXT;
    v_trial_ends TIMESTAMPTZ;
BEGIN
    SELECT id INTO v_plan_id FROM plans WHERE slug = p_plan_slug AND active = true;
    IF v_plan_id IS NULL THEN
        RAISE EXCEPTION 'Plano % nao encontrado', p_plan_slug;
    END IF;

    v_slug := lower(regexp_replace(coalesce(p_clinic_name, 'clinica'), '[^a-zA-Z0-9]+', '-', 'g'));
    IF v_slug IS NULL OR v_slug = '' THEN
        v_slug := 'clinica';
    END IF;
    v_slug := trim(both '-' from v_slug) || '-' || substr(gen_random_uuid()::text, 1, 8);

    INSERT INTO clinics (name, slug, email, phone, plan_id, owner_auth_id, active)
    VALUES (coalesce(p_clinic_name, 'Clínica sem nome'), v_slug, p_email, p_phone, v_plan_id, p_auth_id, true)
    RETURNING id INTO v_clinic_id;

    INSERT INTO users (clinic_id, auth_id, email, name, role, phone)
    VALUES (v_clinic_id, p_auth_id, p_email, coalesce(p_clinic_name, 'Dono'), 'owner', p_phone)
    RETURNING id INTO v_user_id;

    -- Teste de 10 dias sem cartão: a assinatura já nasce liberando o painel e
    -- expira sozinha. Antes nascia 'pending', o que trancava o acesso e fazia a
    -- landing prometer um teste que o produto não entregava.
    v_trial_ends := NOW() + INTERVAL '10 days';

    INSERT INTO subscriptions (clinic_id, plan_id, status, trial_ends_at)
    VALUES (v_clinic_id, v_plan_id, 'trialing', v_trial_ends);

    RETURN json_build_object(
        'clinic_id', v_clinic_id,
        'user_id', v_user_id,
        'plan_id', v_plan_id,
        'trial_ends_at', v_trial_ends
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_clinic TO anon;
GRANT EXECUTE ON FUNCTION public.register_clinic TO authenticated;
