-- =============================================================================
-- Solara Estética — time de agentes de IA sobre a API oficial (Meta Cloud API)
-- =============================================================================
-- O que este arquivo resolve, e que hoje não existe no banco:
--
--   1. Resolução de tenant pelo phone_number_id da Meta. Hoje o webhook resolve
--      pela instância da Evolution (clinics.whatsapp_instance_id) e, quando
--      falha, cai num fallback que descobre a clínica pelo telefone do PACIENTE
--      (_find_clinic_id_by_phone, em backend/app/api/evolution.py). Esse
--      fallback é um vazamento esperando acontecer: o mesmo número atendido por
--      duas clínicas cai na primeira que o banco devolver. Com número próprio
--      por clínica, o phone_number_id é determinístico e o fallback some.
--
--   2. Conversa como entidade. Hoje "a conversa" é uma busca por
--      messages.metadata->>_conversation_phone. Não há onde guardar estágio,
--      qualificação, trava de handoff ou controle da janela de 24h.
--
--   3. Máquina de estados com histórico. O roteamento entre SDR, Agendamento,
--      Handoff e Follow-up depende de estágio persistido e de saber de onde a
--      conversa veio — é o que faz o handoff devolver o lead ao ponto certo.
--
--   4. Idempotência. A Meta reenvia o webhook quando não recebe 200 rápido. Sem
--      chave única por message_id, o reenvio vira mensagem e resposta duplicada.
--
-- Convenção de nomes: identificadores em inglês, como no resto do schema
-- (clinics, appointments, clinic_knowledge). O documento de arquitetura usa
-- português; o de-para é:
--   estagio_atual    -> conversations.stage
--   estagio_anterior -> conversations.previous_stage
--   tenant_id        -> clinic_id
--
-- Esta migration é ADITIVA. Não remove as colunas da Evolution nem altera o
-- caminho que roda em produção hoje: as duas infraestruturas convivem até a
-- migração dos números para a Cloud API terminar.
-- =============================================================================


-- 1. TIPOS --------------------------------------------------------------------

-- Estágio da conversa. É o que decide qual agente responde.
-- Desenho: 'followup' NÃO é estágio. Follow-up é gatilho + template; quando o
-- lead responde, ele volta ao estágio onde parou. Se follow-up fosse estágio, o
-- retorno perderia o contexto — o mesmo problema que previous_stage existe para
-- evitar no handoff.
DO $$ BEGIN
    CREATE TYPE conversation_stage AS ENUM (
        'new',            -- primeiro contato, sem estágio definido
        'qualifying',     -- SDR trabalhando o lead
        'qualified',      -- SDR concluiu; pronto para agendar
        'scheduling',     -- Agendamento propondo horários
        'scheduled',      -- consulta/avaliação confirmada
        'awaiting_human', -- Handoff: trava a IA (ver ai_can_reply)
        'lost',           -- desqualificado ou desistiu
        'closed'          -- ciclo encerrado
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE agent_role AS ENUM ('sdr', 'scheduling', 'handoff', 'followup');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Quem provocou a transição. 'human' é o único que pode sair do grafo: a equipe
-- precisa conseguir destravar uma conversa presa, mesmo por um caminho não
-- previsto. Fica marcado como forçado para revisão depois.
DO $$ BEGIN
    CREATE TYPE transition_trigger AS ENUM (
        'inbound',  -- mensagem do lead
        'ai',       -- decisão do agente
        'human',    -- atendente da clínica pelo painel
        'system',   -- rotina interna
        'timeout'   -- prazo estourado (ex.: handoff sem ninguém assumir)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE handoff_channel AS ENUM ('panel', 'whatsapp', 'email');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- 2. ROTEAMENTO ESTÁGIO -> AGENTE ---------------------------------------------
-- Definida antes das tabelas porque conversations.current_agent é coluna
-- gerada a partir dela (e coluna gerada exige função IMMUTABLE já existente).
CREATE OR REPLACE FUNCTION public.agent_for_stage(p_stage conversation_stage)
RETURNS agent_role
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE p_stage
        WHEN 'new'            THEN 'sdr'::agent_role
        WHEN 'qualifying'     THEN 'sdr'::agent_role
        WHEN 'qualified'      THEN 'scheduling'::agent_role
        WHEN 'scheduling'     THEN 'scheduling'::agent_role
        WHEN 'awaiting_human' THEN 'handoff'::agent_role
        -- scheduled/lost/closed: nenhum agente conduz fluxo ativo. Quem pode
        -- tocar a conversa nesses estados é o Follow-up — e ele é gatilho, não
        -- agente residente. Por isso NULL, e não 'followup'.
        ELSE NULL
    END;
$$;


-- 3. NÚMEROS DO WHATSAPP (resolução de tenant) --------------------------------
-- Uma linha por número verificado no Business Manager. Tabela separada, e não
-- colunas em clinics, por dois motivos: a Meta trabalha com N números dentro de
-- um WABA, e clínica com duas unidades vai querer dois números antes do que se
-- imagina.
CREATE TABLE IF NOT EXISTS wa_phone_numbers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,

    -- Chave de roteamento: chega em entry[].changes[].value.metadata.
    phone_number_id TEXT NOT NULL UNIQUE,
    waba_id TEXT,                     -- WhatsApp Business Account
    display_phone_number TEXT,        -- +55 11 9... (como o lead vê)
    verified_name TEXT,               -- nome aprovado pela Meta
    quality_rating TEXT,              -- GREEN/YELLOW/RED, espelhado do painel da Meta

    -- O token de System User que envia em nome da clínica NÃO fica aqui. Este
    -- campo guarda a referência no gerenciador de segredos. Token de envio no
    -- banco significa que qualquer leitura indevida vira capacidade de mandar
    -- mensagem no número da clínica.
    access_token_ref TEXT,
    -- Verificação do webhook (hub.verify_token) e assinatura X-Hub-Signature-256.
    webhook_verify_token TEXT,
    app_secret_ref TEXT,

    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'verifying', 'connected', 'suspended', 'disconnected')),
    connected_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);


