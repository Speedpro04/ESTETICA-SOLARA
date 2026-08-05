-- ==========================================================
-- SOLARA CONNECT — PARCEIROS & CONTAGEM DE CLIQUES (MONETIZAÇÃO)
-- ==========================================================
-- Cole este script INTEIRO no SQL Editor do Supabase e clique em RUN.
-- Pode ser executado mais de uma vez sem causar erros (idempotente).
-- ==========================================================

-- 1) Tabela de cadastro dos parceiros (opcional — o front já tem a lista fixa).
--    Deixada pronta para quando você quiser gerenciar parceiros pelo banco.
CREATE TABLE IF NOT EXISTS public.solara_partners (
    id           VARCHAR(50)  PRIMARY KEY,
    name         VARCHAR(100) NOT NULL,
    specialty    TEXT         NOT NULL,
    site         VARCHAR(255) NOT NULL,
    region       VARCHAR(20)  NOT NULL CHECK (region IN ('nacional', 'vale')),
    location     VARCHAR(100) NOT NULL,
    category_id  VARCHAR(50)  NOT NULL,
    created_at   TIMESTAMPTZ  DEFAULT now() NOT NULL
);

-- 2) Tabela de CLIQUES — o coração da monetização.
--    clinic_id é TEXT para aceitar tanto UUID de clínica quanto o modo
--    manutenção (dev-clinic-...) sem perder nenhum registro.
CREATE TABLE IF NOT EXISTS public.solara_partners_clicks (
    id              UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
    partner_id      VARCHAR(50)  NOT NULL,
    partner_name    VARCHAR(100) NOT NULL,
    category_title  VARCHAR(100) NOT NULL,
    click_type      VARCHAR(20)  NOT NULL CHECK (click_type IN ('website', 'whatsapp')),
    clinic_id       TEXT,
    created_at      TIMESTAMPTZ  DEFAULT now() NOT NULL
);

-- 3) Índices para o relatório ficar rápido mesmo com muitos cliques.
CREATE INDEX IF NOT EXISTS idx_clicks_partner_id  ON public.solara_partners_clicks (partner_id);
CREATE INDEX IF NOT EXISTS idx_clicks_created_at  ON public.solara_partners_clicks (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clicks_clinic_id   ON public.solara_partners_clicks (clinic_id);

-- 4) Segurança (RLS).
ALTER TABLE public.solara_partners        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solara_partners_clicks ENABLE ROW LEVEL SECURITY;

-- Leitura pública dos parceiros (para carregar a página).
DROP POLICY IF EXISTS "leitura_publica_parceiros" ON public.solara_partners;
CREATE POLICY "leitura_publica_parceiros"
ON public.solara_partners FOR SELECT USING (true);

-- Qualquer visitante pode registrar um clique (gravação pública).
DROP POLICY IF EXISTS "insercao_publica_cliques" ON public.solara_partners_clicks;
CREATE POLICY "insercao_publica_cliques"
ON public.solara_partners_clicks FOR INSERT WITH CHECK (true);

-- Leitura dos cliques (para o relatório/dashboard).
DROP POLICY IF EXISTS "leitura_cliques" ON public.solara_partners_clicks;
CREATE POLICY "leitura_cliques"
ON public.solara_partners_clicks FOR SELECT USING (true);

-- ==========================================================
-- Pronto! A partir daqui cada clique em "Acessar Site" é gravado
-- e aparece no relatório "Performance de Parceiros" do dashboard.
-- ==========================================================
