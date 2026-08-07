# PRD — Solara Connect
### Product Requirements Document
**Versão:** 3.0
**Data:** 07/08/2026
**Autor:** Axos Hub
**Status:** 🔧 Reconstruído — backend e banco novos aplicados; canal WhatsApp aguardando número verificado na Meta

> **v3 é uma reescrita, não uma revisão.** A v2 descrevia o "Solara Medical
> Connect": clínica médica genérica, Evolution API por QR Code, quatro planos e
> marketplace de parceiros. Nada disso existe mais. O banco foi zerado e
> reconstruído em 07/08/2026, e a Evolution foi removida por completo.

---

## 1. O produto

**Solara Connect** é atendimento e agendamento por agentes de IA no WhatsApp, para
**clínicas de estética avançada e cirurgia plástica**. Não é gestão de clínica, não
é prontuário, não é marketplace. Duas coisas, bem feitas: **atender e agendar.**

### 1.1 A proposta de valor é tempo

O público dessas clínicas tem dinheiro e não tem tempo. O que se vende não é preço
nem "atendimento humanizado" — é **não esperar, não repetir, não voltar amanhã para
saber um horário**.

Isso não é slogan: é a especificação do comportamento dos agentes e a métrica que
o painel mostra primeiro (tempo até a primeira resposta, % em até 1 minuto, %
atendido fora do expediente).

### 1.2 Consequências de projeto

| Decisão | Por quê |
|---|---|
| A IA não informa preço no WhatsApp (padrão) | Número solto vira comparação; comparação é perda de tempo dos dois lados |
| Máximo 2 perguntas antes de oferecer horário | Cada pergunta é uma chance a mais de a pessoa sumir. O resto a equipe descobre na avaliação |
| 1 tentativa de insistência, não 2 | Com esse público, a segunda cobrança queima em vez de recuperar |
| Handoff assumido em 5 minutos | "Chamei a doutora, ela responde em 5 min" é o serviço, não a falha da IA |
| O Agendador oferece horário real, nunca "vou verificar" | "Vou te retornar" custa um dia da paciente |

---

## 2. O time de agentes

Quatro papéis lógicos atrás de **um número por clínica**. A pessoa nunca percebe a
troca — a resolução de qual agente responde é o `stage` da conversa.

| Agente | Entra quando | Faz | Sai quando |
|---|---|---|---|
| **SDR** | Primeiro contato | Entende o interesse, contorna objeção autorizada, conduz ao próximo passo | Lead quer marcar → Agendador |
| **Agendador** | Lead qualificado | Propõe horário **real** e reserva | Confirmado |
| **Handoff** | Regra determinística, pedido explícito, ou assunto fora do briefing | **Trava a IA** e chama a equipe | Humano assume, ou timeout devolve |
| **Follow-up** | Lead parado na régua | Reengaja (texto livre dentro de 24h; template aprovado fora) | Lead responde → volta ao ponto onde parou |

**Handoff não é agente conversacional** — é um estado que silencia os outros.
**Follow-up não é estágio** — é gatilho + template, e não move a conversa de lugar.

Decidido em 07/08/2026: **só esses quatro.** Um quinto agente voltado para dentro
(copiloto da recepcionista) foi avaliado e descartado — copiloto de dashboard não
muda decisão nenhuma. O único pedaço que valia — avisar quando o handoff estoura o
prazo — é notificação, não IA.

### 2.1 Anti-alucinação de horário — três camadas

A camada de baixo não depende de nenhuma acima:

1. **Prompt** — o Agendador só vê uma lista fechada de vagas reais
2. **Ferramenta** — `reservar_horario` rejeita qualquer horário fora dessa lista
3. **Banco** — `trg_appointments_valida_horario` recusa gravar fora do expediente,
   venha de onde vier

A válvula de escape é assimétrica de propósito: `forcado_por_humano` deixa a
recepção encaixar alguém no domingo; a IA nunca preenche esse campo.

### 2.2 Escalonamento — determinístico antes do modelo

Contraindicação, complicação, gestante, ameaça judicial e pedido de humano casam
por **texto normalizado** (`escalation_rules`) **antes** de a mensagem chegar ao
LLM. Risco clínico não pode depender do julgamento do modelo naquele turno.

Seis regras globais (`clinic_id IS NULL`) valem para toda clínica e não são
editáveis pelo cliente — é o piso de segurança do contrato. A clínica acrescenta
as suas.

---

## 3. Arquitetura

