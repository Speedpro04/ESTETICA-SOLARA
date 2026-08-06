from fastapi import APIRouter, Request, HTTPException, BackgroundTasks
import httpx
import asyncio
import re
import datetime
from ..config import settings
from ..services.supabase_service import supabase_client
from ..services.ai_service import chat_with_solara
import logging
from typing import Any

# Quebra a resposta da Solara em "balões" de WhatsApp para uma conversa mais humana.
_MAX_BUBBLES = 4            # nunca enviar mais que isso de uma vez (evita spam)
_TYPING_MS_PER_CHAR = 35    # tempo de "digitando..." proporcional ao tamanho do balão
_TYPING_MIN_MS = 700        # mínimo de "digitando..." por balão
_TYPING_MAX_MS = 2800       # máximo de "digitando..." por balão

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])

# Conteúdos que não devem disparar resposta automática da Solara.
_NON_REPLYABLE = {"[audio]", "[mensagem sem texto]"}

# Após este tempo de silêncio, a conversa é tratada como reiniciada e a Solara
# se apresenta de novo (equivalente a uma ligação que caiu e recomeçou).
_CONVERSATION_RESET_GAP_SECONDS = 3 * 60 * 60  # 3 horas


def _require_webhook_auth(request: Request) -> None:
    if not settings.EVOLUTION_WEBHOOK_SECRET:
        # Em produção o secret é OBRIGATÓRIO (fail-closed): sem ele, qualquer um
        # poderia injetar mensagens falsas e fazer a Solara responder.
        if settings.ENVIRONMENT == "production":
            logging.error("EVOLUTION_WEBHOOK_SECRET ausente em produção; webhook recusado.")
            raise HTTPException(status_code=503, detail="Webhook não configurado (EVOLUTION_WEBHOOK_SECRET ausente)")
        logging.warning("EVOLUTION_WEBHOOK_SECRET não configurado — webhook SEM autenticação (apenas dev).")
        return

    provided_token = request.query_params.get("token") or request.headers.get("x-webhook-token")
    if provided_token != settings.EVOLUTION_WEBHOOK_SECRET:
        raise HTTPException(status_code=401, detail="Webhook token inválido")


def _extract_instance_name(payload: dict[str, Any]) -> str | None:
    instance_block = payload.get("instance")
    if isinstance(instance_block, dict):
        for key in ("instanceName", "instance_name"):
            value = instance_block.get(key)
            if value:
                return str(value)
    for key in ("instance", "instanceName", "instance_name", "sender"):
        value = payload.get(key)
        if isinstance(value, str) and value:
            return value
    return None


def _extract_event_name(payload: dict[str, Any], event_slug: str | None) -> str:
    event_name = payload.get("event")
    if isinstance(event_name, str) and event_name:
        # A Evolution v2 envia "messages.upsert"; normalizamos para MESSAGES_UPSERT.
        return event_name.upper().replace(".", "_").replace("-", "_")
    if event_slug:
        return event_slug.replace("-", "_").upper()
    return "UNKNOWN"


def _extract_message_payload(payload: dict[str, Any]) -> dict[str, Any] | None:
    data_block = payload.get("data")
    if isinstance(data_block, dict):
        if isinstance(data_block.get("message"), dict):
            return data_block
        if isinstance(data_block.get("key"), dict):
            return data_block

    if isinstance(payload.get("message"), dict):
        return payload
    return None


def _extract_text_content(message_payload: dict[str, Any]) -> str:
    message = message_payload.get("message") or {}
    if not isinstance(message, dict):
        return ""

    for key in ("conversation", "extendedTextMessage", "imageMessage", "videoMessage", "documentMessage"):
        value = message.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, dict):
            text = value.get("text") or value.get("caption")
            if isinstance(text, str) and text.strip():
                return text.strip()

    audio_message = message.get("audioMessage")
    if isinstance(audio_message, dict):
        return "[audio]"

    return "[mensagem sem texto]"


def _extract_remote_jid(message_payload: dict[str, Any]) -> str | None:
    key_block = message_payload.get("key")
    if isinstance(key_block, dict):
        remote_jid = key_block.get("remoteJid")
        if isinstance(remote_jid, str) and remote_jid:
            return remote_jid
    return None


