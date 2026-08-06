"""
Stripe API - Pagamentos e Assinaturas
"""
from typing import Any, Dict, Optional, Set
from urllib.parse import urlparse
from datetime import datetime, timezone
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel, HttpUrl
from supabase import create_client
import stripe
# Compatibilidade: a partir do stripe-python v8+ os erros saíram de stripe.error
# e passaram para o nível superior do pacote (stripe.SignatureVerificationError).
try:
    from stripe.error import SignatureVerificationError, InvalidRequestError
except ImportError:
    from stripe import SignatureVerificationError, InvalidRequestError
import os
from app.config import settings

router = APIRouter(prefix="/api/stripe", tags=["stripe"])

# Configurar Stripe
stripe.api_key = settings.STRIPE_SECRET_KEY
webhook_secret = settings.STRIPE_WEBHOOK_SECRET
supabase_service_key = settings.SUPABASE_SERVICE_ROLE_KEY or settings.SUPABASE_KEY
supabase_admin = create_client(settings.SUPABASE_URL, supabase_service_key) if settings.SUPABASE_URL and supabase_service_key else None


class CheckoutSessionRequest(BaseModel):
    price_id: str
    success_url: Optional[HttpUrl] = None
    cancel_url: Optional[HttpUrl] = None
    metadata: Optional[Dict[str, Any]] = None


MANAGED_SUBSCRIPTION_STATUSES = {"pending", "active", "trialing", "past_due", "unpaid", "canceled", "incomplete", "incomplete_expired"}


def _allowed_price_ids() -> Set[str]:
    return {
        pid for pid in [
            settings.STRIPE_PRICE_BASICO,
            settings.STRIPE_PRICE_CRESCIMENTO,
            settings.STRIPE_PRICE_AVANCADO,
            settings.STRIPE_PRICE_ENTERPRISE,
            os.getenv("STRIPE_PRICE_STARTER", ""),
            os.getenv("STRIPE_PRICE_PROFESSIONAL", ""),
            os.getenv("STRIPE_PRICE_ENTERPRISE", ""),
        ] if pid
    }


def _is_allowed_redirect_url(url: str) -> bool:
    if not url:
        return False
    try:
        target = urlparse(url)
        frontend = urlparse(settings.FRONTEND_URL)
    except Exception:
        return False
    return target.scheme in {"http", "https"} and target.netloc == frontend.netloc


def _extract_period_dates(subscription_obj: Dict[str, Any]) -> Dict[str, Optional[str]]:
    current_period_start = subscription_obj.get("current_period_start")
    current_period_end = subscription_obj.get("current_period_end")
    return {
        "current_period_start": datetime.fromtimestamp(current_period_start, tz=timezone.utc).isoformat() if current_period_start else None,
        "current_period_end": datetime.fromtimestamp(current_period_end, tz=timezone.utc).isoformat() if current_period_end else None,
    }


def _require_owner_access(request: Request, clinic_id: str, user_email: str) -> str:
    auth_header = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth_header or not auth_header.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Authorization Bearer token obrigatório")
    token = auth_header.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Token ausente")

    try:
        auth_user = supabase_admin.auth.get_user(token)
        auth_user_id = getattr(auth_user, "user", None).id if getattr(auth_user, "user", None) else None
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido")

    if not auth_user_id:
        raise HTTPException(status_code=401, detail="Usuário não autenticado")

    owner_check = supabase_admin.table("clinics").select("id").eq("id", clinic_id).eq("owner_auth_id", auth_user_id).limit(1).execute()
    if not owner_check.data:
        raise HTTPException(status_code=403, detail="Acesso negado para esta clínica")

    # Protege contra spoof de e-mail em metadata
    user_check = supabase_admin.table("users").select("id").eq("auth_id", auth_user_id).eq("clinic_id", clinic_id).eq("email", user_email).limit(1).execute()
    if not user_check.data:
        raise HTTPException(status_code=403, detail="Dados de usuário inconsistentes")

    return auth_user_id

@router.post("/webhook")
async def stripe_webhook(request: Request):
    """
    Webhook para eventos do Stripe
    - checkout.session.completed
    - invoice.payment_succeeded
    - customer.subscription.updated
    """
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    if not webhook_secret:
        raise HTTPException(status_code=500, detail="STRIPE_WEBHOOK_SECRET não configurada")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, webhook_secret
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid webhook payload")
    except SignatureVerificationError as e:
        raise HTTPException(status_code=400, detail="Webhook signature verification failed")

    # Processar evento
    event_type = event["type"]

    if event_type == "checkout.session.completed":
        session = event["data"]["object"]
        await handle_checkout_completed(session)

    elif event_type == "invoice.payment_succeeded":
        invoice = event["data"]["object"]
        subscription_id = invoice.get("subscription")
        if subscription_id and supabase_admin:
            supabase_admin.table("subscriptions").update({"status": "active"}).eq("stripe_subscription_id", subscription_id).execute()

    elif event_type == "invoice.payment_failed":
        invoice = event["data"]["object"]
        subscription_id = invoice.get("subscription")
        if subscription_id and supabase_admin:
            supabase_admin.table("subscriptions").update({"status": "past_due"}).eq("stripe_subscription_id", subscription_id).execute()

    elif event_type == "customer.subscription.updated":
        subscription = event["data"]["object"]
        await handle_subscription_updated(subscription)

    elif event_type == "customer.subscription.deleted":
        subscription = event["data"]["object"]
        await handle_subscription_deleted(subscription)

    return {"status": "success"}

