-- ==========================================================
-- SCRIPT SQL: ESTRUTURA E CARGA DE PARCEIROS SOLARA
-- ==========================================================
-- Execute este script no SQL Editor do painel do seu Supabase.

-- 1. Tabela de Cadastro dos Parceiros
CREATE TABLE IF NOT EXISTS public.solara_partners (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    specialty TEXT NOT NULL,
    site VARCHAR(255) NOT NULL,
    region VARCHAR(20) NOT NULL CHECK (region IN ('nacional', 'vale')),
    location VARCHAR(100) NOT NULL,
    category_id VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 2. Tabela de Cliques de Parceiros (Monetização)
CREATE TABLE IF NOT EXISTS public.solara_partners_clicks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    partner_id VARCHAR(50) NOT NULL,
    partner_name VARCHAR(100) NOT NULL,
    category_title VARCHAR(100) NOT NULL,
    click_type VARCHAR(20) NOT NULL CHECK (click_type IN ('website', 'whatsapp')),
    clinic_id UUID,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Habilitar RLS em ambas
ALTER TABLE public.solara_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solara_partners_clicks ENABLE ROW LEVEL SECURITY;

-- Políticas para solara_partners (Leitura livre para carregar a página)
CREATE POLICY "Permitir leitura pública de parceiros" 
ON public.solara_partners FOR SELECT USING (true);

-- Políticas para solara_partners_clicks
CREATE POLICY "Permitir inserções públicas de cliques" 
ON public.solara_partners_clicks FOR INSERT WITH CHECK (true);

CREATE POLICY "Permitir leitura geral de cliques" 
ON public.solara_partners_clicks FOR SELECT USING (true);

-- Carga inicial de todos os 94 parceiros comerciais homologados
INSERT INTO public.solara_partners (id, name, specialty, site, region, location, category_id)
VALUES
;
