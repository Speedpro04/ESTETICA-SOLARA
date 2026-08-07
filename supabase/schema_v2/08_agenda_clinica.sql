-- =============================================================================
-- 08 — AGENDA DA CLÍNICA: expediente estruturado e trava contra horário inventado
-- =============================================================================
-- O problema que este arquivo resolve:
--
-- O Agendador recebe uma lista de vagas calculada pelo backend e a ferramenta
-- recusa qualquer horário fora dela. Isso impede o modelo de alucinar — ENQUANTO
-- o código estiver certo. Um bug no cálculo, uma refatoração desatenta ou uma
-- chamada direta ao PostgREST passa por cima de tudo, e o resultado é o pior
-- erro possível nesta automação: paciente na porta da clínica no sábado, com
-- print da conversa, e nenhum agendamento no sistema.
--
-- Então a validação desce para o banco. São três camadas, e a de baixo não
-- depende de nenhuma acima:
--
--   1. clinic_hours          O expediente vira DADO ESTRUTURADO, com constraint.
--                            Antes era um JSONB de texto livre que a clínica
--                            digitava sem ninguém conferir.
--   2. clinic_schedule_blocks Feriado, férias e bloqueio pontual.
--   3. TRIGGER em appointments Recusa gravar fora do expediente. Ponto final.
--
-- A válvula de escape é deliberada e assimétrica: `forcado_por_humano` permite
-- que a recepção encaixe alguém fora do horário (acontece, e é legítimo). A IA
-- nunca preenche esse campo — ela não tem como se autorizar.
-- =============================================================================

-- 1. EXPEDIENTE --------------------------------------------------------------
-- Uma linha por janela. Duas linhas no mesmo dia cobrem o intervalo de almoço,
-- que é o caso que um par único "abre/fecha" não representa.
CREATE TABLE public.clinic_hours (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,

    -- Padrão ISO: 1 = segunda ... 7 = domingo. Bate com isoweekday() do Python
    -- e com EXTRACT(ISODOW) do Postgres, então não há conversão no meio do
    -- caminho para alguém errar.
    dia_semana SMALLINT NOT NULL CHECK (dia_semana BETWEEN 1 AND 7),
    abre TIME NOT NULL,
    fecha TIME NOT NULL,

    ativo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT clinic_hours_janela_valida CHECK (fecha > abre),
    CONSTRAINT clinic_hours_sem_duplicata UNIQUE (clinic_id, dia_semana, abre)
);

CREATE INDEX idx_clinic_hours_clinic ON public.clinic_hours (clinic_id, dia_semana) WHERE ativo;

-- 2. BLOQUEIOS ---------------------------------------------------------------
-- Feriado, férias, congresso, reforma. Vence o expediente normal.
CREATE TABLE public.clinic_schedule_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    -- Nulo = a clínica inteira para. Preenchido = só a agenda daquele profissional.
    professional_id UUID REFERENCES public.users(id) ON DELETE CASCADE,

    inicio TIMESTAMPTZ NOT NULL,
    fim TIMESTAMPTZ NOT NULL,
    motivo TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT blocks_intervalo_valido CHECK (fim > inicio)
);

CREATE INDEX idx_schedule_blocks_clinic ON public.clinic_schedule_blocks (clinic_id, inicio, fim);

-- 3. VÁLVULA DE ESCAPE -------------------------------------------------------
-- Só a recepção usa. A IA não tem caminho para escrever aqui: ela agenda pela
-- função reservar(), que nunca envia este campo.
ALTER TABLE public.appointments
    ADD COLUMN IF NOT EXISTS forcado_por_humano BOOLEAN NOT NULL DEFAULT false;

-- 4. A TRAVA -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validar_horario_agendamento()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_tz TEXT;
    v_inicio_local TIMESTAMP;
    v_fim_local TIMESTAMP;
    v_dia SMALLINT;
    v_cabe BOOLEAN;
    v_bloqueio TEXT;
