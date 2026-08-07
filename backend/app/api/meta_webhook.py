"""Webhook da API oficial do WhatsApp (Meta Cloud API).

Duas responsabilidades, e só duas:

  1. Provar que o evento veio mesmo da Meta (assinatura HMAC).
  2. Responder 200 DEPRESSA e processar depois.

O ponto 2 não é otimização. A Meta reenvia o evento sempre que não recebe 200
rápido, e cada reenvio é uma mensagem duplicada — que vira resposta duplicada
para o lead. A trava final contra isso é o índice único em messages.wa_message_id
(resolvido dentro de handle_inbound_whatsapp), mas responder rápido é o que
evita a fila de reenvio começar.

A resolução de clínica é feita pelo phone_number_id, no banco. NÃO existe
fallback do tipo "descobre a clínica pelo telefone de quem mandou": número
desconhecido é erro de configuração, e adivinhar o tenant faz a conversa de uma
clínica cair na outra.
"""
import hashlib
import hmac
import logging
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, Response

from ..config import settings

router = APIRouter(prefix="/api/webhooks", tags=["meta"])


# --- Verificação (handshake do painel da Meta) --------------------------------

@router.get("/meta")
async def verify_webhook(request: Request) -> Response:
    """A Meta chama isto uma vez, ao cadastrar a URL, e espera o challenge de volta."""
    params = request.query_params
    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge", "")

    if not settings.META_VERIFY_TOKEN:
        logging.error("META_VERIFY_TOKEN ausente; verificação do webhook recusada.")
        raise HTTPException(status_code=503, detail="Webhook não configurado")

    # compare_digest em vez de ==: comparação comum vaza o token por tempo de
    # resposta, e este é o segredo que autoriza cadastrar a URL.
    if mode == "subscribe" and hmac.compare_digest(token or "", settings.META_VERIFY_TOKEN):
        return Response(content=challenge, media_type="text/plain")

    raise HTTPException(status_code=403, detail="Verify token inválido")


# --- Assinatura ---------------------------------------------------------------

def _signature_ok(raw_body: bytes, header: str | None) -> bool:
    """Confere o X-Hub-Signature-256 contra o corpo CRU.

    Tem que ser o corpo cru: reserializar o JSON muda espaço e ordem de chave, e
    o HMAC deixa de bater mesmo com o conteúdo idêntico.
    """
    if not settings.META_APP_SECRET:
        # Fail-closed em produção. Sem segredo, qualquer um posta no endpoint e
        # faz a Solara responder em nome da clínica.
        if settings.ENVIRONMENT == "production":
            logging.error("META_APP_SECRET ausente em produção; webhook recusado.")
            return False
        logging.warning("META_APP_SECRET não configurado — webhook SEM validação (apenas dev).")
        return True

    if not header or not header.startswith("sha256="):
        return False

    esperado = hmac.new(
        settings.META_APP_SECRET.encode("utf-8"), raw_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(esperado, header.removeprefix("sha256="))


# --- Extração do payload ------------------------------------------------------

def _extract_events(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Achata o payload da Meta numa lista de mensagens recebidas.

    O formato é aninhado (entry[] -> changes[] -> value.messages[]) e um único
    POST pode trazer várias mensagens, de vários números. Achatar aqui deixa o
    processamento com um caso só para tratar.
    """
    eventos: list[dict[str, Any]] = []

    for entry in payload.get("entry") or []:
        for change in entry.get("changes") or []:
            value = change.get("value") or {}
            if change.get("field") != "messages":
                continue

            phone_number_id = (value.get("metadata") or {}).get("phone_number_id")
            if not phone_number_id:
                continue

            # profile.name vem em contacts[], separado de messages[].
            nomes = {
                c.get("wa_id"): ((c.get("profile") or {}).get("name"))
                for c in (value.get("contacts") or [])
            }

            for msg in value.get("messages") or []:
                wa_id = msg.get("from")
                eventos.append({
                    "phone_number_id": phone_number_id,
                    "wa_contact_id": wa_id,
                    "wa_message_id": msg.get("id"),
                    "contact_name": nomes.get(wa_id),
                    "timestamp": msg.get("timestamp"),
                    "type": msg.get("type"),
                    "content": _extract_text(msg),
                })

    return eventos


# Tipos que a Solara não tem como responder. Áudio entra aqui por ora: sem
# transcrição, responder é chutar o que a pessoa disse.
NAO_RESPONDIVEIS = {"audio", "sticker", "unknown", "unsupported"}


def _extract_text(msg: dict[str, Any]) -> str:
    """Texto útil da mensagem, qualquer que seja o tipo."""
    tipo = msg.get("type")

    if tipo == "text":
        return (msg.get("text") or {}).get("body", "").strip()

    # Imagem e vídeo com legenda: a legenda costuma ser a pergunta de verdade
    # ("é esse resultado que eu quero, quanto sai?").
    if tipo in ("image", "video", "document"):
        return ((msg.get(tipo) or {}).get("caption") or "").strip() or f"[{tipo}]"

    # Botão ou lista: o título é a escolha do lead, e vale como resposta.
    if tipo == "interactive":
        interactive = msg.get("interactive") or {}
        for chave in ("button_reply", "list_reply"):
            bloco = interactive.get(chave) or {}
            if bloco.get("title"):
                return bloco["title"].strip()
        return "[interativo]"

    if tipo == "button":
        return ((msg.get("button") or {}).get("text") or "").strip() or "[botão]"

    return f"[{tipo}]"


# --- Recebimento --------------------------------------------------------------

@router.post("/meta")
async def receive_webhook(request: Request, background_tasks: BackgroundTasks) -> dict:
    raw_body = await request.body()

    if not _signature_ok(raw_body, request.headers.get("x-hub-signature-256")):
        raise HTTPException(status_code=401, detail="Assinatura inválida")

    try:
        payload = await request.json()
    except Exception:
        # Corpo ilegível não é motivo para a Meta reenviar: 200 e segue.
        logging.warning("Webhook da Meta com corpo não-JSON; ignorado.")
        return {"status": "ignored"}

    eventos = _extract_events(payload)
    if not eventos:
        # Status de entrega (sent/delivered/read) cai aqui. Não é erro.
        return {"status": "ignored", "reason": "sem mensagens"}

    from ..agents.router import processar_mensagem  # tardio: evita ciclo de import

    for evento in eventos:
        background_tasks.add_task(processar_mensagem, evento)

    # 200 imediato. O trabalho real acontece depois desta linha.
    return {"status": "accepted", "eventos": len(eventos)}
