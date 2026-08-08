-- =============================================================================
-- 15 — TEMPERATURA DO LEAD
-- =============================================================================
-- Três modos de trabalho para o SDR, porque tratar igual quem só perguntou o
-- preço e quem já quer marcar é errar com os dois: o primeiro foge da pressão, o
-- segundo se irrita com a entrevista.
--
--   frio    Curioso. Quer informação, ainda não comprou a ideia.
--   morno   Interessado com dúvida ou objeção específica.
--   quente  Quer marcar. Toda pergunta aqui é atrito puro.
--
-- A temperatura tem DUAS fontes, e a ordem importa:
--
--   1. O que o SDR classificou (`temperatura`), pela leitura da conversa.
--   2. O que os sinais dizem (`temperatura_inferida`), calculado aqui.
--
-- A inferência existe porque a classificação do modelo pode não vir — primeira
-- mensagem, falha na chamada de ferramenta, conversa importada. Sem ela, o
-- painel mostraria "—" justamente nos leads novos, que são os que a equipe
-- precisa ver. E ela é determinística: dá para auditar por que um lead está
-- marcado como quente.
-- =============================================================================

ALTER TABLE public.conversations
    ADD COLUMN IF NOT EXISTS temperatura TEXT
        CHECK (temperatura IN ('frio', 'morno', 'quente')),
    ADD COLUMN IF NOT EXISTS temperatura_em TIMESTAMPTZ,
    -- Por que o SDR classificou assim. É o que a recepção lê antes de assumir a
    -- conversa, e o que permite discordar da máquina com argumento.
    ADD COLUMN IF NOT EXISTS temperatura_motivo TEXT;

CREATE INDEX IF NOT EXISTS idx_conversations_temperatura
    ON public.conversations (clinic_id, temperatura)
    WHERE temperatura IS NOT NULL;


