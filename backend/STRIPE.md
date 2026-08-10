# Cobrança pelo Stripe

Assinatura da **Solara Estética**: plano único, R$ 497/mês ou R$ 4.764/ano
(equivalente a R$ 397/mês).

## Como funciona

O trial de 10 dias **não é do Stripe**. Ele nasce em `register_clinic()` como
`subscriptions.status = 'trialing'` com `trial_ends_at`, sem cartão. O Stripe só
entra quando a clínica decide pagar — por isso a sessão de checkout é criada sem
`trial_period_days`.

```
Landing → cadastro → painel liberado por 10 dias (trialing, sem cartão)
                              ↓
                     clínica decide assinar
                              ↓
   POST /api/stripe/checkout  →  URL do Stripe  →  cliente paga
                              ↓
              webhook  →  subscriptions.status = 'active'
```

**O webhook é o único lugar que ativa uma assinatura.** O navegador não escreve
em `subscriptions`: o RLS só permite `SELECT` para `authenticated`, e a função
`stripe_aplicar_assinatura` é revogada de `anon`/`authenticated`. Quem escreve é
o backend, com a `service_role`.

O navegador também nunca manda preço nem `clinic_id`: manda só o slug do plano
(`solara-mensal` / `solara-anual`). A clínica sai do JWT e o preço sai de
`plans.stripe_price_id`.

## Endpoints

| Método | Rota | O que faz |
|---|---|---|
| POST | `/api/stripe/checkout` | Abre a sessão de pagamento. Exige Bearer do Supabase e papel `owner`/`admin`. Corpo: `{"plan_slug": "solara-mensal"}` |
| POST | `/api/stripe/portal` | Portal do Stripe: trocar cartão, ver faturas, cancelar |
| POST | `/api/stripe/webhook` | Recebe os eventos. Público, protegido por assinatura |

## A conta é compartilhada — leia isto

A conta do Stripe é a do CNPJ e atende **outro produto além da Solara**
(yachtsatlas). Duas consequências:

1. **Cada endpoint de webhook tem seu próprio `whsec_`.** O segredo do endpoint
   do outro produto não valida os eventos daqui — usar o errado faz *toda*
   notificação ser recusada como assinatura inválida, e nenhuma clínica é
   ativada. Crie um endpoint separado para a Solara e copie o segredo dele.

2. **Endpoint separado não separa os dados.** Você escolhe quais *tipos* de
   evento cada endpoint recebe, não de qual produto. O endpoint da Solara
   receberá eventos de assinatura do outro produto também. O código descarta em
   silêncio (com 200) tudo que não casa com uma clínica daqui — responder erro
   faria o Stripe reentregar para sempre um evento que nunca vai ser nosso.

## Configuração

### 1. Variáveis de ambiente

Só duas, e as duas **no backend** (`backend/.env` em desenvolvimento, painel de
deploy em produção):

```env
STRIPE_SECRET_KEY=sk_test_...      # sk_live_... em produção
STRIPE_WEBHOOK_SECRET=whsec_...    # o do endpoint DA SOLARA
```

Não existe variável de Stripe no frontend. Nem link, nem `price_id`, nem chave
publicável — o fluxo é redirecionamento, e o `.env.production` vai inteiro para
o bundle que qualquer visitante baixa.

> **Nunca** coloque `sk_live_` em `.env.production`, em nada com prefixo `VITE_`
> ou em arquivo versionado. `.env.production` **está no git**.

### 2. Produtos e preços no Stripe

No painel: **Produtos → Adicionar produto**, um produto com dois preços
recorrentes.

| Plano | Valor | Recorrência |
|---|---|---|
| `solara-mensal` | R$ 497,00 | Mensal |
| `solara-anual` | R$ 4.764,00 | Anual |

Copie os IDs — os `price_...` de cada preço, **não** a URL `buy.stripe.com` do
Payment Link. Payment Link não serve aqui: o checkout é criado pelo backend.

Os IDs de **test** e de **live** são diferentes.

### 3. Gravar os preços no banco

```sql
UPDATE plans SET stripe_price_id = 'price_XXXX' WHERE slug = 'solara-mensal';
UPDATE plans SET stripe_price_id = 'price_YYYY' WHERE slug = 'solara-anual';
```

Sem isso o backend recusa o checkout com 503, de propósito: melhor barrar na
hora do que mandar a clínica para uma sessão que cobra o valor errado.

Trocar de test para live é rodar estes dois `UPDATE` com os IDs de produção.

### 4. Endpoint do webhook

**Developers → Webhooks → Add endpoint**, apontando para a API da Solara:

```
https://<dominio-da-api>/api/stripe/webhook
```

Eventos:

```
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.paid
invoice.payment_failed
```

Copie o **Signing secret** desse endpoint para `STRIPE_WEBHOOK_SECRET`.

> O domínio precisa ser o da **API**, com certificado de uma CA de verdade. O
> Stripe recusa endpoint com certificado autoassinado. `solaraestetica.online`
> não serve: o Caddy de lá é só servidor de arquivo estático, sem
> `reverse_proxy` para o backend — qualquer `/api/...` cai em 404.

### 5. Migration

```sql
-- supabase/migrations/0005_cobranca_stripe.sql
```

Cria `stripe_events` (trava de reentrega), `stripe_status_local` (tradução de
status) e `stripe_aplicar_assinatura` (ponto único de escrita), e acerta os dois
planos para o preço real.

## Testar sem mover dinheiro

Com o [Stripe CLI](https://stripe.com/docs/stripe-cli), sem precisar de domínio
público nem de certificado:

```bash
stripe listen --forward-to localhost:8000/api/stripe/webhook
```

O comando imprime um `whsec_...` temporário — use esse em `backend/.env`
enquanto testa. Cartão de teste: `4242 4242 4242 4242`, validade futura,
qualquer CVC.

Para disparar um evento isolado:

```bash
stripe trigger checkout.session.completed
```

## Detalhes que já custaram caro

- **`canceled` vs `cancelled`.** O Stripe escreve com um L; o `CHECK` de
  `subscriptions` exige dois. Gravar o valor cru estoura a constraint e a
  atualização inteira falha — silenciosamente, do ponto de vista de quem pagou.
  `stripe_status_local()` traduz.

- **`current_period_end` mudou de lugar.** Da versão 2025-03-31 em diante o
  campo saiu da raiz da assinatura e foi para cada item. O código lê os dois
  lugares; sem isso o painel mostraria vencimento vazio, sem erro nenhum.

- **Reentrega.** O Stripe reenvia o mesmo evento quando a resposta demora, e não
  promete ordem. `stripe_events` garante processamento único; se o processamento
  falha, a reserva é solta para que a reentrega funcione.

- **Papel de quem assina.** Só `owner` e `admin`. Recepção usa o painel, mas não
  contrata.
