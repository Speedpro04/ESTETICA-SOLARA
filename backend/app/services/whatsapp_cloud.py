"""Envio pela API oficial do WhatsApp (Meta Cloud API).

Duas formas de falar com o lead, e a diferença não é cosmética:

  texto livre  Só dentro da janela de 24h desde a última mensagem DELE. Grátis.
  template     Fora da janela. Precisa ser aprovado pela Meta e ABRE UMA CONVERSA
               COBRADA — 'marketing' custa mais que 'utility'.

Quem decide qual usar é o estado da conversa (conversations.last_inbound_at),
não este módulo. Aqui só se executa a decisão.
"""
import asyncio
import logging
import re

import httpx

from ..config import settings

# Quebra a resposta em "balões" de WhatsApp, para a conversa não parecer um
# comunicado. Portado do fluxo antigo: os números vieram de conversa real.
_MAX_BUBBLES = 4
_TYPING_MS_PER_CHAR = 35
_TYPING_MIN_MS = 700
_TYPING_MAX_MS = 2800

_TIMEOUT = httpx.Timeout(30.0, connect=10.0)


def split_into_bubbles(text: str) -> list[str]:
    """Divide a resposta em balões separados, como uma conversa real.

    A Solara separa mensagens distintas por linha em branco. Cada parágrafo vira
    um balão; listas dentro de um mesmo parágrafo ficam juntas.
    """
    if not text:
        return []

    parts = re.split(r"\n\s*\n", text.strip())
    bubbles = [p.strip() for p in parts if p.strip()]

    # Sem linha em branco, mantém balão único — não força quebra artificial.
    if len(bubbles) <= 1:
        return bubbles or ([text.strip()] if text.strip() else [])

    # Excedente vai todo para o último, para não virar enxurrada de notificação.
    if len(bubbles) > _MAX_BUBBLES:
        head = bubbles[: _MAX_BUBBLES - 1]
        tail = "\n\n".join(bubbles[_MAX_BUBBLES - 1 :])
        bubbles = head + [tail]
    return bubbles


def typing_delay_ms(text: str) -> int:
    """Tempo de leitura proporcional ao tamanho do balão, em limites humanos."""
    ms = len(text) * _TYPING_MS_PER_CHAR
    return max(_TYPING_MIN_MS, min(_TYPING_MAX_MS, ms))


def _endpoint(phone_number_id: str) -> str:
    base = settings.META_GRAPH_URL.rstrip("/")
    return f"{base}/{settings.META_GRAPH_VERSION}/{phone_number_id}/messages"


def _headers(access_token: str | None = None) -> dict[str, str]:
    token = access_token or settings.META_ACCESS_TOKEN
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


async def _post(phone_number_id: str, payload: dict, access_token: str | None = None) -> dict | None:
    """Envia à Graph API e devolve a resposta, ou None em falha.

    Não levanta exceção: o chamador roda em background depois de o webhook já ter
    respondido 200 à Meta, e derrubar a task não devolveria erro a ninguém — só
    perderia o log.
    """
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.post(
                _endpoint(phone_number_id), headers=_headers(access_token), json=payload
            )
            if response.status_code >= 400:
                logging.warning(
                    "Envio WhatsApp falhou (%s) para %s: %s",
                    response.status_code, phone_number_id, response.text[:500],
                )
                return None
            return response.json()
    except Exception as exc:
        logging.warning("Erro ao enviar WhatsApp por %s: %s", phone_number_id, exc)
        return None


async def send_text(
    phone_number_id: str,
    to: str,
    text: str,
    access_token: str | None = None,
) -> str | None:
    """Texto livre. Só válido DENTRO da janela de 24h. Devolve o wamid enviado."""
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to,
        "type": "text",
        # Sem preview: link de clínica vira card enorme e polui a conversa.
        "text": {"preview_url": False, "body": text},
    }
    result = await _post(phone_number_id, payload, access_token)
    return _extract_wamid(result)


async def send_template(
    phone_number_id: str,
    to: str,
    template_name: str,
    language: str = "pt_BR",
    variables: list[str] | None = None,
    access_token: str | None = None,
) -> str | None:
    """Template aprovado. É o único caminho FORA da janela de 24h — e é cobrado."""
    components = []
    if variables:
        components.append({
            "type": "body",
            "parameters": [{"type": "text", "text": str(v)} for v in variables],
        })

    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": language},
            **({"components": components} if components else {}),
        },
    }
    result = await _post(phone_number_id, payload, access_token)
    return _extract_wamid(result)


async def mark_as_read(phone_number_id: str, wa_message_id: str, access_token: str | None = None) -> None:
    """Marca como lida. Cosmético, mas é o que faz o lead ver que foi atendido."""
    await _post(
        phone_number_id,
        {"messaging_product": "whatsapp", "status": "read", "message_id": wa_message_id},
        access_token,
    )


async def send_bubbles(
    phone_number_id: str,
    to: str,
    text: str,
    access_token: str | None = None,
    on_sent=None,
) -> list[str]:
    """Envia a resposta quebrada em balões, com pausa de leitura entre eles.

    on_sent(bubble, wamid) é chamado a cada balão entregue — é por onde o
    chamador persiste no banco exatamente o que o lead recebeu, sem este módulo
    precisar conhecer o Supabase.
    """
    sent: list[str] = []
    bubbles = split_into_bubbles(text)

    for index, bubble in enumerate(bubbles):
        # A partir do segundo, espera o tempo de ler o anterior.
        if index > 0:
            await asyncio.sleep(typing_delay_ms(bubbles[index - 1]) / 1000)

        wamid = await send_text(phone_number_id, to, bubble, access_token)
        if wamid:
            sent.append(wamid)
        if on_sent:
            on_sent(bubble, wamid)

    return sent


def _extract_wamid(result: dict | None) -> str | None:
    if not result:
        return None
    messages = result.get("messages")
    if isinstance(messages, list) and messages:
        return messages[0].get("id")
    return None
