"""Roteador: decide qual dos quatro agentes responde e executa a resposta.

A ordem das checagens abaixo não é arbitrária — cada uma protege da seguinte:

  1. Registro + idempotência   Reenvio da Meta morre aqui, antes de gastar token.
  2. Trava de atendimento      Handoff aberto ou opt-out: a IA cala.
  3. Regra determinística      Risco clínico escala ANTES de o modelo opinar.
  4. Roteamento por estágio    Só aqui um agente conversacional é chamado.

Inverter 3 e 4 seria o erro grave: significaria deixar o modelo decidir se uma
pergunta sobre reação adversa merece resposta automática. Não merece — nunca.

O envio é injetável (`transport`) porque isso é o que torna o fluxo inteiro
testável sem a Meta: em desenvolvimento, um transport falso registra no banco e
imprime no log, e todo o resto do caminho é exercitado de verdade.
"""
import logging
from typing import Any, Callable, Awaitable

from ..services import conversation as conv
from ..services import whatsapp_cloud

# Tipos que não geram resposta automática: sem transcrição, responder a um áudio
# é chutar o que a pessoa disse.
TIPOS_SEM_RESPOSTA = {"audio", "sticker", "unknown", "unsupported"}

# Mensagem padrão enquanto o lead espera um humano. Só usada quando a regra de
# escalonamento não trouxe uma própria e a clínica não configurou a dela.
ESPERA_PADRAO = (
    "Essa é uma pergunta importante e quero que você receba a resposta certa.\n\n"
    "Já estou chamando alguém da equipe para falar com você por aqui."
)


async def _transport_padrao(
    phone_number_id: str, to: str, texto: str, on_sent=None
) -> list[str]:
    return await whatsapp_cloud.send_bubbles(phone_number_id, to, texto, on_sent=on_sent)


async def processar_mensagem(
    evento: dict[str, Any],
    transport: Callable[..., Awaitable[list[str]]] | None = None,
) -> dict[str, Any]:
    """Processa uma mensagem recebida, do registro até a resposta enviada.

    Roda em background: o webhook já respondeu 200 à Meta antes desta função
    começar. Por isso nada aqui levanta exceção para fora — não há a quem
    devolver erro, e derrubar a task só perderia o log.
    """
    enviar = transport or _transport_padrao

    # ---- 1. Registro e idempotência -----------------------------------------
    estado = conv.handle_inbound(evento)
    if not estado or not estado.get("ok"):
        motivo = (estado or {}).get("error", "falha ao registrar")
        logging.warning("Mensagem descartada: %s", motivo)
        return {"acao": "descartada", "motivo": motivo}

    if estado.get("duplicada"):
        # Reenvio da Meta. Já respondemos a esta mensagem uma vez.
        return {"acao": "duplicada", "conversation_id": estado.get("conversation_id")}

    clinic_id = estado["clinic_id"]
    conversation_id = estado["conversation_id"]
    to = evento["wa_contact_id"]
    phone_number_id = evento["phone_number_id"]
    texto = (evento.get("content") or "").strip()

    def _registrar(bubble: str, wamid: str | None, agente: str | None) -> None:
        conv.registrar_saida(clinic_id, conversation_id, bubble, agent=agente, wa_message_id=wamid)

    # ---- 2. Trava de atendimento --------------------------------------------
    if not estado.get("ia_deve_responder"):
        # Handoff aberto, opt-out, ou trava manual do painel. Silêncio é o
        # comportamento correto: IA e atendente respondendo juntos é pior que
        # demora.
        return {"acao": "silencio", "estagio": estado.get("stage")}

    if evento.get("type") in TIPOS_SEM_RESPOSTA or not texto:
        return {"acao": "sem_resposta", "tipo": evento.get("type")}

    # ---- 3. Escalonamento determinístico ------------------------------------
    regra = conv.checar_escalonamento(clinic_id, texto)
    if regra:
        conv.open_handoff(
            conversation_id,
            motivo=regra.get("rotulo") or "Regra de escalonamento",
            severidade=regra.get("severidade") or "alta",
            rule_id=regra.get("id"),
            trigger="regra",
        )
        espera = (regra.get("mensagem_de_espera") or "").strip() or ESPERA_PADRAO
        await enviar(phone_number_id, to, espera,
                     on_sent=lambda b, w: _registrar(b, w, "handoff"))
        logging.info("Handoff aberto em %s pela regra '%s'", conversation_id, regra.get("rotulo"))
        return {"acao": "handoff", "regra": regra.get("rotulo")}

    # ---- 4. Roteamento por estágio ------------------------------------------
    agente = estado.get("agent")
    if not agente:
        # Estágio sem agente residente (agendado, perdido, encerrado). O lead
        # voltou sozinho: reabre o fluxo em vez de ignorar.
        conv.advance(conversation_id, "qualificando", trigger="inbound",
                     motivo="Lead retomou a conversa")
        agente = "sdr"

    contexto = conv.carregar_contexto(clinic_id)
    historico = conv.carregar_historico(conversation_id)

    resposta = await _executar_agente(agente, {
        "clinic_id": clinic_id,
        "conversation_id": conversation_id,
        "estado": estado,
        "contexto": contexto,
        "historico": historico,
        "mensagem": texto,
        "apresentada": bool(estado.get("apresentada")),
        "nome": evento.get("contact_name"),
    })

    if resposta is None:
        return {"acao": "sem_resposta", "agente": agente}

    # ---- 5. Efeitos ---------------------------------------------------------
    # O modelo pediu escalonamento (assunto fora do que o briefing autoriza).
    if resposta.escalar:
        conv.open_handoff(conversation_id, motivo=resposta.motivo or "Escalonamento pedido pelo agente",
                          severidade=resposta.severidade, trigger="ia")

    if resposta.campos:
        conv.atualizar_conversa(conversation_id, resposta.campos)

    if resposta.proximo_estagio:
        conv.advance(conversation_id, resposta.proximo_estagio, trigger="ia", motivo=resposta.motivo)

    if not resposta.texto.strip():
        return {"acao": "sem_texto", "agente": agente}

    await enviar(phone_number_id, to, resposta.texto,
                 on_sent=lambda b, w: _registrar(b, w, agente))

    # A apresentação é decidida pelo código, não pelo modelo: ele só vê as
    # últimas mensagens e não tem como saber se já se apresentou a este número.
    if not estado.get("apresentada"):
        conv.atualizar_conversa(conversation_id, {"apresentada": True})

    # A bola está com o lead. Se ele sumir, o relógio do reengajamento já está
    # correndo — e para quando ele responder.
    if resposta.proximo_estagio not in ("perdido", "encerrado", "agendado"):
        conv.agendar_follow_up(conversation_id)

    return {
        "acao": "respondida",
        "agente": agente,
        "conversation_id": conversation_id,
        "novo_estagio": resposta.proximo_estagio,
    }


async def _executar_agente(agente: str, ctx: dict[str, Any]):
    """Despacha para o módulo do agente. Import tardio evita ciclo."""
    if agente == "sdr":
        from . import sdr
        return await sdr.responder(ctx)
    if agente == "agendador":
        from . import agendador
        return await agendador.responder(ctx)
    if agente == "handoff":
        # Não deveria chegar aqui: a trava do passo 2 já teria calado a IA.
        logging.warning("Roteador alcançou agente 'handoff' — trava não pegou?")
        return None

    logging.warning("Agente desconhecido: %s", agente)
    return None
