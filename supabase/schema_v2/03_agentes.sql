-- =============================================================================
-- 03 — TIME DE AGENTES: máquina de estados, briefing, handoff, follow-up
-- =============================================================================
-- Os quatro agentes (SDR, Agendador, Follow-up, Handoff) não são quatro números
-- nem quatro conversas: são papéis por trás de UM número por clínica. O lead não
-- percebe a troca. Quem decide qual agente responde é o `stage` da conversa.
--
-- A CONVERSA É O LEAD. Não existe tabela `leads` separada: seriam duas entidades
-- 1:1 dizendo a mesma coisa. `conversations.stage` é o funil que o painel
-- agrupa, e `patient_id` só é preenchido quando a pessoa vira cliente de fato.
--
-- Três exigências da API oficial da Meta que viram coluna aqui:
--
--   wa_message_id único  A Meta reenvia o webhook sempre que não recebe 200
--                        rápido. Sem trava de unicidade, a mesma mensagem gera
--                        duas ou três respostas da Solara.
--   last_inbound_at      Define se o próximo envio pode ser texto livre (dentro
--                        da janela de 24h) ou precisa ser template pago. Sem o
--                        campo, a decisão vira erro em tempo de execução.
--   ai_locked_until      Enquanto um humano atende, os outros agentes calam.
-- =============================================================================

-- 1. TIPOS -------------------------------------------------------------------

-- Estágio da conversa: é o funil E o roteador, na mesma coluna.
--
-- 'follow_up' NÃO é estágio, por desenho. Follow-up é gatilho + template: ele
-- toca a conversa sem mudar onde ela está, e quando o lead responde ele
-- continua exatamente de onde parou. Se virasse estágio, o retorno perderia o
-- contexto — que é o problema que previous_stage existe para evitar no handoff.
CREATE TYPE public.conversation_stage AS ENUM (
    'novo',              -- primeiro contato
    'qualificando',      -- SDR trabalhando
    'qualificado',       -- passou os critérios; vai para o Agendador
    'agendando',         -- Agendador proponto horários
    'agendado',          -- avaliação/procedimento confirmado
    'aguardando_humano', -- Handoff: trava a IA
    'perdido',           -- desqualificado ou desistiu
    'encerrado'          -- ciclo concluído
);

CREATE TYPE public.agent_role AS ENUM ('sdr', 'agendador', 'follow_up', 'handoff');

CREATE TYPE public.transition_trigger AS ENUM (
    'inbound',  -- mensagem do lead
    'ia',       -- decisão do agente
    'humano',   -- atendente pelo painel
    'regra',    -- regra determinística de escalonamento
    'sistema',  -- rotina interna
    'timeout'   -- prazo estourado
);

CREATE TYPE public.handoff_channel AS ENUM ('painel', 'whatsapp', 'email');

-- 2. ROTEAMENTO estágio -> agente --------------------------------------------
-- Definida ANTES de conversations: o índice de expressão lá embaixo depende
-- dela, e função criada depois da tabela faz o arquivo falhar em banco novo.
--
-- IMMUTABLE porque é usada em índice. Trocar o mapeamento depois exige
-- recriar o índice — de propósito: é uma decisão de arquitetura, não um ajuste.
CREATE OR REPLACE FUNCTION public.agent_for_stage(p_stage public.conversation_stage)
RETURNS public.agent_role
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE p_stage
        WHEN 'novo'              THEN 'sdr'::public.agent_role
        WHEN 'qualificando'      THEN 'sdr'::public.agent_role
        WHEN 'qualificado'       THEN 'agendador'::public.agent_role
        WHEN 'agendando'         THEN 'agendador'::public.agent_role
        WHEN 'aguardando_humano' THEN 'handoff'::public.agent_role
        -- agendado/perdido/encerrado: nenhum agente conduz fluxo ativo. Quem
        -- pode tocar a conversa nesses estados é o Follow-up, e ele é gatilho,
        -- não agente residente — por isso NULL, e não 'follow_up'.
        ELSE NULL
    END;
$$;

