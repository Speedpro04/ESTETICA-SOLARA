"""Validação de identidade para endpoints sensíveis do backend.

Todo endpoint que executa ação em nome de uma clínica (conectar WhatsApp,
consultar a Solara com dados da clínica, etc.) precisa de um JWT válido do
Supabase Auth E do vínculo do usuário com a clínica em questão.
"""
import logging
from fastapi import HTTPException, Request
from supabase import create_client
from ..config import settings

_admin_client = None


def get_admin_client():
    """Client com service role (lazy) para validar tokens e consultar vínculos."""
    global _admin_client
    if _admin_client is None:
        key = settings.SUPABASE_SERVICE_ROLE_KEY or settings.SUPABASE_KEY
        if settings.SUPABASE_URL and key:
            try:
                _admin_client = create_client(settings.SUPABASE_URL, key)
            except Exception:
                logging.exception("Falha ao criar client admin do Supabase")
                _admin_client = None
    return _admin_client


def require_clinic_user(request: Request) -> dict:
    """Valida o Bearer token do Supabase e retorna o vínculo do usuário.

    Retorna {"auth_id", "clinic_id", "role"} ou levanta HTTPException.
    """
    admin = get_admin_client()
    if admin is None:
        raise HTTPException(status_code=503, detail="Autenticação indisponível (Supabase não configurado)")

    auth_header = request.headers.get("authorization") or ""
    if not auth_header.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Authorization Bearer token obrigatório")
    token = auth_header.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Token ausente")

    try:
        auth_user = admin.auth.get_user(token)
        auth_id = getattr(getattr(auth_user, "user", None), "id", None)
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido ou expirado")
    if not auth_id:
        raise HTTPException(status_code=401, detail="Usuário não autenticado")

    try:
        res = admin.table("users").select("clinic_id, role").eq("auth_id", auth_id).limit(1).execute()
    except Exception:
        logging.exception("Falha ao consultar vínculo do usuário %s", auth_id)
        raise HTTPException(status_code=503, detail="Falha ao validar usuário")

    if not res.data or not res.data[0].get("clinic_id"):
        raise HTTPException(status_code=403, detail="Usuário sem clínica vinculada")

    return {
        "auth_id": auth_id,
        "clinic_id": res.data[0]["clinic_id"],
        "role": res.data[0].get("role"),
    }


def require_instance_access(user: dict, instance_name: str) -> None:
    """Garante que a instância de WhatsApp pertence à clínica do usuário.

    Aceita o padrão de nome usado pelo frontend (solara_<8 primeiros chars do
    clinic_id>) ou o whatsapp_instance_id registrado na clínica.
    """
    clinic_id = str(user.get("clinic_id") or "")
    if clinic_id and instance_name == f"solara_{clinic_id[:8]}":
        return

    admin = get_admin_client()
    if admin is not None and clinic_id:
        try:
            res = (
                admin.table("clinics")
                .select("id")
                .eq("id", clinic_id)
                .eq("whatsapp_instance_id", instance_name)
                .limit(1)
                .execute()
            )
            if res.data:
                return
        except Exception:
            logging.info("Coluna whatsapp_instance_id indisponível ao validar %s", instance_name)

    raise HTTPException(status_code=403, detail="Instância não pertence à sua clínica")
