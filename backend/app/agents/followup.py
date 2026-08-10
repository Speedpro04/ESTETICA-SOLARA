"""Agente 4 — Follow-up: reengaja quem parou de responder.

Não é um agente conversacional. É gatilho + template: ele toca a conversa SEM
mudar o estágio, e quando a pessoa responde ela continua exatamente de onde
parou — com o SDR ou com o Agendador, conforme estava. Se follow-up virasse
estágio, o retorno perderia o contexto.

O custo manda no desenho. Fora da janela de 24h, cada tentativa abre uma conversa
COBRADA pela Meta, e 'marketing' custa mais que 'utility'. Daí três travas:

    teto por lead        follow_up_max_tentativas, conferido antes de enviar
    janela de silêncio   ninguém recebe mensagem de clínica às 23h
    reset na resposta    lead respondeu, a régua zera e o disparo pendente morre

A terceira é a mais fácil de esquecer e a que mais dói: sem ela, o template sai
DEPOIS de a pessoa já ter voltado, e a clínica paga para reengajar quem já estava
conversando.
"""
import datetime as dt
import logging
from typing import Any
from zoneinfo import ZoneInfo

from ..services import whatsapp_cloud
from ..services.supabase_service import supabase_client

# Mensagem usada quando a conversa ainda está DENTRO da janela de 24h. Aí não
# precisa de template aprovado e o envio é gratuito.
#
# O texto é de CONVENIÊNCIA, não de cobrança. "Ainda tem interesse?" é pergunta
# de vendedor: devolve o trabalho para quem já não respondeu e, com público de
# alto padrão, lê-se como perseguição. Oferecer algo pronto — um horário que
# ainda existe — remove atrito em vez de pedir atenção.
TEXTO_LIVRE_PADRAO = (
    "Ainda tenho horário disponível para essa semana.\n\n"
    "Se quiser, eu já separo um para você — leva menos de um minuto."
)


def _agora_local(timezone: str | None) -> dt.time:
    try:
        tz = ZoneInfo(timezone or "America/Sao_Paulo")
    except Exception:
        tz = ZoneInfo("America/Sao_Paulo")
    return dt.datetime.now(tz).time()


def _hora(valor: Any) -> dt.time | None:
    if isinstance(valor, dt.time):
        return valor
    try:
        h, m = str(valor).split(":")[:2]
        return dt.time(int(h), int(m))
    except Exception:
        return None


def em_silencio(item: dict[str, Any]) -> bool:
    """Está dentro da janela de "não incomodar" da clínica?

    A janela cruza a meia-noite (21h às 8h), então a comparação não pode ser um
    simples `inicio <= agora <= fim` — nesse formato ela nunca seria verdadeira.
    """
    inicio = _hora(item.get("follow_up_silencio_inicio")) or dt.time(21, 0)
    fim = _hora(item.get("follow_up_silencio_fim")) or dt.time(8, 0)
    agora = _agora_local(item.get("timezone"))

    if inicio <= fim:
        return inicio <= agora < fim
    return agora >= inicio or agora < fim


def _variaveis_do_template(item: dict[str, Any]) -> list[str]:
    """Preenche as variáveis do template com o que a conversa já sabe."""
    nome = (item.get("contact_name") or "").strip().split(" ")[0] or "tudo bem"
    procedimento = (item.get("procedimento") or "").strip() or "o procedimento"
    return [nome, procedimento]