BEGIN
    -- Encaixe manual da recepção: passa sem checagem, mas fica registrado.
    IF NEW.forcado_por_humano THEN
        RETURN NEW;
    END IF;

    -- Cancelado e no_show não precisam caber no expediente: são justamente o
    -- registro de que algo não aconteceu.
    IF NEW.status IN ('cancelled', 'no_show') THEN
        RETURN NEW;
    END IF;

    SELECT COALESCE(timezone, 'America/Sao_Paulo') INTO v_tz
      FROM public.clinics WHERE id = NEW.clinic_id;

    -- A comparação tem que ser no fuso da clínica. start_time é TIMESTAMPTZ
    -- (guardado em UTC); comparar TIME contra UTC erraria por três horas e
    -- ofereceria horário de madrugada como se fosse comercial.
    v_inicio_local := NEW.start_time AT TIME ZONE v_tz;
    v_fim_local    := NEW.end_time   AT TIME ZONE v_tz;
    v_dia          := EXTRACT(ISODOW FROM v_inicio_local);

    -- Expediente ainda não cadastrado: a clínica não terminou o onboarding.
    -- Recusar aqui é o que impede o Agendador de operar no vazio.
    IF NOT EXISTS (SELECT 1 FROM public.clinic_hours
                    WHERE clinic_id = NEW.clinic_id AND ativo) THEN
        RAISE EXCEPTION
            'Esta clínica ainda não cadastrou o expediente. Preencha os horários de atendimento antes de agendar.'
            USING ERRCODE = 'check_violation';
    END IF;

    -- O agendamento inteiro tem que caber DENTRO de uma única janela. Começar
    -- às 11:50 com 30 minutos não vale se a clínica fecha para o almoço ao meio-dia.
    SELECT EXISTS (
        SELECT 1 FROM public.clinic_hours h
         WHERE h.clinic_id = NEW.clinic_id
           AND h.ativo
           AND h.dia_semana = v_dia
           AND v_inicio_local::time >= h.abre
           AND v_fim_local::time    <= h.fecha
    ) INTO v_cabe;

    IF NOT v_cabe THEN
        RAISE EXCEPTION
            'Horário fora do expediente da clínica (% em %). Escolha um horário dentro do atendimento.',
            to_char(v_inicio_local, 'DD/MM HH24:MI'), v_tz
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT COALESCE(b.motivo, 'bloqueio na agenda') INTO v_bloqueio
      FROM public.clinic_schedule_blocks b
     WHERE b.clinic_id = NEW.clinic_id
       AND (b.professional_id IS NULL OR b.professional_id = NEW.professional_id)
       AND NEW.start_time < b.fim
       AND NEW.end_time   > b.inicio
     LIMIT 1;

    IF v_bloqueio IS NOT NULL THEN
        RAISE EXCEPTION 'Agenda bloqueada nesse período (%).', v_bloqueio
            USING ERRCODE = 'check_violation';
    END IF;

    -- Dois agendamentos no mesmo horário. A checagem em código roda ANTES de o
    -- lead escolher; entre listar e confirmar passam minutos, e nesse intervalo
    -- a recepção pode ter marcado alguém. Aqui é o desempate final.
    IF EXISTS (
        SELECT 1 FROM public.appointments a
         WHERE a.clinic_id = NEW.clinic_id
           AND a.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
           AND a.status IN ('pending', 'confirmed', 'in_progress')
           AND (a.professional_id IS NOT DISTINCT FROM NEW.professional_id)
           AND NEW.start_time < a.end_time
           AND NEW.end_time   > a.start_time
    ) THEN
        RAISE EXCEPTION 'Esse horário acabou de ser ocupado. Ofereça outro.'
            USING ERRCODE = 'unique_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_appointments_valida_horario
    BEFORE INSERT OR UPDATE OF start_time, end_time, professional_id, status
    ON public.appointments
    FOR EACH ROW EXECUTE FUNCTION public.validar_horario_agendamento();

-- 5. LEITURA PARA O BACKEND --------------------------------------------------
-- O cálculo de vagas passa a ler daqui, não do JSONB do briefing. Uma fonte de
-- verdade só: expediente em dois lugares vira expediente divergente.
CREATE OR REPLACE VIEW public.vw_expediente
WITH (security_invoker = true) AS
SELECT h.clinic_id,
       h.dia_semana,
       h.abre,
       h.fecha,
       c.timezone
  FROM public.clinic_hours h
  JOIN public.clinics c ON c.id = h.clinic_id
 WHERE h.ativo
 ORDER BY h.clinic_id, h.dia_semana, h.abre;

GRANT SELECT ON public.vw_expediente TO authenticated;

