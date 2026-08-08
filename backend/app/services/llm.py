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
from dataclasses import dataclass, field

from openai import AsyncOpenAI

from ..config import settings

client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY, base_url=settings.OPENAI_BASE_URL)

# Cliente reserva: só é construído se houver chave, e só é usado quando a
# principal falha por credencial ou cota. Ver _chamar().
cliente_reserva = (
    AsyncOpenAI(api_key=settings.OPENAI_API_KEY_RESERVA, base_url=settings.OPENAI_BASE_URL)
    if settings.OPENAI_API_KEY_RESERVA
    else None
)

PAPEIS_VALIDOS = {"user", "assistant"}
_MAX_RODADAS_FERRAMENTA = 2


@dataclass
class Consumo:
    """Quanto custou a resposta. Vai gravado junto com a mensagem.

    É o que permite ver custo por agente, por clínica e por conversa no próprio
    painel — o relatório da OpenAI agrupa por projeto e não sabe nada disso.
    """

    tokens_entrada: int = 0
    tokens_saida: int = 0
    modelo: str = ""
    usou_reserva: bool = False


@dataclass
class Resultado:
    texto: str = ""
    chamadas: list[dict] = field(default_factory=list)
    consumo: Consumo = field(default_factory=Consumo)


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


# Erros que valem tentar de novo com a chave reserva: são de CREDENCIAL ou COTA,
# não do conteúdo do pedido. Repetir um pedido malformado com outra chave só
# gastaria a segunda também.
_FALHAS_DE_CHAVE = ("authenticationerror", "permissiondenied", "ratelimit", "insufficient_quota", "billing")


def _vale_tentar_reserva(exc: Exception) -> bool:
    assinatura = f"{type(exc).__name__} {exc}".lower()
    return any(marca in assinatura for marca in _FALHAS_DE_CHAVE)


async def _chamar(kwargs: dict, consumo: Consumo):
    """Chama o modelo; se a chave principal falhar por credencial/cota, usa a reserva."""
    try:
        resposta = await client.chat.completions.create(**kwargs)
    except Exception as exc:
        if not (cliente_reserva and _vale_tentar_reserva(exc)):
            raise
        logging.warning("Chave principal falhou (%s). Tentando a reserva.", type(exc).__name__)
        resposta = await cliente_reserva.chat.completions.create(**kwargs)
        consumo.usou_reserva = True

    uso = getattr(resposta, "usage", None)
    if uso:
        # Acumula: uma resposta com ferramenta faz mais de uma ida ao modelo, e
        # todas custam.
        consumo.tokens_entrada += getattr(uso, "prompt_tokens", 0) or 0
        consumo.tokens_saida += getattr(uso, "completion_tokens", 0) or 0
    return resposta


async def conversar(
    system: str,
    mensagem: str,
    historico: list | None = None,
    ferramentas: list[dict] | None = None,
    executar_ferramenta=None,
    apresentar: bool = False,
    modelo: str | None = None,
) -> Resultado:
    """Gera a resposta da Solara.

    `modelo` vem do agente: o SDR usa o melhor porque é onde há nuance de
    verdade; Agendador e Follow-up usam o econômico, já que suas travas estão no
    código e no banco, não no julgamento do modelo.
    """
    mensagens = [{"role": "system", "content": system}]
    mensagens.extend(_normalizar_historico(historico))
    mensagens.append({"role": "user", "content": mensagem.strip()})

    modelo_usado = modelo or settings.MODEL_LLM
    consumo = Consumo(modelo=modelo_usado)
    executadas: list[dict] = []

    def _kwargs():
        # Modelos de raciocínio exigem max_completion_tokens (não max_tokens) e
        # só aceitam temperature padrão, por isso ela é omitida.
        kw = {
            "model": modelo_usado,
            "messages": mensagens,
            "max_completion_tokens": 1024,
            "extra_body": {"reasoning_effort": "low"},  # chat em tempo real
        }
        if ferramentas:
            kw["tools"] = ferramentas
        return kw

    try:
        resposta = await _chamar(_kwargs(), consumo)
    except Exception as exc:
        logging.exception("Falha na chamada ao modelo: %s", exc)
        return Resultado(consumo=consumo)

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
            resposta = await _chamar(_kwargs(), consumo)
            mensagem_modelo = resposta.choices[0].message
        except Exception as exc:
            logging.exception("Falha na rodada de ferramenta: %s", exc)
            break

    texto = mensagem_modelo.content or ""
    if not apresentar:
        texto = remover_reapresentacao(texto)
    return Resultado(texto=texto, chamadas=executadas, consumo=consumo)
