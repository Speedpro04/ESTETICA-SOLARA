-- =============================================================================
-- 17 — CUSTO DE IA POR AGENTE, POR CLÍNICA E POR CONVERSA
-- =============================================================================
-- Chave de API separada por agente não resolveria isto: na OpenAI o limite de
-- requisições e o relatório de custo são por PROJETO, não por chave. Quatro
-- chaves no mesmo projeto dariam um número só — e quatro coisas para rotacionar.
--
-- Medindo aqui, sai melhor do que no painel da OpenAI:
--   - custo por CLÍNICA, que é o número que decide se o plano fixo fecha
--   - custo por CONVERSA, que mostra qual lead saiu caro
--   - custo por AGENTE, que mostra onde o prompt está gordo
--
-- O preço fica em tabela, não no código: a OpenAI muda tabela de preço e modelo
-- com frequência, e preço errado embutido em função vira relatório errado que
-- ninguém questiona.
-- =============================================================================

ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS tokens_entrada INTEGER,
    ADD COLUMN IF NOT EXISTS tokens_saida INTEGER,
    -- Qual modelo respondeu. Sem isso, trocar de modelo no meio do mês torna o
    -- histórico impossível de precificar.
    ADD COLUMN IF NOT EXISTS modelo TEXT,
    -- Qual VERSÃO do prompt escreveu esta mensagem.
    --
    -- É o que responde, dois meses depois: "ajustei o prompt do SDR e a conversão
    -- caiu — foi o ajuste?". Sem o carimbo, todas as mensagens parecem iguais e a
    -- comparação é impossível. A chave de API não serviria para isso: ela não
    -- viaja junto com a mensagem.
    ADD COLUMN IF NOT EXISTS prompt_versao TEXT;

CREATE INDEX IF NOT EXISTS idx_messages_custo
    ON public.messages (clinic_id, created_at)
    WHERE tokens_saida IS NOT NULL;


-- Preço por milhão de tokens, em centavos de real. Uma linha por modelo e por
-- data de vigência — assim reajuste não reescreve o passado.
CREATE TABLE IF NOT EXISTS public.llm_precos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    modelo TEXT NOT NULL,
    centavos_por_milhao_entrada NUMERIC(12, 2) NOT NULL,
    centavos_por_milhao_saida NUMERIC(12, 2) NOT NULL,
    vigente_desde DATE NOT NULL DEFAULT CURRENT_DATE,
    observacao TEXT,
    CONSTRAINT llm_precos_unico UNIQUE (modelo, vigente_desde)
);

-- Preço é dado da Axos, não da clínica: leitura para todo mundo logado, escrita
-- só pelo servidor.
ALTER TABLE public.llm_precos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS llm_precos_leitura ON public.llm_precos;
CREATE POLICY llm_precos_leitura ON public.llm_precos
    FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE public.llm_precos IS
    'Preencher com a tabela de preços vigente da OpenAI, convertida para centavos de real. '
    'Enquanto estiver vazia, os relatórios mostram tokens e devolvem custo nulo — '
    'de propósito: número inventado é pior que número ausente.';


-- Custo de uma mensagem, ao preço vigente NA DATA em que ela foi enviada.
CREATE OR REPLACE FUNCTION public.custo_mensagem_centavos(
    p_modelo TEXT,
    p_tokens_entrada INTEGER,
    p_tokens_saida INTEGER,
    p_quando TIMESTAMPTZ
)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT (COALESCE(p_tokens_entrada, 0) * pr.centavos_por_milhao_entrada
          + COALESCE(p_tokens_saida, 0)  * pr.centavos_por_milhao_saida) / 1000000.0
      FROM public.llm_precos pr
     WHERE pr.modelo = p_modelo
       AND pr.vigente_desde <= p_quando::date
     ORDER BY pr.vigente_desde DESC
     LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.custo_mensagem_centavos(TEXT, INTEGER, INTEGER, TIMESTAMPTZ)
    TO authenticated;