-- 6. PRONTIDÃO DA CLÍNICA ----------------------------------------------------
-- O painel usa isto para dizer, em português, o que falta antes de a Solara
-- poder atender. Clínica sem expediente e sem procedimento tem um SDR que
-- conversa bonito e não fecha nada.
CREATE OR REPLACE FUNCTION public.clinica_pronta(p_clinic_id UUID)
RETURNS TABLE (item TEXT, ok BOOLEAN, detalhe TEXT)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT 'expediente',
           EXISTS (SELECT 1 FROM public.clinic_hours WHERE clinic_id = p_clinic_id AND ativo),
           'Dias e horários de atendimento — sem isso o Agendador não marca nada.'
    UNION ALL
    SELECT 'procedimentos',
           EXISTS (SELECT 1 FROM public.procedures WHERE clinic_id = p_clinic_id AND ativo),
           'Pelo menos um procedimento no catálogo — é o que o SDR usa para qualificar.'
    UNION ALL
    SELECT 'briefing',
           EXISTS (SELECT 1 FROM public.clinic_briefing
                    WHERE clinic_id = p_clinic_id AND criterio_qualificado IS NOT NULL),
           'Briefing de vendas preenchido — sem ele o SDR é genérico.'
    UNION ALL
    SELECT 'numero_whatsapp',
           EXISTS (SELECT 1 FROM public.wa_phone_numbers
                    WHERE clinic_id = p_clinic_id AND status = 'conectado'),
           'Número verificado na Meta e conectado.'
    UNION ALL
    SELECT 'destinatario_handoff',
           EXISTS (SELECT 1 FROM public.handoff_recipients WHERE clinic_id = p_clinic_id AND ativo),
           'Quem recebe o alerta quando a IA precisa passar para um humano.';
$$;

GRANT EXECUTE ON FUNCTION public.clinica_pronta(UUID) TO authenticated;

-- 7. RLS ---------------------------------------------------------------------
ALTER TABLE public.clinic_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY clinic_hours_clinica ON public.clinic_hours
    FOR ALL TO authenticated
    USING (clinic_id IN (SELECT public.current_clinic_ids()))
    WITH CHECK (clinic_id IN (SELECT public.current_clinic_ids()));

ALTER TABLE public.clinic_schedule_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY clinic_schedule_blocks_clinica ON public.clinic_schedule_blocks
    FOR ALL TO authenticated
    USING (clinic_id IN (SELECT public.current_clinic_ids()))
    WITH CHECK (clinic_id IN (SELECT public.current_clinic_ids()));

CREATE TRIGGER trg_clinic_hours_updated_at BEFORE UPDATE ON public.clinic_hours
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8. APOSENTA O JSONB --------------------------------------------------------
-- clinic_briefing.horarios vira redundante. Manter os dois é garantir que um dia
-- eles discordem — e o Agendador acreditar no errado.
--
-- briefing_completude lia essas colunas, então é recriada antes do DROP: função
-- SQL apontando para coluna inexistente só falha na hora da chamada, que é o
-- pior momento para descobrir.
CREATE OR REPLACE FUNCTION public.briefing_completude(p_clinic_id UUID)
RETURNS TABLE (secao TEXT, preenchidos INTEGER, total INTEGER)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    WITH b AS (SELECT * FROM public.clinic_briefing WHERE clinic_id = p_clinic_id)
    SELECT 'identidade', (
        (b.tom_de_voz IS NOT NULL)::int + (b.publico_alvo IS NOT NULL)::int
      + (b.diferenciais IS NOT NULL)::int
    ), 3 FROM b
    UNION ALL
    SELECT 'cliente_ideal', (
        (b.cliente_ideal IS NOT NULL)::int + (b.faixa_etaria_principal IS NOT NULL)::int
      + (b.motivacoes_comuns IS NOT NULL)::int + (b.perfil_desqualificado IS NOT NULL)::int
    ), 4 FROM b
    UNION ALL
    SELECT 'valor', (
        (b.diferenciais_concretos IS NOT NULL)::int + (b.prova_social IS NOT NULL)::int
      + (b.garantias IS NOT NULL)::int + (b.justificativa_de_preco IS NOT NULL)::int
    ), 4 FROM b
    UNION ALL
    SELECT 'conversao', (
        (b.gatilhos_de_urgencia IS NOT NULL)::int + (b.oferta_de_destrave IS NOT NULL)::int
      + (jsonb_array_length(b.perguntas_qualificacao) > 0)::int
      + (b.criterio_qualificado IS NOT NULL)::int
    ), 4 FROM b
    UNION ALL
    -- Expediente saiu do briefing e virou tabela própria (clinic_hours).
    SELECT 'agenda', (
        (SELECT count(DISTINCT dia_semana)::int FROM public.clinic_hours
          WHERE clinic_id = p_clinic_id AND ativo)
      + ((SELECT politica_cancelamento IS NOT NULL FROM b))::int
    ), 6
    UNION ALL
    SELECT 'objecoes', (
        SELECT count(*)::int FROM public.briefing_objections
         WHERE clinic_id = p_clinic_id AND ativo
    ), 5
    UNION ALL
    SELECT 'procedimentos', (
        SELECT count(*)::int FROM public.procedures
         WHERE clinic_id = p_clinic_id AND ativo
    ), 3;
$$;

ALTER TABLE public.clinic_briefing DROP COLUMN IF EXISTS horarios;
ALTER TABLE public.clinic_briefing DROP COLUMN IF EXISTS feriados;