-- 4. BRIEFING DA CLÍNICA ------------------------------------------------------
-- Fonte estruturada que alimenta os quatro agentes. Não substitui
-- clinic_knowledge: aquilo continua sendo o texto livre que a clínica escreve;
-- isto é o que o código precisa ler de forma tipada (teto de preço, prazo de
-- cancelamento, o que conta como lead qualificado, o que nunca responder).
CREATE TABLE IF NOT EXISTS clinic_briefing (
    clinic_id UUID PRIMARY KEY REFERENCES clinics(id) ON DELETE CASCADE,

    -- Seção 1 — Identidade e tom de voz (todos os agentes)
    brand_voice TEXT,
    formality TEXT NOT NULL DEFAULT 'voce'
        CHECK (formality IN ('voce', 'senhor_senhora')),
    allow_emoji BOOLEAN NOT NULL DEFAULT false,
    forbidden_words TEXT[] NOT NULL DEFAULT '{}',
    signature_note TEXT,                    -- diferencial que vale repetir

    -- Seção 2 — Postura de preço (SDR)
    -- A decisão comercial mais sensível do nicho. 'full' informa o valor,
    -- 'range' informa faixa, 'never' só na avaliação presencial.
    price_disclosure TEXT NOT NULL DEFAULT 'range'
        CHECK (price_disclosure IN ('full', 'range', 'never')),
    price_deflection TEXT,                  -- o que dizer quando não pode informar

    -- Seção 4 — Política de agenda (Agendamento)
    booking_min_notice_hours INTEGER NOT NULL DEFAULT 24,
    booking_max_days_ahead INTEGER NOT NULL DEFAULT 60,
    cancellation_notice_hours INTEGER NOT NULL DEFAULT 24,
    cancellation_policy TEXT,
    business_hours JSONB NOT NULL DEFAULT '{}'::JSONB,  -- {"mon": [["09:00","18:00"]], ...}
    holidays DATE[] NOT NULL DEFAULT '{}',
    first_visit_type TEXT NOT NULL DEFAULT 'avaliacao'
        CHECK (first_visit_type IN ('avaliacao', 'procedimento')),
    first_visit_is_paid BOOLEAN NOT NULL DEFAULT false,
    first_visit_price_cents INTEGER,

    -- Seção 5 — Qualificação (SDR): o que ESTA clínica chama de lead qualificado
    qualified_criteria TEXT,                -- em texto, entra no prompt do SDR
    require_procedure_interest BOOLEAN NOT NULL DEFAULT true,
    require_budget_signal BOOLEAN NOT NULL DEFAULT false,
    require_urgency BOOLEAN NOT NULL DEFAULT false,
    min_age INTEGER NOT NULL DEFAULT 18,    -- abaixo disso, escala por padrão

    -- Seção 7 — Pagamento (SDR)
    payment_methods TEXT[] NOT NULL DEFAULT '{}',
    max_installments INTEGER,
    installment_note TEXT,
    accepts_insurance BOOLEAN NOT NULL DEFAULT false,
    insurance_note TEXT,

    -- Seções 8 e 9 — Handoff
    handoff_business_hours_only BOOLEAN NOT NULL DEFAULT false,
    handoff_ack_minutes INTEGER NOT NULL DEFAULT 15,      -- prazo para um humano assumir
    handoff_timeout_minutes INTEGER NOT NULL DEFAULT 120, -- devolve à IA se ninguém assumir
    handoff_waiting_message TEXT,                         -- o que o lead lê enquanto espera

    -- Seção 10 — Follow-up
    followup_enabled BOOLEAN NOT NULL DEFAULT true,
    followup_max_attempts INTEGER NOT NULL DEFAULT 3,
    followup_quiet_start TIME NOT NULL DEFAULT '21:00',   -- não incomodar
    followup_quiet_end TIME NOT NULL DEFAULT '08:00',
    followup_stop_on_optout BOOLEAN NOT NULL DEFAULT true,

    -- Seção 11 — Conformidade (todos)
    -- Publicidade em estética tem limite (CFM 2.336/2023 e congêneres): sem
    -- promessa de resultado, sem antes/depois, sem sensacionalismo. Fica no
    -- briefing porque conselho e jurídico mudam de clínica para clínica.
    compliance_notes TEXT,
    forbid_result_promise BOOLEAN NOT NULL DEFAULT true,

    completed_sections TEXT[] NOT NULL DEFAULT '{}',
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seção 3 — Procedimentos (SDR qualifica, Agendamento reserva)
CREATE TABLE IF NOT EXISTS briefing_procedures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    aliases TEXT[] NOT NULL DEFAULT '{}',   -- como o lead chama ("botox" -> toxina)
    description TEXT,
    price_from_cents INTEGER,
    price_to_cents INTEGER,
    duration_minutes INTEGER,
    sessions_typical INTEGER,
    requires_evaluation BOOLEAN NOT NULL DEFAULT true,
    preparation TEXT,                       -- o que o lead precisa saber antes
    downtime TEXT,                          -- recuperação, em linguagem de leigo
    -- Contraindicação NÃO é campo para a IA recitar. É sinalizador: se o lead
    -- perguntar sobre isso, o Handoff assume. Quem responde risco é a equipe.
    contraindications TEXT,
    escalate_on_contraindication BOOLEAN NOT NULL DEFAULT true,
    active BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (clinic_id, name)
);