-- Inferência por sinais. IMMUTABLE não dá (depende de estado), mas é pura em
-- relação aos argumentos: mesmas entradas, mesma saída, sempre auditável.
CREATE OR REPLACE FUNCTION public.temperatura_inferida(
    p_stage public.conversation_stage,
    p_urgencia TEXT,
    p_procedure_id UUID,
    p_procedimento_texto TEXT,
    p_sinal_orcamento TEXT,
    p_mensagens INTEGER
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT CASE
        -- Já está com o Agendador ou marcou: não há o que discutir.
        WHEN p_stage IN ('agendando', 'agendado') THEN 'quente'
        -- Disse que quer agora. É o sinal mais forte que existe em estética:
        -- quem tem pressa já decidiu, só falta o horário.
        WHEN p_urgencia = 'imediata' THEN 'quente'
        WHEN p_stage = 'qualificado' THEN 'quente'
        -- Falou de dinheiro por conta própria: passou de curiosidade para
        -- avaliação de compra.
        WHEN p_sinal_orcamento IS NOT NULL THEN 'morno'
        -- Nomeou o procedimento E sustentou a conversa. Nomear sozinho não
        -- basta: "quanto custa botox?" e sumir é curiosidade, não interesse.
        WHEN (p_procedure_id IS NOT NULL OR p_procedimento_texto IS NOT NULL)
             AND COALESCE(p_mensagens, 0) >= 4 THEN 'morno'
        WHEN p_urgencia = 'ate_30_dias' THEN 'morno'
        ELSE 'frio'
    END;
$$;

GRANT EXECUTE ON FUNCTION public.temperatura_inferida(
    public.conversation_stage, TEXT, UUID, TEXT, TEXT, INTEGER
) TO authenticated;


-- vw_leads ganha a temperatura efetiva e a origem dela.
--
-- DROP antes de CREATE: `CREATE OR REPLACE VIEW` só aceita acrescentar coluna no
-- FIM da lista. Inserir `temperatura` no meio faz o Postgres entender que a
-- terceira coluna mudou de nome, e ele recusa.
DROP VIEW IF EXISTS public.vw_leads;

CREATE VIEW public.vw_leads
WITH (security_invoker = true) AS
SELECT
    c.id                              AS conversation_id,
    c.clinic_id,
    c.wa_contact_id,
    c.contact_name,
    c.stage,
    public.agent_for_stage(c.stage)   AS agente_atual,

    -- O que o SDR leu vence o que os sinais sugerem: ele viu a conversa inteira.
    COALESCE(
        c.temperatura,
        public.temperatura_inferida(c.stage, c.urgencia, c.procedure_id,
                                    c.procedimento_texto, c.sinal_orcamento, c.message_count)
    )                                 AS temperatura,
    (c.temperatura IS NOT NULL)       AS temperatura_avaliada,
    c.temperatura_motivo,

    c.origem,
    c.procedure_id,
    COALESCE(p.nome, c.procedimento_texto) AS interesse,
    p.categoria                       AS categoria_procedimento,
    c.sinal_orcamento,
    c.urgencia,
    c.motivo_perda,
    c.qualificado_em,
    c.last_inbound_at,
    c.message_count,
    c.follow_up_count,
    c.patient_id IS NOT NULL          AS virou_cliente,
    (c.last_inbound_at > NOW() - INTERVAL '24 hours') AS janela_aberta,
    c.created_at
FROM public.conversations c
LEFT JOIN public.procedures p ON p.id = c.procedure_id;

GRANT SELECT ON public.vw_leads TO authenticated;


-- Quadro de temperatura para o painel: quantos em cada, e quantos estão
-- esfriando (quente parado é o que mais dói perder).
CREATE OR REPLACE FUNCTION public.painel_temperatura(
    p_clinic_id UUID,
    p_dias INTEGER DEFAULT 30
)
RETURNS TABLE (
    temperatura TEXT,
    total BIGINT,
    parados_24h BIGINT,
    agendaram BIGINT
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    WITH base AS (
        SELECT l.*
          FROM public.vw_leads l
         WHERE l.clinic_id = p_clinic_id
           AND l.created_at >= NOW() - make_interval(days => p_dias)
           AND l.stage NOT IN ('perdido', 'encerrado')
    ),
    faixas(temperatura, ordem) AS (
        VALUES ('quente', 1), ('morno', 2), ('frio', 3)
    )
    SELECT f.temperatura,
           count(b.conversation_id),
           count(b.conversation_id) FILTER (
               WHERE b.last_inbound_at < NOW() - INTERVAL '24 hours'
           ),
           count(b.conversation_id) FILTER (WHERE b.stage = 'agendado')
      FROM faixas f
      LEFT JOIN base b ON b.temperatura = f.temperatura
     GROUP BY f.temperatura, f.ordem
     ORDER BY f.ordem;
$$;

GRANT EXECUTE ON FUNCTION public.painel_temperatura(UUID, INTEGER) TO authenticated;


-- =============================================================================
-- BRIEFING: as perguntas de implicação (o "I" do SPIN)
-- =============================================================================
-- Situação e Problema o SDR consegue improvisar sem risco. IMPLICAÇÃO, não —
-- é onde se toca no que a pessoa sente, e improvisar ali em estética passa de
-- consultivo para invasivo num passo.
--
-- Por isso a pergunta de implicação é AUTORIZADA pela clínica, como as
-- objeções. A clínica escreve; a Solara escolhe a hora.
ALTER TABLE public.clinic_briefing
    -- [{"gatilho": "quer disfarçar cansaço", "pergunta": "isso te incomoda mais em que situações?"}]
    ADD COLUMN IF NOT EXISTS perguntas_implicacao JSONB NOT NULL DEFAULT '[]'::JSONB,
    -- O que a pessoa ganha de volta ao resolver — o "N" do SPIN, dito pela
    -- clínica em vez de prometido pela IA.
    ADD COLUMN IF NOT EXISTS ganhos_declarados TEXT;
