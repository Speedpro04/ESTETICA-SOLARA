-- =============================================================================
-- Corrige recursão infinita no RLS (erro 42P17)
-- =============================================================================
-- O desenho anterior fazia as políticas se chamarem em círculo:
--
--   ler clinics  -> política consulta users
--   ler users    -> política consulta clinics
--   ler clinics  -> ... (Postgres aborta com "infinite recursion detected")
--
-- Resultado prático: qualquer SELECT em clinics, users, patients ou
-- subscriptions falhava para usuário autenticado. O cadastro funcionava (a
-- função register_clinic é SECURITY DEFINER e ignora RLS), mas o painel abria
-- vazio logo depois — o pior tipo de falha, porque parece perda de dados.
--
-- A saída é o padrão do Supabase: uma função SECURITY DEFINER que resolve
-- "quais clínicas são deste usuário" fora do alcance do RLS. As políticas
-- passam a consultar a função, e não as tabelas umas das outras.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.current_clinic_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    -- Clínicas onde o usuário é membro da equipe...
    SELECT clinic_id FROM users WHERE auth_id = auth.uid() AND clinic_id IS NOT NULL
    UNION
    -- ...e as que ele é dono (cobre o intervalo entre criar a clínica e o
    -- registro em users existir).
    SELECT id FROM clinics WHERE owner_auth_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.current_clinic_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_clinic_ids() TO anon;

-- CLINICS --------------------------------------------------------------------
DROP POLICY IF EXISTS "clinics_owner_all" ON clinics;
DROP POLICY IF EXISTS "clinics_member_read" ON clinics;
DROP POLICY IF EXISTS "clinics_insert_authenticated" ON clinics;

-- Dono manda na própria clínica. Compara duas colunas, não lê outra tabela:
-- não há como recursar.
CREATE POLICY "clinics_owner_all" ON clinics FOR ALL
    USING (owner_auth_id = auth.uid())
    WITH CHECK (owner_auth_id = auth.uid());

CREATE POLICY "clinics_member_read" ON clinics FOR SELECT
    USING (id IN (SELECT public.current_clinic_ids()));

CREATE POLICY "clinics_insert_authenticated" ON clinics FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- USERS ----------------------------------------------------------------------
DROP POLICY IF EXISTS "users_read_own" ON users;
DROP POLICY IF EXISTS "users_insert_auth" ON users;
DROP POLICY IF EXISTS "users_owner_manage" ON users;
DROP POLICY IF EXISTS "users_owner_delete" ON users;

CREATE POLICY "users_read_own" ON users FOR SELECT
    USING (auth_id = auth.uid() OR clinic_id IN (SELECT public.current_clinic_ids()));

CREATE POLICY "users_insert_auth" ON users FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "users_owner_manage" ON users FOR UPDATE
    USING (clinic_id IN (SELECT public.current_clinic_ids()));

CREATE POLICY "users_owner_delete" ON users FOR DELETE
    USING (clinic_id IN (SELECT public.current_clinic_ids()));

-- DEMAIS TABELAS POR CLÍNICA -------------------------------------------------
DROP POLICY IF EXISTS "patients_clinic_access" ON patients;
CREATE POLICY "patients_clinic_access" ON patients FOR ALL
    USING (clinic_id IN (SELECT public.current_clinic_ids()))
    WITH CHECK (clinic_id IN (SELECT public.current_clinic_ids()));

DROP POLICY IF EXISTS "appointments_clinic_access" ON appointments;
CREATE POLICY "appointments_clinic_access" ON appointments FOR ALL
    USING (clinic_id IN (SELECT public.current_clinic_ids()))
    WITH CHECK (clinic_id IN (SELECT public.current_clinic_ids()));

DROP POLICY IF EXISTS "messages_clinic_access" ON messages;
CREATE POLICY "messages_clinic_access" ON messages FOR ALL
    USING (clinic_id IN (SELECT public.current_clinic_ids()))
    WITH CHECK (clinic_id IN (SELECT public.current_clinic_ids()));

DROP POLICY IF EXISTS "clinic_knowledge_owner_access" ON clinic_knowledge;
CREATE POLICY "clinic_knowledge_owner_access" ON clinic_knowledge FOR ALL
    USING (clinic_id IN (SELECT public.current_clinic_ids()))
    WITH CHECK (clinic_id IN (SELECT public.current_clinic_ids()));

DROP POLICY IF EXISTS "subscriptions_clinic_owner" ON subscriptions;
DROP POLICY IF EXISTS "subscriptions_insert_auth" ON subscriptions;
CREATE POLICY "subscriptions_clinic_read" ON subscriptions FOR SELECT
    USING (clinic_id IN (SELECT public.current_clinic_ids()));
-- Escrita de assinatura é do servidor (webhook do Stripe com service role).
-- O navegador só lê: senão a própria clínica poderia se dar 'active'.
CREATE POLICY "subscriptions_insert_auth" ON subscriptions FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "email_logs_clinic_owner" ON email_logs;
DROP POLICY IF EXISTS "email_logs_insert_auth" ON email_logs;
CREATE POLICY "email_logs_clinic_read" ON email_logs FOR SELECT
    USING (clinic_id IN (SELECT public.current_clinic_ids()));
CREATE POLICY "email_logs_insert_auth" ON email_logs FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);
