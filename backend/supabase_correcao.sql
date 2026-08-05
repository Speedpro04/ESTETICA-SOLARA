-- ============================================
-- CORREÇÃO DO ERRO - Remover policy antiga
-- ============================================

-- Drop nas policy se existirem
DROP POLICY IF EXISTS "Usuários autenticados podem ver clínicas" ON clinics;
DROP POLICY IF EXISTS "Usuários podem ver seus próprios dados" ON users;

-- Drop na função antiga se existir
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- Recriar a função corretamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recriar triggers
DROP TRIGGER IF EXISTS update_clinics_updated_at ON clinics;
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
DROP TRIGGER IF EXISTS update_patients_updated_at ON patients;
DROP TRIGGER IF EXISTS update_appointments_updated_at ON appointments;

CREATE TRIGGER update_clinics_updated_at BEFORE UPDATE ON clinics FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_patients_updated_at BEFORE UPDATE ON patients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS simplificado (apenas habilita, sem policies complexas)
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Policy básica: usuários autenticados podem ver tudo (ajuste depois conforme necessidade)
CREATE POLICY "Acesso total para autenticados" ON clinics FOR ALL
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Acesso total para autenticados" ON users FOR ALL
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Acesso total para autenticados" ON patients FOR ALL
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Acesso total para autenticados" ON appointments FOR ALL
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Acesso total para autenticados" ON plans FOR ALL
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Acesso total para autenticados" ON subscriptions FOR ALL
USING (auth.uid() IS NOT NULL);
