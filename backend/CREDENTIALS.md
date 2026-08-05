# Como Obter as Credenciais

## 1. Supabase (https://supabase.com)

### Passo a passo:
1. Acesse https://supabase.com e faça login
2. Clique em "New Project"
3. Preencha:
   - **Name**: axos-hub (ou nome da sua clínica)
   - **Database Password**: `SuaSenhaForte123!` (guarde esta senha!)
   - **Region**: escolha a mais próxima (ex: South America - Brazil)
4. Aguarde a criação (~2 minutos)

### Pegar as chaves:
1. No dashboard do projeto, clique em **Settings** (engrenagem)
2. Vá em **API**
3. Copie:
   ```
   Project URL: https://xxx.supabase.co
   API Keys > project API key (service_role): eyJhbGciOi...
   API Keys > anon/public: eyJhbGciOi...
   ```

### Connection String:
1. Em **Settings** > **Database**
2. Role até **Connection string**
3. Escolha **URI**
4. Copie e cole no `.env` (substitua `[YOUR-PASSWORD]` pela sua senha)

---

## 2. Evolution API (WhatsApp)

### Instalando localmente:
```bash
docker run -d --name evolution-api \
  -p 8080:8080 \
  -v evolution_data:/evolution/data \
  atendai/evolution-api:latest
```

### API Key:
A Evolution API gera uma API Key padrão ou você pode definir no `.env` dela:
```
EVOLUTION_API_KEY=sua-api-key-aqui
```

### Conectar WhatsApp:
1. Acesse http://localhost:8080
2. Vá em **Authentication** > **Create Instance**
3. Nome: `axos-clinic`
4. Escaneie QRCode com seu WhatsApp
5. Use a API Key gerada

---

## 3. Redis (Opcional)

### Usando Redis local (desenvolvimento):
```bash
# Windows (Docker)
docker run -d -p 6379:6379 redis:7

# O .env já está configurado: redis://localhost:6379/0
```

### Redis Cloud (produção):
1. Acesse https://redis.com/try-free
2. Crie conta gratuita (30MB)
3. Copie a connection string

---

## 4. SSL/HTTPS (Produção)

### Gerar certificado auto-assinado:
```bash
mkdir -p backend/certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout backend/certs/key.pem \
  -out backend/certs/cert.pem \
  -subj "/C=BR/ST=SP/L=SaoPaulo/O=AxosHub/CN=localhost"
```

### Para produção (Let's Encrypt):
```bash
# Instale certbot
sudo apt install certbot

# Gere certificado
sudo certbot certonly --standalone -d seu-dominio.com
```

---

## 5. Testar Conexão

### Supabase:
```bash
# Instale o CLI
npm install -g supabase

# Login
supabase login

# Testar conexão
psql "sua-connection-string" -c "SELECT current_database();"
```

### Redis:
```bash
redis-cli ping
# Deve retornar: PONG
```

### Backend:
```bash
cd backend
docker-compose up -d
curl http://localhost:8000/health
```

---

## Exemplo de `.env` preenchido:

```env
SUPABASE_URL=https://abc123xyz.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ...
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
DATABASE_URL=postgresql://postgres:MinhaSenha123@db.abc123xyz.supabase.co:5432/postgres
REDIS_URL=redis://localhost:6379/0
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=minha-api-key-secreta
USE_SSL=false
ENVIRONMENT=development
```