-- 3. NÚMEROS DO WHATSAPP -----------------------------------------------------
-- Tabela separada, e não colunas em clinics, por dois motivos: a Meta trabalha
-- com N números dentro de um WABA, e clínica com duas unidades vai querer dois
-- números antes do que se imagina.
CREATE TABLE public.wa_phone_numbers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,

    -- Chave de roteamento do webhook. Único de verdade: dois tenants com o
    -- mesmo phone_number_id mandariam a conversa para a clínica errada, que é o
    -- pior vazamento possível neste produto.
    phone_number_id TEXT NOT NULL UNIQUE,
    waba_id TEXT,
    display_phone_number TEXT,
    verified_name TEXT,
    quality_rating TEXT,

    -- O token que envia em nome da clínica NÃO fica aqui. Só a referência no
    -- gerenciador de segredos: token de envio no banco significa que qualquer
    -- leitura indevida vira capacidade de mandar mensagem pelo número da clínica.
    access_token_ref TEXT,
    app_secret_ref TEXT,
    webhook_verify_token TEXT,

    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'verificando', 'conectado', 'suspenso', 'desconectado')),
    connected_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wa_phone_numbers_clinic ON public.wa_phone_numbers (clinic_id);

-- 4. BRIEFING ----------------------------------------------------------------
-- Um formulário, quatro agentes. É o complemento TIPADO da clinic_knowledge:
-- lá fica o texto que a clínica escreve, aqui o que o código lê como dado.
CREATE TABLE public.clinic_briefing (
    clinic_id UUID PRIMARY KEY REFERENCES public.clinics(id) ON DELETE CASCADE,

    -- ---- Identidade (todos os agentes) -------------------------------------
    tom_de_voz TEXT,
    tratamento TEXT NOT NULL DEFAULT 'voce'
        CHECK (tratamento IN ('voce', 'senhor_senhora')),
    usar_emoji BOOLEAN NOT NULL DEFAULT false,
    palavras_proibidas TEXT[] NOT NULL DEFAULT '{}',
    publico_alvo TEXT,
    diferenciais TEXT,

    -- ---- Preço (SDR) --------------------------------------------------------
    -- A decisão comercial mais sensível do nicho. 'nunca' é o default: clínica
    -- de alto padrão não divulga valor antes da avaliação, e a IA entregar o
    -- preço no WhatsApp custa a consulta presencial.
    divulgacao_preco TEXT NOT NULL DEFAULT 'nunca'
        CHECK (divulgacao_preco IN ('valor', 'faixa', 'nunca')),
    resposta_quando_nao_informa TEXT,
    condicoes_pagamento TEXT,
    parcelamento_maximo INTEGER,

    -- ---- Qualificação (SDR) -------------------------------------------------
    criterio_qualificado TEXT,        -- em texto, entra no prompt do SDR
    exige_interesse_procedimento BOOLEAN NOT NULL DEFAULT true,
    exige_sinal_orcamento BOOLEAN NOT NULL DEFAULT false,
    exige_urgencia BOOLEAN NOT NULL DEFAULT false,
    idade_minima INTEGER NOT NULL DEFAULT 18,   -- menor de idade escala sempre

    -- ---- Agenda (Agendador) -------------------------------------------------
    horarios JSONB NOT NULL DEFAULT '{}'::JSONB,  -- {"seg": [["09:00","18:00"]]}
    feriados DATE[] NOT NULL DEFAULT '{}',
    antecedencia_minima_horas INTEGER NOT NULL DEFAULT 24,
    antecedencia_maxima_dias INTEGER NOT NULL DEFAULT 60,
    duracao_avaliacao_minutos INTEGER NOT NULL DEFAULT 30,
    aviso_cancelamento_horas INTEGER NOT NULL DEFAULT 24,
    politica_cancelamento TEXT,
    avaliacao_e_paga BOOLEAN NOT NULL DEFAULT false,
    avaliacao_preco_centavos INTEGER,

    -- ---- Handoff ------------------------------------------------------------
    handoff_so_em_horario_comercial BOOLEAN NOT NULL DEFAULT false,
    handoff_prazo_assumir_minutos INTEGER NOT NULL DEFAULT 15,
    -- Devolve a conversa à IA se ninguém assumir. Obrigatório, não opcional:
    -- sem ele o lead entra em 'aguardando_humano' numa sexta à tarde, ninguém
    -- abre o painel, e ele nunca mais recebe resposta.
    handoff_timeout_minutos INTEGER NOT NULL DEFAULT 120,
    handoff_mensagem_espera TEXT,

    -- ---- Follow-up ----------------------------------------------------------
    -- Cada tentativa fora da janela de 24h é conversa PAGA na Meta. O teto vive
    -- aqui e é conferido antes de disparar: follow-up sem limite transforma
    -- lead frio em prejuízo recorrente que ninguém vê na fatura.
    follow_up_ativo BOOLEAN NOT NULL DEFAULT true,
    follow_up_max_tentativas INTEGER NOT NULL DEFAULT 2,
    follow_up_silencio_inicio TIME NOT NULL DEFAULT '21:00',
    follow_up_silencio_fim TIME NOT NULL DEFAULT '08:00',
    follow_up_parar_se_optout BOOLEAN NOT NULL DEFAULT true,

    -- ---- Conformidade -------------------------------------------------------
    -- Publicidade em estética tem limite (CFM 2.336/2023 e conselhos das demais
    -- categorias): nada de promessa de resultado, antes/depois ou
    -- sensacionalismo. Fica no briefing porque cada clínica tem um conselho e
    -- um jurídico diferentes.
    proibir_promessa_resultado BOOLEAN NOT NULL DEFAULT true,
    observacoes_conformidade TEXT,

    secoes_preenchidas TEXT[] NOT NULL DEFAULT '{}',
    preenchido_em TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT briefing_tentativas_sensatas
        CHECK (follow_up_max_tentativas BETWEEN 0 AND 5)
);

