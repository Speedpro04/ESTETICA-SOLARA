-- =============================================================================
-- 02 — DOMÍNIO DE ESTÉTICA: procedimentos, pacientes, agenda, conhecimento
-- =============================================================================
-- O schema antigo era de clínica médica genérica: paciente com CPF e data de
-- nascimento desde o primeiro contato, agendamento com sala e "Consulta", base
-- de conhecimento com convênio. Nada disso descreve estética ou plástica.
--
-- O que muda de verdade:
--
--   - PROCEDIMENTO vira entidade. Antes era texto solto na base de
--     conhecimento, então o SDR não tinha como qualificar "interessada em
--     rinoplastia" de forma estruturada e o painel não sabia dizer qual
--     procedimento puxa mais gente.
--
--   - PACIENTE só existe depois que a pessoa vira cliente. Quem só perguntou
--     preço é conversa (arquivo 03), não paciente. O webhook antigo criava um
--     paciente para todo número que mandasse mensagem, e a base da clínica
--     enchia de curioso sem CPF.
--
--   - CONVÊNIO sai. Procedimento estético não é coberto; o que existe é
--     parcelamento. Perguntar "particular ou convênio" entrega na primeira
--     mensagem que o sistema não é do ramo.
-- =============================================================================

-- 1. PROCEDIMENTOS -----------------------------------------------------------
-- Catálogo por clínica. Base da qualificação do SDR e do que o Agendador marca.
CREATE TABLE public.procedures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,

    nome TEXT NOT NULL,
    -- Como o lead chama, não como a clínica chama: "botox" para toxina
    -- botulínica, "preenchimento de bigode chinês" para ácido hialurônico.
    -- É por aqui que o SDR reconhece o interesse na fala espontânea.
    apelidos TEXT[] NOT NULL DEFAULT '{}',
    categoria TEXT NOT NULL DEFAULT 'outro'
        CHECK (categoria IN ('facial', 'corporal', 'injetavel', 'cirurgico', 'capilar', 'outro')),
    descricao TEXT,

    -- Centavos, como em plans. Faixa e não valor único porque em estética o
    -- preço depende de região, quantidade de sessões e da avaliação.
    preco_de_centavos INTEGER,
    preco_ate_centavos INTEGER,
    duracao_minutos INTEGER,
    sessoes_tipicas INTEGER,
    parcelamento_maximo INTEGER,

    exige_avaliacao BOOLEAN NOT NULL DEFAULT true,
    preparo TEXT,          -- o que a pessoa precisa saber antes
    recuperacao TEXT,      -- downtime, em linguagem de leigo

    -- Contraindicação NÃO é campo para a IA recitar. É sinalizador: se o lead
    -- perguntar sobre risco, quem responde é a equipe. Ver escalation_rules.
    contraindicacoes TEXT,
    escalar_se_perguntarem_risco BOOLEAN NOT NULL DEFAULT true,

    ativo BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT procedures_nome_por_clinica UNIQUE (clinic_id, nome),
    -- Faixa invertida só pode ser erro de digitação no painel.
    CONSTRAINT procedures_faixa_valida CHECK (
        preco_de_centavos IS NULL
        OR preco_ate_centavos IS NULL
        OR preco_de_centavos <= preco_ate_centavos
    )
);

-- Parcial: toda listagem do painel e toda consulta do SDR filtram por ativo.
CREATE INDEX idx_procedures_clinic ON public.procedures (clinic_id) WHERE ativo;
-- GIN para casar o que o lead escreveu contra a lista de apelidos.
CREATE INDEX idx_procedures_apelidos ON public.procedures USING GIN (apelidos);

-- 2. PACIENTES ---------------------------------------------------------------
-- Só quem virou cliente. Antes disso a pessoa é uma conversa (arquivo 03).
CREATE TABLE public.patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,

    name TEXT NOT NULL,
    phone TEXT,          -- só dígitos com DDI, igual ao wa_contact_id
    email TEXT,
    cpf TEXT,
    birth_date DATE,

    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT patients_cpf_por_clinica UNIQUE (clinic_id, cpf)
);

CREATE INDEX idx_patients_clinic ON public.patients (clinic_id);
-- Telefone é como o webhook reencontra a pessoa; único por clínica evita o
-- cadastro duplicado que obrigava o backend antigo a juntar históricos na mão.
CREATE UNIQUE INDEX idx_patients_phone_por_clinica
    ON public.patients (clinic_id, phone) WHERE phone IS NOT NULL;

-- 3. AGENDA ------------------------------------------------------------------
CREATE TABLE public.appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
    professional_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    procedure_id UUID REFERENCES public.procedures(id) ON DELETE SET NULL,

    -- Em estética o primeiro compromisso quase nunca é o procedimento: é a
    -- avaliação. Tratar tudo como "Consulta" apaga essa diferença, que é
    -- justamente a que o Agendador precisa saber para propor horário.
    tipo TEXT NOT NULL DEFAULT 'avaliacao'
        CHECK (tipo IN ('avaliacao', 'procedimento', 'retorno', 'manutencao')),

    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show')),

    -- Carimbado quando o lembrete sai; a resposta "Sim/Não" só vale dentro de
    -- uma janela a partir daqui.
    reminder_sent_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT appointments_intervalo_valido CHECK (end_time > start_time)
);

-- Composto na ordem que a agenda do painel consulta: clínica, depois período.
CREATE INDEX idx_appointments_clinic_start ON public.appointments (clinic_id, start_time);
CREATE INDEX idx_appointments_patient ON public.appointments (patient_id);
CREATE INDEX idx_appointments_professional ON public.appointments (professional_id, start_time);
CREATE INDEX idx_appointments_procedure ON public.appointments (procedure_id);

-- 4. BASE DE CONHECIMENTO ----------------------------------------------------
-- Texto livre que a clínica escreve. É o que impede a Solara de inventar: o
-- backend injeta estas entradas no contexto do modelo. O briefing (arquivo 03)
-- é o complemento tipado, para o que o código precisa ler como dado.
CREATE TABLE public.clinic_knowledge (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    -- 'insurance' saiu: não existe convênio em estética. Entrou 'pos_cuidado',
    -- que é a dúvida mais comum depois do procedimento.
    kind TEXT NOT NULL DEFAULT 'general'
        CHECK (kind IN ('procedimento', 'preco', 'horario', 'faq', 'politica', 'pos_cuidado', 'general')),
    title TEXT,
    content TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clinic_knowledge_clinic
    ON public.clinic_knowledge (clinic_id, priority DESC) WHERE active;

-- 5. updated_at --------------------------------------------------------------
CREATE TRIGGER trg_procedures_updated_at BEFORE UPDATE ON public.procedures
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_patients_updated_at BEFORE UPDATE ON public.patients
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_appointments_updated_at BEFORE UPDATE ON public.appointments
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_clinic_knowledge_updated_at BEFORE UPDATE ON public.clinic_knowledge
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