def _is_group(remote_jid: str | None) -> bool:
    """Mensagens de grupo têm o sufixo @g.us — a Solara não responde grupos."""
    return bool(remote_jid and "@g.us" in remote_jid)


def _normalize_phone(remote_jid: str | None) -> str | None:
    if not remote_jid:
        return None
    phone = remote_jid.split("@")[0].strip()
    if not phone:
        return None
    if ":" in phone:
        phone = phone.split(":")[0]
    return "".join(ch for ch in phone if ch.isdigit()) or None


def _is_from_me(message_payload: dict[str, Any]) -> bool:
    key_block = message_payload.get("key")
    if isinstance(key_block, dict):
        return bool(key_block.get("fromMe"))
    return False


def _find_clinic_id_by_instance(instance_name: str | None) -> str | None:
    if not instance_name:
        return None

    try:
        result = supabase_client.table("clinics").select("id").eq("whatsapp_instance_id", instance_name).limit(1).execute()
        if result.data:
            return result.data[0]["id"]
    except Exception:
        logging.info("Tabela clinics sem whatsapp_instance_id ou consulta indisponível; tentando fallback por prefixo.")

    if instance_name.startswith("solara_"):
        clinic_prefix = instance_name.removeprefix("solara_")
        try:
            result = supabase_client.table("clinics").select("id").ilike("id", f"{clinic_prefix}%").limit(1).execute()
            if result.data:
                return result.data[0]["id"]
        except Exception:
            logging.info("Fallback por prefixo de clinic_id não disponível para a instância %s.", instance_name)

    return None


def _find_clinic_id_by_phone(phone: str | None) -> str | None:
    """Cenário multi-clínica (número único): descobre a clínica pelo telefone do paciente."""
    if not phone:
        return None
    try:
        query = supabase_client.table("patients").select("clinic_id")
        if len(phone) >= 10:
            query = query.or_(f"phone.eq.{phone},phone.like.%{phone}%")
        else:
            query = query.eq("phone", phone)
        result = query.limit(1).execute()
        if result.data and result.data[0].get("clinic_id"):
            return result.data[0]["clinic_id"]
    except Exception as exc:
        logging.warning("Falha ao identificar clínica pelo telefone %s: %s", phone, exc)
    return None


def _find_patient_id(clinic_id: str | None, phone: str | None) -> str | None:
    if not phone:
        return None

    try:
        query = supabase_client.table("patients").select("id")
        if clinic_id:
            query = query.eq("clinic_id", clinic_id)

        # O match parcial (like) só é seguro com número completo; telefone curto
        # casaria com qualquer cadastro que o contenha como substring.
        if len(phone) >= 10:
            query = query.or_(f"phone.eq.{phone},phone.like.%{phone}%")
        else:
            query = query.eq("phone", phone)
        result = query.limit(1).execute()
        if result.data:
            return result.data[0]["id"]
    except Exception as exc:
        logging.warning("Não foi possível localizar paciente pelo telefone %s: %s", phone, exc)

    return None


def _extract_push_name(message_payload: dict[str, Any]) -> str | None:
    """Nome de perfil do WhatsApp (pushName), quando a Evolution o envia."""
    name = message_payload.get("pushName")
    if isinstance(name, str) and name.strip():
        return name.strip()
    return None


def _ensure_patient_id(clinic_id: str | None, phone: str | None, push_name: str | None) -> str | None:
    """Garante um paciente estável para este número de WhatsApp.

    Sem um paciente persistido, cada mensagem chega com patient_id=None: a Solara
    perde a memória da conversa E se reapresenta toda vez (o estado de apresentação
    é rastreado por paciente). Por isso, no primeiro contato, criamos o paciente
    a partir do telefone (e do nome de perfil do WhatsApp, quando houver).
    """
    existing = _find_patient_id(clinic_id, phone)
    if existing or not phone:
        return existing

    payload: dict[str, Any] = {
        "name": push_name or f"Paciente {phone}",
        "phone": phone,
    }
    if clinic_id:
        payload["clinic_id"] = clinic_id

    try:
        result = supabase_client.table("patients").insert(payload).execute()
        if result.data:
            return result.data[0]["id"]
    except Exception as exc:
        logging.warning("Não foi possível criar paciente para o telefone %s: %s", phone, exc)
        # Fallback: pode ter havido corrida (criado em paralelo) — tenta localizar de novo.
        return _find_patient_id(clinic_id, phone)

    return None


