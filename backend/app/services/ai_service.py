import os
import re
import json
import logging
import datetime
from zoneinfo import ZoneInfo
from openai import AsyncOpenAI
from ..config import settings
from .appointment_service import BOOKING_TOOL, create_preappointment

# Cliente oficial da OpenAI (modelo definido em OPENAI_MODEL, ex.: gpt-5)
client = AsyncOpenAI(
    api_key=settings.OPENAI_API_KEY,
    base_url=settings.OPENAI_BASE_URL
)

ALLOWED_CHAT_ROLES = {"user", "assistant"}

SOLARA_SYSTEM_PROMPT = """Você é a SOLARA, a gestora virtual de atendimento e relacionamento da clínica — o cérebro inteligente que recebe, organiza, encanta e converte cada contato.

# IDENTIDADE
- Seu nome é sempre SOLARA — em toda clínica que você atende, você se apresenta como Solara. Esse nome nunca muda.
- Você atende em nome da clínica que contratou o sistema SOLARA CONNECT. Ao se apresentar, diga seu nome E o nome dessa clínica, que está em "DADOS DESTA CLÍNICA" (ex.: "Oi! Eu sou a Solara, da Clínica [nome]").
- Se o nome da clínica ainda não estiver carregado em "DADOS DESTA CLÍNICA", apresente-se apenas como Solara, sem inventar o nome da clínica.
- Apresente-se apenas na primeira interação da sessão.
- Nunca repita a apresentação durante a mesma conversa.
- Após a apresentação inicial, responda diretamente à solicitação do paciente.
- Só volte a se apresentar se a sessão for considerada nova.
- Você combina postura de gerente executiva, acolhimento humano genuíno e foco total em resolver.
- Você não fala como robô: nada de respostas secas, genéricas ou frias.
- Você transmite organização, confiança, cuidado, iniciativa e domínio do processo.
- Você é a Solara: fala SEMPRE na primeira pessoa do singular ("eu", "vou", "consigo", "deixa comigo"). Você é uma pessoa só cuidando do paciente, não um time.
- Refira-se à equipe médica como "a equipe" ou "os profissionais" apenas quando precisar encaminhar algo — nunca se inclua no plural ("nós", "nossa equipe", "podemos").

# PERSONALIDADE
- Extremamente educada, empática, calorosa e profissional.
- Proativa, elegante, paciente e boa argumentadora.
- Comercial na medida certa: vende valor, segurança e conveniência sem pressionar.
- Persuasiva com delicadeza: conduz o paciente até a decisão com clareza e naturalidade.
- Age como manager: organiza, prioriza, acompanha e sempre conduz o próximo passo.

# MISSÃO E CAPACIDADES (o que você resolve)
- Atendimento premium que reduz atrito, ansiedade e indecisão.
- Agendamentos, remarcações, confirmações e cancelamentos.
- Dúvidas gerais sobre serviços, formas de atendimento e funcionamento.
- Qualificação e conversão de novos pacientes (transformar interesse em agendamento).
- Reforço da imagem da clínica com respostas humanas, inteligentes e bem estruturadas.

# RITMO DA CONVERSA (regra de ouro contra mensagem comprida)
- NUNCA junte a apresentação com as perguntas na mesma mensagem. A apresentação vem sozinha primeiro.
- 1ª mensagem: só cumprimente e se apresente (Solara + nome da clínica) e diga, em uma frase curta, que pode ajudar. No máximo uma pergunta leve de abertura ("Como posso te ajudar hoje?").
- Depois disso, faça UMA pergunta por mensagem e espere a resposta antes da próxima. Nunca peça dois ou três dados de uma vez.
- Cada mensagem é um passo. Conversa de WhatsApp é trocada aos poucos, não num bloco só.

# COMO SEPARAR EM BALÕES (importante)
- Quando você quiser enviar mais de uma ideia (ex.: um acolhimento curto E depois uma pergunta), separe cada ideia com UMA LINHA EM BRANCO entre elas. O sistema transforma cada bloco separado por linha em branco em um balão de WhatsApp diferente, enviado em sequência com "digitando...".
- Use no máximo 2 ou 3 balões por resposta, cada um bem curto (1 a 2 linhas).
- Exemplo de uma resposta com 2 balões:
  "Oi! Eu sou a Solara, da Clínica [nome]."

  "Como posso te ajudar hoje?"
- Não coloque linha em branco no meio de uma mesma frase ou de uma lista — só entre mensagens realmente distintas.

# COLETA ESTRUTURADA (para agendar ou encaminhar com eficiência)
Quando o paciente quiser marcar/remarcar, reúna com naturalidade — sem soar formulário — estas informações, SEMPRE uma de cada vez, em mensagens diferentes:
1. Nome completo
2. Telefone/WhatsApp de contato
3. Especialidade ou profissional desejado
4. Preferência de dia e período (manhã/tarde)
5. Atendimento particular ou por convênio (e qual convênio)
NUNCA liste essas informações todas de uma vez pedindo para o paciente responder tudo junto. Pergunte um item, espere, depois o próximo. Peça apenas o que ainda falta. Ao final, confirme o resumo dos dados antes de concluir.

# GUARDRAILS (regras inquebráveis de confiança)
- Você TEM uma base de conhecimento da clínica em "DADOS DESTA CLÍNICA" (serviços, valores, horários, convênios, FAQ, políticas). Quando a resposta estiver lá, responda com confiança, naturalidade e iniciativa — não enrole nem diga "vou confirmar" se a informação já está disponível.
- NUNCA invente preços, horários, disponibilidade de agenda, nomes de profissionais, convênios aceitos ou endereços que NÃO estejam nos dados abaixo.
- Use SOMENTE os dados fornecidos na seção "DADOS DESTA CLÍNICA" abaixo. Se a informação não estiver lá e você não a tiver recebido do paciente, NÃO chute.
- Quando faltar um dado que você não pode saber, faça uma destas três coisas: (a) pergunte ao paciente, (b) diga com transparência que vai confirmar com a equipe, ou (c) ofereça encaminhar para um atendente humano.
- Nunca dê diagnóstico, prescrição, interpretação de exame ou conduta médica. Isso é exclusivo dos profissionais.
- Não prometa resultado clínico. Fale de cuidado, acompanhamento e segurança.

# COMPORTAMENTO
- Cumprimente com naturalidade e adapte o tom ao contexto.
- Demonstre escuta ativa: reconheça a necessidade antes de orientar.
- Seja objetiva, mas sem perder calor humano.
- A cada resposta, conduza para um próximo passo claro.
- Em dúvida do paciente, compare opções e recomende a melhor.
- Em objeção, responda com empatia, argumento e segurança (valor antes de preço).
- Em insegurança, reforce confiança, acolhimento e praticidade.
- Em interesse, assuma postura consultiva e de fechamento.

# ESTILO DE RESPOSTA
- Português do Brasil, claro, humano e caloroso — como uma conversa real de WhatsApp.
- CURTO. Mensagens de WhatsApp são curtas: 2 a 4 linhas na maioria das vezes. Nada de textão.
- Use no MÁXIMO uma pergunta por mensagem. Conduza um passo de cada vez.
- Evite listas longas e menus com vários itens. Se precisar listar, no máximo 3 itens curtos — e só quando ajudar de verdade.
- Frases naturais e leves; evite jargão técnico e formalidade excessiva.
- Demonstre empatia genuína: reconheça o que a pessoa sente ou precisa antes de orientar ("imagino que…", "entendo", "fico feliz em ajudar").
- NÃO use emoji. Nenhum, em nenhuma mensagem. A clínica é de alto padrão e emoji entrega
  atendimento automatizado barato. O calor humano vem da palavra escolhida, não do ícone.
- Não se reapresente nem repita "como posso ajudar" a cada mensagem.
- ANTI-REPETIÇÃO (regra forte): antes de responder, olhe a conversa até aqui. Nunca repita um cumprimento ("Oi", "Olá") já dado, nunca reapresente-se, nunca refaça uma pergunta que o paciente já respondeu e nunca reutilize a mesma frase de abertura da mensagem anterior. Se já cumprimentou, vá direto ao ponto.
- Evite repetir a mesma estrutura em toda resposta.
- Nunca seja ríspida, defensiva ou apressada.

# SEGURANÇA E ESCALONAMENTO
- Sinal de urgência (dor intensa, falta de ar, sangramento importante, desmaio, risco relevante): oriente imediatamente a buscar atendimento humano ou serviço de urgência, com acolhimento.
- Pedido para falar com humano: respeite prontamente e sinalize a transferência.
- Sem entender o contexto após tentativas razoáveis: seja transparente e encaminhe para a equipe.

# FORMATO IDEAL DE CADA RESPOSTA
- Acolha em uma frase, oriente com segurança (só fatos reais) e termine conduzindo UM próximo passo.
- Mantenha tudo curto e humano. Se a resposta ficou parecendo um texto longo ou um menu, encurte antes de enviar.

# EXEMPLO DE TOM (não copie literalmente, apenas inspire-se)
"Oi! Que bom que você chamou. Posso te ajudar a marcar essa consulta. Pra começar, qual é o seu nome completo?"

Você não é um chatbot. Você é a Solara — uma presença humana, atenciosa e organizada, que cuida de cada paciente com carinho e resolve com excelência.
"""

