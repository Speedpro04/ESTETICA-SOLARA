-- ============================================
-- AXOS HUB - SQL COMPLETO (TUDO EM 1)
-- Copie TUDO e cole no SQL Editor do Supabase
-- ============================================

-- 1. Tabela de Planos (primeiro, pois outras tabelas referenciam)
CREATE TABLE IF NOT EXISTS plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    price_cents INTEGER NOT NULL,
    currency TEXT DEFAULT 'BRL',
    interval TEXT DEFAULT 'month',
    max_professionals INTEGER,
    features JSONB,
    stripe_price_id TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabela de Clínicas
CREATE TABLE IF NOT EXISTS clinics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    email TEXT,
    phone TEXT,
    plan_id UUID REFERENCES plans(id),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabela de Usuários
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
    auth_id UUID REFERENCES auth.users(id),
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'staff',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Tabela de Pacientes
CREATE TABLE IF NOT EXISTS patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    cpf TEXT,
    birth_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Tabela de Agendamentos
CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
    patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
    doctor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'pending',
    type TEXT DEFAULT 'Consulta',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Assinaturas
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES plans(id),
    status TEXT DEFAULT 'inactive',
    stripe_subscription_id TEXT,
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Índices
CREATE INDEX IF NOT EXISTS idx_users_clinic ON users(clinic_id);
CREATE INDEX IF NOT EXISTS idx_patients_clinic ON patients(clinic_id);
CREATE INDEX IF NOT EXISTS idx_appointments_clinic ON appointments(clinic_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_clinic ON subscriptions(clinic_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan ON subscriptions(plan_id);

-- 8. Trigger updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_clinics_updated_at BEFORE UPDATE ON clinics FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_patients_updated_at BEFORE UPDATE ON patients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 9. Planos com valores (Starter 197, Professional 397, Enterprise 697)
INSERT INTO plans (name, description, price_cents, max_professionals, features) VALUES
('Starter', 'Para clínicas em crescimento', 19700, 2, '["Até 2 profissionais", "Prontuário eletrônico", "Agendamento online", "Relatórios básicos"]'::JSONB),
('Professional', 'O mais escolhido', 39700, 5, '["Até 5 profissionais", "Tudo do Starter", "Gestão financeira", "Telemedicina", "Suporte prioritário"]'::JSONB),
('Enterprise', 'Grandes operações', 69700, NULL, '["Profissionais ilimitados", "Personalização completa", "API", "Gerente de conta", "SLA"]'::JSONB);

-- 10. RLS (Row Level Security)
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Policies simplificadas
CREATE POLICY "Acesso autenticados" ON clinics FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Acesso autenticados" ON users FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Acesso autenticados" ON patients FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Acesso autenticados" ON appointments FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Acesso autenticados" ON plans FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Acesso autenticados" ON subscriptions FOR ALL USING (auth.uid() IS NOT NULL);
