# PRD — Solara Medical Connect
### Product Requirements Document
**Versão:** 2.0
**Data:** 31/05/2026
**Autor:** Axos Hub
**E-mail operacional:** axoshub.solara@gmail.com
**Status:** ✅ Em produção (deploy via EasyPanel)

---

## 1. Visão Geral do Produto

O **Solara Medical Connect** é uma plataforma SaaS de gestão e atendimento digital para **clínicas médicas, consultórios e hospitais**. O sistema automatiza o fluxo desde a captação e atendimento do paciente até a conclusão da consulta, com uma **IA gestora (Solara)** no centro do atendimento, agendamento inteligente e um marketplace de parceiros monetizado.

### 1.1 Proposta de Valor
- **Para clínicas:** atendimento 24/7 via IA, redução de tempo de espera, gestão visual de atendimentos, agendamento inteligente e uma fonte extra de valor (marketplace de fornecedores).
- **Para médicos:** prontuário unificado, controle de salas, menos tempo perdido com recados.
- **Para pacientes:** atendimento imediato via WhatsApp, sem filas, com acolhimento e clareza.

### 1.2 Diferencial Central — A Solara IA
A **Solara** é o cérebro do sistema: uma gestora virtual de atendimento que acolhe, agenda, confirma, remarca, tira dúvidas e converte leads — com **dados reais da clínica** e **sem inventar informações**. É o que separa o Solara de um "sistema bonito" de uma plataforma inteligente.

### 1.3 Público-Alvo
| Segmento | Perfil |
|----------|--------|
| Primário | Clínicas médicas/odontológicas de 2 a 20 especialistas |
| Secundário | Consultórios individuais em expansão |
| Terciário | Redes e franquias de saúde |

---

## 2. Arquitetura Técnica

### 2.1 Stack de Tecnologia
| Camada | Tecnologia |
|--------|-----------|
| **Frontend** | React 18 + TypeScript + Vite |
| **Animações** | Framer Motion |
| **Ícones** | Lucide React |
| **Estilização** | CSS Vanilla (Design System próprio) |
| **Backend** | FastAPI (Python) + Celery + Redis |
| **IA / LLM** | **OpenAI `gpt-5-mini`** (reasoning_effort low) |
| **WhatsApp** | Evolution API |
| **Autenticação** | Supabase Auth (JWT) |
| **Banco de Dados** | PostgreSQL (Supabase) |
| **Pagamentos** | Stripe (Payment Links + Webhooks) |
| **E-mail** | SMTP Gmail (axoshub.solara@gmail.com) |
| **Hospedagem** | EasyPanel (frontend + backend) + Supabase |

### 2.2 Credenciais do Projeto
| Serviço | Referência |
|---------|-----------|
| Supabase Project ID | `mvqkelauwscxdwnzevtz` ("App-Solara-Connect-Oficial") |
| App (frontend) | `https://app.solaraconnect.online` |
| API (backend) | `https://solaraconnect.online` |
| Evolution API | `https://evoapi.axoshub.com` |
| Stripe | Modo Test (Payment Links ativos) |
| Repositório | `github.com/Speedpro04/SOLARA-OFICIAL` |

> 🔒 Segredos (OpenAI, Stripe, Supabase Service Role) ficam **só no EasyPanel** — nunca no Git.

### 2.3 Estrutura de Arquivos
```
src/                              # Frontend React
├── lib/{supabase.ts, auth.ts}
├── App.tsx                        # Router (state-based) + lazy load
├── LandingPage.tsx                # Página de vendas + planos
├── LoginPage / RegisterPage
├── CheckoutPage.tsx               # Redireciona ao Stripe Payment Link
├── Dashboard.tsx                  # Painel + chat da Solara IA
├── PartnersPage.tsx               # Marketplace de parceiros
├── PartnersAnalytics.tsx          # Relatório de cliques (monetização)
└── Logo.tsx

backend/app/                       # Backend FastAPI
├── main.py / config.py
├── api/{ai.py, stripe.py, whatsapp.py, evolution.py}
├── services/{ai_service.py, supabase_service.py}
├── tasks.py / celery_app.py       # Filas assíncronas
└── solara_agent.py

SOLARA_PARTNERS_SETUP.sql          # Tabelas de cliques (monetização)
SOLARA_PROJECT_GUIDE.md            # Guia técnico do projeto
RELATORIO-MELHORIAS-SOLARA.md      # Changelog de evolução
```