def _get_patient_name(patient_id: str | None) -> str | None:
    """Nome cadastrado do paciente (fallback quando o pushName não vem no evento)."""
    if not patient_id:
        return None
    try:
        res = supabase_client.table("patients").select("name").eq("id", patient_id).limit(1).execute()
        if res.data:
            return res.data[0].get("name")
    except Exception as exc:
        logging.warning("Falha ao buscar nome do paciente %s: %s", patient_id, exc)
    return None


def _conversation_patient_ids(clinic_id: str | None, phone: str | None, patient_id: str | None) -> list[str]:
    """Todos os patient_id ligados a este número de WhatsApp (cobre cadastros duplicados).

    Se o mesmo telefone virou mais de um cadastro (ex.: formato diferente entre painel
    e webhook), o histórico fica espalhado em vários patient_id. Juntamos todos para que
    apresentação e memória dependam do NÚMERO (estável), não de um cadastro específico.
    """
    ids: list[str] = []
    if patient_id:
        ids.append(patient_id)
    if phone:
        try:
            query = supabase_client.table("patients").select("id")
            if clinic_id:
                query = query.eq("clinic_id", clinic_id)
            result = query.eq("phone", phone).execute()
            for row in result.data or []:
                rid = row.get("id")
                if rid and rid not in ids:
                    ids.append(rid)
        except Exception as exc:
            logging.warning("Falha ao resolver pacientes pelo telefone %s: %s", phone, exc)
    return ids


def _fetch_conversation_rows(phone: str | None, patient_ids: list[str], limit: int, clinic_id: str | None = None) -> list[dict[str, Any]]:
    """Mensagens desta conversa, identificada pelo TELEFONE (gravado no metadata) com
    fallback por patient_id.

    Esta é a base que impede a reapresentação: identificar a conversa pelo número torna
    a busca imune a patient_id nulo OU a cadastros duplicados. Mensagens antigas (sem o
    marcador de telefone) ainda são alcançadas pelo fallback de patient_id.

    Quando o clinic_id é conhecido, a busca é restrita a ele: o mesmo paciente pode
    ser atendido por DUAS clínicas do sistema, e misturar os históricos vazaria a
    conversa de uma clínica para a outra.
    """
    by_key: dict[str, dict[str, Any]] = {}

    def _collect(rows: list[dict[str, Any]] | None) -> None:
        for row in rows or []:
            key = str(row.get("id")) if row.get("id") is not None else repr(row)
            by_key.setdefault(key, row)

    if phone:
        try:
            query = (
                supabase_client.table("messages")
                .select("id, content, sender_type, created_at")
                .eq("metadata->>_conversation_phone", phone)
            )
            if clinic_id:
                query = query.eq("clinic_id", clinic_id)
            res = query.order("created_at", desc=True).limit(limit).execute()
            _collect(res.data)
        except Exception as exc:
            logging.warning("Falha ao buscar mensagens por telefone %s: %s", phone, exc)

    if patient_ids:
        try:
            query = (
                supabase_client.table("messages")
                .select("id, content, sender_type, created_at")
                .in_("patient_id", patient_ids)
            )
            if clinic_id:
                query = query.eq("clinic_id", clinic_id)
            res = query.order("created_at", desc=True).limit(limit).execute()
            _collect(res.data)
        except Exception as exc:
            logging.warning("Falha ao buscar mensagens por patient_id: %s", exc)

    rows = list(by_key.values())
    rows.sort(key=lambda r: str(r.get("created_at") or ""), reverse=True)
    return rows[:limit]


def _fetch_conversation_history(phone: str | None, patient_ids: list[str], exclude_content: str, limit: int = 10, clinic_id: str | None = None) -> list[dict[str, str]]:
    """Histórico recente da conversa (para dar memória à Solara), em ordem cronológica."""
    rows = list(reversed(_fetch_conversation_rows(phone, patient_ids, limit, clinic_id)))
    history: list[dict[str, str]] = []
    for row in rows:
        content = (row.get("content") or "").strip()
        if not content or content in _NON_REPLYABLE:
            continue
        role = "user" if row.get("sender_type") == "patient" else "assistant"
        history.append({"role": role, "content": content})

    # Remove a própria mensagem atual (já persistida) do fim do histórico, se presente.
    if history and history[-1]["role"] == "user" and history[-1]["content"] == exclude_content:
        history.pop()
    return history