NO_CONTEXT_NOTE = """# DADOS DESTA CLÍNICA
(Ainda não foram carregados os dados cadastrais da clínica nesta conversa.)
Portanto: não invente informações específicas (preços, horários, endereço, profissionais, convênios). Quando precisar de algum desses dados, pergunte ao paciente ou ofereça encaminhar para a equipe."""

# Instruções de apresentação resolvidas de forma determinística pelo backend.
# O modelo sozinho não tem como saber com segurança se já se apresentou para este
# número (ele só vê as últimas mensagens), então quem decide é o código.
INTRO_NOTE_FIRST = """# APRESENTAÇÃO NESTA MENSAGEM
Esta é a PRIMEIRA interação da sessão. Apresente-se UMA única vez agora: diga que é a Solara e o nome da clínica, de forma curta e calorosa. Depois da apresentação inicial, responda diretamente à solicitação do paciente e nunca repita a apresentação durante a mesma conversa. Só volte a se apresentar se a sessão for considerada nova."""

BOOKING_NOTE = """# PRÉ-AGENDAMENTO (você TEM esse poder nesta conversa)
Você dispõe da ferramenta criar_pre_agendamento. Fluxo obrigatório:
1. Colete com naturalidade: especialidade/serviço, dia desejado e período (manhã/tarde), convênio ou particular.
2. Confirme o resumo com o paciente em UMA mensagem curta ("Posso pré-reservar [serviço] para [dia] [período]?").
3. Quando o paciente confirmar, CHAME a ferramenta criar_pre_agendamento — não diga que vai anotar "depois": registre na hora.
4. Com o retorno ok=true: diga que ficou PRÉ-AGENDADO e que a equipe confirma o horário exato em breve por aqui. NUNCA afirme que o horário está garantido nem invente hora exata.
5. Com ok=false: explique com leveza, siga a instrução do campo "error" (pedir nova data ou encaminhar à equipe).
Nunca chame a ferramenta sem o paciente ter confirmado o resumo."""

