-- ============================================
-- SOLARA MEDICAL — PARTE 1: TABELAS + INDICES
-- Cole no SQL Editor e clique RUN
-- ============================================

DROP TABLE IF EXISTS email_logs CASCADE;
DROP TABLE IF EXISTS onboarding_tokens CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS appointments CASCADE;
DROP TABLE IF EXISTS patients CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS clinics CASCADE;
DROP TABLE IF EXISTS plans CASCADE;

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

CREATE TABLE clinics (
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
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    auth_id UUID UNIQUE,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('owner', 'admin', 'doctor', 'receptionist', 'staff')),
    specialty TEXT,
    crm TEXT,
    avatar_url TEXT,
    active BOOLEAN DEFAULT true,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    cpf TEXT,
    birth_date DATE,
    gender TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(clinic_id, cpf)
);

CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
    doctor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show')),
    type TEXT DEFAULT 'Consulta',
    room TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES plans(id),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'past_due', 'cancelled', 'trialing')),
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

CREATE TABLE email_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE SET NULL,
    to_email TEXT NOT NULL,
    from_email TEXT NOT NULL DEFAULT 'axoshub.solara@gmail.com',
    subject TEXT NOT NULL,
    template TEXT,
    status TEXT DEFAULT 'sent' CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'bounced')),
    metadata JSONB,
    sent_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_clinics_owner ON clinics(owner_auth_id);
CREATE INDEX idx_clinics_slug ON clinics(slug);
CREATE INDEX idx_users_clinic ON users(clinic_id);
CREATE INDEX idx_users_auth ON users(auth_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_patients_clinic ON patients(clinic_id);
CREATE INDEX idx_appointments_clinic ON appointments(clinic_id);
CREATE INDEX idx_appointments_doctor ON appointments(doctor_id);
CREATE INDEX idx_subscriptions_clinic ON subscriptions(clinic_id);
CREATE INDEX idx_subscriptions_stripe ON subscriptions(stripe_subscription_id);
CREATE INDEX idx_onboarding_token ON onboarding_tokens(token);
CREATE INDEX idx_email_logs_clinic ON email_logs(clinic_id);

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

INSERT INTO plans (name, slug, description, price_cents, min_specialists, max_specialists, features, is_highlighted, display_order) VALUES
('Basico', 'basico', 'Ideal para consultorios individuais e clinicas em inicio de operacao.', 19700, 1, 2, '["Ate 2 especialistas", "Gestao de Salas", "Prontuario Integrado", "Suporte por e-mail", "Relatorios basicos"]'::JSONB, false, 1),
('Crescimento', 'crescimento', 'Para clinicas em expansao que precisam de mais controle.', 39700, 3, 5, '["3 a 5 especialistas", "Tudo do Basico", "Agendamento online", "WhatsApp integrado", "Suporte prioritario"]'::JSONB, false, 2),
('Avancado', 'avancado', 'O mais escolhido. Maxima eficiencia para clinicas consolidadas.', 59700, 6, 9, '["6 a 9 especialistas", "Tudo do Crescimento", "Gestao financeira", "NPS automatico", "Automacoes de fluxo", "Suporte 24/7"]'::JSONB, true, 3),
('Enterprise', 'enterprise', 'Para grandes operacoes, hospitais e redes de clinicas.', 89700, 10, NULL, '["Especialistas ilimitados", "Tudo do Avancado", "API dedicada", "Gerente de conta", "SLA garantido", "Personalizacao completa", "Treinamento presencial"]'::JSONB, false, 4);
