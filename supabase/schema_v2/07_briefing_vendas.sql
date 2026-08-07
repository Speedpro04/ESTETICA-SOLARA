-- =============================================================================
-- 07 — BRIEFING DE VENDAS: o que transforma o SDR num bom vendedor
-- =============================================================================
-- O clinic_briefing do arquivo 03 cobre o OPERACIONAL: política de preço, regra
-- de agenda, prazo de handoff, cadência de follow-up. É o suficiente para a IA
-- não errar — e insuficiente para ela vender.
--
-- A diferença entre um atendente que não erra e um SDR que converte está em
-- coisas que nenhuma dessas colunas guarda: para quem essa clínica é boa, o que
-- ela faz melhor que a da esquina, por que o preço é o que é, o que dizer quando
-- o lead trava, e quando parar de insistir.
--
-- Tudo aqui vira prompt do SDR. Campo vazio não vira nada: briefing pela metade
-- gera um vendedor genérico, e é isso que o formulário do painel precisa deixar
-- claro para quem preenche.
-- =============================================================================

ALTER TABLE public.clinic_briefing

    -- ---- PERFIL DE CLIENTE IDEAL -------------------------------------------
    -- Sem isto o SDR trata igual quem quer botox aos 30 e quem quer lifting aos
    -- 60. São conversas diferentes, com medos diferentes.
    ADD COLUMN IF NOT EXISTS cliente_ideal TEXT,
    ADD COLUMN IF NOT EXISTS faixa_etaria_principal TEXT,
    -- A dor ou desejo real por trás do procedimento: "quer parecer descansada",
    -- "corpo pós-gestação", "casamento chegando". É o que o SDR precisa nomear
    -- para a pessoa se sentir entendida em vez de atendida.
    ADD COLUMN IF NOT EXISTS motivacoes_comuns TEXT,
    -- Quem NÃO é cliente. Reconhecer cedo economiza a agenda da clínica e evita
    -- avaliação com quem chegou com expectativa irreal.
    ADD COLUMN IF NOT EXISTS perfil_desqualificado TEXT,

    -- ---- ANCORAGEM DE VALOR -------------------------------------------------
    -- Diferenciais CONCRETOS. "Atendimento humanizado" não vende nada porque
    -- todo mundo escreve isso. "Marca X de toxina, importada, com nota fiscal do
    -- lote" vende.
    ADD COLUMN IF NOT EXISTS diferenciais_concretos TEXT,
    -- Prova social verificável: anos de atuação, volume de procedimentos,
    -- formação dos profissionais. Número específico convence; adjetivo, não.
    ADD COLUMN IF NOT EXISTS prova_social TEXT,
    -- O que reduz o risco percebido: retorno incluso, acompanhamento pós,
    -- política de retoque. É o que destrava quem tem medo, não quem acha caro.
    ADD COLUMN IF NOT EXISTS garantias TEXT,
    -- Por que custa o que custa. Sem isto o SDR defende preço com "vale a pena",
    -- que é o mesmo que não defender.
    ADD COLUMN IF NOT EXISTS justificativa_de_preco TEXT,

    -- ---- CONVERSÃO ----------------------------------------------------------
    -- Urgência REAL (agenda apertada, sazonalidade de verão, prazo de
    -- recuperação antes de um evento). Urgência inventada queima a marca.
    ADD COLUMN IF NOT EXISTS gatilhos_de_urgencia TEXT,
    ADD COLUMN IF NOT EXISTS oferta_vigente TEXT,
    ADD COLUMN IF NOT EXISTS oferta_valida_ate DATE,
    -- A carta na manga para quem travou: avaliação sem custo, primeira sessão
    -- promocional, conversa com o profissional. Uma só, e no momento certo.
    ADD COLUMN IF NOT EXISTS oferta_de_destrave TEXT,
    -- O que o SDR está tentando conseguir. Todo o resto é meio.
    ADD COLUMN IF NOT EXISTS proxima_acao_desejada TEXT NOT NULL DEFAULT 'avaliacao_presencial'
        CHECK (proxima_acao_desejada IN (
            'avaliacao_presencial', 'avaliacao_online', 'orcamento', 'visita_conhecer'
        )),

    -- ---- QUALIFICAÇÃO -------------------------------------------------------
    -- Perguntas na ORDEM que esta clínica quer, uma por mensagem.
    -- [{"pergunta": "...", "porque": "...", "obrigatoria": true}]
    ADD COLUMN IF NOT EXISTS perguntas_qualificacao JSONB NOT NULL DEFAULT '[]'::JSONB,
    -- Assunto que o SDR pode abordar sem escalar. O que não estiver aqui e for
    -- sensível cai nas escalation_rules.
    ADD COLUMN IF NOT EXISTS assuntos_autorizados TEXT,

    -- ---- POSTURA COMERCIAL --------------------------------------------------
    -- 'consultivo' pergunta e conduz; 'direto' propõe o próximo passo mais cedo.
    -- Clínica de alto padrão quase sempre quer consultivo: pressão em estética
    -- lê-se como desespero e derruba o valor percebido.
    ADD COLUMN IF NOT EXISTS postura_comercial TEXT NOT NULL DEFAULT 'consultivo'
        CHECK (postura_comercial IN ('consultivo', 'equilibrado', 'direto')),
    ADD COLUMN IF NOT EXISTS pode_oferecer_desconto BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS desconto_maximo_percentual INTEGER,
    -- Quantas vezes insistir depois de um "vou pensar". Passar disso irrita e
    -- queima o número na avaliação de qualidade da Meta.
    ADD COLUMN IF NOT EXISTS tentativas_antes_de_recuar INTEGER NOT NULL DEFAULT 2,
    -- Se o lead citar concorrente. O guardrail proíbe citar nome de terceiro;
    -- aqui fica o que a clínica quer que seja dito no lugar.
    ADD COLUMN IF NOT EXISTS resposta_a_concorrente TEXT,

    ADD CONSTRAINT briefing_desconto_coerente CHECK (
        desconto_maximo_percentual IS NULL
        OR (desconto_maximo_percentual BETWEEN 0 AND 100)
    ),
    ADD CONSTRAINT briefing_tentativas_recuo CHECK (
        tentativas_antes_de_recuar BETWEEN 0 AND 5
    );

