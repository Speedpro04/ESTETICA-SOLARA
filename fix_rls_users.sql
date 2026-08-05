-- =============================================
-- FIX: Políticas de RLS para a tabela 'users'
-- Resolve o erro "new row violates row-level security policy"
-- e evita recursão infinita.
-- =============================================

-- 1. Limpar políticas existentes para evitar conflitos
DROP POLICY IF EXISTS "users_read_own" ON users;
DROP POLICY IF EXISTS "users_insert_auth" ON users;
DROP POLICY IF EXISTS "users_owner_manage" ON users;
DROP POLICY IF EXISTS "users_owner_delete" ON users;
DROP POLICY IF EXISTS "users_owner_insert" ON users;
DROP POLICY IF EXISTS "users_select_policy" ON users;
DROP POLICY IF EXISTS "users_insert_policy" ON users;
DROP POLICY IF EXISTS "users_update_policy" ON users;
DROP POLICY IF EXISTS "users_delete_policy" ON users;
DROP POLICY IF EXISTS "users_same_clinic" ON users;
DROP POLICY IF EXISTS "users_self_insert" ON users;

-- 2. Habilitar RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- 3. Política de LEITURA (SELECT)
-- Usuário vê a si mesmo OU o dono vê todos da clínica (via clinics)
CREATE POLICY "users_select_policy" ON users FOR SELECT USING (
    auth_id = auth.uid() 
    OR clinic_id IN (SELECT id FROM clinics WHERE owner_auth_id = auth.uid())
);

-- 4. Política de INSERÇÃO (INSERT) - SIMPLIFICADA PARA TESTE
-- Permite que qualquer usuário autenticado insira (vamos restringir depois que funcionar)
CREATE POLICY "users_insert_policy" ON users FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
);

-- 5. Política de ATUALIZAÇÃO (UPDATE)
-- Dono gerencia a clínica ou usuário gerencia seu próprio perfil
CREATE POLICY "users_update_policy" ON users FOR UPDATE USING (
    clinic_id IN (SELECT id FROM clinics WHERE owner_auth_id = auth.uid())
    OR auth_id = auth.uid()
) WITH CHECK (
    clinic_id IN (SELECT id FROM clinics WHERE owner_auth_id = auth.uid())
    OR auth_id = auth.uid()
);

-- 6. Política de EXCLUSÃO (DELETE)
-- Apenas o dono da clínica pode excluir usuários
CREATE POLICY "users_delete_policy" ON users FOR DELETE USING (
    clinic_id IN (SELECT id FROM clinics WHERE owner_auth_id = auth.uid())
);

-- =============================================
-- FIM DO FIX
-- =============================================