-- Seção 6 — Objeções (SDR)
CREATE TABLE IF NOT EXISTS briefing_objections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    objection TEXT NOT NULL,                -- "está caro", "tenho medo de agulha"
    response TEXT NOT NULL,                 -- resposta AUTORIZADA pela clínica
    category TEXT NOT NULL DEFAULT 'price'
        CHECK (category IN ('price', 'fear', 'time', 'trust', 'competitor', 'other')),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seção 8 — Regras de escalonamento (Handoff)
-- Uma linha = uma razão para tirar a IA do caminho. Em tabela, e não em texto
-- no prompt, porque o disparo precisa ser auditável: quando a clínica perguntar
-- "por que a IA respondeu isso?", a resposta tem que estar no banco.
CREATE TABLE IF NOT EXISTS briefing_escalation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    label TEXT NOT NULL,                    -- "pergunta sobre contraindicação"
    -- 'keyword' casa por termo (barato e determinístico). 'topic'/'intent'
    -- entram no prompt do classificador. 'always' é tópico que a IA nunca
    -- responde, ponto.
    kind TEXT NOT NULL DEFAULT 'topic'
        CHECK (kind IN ('topic', 'keyword', 'intent', 'always')),
    pattern TEXT,
    keywords TEXT[] NOT NULL DEFAULT '{}',
    severity TEXT NOT NULL DEFAULT 'high'
        CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    notify_immediately BOOLEAN NOT NULL DEFAULT true,
    holding_message TEXT,                   -- o que a IA diz antes de calar
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seção 9 — Quem recebe o alerta de handoff
CREATE TABLE IF NOT EXISTS handoff_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    channel handoff_channel NOT NULL DEFAULT 'panel',
    address TEXT,                           -- telefone ou e-mail; nulo para 'panel'
    min_severity TEXT NOT NULL DEFAULT 'medium'
        CHECK (min_severity IN ('low', 'medium', 'high', 'critical')),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);


-- 5. TEMPLATES DA META --------------------------------------------------------
-- Fora da janela de 24h só sai template aprovado. O Follow-up depende disto:
-- sem template aprovado, o agente 4 não tem como abrir conversa.
CREATE TABLE IF NOT EXISTS wa_message_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,  -- nulo = template global
    name TEXT NOT NULL,                     -- nome exato registrado na Meta
    language TEXT NOT NULL DEFAULT 'pt_BR',
    -- Categoria não é detalhe: marketing e utility têm preço diferente por
    -- conversa iniciada. Follow-up de lead frio é marketing; lembrete de
    -- consulta já marcada é utility, e custa menos.
    category TEXT NOT NULL DEFAULT 'marketing'
        CHECK (category IN ('marketing', 'utility', 'authentication')),
    purpose TEXT NOT NULL
        CHECK (purpose IN ('followup', 'reminder', 'confirmation', 'reactivation', 'other')),
    body TEXT NOT NULL,                     -- cópia local, com {{1}}, {{2}}...
    variables JSONB NOT NULL DEFAULT '[]'::JSONB,  -- [{"index":1,"source":"contact_name"}]
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'paused', 'disabled')),
    rejection_reason TEXT,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (clinic_id, name, language)
);

-- Seção 10 — Cadência: passo N usa o template X depois de Y horas de silêncio.
CREATE TABLE IF NOT EXISTS briefing_followup_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    step INTEGER NOT NULL CHECK (step >= 1),
    delay_hours INTEGER NOT NULL CHECK (delay_hours > 0),
    template_id UUID REFERENCES wa_message_templates(id) ON DELETE SET NULL,
    -- A cadência varia por estágio: quem sumiu na qualificação recebe uma
    -- mensagem; quem sumiu escolhendo horário recebe outra. Nulo = vale para todos.
    applies_to_stage conversation_stage,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (clinic_id, step, applies_to_stage)
);