def _parse_timestamp(value: Any) -> datetime.datetime | None:
    """Converte o created_at do Supabase (ISO 8601) em datetime com timezone."""
    if not value:
        return None
    try:
        text = str(value).strip()
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        dt = datetime.datetime.fromisoformat(text)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=datetime.timezone.utc)
        return dt
    except Exception:
        return None


def _should_introduce(phone: str | None, patient_ids: list[str], clinic_id: str | None = None) -> bool:
    """Decide se a Solara deve se apresentar nesta mensagem.

    Decisão por CONVERSA (telefone), não por um patient_id — imune a cadastro
    duplicado ou patient_id nulo. Apresenta-se só no primeiro contato (a Solara
    nunca respondeu este número) ou quando a conversa recomeça após longo silêncio.

    Observação: a mensagem atual do paciente já foi persistida antes desta checagem,
    então ela aparece como a mais recente do histórico (rows[0]).
    """
    rows = _fetch_conversation_rows(phone, patient_ids, limit=50, clinic_id=clinic_id)

    if not rows:
        # Nada recuperável (sem rastro da conversa): NÃO fica reapresentando.
        # O primeiro contato real é coberto porque a mensagem atual já foi persistida
        # e aparece aqui — então rows só fica vazio em caso de erro/sem persistência.
        return False

    # Se a Solara nunca respondeu este número antes, é o primeiro contato.
    if not any(r.get("sender_type") == "clinic" for r in rows):
        return True

    # Conversa reiniciada? Mede o silêncio entre a mensagem atual e a anterior.
    if len(rows) >= 2:
        current_ts = _parse_timestamp(rows[0].get("created_at"))
        previous_ts = _parse_timestamp(rows[1].get("created_at"))
        if current_ts and previous_ts:
            gap = (current_ts - previous_ts).total_seconds()
            if gap >= _CONVERSATION_RESET_GAP_SECONDS:
                return True

    return False


# --- Confirmação de consulta via lembrete (Sim/Não) ---------------------------
# O lembrete diário pede "responda Sim ou Não". A resposta é tratada aqui de forma
# determinística: confirma ou cancela a consulta no banco e responde na hora,
# sem passar pela IA (que não tem acesso à agenda).

_CONFIRM_YES_WORDS = {
    "sim", "confirmo", "confirmado", "confirmada", "confirmar", "pode confirmar",
    "vou sim", "estarei la", "estarei lá", "claro", "com certeza", "positivo",
}
_CONFIRM_NO_WORDS = {
    "nao", "não", "nao vou", "não vou", "nao poderei", "não poderei",
    "nao consigo", "não consigo", "cancela", "cancelar", "desmarcar",
    "quero cancelar", "preciso cancelar", "nao vou conseguir", "não vou conseguir",
}
# Lembrete vale por este período: respostas "sim" muito depois não são confirmação.
_REMINDER_REPLY_WINDOW_HOURS = 48


def _match_confirmation_intent(content: str) -> str | None:
    """Retorna "yes", "no" ou None para a mensagem do paciente."""
    text = re.sub(r"[!.,…👍🙏✅❌\s]+$", "", (content or "").strip().lower())
    text = re.sub(r"^[\s👍🙏✅❌]+", "", text)
    if text in _CONFIRM_YES_WORDS:
        return "yes"
    if text in _CONFIRM_NO_WORDS:
        return "no"
    return None


