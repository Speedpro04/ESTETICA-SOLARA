from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from .config import settings
from .api import stripe, meta_webhook, ai, jobs

app = FastAPI(
    title="Solara Connect API",
    description="Time de agentes de IA para clínicas de estética e plástica",
    version="2.0.0"
)

# Origens confiáveis: domínios oficiais + FRONTEND_URL + extras via CORS_ORIGINS.
# Em desenvolvimento, libera também o Vite local.
def _allowed_origins() -> list[str]:
    origins = {
        "https://solaraestetica.online",
        "https://www.solaraestetica.online",
        "https://app.solaraestetica.online",
    }
    if settings.FRONTEND_URL:
        origins.add(settings.FRONTEND_URL.rstrip("/"))
    for extra in settings.CORS_ORIGINS.split(","):
        extra = extra.strip().rstrip("/")
        if extra:
            origins.add(extra)
    if settings.ENVIRONMENT != "production":
        # 5173 é o padrão do Vite; 7777 é a porta usada no desenvolvimento local
        # deste projeto (.claude/launch.json) e 7788 serve o build pré-renderizado.
        origins.update({
            "http://localhost:5173", "http://127.0.0.1:5173",
            "http://localhost:7777", "http://127.0.0.1:7777",
            "http://localhost:7788", "http://127.0.0.1:7788",
        })
    return sorted(origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Incluir rotas
app.include_router(stripe.router)
app.include_router(meta_webhook.router)
app.include_router(jobs.router)
app.include_router(ai.router)

@app.get("/")
async def root():
    return {"message": "Solara Connect API", "status": "online"}

@app.get("/health")
async def health_check():
    """Checagem das dependências que, faltando, quebram o atendimento.

    Redis saiu: o follow-up passou a ser fila no banco (vw_pending_followups)
    lida por agendador externo, então não há mais broker para monitorar.
    """
    from .services.supabase_service import supabase_client

    banco = "disconnected"
    try:
        supabase_client.table("plans").select("id").limit(1).execute()
        banco = "connected"
    except Exception:
        banco = "disconnected"

    return {
        "status": "healthy" if banco == "connected" else "degraded",
        "supabase": banco,
        "openai_model": settings.MODEL_LLM,
        # Sem estes dois, o webhook da Meta recusa tudo em produção.
        "meta_webhook": bool(settings.META_APP_SECRET and settings.META_VERIFY_TOKEN),
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
