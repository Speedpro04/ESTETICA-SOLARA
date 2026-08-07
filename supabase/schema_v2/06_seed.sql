-- =============================================================================
-- 06 — SEED: grafo de transições, planos e regras globais de escalonamento
-- =============================================================================
-- O grafo NÃO é opcional. advance_conversation_stage valida toda mudança de
-- estágio contra stage_transition_rules; com a tabela vazia, cada transição
-- levanta 'check_violation' e nenhum lead sai de 'novo'.
-- =============================================================================

-- 1. GRAFO DE TRANSIÇÕES -----------------------------------------------------
INSERT INTO public.stage_transition_rules (from_stage, to_stage, descricao) VALUES
    ('novo',              'qualificando',      'SDR assume o primeiro contato'),
    ('novo',              'agendando',         'Lead já chegou pedindo horário'),
    ('novo',              'aguardando_humano', 'Escalou logo na primeira mensagem'),
    ('novo',              'perdido',           'Engano, spam ou fora de área'),

    ('qualificando',      'qualificado',       'Bateu os critérios do briefing'),
    ('qualificando',      'agendando',         'Pediu horário durante a qualificação'),
    ('qualificando',      'aguardando_humano', 'Escalou durante a qualificação'),
    ('qualificando',      'perdido',           'Sem perfil ou desistiu'),

    ('qualificado',       'agendando',         'Passa para o Agendador'),
    ('qualificado',       'aguardando_humano', 'Escalou antes de agendar'),
    ('qualificado',       'perdido',           'Desistiu depois de qualificado'),

    ('agendando',         'agendado',          'Horário confirmado'),
    ('agendando',         'qualificado',       'Nenhum horário serviu; volta a nutrir'),
    ('agendando',         'aguardando_humano', 'Escalou durante o agendamento'),
    ('agendando',         'perdido',           'Desistiu ao ver a agenda'),

    ('agendado',          'agendando',         'Remarcação'),
    ('agendado',          'encerrado',         'Compareceu; ciclo concluído'),
    ('agendado',          'aguardando_humano', 'Escalou com horário marcado'),
    ('agendado',          'perdido',           'Cancelou e não quis remarcar'),

    -- Saídas do handoff: o atendente devolve para onde fizer sentido. Sem estes
    -- caminhos, destravar uma conversa exigiria forçar fora do grafo toda vez.
    ('aguardando_humano', 'qualificando',      'Humano devolveu ao SDR'),
    ('aguardando_humano', 'qualificado',       'Humano devolveu já qualificado'),
    ('aguardando_humano', 'agendando',         'Humano devolveu para agendar'),
    ('aguardando_humano', 'agendado',          'Humano agendou na mão'),
    ('aguardando_humano', 'encerrado',         'Humano resolveu e encerrou'),
    ('aguardando_humano', 'perdido',           'Humano marcou como perdido'),

    ('perdido',           'qualificando',      'Lead voltou sozinho'),
    ('perdido',           'agendando',         'Voltou já querendo marcar'),
    ('perdido',           'aguardando_humano', 'Voltou com assunto sensível'),

    ('encerrado',         'qualificando',      'Novo ciclo: procurou de novo'),
    ('encerrado',         'agendando',         'Voltou querendo remarcar'),
    ('encerrado',         'aguardando_humano', 'Voltou com assunto sensível')
ON CONFLICT (from_stage, to_stage) DO UPDATE SET descricao = EXCLUDED.descricao;

-- 2. PLANOS ------------------------------------------------------------------
INSERT INTO public.plans (slug, name, description, price_cents, billing_period,
                          trial_days, max_specialists, is_highlighted, display_order)
VALUES
    ('solara-mensal', 'Solara Connect — Mensal',
     'Time de agentes de IA no WhatsApp oficial da clínica.',
     0, 'monthly', 10, 3, true, 1),
    ('solara-anual', 'Solara Connect — Anual',
     'Mesmo plano, cobrança anual.',
     0, 'yearly', 10, 3, false, 2)
ON CONFLICT (slug) DO NOTHING;

-- 3. REGRAS GLOBAIS DE ESCALONAMENTO -----------------------------------------
-- Piso de segurança comum a toda clínica (clinic_id NULL). A clínica acrescenta
-- as suas; estas ela não remove — o RLS só autoriza escrita em regra própria.
--
-- Camada determinística: casa por palavra ANTES de a mensagem chegar no modelo.
-- Risco clínico não pode depender do julgamento do LLM naquele turno.
INSERT INTO public.escalation_rules (clinic_id, rotulo, tipo, palavras, severidade, notificar_imediatamente)
VALUES
    (NULL, 'Pergunta sobre contraindicação ou risco', 'palavra_chave',
     ARRAY['contraindicacao','contra indicacao','contraindicado','pode dar problema',
           'e perigoso','é perigoso','tem risco','efeito colateral','efeitos colaterais',
           'reacao adversa','reação adversa'],
     'critica', true),

    (NULL, 'Relato de complicação', 'palavra_chave',
     ARRAY['inflamou','infeccionou','infeccao','infecção','necrose','endureceu',
           'ficou torto','deu errado','nodulo','nódulo','alergia','alergica','alérgica'],
     'critica', true),

    (NULL, 'Insatisfação ou ameaça formal', 'palavra_chave',
     ARRAY['processar','advogado','procon','reclame aqui','vou denunciar',
           'quero meu dinheiro de volta','me arrependi'],
     'critica', true),

    (NULL, 'Condição que exige avaliação clínica', 'palavra_chave',
     ARRAY['gravida','grávida','gestante','amamentando','anticoagulante',
           'autoimune','quimioterapia','marcapasso'],
     'alta', true),

    (NULL, 'Pedido explícito de atendimento humano', 'palavra_chave',
     ARRAY['falar com humano','falar com alguem','falar com alguém','falar com atendente',
           'quero um atendente','me transfere','falar com a doutora','falar com o doutor',
           'isso e um robo','isso é um robô'],
     'media', true),

    (NULL, 'Menor de idade', 'palavra_chave',
     ARRAY['tenho 16','tenho 17','tenho 15','minha filha de','meu filho de','sou menor'],
     'alta', true)
ON CONFLICT DO NOTHING;
