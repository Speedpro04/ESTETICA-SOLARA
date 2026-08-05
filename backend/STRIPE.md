# Stripe Integration - Axos Hub

## Configuração do Stripe

### 1. Criar conta no Stripe
- Acesse: https://stripe.com
- Modo teste: use chaves que começam com `sk_test_`
- Modo produção: use chaves que começam com `sk_live_`

### 2. Obter chaves da API
1. Dashboard > Developers > API keys
2. Copie:
   - **Publishable key**: `pk_test_...`
   - **Secret key**: `sk_test_...`
   - **Webhook secret**: `whsec_...`

### 3. Configurar Webhook
- URL: `https://seu-dominio.com/api/stripe/webhook`
- Eventos:
  - `checkout.session.completed`
  - `invoice.payment_succeeded`
  - `customer.subscription.updated`

---

## Modelos de Pagamento

### Planos de Assinatura (SaaS)
- **Starter**: R$ 199/mês (até 2 profissionais)
- **Professional**: R$ 399/mês (até 5 profissionais)
- **Enterprise**: Sob consulta (ilimitado)

### Stripe Checkout
- Pagamento único (consultas particulares)
- Assinaturas recorrentes (planos mensais)
- Split de pagamento (Stripe Connect)

---

## Stripe Connect (Multi-tenant)

Cada clínica pode receber pagamentos dos pacientes:

```python
# Criar conta Connect para a clínica
stripe.Account.create(
    type="express",
    email="clinica@exemplo.com",
    capabilities={
        "card_payments": {"requested": True},
        "transfers": {"requested": True},
    }
)

# Receber pagamento e dividir
stripe.PaymentIntent.create(
    amount=15000,  # R$ 150,00
    currency="brl",
    application_fee_amount=1500,  # R$ 15,00 (10% Axos)
    transfer_data={"destination": "acct_123456"},  # Conta da clínica
)
```

---

## Configurar no .env

```env
# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_WEBHOOK_URL=https://seu-dominio.com/api/stripe/webhook

# Produto/Preço IDs
STRIPE_PRICE_STARTER=price_xxx
STRIPE_PRICE_PROFESSIONAL=price_yyy
STRIPE_PRICE_ENTERPRISE=price_zzz
```