def _find_appointment_awaiting_confirmation(clinic_id: str | None, patient_ids: list[str]) -> dict[str, Any] | None:
    """Próxima consulta futura deste paciente que recebeu lembrete recentemente."""
    if not patient_ids:
        return None
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    window_start = now_utc - datetime.timedelta(hours=_REMINDER_REPLY_WINDOW_HOURS)
    try:
        query = (
            supabase_client.table("appointments")
            .select("id, start_time, status, reminder_sent_at, patient_id")
            .in_("patient_id", patient_ids)
            .in_("status", ["pending", "confirmed"])
            .not_.is_("reminder_sent_at", "null")
            .gte("start_time", now_utc.isoformat())
        )
        if clinic_id:
            query = query.eq("clinic_id", clinic_id)
        res = query.order("start_time", desc=False).limit(5).execute()
    except Exception as exc:
        logging.warning("Falha ao buscar consulta aguardando confirmação: %s", exc)
        return None

    for appt in res.data or []:
        sent_at = _parse_timestamp(appt.get("reminder_sent_at"))
        if sent_at and sent_at >= window_start:
            return appt
    return None


def _format_appointment_local(raw_start: Any) -> str:
    """Data/hora da consulta em pt-BR no fuso de São Paulo (ex.: 14/06 às 09:30)."""
    dt = _parse_timestamp(raw_start)
    if not dt:
        return ""
    try:
        from zoneinfo import ZoneInfo
        local = dt.astimezone(ZoneInfo("America/Sao_Paulo"))
        return local.strftime("%d/%m às %H:%M")
    except Exception:
        return dt.strftime("%d/%m às %H:%M")


async def _try_handle_reminder_confirmation(
    instance_name: str | None,
    phone: str | None,
    clinic_id: str | None,
    patient_ids: list[str],
    content: str,
) -> bool:
    """Trata "Sim"/"Não" como confirmação/cancelamento da consulta lembrada.

    Retorna True se a mensagem foi consumida aqui (a IA não deve responder).
    """
    intent = _match_confirmation_intent(content)
    if not intent:
        return False

    appt = _find_appointment_awaiting_confirmation(clinic_id, patient_ids)
    if not appt:
        return False

    new_status = "confirmed" if intent == "yes" else "cancelled"
    try:
        supabase_client.table("appointments").update({"status": new_status}).eq("id", appt["id"]).execute()
    except Exception as exc:
        logging.warning("Falha ao atualizar status da consulta %s: %s", appt.get("id"), exc)
        return False  # deixa a IA acolher, em vez de silenciar o paciente

    when = _format_appointment_local(appt.get("start_time"))
    if intent == "yes":
        reply = (
            f"Perfeito! ✅ Sua consulta do dia {when} está confirmada."
            if when
            else "Perfeito! ✅ Sua consulta está confirmada."
        )
        reply += "\n\nQualquer coisa antes da consulta, é só me chamar por aqui."
    else:
        reply = (
            f"Tudo bem, já cancelei sua consulta do dia {when}."
            if when
            else "Tudo bem, sua consulta foi cancelada."
        )
        reply += "\n\nSe quiser, posso te ajudar a remarcar para um dia melhor. É só me dizer."

    for index, bubble in enumerate(_split_into_bubbles(reply)):
        if index > 0:
            await asyncio.sleep(_typing_delay_ms(bubble) / 1000)
        _persist_message(clinic_id, appt.get("patient_id"), bubble, "clinic", {"source": "reminder_confirmation"}, phone)
        await _send_whatsapp_reply(instance_name, phone, bubble, _typing_delay_ms(bubble))

    logging.info("Consulta %s marcada como %s via resposta de lembrete.", appt.get("id"), new_status)
    return True


def _persist_message(clinic_id: str | None, patient_id: str | None, content: str, sender_type: str, raw_payload: dict[str, Any], phone: str | None = None) -> None:
    try:
        # Marca o telefone no metadata: é assim que a conversa é reconhecida depois,
        # mesmo que o patient_id venha nulo ou duplicado (ver _fetch_conversation_rows).
        metadata: dict[str, Any] = dict(raw_payload) if isinstance(raw_payload, dict) else {"raw": raw_payload}
        if phone:
            metadata["_conversation_phone"] = phone
        payload: dict[str, Any] = {
            "content": content,
            "sender_type": sender_type,
            "status": "received" if sender_type == "patient" else "sent",
            "metadata": metadata,
        }
        if clinic_id:
            payload["clinic_id"] = clinic_id
        if patient_id:
            payload["patient_id"] = patient_id

        supabase_client.table("messages").insert(payload).execute()
    except Exception as exc:
        logging.warning("Webhook recebido, mas falhou ao persistir mensagem no Supabase: %s", exc)


