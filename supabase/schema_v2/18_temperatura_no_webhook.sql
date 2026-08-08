-- =============================================================================
-- 18 — A temperatura chega ao roteador
-- =============================================================================
-- O SDR muda de comportamento conforme a temperatura do lead, então ela precisa
-- vir junto na resposta do webhook. Sem isso, o roteador teria que fazer uma
-- segunda consulta só para descobrir com quem está falando — uma ida a mais ao
-- banco no caminho mais quente do sistema, o de responder a mensagem.
--
-- Devolve a temperatura EFETIVA: o que o SDR classificou vence o que os sinais
-- sugerem, porque ele leu a conversa inteira.
-- =============================================================================

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
        -- O que o SDR classificou vence o que os sinais sugerem: ele leu a
        -- conversa inteira, a inferência só olha campos soltos.
        'temperatura', COALESCE(
            v_conv.temperatura,
            public.temperatura_inferida(v_conv.stage, v_conv.urgencia, v_conv.procedure_id,
                                        v_conv.procedimento_texto, v_conv.sinal_orcamento,
                                        v_conv.message_count)
        ),
        'procedure_id', v_conv.procedure_id,
        'ia_deve_responder', (NOT v_duplicada) AND public.ai_can_reply(v_conv.id),
        'janela_aberta', public.session_window_open(v_conv.id),
        'handoff_motivo', v_conv.handoff_motivo
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_inbound_whatsapp(TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ)
    FROM PUBLIC, anon, authenticated;