-- 6. CONVERSAS (a máquina de estados) -----------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    phone_number_id TEXT REFERENCES wa_phone_numbers(phone_number_id) ON DELETE SET NULL,

    -- wa_id da Meta (só dígitos, com DDI). Identidade estável da conversa.
    wa_contact_id TEXT NOT NULL,
    contact_name TEXT,                      -- profile.name do webhook

    -- O lead vira paciente quando agenda. Antes disso patient_id é nulo — o
    -- webhook atual cria paciente para todo número que manda mensagem, o que
    -- enche a base de curioso que nunca marcou nada.
    patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,

    stage conversation_stage NOT NULL DEFAULT 'new',        -- estagio_atual
    previous_stage conversation_stage,                      -- estagio_anterior
    stage_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Derivada do estágio, nunca escrita à mão: agente e estágio não podem
    -- divergir. É o roteamento do documento de arquitetura, materializado.
    current_agent agent_role GENERATED ALWAYS AS (public.agent_for_stage(stage)) STORED,

    -- Qualificação (preenchida pelo SDR)
    procedure_interest TEXT,
    budget_signal TEXT,
    urgency TEXT,
    qualification JSONB NOT NULL DEFAULT '{}'::JSONB,
    qualified_at TIMESTAMPTZ,

    -- Handoff
    handoff_reason TEXT,
    handoff_severity TEXT
        CHECK (handoff_severity IN ('low', 'medium', 'high', 'critical')),
    handoff_rule_id UUID REFERENCES briefing_escalation_rules(id) ON DELETE SET NULL,
    handoff_started_at TIMESTAMPTZ,
    handoff_assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    handoff_acked_at TIMESTAMPTZ,
    -- Trava explícita da IA. O estágio 'awaiting_human' já silencia os agentes;
    -- este campo cobre silenciar SEM mudar de estágio (atendente que assume a
    -- conversa por vontade própria, sem regra disparada).
    ai_locked_until TIMESTAMPTZ,

    -- Janela de 24h da Meta. Sem last_inbound_at não há como saber se a próxima
    -- mensagem pode ser texto livre ou precisa ser template pago.
    last_inbound_at TIMESTAMPTZ,
    last_outbound_at TIMESTAMPTZ,
    message_count INTEGER NOT NULL DEFAULT 0,

    -- Follow-up: contador e agendamento. Não mexe em stage, por desenho.
    followup_count INTEGER NOT NULL DEFAULT 0,
    last_followup_at TIMESTAMPTZ,
    next_followup_at TIMESTAMPTZ,
    opted_out BOOLEAN NOT NULL DEFAULT false,
    opted_out_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Uma conversa por número, por clínica. O mesmo lead pode falar com duas
    -- clínicas do sistema sem que os históricos se misturem.
    UNIQUE (clinic_id, wa_contact_id)
);


-- 7. GRAFO DE TRANSIÇÕES PERMITIDAS -------------------------------------------
-- Em tabela, não em CASE dentro da função: assim o grafo é inspecionável, o
-- painel consegue desenhar o funil a partir dele, e uma clínica-piloto pode
-- ganhar um caminho a mais sem reescrever código.
CREATE TABLE IF NOT EXISTS stage_transition_rules (
    from_stage conversation_stage NOT NULL,
    to_stage conversation_stage NOT NULL,
    description TEXT,
    PRIMARY KEY (from_stage, to_stage)
);

INSERT INTO stage_transition_rules (from_stage, to_stage, description) VALUES
    ('new',            'qualifying',     'SDR assume o primeiro contato'),
    ('new',            'awaiting_human', 'Escalou já na primeira mensagem'),
    ('new',            'lost',           'Engano, spam ou fora de área'),
    ('qualifying',     'qualified',      'SDR bateu os critérios do briefing'),
    ('qualifying',     'scheduling',     'Lead já chegou pedindo horário'),
    ('qualifying',     'awaiting_human', 'Escalou durante a qualificação'),
    ('qualifying',     'lost',           'Sem fit ou desistiu'),
    ('qualified',      'scheduling',     'Passa para o agente de Agendamento'),
    ('qualified',      'awaiting_human', 'Escalou antes de agendar'),
    ('qualified',      'lost',           'Desistiu depois de qualificado'),
    ('scheduling',     'scheduled',      'Horário confirmado'),
    ('scheduling',     'qualified',      'Nenhum horário serviu; volta para nutrir'),
    ('scheduling',     'awaiting_human', 'Escalou durante o agendamento'),
    ('scheduling',     'lost',           'Desistiu ao ver a agenda'),
    ('scheduled',      'scheduling',     'Remarcação'),
    ('scheduled',      'closed',         'Compareceu; ciclo encerrado'),
    ('scheduled',      'awaiting_human', 'Escalou com consulta marcada'),
    ('scheduled',      'lost',           'Cancelou e não quis remarcar'),
    ('awaiting_human', 'qualifying',     'Humano devolveu para o SDR'),
    ('awaiting_human', 'qualified',      'Humano devolveu já qualificado'),
    ('awaiting_human', 'scheduling',     'Humano devolveu para agendar'),
    ('awaiting_human', 'scheduled',      'Humano agendou na mão'),
    ('awaiting_human', 'closed',         'Humano resolveu e encerrou'),
    ('awaiting_human', 'lost',           'Humano marcou como perdido'),
    ('lost',           'qualifying',     'Lead voltou sozinho'),
    ('lost',           'awaiting_human', 'Voltou com assunto sensível'),
    ('closed',         'qualifying',     'Novo ciclo: procurou de novo'),
    ('closed',         'scheduling',     'Voltou já querendo remarcar'),
    ('closed',         'awaiting_human', 'Voltou com assunto sensível')
ON CONFLICT (from_stage, to_stage) DO UPDATE SET description = EXCLUDED.description;


