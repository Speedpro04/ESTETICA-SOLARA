-- Tabela de Pacientes
CREATE TABLE IF NOT EXISTS patients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  cpf TEXT UNIQUE,
  phone TEXT,
  age INTEGER,
  insurance TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabela de Especialistas (Médicos)
CREATE TABLE IF NOT EXISTS specialists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  specialty TEXT NOT NULL,
  crm TEXT,
  email TEXT,
  phone TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabela de Agendamentos
CREATE TABLE IF NOT EXISTS appointments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id UUID REFERENCES specialists(id) ON DELETE CASCADE,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  status TEXT DEFAULT 'aguardando', -- aguardando, em_atendimento, confirmado, finalizado
  payment_status TEXT DEFAULT 'pendente',
  payment_value DECIMAL(10,2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Políticas de Segurança (RLS) para permitir acesso inicial (ajustar conforme necessidade)
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso Total para Usuários Autenticados" ON patients FOR ALL USING (true);

ALTER TABLE specialists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso Total para Usuários Autenticados" ON specialists FOR ALL USING (true);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso Total para Usuários Autenticados" ON appointments FOR ALL USING (true);
