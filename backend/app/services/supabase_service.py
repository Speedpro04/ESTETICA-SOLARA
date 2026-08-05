from supabase import create_client, Client
from ..config import settings

def get_supabase_client() -> Client:
    """
    Inicializa e retorna o cliente do Supabase
    """
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)

# Singleton para uso em tarefas síncronas (Celery)
supabase_client = get_supabase_client()
