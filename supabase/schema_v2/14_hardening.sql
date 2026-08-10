-- =============================================================================
-- 14 — HARDENING: search_path fixo na última função que faltava
-- =============================================================================
-- O Security Advisor do Supabase aponta "Function Search Path Mutable" para
-- qualquer função sem search_path fixado. Todas as demais já nascem com
-- `SET search_path = ''`; agent_for_stage ficou de fora.
--
-- Neste caso específico o risco real é baixo: o corpo é um CASE sobre um ENUM e
-- todos os literais já são qualificados (`'sdr'::public.agent_role`), então não
-- há nome para sequestrar. Mas função sem search_path fixo é o tipo de exceção
-- que ninguém lembra por que existe seis meses depois — e aí vira precedente
-- para a próxima, que talvez leia tabela.
--
-- CUIDADO AO MEXER: existe um índice de expressão em cima dela
-- (idx_conversations_agente). CREATE OR REPLACE preserva o índice porque não
-- muda assinatura nem volatilidade; DROP + CREATE exigiria recriar o índice.
-- Por isso aqui é REPLACE, e a verificação no fim confirma que ele continua de pé.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.agent_for_stage(p_stage public.conversation_stage)
RETURNS public.agent_role
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT CASE p_stage
        WHEN 'novo'              THEN 'sdr'::public.agent_role
        WHEN 'qualificando'      THEN 'sdr'::public.agent_role
        WHEN 'qualificado'       THEN 'agendador'::public.agent_role
        WHEN 'agendando'         THEN 'agendador'::public.agent_role
        WHEN 'aguardando_humano' THEN 'handoff'::public.agent_role
        -- agendado/perdido/encerrado: nenhum agente conduz fluxo ativo. Quem
        -- pode tocar a conversa nesses estados é o Follow-up, e ele é gatilho,
        -- não agente residente — por isso NULL, e não 'follow_up'.
        ELSE NULL
    END;
$$;