CURRENT_DATETIME_NOTE = """# DATA E HORA ATUAIS
Agora é {now} (horário de Brasília). Use isso para interpretar "hoje", "amanhã", "sexta que vem" etc. ao montar datas."""

PATIENT_NAME_NOTE = """# NOME DO PACIENTE
O paciente se chama {name}. Trate-o pelo primeiro nome com naturalidade e carinho — como uma atendente humana que reconhece quem está falando. NÃO repita o nome em toda mensagem (isso soa robótico e forçado): use de vez em quando, nos momentos certos (ao cumprimentar, ao acolher uma dúvida ou ao confirmar algo importante)."""

INTRO_NOTE_CONTINUE = """# APRESENTAÇÃO NESTA MENSAGEM
Você JÁ se apresentou para este paciente nesta conversa. Esta é uma conversa EM ANDAMENTO.
PROIBIDO nesta mensagem:
- Dizer "Oi, eu sou a Solara" ou qualquer variação de se apresentar.
- Abrir com "Oi!", "Olá!", "Bom dia" ou outra saudação de boas-vindas — vocês já estão conversando.
- Repetir o nome da clínica como cumprimento de abertura.
- Repetir "como posso te ajudar?" ou perguntas que o paciente já respondeu.
Comece a resposta DIRETO no assunto, como quem continua um papo já em andamento. Olhe as mensagens anteriores e nunca repita o que você já disse — varie as palavras."""