### 3.1 Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Backend | FastAPI (Python) |
| LLM | OpenAI, `reasoning_effort: low` (chat em tempo real) |
| WhatsApp | **Meta Cloud API** (oficial) |
| Banco / Auth | Supabase (PostgreSQL 17 + GoTrue) |
| Pagamentos | Stripe |
| Rotinas periódicas | Endpoint `/api/jobs/ciclo` + agendador externo |

**Sem Celery e sem Redis.** O estado das rotinas já vive no banco
(`next_follow_up_at`, `handoff_aberto_em`); uma query com `WHERE` resolve o que um
broker resolveria, sem mais um processo para monitorar e pagar.

### 3.2 Backend

```
backend/app/
├── api/
│   ├── meta_webhook.py       Recebe da Meta: HMAC sobre o corpo cru, 200 imediato
│   ├── jobs.py               /api/jobs/ciclo — follow-up + timeout de handoff
│   ├── stripe.py             Assinaturas
│   └── ai.py                 Chat do painel
├── agents/
│   ├── router.py             Registro → trava → regra determinística → agente
│   ├── base.py               Identidade da Solara + contexto da clínica
│   ├── sdr.py
│   ├── agendador.py
│   └── followup.py
└── services/
    ├── whatsapp_cloud.py     Envio: texto, template, balões
    ├── conversation.py       Estado, contexto, escalonamento
    ├── agenda.py             Cálculo de vagas reais
    ├── llm.py                Chamada ao modelo + rede anti-reapresentação
    └── supabase_service.py
```

**A ordem das checagens no roteador é a segurança**, não estilo: registro e
idempotência → trava de atendimento → **regra determinística** → agente. Inverter
as duas últimas significaria deixar o LLM decidir se uma pergunta sobre reação
adversa merece resposta automática.

### 3.3 Frontend

```
src/
├── Painel.tsx                Atendimento: tempo, funil, filas, leads
├── Briefing.tsx              9 seções, salvamento por seção
├── Operacional.tsx           Casca (Atendimento | Briefing)
├── painel/componentes.tsx
├── briefing/campos.tsx
└── lib/{painel.ts, briefing.ts, auth.ts, supabase.ts}
```

Removidos na v3: `Dashboard.tsx` (2.321 linhas de clínica médica),
`PartnersPage.tsx` e `PartnersAnalytics.tsx` (marketplace descontinuado).

### 3.4 Banco

Projeto Supabase `szssizgchukffmmcjxoh`. Schema em `supabase/schema_v2/`,
aplicado na ordem `00_reset` → `13_tempo_e_posicionamento`.

Entidades centrais:

| Tabela | Papel |
|---|---|
| `conversations` | **É o lead** — funil, máquina de estados e janela de 24h no mesmo lugar |
| `conversation_transitions` | Histórico append-only de quem passou a bola para quem, e por quê |
| `stage_transition_rules` | O grafo de transições permitidas, em tabela (inspecionável) |
| `procedures` | Catálogo com apelidos — é por "botox" que o SDR reconhece o interesse |
| `clinic_hours` / `clinic_schedule_blocks` | Expediente estruturado; base da trava anti-alucinação |
| `clinic_briefing` | 60+ colunas: o que ensina o SDR a vender |
| `escalation_rules` | Camada determinística do handoff |
| `wa_phone_numbers` | Resolução de tenant pelo `phone_number_id` |
| `patients` | Só quem virou cliente — interessado é conversa, não paciente |

**Não existe tabela `leads`.** A conversa *é* o lead; duas entidades 1:1 seriam
gordura.

---

## 4. Multi-tenant e segurança

RLS habilitado nas 22 tabelas, todas as políticas `TO authenticated`, resolvidas
por `current_clinic_ids()` (SECURITY DEFINER, `search_path = ''`) para não recursar
entre `clinics` e `users`.

**Isolamento verificado por teste de invasão em 07/08/2026:** segunda clínica
semeada, tentativas de leitura e escrita cruzada a partir de uma sessão real.
Leitura filtrada, escrita rejeitada (403 ou 0 linhas), assinatura não
auto-promovível.

O teste encontrou **uma vulnerabilidade real, reproduzida e corrigida**
(`12_rls_correcao_tenant.sql`): a política de INSERT em `users`, herdada do schema
antigo, era `WITH CHECK (auth.uid() IS NOT NULL)` — qualquer conta nova podia se
inserir em qualquer clínica e ler tudo. Havia uma segunda porta pelo UPDATE sem
`WITH CHECK`.

> **Regra que fica:** em RLS, todo UPDATE precisa de `USING` **e** `WITH CHECK`.
> `USING` diz o que você pode tocar; `WITH CHECK` diz no que aquilo pode se
> transformar. Constraint de unicidade não é política de segurança.

