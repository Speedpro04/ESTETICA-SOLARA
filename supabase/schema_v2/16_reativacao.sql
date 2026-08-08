-- =============================================================================
-- 16 — REATIVAÇÃO DA BASE FRIA
-- =============================================================================
-- Follow-up e reativação parecem a mesma coisa e não são. Misturar os dois
-- quebra os dois:
--
--   Follow-up    Dias. A conversa ainda está viva e a pessoa lembra de você.
--                "Ainda tenho horário essa semana" faz sentido.
--   Reativação   Meses. A pessoa nem lembra que falou com a clínica. A MESMA
--                frase vira spam.
--
-- Em estética o ciclo de decisão é longo: quem estava com medo em agosto pode
-- estar pronta em novembro. Ela não disse não — disse "agora não". Abandonar
-- esse lead depois de duas tentativas em três dias joga fora o que a clínica
-- pagou para conseguir.
--
-- Três travas, e cada uma existe por um motivo diferente:
--
--   intervalo de meses   A mensagem precisa de um MOTIVO, não de um ping.
--   teto mensal          Cada disparo é conversa paga na Meta. Sem teto, 300
--                        leads frios viram uma conta fixa que ninguém criou de
--                        propósito.
--   categoria da perda   Mandar para quem nunca vai voltar derruba a nota de
--                        qualidade do número — e com nota ruim a Meta limita
--                        quantas conversas você abre por dia. Aí você perde o
--                        lead QUENTE, que era quem pagava a conta.
-- =============================================================================

-- 1. POR QUE O LEAD SE PERDEU ------------------------------------------------
-- `motivo_perda` é texto livre, bom para a recepção ler e ruim para decidir.
-- A categoria é o que a máquina usa.
ALTER TABLE public.conversations
    ADD COLUMN IF NOT EXISTS motivo_perda_categoria TEXT
        CHECK (motivo_perda_categoria IN (
            'sumiu',                    -- parou de responder, sem dizer nada
            'preco',                    -- achou caro
            'medo',                     -- insegurança com o procedimento
            'tempo',                    -- "agora não dá", sem prazo
            'indeciso',                 -- "vou pensar"
            'fora_do_perfil',           -- não é cliente desta clínica
            'engano',                   -- número errado, spam
            'pediu_para_nao_contatar'   -- opt-out explícito
        )),
    ADD COLUMN IF NOT EXISTS reativacoes INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ultima_reativacao_em TIMESTAMPTZ;


