-- =============================================================================
-- 13 — TEMPO DE ESPERA COMO MÉTRICA, E POSICIONAMENTO COMO CHAVE ÚNICA
-- =============================================================================
-- A proposta de valor é tempo: a paciente não espera, não repete, não volta
-- amanhã para saber um horário. Se é isso que se vende, é isso que precisa
-- aparecer no painel — senão a clínica paga sem ver o que está comprando, e na
-- hora de renovar compara com o preço, não com o resultado.
--
-- Duas mudanças aqui:
--
--   1. Métricas de tempo (espera, primeira resposta, tempo até agendar).
--   2. `posicionamento`: uma chave que troca o comportamento dos agentes de uma
--      vez. Antes, "clínica de alto padrão" era a clínica acertar seis campos
--      soltos na mesma direção — e bastava um errado para o SDR virar vendedor
--      de volume num consultório que não é.
-- =============================================================================

-- 1. POSICIONAMENTO ----------------------------------------------------------
ALTER TABLE public.clinic_briefing
    ADD COLUMN IF NOT EXISTS posicionamento TEXT NOT NULL DEFAULT 'alto_padrao'
        CHECK (posicionamento IN ('alto_padrao', 'volume')),
    -- Teto de perguntas antes de propor horário. Contraintuitivo de propósito:
    -- todo manual de vendas manda qualificar mais. Para quem vende TEMPO,
    -- qualificar mais é o produto piorando — cada pergunta é uma chance a mais
    -- de a pessoa sumir antes de ver um horário.
    ADD COLUMN IF NOT EXISTS max_perguntas_antes_de_agendar INTEGER NOT NULL DEFAULT 2;

ALTER TABLE public.clinic_briefing
    ADD CONSTRAINT briefing_max_perguntas CHECK (max_perguntas_antes_de_agendar BETWEEN 0 AND 6);

-- Novos padrões, alinhados ao posicionamento de tempo.
ALTER TABLE public.clinic_briefing
    ALTER COLUMN tentativas_antes_de_recuar SET DEFAULT 1,
    ALTER COLUMN handoff_prazo_assumir_minutos SET DEFAULT 5;

-- Alinha quem já existe e nunca foi configurado.
UPDATE public.clinic_briefing
   SET tentativas_antes_de_recuar = 1
 WHERE tentativas_antes_de_recuar = 2;
UPDATE public.clinic_briefing
   SET handoff_prazo_assumir_minutos = 5
 WHERE handoff_prazo_assumir_minutos = 15;


-- 2. TEMPO DE RESPOSTA -------------------------------------------------------
-- Para cada mensagem do lead, quanto tempo até a resposta seguinte.
--
-- LATERAL em vez de window function: precisamos da PRÓXIMA saída depois de cada
-- entrada, e o LIMIT 1 dentro do lateral resolve isso sem materializar a tabela
-- inteira de mensagens ordenada.
CREATE OR REPLACE VIEW public.vw_tempo_resposta
WITH (security_invoker = true) AS
SELECT
    entrada.clinic_id,
    entrada.conversation_id,
    entrada.created_at                                   AS recebida_em,
    saida.created_at                                     AS respondida_em,
    saida.agent,
    EXTRACT(EPOCH FROM (saida.created_at - entrada.created_at)) AS segundos,
    -- Primeira mensagem da conversa: é a que decide a impressão. Alguém que
    -- espera 4 horas pelo primeiro "oi" já decidiu procurar outra clínica.
    (entrada.created_at = (
        SELECT min(m.created_at) FROM public.messages m
         WHERE m.conversation_id = entrada.conversation_id AND m.direction = 'inbound'
    ))                                                   AS e_primeiro_contato
FROM public.messages entrada
CROSS JOIN LATERAL (
    SELECT m.created_at, m.agent
      FROM public.messages m
     WHERE m.conversation_id = entrada.conversation_id
       AND m.direction = 'outbound'
       AND m.created_at > entrada.created_at
     ORDER BY m.created_at
     LIMIT 1
) AS saida
WHERE entrada.direction = 'inbound';

GRANT SELECT ON public.vw_tempo_resposta TO authenticated;


-- Os números que o painel mostra. É a prova do que a clínica está comprando.
CREATE OR REPLACE FUNCTION public.metricas_tempo(
    p_clinic_id UUID,
    p_dias INTEGER DEFAULT 30
)
RETURNS TABLE (
    respostas BIGINT,
    mediana_segundos NUMERIC,
    primeiro_contato_mediana_segundos NUMERIC,
    respondidas_ate_1min NUMERIC,
    horas_ate_agendar NUMERIC,
    fora_do_horario NUMERIC
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    WITH t AS (
        SELECT * FROM public.vw_tempo_resposta
         WHERE clinic_id = p_clinic_id
           AND recebida_em >= NOW() - make_interval(days => p_dias)
    ),
    agendamentos AS (
        SELECT a.conversation_id,
               EXTRACT(EPOCH FROM (a.created_at - c.created_at)) / 3600 AS horas
          FROM public.appointments a
          JOIN public.conversations c ON c.id = a.conversation_id
         WHERE a.clinic_id = p_clinic_id
           AND a.created_at >= NOW() - make_interval(days => p_dias)
    )
    SELECT
        (SELECT count(*) FROM t),
        -- Mediana, não média: uma conversa esquecida por 10 horas distorce a
        -- média e some no relatório. A mediana conta o caso típico.
        (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY segundos)::numeric, 1) FROM t),
        (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY segundos)::numeric, 1)
           FROM t WHERE e_primeiro_contato),
        (SELECT CASE WHEN count(*) > 0
                     THEN round(100.0 * count(*) FILTER (WHERE segundos <= 60) / count(*), 1)
                     ELSE NULL END FROM t),
        (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY horas)::numeric, 1) FROM agendamentos),
        -- Fora do horário comercial é onde a IA ganha da recepção humana. Se
        -- este número for alto, a clínica está sendo atendida quando estaria
        -- perdendo a paciente.
        (SELECT CASE WHEN count(*) > 0
                     THEN round(100.0 * count(*) FILTER (
                            WHERE EXTRACT(HOUR FROM recebida_em AT TIME ZONE 'America/Sao_Paulo') NOT BETWEEN 8 AND 18
                               OR EXTRACT(ISODOW FROM recebida_em AT TIME ZONE 'America/Sao_Paulo') > 5
                          ) / count(*), 1)
                     ELSE NULL END FROM t);
$$;

GRANT EXECUTE ON FUNCTION public.metricas_tempo(UUID, INTEGER) TO authenticated;
