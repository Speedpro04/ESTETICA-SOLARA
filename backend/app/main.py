from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from .config import settings
from .celery_app import celery_app
from .api import stripe, evolution, whatsapp, ai

app = FastAPI(
    title="Axos Hub API",
    description="API para Gestão de Clínicas Médicas",
    version="1.0.0"
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
app.include_router(evolution.router)
app.include_router(whatsapp.router)
app.include_router(ai.router)

@app.get("/")
async def root():
    return {"message": "Axos Hub API", "status": "online"}

@app.get("/health")
async def health_check():
    # Testa o Redis de verdade (em vez de reportar "connected" fixo).
    redis_status = "disconnected"
    try:
        import redis
        r = redis.from_url(settings.REDIS_URL, socket_connect_timeout=2)
        if r.ping():
            redis_status = "connected"
    except Exception:
        redis_status = "disconnected"

    return {
        "status": "healthy",
        "redis": redis_status,
        "openai_model": settings.MODEL_LLM,
        "evolution_instance": settings.EVOLUTION_INSTANCE,
    }

@app.get("/api/clinics")
async def list_clinics():
    return {"clinics": []}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
