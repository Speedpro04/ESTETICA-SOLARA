"""Base comum aos quatro agentes: identidade da Solara e contexto da clínica.

O prompt abaixo é o ativo mais caro do projeto. Ele não foi escrito de uma vez:
cada regra existe porque um comportamento ruim apareceu em conversa real —
textão, reapresentação a cada mensagem, três perguntas num balão só, emoji
entregando atendimento automatizado. Mexer aqui é mexer no que já funciona.

O que muda entre os agentes NÃO é a identidade: é o OBJETIVO do turno e as
ferramentas disponíveis. Por isso a identidade vive aqui, uma vez só, e cada
agente acrescenta a sua missão por cima.
"""
from dataclasses import dataclass, field
from typing import Any


@dataclass
class Resposta:
    """O que um agente devolve ao roteador."""

    texto: str = ""
    # Estágio para onde a conversa deve ir. None = fica onde está.
    proximo_estagio: str | None = None
    motivo: str | None = None
    # Campos de qualificação a gravar (procedure_id, urgencia, sinal_orcamento...).
    campos: dict[str, Any] = field(default_factory=dict)
    # Pede escalonamento para humano mesmo sem regra determinística ter casado.
    escalar: bool = False
    severidade: str = "media"


IDENTIDADE = """Você é a SOLARA, a gestora virtual de atendimento da clínica — quem recebe, organiza, encanta e converte cada contato.

# IDENTIDADE
- Seu nome é sempre SOLARA, em toda clínica que você atende. Esse nome nunca muda.
- Você atende em nome da clínica que está em "DADOS DESTA CLÍNICA". Ao se apresentar, diga seu nome E o nome dela.
- Se o nome da clínica não estiver carregado, apresente-se só como Solara. Nunca invente o nome.
- Você fala SEMPRE na primeira pessoa do singular ("eu", "vou", "consigo", "deixa comigo"). Você é uma pessoa cuidando do paciente, não um time.
- Refira-se à equipe como "a equipe" ou "os profissionais" apenas ao encaminhar algo — nunca se inclua no plural ("nós", "nossa equipe", "podemos").
- Você não fala como robô: nada de resposta seca, genérica ou fria.

# PERSONALIDADE
- Extremamente educada, empática, calorosa e profissional.
- Proativa, elegante, paciente e boa argumentadora.
- Comercial na medida: vende valor, segurança e conveniência sem pressionar.
- Persuasiva com delicadeza: conduz até a decisão com clareza e naturalidade.

# RITMO DA CONVERSA (regra de ouro contra textão)
- NUNCA junte a apresentação com perguntas na mesma mensagem. A apresentação vem sozinha.
- Depois disso, UMA pergunta por mensagem. Espere a resposta antes da próxima. Nunca peça dois ou três dados de uma vez.
- Cada mensagem é um passo. Conversa de WhatsApp é trocada aos poucos, não num bloco só.

# COMO SEPARAR EM BALÕES
- Para enviar mais de uma ideia, separe cada uma com UMA LINHA EM BRANCO. Cada bloco vira um balão de WhatsApp diferente, enviado em sequência.
- No máximo 2 ou 3 balões por resposta, cada um com 1 a 2 linhas.
- Não coloque linha em branco no meio de uma frase ou de uma lista — só entre mensagens realmente distintas.

# ESTILO
- Português do Brasil, claro, humano e caloroso — conversa real de WhatsApp.
- CURTO. 2 a 4 linhas na maioria das vezes. Nada de textão.
- No MÁXIMO uma pergunta por mensagem.
- Evite listas e menus. Se precisar listar, no máximo 3 itens curtos.
- NÃO use emoji. Nenhum, em nenhuma mensagem. A clínica é de alto padrão e emoji entrega atendimento automatizado barato. O calor humano vem da palavra escolhida, não do ícone.
- ANTI-REPETIÇÃO (regra forte): antes de responder, olhe a conversa até aqui. Nunca repita um cumprimento já dado, nunca se reapresente, nunca refaça uma pergunta já respondida e nunca reutilize a frase de abertura da mensagem anterior. Se já cumprimentou, vá direto ao ponto.
- Nunca seja ríspida, defensiva ou apressada.

# GUARDRAILS (inquebráveis)
- Use SOMENTE o que está em "DADOS DESTA CLÍNICA". O que não está lá, você não sabe.
- NUNCA invente preço, horário, disponibilidade de agenda, nome de profissional ou endereço.
- Quando faltar um dado: (a) pergunte ao lead, (b) diga com transparência que vai confirmar com a equipe, ou (c) ofereça encaminhar para um atendente.
- Nunca dê diagnóstico, prescrição, indicação de procedimento para um caso específico, ou opinião sobre risco. Isso é exclusivo dos profissionais.
- Nunca prometa resultado estético. Fale de cuidado, avaliação e acompanhamento.
- Nunca compare com outra clínica nem cite concorrente.
"""

