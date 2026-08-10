"""Cobrança da assinatura pelo Stripe.

Três endpoints: abrir o checkout, abrir o portal de gerenciamento e receber o
webhook. O webhook é o único lugar do sistema que liga uma assinatura — nem o
navegador nem o painel escrevem `status = 'active'`, e o RLS de `subscriptions`
(só SELECT para `authenticated`) garante isso do lado do banco.

Duas particularidades deste ambiente moldam o arquivo inteiro:

1. A conta do Stripe é a mesma do CNPJ e atende outro produto além da Solara.
   Este endpoint recebe TODOS os eventos da conta. Evento que não casa com
   nenhuma assinatura daqui é descartado em silêncio, com 200 — responder erro
   faria o Stripe reentregar para sempre um evento que nunca vai ser nosso.

2. O trial de 10 dias é local (register_clinic cria 'trialing' sem cartão). A
   sessão de checkout não usa trial_period_days: quando a clínica chega aqui, o
   teste já aconteceu.
"""
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple
from urllib.parse import urlparse
from uuid import UUID

import stripe
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from ..config import settings
from ..services.auth_guard import get_admin_client, require_clinic_user

# stripe-python moveu os erros de `stripe.error` para o nível do pacote no v8 e
# removeu o alias antigo depois. Importar dos dois jeitos evita que uma subida
# de versão quebre o deploy.
try:  # stripe < 12
    from stripe.error import SignatureVerificationError, StripeError
except ImportError:  # stripe >= 12
    from stripe import SignatureVerificationError, StripeError

router = APIRouter(prefix="/api/stripe", tags=["stripe"])
logger = logging.getLogger(__name__)

# Quem pode contratar. Recepção e profissional usam o painel, mas não assinam.
PAPEIS_QUE_ASSINAM = {"owner", "admin"}


class CheckoutRequest(BaseModel):
    """O navegador escolhe o PLANO, nunca o preço.

    Mandar o `price_id` daqui significaria confiar no cliente para dizer quanto
    vai pagar. O slug é resolvido contra `plans.stripe_price_id` no banco.
    """
    plan_slug: str


def _stripe_pronto() -> None:
    chave = settings.STRIPE_SECRET_KEY
    if not chave:
        raise HTTPException(status_code=503, detail="Cobrança indisponível: STRIPE_SECRET_KEY não configurada")
    stripe.api_key = chave


def _admin():
    admin = get_admin_client()
    if admin is None:
        raise HTTPException(status_code=503, detail="Banco indisponível")
    return admin


def _url_do_frontend(caminho: str) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}{caminho}"


def _url_permitida(url: str) -> bool:
    """Redirecionamento só para o próprio frontend — senão vira open redirect."""
    try:
        alvo, frontend = urlparse(url), urlparse(settings.FRONTEND_URL)
    except ValueError:
        return False
    return alvo.scheme in {"http", "https"} and alvo.netloc == frontend.netloc


def _uuid_ou_none(valor: Any) -> Optional[str]:
    """O client_reference_id do outro produto não é UUID de clínica.

    Sem esta checagem, o valor cru iria para uma função que espera UUID e o
    webhook responderia 500 — fazendo o Stripe reentregar em loop um evento
    que nunca foi nosso.
    """
    if not valor:
        return None
    try:
        return str(UUID(str(valor)))
    except (ValueError, AttributeError, TypeError):
        return None


def _iso(epoch: Any) -> Optional[str]:
    if not epoch:
        return None
    try:
        return datetime.fromtimestamp(int(epoch), tz=timezone.utc).isoformat()
    except (ValueError, OSError, TypeError):
        return None


def _periodo(assinatura: Dict[str, Any]) -> Tuple[Optional[str], Optional[str]]:
    """Início e fim do ciclo atual.

    A partir da versão 2025-03-31 da API, o Stripe tirou current_period_* da
    raiz da assinatura e passou para cada item. Ler os dois lugares mantém o
    código funcionando de qualquer lado dessa fronteira — do contrário o painel
    mostraria "vence em —" sem nenhum erro aparente.
    """
    inicio = assinatura.get("current_period_start")
    fim = assinatura.get("current_period_end")
    if inicio is None or fim is None:
        itens = (assinatura.get("items") or {}).get("data") or []
        if itens:
            inicio = inicio if inicio is not None else itens[0].get("current_period_start")
            fim = fim if fim is not None else itens[0].get("current_period_end")
    return _iso(inicio), _iso(fim)