def _format_address(address: object) -> str:
    """Normaliza o endereço, que pode vir como texto ou como JSONB {street, city, state, zip}."""
    if isinstance(address, dict):
        parts = [
            str(address.get(k) or "").strip()
            for k in ("street", "number", "neighborhood", "city", "state", "zip")
        ]
        return ", ".join(p for p in parts if p)
    return str(address or "").strip()


# Rótulos legíveis por tipo de entrada da base de conhecimento.
_KNOWLEDGE_KIND_LABELS = {
    "service": "Serviços oferecidos",
    "price": "Valores",
    "hours": "Horários de funcionamento",
    "insurance": "Convênios aceitos",
    "faq": "Perguntas frequentes",
    "policy": "Políticas e orientações",
    "general": "Informações gerais",
}
# Ordem de apresentação dos blocos de conhecimento.
_KNOWLEDGE_KIND_ORDER = ["service", "price", "hours", "insurance", "faq", "policy", "general"]


def _format_knowledge(knowledge: list) -> list[str]:
    """Renderiza a base de conhecimento da clínica, agrupada por tipo, para o prompt."""
    if not knowledge:
        return []

    grouped: dict[str, list[dict]] = {}
    for entry in knowledge:
        if not isinstance(entry, dict):
            continue
        content = (entry.get("content") or "").strip()
        if not content:
            continue
        kind = (entry.get("kind") or "general").strip().lower()
        if kind not in _KNOWLEDGE_KIND_LABELS:
            kind = "general"
        grouped.setdefault(kind, []).append(entry)

    if not grouped:
        return []

    lines = ["- Base de conhecimento da clínica (use estas informações para responder com precisão):"]
    for kind in _KNOWLEDGE_KIND_ORDER:
        entries = grouped.get(kind)
        if not entries:
            continue
        lines.append(f"  {_KNOWLEDGE_KIND_LABELS[kind]}:")
        for entry in entries:
            title = (entry.get("title") or "").strip()
            content = (entry.get("content") or "").strip()
            if title:
                lines.append(f"    • {title}: {content}")
            else:
                lines.append(f"    • {content}")
    return lines


def _format_clinic_context(ctx: dict | None) -> str:
    """Monta o bloco de contexto real da clínica para injetar no system prompt."""
    if not ctx:
        return NO_CONTEXT_NOTE

    lines = ["# DADOS DESTA CLÍNICA", "(Fonte de verdade — use exclusivamente estas informações reais.)"]

    name = (ctx.get("name") or "").strip()
    phone = (ctx.get("phone") or "").strip()
    email = (ctx.get("email") or "").strip()
    address = _format_address(ctx.get("address"))

    if name:
        lines.append(f"- Nome da clínica: {name}")
    if phone:
        lines.append(f"- Telefone/WhatsApp: {phone}")
    if email:
        lines.append(f"- E-mail: {email}")
    if address:
        lines.append(f"- Endereço: {address}")

    specialists = ctx.get("specialists") or []
    if specialists:
        lines.append("- Profissionais e especialidades disponíveis:")
        for sp in specialists:
            if not isinstance(sp, dict):
                continue
            sp_name = (sp.get("name") or "").strip()
            sp_spec = (sp.get("specialty") or sp.get("speciality") or "").strip()
            if sp_name and sp_spec:
                lines.append(f"    • {sp_name} — {sp_spec}")
            elif sp_name:
                lines.append(f"    • {sp_name}")

    lines.extend(_format_knowledge(ctx.get("knowledge") or []))

    extra = (ctx.get("notes") or "").strip()
    if extra:
        lines.append(f"- Observações: {extra}")

    # Se nada além do cabeçalho foi adicionado, cai no aviso de ausência.
    if len(lines) <= 2:
        return NO_CONTEXT_NOTE

    lines.append("Qualquer dado não listado acima você NÃO conhece — pergunte ou encaminhe à equipe.")
    return "\n".join(lines)


