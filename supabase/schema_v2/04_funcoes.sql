-- =============================================================================
-- 04 — FUNÇÕES E VIEWS: transição de estágio, handoff, entrada do webhook, funil
-- =============================================================================
-- Toda escrita em conversations.stage passa por advance_conversation_stage. Não
-- é preciosismo: o estágio decide qual agente responde, e UPDATE solto espalhado
-- pelo backend é como a máquina de estados vira ficção — um lugar esquece de
-- gravar o histórico, outro pula uma etapa, e ninguém consegue explicar depois
-- por que um lead nunca foi agendado.
--
-- Todas as views usam security_invoker = true. View sem isso roda com os
-- privilégios do DONO e IGNORA o RLS: a fila de handoff de uma clínica
-- apareceria para outra. É o vazamento mais fácil de cometer e o mais difícil
-- de perceber, porque no ambiente de teste, com uma clínica só, tudo parece certo.
-- =============================================================================

-- 1. CONSULTAS DE ESTADO -----------------------------------------------------

-- A IA pode responder AGORA nesta conversa?
CREATE OR REPLACE FUNCTION public.ai_can_reply(p_conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT c.stage <> 'aguardando_humano'
       AND (c.ai_locked_until IS NULL OR c.ai_locked_until <= NOW())
       AND NOT c.opted_out
      FROM public.conversations c
     WHERE c.id = p_conversation_id;
$$;

-- A janela de 24h ainda está aberta? Fora dela só sai template aprovado.
CREATE OR REPLACE FUNCTION public.session_window_open(p_conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT c.last_inbound_at IS NOT NULL
       AND c.last_inbound_at > NOW() - INTERVAL '24 hours'
      FROM public.conversations c
     WHERE c.id = p_conversation_id;
$$;

-- 2. TRANSIÇÃO DE ESTÁGIO ----------------------------------------------------
-- Valida contra o grafo, preserva o estágio de origem e grava o histórico —
-- tudo na mesma transação, com FOR UPDATE para não perder transição quando duas
-- mensagens do mesmo lead chegam juntas.
CREATE OR REPLACE FUNCTION public.advance_conversation_stage(
    p_conversation_id UUID,
    p_to_stage public.conversation_stage,
    p_trigger public.transition_trigger DEFAULT 'ia',
    p_motivo TEXT DEFAULT NULL,
    p_actor_user_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS public.conversations
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_conv public.conversations;
    v_from public.conversation_stage;
    v_permitida BOOLEAN;
    v_forcada BOOLEAN := false;
    v_previous public.conversation_stage;
BEGIN
    SELECT * INTO v_conv
      FROM public.conversations
     WHERE id = p_conversation_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Conversa % não encontrada', p_conversation_id
            USING ERRCODE = 'no_data_found';
    END IF;

    v_from := v_conv.stage;

    -- Reentrada no mesmo estágio não é transição. Sem esta saída, o histórico
    -- ganha uma linha idêntica a cada mensagem e deixa de ser legível.
    IF v_from = p_to_stage THEN
        RETURN v_conv;
    END IF;

    SELECT true INTO v_permitida
      FROM public.stage_transition_rules
     WHERE from_stage = v_from AND to_stage = p_to_stage;

    IF v_permitida IS NULL THEN
        IF p_trigger = 'humano' THEN
            -- Atendente destrava conversa presa mesmo fora do grafo. Fica
            -- marcada como forçada para revisão depois: ou o grafo está
            -- incompleto, ou foi exceção legítima.
            v_forcada := true;
        ELSE
            RAISE EXCEPTION 'Transição % -> % não permitida', v_from, p_to_stage
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    -- previous_stage só é reescrito ao ENTRAR no handoff. Ao sair, é preservado:
    -- é ele que devolve o lead ao ponto exato onde parou. Sem isso, um lead já
    -- qualificado volta do atendimento humano como se fosse primeiro contato e
    -- a IA recomeça a qualificação do zero — do ponto de vista de quem está do
    -- outro lado, a clínica esqueceu a conversa inteira.
    v_previous := CASE
        WHEN p_to_stage = 'aguardando_humano' THEN v_from
        ELSE v_conv.previous_stage
    END;

    UPDATE public.conversations
       SET stage = p_to_stage,
           previous_stage = v_previous,
           stage_changed_at = NOW(),
           qualificado_em = CASE
               WHEN p_to_stage = 'qualificado' AND qualificado_em IS NULL THEN NOW()
               ELSE qualificado_em
           END,
           -- Sair do handoff limpa a trava; entrar não mexe (quem trava é o estágio).
           ai_locked_until = CASE
               WHEN v_from = 'aguardando_humano' AND p_to_stage <> 'aguardando_humano' THEN NULL
               ELSE ai_locked_until
           END,
           handoff_aberto_em = CASE
               WHEN p_to_stage = 'aguardando_humano' THEN NOW()
               ELSE handoff_aberto_em
           END
     WHERE id = p_conversation_id
    RETURNING * INTO v_conv;

    INSERT INTO public.conversation_transitions (
        conversation_id, clinic_id, from_stage, to_stage,
        from_agent, to_agent, gatilho, forcada, motivo, actor_user_id, metadata
    ) VALUES (
        p_conversation_id, v_conv.clinic_id, v_from, p_to_stage,
        public.agent_for_stage(v_from), public.agent_for_stage(p_to_stage),
        p_trigger, v_forcada, p_motivo, p_actor_user_id, COALESCE(p_metadata, '{}'::JSONB)
    );

    RETURN v_conv;
END;
$$;

-- 3. HANDOFF -----------------------------------------------------------------
-- Abrir handoff é mais que mudar estágio: registra motivo, severidade, a regra
-- que disparou e enfileira alerta para quem a clínica cadastrou. Handoff sem
-- notificação ativa é conversa parada que ninguém vê.
CREATE OR REPLACE FUNCTION public.open_handoff(
    p_conversation_id UUID,
    p_motivo TEXT,
    p_severidade TEXT DEFAULT 'alta',
    p_rule_id UUID DEFAULT NULL,
    p_trigger public.transition_trigger DEFAULT 'regra'
)
RETURNS public.conversations
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_conv public.conversations;
BEGIN
    v_conv := public.advance_conversation_stage(
        p_conversation_id, 'aguardando_humano', p_trigger, p_motivo, NULL,
        jsonb_build_object('severidade', p_severidade, 'rule_id', p_rule_id)
    );

    UPDATE public.conversations
       SET handoff_motivo = p_motivo,
           handoff_severidade = p_severidade,
           handoff_rule_id = p_rule_id,
           handoff_assumido_por = NULL,
           handoff_assumido_em = NULL
     WHERE id = p_conversation_id
    RETURNING * INTO v_conv;

    INSERT INTO public.handoff_alerts (conversation_id, clinic_id, recipient_id, canal, endereco)
    SELECT p_conversation_id, r.clinic_id, r.id, r.canal, r.endereco
      FROM public.handoff_recipients r
     WHERE r.clinic_id = v_conv.clinic_id
       AND r.ativo
       AND CASE r.severidade_minima
             WHEN 'baixa' THEN 1 WHEN 'media' THEN 2
             WHEN 'alta'  THEN 3 ELSE 4
           END
        <= CASE p_severidade
             WHEN 'baixa' THEN 1 WHEN 'media' THEN 2
             WHEN 'alta'  THEN 3 ELSE 4
           END;

    RETURN v_conv;
END;
$$;

-- Devolve o lead ao estágio de onde ele saiu.
CREATE OR REPLACE FUNCTION public.close_handoff(
    p_conversation_id UUID,
    p_actor_user_id UUID DEFAULT NULL,
    p_to_stage public.conversation_stage DEFAULT NULL,
    p_motivo TEXT DEFAULT 'Atendimento humano concluído'
)
RETURNS public.conversations
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_conv public.conversations;
    v_alvo public.conversation_stage;
BEGIN
    SELECT * INTO v_conv FROM public.conversations WHERE id = p_conversation_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Conversa % não encontrada', p_conversation_id
            USING ERRCODE = 'no_data_found';
    END IF;

    -- Chamada repetida não é erro: o painel e o job de timeout podem disputar a
    -- mesma conversa, e falhar aqui só geraria alarme falso.
    IF v_conv.stage <> 'aguardando_humano' THEN
        RETURN v_conv;
    END IF;

    -- 'novo' não é destino válido: quem já falou com humano não é mais primeiro
    -- contato, e voltar para lá faria a Solara se reapresentar.
    v_alvo := COALESCE(
        p_to_stage,
        NULLIF(v_conv.previous_stage, 'novo'),
        'qualificando'
    );

    RETURN public.advance_conversation_stage(
        p_conversation_id, v_alvo,
        CASE WHEN p_actor_user_id IS NULL THEN 'timeout' ELSE 'humano' END,
        p_motivo, p_actor_user_id, '{}'::JSONB
    );
END;
$$;

-- 4. ENTRADA DO WEBHOOK ------------------------------------------------------
-- Uma chamada resolve o que o webhook precisa: tenant pelo phone_number_id,
-- conversa (criando no primeiro contato), idempotência, janela de 24h, reset do
-- follow-up e a decisão de roteamento.
CREATE OR REPLACE FUNCTION public.handle_inbound_whatsapp(
    p_phone_number_id TEXT,
    p_wa_contact_id TEXT,
    p_wa_message_id TEXT,
    p_content TEXT,
    p_contact_name TEXT DEFAULT NULL,
    p_sent_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_clinic_id UUID;
    v_conv public.conversations;
    v_duplicada BOOLEAN := false;
    v_em TIMESTAMPTZ := COALESCE(p_sent_at, NOW());
BEGIN
    SELECT clinic_id INTO v_clinic_id
      FROM public.wa_phone_numbers
     WHERE phone_number_id = p_phone_number_id
       AND status <> 'desconectado';

    -- Sem fallback "descobre a clínica pelo telefone do paciente", de propósito.
    -- Número desconhecido é erro de configuração; adivinhar o tenant mistura
    -- clínicas, e o mesmo lead atendido por duas cairia sempre na primeira que
    -- o banco devolvesse.
    IF v_clinic_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'phone_number_id desconhecido');
    END IF;

    INSERT INTO public.conversations (clinic_id, phone_number_id, wa_contact_id, contact_name)
    VALUES (v_clinic_id, p_phone_number_id, p_wa_contact_id, p_contact_name)
    ON CONFLICT (clinic_id, wa_contact_id) DO UPDATE
       SET contact_name = COALESCE(EXCLUDED.contact_name, public.conversations.contact_name),
           phone_number_id = EXCLUDED.phone_number_id
    RETURNING * INTO v_conv;

    IF p_wa_message_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.messages WHERE wa_message_id = p_wa_message_id) THEN
        v_duplicada := true;
    ELSE
        INSERT INTO public.messages (
            clinic_id, conversation_id, patient_id, content,
            direction, sender_type, status, wa_message_id, metadata
        ) VALUES (
            v_clinic_id, v_conv.id, v_conv.patient_id, p_content,
            'inbound', 'lead', 'received', p_wa_message_id,
            jsonb_build_object('phone_number_id', p_phone_number_id)
        );

        UPDATE public.conversations
           SET last_inbound_at = v_em,
               message_count = message_count + 1,
               -- Lead respondeu: a régua zera e o disparo pendente é cancelado.
               -- Sem isto o template de follow-up sai DEPOIS da resposta, e a
               -- clínica paga uma conversa para reengajar quem já voltou.
               follow_up_count = 0,
               next_follow_up_at = NULL
         WHERE id = v_conv.id
        RETURNING * INTO v_conv;
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'duplicada', v_duplicada,
        'clinic_id', v_clinic_id,
        'conversation_id', v_conv.id,
        'patient_id', v_conv.patient_id,
        'stage', v_conv.stage,
        'previous_stage', v_conv.previous_stage,
        'agent', public.agent_for_stage(v_conv.stage),
        'apresentada', v_conv.apresentada,
        'ia_deve_responder', (NOT v_duplicada) AND public.ai_can_reply(v_conv.id),
        'janela_aberta', public.session_window_open(v_conv.id),
        'handoff_motivo', v_conv.handoff_motivo
    );
END;
$$;

-- 5. PERMISSÕES DE EXECUÇÃO --------------------------------------------------
-- O painel precisa mover conversa e fechar handoff. O caminho do webhook e o
-- motor de regras são do servidor: não têm por que ficar expostos no navegador.
GRANT EXECUTE ON FUNCTION public.advance_conversation_stage(UUID, public.conversation_stage, public.transition_trigger, TEXT, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_handoff(UUID, UUID, public.conversation_stage, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ai_can_reply(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.session_window_open(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.handle_inbound_whatsapp(TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.open_handoff(UUID, TEXT, TEXT, UUID, public.transition_trigger) FROM PUBLIC, anon;

-- 6. VIEWS DO PAINEL ---------------------------------------------------------
-- security_invoker = true em TODAS: sem isso a view roda como dona, ignora o
-- RLS e mostra dado de uma clínica para outra.

-- Funil: o quadro que o painel abre. Uma linha por estágio, já com o recorte
-- de período — a agregação vive no banco, não em JavaScript baixando a base toda.
CREATE OR REPLACE VIEW public.vw_funil
WITH (security_invoker = true) AS
SELECT
    c.clinic_id,
    c.stage,
    count(*)                                                              AS total,
    count(*) FILTER (WHERE c.created_at >= NOW() - INTERVAL '7 days')     AS total_7d,
    count(*) FILTER (WHERE c.created_at >= NOW() - INTERVAL '30 days')    AS total_30d,
    count(*) FILTER (WHERE c.stage = 'aguardando_humano')                 AS em_handoff,
    count(DISTINCT c.procedure_id)                                        AS procedimentos_distintos
FROM public.conversations c
GROUP BY c.clinic_id, c.stage;

-- Lista de leads classificados, já com o nome do procedimento resolvido.
CREATE OR REPLACE VIEW public.vw_leads
WITH (security_invoker = true) AS
SELECT
    c.id                              AS conversation_id,
    c.clinic_id,
    c.wa_contact_id,
    c.contact_name,
    c.stage,
    public.agent_for_stage(c.stage)   AS agente_atual,
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

-- Fila do handoff: quem espera humano e há quanto tempo.
CREATE OR REPLACE VIEW public.vw_handoff_queue
WITH (security_invoker = true) AS
SELECT
    c.id AS conversation_id,
    c.clinic_id,
    c.wa_contact_id,
    c.contact_name,
    c.previous_stage,
    c.handoff_motivo,
    c.handoff_severidade,
    c.handoff_aberto_em,
    c.handoff_assumido_por,
    c.handoff_assumido_em,
    EXTRACT(EPOCH FROM (NOW() - c.handoff_aberto_em)) / 60 AS minutos_esperando,
    (c.handoff_assumido_em IS NULL
     AND c.handoff_aberto_em < NOW() - make_interval(mins => b.handoff_prazo_assumir_minutos))
        AS atrasado_para_assumir,
    (c.handoff_aberto_em < NOW() - make_interval(mins => b.handoff_timeout_minutos))
        AS timeout_atingido
FROM public.conversations c
JOIN public.clinic_briefing b ON b.clinic_id = c.clinic_id
WHERE c.stage = 'aguardando_humano';

-- Fila do follow-up: quem está parado, dentro do teto de tentativas, sem
-- opt-out, com passo de cadência e template APROVADO disponível.
CREATE OR REPLACE VIEW public.vw_pending_followups
WITH (security_invoker = true) AS
SELECT
    c.id AS conversation_id,
    c.clinic_id,
    c.wa_contact_id,
    c.contact_name,
    c.stage,
    c.follow_up_count,
    c.next_follow_up_at,
    c.last_inbound_at,
    (c.last_inbound_at > NOW() - INTERVAL '24 hours') AS janela_aberta,
    s.passo,
    t.id   AS template_id,
    t.name AS template_name,
    t.language AS template_language,
    t.categoria AS template_categoria
FROM public.conversations c
JOIN public.clinic_briefing b ON b.clinic_id = c.clinic_id
LEFT JOIN public.followup_steps s
       ON s.clinic_id = c.clinic_id
      AND s.passo = c.follow_up_count + 1
      AND s.ativo
      AND (s.aplica_ao_estagio IS NULL OR s.aplica_ao_estagio = c.stage)
LEFT JOIN public.wa_message_templates t
       ON t.id = s.template_id AND t.status = 'aprovado'
WHERE b.follow_up_ativo
  AND NOT c.opted_out
  -- Handoff, perdido, encerrado e agendado não recebem follow-up de captação.
  AND c.stage NOT IN ('aguardando_humano', 'perdido', 'encerrado', 'agendado')
  AND c.follow_up_count < b.follow_up_max_tentativas
  AND c.next_follow_up_at IS NOT NULL
  AND c.next_follow_up_at <= NOW();

GRANT SELECT ON public.vw_funil, public.vw_leads,
               public.vw_handoff_queue, public.vw_pending_followups
      TO authenticated;