def _assinatura_da_fatura(fatura: Dict[str, Any]) -> Optional[str]:
    """Descobre a assinatura de uma invoice, nos dois formatos da API."""
    direto = fatura.get("subscription")
    if isinstance(direto, str) and direto:
        return direto
    if isinstance(direto, dict) and direto.get("id"):
        return direto["id"]

    detalhes = (fatura.get("parent") or {}).get("subscription_details") or {}
    nova = detalhes.get("subscription")
    if isinstance(nova, str) and nova:
        return nova
    if isinstance(nova, dict) and nova.get("id"):
        return nova["id"]

    for linha in (fatura.get("lines") or {}).get("data") or []:
        item = (linha.get("parent") or {}).get("subscription_item_details") or {}
        if item.get("subscription"):
            return item["subscription"]
    return None


def _plano_por_slug(slug: str) -> Dict[str, Any]:
    res = _admin().table("plans").select(
        "id, slug, name, stripe_price_id, active"
    ).eq("slug", slug).limit(1).execute()

    if not res.data:
        raise HTTPException(status_code=404, detail="Plano não encontrado")
    plano = res.data[0]
    if not plano.get("active"):
        raise HTTPException(status_code=400, detail="Plano indisponível")
    if not plano.get("stripe_price_id"):
        # Falha alto de propósito: preço não cadastrado é erro de configuração,
        # e mandar a clínica para um checkout improvisado cobraria valor errado.
        raise HTTPException(
            status_code=503,
            detail=f"Plano '{slug}' sem stripe_price_id cadastrado. Ver a seção 6 de 19_stripe.sql.",
        )
    return plano


def _assinatura_da_clinica(clinic_id: str) -> Dict[str, Any]:
    res = _admin().table("subscriptions").select(
        "id, status, stripe_customer_id, stripe_subscription_id"
    ).eq("clinic_id", clinic_id).order("created_at", desc=True).limit(1).execute()
    return res.data[0] if res.data else {}


# =============================================================================
# CHECKOUT
# =============================================================================
@router.post("/checkout")
async def criar_checkout(payload: CheckoutRequest, request: Request):
    """Abre a sessão de pagamento e devolve a URL do Stripe.

    A clínica vem do JWT, não do corpo da requisição: quem manda o token decide
    por qual clínica está pagando, e só por essa.
    """
    _stripe_pronto()
    usuario = require_clinic_user(request)

    if usuario.get("role") not in PAPEIS_QUE_ASSINAM:
        raise HTTPException(status_code=403, detail="Só o dono ou um administrador pode contratar o plano")

    clinic_id = usuario["clinic_id"]
    plano = _plano_por_slug(payload.plan_slug)

    clinica_res = _admin().table("clinics").select("id, email, name").eq("id", clinic_id).limit(1).execute()
    if not clinica_res.data:
        raise HTTPException(status_code=404, detail="Clínica não encontrada")
    clinica = clinica_res.data[0]

    assinatura = _assinatura_da_clinica(clinic_id)
    if assinatura.get("status") == "active":
        raise HTTPException(status_code=409, detail="Esta clínica já tem assinatura ativa")

    sucesso = _url_do_frontend("/?checkout=success")
    cancelado = _url_do_frontend("/?checkout=cancel")
    if not _url_permitida(sucesso) or not _url_permitida(cancelado):
        raise HTTPException(status_code=500, detail="FRONTEND_URL inválida para redirecionamento")

    # Metadata vai na sessão E na assinatura. Os eventos de
    # customer.subscription.* não enxergam a metadata da sessão — sem repetir
    # aqui, um cancelamento futuro chegaria sem saber de qual clínica é.
    metadata = {"clinic_id": str(clinic_id), "plan_slug": plano["slug"], "produto": "solara-estetica"}

    argumentos: Dict[str, Any] = {
        "mode": "subscription",
        "line_items": [{"price": plano["stripe_price_id"], "quantity": 1}],
        "success_url": sucesso,
        "cancel_url": cancelado,
        "client_reference_id": str(clinic_id),
        "metadata": metadata,
        "subscription_data": {"metadata": metadata},
        "locale": "pt-BR",
        "billing_address_collection": "required",
    }

    # Cliente que já existe no Stripe é reaproveitado; senão o e-mail vem
    # preenchido. Os dois campos juntos são recusados pela API.
    if assinatura.get("stripe_customer_id"):
        argumentos["customer"] = assinatura["stripe_customer_id"]
        argumentos["customer_update"] = {"address": "auto", "name": "auto"}
    else:
        argumentos["customer_email"] = clinica.get("email")

    try:
        sessao = stripe.checkout.Session.create(**argumentos)
    except StripeError:
        logger.exception("Falha ao criar sessão de checkout da clínica %s", clinic_id)
        raise HTTPException(status_code=502, detail="Não foi possível abrir o checkout. Tente de novo.")

    return {"url": sessao.url, "session_id": sessao.id}


