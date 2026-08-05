-- =============================================================================
-- BASE DE CONHECIMENTO DA SOLARA (por clínica)
-- =============================================================================
-- Fase 1 (agora): cada clínica cadastra o que a Solara precisa saber para atender
-- com precisão — serviços, preços, horários, convênios, FAQ e políticas. O backend
-- injeta essas entradas no contexto do modelo (gpt-5), sem alucinação.
--
-- Fase 2 (RAG, futuro): quando o conhecimento de uma clínica crescer muito, basta
-- habilitar a extensão pgvector, adicionar a coluna `embedding` (ver no fim) e
-- trocar, no backend, "carregar tudo" por "buscar top-k por similaridade". A
-- modelagem abaixo já foi pensada para esse plugue (entradas curtas e tipadas).
-- =============================================================================

CREATE TABLE IF NOT EXISTS clinic_knowledge (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    -- Tipo da entrada. Define como a Solara apresenta a informação.
    kind TEXT NOT NULL DEFAULT 'general'
        CHECK (kind IN ('service', 'price', 'hours', 'insurance', 'faq', 'policy', 'general')),
    title TEXT,                 -- ex.: nome do serviço, pergunta da FAQ, "Horário de funcionamento"
    content TEXT NOT NULL,      -- a informação em si (resposta, descrição, valor, etc.)
    priority INTEGER NOT NULL DEFAULT 0,   -- entradas mais altas aparecem primeiro no contexto
    active BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB DEFAULT '{}'::JSONB,    -- espaço livre (ex.: preço numérico, duração, tags)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clinic_knowledge_clinic_id
    ON clinic_knowledge (clinic_id);

CREATE INDEX IF NOT EXISTS idx_clinic_knowledge_active
    ON clinic_knowledge (clinic_id, active);

-- updated_at automático (reutiliza a função padrão do projeto, se existir).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column')
       AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_clinic_knowledge_updated_at')
    THEN
        CREATE TRIGGER trg_clinic_knowledge_updated_at
        BEFORE UPDATE ON clinic_knowledge
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- RLS: o backend usa service role (ignora RLS). A política abaixo permite que o
-- painel da clínica (autenticado) gerencie apenas o conhecimento da própria clínica.
ALTER TABLE clinic_knowledge ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'clinic_knowledge' AND policyname = 'clinic_knowledge_owner_access'
    ) THEN
        CREATE POLICY "clinic_knowledge_owner_access" ON clinic_knowledge
            FOR ALL
            USING (
                clinic_id IN (
                    SELECT id FROM clinics WHERE owner_auth_id = auth.uid()
                )
            );
    END IF;
END $$;

-- =============================================================================
-- FASE 2 — RAG (rodar apenas quando for ativar busca semântica):
--
--   CREATE EXTENSION IF NOT EXISTS vector;
--   ALTER TABLE clinic_knowledge ADD COLUMN IF NOT EXISTS embedding vector(1536);
--   CREATE INDEX IF NOT EXISTS idx_clinic_knowledge_embedding
--       ON clinic_knowledge USING ivfflat (embedding vector_cosine_ops);
--
-- Depois, no backend, gerar embedding de cada `content` e, na consulta, ordenar
-- por distância de cosseno ao embedding da mensagem do paciente (top-k).
-- =============================================================================