-- Progresso do preenchimento, para o painel mostrar o que ainda falta.
-- Briefing incompleto não é erro: é SDR genérico, e a clínica precisa ver isso
-- em número, não descobrir pela conversa ruim três semanas depois.
CREATE OR REPLACE FUNCTION public.briefing_completude(p_clinic_id UUID)
RETURNS TABLE (secao TEXT, preenchidos INTEGER, total INTEGER)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    WITH b AS (SELECT * FROM public.clinic_briefing WHERE clinic_id = p_clinic_id)
    SELECT 'identidade', (
        (b.tom_de_voz IS NOT NULL)::int + (b.publico_alvo IS NOT NULL)::int
      + (b.diferenciais IS NOT NULL)::int
    ), 3 FROM b
    UNION ALL
    SELECT 'cliente_ideal', (
        (b.cliente_ideal IS NOT NULL)::int + (b.faixa_etaria_principal IS NOT NULL)::int
      + (b.motivacoes_comuns IS NOT NULL)::int + (b.perfil_desqualificado IS NOT NULL)::int
    ), 4 FROM b
    UNION ALL
    SELECT 'valor', (
        (b.diferenciais_concretos IS NOT NULL)::int + (b.prova_social IS NOT NULL)::int
      + (b.garantias IS NOT NULL)::int + (b.justificativa_de_preco IS NOT NULL)::int
    ), 4 FROM b
    UNION ALL
    SELECT 'conversao', (
        (b.gatilhos_de_urgencia IS NOT NULL)::int + (b.oferta_de_destrave IS NOT NULL)::int
      + (jsonb_array_length(b.perguntas_qualificacao) > 0)::int
      + (b.criterio_qualificado IS NOT NULL)::int
    ), 4 FROM b
    UNION ALL
    SELECT 'agenda', (
        (b.horarios <> '{}'::jsonb)::int + (b.politica_cancelamento IS NOT NULL)::int
    ), 2 FROM b
    UNION ALL
    SELECT 'objecoes', (
        SELECT count(*)::int FROM public.briefing_objections
         WHERE clinic_id = p_clinic_id AND ativo
    ), 5
    UNION ALL
    SELECT 'procedimentos', (
        SELECT count(*)::int FROM public.procedures
         WHERE clinic_id = p_clinic_id AND ativo
    ), 3;
$$;

GRANT EXECUTE ON FUNCTION public.briefing_completude(UUID) TO authenticated;
