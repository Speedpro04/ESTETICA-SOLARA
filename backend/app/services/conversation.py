"""Camada de conversa: estado, contexto da clínica e escalonamento.

Tudo que muda o estágio passa pelas funções do banco (advance_conversation_stage,
open_handoff, close_handoff). Não é preciosismo: o estágio decide qual agente
responde, e UPDATE solto espalhado pelo código é como a máquina de estados vira
ficção — um lugar esquece de gravar o histórico, outro pula etapa, e três meses
depois ninguém explica por que um lead nunca foi agendado.
"""
import logging
import re
import unicodedata
from typing import Any

from .supabase_service import supabase_client


# --- Entrada ------------------------------------------------------------------

def handle_inbound(evento: dict[str, Any]) -> dict[str, Any] | None:
    """Registra a mensagem recebida e devolve o estado da conversa.

    Uma chamada resolve tenant, conversa, idempotência, janela de 24h e reset do
    follow-up. Devolve None se a função do banco falhar — o chamador não deve
    responder no escuro.
    """
    try:
        result = supabase_client.rpc("handle_inbound_whatsapp", {
            "p_phone_number_id": evento["phone_number_id"],
            "p_wa_contact_id": evento["wa_contact_id"],
            "p_wa_message_id": evento.get("wa_message_id"),
            "p_content": evento.get("content") or "",
            "p_contact_name": evento.get("contact_name"),
            "p_sent_at": evento.get("sent_at"),
        }).execute()
        return result.data
    except Exception as exc:
        logging.exception("Falha ao registrar mensagem recebida: %s", exc)
        return None


# --- Transições ---------------------------------------------------------------

def advance(
    conversation_id: str,
    to_stage: str,
    trigger: str = "ia",
    motivo: str | None = None,
    actor_user_id: str | None = None,
    metadata: dict | None = None,
) -> dict | None:
    """Move o estágio. Levanta no banco se a transição não estiver no grafo."""
    try:
        result = supabase_client.rpc("advance_conversation_stage", {
            "p_conversation_id": conversation_id,
            "p_to_stage": to_stage,
            "p_trigger": trigger,
            "p_motivo": motivo,
            "p_actor_user_id": actor_user_id,
            "p_metadata": metadata or {},
        }).execute()
        return result.data
    except Exception as exc:
        # Transição inválida é bug de lógica do agente, não do lead. Loga e
        # segue: a conversa continua no estágio atual, que é o comportamento
        # menos danoso.
        logging.warning("Transição %s -> %s recusada: %s", conversation_id, to_stage, exc)
        return None


def open_handoff(
    conversation_id: str,
    motivo: str,
    severidade: str = "alta",
    rule_id: str | None = None,
    trigger: str = "regra",
) -> dict | None:
    """Passa a conversa para um humano e enfileira o alerta para a equipe."""
    try:
        result = supabase_client.rpc("open_handoff", {
            "p_conversation_id": conversation_id,
            "p_motivo": motivo,
            "p_severidade": severidade,
            "p_rule_id": rule_id,
            "p_trigger": trigger,
        }).execute()
        return result.data
    except Exception as exc:
        logging.exception("Falha ao abrir handoff de %s: %s", conversation_id, exc)
        return None


def close_handoff(
    conversation_id: str,
    actor_user_id: str | None = None,
    to_stage: str | None = None,
    motivo: str = "Atendimento humano concluído",
) -> dict | None:
    """Devolve a conversa à IA, no estágio de onde ela saiu."""
    try:
        result = supabase_client.rpc("close_handoff", {
            "p_conversation_id": conversation_id,
            "p_actor_user_id": actor_user_id,
            "p_to_stage": to_stage,
            "p_motivo": motivo,
        }).execute()
        return result.data
    except Exception as exc:
        logging.exception("Falha ao fechar handoff de %s: %s", conversation_id, exc)
        return None


# --- Escalonamento determinístico ---------------------------------------------

_SEVERIDADE_PESO = {"baixa": 1, "media": 2, "alta": 3, "critica": 4}


def _normalizar(texto: str) -> str:
    """Minúsculas, sem acento e sem pontuação, para o match não depender de grafia.

    "É perigoso?" e "e perigoso" precisam casar com a mesma regra: quem está com
    medo de uma complicação não escreve com acento.
    """
    texto = unicodedata.normalize("NFD", (texto or "").lower())
    texto = "".join(c for c in texto if unicodedata.category(c) != "Mn")
    return re.sub(r"[^\w\s]", " ", texto)