# =============================================================================
# PORTAL DE GERENCIAMENTO
# =============================================================================
@router.post("/portal")
async def abrir_portal(request: Request):
    """Portal do Stripe: trocar cartão, ver faturas, cancelar.

    Sem isto, cada troca de cartão vira chamado de suporte — e cancelamento sem
    caminho próprio vira chargeback, que custa mais caro que o churn.
    """
    _stripe_pronto()
    usuario = require_clinic_user(request)

    if usuario.get("role") not in PAPEIS_QUE_ASSINAM:
        raise HTTPException(status_code=403, detail="Só o dono ou um administrador pode gerenciar a assinatura")

    assinatura = _assinatura_da_clinica(usuario["clinic_id"])
    if not assinatura.get("stripe_customer_id"):
        raise HTTPException(status_code=404, detail="Esta clínica ainda não tem assinatura no Stripe")

    try:
        sessao = stripe.billing_portal.Session.create(
            customer=assinatura["stripe_customer_id"],
            return_url=_url_do_frontend("/"),
        )
    except StripeError:
        logger.exception("Falha ao abrir portal da clínica %s", usuario["clinic_id"])
        raise HTTPException(status_code=502, detail="Não foi possível abrir o portal de cobrança")

    return {"url": sessao.url}


# =============================================================================
# WEBHOOK
# =============================================================================
def _aplicar(
    stripe_subscription_id: Optional[str],
    status: Optional[str],
    clinic_id: Optional[str] = None,
    customer_id: Optional[str] = None,
    periodo: Tuple[Optional[str], Optional[str]] = (None, None),
    cancel_at: Optional[str] = None,
    plan_slug: Optional[str] = None,
) -> Dict[str, Any]:
    """Chama a função do banco que decide e escreve numa tacada só."""
    if not stripe_subscription_id or not status:
        return {"ok": False, "motivo": "evento_incompleto"}

    resposta = _admin().rpc("stripe_aplicar_assinatura", {
        "p_stripe_subscription_id": stripe_subscription_id,
        "p_status": status,
        "p_clinic_id": clinic_id,
        "p_stripe_customer_id": customer_id,
        "p_period_start": periodo[0],
        "p_period_end": periodo[1],
        "p_cancel_at": cancel_at,
        "p_plan_slug": plan_slug,
    }).execute()
    return resposta.data or {}


def _da_assinatura(assinatura: Dict[str, Any]) -> Dict[str, Any]:
    metadata = assinatura.get("metadata") or {}
    cliente = assinatura.get("customer")
    return _aplicar(
        stripe_subscription_id=assinatura.get("id"),
        status=assinatura.get("status"),
        clinic_id=_uuid_ou_none(metadata.get("clinic_id")),
        customer_id=cliente if isinstance(cliente, str) else (cliente or {}).get("id"),
        periodo=_periodo(assinatura),
        cancel_at=_iso(assinatura.get("cancel_at")),
        plan_slug=metadata.get("plan_slug"),
    )


def _do_checkout(sessao: Dict[str, Any]) -> Dict[str, Any]:
    """Compra avulsa (mode='payment') não é assinatura — passa batido."""
    if sessao.get("mode") != "subscription":
        return {"ok": False, "motivo": "nao_e_assinatura"}

    subscription_id = sessao.get("subscription")
    if isinstance(subscription_id, dict):
        subscription_id = subscription_id.get("id")
    if not subscription_id:
        return {"ok": False, "motivo": "sessao_sem_assinatura"}

    metadata = sessao.get("metadata") or {}
    clinic_id = _uuid_ou_none(metadata.get("clinic_id")) or _uuid_ou_none(sessao.get("client_reference_id"))
    if not clinic_id:
        # Sessão do outro produto da conta.
        return {"ok": False, "motivo": "ignorado"}

    # Busca a assinatura para gravar o período junto, em vez de deixar o painel
    # sem data de vencimento até o próximo evento chegar.
    try:
        assinatura = stripe.Subscription.retrieve(subscription_id)
        dados = dict(assinatura)
    except StripeError:
        logger.warning("Não foi possível ler a assinatura %s; grava o que a sessão trouxe", subscription_id)
        dados = {"status": "active", "customer": sessao.get("customer")}

    cliente = dados.get("customer") or sessao.get("customer")
    return _aplicar(
        stripe_subscription_id=subscription_id,
        status=dados.get("status") or "active",
        clinic_id=clinic_id,
        customer_id=cliente if isinstance(cliente, str) else (cliente or {}).get("id"),
        periodo=_periodo(dados),
        cancel_at=_iso(dados.get("cancel_at")),
        plan_slug=metadata.get("plan_slug"),
    )


