-- =============================================================================
-- 05 — ROW LEVEL SECURITY
-- =============================================================================
-- Todo o RLS num arquivo só, de propósito: política espalhada por cinco
-- arquivos é política que ninguém audita.
--
-- Duas regras seguidas em todas elas:
--
--   TO authenticated       Sem isso a política também vale para `anon`, e o
--                          alcance real fica maior do que parece na leitura.
--
--   current_clinic_ids()   Nunca `SELECT clinic_id FROM users WHERE auth_id =
--                          auth.uid()` direto na política: além de recursar
--                          entre clinics e users, perde o caso do dono cuja
--                          linha em `users` ainda não existe — e a clínica
--                          recém-criada abre o painel vazia.
--
-- O backend usa service_role, que ignora RLS por definição. Estas políticas
-- protegem o que passa pelo PostgREST, ou seja, o navegador.
-- =============================================================================

-- 1. PLANOS ------------------------------------------------------------------
-- Único caso de leitura pública: a landing precisa mostrar preço sem login.
-- Escrita não tem política, logo ninguém escreve pelo PostgREST.
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY plans_leitura_publica ON public.plans
    FOR SELECT TO anon, authenticated
    USING (active);

-- 2. CLÍNICAS ----------------------------------------------------------------
-- Compara duas colunas, não lê outra tabela: não há como recursar.
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;
CREATE POLICY clinics_dono ON public.clinics
    FOR ALL TO authenticated
    USING (owner_auth_id = (SELECT auth.uid()))
    WITH CHECK (owner_auth_id = (SELECT auth.uid()));

CREATE POLICY clinics_equipe_le ON public.clinics
    FOR SELECT TO authenticated
    USING (id IN (SELECT public.current_clinic_ids()));

CREATE POLICY clinics_cadastro ON public.clinics
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- 3. EQUIPE ------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_le ON public.users
    FOR SELECT TO authenticated
    USING (auth_id = (SELECT auth.uid()) OR clinic_id IN (SELECT public.current_clinic_ids()));

CREATE POLICY users_cadastro ON public.users
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY users_gerencia ON public.users
    FOR UPDATE TO authenticated
    USING (clinic_id IN (SELECT public.current_clinic_ids()));

CREATE POLICY users_remove ON public.users
    FOR DELETE TO authenticated
    USING (clinic_id IN (SELECT public.current_clinic_ids()));

-- 4. TABELAS COMUNS POR CLÍNICA ----------------------------------------------
-- Acesso total à própria clínica: procedimentos, pacientes, agenda,
-- conhecimento, briefing, conversas e mensagens.
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'procedures', 'patients', 'appointments', 'clinic_knowledge',
        'clinic_briefing', 'briefing_objections', 'handoff_recipients',
        'wa_message_templates', 'followup_steps', 'conversations', 'messages'
    ] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format($f$
            CREATE POLICY %I ON public.%I
                FOR ALL TO authenticated
                USING (clinic_id IN (SELECT public.current_clinic_ids()))
                WITH CHECK (clinic_id IN (SELECT public.current_clinic_ids()))
        $f$, t || '_clinica', t);
    END LOOP;
END $$;

-- 5. NÚMEROS DO WHATSAPP -----------------------------------------------------
-- Só leitura. A tabela guarda referências de segredo e o status do número na
-- Meta; quem escreve nela é o servidor, no fluxo de conexão.
ALTER TABLE public.wa_phone_numbers ENABLE ROW LEVEL SECURITY;
CREATE POLICY wa_phone_numbers_le ON public.wa_phone_numbers
    FOR SELECT TO authenticated
    USING (clinic_id IN (SELECT public.current_clinic_ids()));

-- 6. REGRAS DE ESCALONAMENTO -------------------------------------------------
-- A clínica lê as próprias E as globais (clinic_id NULL)...
ALTER TABLE public.escalation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY escalation_rules_le ON public.escalation_rules
    FOR SELECT TO authenticated
    USING (clinic_id IS NULL OR clinic_id IN (SELECT public.current_clinic_ids()));

-- ...mas só escreve nas próprias. Regra global de risco clínico (contraindicação,
-- reação adversa, ameaça judicial) não é editável pelo cliente: é o piso de
-- segurança que a Axos garante em contrato.
CREATE POLICY escalation_rules_cria ON public.escalation_rules
    FOR INSERT TO authenticated
    WITH CHECK (clinic_id IN (SELECT public.current_clinic_ids()));

CREATE POLICY escalation_rules_edita ON public.escalation_rules
    FOR UPDATE TO authenticated
    USING (clinic_id IN (SELECT public.current_clinic_ids()))
    WITH CHECK (clinic_id IN (SELECT public.current_clinic_ids()));

CREATE POLICY escalation_rules_remove ON public.escalation_rules
    FOR DELETE TO authenticated
    USING (clinic_id IN (SELECT public.current_clinic_ids()));

-- 7. HISTÓRICO E ALERTAS -----------------------------------------------------
-- O histórico de transições é append-only pelo navegador: nem a clínica
-- reescreve o que a IA fez. Quem grava é a função advance_conversation_stage.
ALTER TABLE public.conversation_transitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY conversation_transitions_le ON public.conversation_transitions
    FOR SELECT TO authenticated
    USING (clinic_id IN (SELECT public.current_clinic_ids()));

-- Alerta o painel lê e marca como visto; criar é do servidor (open_handoff).
ALTER TABLE public.handoff_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY handoff_alerts_le ON public.handoff_alerts
    FOR SELECT TO authenticated
    USING (clinic_id IN (SELECT public.current_clinic_ids()));

CREATE POLICY handoff_alerts_marca_visto ON public.handoff_alerts
    FOR UPDATE TO authenticated
    USING (clinic_id IN (SELECT public.current_clinic_ids()))
    WITH CHECK (clinic_id IN (SELECT public.current_clinic_ids()));

-- 8. GRAFO DE TRANSIÇÕES -----------------------------------------------------
-- Leitura para todo usuário logado: o painel desenha o funil a partir dele.
-- Escrita é decisão de arquitetura, não de cliente — sem política de INSERT.
ALTER TABLE public.stage_transition_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY stage_transition_rules_le ON public.stage_transition_rules
    FOR SELECT TO authenticated
    USING (true);

-- 9. ASSINATURA, ONBOARDING E E-MAIL -----------------------------------------
-- Assinatura é só leitura no navegador. Se a clínica pudesse escrever, ela se
-- daria status 'active' sozinha e o controle de plano viraria decoração.
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY subscriptions_le ON public.subscriptions
    FOR SELECT TO authenticated
    USING (clinic_id IN (SELECT public.current_clinic_ids()));

-- Token de onboarding não tem política nenhuma: só o servidor toca nele.
ALTER TABLE public.onboarding_tokens ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY email_logs_le ON public.email_logs
    FOR SELECT TO authenticated
    USING (clinic_id IN (SELECT public.current_clinic_ids()));