-- Consumo por agente. Devolve tokens sempre; custo só quando há preço cadastrado.
CREATE OR REPLACE FUNCTION public.custo_ia_por_agente(
    p_clinic_id UUID,
    p_dias INTEGER DEFAULT 30
)
RETURNS TABLE (
    agente TEXT,
    mensagens BIGINT,
    tokens_entrada BIGINT,
    tokens_saida BIGINT,
    custo_centavos NUMERIC
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT
        COALESCE(m.agent::text, 'sem_agente'),
        count(*),
        sum(COALESCE(m.tokens_entrada, 0)),
        sum(COALESCE(m.tokens_saida, 0)),
        round(sum(COALESCE(
            public.custo_mensagem_centavos(m.modelo, m.tokens_entrada, m.tokens_saida, m.created_at),
            0
        )), 2)
      FROM public.messages m
     WHERE m.clinic_id = p_clinic_id
       AND m.direction = 'outbound'
       AND m.tokens_saida IS NOT NULL
       AND m.created_at >= NOW() - make_interval(days => p_dias)
     GROUP BY 1
     ORDER BY 5 DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.custo_ia_por_agente(UUID, INTEGER) TO authenticated;


-- Custo total do atendimento por clínica: IA + WhatsApp.
--
-- É a conta que decide se o plano fixo fecha. Os dois custos precisam aparecer
-- juntos porque se compensam: um follow-up bem feito gasta template (caro) e
-- economiza conversa longa da IA; um SDR prolixo faz o inverso.
CREATE OR REPLACE FUNCTION public.custo_atendimento(
    p_clinic_id UUID,
    p_dias INTEGER DEFAULT 30
)
RETURNS TABLE (
    conversas BIGINT,
    mensagens_ia BIGINT,
    custo_ia_centavos NUMERIC,
    conversas_pagas_whatsapp BIGINT,
    custo_por_conversa_centavos NUMERIC
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    WITH periodo AS (
        SELECT m.*
          FROM public.messages m
         WHERE m.clinic_id = p_clinic_id
           AND m.created_at >= NOW() - make_interval(days => p_dias)
    ),
    ia AS (
        SELECT count(*) AS mensagens,
               round(sum(COALESCE(public.custo_mensagem_centavos(
                   modelo, tokens_entrada, tokens_saida, created_at), 0)), 2) AS custo
          FROM periodo
         WHERE direction = 'outbound' AND tokens_saida IS NOT NULL
    ),
    -- Só template abre conversa cobrada pela Meta; texto livre dentro da janela
    -- de 24h é gratuito.
    zap AS (
        SELECT count(*) AS pagas FROM periodo
         WHERE template_name IS NOT NULL
    ),
    conv AS (
        SELECT count(DISTINCT conversation_id) AS total FROM periodo
    )
    SELECT conv.total, ia.mensagens, ia.custo, zap.pagas,
           CASE WHEN conv.total > 0 THEN round(ia.custo / conv.total, 2) END
      FROM ia, zap, conv;
$$;

GRANT EXECUTE ON FUNCTION public.custo_atendimento(UUID, INTEGER) TO authenticated;


-- Comparação entre versões de prompt. É como se decide se um ajuste melhorou ou
-- piorou, em vez de decidir por impressão.
CREATE OR REPLACE VIEW public.vw_desempenho_prompt
WITH (security_invoker = true) AS
SELECT
    m.clinic_id,
    m.agent                                        AS agente,
    m.prompt_versao,
    count(DISTINCT m.conversation_id)              AS conversas,
    -- Quantas dessas conversas chegaram a marcar. É a única nota que importa.
    count(DISTINCT m.conversation_id) FILTER (
        WHERE c.stage IN ('agendado', 'encerrado')
    )                                              AS agendaram,
    round(avg(COALESCE(m.tokens_saida, 0)), 0)     AS tokens_saida_media,
    min(m.created_at)                              AS primeira,
    max(m.created_at)                              AS ultima
FROM public.messages m
JOIN public.conversations c ON c.id = m.conversation_id
WHERE m.direction = 'outbound'
  AND m.prompt_versao IS NOT NULL
GROUP BY m.clinic_id, m.agent, m.prompt_versao;

GRANT SELECT ON public.vw_desempenho_prompt TO authenticated;
