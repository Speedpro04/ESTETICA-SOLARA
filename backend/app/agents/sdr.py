"""Agente 1 — SDR: qualifica, aquece e contorna objeção.

O que separa este agente de um atendente que "não erra": ele sabe PARA QUEM a
clínica é boa, o que ela faz melhor, por que custa o que custa, e quando parar de
insistir. Tudo isso vem do briefing — e é por isso que briefing pela metade gera
vendedor genérico.

Ele NÃO agenda. Quando o lead está pronto, passa a bola para o Agendador. A
divisão importa: um agente tentando qualificar e consultar agenda ao mesmo tempo
faz as duas coisas mal, e o lead sente a hesitação.
"""
import logging
from typing import Any

from ..services import llm
from .base import (
    APRESENTACAO_CONTINUA,
    APRESENTACAO_PRIMEIRA,
    IDENTIDADE,
    Resposta,
    montar_contexto,
    montar_tom,
)

MISSAO = """# SUA MISSÃO AGORA (agente SDR)
Você está na etapa de QUALIFICAÇÃO. Seu objetivo é entender o que a pessoa quer e levá-la ao próximo passo — no menor número de mensagens possível.

Você NÃO agenda horário nesta etapa. Quando a pessoa demonstrar que quer marcar, chame `qualificar_lead` com pronto_para_agendar=true e diga que já vai ver os horários. Quem propõe horário é a etapa seguinte.

Ordem da conversa (uma pergunta por mensagem, sempre):
1. Entenda o QUE a pessoa quer. Se ela já disse, NÃO pergunte de novo.
2. Reconheça o que ela sente antes de orientar — quem procura estética costuma estar insegura, não curiosa. Uma frase basta.
3. Se houver objeção, use a resposta autorizada da clínica. Não improvise argumento comercial.
4. Proponha o próximo passo.

Registre o que descobrir com `qualificar_lead` assim que souber — não espere o fim da conversa."""

# O limite de perguntas é a regra mais contraintuitiva do agente, e a que mais
# muda o resultado. Todo manual de vendas manda qualificar mais; aqui, cada
# pergunta a mais é uma chance a mais de a pessoa sumir antes de ver um horário.
# Quem tem dinheiro e não tem tempo abandona um questionário no terceiro item.
VELOCIDADE = """# VELOCIDADE (regra dura desta clínica)
Você tem no máximo {maximo} pergunta(s) de qualificação ANTES de propor o próximo passo. Depois disso, proponha — mesmo que ainda falte informação.

O que faltar, a equipe descobre na avaliação. Segurar a pessoa no WhatsApp para completar um formulário é o oposto do serviço: ela veio resolver, não preencher cadastro.

Se ela já disse o que quer logo na primeira mensagem, NÃO faça pergunta nenhuma. Vá direto ao próximo passo."""

POSICIONAMENTO_ALTO_PADRAO = """# PADRÃO DE ATENDIMENTO
Esta clínica atende público de alto padrão. Para essa pessoa, o que se vende é TEMPO: não esperar, não repetir, não voltar amanhã para saber um horário.

Consequências práticas:
- Seja breve. Mensagem curta lida como respeito; textão lida como enrolação.
- Nunca peça um dado que já está na conversa.
- Nunca pressione. Pressão aqui soa como desespero e derruba o valor percebido.
- Não fale de preço baixo, promoção agressiva nem urgência artificial. Isso desqualifica a clínica na cabeça dela.
- Praticidade é argumento melhor que desconto: horário que cabe na agenda dela, estacionamento, tempo de procedimento."""

POSICIONAMENTO_VOLUME = """# PADRÃO DE ATENDIMENTO
Esta clínica trabalha com volume e acessibilidade. Condição de pagamento e parcelamento são argumentos legítimos e podem aparecer cedo na conversa, junto com a facilidade de agendar."""

FERRAMENTA_QUALIFICAR = {
    "type": "function",
    "function": {
        "name": "qualificar_lead",
        "description": (
            "Registra o que você descobriu sobre este lead. Chame assim que tiver "
            "qualquer uma das informações, mesmo que ainda faltem outras."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "procedimento": {
                    "type": "string",
                    "description": "Procedimento de interesse, como a pessoa falou.",
                },
                "urgencia": {
                    "type": "string",
                    "enum": ["imediata", "ate_30_dias", "sem_pressa"],
                    "description": "Quando ela pretende fazer.",
                },
                "sinal_orcamento": {
                    "type": "string",
                    "description": "O que ela sinalizou sobre investimento, nas palavras dela.",
                },
                "pronto_para_agendar": {
                    "type": "boolean",
                    "description": (
                        "true SOMENTE quando a pessoa demonstrou querer marcar. "
                        "Interesse no procedimento não basta."
                    ),
                },
                "sem_perfil": {
                    "type": "boolean",
                    "description": "true se ficou claro que não é cliente desta clínica.",
                },
                "motivo_sem_perfil": {"type": "string"},
            },
        },
    },
}