-- Quem merece voltar. Separado em função para a regra viver num lugar só —
-- ela aparece na view, no job e no painel.
CREATE OR REPLACE FUNCTION public.perda_reativavel(p_categoria TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    -- Sumiu, achou caro, ficou com medo, precisava de tempo, ficou indeciso:
    -- todos disseram "agora não", não "não". Voltam.
    --
    -- Fora do perfil, engano e opt-out NUNCA voltam. Os dois primeiros porque
    -- não são clientes; o terceiro porque insistir depois de um pedido explícito
    -- é o caminho mais rápido para a denúncia e para a nota ruim na Meta.
    --
    -- NULL (perdeu sem categoria registrada) entra como reativável: o silêncio
    -- da recepção não deveria custar um lead à clínica.
    SELECT COALESCE(p_categoria, 'sumiu') IN ('sumiu', 'preco', 'medo', 'tempo', 'indeciso');
$$;

GRANT EXECUTE ON FUNCTION public.perda_reativavel(TEXT) TO authenticated;


-- 2. CONFIGURAÇÃO POR CLÍNICA ------------------------------------------------
ALTER TABLE public.clinic_briefing
    ADD COLUMN IF NOT EXISTS reativacao_ativa BOOLEAN NOT NULL DEFAULT true,
    -- Três meses: menos que isso a pessoa ainda lembra da conversa anterior e a
    -- mensagem lê como insistência.
    ADD COLUMN IF NOT EXISTS reativacao_intervalo_meses INTEGER NOT NULL DEFAULT 3,
    -- Teto de vida por lead. Quem ignorou três vezes ao longo de um ano não vai
    -- responder na quarta — vai denunciar.
    ADD COLUMN IF NOT EXISTS reativacao_max_tentativas INTEGER NOT NULL DEFAULT 3,
    -- Teto de custo. É o que impede a base fria de virar despesa mensal
    -- invisível quando ela cresce.
    ADD COLUMN IF NOT EXISTS reativacao_teto_mensal INTEGER NOT NULL DEFAULT 50,
    -- O MOTIVO da mensagem. Sem gancho é spam; com gancho é serviço.
    -- Ex.: "a doutora abriu agenda de {procedimento} para janeiro"
    ADD COLUMN IF NOT EXISTS reativacao_gancho TEXT;

ALTER TABLE public.clinic_briefing
    ADD CONSTRAINT briefing_reativacao_sensata CHECK (
        reativacao_intervalo_meses BETWEEN 1 AND 12
        AND reativacao_max_tentativas BETWEEN 0 AND 6
        AND reativacao_teto_mensal BETWEEN 0 AND 2000
    );


-- 3. A BASE FRIA COMO ESTOQUE ------------------------------------------------
-- A clínica pagou por cada um desses leads. O painel mostra isso como ativo, e
-- não como lixo no fim da lista.
CREATE OR REPLACE VIEW public.vw_base_fria
WITH (security_invoker = true) AS
SELECT
    c.id AS conversation_id,
    c.clinic_id,
    c.wa_contact_id,
    c.contact_name,
    c.stage,
    c.motivo_perda,
    c.motivo_perda_categoria,
    c.reativacoes,
    c.ultima_reativacao_em,
    c.last_inbound_at,
    c.origem,
    COALESCE(p.nome, c.procedimento_texto) AS interesse,
    p.id AS procedure_id,
    -- Meses parada. É o que decide se já passou do intervalo.
    round(EXTRACT(EPOCH FROM (NOW() - COALESCE(c.ultima_reativacao_em, c.last_inbound_at, c.created_at)))
          / 2592000.0, 1) AS meses_parada,
    public.perda_reativavel(c.motivo_perda_categoria) AS pode_voltar,
    c.opted_out
FROM public.conversations c
LEFT JOIN public.procedures p ON p.id = c.procedure_id
WHERE c.stage IN ('perdido', 'encerrado')
   -- Também entra quem nunca foi marcado como perdido mas sumiu há mais de 30
   -- dias: na prática é base fria, e sem isto ela ficaria invisível para sempre.
   OR (c.stage NOT IN ('agendado', 'aguardando_humano')
       AND c.last_inbound_at < NOW() - INTERVAL '30 days');

GRANT SELECT ON public.vw_base_fria TO authenticated;


-- 4. QUEM DISPARA ESTE MÊS ---------------------------------------------------
-- Fila da reativação, já respeitando os três tetos. O job consome daqui e o
-- painel mostra o mesmo número — uma fonte só, sem divergência entre a tela e
-- o que efetivamente sai.
CREATE OR REPLACE FUNCTION public.elegiveis_reativacao(p_clinic_id UUID)
RETURNS TABLE (
    conversation_id UUID,
    wa_contact_id TEXT,
    contact_name TEXT,
    interesse TEXT,
    procedure_id UUID,
    meses_parada NUMERIC,
    reativacoes INTEGER
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    WITH cfg AS (
        SELECT * FROM public.clinic_briefing WHERE clinic_id = p_clinic_id AND reativacao_ativa
    ),
    -- Quantos já saíram no mês corrente. O teto é mensal, então a conta
    -- reinicia no dia 1 — não é janela móvel de 30 dias.
    ja_saiu AS (
        SELECT count(*) AS enviados
          FROM public.conversations
         WHERE clinic_id = p_clinic_id
           AND date_trunc('month', ultima_reativacao_em) = date_trunc('month', NOW())
    ),
    -- ROW_NUMBER em vez de LIMIT: o Postgres não aceita variável em LIMIT, e o
    -- teto aqui depende de quanto já saiu no mês.
    ordenada AS (
        SELECT b.conversation_id, b.wa_contact_id, b.contact_name, b.interesse,
               b.procedure_id, b.meses_parada, b.reativacoes,
               -- Mais tempo parada primeiro, e entre elas quem foi menos incomodada.
               row_number() OVER (ORDER BY b.meses_parada DESC, b.reativacoes ASC) AS posicao,
               GREATEST(cfg.reativacao_teto_mensal - ja_saiu.enviados, 0) AS vagas_no_mes
          FROM public.vw_base_fria b, cfg, ja_saiu
         WHERE b.clinic_id = p_clinic_id
           AND b.pode_voltar
           AND NOT b.opted_out
           AND b.reativacoes < cfg.reativacao_max_tentativas
           AND b.meses_parada >= cfg.reativacao_intervalo_meses
    )
    SELECT o.conversation_id, o.wa_contact_id, o.contact_name, o.interesse,
           o.procedure_id, o.meses_parada, o.reativacoes
      FROM ordenada o
     WHERE o.posicao <= o.vagas_no_mes;
$$;

GRANT EXECUTE ON FUNCTION public.elegiveis_reativacao(UUID) TO authenticated;


-- Registra o disparo. Não reagenda nada: a próxima elegibilidade é calculada
-- pelo intervalo, não por uma data guardada — assim mudar o intervalo no
-- briefing vale imediatamente para a base inteira.
CREATE OR REPLACE FUNCTION public.registrar_reativacao(p_conversation_id UUID)
RETURNS INTEGER
LANGUAGE sql
SET search_path = ''
AS $$
    UPDATE public.conversations
       SET reativacoes = reativacoes + 1,
           ultima_reativacao_em = NOW()
     WHERE id = p_conversation_id
    RETURNING reativacoes;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_reativacao(UUID) FROM PUBLIC, anon, authenticated;


-- 5. RESUMO PARA O PAINEL ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.resumo_base_fria(p_clinic_id UUID)
RETURNS TABLE (
    total BIGINT,
    reativaveis BIGINT,
    elegiveis_agora BIGINT,
    ja_reativados BIGINT,
    descartados BIGINT
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT
        count(*),
        count(*) FILTER (WHERE pode_voltar AND NOT opted_out),
        (SELECT count(*) FROM public.elegiveis_reativacao(p_clinic_id)),
        count(*) FILTER (WHERE reativacoes > 0),
        count(*) FILTER (WHERE NOT pode_voltar OR opted_out)
      FROM public.vw_base_fria
     WHERE clinic_id = p_clinic_id;
$$;

GRANT EXECUTE ON FUNCTION public.resumo_base_fria(UUID) TO authenticated;