Outras travas:
- `phone_number_id` único, **sem fallback** por telefone do paciente — adivinhar
  tenant é vazamento entre clínicas
- Índice único parcial em `messages.wa_message_id` — reentrega da Meta não vira
  resposta duplicada
- Views com `security_invoker = true` — sem isso rodariam como dono e ignorariam RLS
- Assinatura só leitura no navegador; escrita é do webhook Stripe
- `wa_phone_numbers` guarda **referência** de segredo, nunca o token

**Risco conhecido:** o backend usa `service_role`, que ignora RLS. Um bug lá cruza
tenant e o banco não segura. Mitigação de desenho: `clinic_id` sempre sai do
`phone_number_id`, nunca de entrada do usuário.

---

## 5. Painel operacional

Ordem da tela é ordem de urgência:

1. **Esperando a equipe** — só aparece quando há alguém na fila
2. **Tempo de espera** — a prova do que a clínica compra
3. **Números do período**
4. **Funil de coorte** — dos leads que entraram, quantos chegaram a cada etapa
5. **Reengajamento** — quem vai ser reprocurado, com aviso de conversa paga
6. **Origem e procedimentos**
7. **Lista de leads** classificados

**O funil é de coorte, não de ocupação.** Contar quem está em cada estágio agora
faz o topo parecer vazio justamente na clínica que converte bem — quem avançou não
está mais lá. A coorte usa o histórico de transições.

O card de tempo usa **mediana, não média**: uma conversa esquecida por 10 horas
distorce a média e o número deixa de descrever o atendimento típico.

---

## 6. Briefing — a alavanca de receita

Nove seções, salvamento por seção, dica em cada campo explicando o que a Solara faz
com aquilo.

**É o briefing que decide se o SDR converte 20% ou 40%.** Uma clínica que converte
40% renova; uma que converte 20% culpa a IA e cancela. Nenhum agente novo conserta
isso — só briefing bem preenchido.

Por isso o formulário mostra progresso por seção (`3/4`) e o painel lista o que
falta antes de a Solara poder atender (`clinica_pronta()`): expediente,
procedimentos, briefing, número conectado, destinatário de handoff.

`posicionamento` (`alto_padrao` | `volume`) é a chave mestra: troca tom,
agressividade e régua de uma vez. Antes eram seis campos soltos que precisavam
apontar na mesma direção.

---

## 7. Modelo de negócio

Plano único, cobrança mensal ou anual, **3 especialistas inclusos** (limite no
banco, via trigger — checagem em JavaScript é contornada pelo console).
Trial de 10 dias.

Preço e condições vivem na tabela `plans`.

**Custo variável que decide a margem:** cada conversa iniciada fora da janela de
24h é cobrada pela Meta, e `marketing` custa mais que `utility`. Daí o teto de
tentativas de follow-up, a janela de silêncio e o aviso de "conversa paga" no
painel antes de o envio acontecer.

---

## 8. Estado atual

### Pronto e verificado
- Schema completo aplicado (14 arquivos)
- Os 4 agentes escritos
- Trava anti-alucinação de horário — 5 casos testados
- Timeout de handoff e régua de follow-up — 7 casos testados
- Painel e briefing rodando, com login real e dados semeados
- Isolamento multi-tenant testado, uma vulnerabilidade corrigida

### Parado esperando a Meta
`meta_webhook.py` e `whatsapp_cloud.py` estão escritos e desligados. Faltam
`META_APP_SECRET` e `META_VERIFY_TOKEN` — sem eles o webhook recusa tudo em
produção, de propósito.

**Este é o caminho crítico do projeto.** Verificação de Business Manager leva dias,
e nada do canal pode ser testado de ponta a ponta antes disso.

### Não construído
- Entrega do alerta de handoff por WhatsApp interno e e-mail (o canal `painel`
  funciona porque a fila está visível)
- Rate limit no webhook
- Testes automatizados

---

## 9. Métricas

| Métrica | Meta | Por quê |
|---|---|---|
| Primeira resposta (mediana) | < 30 s | É a proposta de valor |
| Respondidas em até 1 min | > 90% | Idem |
| Handoff assumido no prazo | > 90% | Onde o produto mais falha feio |
| Taxa de agendamento | > 30% | O que a clínica compra |
| Briefing preenchido no onboarding | > 80% | Prediz a taxa acima |
| Churn mensal | < 5% | |

---

> **Documento confidencial.** Propriedade intelectual da Axos Hub.
> Última atualização: 07/08/2026 (v3.0)
