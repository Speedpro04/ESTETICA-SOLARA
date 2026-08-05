-- ============================================
-- AXOS HUB - Tabela de Planos e Assinaturas
-- Adicionar ao SQL principal (supabase.sql)
-- ============================================

-- Tabela de Planos (Plans)
CREATE TABLE IF NOT EXISTS plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL, -- 'Starter', 'Professional', 'Enterprise'
    description TEXT,
    price_cents INTEGER NOT NULL, -- Valor em centavos (ex: 19900 = R$ 199,00)
    currency TEXT DEFAULT 'BRL',
    interval TEXT DEFAULT 'month', -- 'month', 'year'
    max_professionals INTEGER, -- Limite de profissionais
    features JSONB, -- Features do plano em JSON
    stripe_price_id TEXT, -- ID do preço no Stripe
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de Assinaturas (Subscriptions)
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES plans(id),
    status TEXT DEFAULT 'inactive', -- inactive, active, past_due, cancelled
    stripe_subscription_id TEXT, -- ID no Stripe
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de Pagamentos
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id),
    amount_cents INTEGER NOT NULL,
    currency TEXT DEFAULT 'BRL',
    status TEXT DEFAULT 'pending', -- pending, paid, failed, refunded
    payment_method TEXT, -- 'card', 'boleto', 'pix'
    stripe_payment_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    paid_at TIMESTAMPTZ
);

-- Índices
CREATE INDEX idx_plans_active ON plans(active) WHERE active = true;
CREATE INDEX idx_subscriptions_clinic ON subscriptions(clinic_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_payments_clinic ON payments(clinic_id);
CREATE INDEX idx_payments_status ON payments(status);

-- ============================================
-- DADOS INICIAIS - Planos Padrão
-- ============================================

-- Plano Starter
INSERT INTO plans (name, description, price_cents, max_professionals, features)
VALUES (
    'Starter',
    'Para clínicas em crescimento',
    19900,  -- R$ 199,00
    2,
    '["Até 2 profissionais", "Prontuário eletrônico", "Agendamento online", "Relatórios básicos", "Suporte por e-mail"]'::JSONB
);

-- Plano Professional
INSERT INTO plans (name, description, price_cents, max_professionals, features)
VALUES (
    'Professional',
    'O mais escolhido',
    39900,  -- R$ 399,00
    5,
    '["Até 5 profissionais", "Tudo do Starter", "Gestão financeira", "Telemedicina", "App para pacientes", "Suporte prioritário"]'::JSONB
);

-- Plano Enterprise
INSERT INTO plans (name, description, price_cents, max_professionals, features)
VALUES (
    'Enterprise',
    'Para grandes operações',
    99900,  -- R$ 999,00 (ou sob consulta)
    NULL,   -- Ilimitado
    '["Profissionais ilimitados", "Personalização completa", "API de integração", "Gerente de conta", "Treinamento in loco", "SLA garantido"]'::JSONB
);

-- ============================================
-- Views Úteis
-- ============================================

-- View: Faturamento Recorrente Mensal (MRR)
CREATE VIEW mrr_report AS
SELECT
    DATE_TRUNC('month', s.current_period_start) as month,
    COUNT(*) as total_subscriptions,
    SUM(p.price_cents) / 100.0 as monthly_recurring_revenue
FROM subscriptions s
JOIN plans p ON p.id = s.plan_id
WHERE s.status = 'active'
GROUP BY DATE_TRUNC('month', s.current_period_start);

-- View: Assinaturas por Plano
CREATE VIEW subscriptions_by_plan AS
SELECT
    p.name as plan_name,
    COUNT(s.id) as total_subscriptions,
    SUM(CASE WHEN s.status = 'active' THEN 1 ELSE 0 END) as active_subscriptions,
    SUM(p.price_cents) / 100.0 as total_revenue
FROM subscriptions s
JOIN plans p ON p.id = s.plan_id
GROUP BY p.name;
