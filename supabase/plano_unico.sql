-- =============================================================================
-- Plano único da Solara Estética
-- =============================================================================
-- A landing page passou de 4 planos por número de especialista (197/397/597/897)
-- para plano único: R$497 no mensal e R$397/mês no anual. Os slugs que o
-- RegisterPage envia para register_clinic() mudaram junto — sem estas linhas,
-- o cadastro quebra com "Plano nao encontrado".
--
-- Rodar uma vez no SQL Editor do Supabase. É idempotente.
-- =============================================================================

-- 1. Desativa os planos antigos. NÃO apaga: clinics.plan_id e subscriptions.plan_id
--    apontam para eles, e cliente que já assinou precisa manter o histórico.
UPDATE plans
   SET active = false
 WHERE slug IN ('basico', 'crescimento', 'avancado', 'enterprise');

-- 2. Insere (ou atualiza) os dois planos vigentes.
INSERT INTO plans (
    name, slug, description, price_cents, billing_interval,
    min_specialists, max_specialists, features,
    is_highlighted, active, display_order
) VALUES
(
    'Solara Estética — Mensal',
    'solara-mensal',
    'Plano único, tudo incluso. Cobrado todo mês, sem fidelidade.',
    49700,
    'month',
    1,
    NULL,  -- sem teto: especialistas, salas e usuários ilimitados
    '["Recepcionista de IA no WhatsApp 24h", "API oficial da Meta com o número da clínica", "Atendimento e lembrete ilimitados", "Até 500 mensagens de campanha por mês", "Agenda, prontuário e ficha de anamnese", "Especialistas, salas e usuários ilimitados", "Relatórios de faturamento, no-show e retorno", "Suporte por WhatsApp"]'::JSONB,
    false,
    true,
    1
),
(
    'Solara Estética — Anual',
    'solara-anual',
    'Plano único, tudo incluso. R$397/mês cobrados uma vez por ano.',
    39700,  -- valor MENSAL equivalente; a cobrança anual (R$4.764) vive no Stripe
    'year',
    1,
    NULL,
    '["Recepcionista de IA no WhatsApp 24h", "API oficial da Meta com o número da clínica", "Atendimento e lembrete ilimitados", "Até 500 mensagens de campanha por mês", "Agenda, prontuário e ficha de anamnese", "Especialistas, salas e usuários ilimitados", "Relatórios de faturamento, no-show e retorno", "Suporte por WhatsApp"]'::JSONB,
    true,
    true,
    2
)
ON CONFLICT (slug) DO UPDATE SET
    name             = EXCLUDED.name,
    description      = EXCLUDED.description,
    price_cents      = EXCLUDED.price_cents,
    billing_interval = EXCLUDED.billing_interval,
    max_specialists  = EXCLUDED.max_specialists,
    features         = EXCLUDED.features,
    is_highlighted   = EXCLUDED.is_highlighted,
    active           = true,
    display_order    = EXCLUDED.display_order;

-- Conferência
SELECT slug, name, price_cents, billing_interval, active FROM plans ORDER BY display_order;