-- Objeções autorizadas (SDR). Resposta pronta e aprovada pela clínica — a IA
-- não improvisa argumento comercial.
CREATE TABLE public.briefing_objections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    objecao TEXT NOT NULL,
    resposta TEXT NOT NULL,
    categoria TEXT NOT NULL DEFAULT 'preco'
        CHECK (categoria IN ('preco', 'medo', 'tempo', 'confianca', 'concorrente', 'outro')),
    ativo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_objections_clinic ON public.briefing_objections (clinic_id) WHERE ativo;

-- 5. REGRAS DE ESCALONAMENTO (Handoff) ---------------------------------------
-- Camada determinística, avaliada ANTES de a mensagem chegar no modelo.
-- Pergunta sobre contraindicação, risco ou reação adversa não pode depender do
-- julgamento do LLM: o match textual escala primeiro e o modelo vira segundo
-- filtro, nunca o único.
--
-- Em tabela, e não no prompt, porque o disparo precisa ser auditável: quando a
-- clínica perguntar "por que a IA respondeu isso?", a resposta tem que estar no
-- banco. clinic_id NULO = regra global da Axos, que a clínica não remove.
CREATE TABLE public.escalation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE,
    rotulo TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'palavra_chave'
        CHECK (tipo IN ('palavra_chave', 'topico', 'sempre')),
    -- palavra_chave: casa contra o texto normalizado da mensagem.
    -- topico: descrição em linguagem natural, avaliada pelo classificador.
    palavras TEXT[] NOT NULL DEFAULT '{}',
    padrao TEXT,
    severidade TEXT NOT NULL DEFAULT 'alta'
        CHECK (severidade IN ('baixa', 'media', 'alta', 'critica')),
    notificar_imediatamente BOOLEAN NOT NULL DEFAULT true,
    mensagem_de_espera TEXT,     -- o que a IA diz antes de calar
    ativo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_escalation_clinic ON public.escalation_rules (clinic_id) WHERE ativo;
CREATE INDEX idx_escalation_palavras ON public.escalation_rules USING GIN (palavras);

-- Quem recebe o alerta quando o handoff abre.
CREATE TABLE public.handoff_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    canal public.handoff_channel NOT NULL DEFAULT 'painel',
    endereco TEXT,      -- telefone ou e-mail; nulo para 'painel'
    severidade_minima TEXT NOT NULL DEFAULT 'media'
        CHECK (severidade_minima IN ('baixa', 'media', 'alta', 'critica')),
    ativo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_handoff_recipients_clinic ON public.handoff_recipients (clinic_id) WHERE ativo;

