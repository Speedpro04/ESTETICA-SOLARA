-- =============================================================================
-- RESET TOTAL — apaga o schema public inteiro
-- =============================================================================
-- DESTRUTIVO E IRREVERSÍVEL. Apaga clinics, users, patients, appointments,
-- subscriptions, messages, conversations, briefing — tudo, com os dados dentro.
--
-- Antes de rodar, confira:
--
--   select
--     (select count(*) from subscriptions where status in ('active','trialing','past_due')) as assinaturas_vivas,
--     (select count(*) from auth.users)  as contas_auth,
--     (select count(*) from clinics)     as clinicas,
--     (select count(*) from messages)    as mensagens;
--
-- Assinatura viva no Stripe NÃO é cancelada por este script. Dropar
-- `subscriptions` só apaga o vínculo local: a cobrança continua rodando lá e
-- você perde o rastro de quem é quem. Cancele no Stripe primeiro, ou guarde os
-- stripe_subscription_id em outro lugar.
--
-- Depois deste arquivo, rode na ordem: 01_schema.sql, 02_rls.sql, 03_seed.sql.
-- =============================================================================

BEGIN;

-- Derruba tudo que vive no public: tabelas, views, tipos, funções e triggers.
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;

-- Restaura as permissões que o Supabase espera encontrar no schema. Sem isto,
-- PostgREST responde 500 e o painel some — o schema existe, mas anon e
-- authenticated não enxergam nada dentro dele.
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL   ON SCHEMA public TO postgres, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;

COMMIT;

-- =============================================================================
-- OPCIONAL — contas de login (auth.users)
-- =============================================================================
-- O bloco acima NÃO toca em auth.users: as contas continuam existindo e
-- conseguem logar, só que caem num painel sem clínica nenhuma (a linha em
-- public.users foi embora junto com o schema).
--
-- Duas saídas:
--   (a) apagar as contas também — descomente abaixo e recadastre todo mundo;
--   (b) manter as contas e religar cada uma a uma clínica nova depois,
--       preenchendo public.users.auth_id com o id que já existe em auth.users.
--
-- Escolha (a) só se ninguém de fora da sua equipe tem login hoje.

-- DELETE FROM auth.users;
