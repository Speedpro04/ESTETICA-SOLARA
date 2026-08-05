import time
from collections import defaultdict
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from supabase import create_client
from ..services.ai_service import chat_with_solara
from ..services.auth_guard import require_clinic_user
from ..config import settings

router = APIRouter(prefix="/api/ai", tags=["ai"])

# Rate-limit simples em memória para proteger a cota da OpenAI contra abuso.
# Janela deslizante: no máximo RATE_LIMIT_MAX requisições por IP a cada RATE_LIMIT_WINDOW segundos.
RATE_LIMIT_MAX = 20
RATE_LIMIT_WINDOW = 60
_rate_hits: dict[str, list[float]] = defaultdict(list)


def _check_rate_limit(client_ip: str) -> None:
    now = time.time()
    # Poda IPs antigos para o dicionário não crescer indefinidamente.
    if len(_rate_hits) > 1000:
        for ip in [ip for ip, hits in _rate_hits.items() if not hits or now - hits[-1] > RATE_LIMIT_WINDOW]:
            _rate_hits.pop(ip, None)
    hits = [t for t in _rate_hits[client_ip] if now - t < RATE_LIMIT_WINDOW]
    if len(hits) >= RATE_LIMIT_MAX:
        raise HTTPException(status_code=429, detail="Muitas mensagens em pouco tempo. Aguarde alguns segundos.")
    hits.append(now)
    _rate_hits[client_ip] = hits

# Cliente admin (service role) para ler os dados reais da clínica e injetar no cérebro da Solara.
_supabase_admin = None
if settings.SUPABASE_URL and (settings.SUPABASE_SERVICE_ROLE_KEY or settings.SUPABASE_KEY):
    try:
        _supabase_admin = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_ROLE_KEY or settings.SUPABASE_KEY
        )
    except Exception:
        _supabase_admin = None


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    phone: str = None  # Telefone opcional para contexto futuro
    clinic_id: str = None  # Opcional: permite carregar os dados reais da clínica
    chat_history: list[ChatMessage] | None = None


def _load_clinic_knowledge(clinic_id: str | None) -> list[dict]:
    """Carrega a base de conhecimento da clínica (serviços, preços, horários, convênios, FAQ).

    Este é o ponto de encaixe do RAG (fase 2): hoje carregamos todas as entradas
    ativas da clínica e injetamos no contexto. Quando o conhecimento crescer, basta
    trocar esta consulta por uma busca top-k por similaridade (pgvector), mantendo a
    mesma assinatura de retorno (lista de {kind, title, content}).
    """
    if not clinic_id or not _supabase_admin:
        return []
    try:
        res = (
            _supabase_admin.table("clinic_knowledge")
            .select("kind, title, content, priority")
            .eq("clinic_id", clinic_id)
            .eq("active", True)
            .order("priority", desc=True)
            .limit(200)
            .execute()
        )
        return res.data or []
    except Exception:
        # Tabela ainda não criada ou indisponível: segue sem conhecimento extra.
        return []


def _load_clinic_context(clinic_id: str | None) -> dict | None:
    """Busca, de forma defensiva, os dados reais da clínica para o contexto da Solara."""
    if not clinic_id or not _supabase_admin:
        return None
    try:
        clinic_res = _supabase_admin.table("clinics").select(
            "name, phone, email, address"
        ).eq("id", clinic_id).limit(1).execute()
        if not clinic_res.data:
            return None
        ctx = dict(clinic_res.data[0])

        # Profissionais SEMPRE filtrados pela clínica. Sem fallback global:
        # carregar especialistas de outras clínicas vazaria dados entre tenants.
        try:
            sp_res = (
                _supabase_admin.table("specialists")
                .select("name, specialty")
                .eq("active", True)
                .eq("clinic_id", clinic_id)
                .limit(50)
                .execute()
            )
            ctx["specialists"] = sp_res.data or []
        except Exception:
            ctx["specialists"] = []

        # Base de conhecimento da clínica (o "poder" da Solara para responder de verdade).
        ctx["knowledge"] = _load_clinic_knowledge(clinic_id)

        return ctx
    except Exception:
        # Nunca derruba o atendimento por causa do contexto — a Solara opera com guardrails.
        return None


@router.post("/chat")
async def chat_endpoint(request: ChatRequest, http_request: Request):
    """
    Endpoint para interagir com a Solara IA (gestora de atendimento).
    """
    client_ip = (http_request.client.host if http_request.client else "unknown")
    _check_rate_limit(client_ip)

    # Carregar dados reais de uma clínica exige usuário autenticado DESSA clínica.
    # Sem isso, qualquer um extrairia a base de conhecimento (preços, políticas,
    # profissionais) de qualquer clínica informando o clinic_id.
    if request.clinic_id:
        user = require_clinic_user(http_request)
        if str(user["clinic_id"]) != str(request.clinic_id):
            raise HTTPException(status_code=403, detail="Acesso negado para esta clínica")

    try:
        history = [message.model_dump() for message in request.chat_history] if request.chat_history else None
        clinic_context = _load_clinic_context(request.clinic_id)
        # Só se apresenta se ainda não houver nenhuma resposta dela no histórico desta conversa.
        should_introduce = not any(
            str((m or {}).get("role", "")).lower() == "assistant" for m in (history or [])
        )
        response_text = await chat_with_solara(request.message, history, clinic_context, should_introduce)
        return {
            "status": "success",
            "solara_response": response_text
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro na IA: {str(e)}")