FERRAMENTA_ESCALAR = {
    "type": "function",
    "function": {
        "name": "escalar_para_humano",
        "description": (
            "Use quando o assunto sair do que o briefing autoriza você a responder, "
            "quando a pessoa insistir em falar com alguém, ou quando você não tiver "
            "como responder com segurança. Melhor escalar do que arriscar."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "motivo": {"type": "string", "description": "Por que precisa de um humano."},
            },
            "required": ["motivo"],
        },
    },
}


def _bloco_vendas(briefing: dict[str, Any]) -> str:
    """Traduz o briefing de vendas em instrução acionável.

    Campo vazio não vira linha nenhuma: encher o prompt de rótulo sem conteúdo só
    dilui o que importa e faz o modelo inventar para preencher a lacuna.
    """
    linhas: list[str] = []

    def add(rotulo: str, valor: Any) -> None:
        if valor and str(valor).strip():
            linhas.append(f"- {rotulo}: {str(valor).strip()}")

    add("Cliente ideal desta clínica", briefing.get("cliente_ideal"))
    add("Faixa etária predominante", briefing.get("faixa_etaria_principal"))
    add("O que costuma trazer essas pessoas", briefing.get("motivacoes_comuns"))
    add("NÃO é cliente desta clínica", briefing.get("perfil_desqualificado"))
    add("Diferenciais concretos (use estes, não adjetivos genéricos)",
        briefing.get("diferenciais_concretos"))
    add("Prova social (pode citar)", briefing.get("prova_social"))
    add("Garantias e cuidado pós-procedimento", briefing.get("garantias"))
    add("Como justificar o preço, se questionarem", briefing.get("justificativa_de_preco"))
    add("Urgência REAL (só use se for verdade)", briefing.get("gatilhos_de_urgencia"))
    add("Oferta vigente", briefing.get("oferta_vigente"))
    add("Se a pessoa travar, ofereça", briefing.get("oferta_de_destrave"))
    add("Se citarem outra clínica, responda assim", briefing.get("resposta_a_concorrente"))
    add("Assuntos que você PODE responder", briefing.get("assuntos_autorizados"))
    add("O que conta como lead qualificado aqui", briefing.get("criterio_qualificado"))

    postura = briefing.get("postura_comercial") or "consultivo"
    if postura == "consultivo":
        linhas.append(
            "- Postura: CONSULTIVA. Pergunte, escute e conduza. Nunca pressione — "
            "pressão em estética soa como desespero e derruba o valor percebido."
        )
    elif postura == "direto":
        linhas.append("- Postura: DIRETA. Proponha o próximo passo cedo, sem rodeio, mas sem pressionar.")
    else:
        linhas.append("- Postura: EQUILIBRADA. Qualifique com calma e proponha o próximo passo quando fizer sentido.")

    tentativas = briefing.get("tentativas_antes_de_recuar", 2)
    linhas.append(
        f"- Se ela disser que vai pensar, insista no máximo {tentativas} vez(es), com leveza. "
        "Depois disso, acolha, deixe a porta aberta e PARE. Insistir além disso irrita e perde o lead de vez."
    )

    if briefing.get("pode_oferecer_desconto"):
        limite = briefing.get("desconto_maximo_percentual")
        linhas.append(
            "- Você pode mencionar condição especial"
            + (f" de até {limite}%." if limite else ".")
            + " Só depois de ter apresentado valor, nunca como primeira resposta a preço."
        )
    else:
        linhas.append("- Você NÃO pode oferecer desconto. Se insistirem em desconto, conduza para a avaliação.")

    # Corta a lista no teto de velocidade: cadastrar oito perguntas não pode
    # significar oito trocas de mensagem antes de a pessoa ver um horário.
    maximo = int(briefing.get("max_perguntas_antes_de_agendar") or 2)
    perguntas = (briefing.get("perguntas_qualificacao") or [])[:maximo]
    if perguntas:
        linhas.append(
            f"- As {len(perguntas)} pergunta(s) que esta clínica quer, nesta ordem, uma por mensagem:"
        )
        for i, p in enumerate(perguntas, 1):
            if isinstance(p, dict) and p.get("pergunta"):
                porque = f" (serve para: {p['porque']})" if p.get("porque") else ""
                linhas.append(f"    {i}. {p['pergunta']}{porque}")

    acao = briefing.get("proxima_acao_desejada") or "avaliacao_presencial"
    rotulo_acao = {
        "avaliacao_presencial": "levar a pessoa a marcar uma AVALIAÇÃO PRESENCIAL",
        "avaliacao_online": "levar a pessoa a marcar uma AVALIAÇÃO ONLINE",
        "orcamento": "conseguir os dados para enviar um ORÇAMENTO",
        "visita_conhecer": "levar a pessoa a VISITAR a clínica",
    }[acao]
    linhas.append(f"- OBJETIVO FINAL desta conversa: {rotulo_acao}.")

    if not linhas:
        return ""
    return "# COMO VENDER NESTA CLÍNICA\n" + "\n".join(linhas)