-- 8. HISTÓRICO DE TRANSIÇÕES --------------------------------------------------
-- Append-only. clinic_id é denormalizado de propósito: RLS e relatório de funil
-- por clínica não deveriam precisar de join com conversations.
CREATE TABLE IF NOT EXISTS conversation_transitions (
    id BIGSERIAL PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    from_stage conversation_stage,
    to_stage conversation_stage NOT NULL,
    from_agent agent_role,
    to_agent agent_role,
    trigger transition_trigger NOT NULL DEFAULT 'ai',
    -- true quando um humano forçou caminho fora do grafo. É o campo que
    -- responde, daqui a três meses, "o grafo está errado ou foi exceção?".
    forced BOOLEAN NOT NULL DEFAULT false,
    reason TEXT,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- 9. ALERTAS DE HANDOFF -------------------------------------------------------
CREATE TABLE IF NOT EXISTS handoff_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    recipient_id UUID REFERENCES handoff_recipients(id) ON DELETE SET NULL,
    channel handoff_channel NOT NULL,
    address TEXT,
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'sent', 'failed', 'acked')),
    error TEXT,
    sent_at TIMESTAMPTZ,
    acked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);


-- 10. MENSAGENS — colunas novas -----------------------------------------------
-- messages continua sendo a tabela única de histórico. Ganha vínculo com a
-- conversa, idempotência e a marca de qual agente falou.
ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS wa_message_id TEXT,
    ADD COLUMN IF NOT EXISTS agent agent_role,
    ADD COLUMN IF NOT EXISTS template_name TEXT,
    ADD COLUMN IF NOT EXISTS direction TEXT
        CHECK (direction IN ('inbound', 'outbound'));

-- Parcial porque as mensagens antigas (Evolution) não têm id da Meta.
CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_wa_message_id
    ON messages (wa_message_id) WHERE wa_message_id IS NOT NULL;


-- 11. FUNÇÕES DE ESTADO -------------------------------------------------------

