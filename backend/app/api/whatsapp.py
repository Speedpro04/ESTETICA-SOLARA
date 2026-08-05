from fastapi import APIRouter, HTTPException, Request
import httpx
import logging
from urllib.parse import urlencode

router = APIRouter(prefix="/api/whatsapp", tags=["whatsapp"])
from ..config import settings
from ..services.auth_guard import require_clinic_user, require_instance_access

WEBHOOK_EVENTS = [
    "QRCODE_UPDATED",
    "CONNECTION_UPDATE",
    "MESSAGES_UPSERT",
    "MESSAGES_UPDATE",
    "SEND_MESSAGE",
]


def _build_headers() -> dict[str, str]:
    if not settings.EVOLUTION_API_KEY:
        raise HTTPException(status_code=500, detail="EVOLUTION_API_KEY não configurada")
    return {"apikey": settings.EVOLUTION_API_KEY}


def _build_webhook_url() -> str | None:
    if not settings.BACKEND_PUBLIC_URL:
        return None

    base_url = settings.BACKEND_PUBLIC_URL.rstrip("/")
    webhook_url = f"{base_url}/api/webhooks/evolution"
    if settings.EVOLUTION_WEBHOOK_SECRET:
        webhook_url = f"{webhook_url}?{urlencode({'token': settings.EVOLUTION_WEBHOOK_SECRET})}"
    return webhook_url


async def _configure_instance_webhook(client: httpx.AsyncClient, instance_name: str) -> dict | None:
    webhook_url = _build_webhook_url()
    if not webhook_url:
        logging.warning("BACKEND_PUBLIC_URL não configurada; webhook da Evolution não será configurado automaticamente.")
        return None

    payload = {
        "enabled": True,
        "url": webhook_url,
        "webhookByEvents": False,
        "webhookBase64": True,
        "events": WEBHOOK_EVENTS,
    }

    response = await client.post(
        f"{settings.EVOLUTION_API_URL}/webhook/set/{instance_name}",
        headers=_build_headers(),
        json=payload,
    )
    if response.status_code >= 400:
        logging.warning("Falha ao configurar webhook da Evolution para %s: %s", instance_name, response.text)
        return {"warning": "Falha ao configurar webhook", "details": response.text}
    return response.json()


async def _configure_instance_settings(client: httpx.AsyncClient, instance_name: str) -> dict | None:
    payload = {
        "reject_call": True,
        "groups_ignore": True,
        "always_online": True,
        "read_messages": True,
        "read_status": True,
        "sync_full_history": False,
        "msg_call": "No momento não consigo atender ligações por aqui. Se preferir, me envie uma mensagem e eu sigo com seu atendimento.",
    }

    response = await client.post(
        f"{settings.EVOLUTION_API_URL}/settings/set/{instance_name}",
        headers=_build_headers(),
        json=payload,
    )
    if response.status_code >= 400:
        logging.warning("Falha ao configurar settings da Evolution para %s: %s", instance_name, response.text)
        return {"warning": "Falha ao configurar settings", "details": response.text}
    return response.json()

@router.get("/status/{instance_name}")
async def get_status(instance_name: str, request: Request):
    """
    Verifica o status da instância na Evolution API
    """
    user = require_clinic_user(request)
    require_instance_access(user, instance_name)
    url = f"{settings.EVOLUTION_API_URL}/instance/connectionStatus/{instance_name}"
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, headers=_build_headers())
            return response.json()
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

@router.get("/connect/{instance_name}")
async def connect_instance(instance_name: str, request: Request):
    """
    Cria a instância se não existir e retorna o QR Code
    """
    user = require_clinic_user(request)
    require_instance_access(user, instance_name)
    create_url = f"{settings.EVOLUTION_API_URL}/instance/create"
    payload = {
        "instanceName": instance_name,
        "token": instance_name,
        "qrcode": True,
        "integration": "WHATSAPP-BAILEYS",
    }
    
    async with httpx.AsyncClient() as client:
        create_response = await client.post(create_url, headers=_build_headers(), json=payload)
        if create_response.status_code >= 400 and create_response.status_code != 403:
            raise HTTPException(status_code=500, detail=f"Falha ao criar instância: {create_response.text}")

        webhook_result = await _configure_instance_webhook(client, instance_name)
        settings_result = await _configure_instance_settings(client, instance_name)

        connect_url = f"{settings.EVOLUTION_API_URL}/instance/connect/{instance_name}"
        response = await client.get(connect_url, headers=_build_headers())
        result = response.json()
        if webhook_result is not None:
            result["webhook"] = webhook_result
        if settings_result is not None:
            result["settings_sync"] = settings_result
        return result

@router.post("/logout/{instance_name}")
async def logout_instance(instance_name: str, request: Request):
    """
    Desconecta o WhatsApp da instância
    """
    user = require_clinic_user(request)
    require_instance_access(user, instance_name)
    url = f"{settings.EVOLUTION_API_URL}/instance/logout/{instance_name}"
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.delete(url, headers=_build_headers())
            return response.json()
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
