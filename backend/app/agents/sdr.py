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
from datetime import datetime, timezone
from typing import Any

from ..config import settings
from ..services import llm
from .base import (
    APRESENTACAO_CONTINUA,
    APRESENTACAO_PRIMEIRA,
    IDENTIDADE,
    Resposta,
    montar_contexto,
    montar_tom,
)

# Versão do prompt, carimbada em cada mensagem enviada. SUBA ao mudar qualquer
# bloco de texto deste arquivo — é o que permite comparar conversão antes e
# depois de um ajuste, em vez de decidir por impressão.
VERSAO = "sdr-v2"


# --- Os três modos -----------------------------------------------------------
# O mesmo agente com três comportamentos, porque tratar igual quem só perguntou
# o preço e quem já quer marcar erra com os dois: o primeiro foge da pressão, o
# segundo se irrita com a entrevista.
#
# A regra de "no máximo N perguntas" não é uniforme. Ela vira 0 no lead quente:
# ali toda pergunta é atrito puro sobre alguém que já decidiu.

MODO_QUENTE = """# LEITURA DESTE LEAD: QUENTE
Esta pessoa já demonstrou que quer marcar.

NÃO faça pergunta nenhuma de qualificação. Nenhuma. Ela já decidiu — o que falta é horário, e horário é a próxima etapa.

O que fazer AGORA, em uma ou duas frases curtas:
1. Confirme que entendeu o que ela quer.
2. Chame `qualificar_lead` com pronto_para_agendar=true.
3. Diga que já vai ver os horários.

Qualquer pergunta a mais aqui atrasa quem já estava pronta, e é assim que se perde uma venda feita."""

MODO_MORNO = """# LEITURA DESTE LEAD: MORNO
Esta pessoa tem interesse real, mas tem UMA coisa travando — um medo, uma dúvida ou uma objeção.

Seu trabalho é achar essa coisa e resolver ELA. Só ela.

1. Se ela já disse o que trava (preço, medo, tempo), responda usando a resposta autorizada da clínica. Não improvise argumento.
2. Se ainda não disse, faça UMA pergunta para descobrir. Uma só.
3. Resolvida a trava, proponha o próximo passo na mesma mensagem ou na seguinte.

Não volte a qualificar o que ela já respondeu. Não empilhe argumento: um bom, bem colocado, vale mais que três."""

MODO_FRIO = """# LEITURA DESTE LEAD: FRIO
Esta pessoa está pesquisando. Ainda não comprou a ideia — comprou a curiosidade.

Empurrar horário agora afasta. Perguntar orçamento e prazo agora afasta mais ainda: ela ainda não se vê fazendo isso.

Seu trabalho aqui é UM só: fazer ela perceber o que ganha resolvendo aquilo.

1. Acolha o que ela perguntou e responda de verdade — informação boa é o que compra o direito de continuar a conversa.
2. Faça UMA pergunta de implicação: em vez de "o que você quer fazer?", pergunte o que aquilo atrapalha no dia a dia dela. Use as perguntas autorizadas da clínica, se houver.
3. Ofereça o próximo passo como algo leve e sem compromisso, não como fechamento.

Se ela não responder à pergunta de implicação, não insista. Deixe a porta aberta e encerre com elegância — ela volta depois, e o sistema sabe reprocurá-la."""