def _split_into_bubbles(text: str) -> list[str]:
    """Divide a resposta da Solara em balões separados, como uma conversa real de WhatsApp.

    A Solara separa mensagens distintas por linha em branco (parágrafos). Cada parágrafo
    vira um balão. Listas/bullets dentro de um mesmo parágrafo (quebra simples) ficam juntos.
    """
    if not text:
        return []
    # Normaliza quebras e separa por linha(s) em branco.
    parts = re.split(r"\n\s*\n", text.strip())
    bubbles = [p.strip() for p in parts if p.strip()]

    # Se a Solara não usou linha em branco, mantém um único balão (não força quebra artificial).
    if len(bubbles) <= 1:
        return bubbles or ([text.strip()] if text.strip() else [])

    # Limita o número de balões: o excedente é agrupado no último para não virar spam.
    if len(bubbles) > _MAX_BUBBLES:
        head = bubbles[: _MAX_BUBBLES - 1]
        tail = "\n\n".join(bubbles[_MAX_BUBBLES - 1 :])
        bubbles = head + [tail]
    return bubbles


def _typing_delay_ms(text: str) -> int:
    """Tempo de 'digitando...' proporcional ao tamanho do balão, dentro de limites humanos."""
    ms = len(text) * _TYPING_MS_PER_CHAR
    return max(_TYPING_MIN_MS, min(_TYPING_MAX_MS, ms))


async def _send_whatsapp_reply(instance_name: str | None, phone: str | None, text: str, delay_ms: int = 0) -> bool:
    """Envia um balão de resposta pelo WhatsApp via Evolution API.

    delay_ms aciona o indicador 'digitando...' da Evolution antes de a mensagem aparecer.
    """
    if not (instance_name and phone and text and settings.EVOLUTION_API_KEY):
        return False
    url = f"{settings.EVOLUTION_API_URL}/message/sendText/{instance_name}"
    headers = {"apikey": settings.EVOLUTION_API_KEY, "Content-Type": "application/json"}
    payload: dict[str, Any] = {"number": phone, "text": text}
    if delay_ms > 0:
        payload["delay"] = delay_ms
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(url, headers=headers, json=payload)
            if response.status_code >= 400:
                logging.warning("Falha ao enviar resposta WhatsApp para %s: %s", phone, response.text)
                return False
            return True
    except Exception as exc:
        logging.warning("Erro ao enviar resposta WhatsApp para %s: %s", phone, exc)
        return False


async def _process_solara_reply(instance_name: str | None, phone: str | None, clinic_id: str | None, patient_id: str | None, content: str, patient_name: str | None = None) -> None:
    """Gera a resposta da Solara e devolve pelo WhatsApp (executado em background)."""
    try:
        from .ai import _load_clinic_context  # import tardio evita ciclo de importação
        clinic_context = _load_clinic_context(clinic_id) if clinic_id else None
        # Identifica a conversa pelo TELEFONE (estável), juntando cadastros duplicados.
        conversation_ids = _conversation_patient_ids(clinic_id, phone, patient_id)

        # Resposta determinística do lembrete (Sim/Não confirma ou cancela a
        # consulta). Se tratada aqui, não cai na IA.
        if await _try_handle_reminder_confirmation(instance_name, phone, clinic_id, conversation_ids, content):
            return

        history = _fetch_conversation_history(phone, conversation_ids, content, clinic_id=clinic_id)
        should_introduce = _should_introduce(phone, conversation_ids, clinic_id)
        # Nome para personalizar o atendimento: pushName do WhatsApp ou nome cadastrado.
        name_for_ai = patient_name or _get_patient_name(patient_id)
        # Contexto de agendamento real: permite à Solara criar a pré-reserva na agenda.
        booking = {"clinic_id": clinic_id, "patient_id": patient_id} if clinic_id and patient_id else None
        reply = await chat_with_solara(content, history, clinic_context, should_introduce, name_for_ai, booking)
        if not reply or not reply.strip():
            return

        # Divide a resposta em balões e envia um de cada vez, com efeito de "digitando...".
        bubbles = _split_into_bubbles(reply)
        for index, bubble in enumerate(bubbles):
            delay_ms = _typing_delay_ms(bubble)
            # Pequena pausa entre balões para o paciente "ler" o anterior (a partir do 2º).
            if index > 0:
                await asyncio.sleep(delay_ms / 1000)
            # Registra cada balão como mensagem enviada (espelha o que o paciente recebe).
            _persist_message(clinic_id, patient_id, bubble, "clinic", {"source": "solara_ai"}, phone)
            await _send_whatsapp_reply(instance_name, phone, bubble, delay_ms)
    except Exception as exc:
        logging.exception("Falha ao gerar/enviar resposta da Solara: %s", exc)