def _da_fatura(fatura: Dict[str, Any], status: str) -> Dict[str, Any]:
    subscription_id = _assinatura_da_fatura(fatura)
    if not subscription_id:
        return {"ok": False, "motivo": "fatura_sem_assinatura"}
    cliente = fatura.get("customer")
    return _aplicar(
        stripe_subscription_id=subscription_id,
        status=status,
        customer_id=cliente if isinstance(cliente, str) else (cliente or {}).get("id"),
    )


@router.post("/webhook")
async def webhook(request: Request):
    """Recebe os eventos do Stripe.

    Eventos configurados no painel:
      checkout.session.completed
      customer.subscription.created / updated / deleted
      invoice.paid
      invoice.payment_failed
    """
    if not settings.STRIPE_WEBHOOK_SECRET:
        raise HTTPException(status_code=503, detail="STRIPE_WEBHOOK_SECRET não configurada")
    _stripe_pronto()

    corpo = await request.body()
    assinatura_header = request.headers.get("stripe-signature")

    try:
        evento = stripe.Webhook.construct_event(corpo, assinatura_header, settings.STRIPE_WEBHOOK_SECRET)
    except ValueError:
        raise HTTPException(status_code=400, detail="Payload inválido")
    except SignatureVerificationError:
        # Assinatura errada é o sintoma clássico de whsec do endpoint errado —
        # cada endpoint do Stripe tem o seu.
        logger.warning("Webhook do Stripe com assinatura inválida")
        raise HTTPException(status_code=400, detail="Assinatura do webhook inválida")

    tipo = evento["type"]
    evento_id = evento["id"]
    objeto = evento["data"]["object"]

    # Reserva antes de processar: o Stripe reentrega o mesmo evento quando a
    # resposta demora, e duas entregas simultâneas rodariam o trabalho em dobro.
    try:
        primeira_vez = _admin().rpc("stripe_reservar_evento", {
            "p_id": evento_id, "p_tipo": tipo,
        }).execute().data
    except Exception:
        logger.exception("Falha ao registrar o evento %s", evento_id)
        raise HTTPException(status_code=503, detail="Banco indisponível")

    if not primeira_vez:
        return {"status": "duplicado", "evento": evento_id}

    try:
        if tipo == "checkout.session.completed":
            resultado = _do_checkout(objeto)
        elif tipo in {"customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"}:
            resultado = _da_assinatura(objeto)
        elif tipo in {"invoice.paid", "invoice.payment_succeeded"}:
            resultado = _da_fatura(objeto, "active")
        elif tipo == "invoice.payment_failed":
            resultado = _da_fatura(objeto, "past_due")
        else:
            resultado = {"ok": False, "motivo": "tipo_nao_tratado"}
    except Exception:
        # Solta a reserva para que a reentrega do Stripe encontre o caminho
        # livre — do contrário o evento ficaria marcado como processado tendo
        # falhado, e a clínica pagaria sem o acesso abrir.
        try:
            _admin().table("stripe_events").delete().eq("id", evento_id).execute()
        except Exception:
            logger.exception("Falha ao liberar a reserva do evento %s", evento_id)
        logger.exception("Falha ao processar o evento %s (%s)", evento_id, tipo)
        raise HTTPException(status_code=500, detail="Falha ao processar evento")

    if not resultado.get("ok"):
        # 200 mesmo assim: evento do outro produto da conta não é erro, e
        # devolver 4xx/5xx faria o Stripe reentregar para sempre.
        logger.info("Evento %s (%s) sem efeito: %s", evento_id, tipo, resultado.get("motivo"))

    return {"status": "ok", "evento": evento_id, "resultado": resultado}