-- 6. TEMPLATES DA META -------------------------------------------------------
-- Fora da janela de 24h só sai template aprovado. O Follow-up depende disto:
-- sem template aprovado, o agente 4 não tem como abrir conversa.
CREATE TABLE public.wa_message_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE,  -- nulo = global
    name TEXT NOT NULL,                 -- nome exato registrado na Meta
    language TEXT NOT NULL DEFAULT 'pt_BR',
    -- Categoria não é detalhe de cadastro: marketing e utility têm preço
    -- diferente por conversa iniciada. Follow-up de lead frio é marketing;
    -- lembrete de consulta já marcada é utility, e custa bem menos.
    categoria TEXT NOT NULL DEFAULT 'marketing'
        CHECK (categoria IN ('marketing', 'utility', 'authentication')),
    proposito TEXT NOT NULL
        CHECK (proposito IN ('follow_up', 'lembrete', 'confirmacao', 'reativacao', 'outro')),
    corpo TEXT NOT NULL,                -- cópia local, com {{1}}, {{2}}...
    variaveis JSONB NOT NULL DEFAULT '[]'::JSONB,
    status TEXT NOT NULL DEFAULT 'pendente'
        CHECK (status IN ('pendente', 'aprovado', 'rejeitado', 'pausado', 'desativado')),
    motivo_rejeicao TEXT,
    aprovado_em TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT templates_nome_unico UNIQUE (clinic_id, name, language)
);

CREATE INDEX idx_templates_clinic ON public.wa_message_templates (clinic_id, status);

-- Cadência: o passo N usa o template X depois de Y horas paradas.
CREATE TABLE public.followup_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    passo INTEGER NOT NULL CHECK (passo >= 1),
    espera_horas INTEGER NOT NULL CHECK (espera_horas > 0),
    template_id UUID REFERENCES public.wa_message_templates(id) ON DELETE SET NULL,
    -- Cadência varia por estágio: quem sumiu na qualificação recebe uma
    -- mensagem, quem sumiu escolhendo horário recebe outra. Nulo = vale p/ todos.
    aplica_ao_estagio public.conversation_stage,
    ativo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_followup_steps_clinic ON public.followup_steps (clinic_id, passo);

