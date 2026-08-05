# 🧠 Deploy do BACKEND no EasyPanel — Guia Definitivo

> **Situação:** o frontend (site) está no ar em `solaraconnect.online`, mas o
> **backend (FastAPI)** — que roda a Solara IA, o webhook do WhatsApp e os
> pagamentos — **ainda não foi deployado**. Sem ele, nada do "cérebro" funciona.
> Este guia resolve isso.

---

## 1. Criar o serviço do BACKEND no EasyPanel

1. No EasyPanel, dentro do projeto **App-Solara-Connect-Oficial**, clique em **+ Service → App**
2. Nome do serviço: `backend` (ou `solara-api`)
3. **Source:**
   - Repositório: `github.com/Speedpro04/SOLARA-OFICIAL`
   - Branch: `main`
   - **Build Path / Root:** `/backend`  ← importante! o backend está nessa subpasta
4. **Build:** tipo **Dockerfile** (o `backend/Dockerfile` já existe e está pronto)
5. **Porta exposta:** `8000`
6. **Comando (se pedir):** `uvicorn app.main:app --host 0.0.0.0 --port 8000`
   > ⚠️ Use **`app.main:app`** (o backend modular), NÃO o `main.py` da raiz (legado).

## 2. Variáveis de ambiente do backend

Cole as mesmas chaves do `.env` (já preparado anteriormente). Essenciais p/ o cérebro:
```
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-5-mini
OPENAI_BASE_URL=https://api.openai.com/v1
SUPABASE_URL=https://mvqkelauwscxdwnzevtz.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_KEY=...            (use a service role aqui também, p/ o cliente interno)
EVOLUTION_API_URL=https://evoapi.axoshub.com
EVOLUTION_API_KEY=84B76E311EBA-4CBE-BFCE-C8592DA4161F
EVOLUTION_INSTANCE=axos-evoapi
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
FRONTEND_URL=https://app.solaraconnect.online
BACKEND_PUBLIC_URL=https://<DOMINIO-DO-BACKEND>   (preenche após o passo 3)
```

## 3. Definir o domínio do backend

No serviço backend → aba **Domains** → adicione um domínio, por exemplo:
`api.solaraconnect.online` (ou aceite o `*.easypanel.host` que ele gera).

**Anote essa URL** — chame de `BACKEND_URL`. Tudo aponta pra ela a partir de agora.

## 4. Religar frontend e webhook ao backend

Depois que o backend estiver no ar (teste: `BACKEND_URL/health` deve retornar JSON):

**a) Frontend** — no serviço do frontend, ajuste a variável:
```
VITE_API_URL=https://<BACKEND_URL>
```
e faça **rebuild** do frontend.

**b) Webhook da Evolution** — apontar para o backend. Pode ser feito via API:
```
POST https://evoapi.axoshub.com/webhook/set/axos-evoapi
Header: apikey: 429683C4C977415CAAFCCE10F7D57E11
Body: {
  "enabled": true,
  "url": "https://<BACKEND_URL>/api/webhooks/evolution",
  "webhookByEvents": false,
  "events": ["MESSAGES_UPSERT"]
}
```
> Assim que me passar o `BACKEND_URL`, eu reconfiguro o webhook por aqui.

## 5. Corrigir o schema da tabela `messages` (SQL)

A tabela `messages` não tem as colunas `clinic_id` e `metadata` que o webhook usa.
Cole no SQL Editor do Supabase:
```sql
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS clinic_id UUID;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS metadata JSONB;
CREATE INDEX IF NOT EXISTS idx_messages_clinic ON public.messages (clinic_id);
CREATE INDEX IF NOT EXISTS idx_messages_patient ON public.messages (patient_id);
```

---

## ✅ Checklist final ("redondo e liso")

- [ ] Backend deployado no EasyPanel (passo 1-3) → `BACKEND_URL/health` retorna JSON
- [ ] `VITE_API_URL` do frontend = `BACKEND_URL` + rebuild
- [ ] Webhook da Evolution apontando para `BACKEND_URL/api/webhooks/evolution`
- [ ] SQL da `messages` rodado
- [ ] Teste: mandar WhatsApp de outro número → Solara responde

> Quando o backend estiver no ar e você me passar a URL, eu finalizo os
> passos 4 e 5 e testo a Solara respondendo de ponta a ponta.