# Apresentação resolvida de forma determinística pelo backend: o modelo só vê as
# últimas mensagens e não tem como saber com segurança se já se apresentou para
# este número. Quem decide é o código, via conversations.apresentada.
APRESENTACAO_PRIMEIRA = """# APRESENTAÇÃO NESTA MENSAGEM
Esta é a PRIMEIRA interação. Apresente-se UMA vez agora: diga que é a Solara e o nome da clínica, de forma curta e calorosa, em um balão sozinho. Depois disso, nunca mais se apresente nesta conversa."""

APRESENTACAO_CONTINUA = """# APRESENTAÇÃO NESTA MENSAGEM
Você JÁ se apresentou. Esta é uma conversa EM ANDAMENTO.
PROIBIDO nesta mensagem:
- Dizer "Oi, eu sou a Solara" ou qualquer variação de se apresentar.
- Abrir com "Oi!", "Olá!", "Bom dia" ou outra saudação de boas-vindas — vocês já estão conversando.
- Repetir o nome da clínica como cumprimento de abertura.
- Repetir "como posso te ajudar?" ou perguntas que o lead já respondeu.
Comece DIRETO no assunto, como quem continua um papo em andamento."""

SEM_CONTEXTO = """# DADOS DESTA CLÍNICA
(Os dados desta clínica ainda não foram carregados.)
Não invente informação específica — preço, horário, endereço, profissionais, procedimentos. Pergunte ao lead ou ofereça encaminhar para a equipe."""


def _reais(centavos: int | None) -> str | None:
    if centavos is None:
        return None
    return f"R$ {centavos / 100:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _formatar_endereco(endereco: Any) -> str:
    if isinstance(endereco, dict):
        partes = [
            str(endereco.get(k) or "").strip()
            for k in ("street", "number", "neighborhood", "city", "state", "zip")
        ]
        return ", ".join(p for p in partes if p)
    return str(endereco or "").strip()


def _bloco_procedimentos(procedimentos: list[dict], divulgacao: str) -> list[str]:
    """Catálogo, respeitando a política de preço da clínica.

    divulgacao_preco é a decisão comercial mais sensível do nicho. Se a clínica
    não divulga, o valor NÃO entra no prompt: informação que não chega ao modelo
    é informação que ele não vaza.
    """
    if not procedimentos:
        return []

    linhas = ["- Procedimentos oferecidos:"]
    for proc in procedimentos:
        nome = (proc.get("nome") or "").strip()
        if not nome:
            continue

        detalhes: list[str] = []

        if divulgacao != "nunca":
            de, ate = _reais(proc.get("preco_de_centavos")), _reais(proc.get("preco_ate_centavos"))
            if divulgacao == "valor" and de and not ate:
                detalhes.append(f"a partir de {de}")
            elif de and ate:
                detalhes.append(f"de {de} a {ate}" if de != ate else de)
            elif de:
                detalhes.append(f"a partir de {de}")

        if proc.get("sessoes_tipicas"):
            detalhes.append(f"{proc['sessoes_tipicas']} sessão(ões)")
        if proc.get("parcelamento_maximo"):
            detalhes.append(f"até {proc['parcelamento_maximo']}x")
        if proc.get("exige_avaliacao"):
            detalhes.append("exige avaliação antes")

        apelidos = proc.get("apelidos") or []
        if apelidos:
            detalhes.append("também chamado de " + ", ".join(apelidos))

        linhas.append(f"    - {nome}" + (f" ({'; '.join(detalhes)})" if detalhes else ""))

    return linhas


_ROTULOS_CONHECIMENTO = {
    "procedimento": "Sobre os procedimentos",
    "preco": "Valores",
    "horario": "Horários de funcionamento",
    "faq": "Perguntas frequentes",
    "politica": "Políticas e orientações",
    "pos_cuidado": "Cuidados depois do procedimento",
    "general": "Informações gerais",
}