@router.post("/create-checkout-session")
async def create_checkout_session(payload: CheckoutSessionRequest, request: Request):
    """
    Criar sessão de checkout do Stripe
    """
    if not stripe.api_key:
        raise HTTPException(status_code=500, detail="STRIPE_SECRET_KEY não configurada")

    metadata = payload.metadata or {}
    clinic_id = str(metadata.get("clinic_id") or "").strip()
    user_email = str(metadata.get("user_email") or "").strip()
    if not clinic_id or not user_email:
        raise HTTPException(status_code=400, detail="clinic_id e user_email são obrigatórios")

    allowed_prices = _allowed_price_ids()
    if payload.price_id not in allowed_prices:
        raise HTTPException(status_code=400, detail="price_id não autorizado")

    success_url = str(payload.success_url or f"{settings.FRONTEND_URL}?checkout=success&session_id={{CHECKOUT_SESSION_ID}}")
    cancel_url = str(payload.cancel_url or f"{settings.FRONTEND_URL}?checkout=cancel")
    if not _is_allowed_redirect_url(success_url) or not _is_allowed_redirect_url(cancel_url):
        raise HTTPException(status_code=400, detail="URL de redirecionamento inválida")

    if not supabase_admin:
        raise HTTPException(status_code=500, detail="Supabase admin indisponível")

    _require_owner_access(request, clinic_id, user_email)

    # Validação server-side do vínculo clínica/preço
    clinic_result = supabase_admin.table("clinics").select("id, email, plan_id").eq("id", clinic_id).limit(1).execute()
    if not clinic_result.data:
        raise HTTPException(status_code=404, detail="Clínica não encontrada")

    plan_result = supabase_admin.table("plans").select("id, stripe_price_id, active").eq("id", clinic_result.data[0]["plan_id"]).limit(1).execute()
    if not plan_result.data or not plan_result.data[0].get("active"):
        raise HTTPException(status_code=400, detail="Plano da clínica inválido")
    if plan_result.data[0].get("stripe_price_id") != payload.price_id:
        raise HTTPException(status_code=400, detail="Preço não corresponde ao plano da clínica")

    try:
        import time
        expires_at = int(time.time() + 3600)  # Expira em 1 hora (3600 segundos)
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{"price": payload.price_id, "quantity": 1}],
            mode="subscription",
            success_url=success_url,
            cancel_url=cancel_url,
            metadata=metadata,
            subscription_data={"metadata": metadata},
            expires_at=expires_at,
        )
        return {"session_id": session.id, "url": session.url}
    except InvalidRequestError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/prices")
async def get_prices():
    """
    Retorna os preços configurados
    """
    return {
        "starter": os.getenv("STRIPE_PRICE_STARTER"),
        "professional": os.getenv("STRIPE_PRICE_PROFESSIONAL"),
        "enterprise": os.getenv("STRIPE_PRICE_ENTERPRISE"),
    }

# Handlers
async def handle_checkout_completed(session: dict):
    """
    Processar checkout completado
    - customer_id: ID do cliente no Stripe
    - subscription_id: ID da assinatura
    - metadata: dados personalizados
    """
    customer_id = session.get("customer")
    subscription_id = session.get("subscription")
    metadata = session.get("metadata", {})

    # Payment Links enviam o clinic_id via client_reference_id (fallback do metadata)
    clinic_id = metadata.get("clinic_id") or session.get("client_reference_id")
    user_email = metadata.get("user_email") or session.get("customer_details", {}).get("email")
    plan_name = metadata.get("plan_name")
    plan_price = metadata.get("plan_price")

    if not supabase_admin or not clinic_id or not subscription_id:
        return

    stripe_subscription = stripe.Subscription.retrieve(subscription_id)
    period_dates = _extract_period_dates(stripe_subscription)

    # Ativar assinatura pendente para clínica (idempotente)
    update_payload = {
        "status": "active",
        "stripe_subscription_id": subscription_id,
        "stripe_customer_id": customer_id,
        "current_period_start": period_dates["current_period_start"],
        "current_period_end": period_dates["current_period_end"],
    }
    supabase_admin.table("subscriptions").update(update_payload).eq("clinic_id", clinic_id).eq("status", "pending").execute()
    # Fallback: se não havia pending, garante consistência pelo subscription_id
    supabase_admin.table("subscriptions").update(update_payload).eq("clinic_id", clinic_id).eq("stripe_subscription_id", subscription_id).execute()

    # Marcar onboarding concluído
    supabase_admin.table("clinics").update({
        "onboarding_completed": True
    }).eq("id", clinic_id).execute()

    # Registrar log de envio de e-mail (se a tabela existir)
    if user_email:
        try:
            supabase_admin.table("email_logs").insert({
                "clinic_id": clinic_id,
                "to_email": user_email,
                "from_email": "contato@solaraestetica.online",
                "subject": f"Assinatura ativada - Plano {plan_name or 'Solara Connect'}",
                "template": "welcome",
                "status": "sent",
                "metadata": {
                    "plan": plan_name,
                    "price": plan_price,
                    "stripe_subscription_id": subscription_id
                }
            }).execute()
        except Exception:
            pass


async def handle_subscription_updated(subscription: dict):
    if not supabase_admin:
        return
    subscription_id = subscription.get("id")
    status = str(subscription.get("status") or "").lower()
    if not subscription_id or status not in MANAGED_SUBSCRIPTION_STATUSES:
        return
    period_dates = _extract_period_dates(subscription)
    supabase_admin.table("subscriptions").update({
        "status": status,
        "current_period_start": period_dates["current_period_start"],
        "current_period_end": period_dates["current_period_end"],
    }).eq("stripe_subscription_id", subscription_id).execute()


async def handle_subscription_deleted(subscription: dict):
    if not supabase_admin:
        return
    subscription_id = subscription.get("id")
    if not subscription_id:
        return
    supabase_admin.table("subscriptions").update({"status": "canceled"}).eq("stripe_subscription_id", subscription_id).execute()