-- 7. CONVERSAS (o lead + a máquina de estados) -------------------------------
CREATE TABLE public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    phone_number_id TEXT REFERENCES public.wa_phone_numbers(phone_number_id) ON DELETE SET NULL,

    -- wa_id da Meta: só dígitos, com DDI. Identidade estável da conversa.
    wa_contact_id TEXT NOT NULL,
    contact_name TEXT,                 -- profile.name do webhook

    -- Nulo enquanto for só interessado. Preenchido quando vira cliente — é esta
    -- nulidade que impede a base de pacientes de encher de curioso.
    patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,

    -- ---- Funil + roteamento -------------------------------------------------
    stage public.conversation_stage NOT NULL DEFAULT 'novo',
    previous_stage public.conversation_stage,
    stage_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- ---- Classificação do lead (o que o painel mostra) ---------------------
    origem TEXT NOT NULL DEFAULT 'whatsapp'
        CHECK (origem IN ('whatsapp', 'instagram', 'facebook', 'trafego_pago', 'indicacao', 'site', 'outro')),
    procedure_id UUID REFERENCES public.procedures(id) ON DELETE SET NULL,
    -- O que a pessoa falou quando não bate com o catálogo ("afinar o nariz").
    procedimento_texto TEXT,
    sinal_orcamento TEXT,
    urgencia TEXT CHECK (urgencia IN ('imediata', 'ate_30_dias', 'sem_pressa')),
    qualificacao JSONB NOT NULL DEFAULT '{}'::JSONB,
    qualificado_em TIMESTAMPTZ,
    motivo_perda TEXT,

    -- ---- Handoff ------------------------------------------------------------
    handoff_motivo TEXT,
    handoff_severidade TEXT
        CHECK (handoff_severidade IN ('baixa', 'media', 'alta', 'critica')),
    handoff_rule_id UUID REFERENCES public.escalation_rules(id) ON DELETE SET NULL,
    handoff_aberto_em TIMESTAMPTZ,
    handoff_assumido_por UUID REFERENCES public.users(id) ON DELETE SET NULL,
    handoff_assumido_em TIMESTAMPTZ,
    -- Trava explícita. O estágio 'aguardando_humano' já silencia os agentes;
    -- este campo cobre o caso de silenciar SEM mudar de estágio (atendente
    -- assumiu por vontade própria, sem regra ter disparado).
    ai_locked_until TIMESTAMPTZ,

    -- ---- Janela de 24h ------------------------------------------------------
    last_inbound_at TIMESTAMPTZ,
    last_outbound_at TIMESTAMPTZ,
    message_count INTEGER NOT NULL DEFAULT 0,

    -- ---- Follow-up ----------------------------------------------------------
    follow_up_count INTEGER NOT NULL DEFAULT 0,
    last_follow_up_at TIMESTAMPTZ,
    next_follow_up_at TIMESTAMPTZ,
    opted_out BOOLEAN NOT NULL DEFAULT false,
    opted_out_at TIMESTAMPTZ,

    -- Substitui a varredura de 50 mensagens que o backend antigo fazia a cada
    -- turno só para decidir se a Solara já tinha se apresentado.
    apresentada BOOLEAN NOT NULL DEFAULT false,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Uma conversa por número, por clínica. A mesma pessoa pode falar com duas
    -- clínicas do sistema sem que os históricos se misturem.
    CONSTRAINT conversations_contato_unico UNIQUE (clinic_id, wa_contact_id)
);

CREATE INDEX idx_conversations_clinic_stage ON public.conversations (clinic_id, stage);
-- Índice de expressão em vez de coluna gerada: o mapeamento estágio->agente
-- pode mudar, e trocar um índice é barato; reescrever coluna STORED, não.
CREATE INDEX idx_conversations_agente
    ON public.conversations (clinic_id, public.agent_for_stage(stage));
CREATE INDEX idx_conversations_patient ON public.conversations (patient_id);
CREATE INDEX idx_conversations_procedure ON public.conversations (procedure_id);
CREATE INDEX idx_conversations_phone_number ON public.conversations (phone_number_id);
CREATE INDEX idx_conversations_criacao ON public.conversations (clinic_id, created_at DESC);
-- Parciais: as duas filas operacionais varrem só o que está pendente, não a base.
CREATE INDEX idx_conversations_handoff
    ON public.conversations (clinic_id, handoff_aberto_em)
    WHERE stage = 'aguardando_humano';
CREATE INDEX idx_conversations_follow_up
    ON public.conversations (next_follow_up_at)
    WHERE next_follow_up_at IS NOT NULL;

-- 8. GRAFO DE TRANSIÇÕES -----------------------------------------------------
-- Em tabela, e não num CASE dentro da função: assim o grafo é inspecionável e
-- uma clínica-piloto ganha um caminho a mais sem reescrever código.
CREATE TABLE public.stage_transition_rules (
    from_stage public.conversation_stage NOT NULL,
    to_stage public.conversation_stage NOT NULL,
    descricao TEXT,
    PRIMARY KEY (from_stage, to_stage)
);

-- 9. HISTÓRICO DE TRANSIÇÕES -------------------------------------------------
-- Append-only. clinic_id é denormalizado de propósito: RLS e relatório por
-- clínica não deveriam precisar de join com conversations.
CREATE TABLE public.conversation_transitions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    from_stage public.conversation_stage,
    to_stage public.conversation_stage NOT NULL,
    from_agent public.agent_role,
    to_agent public.agent_role,
    gatilho public.transition_trigger NOT NULL DEFAULT 'ia',
    -- true quando um humano forçou caminho fora do grafo. É o campo que
    -- responde, três meses depois, "o grafo está errado ou foi exceção?".
    forcada BOOLEAN NOT NULL DEFAULT false,
    motivo TEXT,
    actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transitions_conversation
    ON public.conversation_transitions (conversation_id, created_at DESC);