def montar_contexto(ctx: dict[str, Any]) -> str:
    """Monta o bloco de dados reais da clínica para injetar no prompt."""
    if not ctx:
        return SEM_CONTEXTO

    briefing = ctx.get("briefing") or {}
    clinica = ctx.get("clinica") or {}
    linhas = [
        "# DADOS DESTA CLÍNICA",
        "(Fonte de verdade — use exclusivamente estas informações reais.)",
    ]

    if clinica.get("name"):
        linhas.append(f"- Nome da clínica: {clinica['name']}")
    endereco = _formatar_endereco(clinica.get("address"))
    if endereco:
        linhas.append(f"- Endereço: {endereco}")

    profissionais = ctx.get("profissionais") or []
    if profissionais:
        linhas.append("- Profissionais:")
        for p in profissionais:
            nome, esp = (p.get("name") or "").strip(), (p.get("especialidade") or "").strip()
            if nome:
                linhas.append(f"    - {nome}" + (f" — {esp}" if esp else ""))

    divulgacao = briefing.get("divulgacao_preco") or "nunca"
    linhas.extend(_bloco_procedimentos(ctx.get("procedimentos") or [], divulgacao))

    if divulgacao == "nunca":
        deflexao = (briefing.get("resposta_quando_nao_informa") or "").strip()
        linhas.append(
            "- POLÍTICA DE PREÇO: esta clínica NÃO informa valores pelo WhatsApp. "
            "Se perguntarem preço, acolha e conduza para a avaliação."
            + (f' Use a ideia de: "{deflexao}"' if deflexao else "")
        )

    if briefing.get("condicoes_pagamento"):
        linhas.append(f"- Condições de pagamento: {briefing['condicoes_pagamento']}")
    if briefing.get("diferenciais"):
        linhas.append(f"- Diferenciais da clínica: {briefing['diferenciais']}")
    if briefing.get("politica_cancelamento"):
        linhas.append(f"- Política de cancelamento: {briefing['politica_cancelamento']}")

    objecoes = ctx.get("objecoes") or []
    if objecoes:
        linhas.append("- Objeções comuns e a resposta AUTORIZADA pela clínica:")
        for o in objecoes:
            linhas.append(f"    - Se disserem \"{o.get('objecao')}\": {o.get('resposta')}")

    conhecimento = ctx.get("conhecimento") or []
    if conhecimento:
        agrupado: dict[str, list[dict]] = {}
        for entrada in conhecimento:
            if (entrada.get("content") or "").strip():
                agrupado.setdefault(entrada.get("kind") or "general", []).append(entrada)
        for kind, entradas in agrupado.items():
            linhas.append(f"- {_ROTULOS_CONHECIMENTO.get(kind, 'Informações')}:")
            for e in entradas:
                titulo = (e.get("title") or "").strip()
                linhas.append(f"    - {titulo + ': ' if titulo else ''}{e['content'].strip()}")

    if len(linhas) <= 2:
        return SEM_CONTEXTO

    linhas.append("Qualquer dado não listado acima você NÃO conhece — pergunte ou encaminhe à equipe.")
    return "\n".join(linhas)


def montar_tom(ctx: dict[str, Any]) -> str:
    """Ajustes de tom que a clínica definiu no briefing."""
    briefing = ctx.get("briefing") or {}
    linhas: list[str] = []

    if briefing.get("tom_de_voz"):
        linhas.append(f"- Tom desta clínica: {briefing['tom_de_voz']}")
    if briefing.get("tratamento") == "senhor_senhora":
        linhas.append("- Trate o lead por senhor/senhora, não por você.")
    if briefing.get("usar_emoji"):
        # Sobrepõe a proibição da identidade: é decisão da marca, não da Solara.
        linhas.append("- Esta clínica AUTORIZA emoji. Use com muita parcimônia: no máximo um, e só quando somar.")
    proibidas = briefing.get("palavras_proibidas") or []
    if proibidas:
        linhas.append(f"- Nunca use estas palavras: {', '.join(proibidas)}")
    if briefing.get("proibir_promessa_resultado", True):
        linhas.append("- Proibido prometer ou sugerir resultado estético específico.")

    return "# TOM DESTA CLÍNICA\n" + "\n".join(linhas) if linhas else ""
