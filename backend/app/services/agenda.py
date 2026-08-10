"""Agenda: horários livres e reserva.

O modelo NUNCA inventa horário. Ele recebe uma lista de vagas calculada aqui e
escolhe dentro dela.

Esta é a camada do MEIO de três. A de cima é o prompt (lista fechada de vagas); a
de baixo é o trigger trg_appointments_valida_horario, no banco, que recusa gravar
fora do expediente venha de onde vier. Se este arquivo tiver um bug, o banco ainda
segura — que é o ponto de ter as três.

O expediente vem de clinic_hours, tabela estruturada com constraint. Antes era um
JSONB de texto livre no briefing: a clínica digitava, ninguém conferia, e horário
errado ali virava horário errado oferecido ao lead.
"""
import datetime as dt
import logging
from zoneinfo import ZoneInfo

from .supabase_service import supabase_client

# Padrão ISO, igual ao banco: 1 = segunda ... 7 = domingo (isoweekday()).
DIAS_PT = {
    1: "segunda", 2: "terça", 3: "quarta", 4: "quinta",
    5: "sexta", 6: "sábado", 7: "domingo",
}


def _tz(briefing_tz: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(briefing_tz or "America/Sao_Paulo")
    except Exception:
        return ZoneInfo("America/Sao_Paulo")


def _hora(texto: str) -> dt.time | None:
    try:
        h, m = str(texto).split(":")[:2]
        return dt.time(int(h), int(m))
    except Exception:
        return None


def _ocupados(clinic_id: str, de: dt.datetime, ate: dt.datetime) -> list[tuple[dt.datetime, dt.datetime]]:
    """Intervalos já tomados. Cancelado e no_show liberam a vaga de volta."""
    try:
        result = (
            supabase_client.table("appointments")
            .select("start_time, end_time")
            .eq("clinic_id", clinic_id)
            .in_("status", ["pending", "confirmed", "in_progress"])
            .gte("start_time", de.isoformat())
            .lte("start_time", ate.isoformat())
            .execute()
        )
    except Exception as exc:
        logging.warning("Falha ao carregar agenda de %s: %s", clinic_id, exc)
        # Sem saber o que está ocupado, é melhor não oferecer nada do que
        # oferecer horário já tomado e criar conflito na recepção.
        return [(de, ate)]

    intervalos = []
    for linha in result.data or []:
        inicio = _parse(linha.get("start_time"))
        fim = _parse(linha.get("end_time"))
        if inicio and fim:
            intervalos.append((inicio, fim))
    return intervalos


def _parse(valor) -> dt.datetime | None:
    if not valor:
        return None
    try:
        texto = str(valor).strip()
        if texto.endswith("Z"):
            texto = texto[:-1] + "+00:00"
        parsed = dt.datetime.fromisoformat(texto)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=dt.timezone.utc)
    except Exception:
        return None


def _expediente(clinic_id: str) -> dict[int, list[tuple[dt.time, dt.time]]]:
    """Janelas de atendimento por dia da semana (ISO: 1=segunda ... 7=domingo).

    Duas janelas no mesmo dia representam o intervalo de almoço — é por isso que
    o retorno é lista, e não um par único abre/fecha.
    """
    try:
        result = (
            supabase_client.table("clinic_hours")
            .select("dia_semana, abre, fecha")
            .eq("clinic_id", clinic_id)
            .eq("ativo", True)
            .execute()
        )
    except Exception as exc:
        logging.warning("Falha ao carregar expediente de %s: %s", clinic_id, exc)
        return {}

    por_dia: dict[int, list[tuple[dt.time, dt.time]]] = {}
    for linha in result.data or []:
        abre, fecha = _hora(linha.get("abre")), _hora(linha.get("fecha"))
        dia = linha.get("dia_semana")
        if abre and fecha and isinstance(dia, int):
            por_dia.setdefault(dia, []).append((abre, fecha))

    for janelas in por_dia.values():
        janelas.sort()
    return por_dia


def _bloqueios(clinic_id: str, de: dt.datetime, ate: dt.datetime) -> list[tuple[dt.datetime, dt.datetime]]:
    """Feriados, férias e bloqueios pontuais que vencem o expediente normal."""
    try:
        result = (
            supabase_client.table("clinic_schedule_blocks")
            .select("inicio, fim")
            .eq("clinic_id", clinic_id)
            .lte("inicio", ate.isoformat())
            .gte("fim", de.isoformat())
            .execute()
        )
    except Exception as exc:
        logging.warning("Falha ao carregar bloqueios de %s: %s", clinic_id, exc)
        # Na dúvida, não oferece nada: melhor a Solara dizer que vai confirmar do
        # que marcar em cima de um feriado.
        return [(de, ate)]

    intervalos = []
    for linha in result.data or []:
        inicio, fim = _parse(linha.get("inicio")), _parse(linha.get("fim"))
        if inicio and fim:
            intervalos.append((inicio, fim))
    return intervalos


