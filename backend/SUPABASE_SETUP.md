# Como Configurar Supabase

## Passo 1: Criar Projeto

1. Acesse https://supabase.com
2. Clique em **"New Project"**
3. Preencha:
   - **Name**: `axos-hub`
   - **Database Password**: `SuaSenhaForte123!` (GUARDE ISSO!)
   - **Region**: escolha a mais próxima (ex: South America - Brazil)
4. Clique em **"Create new project"**
5. Aguarde ~2 minutos

## Passo 2: Rodar o SQL

1. No dashboard, clique em **"SQL Editor"** (menu lateral)
2. Clique em **"New query"**
3. Copie TODO conteúdo do arquivo `supabase.sql`
4. Cole no editor
5. Clique em **"Run"**
6. Confirme "OK" se aparecer sucesso

## Passo 3: Pegar Credenciais

1. Clique em **Settings** (engrenagem)
2. Vá em **API**
3. Copie:
   ```
   Project URL: https://xxx.supabase.co
   API Keys > project API key (service_role): eyJhbGciOi...
   API Keys > anon/public: eyJhbGciOi...
   ```

## Passo 4: Connection String

1. Em **Settings** > **Database**
2. Role até **Connection string**
3. Escolha **URI**
4. Copie e substitua `[YOUR-PASSWORD]` pela sua senha

## Passo 5: Atualizar .env

Edite `backend/.env` com:

```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
DATABASE_URL=postgresql://postgres:SuaSenha123@db.xxx.supabase.co:5432/postgres
```

## Passo 6: Testar

```bash
cd backend
docker-compose up -d
curl http://localhost:8000/health
```

Se retornar `{"status": "healthy"}`, está pronto!