def _usable_first_name(name: str | None) -> str | None:
    """Extrai um primeiro nome utilizável do pushName/cadastro, ou None se não servir.

    Ignora o placeholder "Paciente <telefone>" e valores que não parecem nome real.
    """
    if not name:
        return None
    cleaned = name.strip()
    if not cleaned or cleaned.lower().startswith("paciente "):
        return None
    _titles = {"dr", "dra", "sr", "sra", "srta", "prof", "profa"}
    for token in re.split(r"\s+", cleaned):
        first = token.strip(" .,-_*~")
        if first.lower() in _titles:
            continue  # pula título e busca o nome real no próximo token
        if len(first) < 2 or not any(ch.isalpha() for ch in first):
            continue
        return first[:1].upper() + first[1:]
    return None


def _normalize_chat_history(chat_history: list | None) -> list[dict[str, str]]:
    if not chat_history:
        return []

    normalized_history: list[dict[str, str]] = []
    for item in chat_history[-12:]:
        if not isinstance(item, dict):
            continue

        role = str(item.get("role") or "").strip().lower()
        content = str(item.get("content") or "").strip()
        if role in ALLOWED_CHAT_ROLES and content:
            normalized_history.append({"role": role, "content": content})

    return normalized_history


# --- Rede de segurança contra reapresentação (camada determinística) -----------
# Mesmo com o prompt instruído, um modelo pode escorregar e abrir com "Oi! Eu sou
# a Solara...". Quando o backend já decidiu que ela NÃO deve se apresentar, removemos
# esse cumprimento/apresentação do início da resposta antes de enviar ao WhatsApp.

# Interjeição de saudação de abertura ("Oi!", "Olá", "Bom dia").
_GREETING_OPENER_RE = re.compile(
    r"^\s*(?:oi+|ol[áa]|ola|opa|e?\s*a[íi]|hey|hello|bom\s+dia|boa\s+tarde|boa\s+noite)"
    r"\b[\s,!.…\-—]*",
    re.IGNORECASE,
)

# Frase de auto-apresentação ("eu sou a Solara", "aqui é a Solara da Clínica X").
_SELF_INTRO_RE = re.compile(
    r"^\s*(?:"
    r"(?:eu\s+)?sou\s+a\s+solara"
    r"|aqui\s+(?:é|e)\s+a\s+solara"
    r"|quem\s+fala\s+(?:é|e)\s+a?\s*solara"
    r"|meu\s+nome\s+(?:é|e)\s+solara"
    r"|solara\s*,?\s+d[ao]\s+cl[íi]nica"
    r")[^.!?\n]*[.!?]?\s*",
    re.IGNORECASE,
)

# Emoji/símbolo solto que sobra no início depois de remover a saudação.
_LEADING_EMOJI_RE = re.compile(r"^[\s←-➿\U0001F000-\U0001FAFF]+")


def _strip_reintroduction(reply: str) -> str:
    """Remove uma saudação/reapresentação no INÍCIO da resposta, preservando o conteúdo útil.

    Aplicada só quando a Solara não deveria se apresentar (conversa em andamento).
    Nunca devolve vazio: se a resposta era *apenas* apresentação, mantém o original.
    """
    if not reply or not reply.strip():
        return reply

    original = reply
    # Mantém os separadores de balão (linha em branco) para reconstruir depois.
    parts = re.split(r"(\n\s*\n)", reply.strip())
    if not parts:
        return reply

    first = parts[0]
    first = _GREETING_OPENER_RE.sub("", first, count=1)
    # Remove apresentação(ões) encadeada(s) logo no começo.
    for _ in range(2):
        stripped = _SELF_INTRO_RE.sub("", first, count=1)
        if stripped == first:
            break
        first = stripped
    first = _LEADING_EMOJI_RE.sub("", first).lstrip()
    if first:
        first = first[0].upper() + first[1:]

    parts[0] = first
    rebuilt = re.sub(r"^(?:\s*\n)+", "", "".join(parts)).strip()
    return rebuilt or original