def vagas_disponiveis(
    clinic_id: str,
    briefing: dict,
    timezone: str | None = None,
    limite: int = 6,
) -> list[dict]:
    """Próximas vagas livres: expediente real, menos o que já está ocupado.

    Devolve no máximo `limite` vagas espalhadas entre dias diferentes — seis
    horários da mesma terça não ajudam quem não pode na terça.

    Lista vazia é resposta legítima e segura: o Agendador então diz que vai
    confirmar com a equipe, em vez de inventar.
    """
    expediente = _expediente(clinic_id)
    if not expediente:
        logging.info("Clínica %s sem expediente cadastrado; nenhuma vaga a oferecer.", clinic_id)
        return []

    tz = _tz(timezone)
    duracao = int(briefing.get("duracao_avaliacao_minutos") or 30)
    antecedencia = int(briefing.get("antecedencia_minima_horas") or 24)
    max_dias = int(briefing.get("antecedencia_maxima_dias") or 60)

    agora = dt.datetime.now(tz)
    inicio_valido = agora + dt.timedelta(hours=antecedencia)
    fim_busca = agora + dt.timedelta(days=max_dias)

    indisponivel = (
        _ocupados(clinic_id, inicio_valido, fim_busca)
        + _bloqueios(clinic_id, inicio_valido, fim_busca)
    )

    vagas: list[dict] = []
    dia = inicio_valido.date()

    while dia <= fim_busca.date() and len(vagas) < limite:
        janelas = expediente.get(dia.isoweekday())
        if not janelas:
            dia += dt.timedelta(days=1)
            continue

        # No máximo 2 por dia: espalhar entre dias dá mais chance de casar com a
        # disponibilidade de quem está do outro lado.
        do_dia = 0
        for abre, fecha in janelas:
            if len(vagas) >= limite or do_dia >= 2:
                break

            momento = dt.datetime.combine(dia, abre, tzinfo=tz)
            limite_janela = dt.datetime.combine(dia, fecha, tzinfo=tz)

            while momento + dt.timedelta(minutes=duracao) <= limite_janela:
                if len(vagas) >= limite or do_dia >= 2:
                    break
                fim = momento + dt.timedelta(minutes=duracao)

                if momento >= inicio_valido and not _colide(momento, fim, indisponivel):
                    vagas.append({
                        "inicio": momento.isoformat(),
                        "fim": fim.isoformat(),
                        "rotulo": (
                            f"{DIAS_PT[dia.isoweekday()]}, {dia.strftime('%d/%m')}"
                            f" às {momento.strftime('%H:%M')}"
                        ),
                    })
                    do_dia += 1
                    # Salta uma hora à frente para não oferecer 9:00 e 9:30 juntos.
                    momento += dt.timedelta(minutes=max(duracao, 60))
                    continue

                momento += dt.timedelta(minutes=duracao)

        dia += dt.timedelta(days=1)

    return vagas


def _colide(inicio: dt.datetime, fim: dt.datetime, ocupados: list[tuple]) -> bool:
    return any(inicio < ocupado_fim and fim > ocupado_inicio
               for ocupado_inicio, ocupado_fim in ocupados)


# Mensagens que o trigger levanta e que já servem para o modelo ler e corrigir.
_FALLBACK_RESERVA = "Não consegui registrar agora. Diga que a equipe confirma o horário em seguida."


def _mensagem_do_banco(exc: Exception) -> str:
    """Extrai a mensagem do RAISE EXCEPTION do Postgres, quando houver.

    O cliente do Supabase embrulha o erro em JSON; o texto útil vem em 'message'.
    Sem isso o modelo receberia "APIError" e não teria como saber que o problema
    foi o horário — e ofereceria o mesmo de novo.
    """
    bruto = str(exc)
    for chave in ('"message":"', "'message': '"):
        if chave in bruto:
            resto = bruto.split(chave, 1)[1]
            fim = resto.find('"') if chave.endswith('"') else resto.find("'")
            mensagem = (resto[:fim] if fim > 0 else resto).strip()
            if mensagem:
                return mensagem
    # Mensagem do trigger costuma vir direta quando não há embrulho.
    if "expediente" in bruto or "ocupado" in bruto or "bloqueada" in bruto:
        return bruto[:200]
    return _FALLBACK_RESERVA


def reservar(
    clinic_id: str,
    conversation_id: str,
    inicio_iso: str,
    duracao_minutos: int = 30,
    procedure_id: str | None = None,
    tipo: str = "avaliacao",
    observacao: str | None = None,
) -> dict:
    """Cria o agendamento. Reconfere o conflito na hora de gravar.

    A reconferência importa: entre listar as vagas e o lead escolher passam
    minutos, e nesse intervalo a recepção pode ter marcado alguém no mesmo
    horário pelo painel.
    """
    inicio = _parse(inicio_iso)
    if not inicio:
        return {"ok": False, "error": "Horário inválido. Peça para a pessoa escolher outro."}

    fim = inicio + dt.timedelta(minutes=duracao_minutos)

    try:
        result = supabase_client.table("appointments").insert({
            "clinic_id": clinic_id,
            "conversation_id": conversation_id,
            "procedure_id": procedure_id,
            "tipo": tipo,
            "start_time": inicio.isoformat(),
            "end_time": fim.isoformat(),
            "status": "pending",
            "notes": observacao,
            # Nunca forçado: a IA não tem como se autorizar a furar o expediente.
            "forcado_por_humano": False,
        }).execute()
    except Exception as exc:
        # O trigger do banco é a última linha de defesa e já devolve mensagem em
        # português ("Horário fora do expediente...", "acabou de ser ocupado").
        # Repassar esse texto ao modelo faz ele corrigir o rumo na hora, em vez
        # de repetir o mesmo horário recusado.
        motivo = _mensagem_do_banco(exc)
        logging.warning("Reserva recusada para a clínica %s: %s", clinic_id, motivo)
        return {"ok": False, "error": motivo}

    linha = (result.data or [{}])[0]
    return {"ok": True, "appointment_id": linha.get("id"), "inicio": inicio.isoformat()}