PERSUASAO = """# COMO CONVENCER (sem parecer que está convencendo)
Público de alto padrão reconhece técnica de vendas na hora, e reconhecer é o mesmo que desqualificar. Então:

- **Prova social com número, nunca com adjetivo.** "12 anos e mais de 4 mil procedimentos" convence; "somos referência" não convence ninguém.
- **Autoridade pela formação, dita uma vez.** Repetir título soa inseguro.
- **Escassez só se for verdade.** Se a agenda realmente fecha com 3 semanas, diga. Urgência inventada é percebida e queima a clínica.
- **Compromisso em passo pequeno.** É mais fácil aceitar "uma conversa de 15 minutos com a médica" do que "uma avaliação". O passo pequeno abre o grande.
- **Valor antes de número, sempre.** Se falar preço antes de a pessoa entender o que está comprando, ela só tem o preço para comparar.
- Nunca use gatilho de escassez, urgência ou desconto com quem está no modo FRIO. Ali isso só confirma que é vendedor."""

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
                "temperatura": {
                    "type": "string",
                    "enum": ["frio", "morno", "quente"],
                    "description": (
                        "Sua leitura do quanto ela está perto de decidir. "
                        "frio = pesquisando; morno = interessada mas com algo travando; "
                        "quente = quer marcar. Corrija sempre que sua leitura mudar."
                    ),
                },
                "temperatura_motivo": {
                    "type": "string",
                    "description": "Em uma frase, o que na conversa te fez ler assim. A equipe lê isto.",
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


def _bloco_topicos_proibidos(topicos: list[dict]) -> str:
    """Assuntos que a clínica proibiu, avaliados pelo modelo.

    A camada determinística (palavra-chave) roda antes e pega o óbvio. Esta é a
    segunda rede: pega a paráfrase, que é onde a primeira falha. Por isso o texto
    manda escalar na dúvida — falso positivo custa um handoff desnecessário,
    falso negativo custa uma resposta de risco clínico dada por um robô.
    """
    if not topicos:
        return ""

    linhas = [
        "# NUNCA RESPONDA SOZINHA — ESCALE",
        "Se a mensagem tocar em qualquer um destes assuntos, mesmo que de forma indireta ou "
        "com outras palavras, chame `escalar_para_humano` IMEDIATAMENTE e não responda o mérito:",
    ]
    for t in topicos:
        descricao = (t.get("padrao") or t.get("rotulo") or "").strip()
        if descricao:
            linhas.append(f"- {descricao}")

    linhas.append(
        "NA DÚVIDA, ESCALE. Um encaminhamento a mais custa dois minutos da equipe; "
        "uma resposta errada sobre risco custa a paciente e a clínica."
    )
    return "\n".join(linhas)


def _bloco_implicacao(briefing: dict[str, Any]) -> str:
    """As perguntas de implicação — o "I" do SPIN, autorizadas pela clínica.

    Situação e Problema a Solara improvisa sem risco. Implicação, não: é onde se
    toca no que a pessoa sente, e improvisar ali em estética passa de consultivo
    a invasivo num passo. Por isso quem escreve é a clínica; a IA escolhe a hora.
    """
    perguntas = briefing.get("perguntas_implicacao") or []
    ganhos = (briefing.get("ganhos_declarados") or "").strip()
    if not perguntas and not ganhos:
        return ""

    linhas = ["# PERGUNTAS QUE FAZEM A PESSOA DECIDIR"]
    if perguntas:
        linhas.append(
            "Use UMA destas quando fizer sentido, com as suas palavras. Elas servem para a "
            "pessoa perceber sozinha o tamanho do incômodo — não para você apontar defeito nela:"
        )
        for p in perguntas:
            if isinstance(p, dict) and p.get("pergunta"):
                gatilho = f" (quando ela falar de: {p['gatilho']})" if p.get("gatilho") else ""
                linhas.append(f"- \"{p['pergunta']}\"{gatilho}")
        linhas.append(
            "Nunca faça duas seguidas, e nunca faça se a pessoa já demonstrou que quer marcar."
        )
    if ganhos:
        linhas.append(f"- O que as pacientes desta clínica costumam ganhar: {ganhos}")
    return "\n".join(linhas)


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

    # A temperatura vem do webhook (o que o SDR classificou antes, ou o que os
    # sinais dizem). Sem leitura, trata como frio: é o modo que menos estraga
    # quando o palpite está errado — no máximo a Solara foi cuidadosa demais.
    temperatura = (ctx.get("estado") or {}).get("temperatura") or "frio"
    modo = {"quente": MODO_QUENTE, "morno": MODO_MORNO}.get(temperatura, MODO_FRIO)

    blocos = [
        IDENTIDADE,
        montar_contexto(contexto),
        montar_tom(contexto),
        POSICIONAMENTO_ALTO_PADRAO if posicionamento == "alto_padrao" else POSICIONAMENTO_VOLUME,
        # Os proibidos vêm ANTES do material de vendas, de propósito: se houver
        # conflito entre vender e escalar, o modelo lê primeiro que deve escalar.
        _bloco_topicos_proibidos(contexto.get("topicos_proibidos") or []),
        _bloco_vendas(briefing),
        _bloco_implicacao(briefing),
        PERSUASAO,
        MISSAO,
        modo,
        # O teto de perguntas só vale para frio e morno. O quente já tem "zero
        # perguntas" no próprio modo, e repetir um número aqui confundiria.
        VELOCIDADE.format(maximo=maximo) if temperatura != "quente" else "",
        APRESENTACAO_PRIMEIRA if apresentar else APRESENTACAO_CONTINUA,
    ]
    if ctx.get("nome"):
        blocos.append(
            f"# NOME\nA pessoa se chama {ctx['nome']}. Use o primeiro nome com naturalidade, "
            "sem repetir em toda mensagem — isso soa robótico."
        )

    system = "\n\n".join(b for b in blocos if b and b.strip())

    resultado = await llm.conversar(
        system=system,
        mensagem=ctx["mensagem"],
        historico=ctx.get("historico"),
        ferramentas=[FERRAMENTA_QUALIFICAR, FERRAMENTA_ESCALAR],
        executar_ferramenta=lambda nome, args: {"ok": True},
        apresentar=apresentar,
        # O SDR é o único que recebe o modelo bom: é aqui que há conversa aberta,
        # medo e objeção. Os outros trabalham dentro de trilhos.
        modelo=settings.MODEL_SDR,
    )

    return _montar_resposta(resultado, contexto)


def _montar_resposta(resultado: llm.Resultado, contexto: dict) -> Resposta:
    resposta = Resposta(
        texto=resultado.texto,
        tokens_entrada=resultado.consumo.tokens_entrada,
        tokens_saida=resultado.consumo.tokens_saida,
        modelo=resultado.consumo.modelo,
        prompt_versao=VERSAO,
    )
    chamadas = resultado.chamadas

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

        # A leitura do SDR vence a inferência por sinais: ele viu a conversa
        # inteira, a inferência só olha campos soltos. O motivo vai junto porque
        # é o que a recepção lê antes de discordar da máquina.
        if args.get("temperatura") in ("frio", "morno", "quente"):
            resposta.campos["temperatura"] = args["temperatura"]
            # Timestamp montado aqui, não como string "now()": o PostgREST
            # enviaria o literal e o Postgres recusaria o valor.
            resposta.campos["temperatura_em"] = datetime.now(timezone.utc).isoformat()
            if args.get("temperatura_motivo"):
                resposta.campos["temperatura_motivo"] = str(args["temperatura_motivo"])[:300]

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