CREATE INDEX idx_transitions_clinic
    ON public.conversation_transitions (clinic_id, created_at DESC);

-- 10. ALERTAS DE HANDOFF -----------------------------------------------------
CREATE TABLE public.handoff_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    recipient_id UUID REFERENCES public.handoff_recipients(id) ON DELETE SET NULL,
    canal public.handoff_channel NOT NULL,
    endereco TEXT,
    status TEXT NOT NULL DEFAULT 'na_fila'
        CHECK (status IN ('na_fila', 'enviado', 'falhou', 'visto')),
    erro TEXT,
    enviado_em TIMESTAMPTZ,
    visto_em TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_handoff_alerts_fila ON public.handoff_alerts (status, created_at)
    WHERE status = 'na_fila';
CREATE INDEX idx_handoff_alerts_conversation ON public.handoff_alerts (conversation_id);

-- 11. MENSAGENS --------------------------------------------------------------
CREATE TABLE public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
    patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,

    content TEXT NOT NULL,
    direction TEXT NOT NULL DEFAULT 'inbound'
        CHECK (direction IN ('inbound', 'outbound')),
    sender_type TEXT NOT NULL DEFAULT 'lead'
        CHECK (sender_type IN ('lead', 'ia', 'humano', 'sistema')),
    -- Qual dos quatro redigiu. Sem isso não dá para medir onde o time perde lead.
    agent public.agent_role,

    status TEXT NOT NULL DEFAULT 'received'
        CHECK (status IN ('queued', 'sent', 'delivered', 'read', 'received', 'failed')),

    -- wamid da Meta.
    wa_message_id TEXT,
    template_name TEXT,
    -- Categoria cobrada. É por aqui que sai o custo real por clínica.
    categoria_cobranca TEXT
        CHECK (categoria_cobranca IN ('marketing', 'utility', 'service', 'authentication')),

    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A trava de idempotência: reentrega da Meta bate no conflito em vez de virar
-- resposta duplicada. Parcial porque mensagem enviada pelo painel não tem wamid.
CREATE UNIQUE INDEX idx_messages_wa_message_id
    ON public.messages (wa_message_id) WHERE wa_message_id IS NOT NULL;

CREATE INDEX idx_messages_conversation ON public.messages (conversation_id, created_at DESC);
CREATE INDEX idx_messages_clinic ON public.messages (clinic_id, created_at DESC);
CREATE INDEX idx_messages_patient ON public.messages (patient_id);
-- Relatório de custo: quanto a clínica gastou em conversa paga no período.
CREATE INDEX idx_messages_cobranca
    ON public.messages (clinic_id, categoria_cobranca, created_at)
    WHERE categoria_cobranca IS NOT NULL;

-- 12. VÍNCULO DA AGENDA COM O FUNIL ------------------------------------------
-- Feito aqui, e não no 02, porque conversations só existe a partir deste arquivo.
-- Sem ele não dá para dizer "esta avaliação veio do lead que chegou pelo
-- Instagram interessado em preenchimento".
ALTER TABLE public.appointments
    ADD COLUMN conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL;

CREATE INDEX idx_appointments_conversation ON public.appointments (conversation_id);

-- 13. updated_at -------------------------------------------------------------
CREATE TRIGGER trg_wa_phone_numbers_updated_at BEFORE UPDATE ON public.wa_phone_numbers
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_clinic_briefing_updated_at BEFORE UPDATE ON public.clinic_briefing
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_briefing_objections_updated_at BEFORE UPDATE ON public.briefing_objections
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_escalation_rules_updated_at BEFORE UPDATE ON public.escalation_rules
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_handoff_recipients_updated_at BEFORE UPDATE ON public.handoff_recipients
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_wa_message_templates_updated_at BEFORE UPDATE ON public.wa_message_templates
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_followup_steps_updated_at BEFORE UPDATE ON public.followup_steps
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_conversations_updated_at BEFORE UPDATE ON public.conversations
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_messages_updated_at BEFORE UPDATE ON public.messages
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
