-- ============================================
-- SOLARA MEDICAL — SQL COMPLETO CORRIGIDO
-- Projeto: mvqkelauwscxdwnzevtz
-- Cole TUDO no SQL Editor do Supabase
-- ============================================

-- =============================================
-- 0. Limpar tabelas antigas (se existirem)
-- =============================================
DROP TABLE IF EXISTS email_logs CASCADE;
DROP TABLE IF EXISTS onboarding_tokens CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS appointments CASCADE;
DROP TABLE IF EXISTS patients CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS clinics CASCADE;
DROP TABLE IF EXISTS plans CASCADE;

-- =============================================
-- 1. PLANOS — Alinhados com a Landing Page
-- =============================================
CREATE TABLE plans (
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

-- =============================================
-- 2. CLÍNICAS
-- =============================================
CREATE TABLE clinics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    document TEXT,  -- CNPJ
    address JSONB,  -- {street, city, state, zip}
    plan_id UUID REFERENCES plans(id),
    owner_auth_id UUID,  -- auth.users(id) do dono
    active BOOLEAN DEFAULT true,
    onboarding_completed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 3. USUÁRIOS (staff da clínica)
-- =============================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    auth_id UUID UNIQUE,  -- referência ao auth.users
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin'
        CHECK (role IN ('owner', 'admin', 'doctor', 'receptionist', 'staff')),
    specialty TEXT,  -- para médicos
    crm TEXT,        -- registro profissional
    phone TEXT,      -- WhatsApp/telefone de emergência
    avatar_url TEXT,
    active BOOLEAN DEFAULT true,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 4. PACIENTES
-- =============================================
CREATE TABLE patients (
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

-- =============================================
-- 5. AGENDAMENTOS
-- =============================================
CREATE TABLE appointments (
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

-- =============================================
-- 6. ASSINATURAS (Stripe)
-- =============================================
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES plans(id),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'active', 'past_due', 'cancelled', 'trialing')),
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

-- =============================================
-- 7. TOKENS DE ONBOARDING (senha provisória)
-- =============================================
CREATE TABLE onboarding_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    temp_password TEXT NOT NULL,
    used BOOLEAN DEFAULT false,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 8. LOG DE E-MAILS ENVIADOS
-- =============================================
CREATE TABLE email_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE SET NULL,
    to_email TEXT NOT NULL,
    from_email TEXT NOT NULL DEFAULT 'axoshub.solara@gmail.com',
    subject TEXT NOT NULL,
    template TEXT,  -- 'welcome', 'payment_confirmed', 'password_reset'
    status TEXT DEFAULT 'sent'
        CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'bounced')),
    metadata JSONB,
    sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 9. ÍNDICES DE PERFORMANCE
-- =============================================
CREATE INDEX idx_clinics_owner ON clinics(owner_auth_id);
CREATE INDEX idx_clinics_slug ON clinics(slug);
CREATE INDEX idx_users_clinic ON users(clinic_id);
CREATE INDEX idx_users_auth ON users(auth_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_patients_clinic ON patients(clinic_id);
CREATE INDEX idx_patients_cpf ON patients(clinic_id, cpf);
CREATE INDEX idx_appointments_clinic ON appointments(clinic_id);
CREATE INDEX idx_appointments_doctor ON appointments(doctor_id);
CREATE INDEX idx_appointments_time ON appointments(clinic_id, start_time);
CREATE INDEX idx_subscriptions_clinic ON subscriptions(clinic_id);
CREATE INDEX idx_subscriptions_stripe ON subscriptions(stripe_subscription_id);
CREATE INDEX idx_onboarding_token ON onboarding_tokens(token);
CREATE INDEX idx_onboarding_email ON onboarding_tokens(email);
CREATE INDEX idx_email_logs_clinic ON email_logs(clinic_id);

-- =============================================
-- 10. TRIGGER: updated_at AUTOMÁTICO
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_clinics_updated_at BEFORE UPDATE ON clinics FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_patients_updated_at BEFORE UPDATE ON patients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_appointments_updated_at BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- 11. SEED: 4 PLANOS (alinhados com a LP)
-- =============================================
INSERT INTO plans (name, slug, description, price_cents, min_specialists, max_specialists, features, is_highlighted, display_order, stripe_price_id) VALUES
(
    'Básico',
    'basico',
    'Ideal para consultórios individuais e clínicas em início de operação.',
    19700,
    1,
    2,
    '["Até 2 especialistas", "Gestão de Salas", "Prontuário Integrado", "Suporte por e-mail", "Relatórios básicos"]'::JSONB,
    false,
    1,
    NULL
),
(
    'Crescimento',
    'crescimento',
    'Para clínicas em expansão que precisam de mais controle.',
    39700,
    3,
    5,
    '["3 a 5 especialistas", "Tudo do Básico", "Agendamento online", "WhatsApp integrado", "Suporte prioritário"]'::JSONB,
    false,
    2,
    NULL
),
(
    'Avançado',
    'avancado',
    'O mais escolhido. Máxima eficiência para clínicas consolidadas.',
    59700,
    6,
    9,
    '["6 a 9 especialistas", "Tudo do Crescimento", "Gestão financeira", "NPS automático", "Automações de fluxo", "Suporte 24/7"]'::JSONB,
    true,
    3,
    NULL
),
(
    'Enterprise',
    'enterprise',
    'Para grandes operações, hospitais e redes de clínicas.',
    89700,
    10,
    NULL,
    '["Especialistas ilimitados", "Tudo do Avançado", "API dedicada", "Gerente de conta", "SLA garantido", "Personalização completa", "Treinamento presencial"]'::JSONB,
    false,
    4,
    NULL
);

-- =============================================
-- 12. ROW LEVEL SECURITY (RLS) — PRODUÇÃO
-- =============================================

-- PLANS: Leitura pública (LP precisa exibir preços)
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans_public_read" ON plans FOR SELECT USING (true);
CREATE POLICY "plans_admin_write" ON plans FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE users.auth_id = auth.uid() AND users.role = 'owner')
);