---

## 3. Solara IA — Gestora de Atendimento (cérebro do sistema)

### 3.1 Papel
Gestora virtual que recebe, acolhe, organiza, argumenta e conduz o próximo passo — vendendo valor sem pressionar e convertendo interesse em agendamento.

### 3.2 Capacidades
- Agendamentos, remarcações, confirmações e cancelamentos
- Coleta estruturada de dados (nome, telefone, especialidade, data, particular/convênio)
- Qualificação e conversão de novos pacientes
- Escalonamento de urgência clínica e transferência para humano

### 3.3 Contexto Dinâmico
A cada conversa, o backend injeta no prompt os **dados reais da clínica** (nome, telefone, e-mail, endereço, profissionais), carregados via `clinic_id` do Supabase.

### 3.4 Guardrails (confiança)
- **Nunca** inventa preço, horário, disponibilidade, profissional, convênio ou endereço.
- Usa apenas os dados injetados; sem o dado → pergunta ou encaminha à equipe.
- Não dá diagnóstico, prescrição ou interpretação de exame.

### 3.5 Configuração técnica
- Modelo: `gpt-5-mini` · `temperature 0.4` · `max_tokens 1024` · `reasoning_effort: low`
- Prompt-mestre: `backend/app/services/ai_service.py`
- Playbook: `SOLARA_AI_PLAYBOOK.md`
- Endpoint: `POST /api/ai/chat` (com **rate-limit** de 20 req/min por IP)

---

## 4. Modelo de Negócio — Planos

### 4.1 Tabela de Preços (Stripe Payment Links)
| Plano | Especialistas | Preço/mês | Slug |
|-------|--------------|-----------|------|
| **Básico** | Até 2 | R$ 197,00 | `basico` |
| **Crescimento** | 3 a 5 | R$ 397,00 | `crescimento` |
| **Avançado** ⭐ | 6 a 9 | R$ 597,00 | `avancado` |
| **Enterprise** | 10+ | R$ 897,00 | `enterprise` |

> O plano **Avançado** é destacado como "Mais Escolhido" na Landing Page.
> Cada plano aponta para um **Stripe Payment Link**; o `clinic_id` é enviado via
> `client_reference_id` para o webhook vincular a assinatura à clínica.

### 4.2 Dupla Receita
1. **Assinaturas** das clínicas (recorrente)
2. **Marketplace de parceiros** — monetização de fornecedores por exposição/cliques

---

## 5. Schema do Banco de Dados

### 5.1 Tabelas principais
| Tabela | Descrição | RLS |
|--------|-----------|-----|
| `plans` | Planos de assinatura | SELECT público |
| `clinics` | Clínicas (name, email, phone, address...) | Isolamento por `owner_auth_id` |
| `users` | Staff da clínica | Isolamento por `clinic_id` |
| `specialists` | Profissionais da clínica | Isolamento por `clinic_id` |
| `patients` | Pacientes | Isolamento por `clinic_id` |
| `appointments` | Agendamentos | Isolamento por `clinic_id` |
| `subscriptions` | Assinaturas Stripe | Acesso por owner |
| `onboarding_tokens` | Senhas provisórias | Acesso por e-mail |
| `email_logs` | E-mails enviados | Acesso por owner |
| `whatsapp_messages` | Mensagens WhatsApp | Isolamento por `clinic_id` |
| `solara_partners_clicks` | Cliques de parceiros (monetização) — `clinic_id TEXT` | Inserção/leitura pública |

---

## 6. Fluxos do Usuário