async def responder(ctx: dict[str, Any]) -> Resposta | None:
    contexto = ctx.get("contexto") or {}
    briefing = contexto.get("briefing") or {}
    apresentar = not ctx.get("apresentada")

    posicionamento = briefing.get("posicionamento") or "alto_padrao"
    maximo = int(briefing.get("max_perguntas_antes_de_agendar") or 2)

    blocos = [
        IDENTIDADE,
        montar_contexto(contexto),
        montar_tom(contexto),
        POSICIONAMENTO_ALTO_PADRAO if posicionamento == "alto_padrao" else POSICIONAMENTO_VOLUME,
        _bloco_vendas(briefing),
        MISSAO,
        VELOCIDADE.format(maximo=maximo),
        APRESENTACAO_PRIMEIRA if apresentar else APRESENTACAO_CONTINUA,
    ]
    if ctx.get("nome"):
        blocos.append(
            f"# NOME\nA pessoa se chama {ctx['nome']}. Use o primeiro nome com naturalidade, "
            "sem repetir em toda mensagem — isso soa robótico."
        )

    system = "\n\n".join(b for b in blocos if b and b.strip())

    texto, chamadas = await llm.conversar(
        system=system,
        mensagem=ctx["mensagem"],
        historico=ctx.get("historico"),
        ferramentas=[FERRAMENTA_QUALIFICAR, FERRAMENTA_ESCALAR],
        executar_ferramenta=lambda nome, args: {"ok": True},
        apresentar=apresentar,
    )

    return _montar_resposta(texto, chamadas, contexto)


def _montar_resposta(texto: str, chamadas: list[dict], contexto: dict) -> Resposta:
    resposta = Resposta(texto=texto)

    for chamada in chamadas:
        args = chamada.get("argumentos") or {}

        if chamada.get("nome") == "escalar_para_humano":
            resposta.escalar = True
            resposta.motivo = args.get("motivo") or "Pedido do agente SDR"
            resposta.severidade = "media"
            continue

        if chamada.get("nome") != "qualificar_lead":
            continue

        if args.get("urgencia") in ("imediata", "ate_30_dias", "sem_pressa"):
            resposta.campos["urgencia"] = args["urgencia"]
        if args.get("sinal_orcamento"):
            resposta.campos["sinal_orcamento"] = str(args["sinal_orcamento"])[:500]

        if args.get("procedimento"):
            procedimento_id = _casar_procedimento(args["procedimento"], contexto)
            if procedimento_id:
                resposta.campos["procedure_id"] = procedimento_id
            else:
                # Não bateu com o catálogo: guarda o que a pessoa falou. É matéria
                # -prima para a clínica descobrir procedimento que deveria ofertar.
                resposta.campos["procedimento_texto"] = str(args["procedimento"])[:200]

        if args.get("sem_perfil"):
            resposta.proximo_estagio = "perdido"
            resposta.motivo = args.get("motivo_sem_perfil") or "Fora do perfil da clínica"
            resposta.campos["motivo_perda"] = resposta.motivo
        elif args.get("pronto_para_agendar"):
            resposta.proximo_estagio = "qualificado"
            resposta.motivo = "Lead pronto para agendar"
        elif not resposta.proximo_estagio:
            # Qualquer dado coletado já tira do 'novo': o funil precisa refletir
            # que alguém está trabalhando este lead.
            resposta.proximo_estagio = "qualificando"
            resposta.motivo = "SDR coletando qualificação"

    return resposta


def _casar_procedimento(falado: str, contexto: dict) -> str | None:
    """Casa o que o lead falou contra o catálogo, por nome ou apelido.

    O apelido é o que faz isto funcionar: ninguém pede "toxina botulínica", pede
    botox.
    """
    alvo = (falado or "").strip().lower()
    if not alvo:
        return None

    for proc in contexto.get("procedimentos") or []:
        nome = (proc.get("nome") or "").lower()
        if nome and (nome in alvo or alvo in nome):
            return proc.get("id")
        for apelido in proc.get("apelidos") or []:
            apelido = (apelido or "").lower()
            if apelido and (apelido in alvo or alvo in apelido):
                return proc.get("id")

    logging.info("Procedimento '%s' não casou com o catálogo.", falado)
    return None
