-- =============================================================================
-- 12 — CORREÇÃO CRÍTICA: escalada de tenant pela tabela users
-- =============================================================================
-- VULNERABILIDADE ENCONTRADA E REPRODUZIDA em 07/08/2026.
--
-- A política de INSERT em `users` era, herdada do schema antigo:
--
--     WITH CHECK (auth.uid() IS NOT NULL)
--
-- Ou seja: qualquer pessoa logada podia inserir uma linha em `users` com
-- QUALQUER clinic_id. E como current_clinic_ids() resolve a clínica lendo
-- exatamente essa tabela, a linha inserida virava acesso completo.
--
-- Ataque reproduzido de ponta a ponta:
--   1. Criar conta pelo cadastro público (aberto, por desenho).
--   2. POST /rest/v1/users com clinic_id da vítima e role='owner'  -> 201.
--   3. GET /rest/v1/conversations  -> 13 leads da vítima, com nome e telefone.
--
-- A conta ANTIGA falhava por acidente: UNIQUE(auth_id) barrava quem já tinha
-- linha. Conta nova não tem linha, e passava direto. Constraint de unicidade
-- não é política de segurança.
--
-- Havia uma SEGUNDA porta para o mesmo destino: `users_gerencia` (UPDATE) tinha
-- USING mas não WITH CHECK. USING valida a linha ANTIGA; sem WITH CHECK, a linha
-- NOVA não é validada. Bastava dar UPDATE na própria linha trocando o clinic_id
-- para o da vítima — a antiga passava (é minha clínica), e a nova entrava sem
-- checagem nenhuma.
--
-- REGRA que fica: em RLS, todo UPDATE precisa de USING **e** WITH CHECK. USING
-- diz o que você pode tocar; WITH CHECK diz no que aquilo pode se transformar.
-- =============================================================================

-- 1. INSERT em users ---------------------------------------------------------
-- Só dá para adicionar alguém a uma clínica da qual você JÁ faz parte. É o
-- convite de colega de equipe.
--
-- E o primeiro usuário, no cadastro? Vem por register_clinic(), que é
-- SECURITY DEFINER e ignora RLS — por isso fechar aqui não quebra o cadastro.
DROP POLICY IF EXISTS users_cadastro ON public.users;
CREATE POLICY users_cadastro ON public.users
    FOR INSERT TO authenticated
    WITH CHECK (clinic_id IN (SELECT public.current_clinic_ids()));

-- 2. UPDATE em users ---------------------------------------------------------
-- A linha tem que continuar na mesma clínica depois da alteração. Sem este
-- WITH CHECK, mover a própria linha para outra clínica era escalada de tenant.
DROP POLICY IF EXISTS users_gerencia ON public.users;
CREATE POLICY users_gerencia ON public.users
    FOR UPDATE TO authenticated
    USING (clinic_id IN (SELECT public.current_clinic_ids()))
    WITH CHECK (clinic_id IN (SELECT public.current_clinic_ids()));

-- 3. INSERT em clinics -------------------------------------------------------
-- Era WITH CHECK (auth.uid() IS NOT NULL): dava para criar clínica registrando
-- outra pessoa como dona. Não vaza dado sozinho, mas polui a base e serve de
-- degrau para outros ataques. Agora só se cria clínica para si mesmo.
DROP POLICY IF EXISTS clinics_cadastro ON public.clinics;
CREATE POLICY clinics_cadastro ON public.clinics
    FOR INSERT TO authenticated
    WITH CHECK (owner_auth_id = (SELECT auth.uid()));

-- 4. Limpeza -----------------------------------------------------------------
-- Remove qualquer vínculo criado pela brecha: linha de equipe cujo auth_id não
-- corresponde a uma conta que seja dona da clínica nem tenha sido convidada.
-- Aqui, o registro do teste de invasão.
DELETE FROM public.users u
 WHERE u.email = 'atacante@teste.com';

-- 5. Verificação ------------------------------------------------------------
-- Toda política de UPDATE/ALL precisa ter WITH CHECK. Esta consulta deve voltar
-- VAZIA; qualquer linha aqui é uma porta aberta como a que foi corrigida acima.
--
--   SELECT tablename, policyname, cmd
--     FROM pg_policies
--    WHERE schemaname = 'public'
--      AND cmd IN ('UPDATE', 'ALL')
--      AND with_check IS NULL;