-- A IA pode responder AGORA nesta conversa?
CREATE OR REPLACE FUNCTION public.ai_can_reply(p_conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT c.stage <> 'awaiting_human'
       AND (c.ai_locked_until IS NULL OR c.ai_locked_until <= NOW())
       AND NOT c.opted_out
      FROM conversations c
     WHERE c.id = p_conversation_id;
$$;

-- A janela de 24h ainda está aberta? Fora dela, só template aprovado.
CREATE OR REPLACE FUNCTION public.session_window_open(p_conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT c.last_inbound_at IS NOT NULL
       AND c.last_inbound_at > NOW() - INTERVAL '24 hours'
      FROM conversations c
     WHERE c.id = p_conversation_id;
$$;

-- Único caminho de escrita em conversations.stage. Valida contra o grafo,
-- guarda o estágio anterior e grava o histórico, tudo na mesma transação.
CREATE OR REPLACE FUNCTION public.advance_conversation_stage(
    p_conversation_id UUID,
    p_to_stage conversation_stage,
    p_trigger transition_trigger DEFAULT 'ai',
    p_reason TEXT DEFAULT NULL,
    p_actor_user_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS conversations
LANGUAGE plpgsql
AS $$
DECLARE
    v_conv conversations;
    v_from conversation_stage;
    v_allowed BOOLEAN;
    v_forced BOOLEAN := false;
    v_previous conversation_stage;
BEGIN
    -- FOR UPDATE: duas mensagens do mesmo lead podem chegar juntas, e sem trava
    -- as duas leem o mesmo estágio e gravam transições contraditórias.
    SELECT * INTO v_conv FROM conversations WHERE id = p_conversation_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Conversa % não encontrada', p_conversation_id
            USING ERRCODE = 'no_data_found';
    END IF;

    v_from := v_conv.stage;

    -- Reentrada no mesmo estágio não é transição. Sem isso o histórico enche de
    -- linhas iguais a cada mensagem e vira ruído.
    IF v_from = p_to_stage THEN
        RETURN v_conv;
    END IF;

    SELECT true INTO v_allowed
      FROM stage_transition_rules
     WHERE from_stage = v_from AND to_stage = p_to_stage;

    IF v_allowed IS NULL THEN
        IF p_trigger = 'human' THEN
            v_forced := true;   -- atendente destrava conversa presa
        ELSE
            RAISE EXCEPTION 'Transição % -> % não permitida', v_from, p_to_stage
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    -- previous_stage só é reescrito ao ENTRAR em handoff. Ao sair, é preservado:
    -- é o que permite auditar de onde o lead veio.
    v_previous := CASE
        WHEN p_to_stage = 'awaiting_human' THEN v_from
        ELSE v_conv.previous_stage
    END;

    UPDATE conversations
       SET stage = p_to_stage,
           previous_stage = v_previous,
           stage_changed_at = NOW(),
           qualified_at = CASE
               WHEN p_to_stage = 'qualified' AND qualified_at IS NULL THEN NOW()
               ELSE qualified_at
           END,
           -- Sair do handoff limpa a trava. Entrar não mexe: quem trava é o estágio.
           ai_locked_until = CASE
               WHEN v_from = 'awaiting_human' AND p_to_stage <> 'awaiting_human' THEN NULL
               ELSE ai_locked_until
           END,
           handoff_started_at = CASE
               WHEN p_to_stage = 'awaiting_human' THEN NOW()
               ELSE handoff_started_at
           END
     WHERE id = p_conversation_id
    RETURNING * INTO v_conv;

    INSERT INTO conversation_transitions (
        conversation_id, clinic_id, from_stage, to_stage,
        from_agent, to_agent, trigger, forced, reason, actor_user_id, metadata
    ) VALUES (
        p_conversation_id, v_conv.clinic_id, v_from, p_to_stage,
        public.agent_for_stage(v_from), public.agent_for_stage(p_to_stage),
        p_trigger, v_forced, p_reason, p_actor_user_id, COALESCE(p_metadata, '{}'::JSONB)
    );

    RETURN v_conv;
END;
$$;

-- Abrir handoff é mais do que mudar estágio: registra motivo, severidade, a
-- regra que disparou, e enfileira alerta para quem a clínica cadastrou. Sem a
-- notificação ativa, "aguardando humano" é só uma conversa morta.
CREATE OR REPLACE FUNCTION public.open_handoff(
    p_conversation_id UUID,
    p_reason TEXT,
    p_severity TEXT DEFAULT 'high',
    p_rule_id UUID DEFAULT NULL,
    p_trigger transition_trigger DEFAULT 'ai'
)
RETURNS conversations
LANGUAGE plpgsql
AS $$
DECLARE
    v_conv conversations;
    v_rank INTEGER;
BEGIN
    PERFORM public.advance_conversation_stage(
        p_conversation_id, 'awaiting_human', p_trigger, p_reason, NULL,
        jsonb_build_object('severity', p_severity, 'rule_id', p_rule_id)
    );

    UPDATE conversations
       SET handoff_reason = p_reason,
           handoff_severity = p_severity,
           handoff_rule_id = p_rule_id,
           handoff_assigned_user_id = NULL,
           handoff_acked_at = NULL,
           -- Enquanto espera humano, follow-up automático fica suspenso: seria
           -- constrangedor a IA cutucar um lead que pediu para falar com gente.
           next_followup_at = NULL
     WHERE id = p_conversation_id
    RETURNING * INTO v_conv;

    v_rank := CASE p_severity
        WHEN 'low' THEN 1 WHEN 'medium' THEN 2 WHEN 'high' THEN 3 ELSE 4
    END;

    INSERT INTO handoff_alerts (conversation_id, clinic_id, recipient_id, channel, address)
    SELECT p_conversation_id, r.clinic_id, r.id, r.channel, r.address
      FROM handoff_recipients r
     WHERE r.clinic_id = v_conv.clinic_id
       AND r.active
       AND CASE r.min_severity
             WHEN 'low' THEN 1 WHEN 'medium' THEN 2 WHEN 'high' THEN 3 ELSE 4
           END <= v_rank;

    RETURN v_conv;
END;
$$;

-- Fechar handoff devolve o lead ao estágio de onde ele saiu. É a razão de
-- previous_stage existir: sem ele, um lead qualificado voltaria como primeiro
-- contato e a IA recomeçaria a qualificação do zero — a pior experiência
-- possível para quem acabou de falar com um humano.
CREATE OR REPLACE FUNCTION public.close_handoff(
    p_conversation_id UUID,
    p_actor_user_id UUID DEFAULT NULL,
    p_to_stage conversation_stage DEFAULT NULL,
    p_reason TEXT DEFAULT 'Atendimento humano concluído'
)
RETURNS conversations
LANGUAGE plpgsql
AS $$
DECLARE
    v_conv conversations;
    v_target conversation_stage;
BEGIN
    SELECT * INTO v_conv FROM conversations WHERE id = p_conversation_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Conversa % não encontrada', p_conversation_id
            USING ERRCODE = 'no_data_found';
    END IF;

    -- Chamada repetida não é erro: dois atendentes podem clicar "devolver".
    IF v_conv.stage <> 'awaiting_human' THEN
        RETURN v_conv;
    END IF;

    -- 'new' não é destino válido: quem já falou com humano não é mais primeiro
    -- contato.
    v_target := COALESCE(p_to_stage, NULLIF(v_conv.previous_stage, 'new'), 'qualifying');

    RETURN public.advance_conversation_stage(
        p_conversation_id, v_target,
        CASE WHEN p_actor_user_id IS NULL THEN 'timeout' ELSE 'human' END,
        p_reason, p_actor_user_id, '{}'::JSONB
    );
END;
$$;

-- Entrada do webhook: uma chamada resolve tenant pelo phone_number_id, cria ou
-- recupera a conversa, registra a mensagem de forma idempotente, atualiza a
-- janela de 24h, zera a régua de follow-up e devolve a decisão de roteamento.
CREATE OR REPLACE FUNCTION public.handle_inbound_whatsapp(
    p_phone_number_id TEXT,
    p_wa_contact_id TEXT,
    p_wa_message_id TEXT,
    p_content TEXT,
    p_contact_name TEXT DEFAULT NULL,
    p_sent_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_clinic_id UUID;
    v_conv conversations;
    v_duplicate BOOLEAN := false;
    v_at TIMESTAMPTZ := COALESCE(p_sent_at, NOW());
BEGIN
    SELECT clinic_id INTO v_clinic_id
      FROM wa_phone_numbers
     WHERE phone_number_id = p_phone_number_id
       AND status <> 'disconnected';

    -- Sem fallback por telefone do lead, de propósito: número desconhecido é
    -- erro de configuração, e adivinhar a clínica mistura tenants.
    IF v_clinic_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'phone_number_id desconhecido');
    END IF;

    INSERT INTO conversations (clinic_id, phone_number_id, wa_contact_id, contact_name, stage)
    VALUES (v_clinic_id, p_phone_number_id, p_wa_contact_id, p_contact_name, 'new')
    ON CONFLICT (clinic_id, wa_contact_id) DO UPDATE
       SET contact_name = COALESCE(EXCLUDED.contact_name, conversations.contact_name),
           phone_number_id = EXCLUDED.phone_number_id
    RETURNING * INTO v_conv;

    -- Idempotência: reenvio da Meta não vira mensagem nem resposta duplicada.
    IF p_wa_message_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM messages WHERE wa_message_id = p_wa_message_id) THEN
        v_duplicate := true;
    ELSE
        INSERT INTO messages (
            clinic_id, conversation_id, patient_id, content,
            sender_type, status, direction, wa_message_id, metadata
        ) VALUES (
            v_clinic_id, v_conv.id, v_conv.patient_id, p_content,
            'patient', 'received', 'inbound', p_wa_message_id,
            jsonb_build_object('phone_number_id', p_phone_number_id)
        );

        UPDATE conversations
           SET last_inbound_at = v_at,
               message_count = message_count + 1,
               -- Lead respondeu: a régua zera e o disparo pendente é cancelado.
               -- Sem isso o template de follow-up sai depois da resposta dele.
               followup_count = 0,
               next_followup_at = NULL
         WHERE id = v_conv.id
        RETURNING * INTO v_conv;
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'duplicate', v_duplicate,
        'clinic_id', v_clinic_id,
        'conversation_id', v_conv.id,
        'patient_id', v_conv.patient_id,
        'stage', v_conv.stage,
        'previous_stage', v_conv.previous_stage,
        'agent', v_conv.current_agent,
        'ai_should_reply', (NOT v_duplicate) AND public.ai_can_reply(v_conv.id),
        'window_open', public.session_window_open(v_conv.id),
        'handoff_reason', v_conv.handoff_reason
    );
END;
$$;

-- Permissões: por padrão o Postgres concede EXECUTE a PUBLIC, o que exporia
-- estas funções pelo PostgREST com a chave anônima. Revogamos e concedemos
-- caso a caso.
REVOKE EXECUTE ON FUNCTION
    public.advance_conversation_stage(UUID, conversation_stage, transition_trigger, TEXT, UUID, JSONB),
    public.open_handoff(UUID, TEXT, TEXT, UUID, transition_trigger),
    public.close_handoff(UUID, UUID, conversation_stage, TEXT),
    public.handle_inbound_whatsapp(TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ)
FROM PUBLIC;

-- O painel move conversa e devolve handoff; RLS ainda se aplica (as funções são
-- SECURITY INVOKER), então o atendente só alcança a própria clínica.
GRANT EXECUTE ON FUNCTION
    public.advance_conversation_stage(UUID, conversation_stage, transition_trigger, TEXT, UUID, JSONB),
    public.close_handoff(UUID, UUID, conversation_stage, TEXT)
TO authenticated, service_role;

-- Webhook e motor de regras: só o backend (service role).
GRANT EXECUTE ON FUNCTION
    public.open_handoff(UUID, TEXT, TEXT, UUID, transition_trigger),
    public.handle_inbound_whatsapp(TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ)
TO service_role;


-- 12. VIEWS -------------------------------------------------------------------

-- Fila do Follow-up: quem está parado, dentro do limite de tentativas, sem
-- opt-out, com o template do passo certo já aprovado pela Meta.
CREATE OR REPLACE VIEW vw_pending_followups AS
SELECT c.id AS conversation_id,
       c.clinic_id,
       c.wa_contact_id,
       c.contact_name,
       c.stage,
       c.followup_count,
       c.next_followup_at,
       c.last_inbound_at,
       (c.last_inbound_at > NOW() - INTERVAL '24 hours') AS window_open,
       s.step,
       s.template_id,
       t.name AS template_name,
       t.language AS template_language
  FROM conversations c
  JOIN clinic_briefing b ON b.clinic_id = c.clinic_id
  LEFT JOIN briefing_followup_steps s
         ON s.clinic_id = c.clinic_id
        AND s.step = c.followup_count + 1
        AND s.active
        AND (s.applies_to_stage IS NULL OR s.applies_to_stage = c.stage)
  LEFT JOIN wa_message_templates t
         ON t.id = s.template_id AND t.status = 'approved'
 WHERE b.followup_enabled
   AND NOT c.opted_out
   -- Estágios sem follow-up: em handoff a IA está calada; perdido/encerrado
   -- é decisão tomada; agendado tem lembrete próprio, não follow-up de lead.
   AND c.stage NOT IN ('awaiting_human', 'lost', 'closed', 'scheduled')
   AND c.followup_count < b.followup_max_attempts
   AND c.next_followup_at IS NOT NULL
   AND c.next_followup_at <= NOW();

-- Fila do Handoff para o painel: quem espera humano e há quanto tempo.
CREATE OR REPLACE VIEW vw_handoff_queue AS
SELECT c.id AS conversation_id,
       c.clinic_id,
       c.wa_contact_id,
       c.contact_name,
       c.previous_stage,
       c.handoff_reason,
       c.handoff_severity,
       c.handoff_started_at,
       c.handoff_assigned_user_id,
       c.handoff_acked_at,
       EXTRACT(EPOCH FROM (NOW() - c.handoff_started_at)) / 60 AS waiting_minutes,
       (c.handoff_acked_at IS NULL
        AND c.handoff_started_at < NOW() - make_interval(mins => b.handoff_ack_minutes)) AS ack_overdue,
       (c.handoff_started_at < NOW() - make_interval(mins => b.handoff_timeout_minutes)) AS timeout_reached
  FROM conversations c
  JOIN clinic_briefing b ON b.clinic_id = c.clinic_id
 WHERE c.stage = 'awaiting_human';


-- 13. ÍNDICES -----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_wa_phone_numbers_clinic ON wa_phone_numbers (clinic_id);
CREATE INDEX IF NOT EXISTS idx_conversations_clinic_stage ON conversations (clinic_id, stage);
CREATE INDEX IF NOT EXISTS idx_conversations_contact ON conversations (wa_contact_id);
CREATE INDEX IF NOT EXISTS idx_conversations_patient ON conversations (patient_id);
-- Parciais: a fila do follow-up e a do handoff varrem só o que está pendente,
-- não a base inteira.
CREATE INDEX IF NOT EXISTS idx_conversations_next_followup
    ON conversations (next_followup_at) WHERE next_followup_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_handoff
    ON conversations (clinic_id, handoff_started_at) WHERE stage = 'awaiting_human';
CREATE INDEX IF NOT EXISTS idx_transitions_conversation
    ON conversation_transitions (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transitions_clinic
    ON conversation_transitions (clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation
    ON messages (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_procedures_clinic ON briefing_procedures (clinic_id, active);
CREATE INDEX IF NOT EXISTS idx_objections_clinic ON briefing_objections (clinic_id, active);
CREATE INDEX IF NOT EXISTS idx_escalation_clinic ON briefing_escalation_rules (clinic_id, active);
CREATE INDEX IF NOT EXISTS idx_handoff_recipients_clinic ON handoff_recipients (clinic_id, active);
CREATE INDEX IF NOT EXISTS idx_handoff_alerts_status ON handoff_alerts (status, created_at);
CREATE INDEX IF NOT EXISTS idx_templates_clinic ON wa_message_templates (clinic_id, status);
CREATE INDEX IF NOT EXISTS idx_followup_steps_clinic ON briefing_followup_steps (clinic_id, step);


-- 14. updated_at --------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'wa_phone_numbers', 'clinic_briefing', 'briefing_procedures',
        'briefing_objections', 'briefing_escalation_rules', 'handoff_recipients',
        'wa_message_templates', 'briefing_followup_steps', 'conversations'
    ] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON %I', t, t);
        EXECUTE format(
            'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I
             FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', t, t);
    END LOOP;
END $$;


-- 15. ROW LEVEL SECURITY ------------------------------------------------------
-- Padrão do projeto: a equipe da clínica enxerga o que é da própria clínica. O
-- backend usa service role e passa por cima disso.
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'clinic_briefing', 'briefing_procedures', 'briefing_objections',
        'briefing_escalation_rules', 'handoff_recipients', 'wa_message_templates',
        'briefing_followup_steps', 'conversations', 'handoff_alerts'
    ] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS "%s_clinic_access" ON %I', t, t);
        EXECUTE format(
            'CREATE POLICY "%s_clinic_access" ON %I FOR ALL USING (
                clinic_id IN (SELECT clinic_id FROM users WHERE auth_id = auth.uid())
             )', t, t);
    END LOOP;
END $$;

-- wa_phone_numbers guarda referências de segredo e o verify_token do webhook.
-- Só leitura pelo painel; escrita é do backend.
ALTER TABLE wa_phone_numbers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wa_phone_numbers_read" ON wa_phone_numbers;
CREATE POLICY "wa_phone_numbers_read" ON wa_phone_numbers FOR SELECT USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE auth_id = auth.uid())
);

-- Histórico é append-only: nem a clínica reescreve o que a IA fez. A escrita
-- acontece dentro de advance_conversation_stage, que roda na transação do
-- chamador — por isso a política de INSERT também existe.
ALTER TABLE conversation_transitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "conversation_transitions_read" ON conversation_transitions;
CREATE POLICY "conversation_transitions_read" ON conversation_transitions FOR SELECT USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE auth_id = auth.uid())
);
DROP POLICY IF EXISTS "conversation_transitions_insert" ON conversation_transitions;
CREATE POLICY "conversation_transitions_insert" ON conversation_transitions FOR INSERT WITH CHECK (
    clinic_id IN (SELECT clinic_id FROM users WHERE auth_id = auth.uid())
);

-- O grafo é leitura para quem está logado: o painel desenha o funil a partir dele.
ALTER TABLE stage_transition_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stage_rules_read" ON stage_transition_rules;
CREATE POLICY "stage_rules_read" ON stage_transition_rules FOR SELECT
    USING (auth.uid() IS NOT NULL);