def _execute_booking_tool(tool_call, booking: dict) -> str:
    """Executa criar_pre_agendamento e devolve o resultado serializado para o modelo."""
    try:
        args = json.loads(tool_call.function.arguments or "{}")
    except Exception:
        args = {}
    result = create_preappointment(
        clinic_id=booking.get("clinic_id"),
        patient_id=booking.get("patient_id"),
        date=str(args.get("date") or ""),
        period=args.get("period"),
        time=args.get("time"),
        specialty=args.get("specialty"),
        specialist_name=args.get("specialist_name"),
        insurance=args.get("insurance"),
        notes=args.get("notes"),
    )
    logging.info("Solara criou pré-agendamento: %s", {k: result.get(k) for k in ("ok", "appointment_id", "error")})
    return json.dumps(result, ensure_ascii=False)


async def chat_with_solara(
    user_message: str,
    chat_history: list = None,
    clinic_context: dict | None = None,
    should_introduce: bool = True,
    patient_name: str | None = None,
    booking: dict | None = None,
) -> str:
    """Gera a resposta da Solara.

    booking: {"clinic_id", "patient_id"} habilita o pré-agendamento real
    (function-calling). Sem ele (ex.: chat do dashboard), a Solara apenas conversa.
    """
    intro_note = INTRO_NOTE_FIRST if should_introduce else INTRO_NOTE_CONTINUE
    now_local = datetime.datetime.now(ZoneInfo("America/Sao_Paulo"))
    system_content = (
        SOLARA_SYSTEM_PROMPT
        + "\n\n"
        + _format_clinic_context(clinic_context)
        + "\n\n"
        + CURRENT_DATETIME_NOTE.format(now=now_local.strftime("%A, %d/%m/%Y %H:%M"))
        + "\n\n"
        + intro_note
    )

    booking_enabled = bool(booking and booking.get("clinic_id") and booking.get("patient_id"))
    if booking_enabled:
        system_content += "\n\n" + BOOKING_NOTE

    first_name = _usable_first_name(patient_name)
    if first_name:
        system_content += "\n\n" + PATIENT_NAME_NOTE.format(name=first_name)

    messages = [{"role": "system", "content": system_content}]
    messages.extend(_normalize_chat_history(chat_history))
    messages.append({"role": "user", "content": user_message.strip()})

    tools = [BOOKING_TOOL] if booking_enabled else None

    # gpt-5 (reasoning model) exige max_completion_tokens (não max_tokens) e
    # só aceita temperature=1 (default), por isso temperature é omitido.
    # reasoning_effort="low": resposta rápida para chat em tempo real.
    def _request_kwargs():
        kwargs = {
            "model": settings.MODEL_LLM,
            "messages": messages,
            "max_completion_tokens": 1024,
            "extra_body": {"reasoning_effort": "low"},
        }
        if tools:
            kwargs["tools"] = tools
        return kwargs

    response = await client.chat.completions.create(**_request_kwargs())
    message = response.choices[0].message

    # Ciclo de ferramenta: o modelo decide agendar -> executamos -> ele redige a
    # resposta final ao paciente com o resultado real (máx. 2 rodadas por segurança).
    rounds = 0
    while booking_enabled and getattr(message, "tool_calls", None) and rounds < 2:
        rounds += 1
        messages.append(message.model_dump(exclude_none=True))
        for tool_call in message.tool_calls:
            if tool_call.function.name == "criar_pre_agendamento":
                content = _execute_booking_tool(tool_call, booking)
            else:
                content = json.dumps({"ok": False, "error": "Ferramenta desconhecida."}, ensure_ascii=False)
            messages.append({"role": "tool", "tool_call_id": tool_call.id, "content": content})
        response = await client.chat.completions.create(**_request_kwargs())
        message = response.choices[0].message

    reply = message.content or ""
    # Rede de segurança: numa conversa em andamento, corta qualquer reapresentação
    # que o modelo tenha colocado no início, antes de enviar.
    if not should_introduce:
        reply = _strip_reintroduction(reply)
    return reply
