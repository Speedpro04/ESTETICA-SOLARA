import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent.parent

load_dotenv(PROJECT_ROOT / ".env")
load_dotenv(BASE_DIR / ".env", override=True)

class Settings:
    # Supabase
    SUPABASE_URL = os.getenv("SUPABASE_URL", "")
    SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
    SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    # Chave usada pelo client do backend (servidor confiável). Precisa escrever no
    # banco (persistir mensagens, criar pacientes) sem esbarrar no RLS, então usa o
    # service role por padrão. Mantém SUPABASE_KEY como override explícito se definido.
    SUPABASE_KEY = (
        os.getenv("SUPABASE_KEY")
        or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("SUPABASE_ANON_KEY", "")
    )

    # Database URL (Supabase connection string)
    DATABASE_URL = os.getenv("DATABASE_URL", "")

    # Redis (Supabase ou Redis Cloud)
    REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

    # JWT (Supabase Auth usa JWT próprio)
    JWT_SECRET = os.getenv("JWT_SECRET", "")
    ALGORITHM = os.getenv("ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))

    # WhatsApp — Meta Cloud API (oficial)
    # Um App da Meta atende todas as clínicas (modelo Tech Provider): o segredo e
    # o verify token são globais, e o que distingue a clínica é o phone_number_id
    # que chega no webhook.
    META_APP_SECRET = os.getenv("META_APP_SECRET", "")
    META_VERIFY_TOKEN = os.getenv("META_VERIFY_TOKEN", "")
    META_GRAPH_VERSION = os.getenv("META_GRAPH_VERSION", "v23.0")
    META_GRAPH_URL = os.getenv("META_GRAPH_URL", "https://graph.facebook.com")
    # Token de System User usado para enviar. Por número, o valor real vem do
    # gerenciador de segredos (wa_phone_numbers.access_token_ref); este é o
    # padrão para a operação de número único.
    META_ACCESS_TOKEN = os.getenv("META_ACCESS_TOKEN", "")

    # Rotinas periódicas (follow-up e timeout de handoff). Chamadas por agendador
    # externo em /api/jobs/ciclo. Segredo obrigatório em produção: é um endpoint
    # que gasta dinheiro — cada follow-up fora da janela de 24h é conversa paga.
    JOBS_SECRET = os.getenv("JOBS_SECRET", "")

    # SSL/HTTPS
    SSL_CERTFILE = os.getenv("SSL_CERTFILE", "")
    SSL_KEYFILE = os.getenv("SSL_KEYFILE", "")
    USE_SSL = os.getenv("USE_SSL", "false").lower() == "true"

    # Frontend URL (for checkout redirects)
    FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
    BACKEND_PUBLIC_URL = os.getenv("BACKEND_PUBLIC_URL", "")
    EVOLUTION_WEBHOOK_SECRET = os.getenv("EVOLUTION_WEBHOOK_SECRET", "")

    # Stripe
    STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
    STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
    
    # Stripe Price IDs
    STRIPE_PRICE_BASICO = os.getenv("STRIPE_PRICE_BASICO", "")
    STRIPE_PRICE_CRESCIMENTO = os.getenv("STRIPE_PRICE_CRESCIMENTO", "")
    STRIPE_PRICE_AVANCADO = os.getenv("STRIPE_PRICE_AVANCADO", "")
    STRIPE_PRICE_ENTERPRISE = os.getenv("STRIPE_PRICE_ENTERPRISE", "")

    # OpenAI AI (LLM principal)
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
    OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    MODEL_LLM = os.getenv("OPENAI_MODEL", "gpt-5-mini")

    # Maintenance / Dev Pass
    ENABLE_DEV_PASS = os.getenv("ENABLE_DEV_PASS", "false").lower() == "true"
    DEV_PASS_SECRET = os.getenv("DEV_PASS_SECRET", "")

    # Ambiente de execução ("development" | "production"). Em produção, proteções
    # como o token do webhook da Evolution passam a ser obrigatórias (fail-closed).
    ENVIRONMENT = os.getenv("ENVIRONMENT", "development").strip().lower()

    # Origens extras permitidas no CORS (separadas por vírgula), além do FRONTEND_URL.
    CORS_ORIGINS = os.getenv("CORS_ORIGINS", "")

settings = Settings()