async def enviar_um(item: dict[str, Any]) -> dict[str, Any]:
    """Dispara uma tentativa. Devolve o que aconteceu, para o log do job."""
    conversation_id = item["conversation_id"]
    phone_number_id = item.get("phone_number_id")
    para = item["wa_contact_id"]

    if not phone_number_id:
        return {"conversation_id": conversation_id, "acao": "sem_numero"}

    if em_silencio(item):
        # Não consome tentativa nem reagenda: o job volta a passar aqui mais
        # tarde e envia no horário certo.
        return {"conversation_id": conversation_id, "acao": "silencio"}

    dentro_da_janela = bool(item.get("janela_aberta"))

    if dentro_da_janela:
        # Texto livre, sem custo de conversa iniciada.
        wamid = await whatsapp_cloud.send_text(phone_number_id, para, TEXTO_LIVRE_PADRAO)
        conteudo, template, categoria = TEXTO_LIVRE_PADRAO, None, "service"
    else:
        template = item.get("template_name")
        if not template:
            # Fora da janela e sem template aprovado não há caminho legal de
            # envio. Registrar é melhor que falhar em silêncio: é sinal de que a
            # clínica precisa cadastrar o template na Meta.
            logging.info(
                "Conversa %s vencida para follow-up, mas a clínica não tem template aprovado.",
                conversation_id,
            )
            return {"conversation_id": conversation_id, "acao": "sem_template"}

        wamid = await whatsapp_cloud.send_template(
            phone_number_id,
            para,
            template,
            language=item.get("template_language") or "pt_BR",
            variables=_variaveis_do_template(item),
        )
        conteudo = f"[template: {template}]"
        categoria = item.get("template_categoria") or "marketing"

    if not wamid:
        return {"conversation_id": conversation_id, "acao": "falha_no_envio"}

    _persistir(item, conteudo, wamid, template, categoria)

    try:
        resultado = supabase_client.rpc(
            "registrar_follow_up", {"p_conversation_id": conversation_id}
        ).execute()
        contagem = (resultado.data or {}).get("tentativas")
    except Exception as exc:
        # A mensagem JÁ saiu. Não conseguir contabilizar significa que o job vai
        # tentar de novo no próximo ciclo — por isso o erro é alto no log.
        logging.error("Follow-up enviado a %s mas não contabilizado: %s", conversation_id, exc)
        contagem = None

    return {
        "conversation_id": conversation_id,
        "acao": "enviado",
        "tipo": "texto" if dentro_da_janela else "template",
        "categoria_cobranca": categoria,
        "tentativa": contagem,
    }


def _persistir(item: dict, conteudo: str, wamid: str, template: str | None, categoria: str) -> None:
    try:
        supabase_client.table("messages").insert({
            "clinic_id": item["clinic_id"],
            "conversation_id": item["conversation_id"],
            "content": conteudo,
            "direction": "outbound",
            "sender_type": "ia",
            "agent": "follow_up",
            "status": "sent",
            "wa_message_id": wamid,
            "template_name": template,
            # É por esta coluna que sai o custo real de WhatsApp por clínica.
            "categoria_cobranca": categoria,
        }).execute()
    except Exception as exc:
        logging.warning("Falha ao registrar follow-up enviado: %s", exc)


async def processar_fila(limite: int = 100) -> dict[str, Any]:
    """Percorre a fila de follow-up pendente. Chamado pelo job periódico."""
    try:
        resultado = (
            supabase_client.table("vw_pending_followups")
            .select("*")
            .order("next_follow_up_at")
            .limit(limite)
            .execute()
        )
        pendentes = resultado.data or []
    except Exception as exc:
        logging.exception("Falha ao ler a fila de follow-up: %s", exc)
        return {"ok": False, "error": str(exc)}

    resumo: dict[str, int] = {}
    detalhes = []

    for item in pendentes:
        try:
            saida = await enviar_um(item)
        except Exception as exc:
            logging.exception("Erro no follow-up de %s: %s", item.get("conversation_id"), exc)
            saida = {"conversation_id": item.get("conversation_id"), "acao": "erro"}

        resumo[saida["acao"]] = resumo.get(saida["acao"], 0) + 1
        detalhes.append(saida)

    # Loga o que foi ignorado e por quê: fila que "rodou sem erro" mas não enviou
    # nada é indistinguível de fila vazia, e é assim que um template rejeitado
    # pela Meta passa semanas sem ninguém notar.
    if resumo:
        logging.info("Follow-up processado: %s", resumo)

    return {"ok": True, "pendentes": len(pendentes), "resumo": resumo, "detalhes": detalhes}


def expirar_handoffs() -> dict[str, Any]:
    """Devolve à IA as conversas em que ninguém assumiu dentro do prazo."""
    try:
        resultado = supabase_client.rpc("expirar_handoffs", {}).execute()
        expiradas = resultado.data or []
    except Exception as exc:
        logging.exception("Falha ao expirar handoffs: %s", exc)
        return {"ok": False, "error": str(exc)}

    if expiradas:
        logging.warning(
            "%d handoff(s) devolvidos à Solara por timeout — ninguém assumiu.", len(expiradas)
        )
    return {"ok": True, "expirados": len(expiradas), "detalhes": expiradas}
