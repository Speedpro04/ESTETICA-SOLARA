# 🌅 SOLARA CONNECT — Guia do Projeto

> Mapa de orientação do sistema para retomar o desenvolvimento rapidamente.
> Última atualização: 2026-05-31

---

## 1. Visão Geral

**Solara Connect** é um SaaS B2B para clínicas médicas: atendimento por IA (WhatsApp),
gestão de assinaturas (Stripe), marketplace de parceiros e dashboard administrativo.

**Dono:** Henrique · **Org:** Axos Hub

---

## 2. Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Animação | Framer Motion |
| Backend | FastAPI (Python) |
| Banco / Auth | Supabase (PostgreSQL) |
| Pagamentos | Stripe (Payment Links) |
| WhatsApp | Evolution API |
| IA / LLM | **OpenAI `gpt-5-mini`** |
| Filas | Celery + Redis |

---

## 3. Estrutura de Pastas

```
SOLARA-CONNECT-OFICIAL/
├── src/                      # Frontend React
│   ├── App.tsx               # Roteamento de views (landing→login→register→checkout→dashboard)
│   ├── LandingPage.tsx       # Home + tabela de planos (linhas 589-592)
│   ├── CheckoutPage.tsx      # Redireciona p/ Stripe Payment Link
│   ├── Dashboard.tsx         # Painel da clínica
│   ├── PartnersPage.tsx      # Marketplace de parceiros (94 hardcoded)
│   ├── RegisterPage.tsx      # Cadastro de clínica
│   ├── LoginPage.tsx         # Login
│   └── lib/
│       ├── supabase.ts       # Cliente Supabase
│       ├── auth.ts           # Sessão + hasActiveSubscription
│       └── partnersDataStatic.ts
├── backend/app/
│   ├── main.py               # Entrypoint FastAPI
│   ├── config.py             # Settings (lê .env)
│   ├── api/
│   │   ├── ai.py             # POST /api/ai/chat
│   │   ├── stripe.py         # Checkout + webhook
│   │   ├── whatsapp.py / evolution.py
│   └── services/
│       ├── ai_service.py     # Cliente OpenAI + prompt da Solara IA
│       └── supabase_service.py
├── .env                      # Frontend (VITE_*) — NÃO commitado
└── backend/app/.env          # Backend (segredos) — NÃO commitado
```

---

## 4. Integrações — Estado Atual

### 4.1 IA / LLM ✅ (OpenAI)
- **Modelo:** `gpt-5-mini` (configurável em `OPENAI_MODEL`)
- **Arquivo:** `backend/app/services/ai_service.py`
- **Config:** `backend/app/config.py` → `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`
- Prompt de sistema "Solara IA" — gestora de atendimento (premium, comercial, acolhedora)
- Histórico limitado às últimas 12 mensagens · temperature 0.3 · max_tokens 1024

### 4.2 Pagamentos ✅ (Stripe Payment Links)
- **4 planos** mapeados por preço em `src/CheckoutPage.tsx` (`STRIPE_PAYMENT_LINKS`):

| Plano | Especialistas | Preço/mês | Env var |
|---|---|---|---|
| Básico | até 2 | R$197 | `VITE_STRIPE_LINK_BASICO` |
| Crescimento | 3 a 5 | R$397 | `VITE_STRIPE_LINK_CRESCIMENTO` |
| Avançado | 6 a 9 | R$597 | `VITE_STRIPE_LINK_AVANCADO` |
| Enterprise | 10+ | R$897 | `VITE_STRIPE_LINK_ENTERPRISE` |

- **Fluxo:** checkout redireciona ao Payment Link com `client_reference_id=clinic_id`
  e `prefilled_email=user_email`.
- **Webhook** (`backend/app/api/stripe.py`): `checkout.session.completed` lê
  `client_reference_id` → ativa assinatura da clínica no Supabase.

### 4.3 WhatsApp (Evolution API)
- URL: `https://evoapi.axoshub.com` · configurado em `backend/app/.env`

---

## 5. Fluxo do Usuário

```
Landing (escolhe plano) → Register (cria clínica) → Checkout (Stripe Payment Link)
   → [paga] → Webhook ativa assinatura → Login → Dashboard
```
- `App.tsx` verifica `hasActiveSubscription()` antes de liberar o dashboard.
- **Dev Pass:** código de manutenção (`VITE_DEV_PASS_CODE`) entra sem pagar.

---

## 6. ⚠️ Pendências / Pontos de Atenção

- [ ] **Confirmar nome do modelo** `gpt-5-mini` na conta OpenAI (ajustar `OPENAI_MODEL` se diferente)
- [ ] **Configurar success_url** dos Payment Links no painel do Stripe (voltar ao app após pagar)
- [ ] **Webhook do Stripe** precisa do endpoint público registrado no painel Stripe
- [ ] **Limpeza:** vários SQLs duplicados em `backend/` (supabase_*.sql) — consolidar
- [ ] **Bundle grande** (1.1 MB) — considerar code-splitting (lazy load do Dashboard)
- [ ] **94 parceiros hardcoded** no frontend — migrar para tabela Supabase quando escalar
- [ ] Rotacionar chaves expostas em commits antigos (Stripe/OpenAI/Evolution)

---

## 7. Comandos Úteis

```bash
# Frontend
npm install
npm run dev          # http://localhost:5173
npm run build        # valida TS + gera dist/

# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload   # http://localhost:8000
```

---

## 8. Variáveis de Ambiente (referência)

**`.env` (frontend):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`VITE_STRIPE_LINK_*`, `VITE_API_URL`, `VITE_ENABLE_DEV_PASS`, `VITE_DEV_PASS_CODE`

**`backend/app/.env`:** `OPENAI_API_KEY`, `OPENAI_MODEL`, `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `EVOLUTION_API_*`

---

## 9. Deploy — EasyPanel (Produção)

O deploy é feito via **EasyPanel**. Ao publicar, atualizar as variáveis de ambiente lá.

### Backend (serviço Python) — ADICIONAR
```
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-5-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```
**REMOVER (NVIDIA antiga):** `VITE_AI_API_KEY`, `VITE_AI_BASE_URL`, `VITE_AI_MODEL`

### Frontend (build Vite) — ADICIONAR
```
VITE_STRIPE_LINK_BASICO=https://buy.stripe.com/8x28wO2QC0IQa2ecv89IQ04
VITE_STRIPE_LINK_CRESCIMENTO=https://buy.stripe.com/cNibJ03UGdvCb6i1Qu9IQ00
VITE_STRIPE_LINK_AVANCADO=https://buy.stripe.com/8x2eVcfDo1MU1vI2Uy9IQ01
VITE_STRIPE_LINK_ENTERPRISE=https://buy.stripe.com/9B628q4YKgHO0rE7aO9IQ02
```
**REMOVER (price IDs antigos):** `VITE_STRIPE_PRICE_BASICO/CRESCIMENTO/AVANCADO/ENTERPRISE`

> Após atualizar as variáveis, fazer **rebuild** do serviço no EasyPanel
> (o Vite injeta as `VITE_*` em build time, não em runtime).
