-- ============================================
-- AXOS HUB - SQL para Supabase
-- Copie e cole este SQL no SQL Editor do Supabase
-- ============================================

-- 1. Tabela de Clínicas (Tenants)
CREATE TABLE IF NOT EXISTS clinics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    email TEXT,
    phone TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabela de Usuários (Staff das clínicas)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'staff', -- admin, doctor, staff
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabela de Pacientes
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

-- 4. Tabela de Agendamentos
CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
    patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
    doctor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, confirmed, completed, cancelled
    type TEXT DEFAULT 'Consulta',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Índices para performance
CREATE INDEX idx_users_clinic ON users(clinic_id);
CREATE INDEX idx_patients_clinic ON patients(clinic_id);
CREATE INDEX idx_appointments_clinic ON appointments(clinic_id);
CREATE INDEX idx_appointments_patient ON appointments(patient_id);
CREATE INDEX idx_appointments_start ON appointments(start_time);

-- 6. Row Level Security (RLS)
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- 7. Policies de acesso (básico)
CREATE POLICY "Usuários autenticados podem ver clínicas"
ON clinics FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Usuários podem ver seus próprios dados"
ON users FOR SELECT
USING (auth.uid() = id OR id IN (
    SELECT user_id FROM users WHERE clinic_id IN (
        SELECT id FROM clinics WHERE id IN (
            SELECT clinic_id FROM users WHERE id = auth.uid()
        )
    )
));

-- 8. Trigger para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_clinics_updated_at BEFORE UPDATE ON clinics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patients_updated_at BEFORE UPDATE ON patients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON appointments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 9. Dados iniciais (opcional - remova em produção)
-- INSERT INTO clinics (name, slug, email) VALUES ('Clínica Demo', 'demo', 'demo@axos.com');

-- 10. Views úteis
CREATE VIEW clinic_stats AS
SELECT 
    c.id,
    c.name,
    COUNT(DISTINCT p.id) as patient_count,
    COUNT(DISTINCT a.id) as appointment_count
FROM clinics c
LEFT JOIN patients p ON p.clinic_id = c.id
LEFT JOIN appointments a ON a.clinic_id = c.id
GROUP BY c.id, c.name;

-- ============================================
-- CONFIGURAÇÃO DE E-MAILS (Supabase Auth)
-- ============================================

-- Tabela de logs de e-mail
CREATE TABLE IF NOT EXISTS email_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    to_email TEXT NOT NULL,
    template TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Templates de e-mail salvos
CREATE TABLE IF NOT EXISTS email_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    active BOOLEAN DEFAULT true,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Templates padrão
INSERT INTO email_templates (name, subject, body) VALUES
('welcome', 'Bem-vindo ao Axos Hub!', 'Olá! Bem-vindo ao Axos Hub...'),
('checkout_confirm', 'Pagamento Confirmado', 'Seu pagamento foi confirmado...'),
('first_access', 'Seu Acesso ao Axos Hub', 'Aqui estão suas credenciais...')
ON CONFLICT (name) DO NOTHING;

