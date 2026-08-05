-- Campos de configuracao do WhatsApp por clinica
ALTER TABLE clinics
ADD COLUMN IF NOT EXISTS whatsapp_api_url TEXT,
ADD COLUMN IF NOT EXISTS whatsapp_api_key TEXT,
ADD COLUMN IF NOT EXISTS whatsapp_instance_id TEXT;

CREATE INDEX IF NOT EXISTS idx_clinics_whatsapp_instance_id
ON clinics (whatsapp_instance_id);

-- Caixa de mensagens para WhatsApp / recepcao
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

CREATE INDEX IF NOT EXISTS idx_messages_clinic_id
ON messages (clinic_id);

CREATE INDEX IF NOT EXISTS idx_messages_patient_id
ON messages (patient_id);

CREATE INDEX IF NOT EXISTS idx_messages_created_at
ON messages (created_at DESC);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'trg_messages_updated_at'
    ) THEN
        CREATE TRIGGER trg_messages_updated_at
        BEFORE UPDATE ON messages
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
