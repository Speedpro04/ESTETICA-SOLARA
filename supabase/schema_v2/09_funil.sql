-- =============================================================================
-- 09 — FUNIL DE COORTE
-- =============================================================================
-- A vw_funil do arquivo 04 conta ocupação ATUAL por estágio. Serve para saber
-- quantas conversas estão em cada lugar agora, e é o que a fila operacional
-- precisa — mas como funil de vendas ela mente.
--
-- Um lead que percorreu todo o caminho está hoje em 'agendado'. Ele não aparece
-- mais em 'novo' nem em 'qualificando'. Resultado: quanto MELHOR a clínica
-- converte, mais vazio o topo do funil parece. O gráfico fica de cabeça para
-- baixo justamente para quem está indo bem.
--
-- Funil de verdade é coorte: dos leads que ENTRARAM no período, quantos
-- chegaram a cada etapa — tenham ou não seguido adiante depois. Isso exige o
-- histórico, e é para isso que conversation_transitions existe.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.funil_periodo(
    p_clinic_id UUID,
    p_dias INTEGER DEFAULT 30
)
RETURNS TABLE (
    estagio TEXT,
    ordem INTEGER,
    alcancaram BIGINT,
    estao_aqui BIGINT,
    taxa_da_etapa_anterior NUMERIC
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    WITH coorte AS (
        SELECT c.id, c.stage
          FROM public.conversations c
         WHERE c.clinic_id = p_clinic_id
           AND c.created_at >= NOW() - make_interval(days => p_dias)
    ),
    etapas(estagio, ordem) AS (
        VALUES ('novo', 1), ('qualificando', 2), ('qualificado', 3),
               ('agendando', 4), ('agendado', 5), ('encerrado', 6)
    ),
    -- "Alcançou a etapa" = está nela agora OU passou por ela em algum momento.
    -- Sem a segunda metade, quem avançou desaparece das etapas anteriores e o
    -- funil vira uma foto do presente em vez de um histórico do caminho.
    --
    -- 'novo' é caso à parte: é o DEFAULT da coluna, não um destino de transição.
    -- Ninguém nunca aparece em conversation_transitions com to_stage='novo', então
    -- contar por lá daria só quem ainda não saiu de lá — e o topo do funil ficaria
    -- MENOR que a etapa seguinte, produzindo taxas acima de 100%.
    -- Todo lead da coorte passou por 'novo' ao ser criado. Ponto.
    alcance AS (
        SELECT e.estagio, e.ordem,
               CASE
                 WHEN e.ordem = 1 THEN (SELECT count(*) FROM coorte)
                 ELSE count(DISTINCT co.id)
               END AS alcancaram
          FROM etapas e
          LEFT JOIN coorte co
            ON co.stage::text = e.estagio
            OR EXISTS (
                 SELECT 1 FROM public.conversation_transitions t
                  WHERE t.conversation_id = co.id
                    AND t.to_stage::text = e.estagio
               )
         GROUP BY e.estagio, e.ordem
    ),
    atuais AS (
        SELECT e.estagio, count(co.id) AS estao_aqui
          FROM etapas e
          LEFT JOIN coorte co ON co.stage::text = e.estagio
         GROUP BY e.estagio
    )
    SELECT a.estagio,
           a.ordem,
           a.alcancaram,
           at.estao_aqui,
           -- Conversão em relação à etapa imediatamente anterior. É onde o
           -- vazamento aparece: 80% qualificam e 20% agendam mostra que o
           -- problema está no agendamento, não na captação.
           CASE
             WHEN lag(a.alcancaram) OVER (ORDER BY a.ordem) > 0
             THEN round(100.0 * a.alcancaram / lag(a.alcancaram) OVER (ORDER BY a.ordem), 1)
             ELSE NULL
           END AS taxa_da_etapa_anterior
      FROM alcance a
      JOIN atuais at ON at.estagio = a.estagio
     ORDER BY a.ordem;
$$;

GRANT EXECUTE ON FUNCTION public.funil_periodo(UUID, INTEGER) TO authenticated;


-- Números que ficam FORA da linha do funil. Perdido e handoff não são etapas do
-- caminho: são desvios, e somá-los na sequência distorceria a leitura.
CREATE OR REPLACE FUNCTION public.painel_resumo(
    p_clinic_id UUID,
    p_dias INTEGER DEFAULT 30
)
RETURNS TABLE (
    leads_no_periodo BIGINT,
    qualificados BIGINT,
    agendados BIGINT,
    perdidos BIGINT,
    em_handoff BIGINT,
    handoff_atrasados BIGINT,
    sem_resposta_24h BIGINT,
    taxa_agendamento NUMERIC
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    WITH coorte AS (
        SELECT c.*
          FROM public.conversations c
         WHERE c.clinic_id = p_clinic_id
           AND c.created_at >= NOW() - make_interval(days => p_dias)
    ),
    b AS (
        SELECT COALESCE(max(handoff_prazo_assumir_minutos), 15) AS prazo
          FROM public.clinic_briefing WHERE clinic_id = p_clinic_id
    )
    SELECT
        count(*),
        count(*) FILTER (WHERE qualificado_em IS NOT NULL),
        count(*) FILTER (WHERE stage IN ('agendado', 'encerrado')),
        count(*) FILTER (WHERE stage = 'perdido'),
        -- Handoff e leads parados contam a fila INTEIRA, não só a do período:
        -- quem está esperando um humano há três dias não deixa de estar
        -- esperando porque o filtro é de 30 dias.
        (SELECT count(*) FROM public.conversations
          WHERE clinic_id = p_clinic_id AND stage = 'aguardando_humano'),
        (SELECT count(*) FROM public.conversations c2, b
          WHERE c2.clinic_id = p_clinic_id
            AND c2.stage = 'aguardando_humano'
            AND c2.handoff_assumido_em IS NULL
            AND c2.handoff_aberto_em < NOW() - make_interval(mins => b.prazo)),
        (SELECT count(*) FROM public.conversations
          WHERE clinic_id = p_clinic_id
            AND stage IN ('novo', 'qualificando', 'qualificado', 'agendando')
            AND last_inbound_at < NOW() - INTERVAL '24 hours'),
        CASE WHEN count(*) > 0
             THEN round(100.0 * count(*) FILTER (WHERE stage IN ('agendado', 'encerrado')) / count(*), 1)
             ELSE 0 END
      FROM coorte;
$$;

GRANT EXECUTE ON FUNCTION public.painel_resumo(UUID, INTEGER) TO authenticated;


-- De onde vêm os leads que realmente agendam. Uma clínica gastando em tráfego
-- pago que converte metade da indicação precisa ver isso em número.
CREATE OR REPLACE VIEW public.vw_origem_leads
WITH (security_invoker = true) AS
SELECT c.clinic_id,
       c.origem,
       count(*)                                                        AS total,
       count(*) FILTER (WHERE c.stage IN ('agendado', 'encerrado'))     AS agendados,
       count(*) FILTER (WHERE c.stage = 'perdido')                      AS perdidos,
       CASE WHEN count(*) > 0
            THEN round(100.0 * count(*) FILTER (WHERE c.stage IN ('agendado','encerrado')) / count(*), 1)
            ELSE 0 END                                                  AS taxa_conversao
  FROM public.conversations c
 GROUP BY c.clinic_id, c.origem;

GRANT SELECT ON public.vw_origem_leads TO authenticated;


-- Procedimentos por demanda e por conversão. Responde "o que puxa gente" e
-- "o que puxa gente que fecha", que raramente são a mesma coisa.
CREATE OR REPLACE VIEW public.vw_procedimentos_demanda
WITH (security_invoker = true) AS
SELECT c.clinic_id,
       p.id   AS procedure_id,
       p.nome,
       p.categoria,
       count(*)                                                        AS interessados,
       count(*) FILTER (WHERE c.stage IN ('agendado', 'encerrado'))     AS agendados,
       CASE WHEN count(*) > 0
            THEN round(100.0 * count(*) FILTER (WHERE c.stage IN ('agendado','encerrado')) / count(*), 1)
            ELSE 0 END                                                  AS taxa_conversao
  FROM public.conversations c
  JOIN public.procedures p ON p.id = c.procedure_id
 GROUP BY c.clinic_id, p.id, p.nome, p.categoria;

GRANT SELECT ON public.vw_procedimentos_demanda TO authenticated;
