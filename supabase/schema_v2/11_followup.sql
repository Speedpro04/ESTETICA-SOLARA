-- =============================================================================
-- 11 — FILA DE FOLLOW-UP E TIMEOUT DE HANDOFF
-- =============================================================================
-- Duas rotinas periódicas, e nenhuma delas precisa de Celery, Redis ou worker
-- separado: o estado já está no banco (next_follow_up_at, handoff_aberto_em), e
-- uma query com WHERE resolve o que um broker resolveria. Menos um processo para
-- monitorar, cair de madrugada e pagar.
--
-- A vw_pending_followups do arquivo 04 tinha um furo: não devolvia o
-- phone_number_id. O job saberia PARA QUEM mandar e não POR QUAL número — e com
-- número próprio por clínica, isso é a diferença entre enviar e falhar.
-- =============================================================================

DROP VIEW IF EXISTS public.vw_pending_followups;

CREATE VIEW public.vw_pending_followups
WITH (security_invoker = true) AS
SELECT
    c.id AS conversation_id,
    c.clinic_id,
    c.phone_number_id,          -- faltava: é por ele que se envia
    c.wa_contact_id,
    c.contact_name,
    c.stage,
    c.follow_up_count,
    c.next_follow_up_at,
    c.last_inbound_at,
    (c.last_inbound_at > NOW() - INTERVAL '24 hours') AS janela_aberta,
    cl.timezone,
    b.follow_up_silencio_inicio,
    b.follow_up_silencio_fim,
    b.follow_up_max_tentativas,
    s.passo,
    s.template_id,
    t.name      AS template_name,
    t.language  AS template_language,
    t.categoria AS template_categoria,
    p.nome      AS procedimento
FROM public.conversations c
JOIN public.clinic_briefing b ON b.clinic_id = c.clinic_id
JOIN public.clinics cl ON cl.id = c.clinic_id
LEFT JOIN public.procedures p ON p.id = c.procedure_id
LEFT JOIN public.followup_steps s
       ON s.clinic_id = c.clinic_id
      AND s.passo = c.follow_up_count + 1
      AND s.ativo
      AND (s.aplica_ao_estagio IS NULL OR s.aplica_ao_estagio = c.stage)
LEFT JOIN public.wa_message_templates t
       ON t.id = s.template_id AND t.status = 'aprovado'
WHERE b.follow_up_ativo
  AND NOT c.opted_out
  -- Handoff, perdido, encerrado e agendado não recebem follow-up de captação:
  -- quem está com a equipe não pode receber mensagem da IA por cima, e quem já
  -- marcou recebe lembrete, que é outro fluxo.
  AND c.stage NOT IN ('aguardando_humano', 'perdido', 'encerrado', 'agendado')
  AND c.follow_up_count < b.follow_up_max_tentativas
  AND c.next_follow_up_at IS NOT NULL
  AND c.next_follow_up_at <= NOW();

GRANT SELECT ON public.vw_pending_followups TO authenticated;


-- Agenda a próxima tentativa. Chamada depois de a IA responder: se o lead sumir,
-- o relógio já está correndo.
CREATE OR REPLACE FUNCTION public.agendar_follow_up(p_conversation_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_conv public.conversations;
    v_espera INTEGER;
    v_max INTEGER;
    v_quando TIMESTAMPTZ;
BEGIN
    SELECT * INTO v_conv FROM public.conversations WHERE id = p_conversation_id;
    IF NOT FOUND OR v_conv.opted_out THEN
        RETURN NULL;
    END IF;

    SELECT follow_up_max_tentativas INTO v_max
      FROM public.clinic_briefing WHERE clinic_id = v_conv.clinic_id AND follow_up_ativo;

    IF v_max IS NULL OR v_conv.follow_up_count >= v_max THEN
        RETURN NULL;
    END IF;

    SELECT espera_horas INTO v_espera
      FROM public.followup_steps
     WHERE clinic_id = v_conv.clinic_id
       AND passo = v_conv.follow_up_count + 1
       AND ativo
       AND (aplica_ao_estagio IS NULL OR aplica_ao_estagio = v_conv.stage)
     ORDER BY aplica_ao_estagio NULLS LAST
     LIMIT 1;

    -- Cadência não configurada: 24h para a primeira tentativa, 72h para a
    -- segunda. É o padrão que a clínica ajusta depois, não motivo para não haver
    -- follow-up nenhum.
    v_espera := COALESCE(v_espera, CASE WHEN v_conv.follow_up_count = 0 THEN 24 ELSE 72 END);
    v_quando := NOW() + make_interval(hours => v_espera);

    UPDATE public.conversations SET next_follow_up_at = v_quando WHERE id = p_conversation_id;
    RETURN v_quando;
END;
$$;


-- Registra a tentativa enviada e já agenda a seguinte (ou encerra a régua).
CREATE OR REPLACE FUNCTION public.registrar_follow_up(p_conversation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_proximo TIMESTAMPTZ;
    v_count INTEGER;
BEGIN
    UPDATE public.conversations
       SET follow_up_count = follow_up_count + 1,
           last_follow_up_at = NOW(),
           next_follow_up_at = NULL   -- reagendado abaixo, se ainda houver passo
     WHERE id = p_conversation_id
    RETURNING follow_up_count INTO v_count;

    v_proximo := public.agendar_follow_up(p_conversation_id);
    RETURN jsonb_build_object('tentativas', v_count, 'proximo', v_proximo);
END;
$$;


-- Devolve à IA as conversas em que ninguém assumiu dentro do prazo.
--
-- Sem isto, um lead entra em 'aguardando_humano' numa sexta à tarde, a clínica
-- não abre o painel, e ele nunca mais recebe resposta. O TTL é o que impede o
-- handoff de virar buraco negro.
CREATE OR REPLACE FUNCTION public.expirar_handoffs()
RETURNS TABLE (conversation_id UUID, clinic_id UUID, minutos_esperados NUMERIC)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_linha RECORD;
BEGIN
    FOR v_linha IN
        SELECT c.id, c.clinic_id,
               EXTRACT(EPOCH FROM (NOW() - c.handoff_aberto_em)) / 60 AS minutos
          FROM public.conversations c
          JOIN public.clinic_briefing b ON b.clinic_id = c.clinic_id
         WHERE c.stage = 'aguardando_humano'
           AND c.handoff_aberto_em IS NOT NULL
           -- Quem JÁ foi assumido por um humano não expira: a pessoa está sendo
           -- atendida, e devolver para a IA no meio da conversa seria pior que
           -- a demora.
           AND c.handoff_assumido_em IS NULL
           AND c.handoff_aberto_em < NOW() - make_interval(mins => b.handoff_timeout_minutos)
    LOOP
        PERFORM public.close_handoff(
            v_linha.id, NULL, NULL,
            'Ninguém assumiu no prazo; devolvido à Solara automaticamente'
        );
        conversation_id := v_linha.id;
        clinic_id := v_linha.clinic_id;
        minutos_esperados := round(v_linha.minutos, 1);
        RETURN NEXT;
    END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.expirar_handoffs() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.registrar_follow_up(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.agendar_follow_up(UUID) FROM PUBLIC, anon, authenticated;
