from celery import shared_task
from .config import settings
from .services.supabase_service import supabase_client
import httpx
import logging
from datetime import datetime, timedelta, time, timezone
from zoneinfo import ZoneInfo

# Fuso oficial da operação (Brasil). start_time é TIMESTAMPTZ (guardado em UTC).
_TZ = ZoneInfo("America/Sao_Paulo")


def _evo_instance(clinic_id: str | None = None) -> str:
    """Instância da Evolution a usar no envio (número único: EVOLUTION_INSTANCE)."""
    return settings.EVOLUTION_INSTANCE or (clinic_id or "")


def _format_local_time(raw) -> str:
    """Hora (HH:MM) da consulta no fuso de São Paulo, a partir do start_time ISO/UTC."""
    try:
        txt = str(raw).strip()
        if txt.endswith("Z"):
            txt = txt[:-1] + "+00:00"
        dt = datetime.fromisoformat(txt)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(_TZ).strftime("%H:%M")
    except Exception:
        return str(raw)[11:16]


@shared_task
def send_whatsapp_message(phone: str, message: str, clinic_id: str | None = None):
    """
    Envia mensagem WhatsApp via Evolution API (formato v2).
    """
    try:
        instance = _evo_instance(clinic_id)
        url = f"{settings.EVOLUTION_API_URL}/message/sendText/{instance}"
        headers = {"apikey": settings.EVOLUTION_API_KEY}
        data = {"number": phone, "text": message}
        with httpx.Client(timeout=30) as client:
            response = client.post(url, json=data, headers=headers)
            return response.json()
    except Exception as e:
        return {"error": str(e)}

@shared_task
def send_whatsapp_media(phone: str, media_base64: str, media_type: str, caption: str, clinic_id: str | None = None):
    """
    Envia mídia (imagem, áudio, vídeo) via Evolution API (formato v2).
    media_type: 'image', 'audio', 'video', 'document'
    """
    try:
        instance = _evo_instance(clinic_id)
        url = f"{settings.EVOLUTION_API_URL}/message/sendMedia/{instance}"
        headers = {"apikey": settings.EVOLUTION_API_KEY}
        data = {
            "number": phone,
            "mediatype": media_type,
            "caption": caption,
            "media": media_base64,
        }
        with httpx.Client(timeout=60) as client:
            response = client.post(url, json=data, headers=headers)
            return response.json()
    except Exception as e:
        return {"error": str(e)}

@shared_task
def send_appointment_reminder(appointment_id: str, clinic_id: str):
    """
    Envia lembrete de consulta agendada via WhatsApp
    """
    try:
        # 1. Buscar dados do agendamento, paciente e clínica
        response = supabase_client.table("appointments").select("*, patients(*), clinics(*)").eq("id", appointment_id).single().execute()
        
        if not response.data:
            return {"error": "Agendamento não encontrado"}
            
        appointment = response.data
        patient = appointment.get("patients")
        clinic = appointment.get("clinics")
        
        if not patient or not patient.get("phone"):
            return {"error": "Paciente sem telefone cadastrado"}

        # 2. Formatar mensagem humanizada (Estilo Solara IA)
        first_name = (patient.get("name") or "").split()[0] if patient.get("name") else ""
        saudacao = f"Olá, {first_name}! 🌟" if first_name else "Olá! 🌟"
        hora = _format_local_time(appointment["start_time"])
        message = f"{saudacao}\n\nAqui é da clínica {clinic['name']}. Passando para confirmar sua consulta agendada para amanhã, às {hora}.\n\nPodemos confirmar sua presença? Basta responder 'Sim' ou 'Não'."

        # 3. Enviar via Evolution API
        return send_whatsapp_message(patient['phone'], message, clinic_id)
        
    except Exception as e:
        return {"error": str(e)}

@shared_task
def process_daily_reports(clinic_id: str):
    """
    Processa relatórios diários da clínica (ex: total de agendamentos, no-shows)
    """
    try:
        today = datetime.now().date().isoformat()
        response = supabase_client.table("appointments").select("*").eq("clinic_id", clinic_id).gte("start_time", today).execute()
        
        # Lógica de sumarização com Polars (como sugerido no main.py)
        # Por enquanto, apenas retorna o count
        return {
            "clinic_id": clinic_id,
            "date": today,
            "total_appointments": len(response.data) if response.data else 0
        }
    except Exception as e:
        return {"error": str(e)}


@shared_task
def dispatch_appointment_reminders():
    """Enfileira lembretes para as consultas de AMANHÃ (fuso de São Paulo).

    É o disparador que faltava: roda 1x/dia pelo Celery beat, busca as consultas
    do dia seguinte ainda ativas (pending/confirmed) e que ainda não receberam
    lembrete, e enfileira um `send_appointment_reminder` para cada paciente.

    Idempotente: "reivindica" cada consulta marcando `reminder_sent_at` ANTES de
    enfileirar (update condicional), então mesmo se o beat rodar de novo no mesmo
    dia ninguém recebe lembrete duplicado.
    """
    now_local = datetime.now(_TZ)
    tomorrow = (now_local + timedelta(days=1)).date()
    day_start = datetime.combine(tomorrow, time.min, tzinfo=_TZ)
    day_end = datetime.combine(tomorrow, time.max, tzinfo=_TZ)

    try:
        res = (
            supabase_client.table("appointments")
            .select("id, clinic_id")
            .gte("start_time", day_start.isoformat())
            .lte("start_time", day_end.isoformat())
            .in_("status", ["pending", "confirmed"])
            .is_("reminder_sent_at", "null")
            .execute()
        )
    except Exception as e:
        # Em geral significa que falta a coluna `reminder_sent_at` (ver SQL do deploy).
        logging.warning("dispatch_appointment_reminders: falha ao buscar consultas: %s", e)
        return {"error": f"falha ao buscar consultas de amanha (falta coluna reminder_sent_at?): {e}"}

    rows = res.data or []
    dispatched = 0
    for appt in rows:
        appt_id = appt.get("id")
        clinic_id = appt.get("clinic_id")
        if not appt_id or not clinic_id:
            continue
        try:
            # Reivindica a consulta (claim) antes de enfileirar — evita duplicado.
            claim = (
                supabase_client.table("appointments")
                .update({"reminder_sent_at": datetime.now(_TZ).isoformat()})
                .eq("id", appt_id)
                .is_("reminder_sent_at", "null")
                .execute()
            )
            if not claim.data:
                # Outra execução já reivindicou esta consulta nesse meio-tempo.
                continue
        except Exception as e:
            logging.warning("dispatch_appointment_reminders: falha ao reivindicar %s: %s", appt_id, e)
            continue

        send_appointment_reminder.delay(appt_id, clinic_id)
        dispatched += 1

    return {"date": tomorrow.isoformat(), "found": len(rows), "dispatched": dispatched}