async def _handle_evolution_webhook(request: Request, background_tasks: BackgroundTasks | None = None, event_slug: str | None = None):
    try:
        _require_webhook_auth(request)
        data = await request.json()
        event_name = _extract_event_name(data, event_slug)
        instance_name = _extract_instance_name(data)

        logging.info("Webhook Evolution recebido: event=%s instance=%s", event_name, instance_name)

        message_payload = _extract_message_payload(data)
        if event_name != "MESSAGES_UPSERT" or not message_payload:
            return {"status": "ignored", "event": event_name, "instance": instance_name}

        sender_type = "clinic" if _is_from_me(message_payload) else "patient"

        remote_jid = _extract_remote_jid(message_payload)
        phone = _normalize_phone(remote_jid)
        content = _extract_text_content(message_payload)
        push_name = _extract_push_name(message_payload)

        # Metadata COMPACTO: gravar o payload bruto inteiro acumulava dados
        # pessoais e lixo técnico no banco (LGPD + custo). Só o necessário.
        key_block = message_payload.get("key") if isinstance(message_payload.get("key"), dict) else {}
        compact_meta: dict[str, Any] = {
            "event": event_name,
            "instance": instance_name,
            "message_id": key_block.get("id"),
            "from_me": _is_from_me(message_payload),
            "push_name": push_name,
            "timestamp": message_payload.get("messageTimestamp"),
        }
        compact_meta = {k: v for k, v in compact_meta.items() if v is not None}

        # Resolve a clínica logo cedo: pela instância e, se não bater (número único
        # multi-clínica), pelo telefone do paciente.
        clinic_id = _find_clinic_id_by_instance(instance_name) or _find_clinic_id_by_phone(phone)

        is_group = _is_group(remote_jid)
        # Garante um paciente estável para o número (memória + apresentação só 1x).
        # Para mensagens da própria clínica ou de grupos, apenas tentamos localizar.
        if sender_type == "patient" and phone and not is_group:
            patient_id = _ensure_patient_id(clinic_id, phone, push_name)
        else:
            patient_id = _find_patient_id(clinic_id, phone)

        _persist_message(clinic_id, patient_id, content, sender_type, compact_meta, phone)

        # ---- Resposta automática da Solara ----
        # Só para mensagens de TEXTO, de PACIENTES, fora de grupos.
        should_reply = (
            sender_type == "patient"
            and background_tasks is not None
            and content
            and content not in _NON_REPLYABLE
            and not is_group
        )
        if should_reply:
            background_tasks.add_task(
                _process_solara_reply, instance_name, phone, clinic_id, patient_id, content, push_name
            )

        return {
            "status": "success",
            "event": event_name,
            "instance": instance_name,
            "clinic_id": clinic_id,
            "patient_id": patient_id,
            "auto_reply": bool(should_reply),
        }
    except HTTPException:
        raise
    except Exception as exc:
        logging.exception("Erro ao processar webhook da Evolution API")
        raise HTTPException(status_code=500, detail=f"Erro ao processar webhook: {exc}")


@router.post("/evolution")
async def evolution_webhook(request: Request, background_tasks: BackgroundTasks):
    """
    Recebe eventos da Evolution API em um endpoint único.
    """
    return await _handle_evolution_webhook(request, background_tasks)


@router.post("/evolution/{event_slug}")
async def evolution_webhook_by_event(event_slug: str, request: Request, background_tasks: BackgroundTasks):
    """
    Recebe eventos da Evolution API quando webhook por evento estiver habilitado.
    """
    return await _handle_evolution_webhook(request, background_tasks, event_slug)