def carregar_regras_escalonamento(clinic_id: str) -> list[dict]:
    """Regras da clínica + as globais da Axos (clinic_id nulo)."""
    try:
        result = (
            supabase_client.table("escalation_rules")
            .select("id, rotulo, tipo, palavras, padrao, severidade, mensagem_de_espera, clinic_id")
            .or_(f"clinic_id.is.null,clinic_id.eq.{clinic_id}")
            .eq("ativo", True)
            .execute()
        )
        return result.data or []
    except Exception as exc:
        logging.warning("Falha ao carregar regras de escalonamento: %s", exc)
        return []


def checar_escalonamento(clinic_id: str, texto: str) -> dict | None:
    """Casa a mensagem contra as regras determinísticas ANTES de chamar o modelo.

    Esta camada existe porque risco clínico não pode depender do julgamento do
    LLM naquele turno: se a pessoa perguntou de contraindicação, reação adversa
    ou complicação, quem responde é a equipe — sempre, não quase sempre.

    Devolve a regra de MAIOR severidade que casou, ou None.
    """
    alvo = _normalizar(texto)
    if not alvo.strip():
        return None

    candidatas: list[dict] = []
    for regra in carregar_regras_escalonamento(clinic_id):
        if regra.get("tipo") == "sempre":
            candidatas.append(regra)
            continue
        if regra.get("tipo") != "palavra_chave":
            continue  # 'topico' é avaliado pelo modelo, não aqui
        for palavra in regra.get("palavras") or []:
            if _normalizar(palavra) in alvo:
                candidatas.append(regra)
                break

    if not candidatas:
        return None

    return max(candidatas, key=lambda r: _SEVERIDADE_PESO.get(r.get("severidade"), 0))


# --- Contexto da clínica ------------------------------------------------------

def carregar_contexto(clinic_id: str) -> dict[str, Any]:
    """Tudo que os agentes precisam saber sobre a clínica, numa estrutura só.

    É o que impede a Solara de inventar preço, horário ou procedimento: o que
    não está aqui, ela não conhece.
    """
    contexto: dict[str, Any] = {"clinic_id": clinic_id}

    def _buscar(tabela: str, colunas: str, **filtros):
        try:
            query = supabase_client.table(tabela).select(colunas).eq("clinic_id", clinic_id)
            for coluna, valor in filtros.items():
                query = query.eq(coluna, valor)
            return (query.execute().data) or []
        except Exception as exc:
            logging.warning("Falha ao carregar %s da clínica %s: %s", tabela, clinic_id, exc)
            return []

    clinica = _buscar_clinica(clinic_id)
    if clinica:
        contexto["clinica"] = clinica

    briefing = _buscar("clinic_briefing", "*")
    contexto["briefing"] = briefing[0] if briefing else {}

    contexto["procedimentos"] = _buscar(
        "procedures",
        "id, nome, apelidos, categoria, descricao, preco_de_centavos, preco_ate_centavos,"
        " duracao_minutos, sessoes_tipicas, parcelamento_maximo, exige_avaliacao,"
        " preparo, recuperacao, escalar_se_perguntarem_risco",
        ativo=True,
    )
    contexto["objecoes"] = _buscar("briefing_objections", "objecao, resposta, categoria", ativo=True)
    contexto["topicos_proibidos"] = _topicos_proibidos(clinic_id)
    contexto["conhecimento"] = _buscar("clinic_knowledge", "kind, title, content", active=True)
    contexto["profissionais"] = _buscar_profissionais(clinic_id)

    return contexto


def _topicos_proibidos(clinic_id: str) -> list[dict]:
    """Regras de escalonamento do tipo 'topico' — as que o MODELO avalia.

    A camada de palavra-chave pega o óbvio e falha na paráfrase: "minha amiga
    fez e ficou com o rosto estranho, pode acontecer comigo?" não casa com
    "contraindicação" nem com "efeito colateral", mas é pergunta de risco.

    Estas regras existem para isso e ficavam mortas no banco — carregadas e
    ignoradas — porque ninguém as entregava ao modelo. É aqui que elas saem.
    """
    try:
        result = (
            supabase_client.table("escalation_rules")
            .select("rotulo, padrao, severidade")
            .or_(f"clinic_id.is.null,clinic_id.eq.{clinic_id}")
            .eq("tipo", "topico")
            .eq("ativo", True)
            .execute()
        )
        return result.data or []
    except Exception as exc:
        logging.warning("Falha ao carregar tópicos proibidos de %s: %s", clinic_id, exc)
        return []