### 6.1 Onboarding (Novo Cliente)
1. Landing Page → escolhe plano → cadastro (clínica, e-mail, senha)
2. Sistema cria auth.user, clinic, user (owner), subscription (pending)
3. Checkout → **Stripe Payment Link** (com `client_reference_id`)
4. Webhook `checkout.session.completed` → ativa assinatura da clínica
5. Acesso liberado ao Dashboard (após `hasActiveSubscription`)

### 6.2 Atendimento via Solara
1. Paciente envia mensagem (Dashboard ou WhatsApp/Evolution)
2. `POST /api/ai/chat` com `clinic_id` → carrega contexto da clínica
3. Solara responde com guardrails e conduz o próximo passo

### 6.3 Marketplace / Monetização
1. Clínica acessa aba Parceiros → 70 fornecedores reais em 13 categorias
2. Clique em "Acessar Site" → grava em `solara_partners_clicks`
3. Relatório "Performance de Parceiros" consolida cliques (exporta PDF)

---

## 7. Segurança

- **RLS** habilitado em todas as tabelas (isolamento por `clinic_id`)
- **Rate-limit** no endpoint da IA (20 req/min por IP) — protege a cota OpenAI
- Segredos fora do Git (`.gitignore`) — só no EasyPanel
- Endpoints de pagamento validam owner; webhook com verificação de assinatura Stripe
- Auth via Supabase (JWT auto-refresh, sessão persistida)
- **LGPD:** dados isolados por clínica · **HIPAA-ready:** criptografia em trânsito/repouso

---

## 8. Integrações

### 8.1 OpenAI (IA) — ✅ produção
- Modelo `gpt-5-mini`, validado em produção. Ver seção 3.

### 8.2 Stripe (Pagamentos) — ✅ produção
- Payment Links nos 4 planos + webhook vinculando assinatura à clínica.

### 8.3 WhatsApp (Evolution API) — ✅ implementado
- Base: `https://evoapi.axoshub.com` · instância `axos-evoapi`.

### 8.4 Marketplace de Parceiros (Monetização) — ✅ produção
- 70 fornecedores reais (links verificados) em 13 categorias, incluindo Regional Vale do Paraíba.
- Rastreio de cliques assíncrono + relatório consolidado com exportação PDF.

---

## 9. Roadmap

### ✅ Entregue (v1 → v2)
- [x] Landing, Login, Cadastro, Checkout, Dashboard
- [x] Backend FastAPI + Celery + Supabase
- [x] **Solara IA Manager** (contexto dinâmico + guardrails)
- [x] Migração para OpenAI `gpt-5-mini`
- [x] Pagamentos reais (Stripe Payment Links + webhook)
- [x] WhatsApp (Evolution API)
- [x] Marketplace B2B com 70 parceiros + contagem de cliques + analytics
- [x] Segurança (rate-limit, RLS) e performance (code-splitting)
- [x] Deploy em produção (EasyPanel) — 31/05/2026

### 🔜 Próximos
- [ ] **RAG + Embeddings (pgvector)** — Solara responde por documentos reais da clínica
- [ ] **Sistema de vendas automático** (FastAPI + Celery + Evolution + LLM)
- [ ] Cadastro guiado dos dados da clínica (alimenta o contexto da IA)
- [ ] Kanban/agenda visual, prontuário eletrônico, NPS automático
- [ ] Testes automatizados
- [ ] Otimização da LandingPage (imagens base64 → arquivos)

---

## 10. Métricas de Sucesso
| Métrica | Meta |
|---------|------|
| Tempo de cadastro até dashboard | < 3 minutos |
| Taxa de conversão LP → Cadastro | > 5% |
| Taxa de resposta da Solara | > 95% |
| Uptime do sistema | > 99.5% |
| NPS dos médicos | > 70 |
| Churn mensal | < 5% |

---

> **Documento confidencial.** Propriedade intelectual da Axos Hub.
> Última atualização: 31/05/2026 (v2.0)