-- CLINICS: Isolamento por dono
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clinics_owner_all" ON clinics FOR ALL USING (owner_auth_id = auth.uid());
CREATE POLICY "clinics_member_read" ON clinics FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE users.clinic_id = clinics.id AND users.auth_id = auth.uid())
);
-- Service role bypass para cadastro (quando o usuário ainda não tem clínica)
CREATE POLICY "clinics_insert_authenticated" ON clinics FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- USERS: Isolamento por clínica (sem recursão)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own" ON users FOR SELECT USING (
    auth_id = auth.uid()
    OR clinic_id IN (
        SELECT id FROM clinics WHERE owner_auth_id = auth.uid()
    )
);
CREATE POLICY "users_insert_auth" ON users FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
);
CREATE POLICY "users_owner_manage" ON users FOR UPDATE USING (
    clinic_id IN (
        SELECT id FROM clinics WHERE owner_auth_id = auth.uid()
    )
);
CREATE POLICY "users_owner_delete" ON users FOR DELETE USING (
    clinic_id IN (
        SELECT id FROM clinics WHERE owner_auth_id = auth.uid()
    )
);

-- PATIENTS: Isolamento por clínica
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "patients_clinic_access" ON patients FOR ALL USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE auth_id = auth.uid())
);

-- APPOINTMENTS: Isolamento por clínica
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "appointments_clinic_access" ON appointments FOR ALL USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE auth_id = auth.uid())
);

-- SUBSCRIPTIONS: Acesso por dono da clínica
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscriptions_clinic_owner" ON subscriptions FOR ALL USING (
    clinic_id IN (SELECT id FROM clinics WHERE owner_auth_id = auth.uid())
);
CREATE POLICY "subscriptions_insert_auth" ON subscriptions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ONBOARDING_TOKENS: Apenas leitura por e-mail correspondente
ALTER TABLE onboarding_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tokens_insert_auth" ON onboarding_tokens FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "tokens_read_own" ON onboarding_tokens FOR SELECT USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
);

-- EMAIL_LOGS: Apenas dono da clínica
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_logs_clinic_owner" ON email_logs FOR ALL USING (
    clinic_id IN (SELECT id FROM clinics WHERE owner_auth_id = auth.uid())
);
CREATE POLICY "email_logs_insert_auth" ON email_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- =============================================
-- 13. FUNÇÃO: Gerar slug a partir do nome
-- =============================================
CREATE OR REPLACE FUNCTION generate_clinic_slug(clinic_name TEXT)
RETURNS TEXT AS $$
DECLARE
    base_slug TEXT;
    final_slug TEXT;
    counter INTEGER := 0;
BEGIN
    base_slug := lower(regexp_replace(
        regexp_replace(clinic_name, '[^a-zA-Z0-9\s]', '', 'g'),
        '\s+', '-', 'g'
    ));
    final_slug := base_slug;
    WHILE EXISTS (SELECT 1 FROM clinics WHERE slug = final_slug) LOOP
        counter := counter + 1;
        final_slug := base_slug || '-' || counter;
    END LOOP;
    RETURN final_slug;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FIM DO SCHEMA
-- ============================================
