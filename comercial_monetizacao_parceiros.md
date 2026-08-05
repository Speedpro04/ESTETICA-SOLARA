# 💎 Playbook Comercial e Técnico — Monetização dos Parceiros Solara

Este documento é o seu guia estratégico e técnico para transformar a aba **Partnership Premium** em uma fonte de receita recorrente para o Solara Connect, utilizando dados de cliques reais capturados pelo Supabase de forma 100% isolada e silenciosa.

---

## 📈 1. A Estratégia Comercial (Como ganhar dinheiro)

Você tem em mãos **94 parceiros já catalogados** e um tráfego qualificado de médicos, dentistas e recepcionistas que operam o sistema diariamente. A estratégia de monetização é dividida em **3 Tiers (Níveis)**:

### 🥉 Tier 1: Parceiro Homologado Padrão (Gratuito / Baixo Custo)
* **O que é:** O parceiro aparece na lista padrão da sua categoria com descrição simples, link do site e WhatsApp comercial.
* **Preço Sugerido:** Gratuito (para gerar volume e atratividade na plataforma) ou uma taxa simbólica de configuração (ex: R$ 49 taxa única).
* **Benefício:** Dá robustez à sua plataforma, mostrando que o Solara Connect é um hub completo.

### 🥈 Tier 2: Parceiro Premium Comercial (Assinatura Mensal)
* **O que é:** O parceiro paga para ter destaque premium visual dentro da categoria (borda neon dourada, selo `"⭐ PREMIUM"`, card posicionado sempre no topo da categoria antes dos demais).
* **Preço Sugerido:** **R$ 99 a R$ 249 / mês**.
* **Gatilho de Venda:** Você pode apresentar o relatório de cliques reais acumulados: *"Sua marca teve 45 cliques de clínicas este mês. Com a assinatura Premium, você fica no topo e essa conversão costuma dobrar."*

### 🥇 Tier 3: Espaço Exclusivo de Patrocínio (Venda de Slots)
* **O que é:** Os 13 slots `"Espaço Exclusivo"` (um por categoria) que redirecionam direto para o seu WhatsApp comercial com uma mensagem pronta dizendo: *"Tenho interesse em homologar minha marca de X no Solara Connect"*.
* **Preço Sugerido:** **R$ 299 a R$ 499 / mês** por categoria.
* **Gatilho de Venda:** Você vende a "exclusividade daquele slot promocional" para um fornecedor forte da região ou nacional.

---

## 🛠️ 2. Guia de Configuração Técnica do Banco de Dados

Toda a infraestrutura é independente do sistema de prontuários e agendamento da clínica. Ela registra os cliques silenciosamente.

### Passo 1: Executar o Script SQL no Supabase
1. Acesse o seu [Supabase Dashboard](https://supabase.com).
2. Vá em **SQL Editor** no menu lateral esquerdo.
3. Clique em **New Query** (Nova Consulta).
4. Copie e cole o script abaixo e clique em **Run** (Executar):

```sql
-- Criar a tabela independente de cliques de parceiros
CREATE TABLE IF NOT EXISTS public.solara_partners_clicks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    partner_id VARCHAR(50) NOT NULL,
    partner_name VARCHAR(100) NOT NULL,
    category_title VARCHAR(100) NOT NULL,
    click_type VARCHAR(20) NOT NULL CHECK (click_type IN ('website', 'whatsapp')),
    clinic_id UUID, -- Opcional: Se logado, vincula à clínica que clicou
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Habilitar RLS (Row Level Security) para segurança
ALTER TABLE public.solara_partners_clicks ENABLE ROW LEVEL SECURITY;

-- Política de Inserção: Permite que cliques sejam inseridos pelo client-side
CREATE POLICY "Permitir inserções públicas de cliques" 
ON public.solara_partners_clicks 
FOR INSERT 
WITH CHECK (true);

-- Política de Leitura: Permite leitura geral para renderizar o Analytics
CREATE POLICY "Permitir leitura geral de cliques" 
ON public.solara_partners_clicks 
FOR SELECT 
USING (true);

-- Índices de performance para relatórios ultra-rápidos e eficientes
CREATE INDEX IF NOT EXISTS idx_partner_clicks_partner ON public.solara_partners_clicks(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_clicks_clinic ON public.solara_partners_clicks(clinic_id);
CREATE INDEX IF NOT EXISTS idx_partner_clicks_created_at ON public.solara_partners_clicks(created_at DESC);
```

---

## 📊 3. O Rastreamento de Métricas (Métricas de Valor)

Quando a recepcionista ou médico clicar em **"Acesse o Site"** ou no ícone do **"WhatsApp"**, o sistema realiza uma chamada assíncrona não-bloqueante que persiste:

* **WhatsApp Clicks:** Quantidade de leads quentes gerados para a equipe comercial do parceiro.
* **Website Clicks:** Tráfego e visitas gerados para o e-commerce do parceiro.
* **Cliques por Clínica:** Permite a você auditar quais clínicas estão mais engajadas com compras e suprimentos B2B.

Isso garante dados auditáveis para a sua cobrança comercial futura de forma transparente, profissional e altamente rentável.
