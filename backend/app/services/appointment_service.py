"""Criação de pré-agendamento pela Solara (function-calling).

A Solara coleta os dados na conversa do WhatsApp e chama a ferramenta
criar_pre_agendamento. A consulta entra como status 'pending' (pré-reserva):
aparece na hora no dashboard da clínica, e a equipe confirma o horário exato.
A Solara nunca promete disponibilidade — quem bate o martelo é a clínica.
"""
import logging
import datetime
from zoneinfo import ZoneInfo
from .supabase_service import supabase_client

_TZ = ZoneInfo("America/Sao_Paulo")

# Horário padrão de cada período (a equipe ajusta o horário exato ao confirmar).
_PERIOD_TIMES = {
    "manha": datetime.time(9, 0),
    "manhã": datetime.time(9, 0),
    "tarde": datetime.time(14, 0),
    "noite": datetime.time(18, 0),
}

_DEFAULT_DURATION = datetime.timedelta(hours=1)


def resolve_start_time(date_str: str, period: str | None = None, time_str: str | None = None) -> datetime.datetime | None:
    """Monta o início da consulta (tz São Paulo) a partir de data + período/hora."""
    try:
        day = datetime.date.fromisoformat((date_str or "").strip())
    except Exception:
        return None

    moment = None
    if time_str:
        try:
            moment = datetime.time.fromisoformat(time_str.strip()[:5])
        except Exception:
            moment = None
    if moment is None:
        moment = _PERIOD_TIMES.get((period or "").strip().lower(), datetime.time(9, 0))

    return datetime.datetime.combine(day, moment, tzinfo=_TZ)


def _resolve_doctor_id(clinic_id: str, specialty: str | None, specialist_name: str | None) -> str | None:
    """Tenta vincular um profissional da clínica (users com role doctor/owner)."""
    try:
        query = (
            supabase_client.table("users")
            .select("id, name, specialty")
            .eq("clinic_id", clinic_id)
            .in_("role", ["doctor", "owner"])
            .limit(50)
        )
        rows = query.execute().data or []
    except Exception as exc:
        logging.warning("Pré-agendamento: falha ao buscar profissionais da clínica %s: %s", clinic_id, exc)
        return None

    def _norm(s: str | None) -> str:
        return (s or "").strip().lower()

    if specialist_name:
        wanted = _norm(specialist_name)
        for row in rows:
            name = _norm(row.get("name"))
            if wanted and (wanted in name or name in wanted):
                return row.get("id")

    if specialty:
        wanted = _norm(specialty)
        for row in rows:
            if wanted and wanted in _norm(row.get("specialty")):
                return row.get("id")

    return None


def create_preappointment(
    clinic_id: str,
    patient_id: str,
    date: str,
    period: str | None = None,
    time: str | None = None,
    specialty: str | None = None,
    specialist_name: str | None = None,
    insurance: str | None = None,
    notes: str | None = None,
) -> dict:
    """Cria a pré-reserva no banco. Retorna um dict que a Solara usa para responder.

    Nunca levanta exceção: erros viram {"ok": False, "error": ...} para o modelo
    explicar ao paciente com naturalidade.
    """
    if not clinic_id or not patient_id:
        return {"ok": False, "error": "Cadastro do paciente ainda não disponível para agendar."}

    start_local = resolve_start_time(date, period, time)
    if start_local is None:
        return {"ok": False, "error": "Data inválida. Pergunte novamente o dia desejado (ex.: 2026-06-15)."}

    now_local = datetime.datetime.now(_TZ)
    if start_local < now_local:
        return {"ok": False, "error": "A data desejada já passou. Pergunte uma nova data ao paciente."}

    doctor_id = _resolve_doctor_id(clinic_id, specialty, specialist_name)

    note_parts = []
    if insurance:
        note_parts.append(f"Convênio: {insurance}")
    if specialist_name and not doctor_id:
        note_parts.append(f"Profissional solicitado: {specialist_name}")
    if notes:
        note_parts.append(notes)
    note_parts.append("Pré-agendado pela Solara via WhatsApp — confirmar horário com o paciente.")

    payload = {
        "clinic_id": clinic_id,
        "patient_id": patient_id,
        "start_time": start_local.astimezone(datetime.timezone.utc).isoformat(),
        "end_time": (start_local + _DEFAULT_DURATION).astimezone(datetime.timezone.utc).isoformat(),
        "status": "pending",
        "type": (specialty or "Consulta")[:80],
        "notes": " | ".join(note_parts),
    }
    if doctor_id:
        payload["doctor_id"] = doctor_id

    try:
        result = supabase_client.table("appointments").insert(payload).execute()
    except Exception as exc:
        logging.exception("Pré-agendamento: falha ao inserir consulta")
        return {"ok": False, "error": f"Falha técnica ao registrar ({exc}). Ofereça encaminhar para a equipe."}

    if not result.data:
        return {"ok": False, "error": "Não foi possível registrar. Ofereça encaminhar para a equipe."}

    when_fmt = start_local.strftime("%d/%m/%Y")
    period_fmt = {"manha": "pela manhã", "manhã": "pela manhã", "tarde": "à tarde", "noite": "à noite"}.get(
        (period or "").strip().lower(), f"às {start_local.strftime('%H:%M')}"
    )
    return {
        "ok": True,
        "appointment_id": result.data[0].get("id"),
        "data": when_fmt,
        "periodo": period_fmt,
        "especialidade": specialty or "Consulta",
        "instrucao": (
            "Pré-reserva registrada com sucesso. Informe ao paciente que o pedido ficou "
            "PRÉ-AGENDADO para essa data/período e que a equipe da clínica confirma o horário "
            "exato em breve por aqui. NÃO afirme que o horário está garantido."
        ),
    }


# Definição da ferramenta para o function-calling da OpenAI.
BOOKING_TOOL = {
    "type": "function",
    "function": {
        "name": "criar_pre_agendamento",
        "description": (
            "Registra um PRÉ-agendamento de consulta na agenda da clínica. Chame somente depois "
            "que o paciente confirmar o resumo dos dados (especialidade/serviço, dia e período). "
            "A equipe da clínica confirmará o horário exato depois."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "date": {"type": "string", "description": "Data desejada no formato YYYY-MM-DD (resolva 'amanhã', 'sexta' etc. usando a data atual informada no contexto)."},
                "period": {"type": "string", "enum": ["manha", "tarde", "noite"], "description": "Período preferido do paciente."},
                "time": {"type": "string", "description": "Hora exata HH:MM, apenas se o paciente pediu horário específico."},
                "specialty": {"type": "string", "description": "Especialidade ou serviço desejado (ex.: Ortodontia, Harmonização Facial)."},
                "specialist_name": {"type": "string", "description": "Nome do profissional, se o paciente escolheu um."},
                "insurance": {"type": "string", "description": "Convênio informado, ou 'Particular'."},
                "notes": {"type": "string", "description": "Observação relevante dita pelo paciente."},
            },
            "required": ["date", "specialty"],
        },
    },
}
