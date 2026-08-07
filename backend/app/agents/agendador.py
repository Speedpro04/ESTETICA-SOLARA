"""Agente 2 — Agendador: propõe horário e confirma.

Recebe o lead já qualificado pelo SDR. Não requalifica: repetir pergunta que a
pessoa já respondeu é o jeito mais rápido de fazer parecer que ninguém prestou
atenção.

A regra dura deste agente: ele só oferece horário que existe. As vagas vêm
calculadas do banco (services/agenda.py) e entram no prompt como lista fechada.
Modelo inventando horário gera paciente na porta sem agendamento — o erro mais
caro que essa automação pode cometer.
"""
from typing import Any

from ..services import agenda, llm
from .base import (
    APRESENTACAO_CONTINUA,
    APRESENTACAO_PRIMEIRA,
    IDENTIDADE,
    Resposta,
    montar_contexto,
    montar_tom,
)

MISSAO = """# SUA MISSÃO AGORA (agente de Agendamento)
A pessoa já foi qualificada. Seu objetivo é fechar o horário.

Regras inquebráveis:
- Ofereça SOMENTE horários da lista "VAGAS DISPONÍVEIS" abaixo. Nunca invente data ou hora, nunca diga "temos vários horários" sem citar os reais, nunca prometa horário que não está na lista.
- Ofereça no máximo 2 ou 3 opções por mensagem. Lista longa trava a decisão.
- Quando a pessoa escolher, chame `reservar_horario` com o campo `inicio` EXATAMENTE como aparece na lista.
- Depois de reservar, confirme com a data e a hora por extenso e diga que a equipe confirma em seguida por aqui. NUNCA afirme que está garantido antes de a ferramenta responder ok.
- Se nenhum horário servir, pergunte qual dia e período seriam melhores e chame `sem_horario_bom`. Não fique oferecendo a mesma lista de novo.
- Não repita perguntas que a pessoa já respondeu na conversa."""

SEM_VAGAS = """# VAGAS DISPONÍVEIS
Não há vagas calculadas no momento.
Não invente horário. Diga com transparência que vai confirmar a agenda com a equipe e que retorna por aqui em seguida."""

FERRAMENTA_RESERVAR = {
    "type": "function",
    "function": {
        "name": "reservar_horario",
        "description": "Reserva o horário escolhido pela pessoa. Só chame depois que ela confirmar.",
        "parameters": {
            "type": "object",
            "properties": {
                "inicio": {
                    "type": "string",
                    "description": "O campo 'inicio' EXATO da vaga escolhida, copiado da lista.",
                },
                "observacao": {"type": "string", "description": "Algo relevante que ela pediu."},
            },
            "required": ["inicio"],
        },
    },
}

FERRAMENTA_SEM_HORARIO = {
    "type": "function",
    "function": {
        "name": "sem_horario_bom",
        "description": "Nenhuma vaga ofertada serviu. Registra a preferência dela.",
        "parameters": {
            "type": "object",
            "properties": {
                "preferencia": {
                    "type": "string",
                    "description": "Dia e período que serviriam, nas palavras dela.",
                },
            },
        },
    },
}


def _bloco_vagas(vagas: list[dict]) -> str:
    if not vagas:
        return SEM_VAGAS
    linhas = ["# VAGAS DISPONÍVEIS", "(Só estas existem. Copie o campo 'inicio' ao reservar.)"]
    for v in vagas:
        linhas.append(f"- {v['rotulo']}  |  inicio={v['inicio']}")
    return "\n".join(linhas)


async def responder(ctx: dict[str, Any]) -> Resposta | None:
    contexto = ctx.get("contexto") or {}
    briefing = contexto.get("briefing") or {}
    clinica = contexto.get("clinica") or {}
    clinic_id = ctx["clinic_id"]
    conversation_id = ctx["conversation_id"]
    apresentar = not ctx.get("apresentada")

    vagas = agenda.vagas_disponiveis(clinic_id, briefing, clinica.get("timezone"))
    validos = {v["inicio"] for v in vagas}
    resultado_reserva: dict[str, Any] = {}

    def executar(nome: str, args: dict) -> dict:
        if nome == "sem_horario_bom":
            resultado_reserva["preferencia"] = args.get("preferencia")
            return {"ok": True}

        if nome != "reservar_horario":
            return {"ok": False, "error": "Ferramenta desconhecida."}

        inicio = args.get("inicio")
        # Trava contra horário inventado: só passa o que saiu da lista real.
        if inicio not in validos:
            return {
                "ok": False,
                "error": "Esse horário não está na lista de vagas. Ofereça um dos horários listados.",
            }

        saida = agenda.reservar(
            clinic_id=clinic_id,
            conversation_id=conversation_id,
            inicio_iso=inicio,
            duracao_minutos=int(briefing.get("duracao_avaliacao_minutos") or 30),
            procedure_id=(ctx.get("estado") or {}).get("procedure_id"),
            observacao=args.get("observacao"),
        )
        resultado_reserva.update(saida)
        return saida

    blocos = [
        IDENTIDADE,
        montar_contexto(contexto),
        montar_tom(contexto),
        _bloco_vagas(vagas),
        MISSAO,
        APRESENTACAO_PRIMEIRA if apresentar else APRESENTACAO_CONTINUA,
    ]
    if briefing.get("politica_cancelamento"):
        blocos.append(f"# CANCELAMENTO\n{briefing['politica_cancelamento']}")

    texto, chamadas = await llm.conversar(
        system="\n\n".join(b for b in blocos if b and b.strip()),
        mensagem=ctx["mensagem"],
        historico=ctx.get("historico"),
        ferramentas=[FERRAMENTA_RESERVAR, FERRAMENTA_SEM_HORARIO],
        executar_ferramenta=executar,
        apresentar=apresentar,
    )

    resposta = Resposta(texto=texto)

    if resultado_reserva.get("ok"):
        resposta.proximo_estagio = "agendado"
        resposta.motivo = "Horário confirmado com o lead"
    elif resultado_reserva.get("preferencia"):
        # Volta a nutrir em vez de ficar preso na etapa de agenda.
        resposta.proximo_estagio = "qualificado"
        resposta.motivo = f"Nenhum horário serviu: {resultado_reserva['preferencia']}"

    return resposta
