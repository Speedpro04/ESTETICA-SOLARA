"""Chamada ao modelo, com as redes de segurança que o prompt sozinho não garante.

Duas coisas aqui não são opcionais:

  1. A remoção de reapresentação. Mesmo instruído, o modelo escorrega e abre com
     "Oi! Eu sou a Solara...". Quando o backend já decidiu que ela NÃO deve se
     apresentar, o corte é feito no texto, antes de sair. Prompt é pedido; código
     é garantia.

  2. O limite de rodadas de ferramenta. Sem teto, um modelo confuso chama a mesma
     função em laço e a conversa nunca chega ao lead.
"""
import json
import logging
import re

from openai import AsyncOpenAI

from ..config import settings

client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY, base_url=settings.OPENAI_BASE_URL)

PAPEIS_VALIDOS = {"user", "assistant"}
_MAX_RODADAS_FERRAMENTA = 2


# --- Rede de segurança contra reapresentação ---------------------------------

_SAUDACAO = re.compile(
    r"^\s*(?:oi+|ol[áa]|ola|opa|e?\s*a[íi]|hey|hello|bom\s+dia|boa\s+tarde|boa\s+noite)"
    r"\b[\s,!.…\-—]*",
    re.IGNORECASE,
)

_AUTO_APRESENTACAO = re.compile(
    r"^\s*(?:"
    r"(?:eu\s+)?sou\s+a\s+solara"
    r"|aqui\s+(?:é|e)\s+a\s+solara"
    r"|quem\s+fala\s+(?:é|e)\s+a?\s*solara"
    r"|meu\s+nome\s+(?:é|e)\s+solara"
    r"|solara\s*,?\s+d[ao]\s+cl[íi]nica"
    r")[^.!?\n]*[.!?]?\s*",
    re.IGNORECASE,
)

_EMOJI_SOLTO = re.compile(r"^[\s←-➿\U0001F000-\U0001FAFF]+")


def remover_reapresentacao(resposta: str) -> str:
    """Corta saudação e auto-apresentação do INÍCIO, preservando o conteúdo útil.

    Nunca devolve vazio: se a resposta era só apresentação, mantém o original —
    mandar nada é pior que mandar um cumprimento repetido.
    """
    if not resposta or not resposta.strip():
        return resposta

    original = resposta
    # Preserva os separadores de balão para reconstruir depois.
    partes = re.split(r"(\n\s*\n)", resposta.strip())
    if not partes:
        return resposta

    primeira = _SAUDACAO.sub("", partes[0], count=1)
    for _ in range(2):  # apresentações encadeadas
        cortada = _AUTO_APRESENTACAO.sub("", primeira, count=1)
        if cortada == primeira:
            break
        primeira = cortada
    primeira = _EMOJI_SOLTO.sub("", primeira).lstrip()
    if primeira:
        primeira = primeira[0].upper() + primeira[1:]

    partes[0] = primeira
    reconstruida = re.sub(r"^(?:\s*\n)+", "", "".join(partes)).strip()
    return reconstruida or original


def _normalizar_historico(historico: list | None) -> list[dict[str, str]]:
    if not historico:
        return []
    saida: list[dict[str, str]] = []
    for item in historico[-12:]:
        if not isinstance(item, dict):
            continue
        papel = str(item.get("role") or "").strip().lower()
        conteudo = str(item.get("content") or "").strip()
        if papel in PAPEIS_VALIDOS and conteudo:
            saida.append({"role": papel, "content": conteudo})
    return saida


async def conversar(
    system: str,
    mensagem: str,
    historico: list | None = None,
    ferramentas: list[dict] | None = None,
    executar_ferramenta=None,
    apresentar: bool = False,
) -> tuple[str, list[dict]]:
    """Gera a resposta da Solara.

    Devolve (texto, chamadas_de_ferramenta_executadas). O chamador usa as chamadas
    para saber o que o agente decidiu — qualificar, agendar, escalar.
    """
    mensagens = [{"role": "system", "content": system}]
    mensagens.extend(_normalizar_historico(historico))
    mensagens.append({"role": "user", "content": mensagem.strip()})

    executadas: list[dict] = []

    def _kwargs():
        # Modelos de raciocínio exigem max_completion_tokens (não max_tokens) e
        # só aceitam temperature padrão, por isso ela é omitida.
        kw = {
            "model": settings.MODEL_LLM,
            "messages": mensagens,
            "max_completion_tokens": 1024,
            "extra_body": {"reasoning_effort": "low"},  # chat em tempo real
        }
        if ferramentas:
            kw["tools"] = ferramentas
        return kw

    try:
        resposta = await client.chat.completions.create(**_kwargs())
    except Exception as exc:
        logging.exception("Falha na chamada ao modelo: %s", exc)
        return "", []

    mensagem_modelo = resposta.choices[0].message

    rodadas = 0
    while ferramentas and getattr(mensagem_modelo, "tool_calls", None) and rodadas < _MAX_RODADAS_FERRAMENTA:
        rodadas += 1
        mensagens.append(mensagem_modelo.model_dump(exclude_none=True))

        for chamada in mensagem_modelo.tool_calls:
            nome = chamada.function.name
            try:
                argumentos = json.loads(chamada.function.arguments or "{}")
            except Exception:
                argumentos = {}

            executadas.append({"nome": nome, "argumentos": argumentos})

            resultado = (
                executar_ferramenta(nome, argumentos)
                if executar_ferramenta
                else {"ok": True}
            )
            mensagens.append({
                "role": "tool",
                "tool_call_id": chamada.id,
                "content": json.dumps(resultado, ensure_ascii=False),
            })

        try:
            resposta = await client.chat.completions.create(**_kwargs())
            mensagem_modelo = resposta.choices[0].message
        except Exception as exc:
            logging.exception("Falha na rodada de ferramenta: %s", exc)
            break

    texto = mensagem_modelo.content or ""
    if not apresentar:
        texto = remover_reapresentacao(texto)
    return texto, executadas