def _buscar_clinica(clinic_id: str) -> dict | None:
    try:
        result = (
            supabase_client.table("clinics")
            .select("id, name, phone, email, address, timezone")
            .eq("id", clinic_id).limit(1).execute()
        )
        return result.data[0] if result.data else None
    except Exception as exc:
        logging.warning("Falha ao carregar clínica %s: %s", clinic_id, exc)
        return None


def _buscar_profissionais(clinic_id: str) -> list[dict]:
    try:
        result = (
            supabase_client.table("users")
            .select("id, name, especialidade, conselho, registro")
            .eq("clinic_id", clinic_id)
            .eq("role", "profissional")
            .eq("active", True)
            .execute()
        )
        return result.data or []
    except Exception as exc:
        logging.warning("Falha ao carregar profissionais de %s: %s", clinic_id, exc)
        return []


# --- Histórico e persistência -------------------------------------------------

def carregar_historico(conversation_id: str, limite: int = 12) -> list[dict[str, str]]:
    """Últimas mensagens em ordem cronológica, no formato que o modelo espera."""
    try:
        result = (
            supabase_client.table("messages")
            .select("content, direction, created_at")
            .eq("conversation_id", conversation_id)
            .order("created_at", desc=True)
            .limit(limite)
            .execute()
        )
    except Exception as exc:
        logging.warning("Falha ao carregar histórico de %s: %s", conversation_id, exc)
        return []

    linhas = list(reversed(result.data or []))
    return [
        {
            "role": "user" if linha.get("direction") == "inbound" else "assistant",
            "content": (linha.get("content") or "").strip(),
        }
        for linha in linhas
        if (linha.get("content") or "").strip()
    ]


def registrar_saida(
    clinic_id: str,
    conversation_id: str,
    content: str,
    agent: str | None = None,
    wa_message_id: str | None = None,
    template_name: str | None = None,
    categoria_cobranca: str | None = None,
    sender_type: str = "ia",
    tokens_entrada: int | None = None,
    tokens_saida: int | None = None,
    modelo: str | None = None,
    prompt_versao: str | None = None,
) -> None:
    """Espelha no banco exatamente o que o lead recebeu.

    Os tokens vão junto porque é aqui que se descobre o custo por clínica — o
    número que decide se o plano fixo fecha. O relatório da OpenAI agrupa por
    projeto e não sabe de qual clínica veio a conversa.

    A resposta é dividida em balões e cada um vira uma linha; o consumo é do
    turno inteiro, então só o PRIMEIRO balão carrega os tokens. Somar o mesmo
    consumo em cada balão multiplicaria o custo por três no relatório.
    """
    try:
        supabase_client.table("messages").insert({
            "clinic_id": clinic_id,
            "conversation_id": conversation_id,
            "content": content,
            "direction": "outbound",
            "sender_type": sender_type,
            "agent": agent,
            "status": "sent" if wa_message_id else "failed",
            "wa_message_id": wa_message_id,
            "template_name": template_name,
            "categoria_cobranca": categoria_cobranca,
            "tokens_entrada": tokens_entrada,
            "tokens_saida": tokens_saida,
            "modelo": modelo,
            "prompt_versao": prompt_versao,
        }).execute()
    except Exception as exc:
        logging.warning("Falha ao registrar mensagem enviada: %s", exc)


def agendar_follow_up(conversation_id: str) -> str | None:
    """Marca quando o lead deve ser reengajado, se sumir a partir de agora.

    Chamada depois de a IA responder. Se a pessoa voltar a escrever,
    handle_inbound_whatsapp zera a régua e cancela o disparo — é isso que impede
    o template de sair (e ser cobrado) depois de o lead já ter respondido.
    """
    try:
        result = supabase_client.rpc(
            "agendar_follow_up", {"p_conversation_id": conversation_id}
        ).execute()
        return result.data
    except Exception as exc:
        # Não é fatal: o lead recebeu a resposta, só não terá reengajamento
        # automático. Melhor perder o follow-up do que derrubar o atendimento.
        logging.warning("Falha ao agendar follow-up de %s: %s", conversation_id, exc)
        return None


def atualizar_conversa(conversation_id: str, campos: dict[str, Any]) -> None:
    """Atualiza campos que NÃO são estágio (qualificação, apresentação, agenda).

    Estágio nunca entra aqui: para isso existe advance(), que valida o grafo e
    grava o histórico.
    """
    campos.pop("stage", None)
    campos.pop("previous_stage", None)
    if not campos:
        return
    try:
        supabase_client.table("conversations").update(campos).eq("id", conversation_id).execute()
    except Exception as exc:
        logging.warning("Falha ao atualizar conversa %s: %s", conversation_id, exc)
