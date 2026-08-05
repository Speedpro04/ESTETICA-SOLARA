from fastapi import FastAPI
from dotenv import load_dotenv
import os
from supabase import create_client, Client
from pydantic import BaseModel
from typing import Optional, List, Dict
from solara_agent import chat_with_solara

load_dotenv()

app = FastAPI(title="Solara Medical High-Tech API", version="1.0.0")

from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Inicialização Supabase
SUPABASE_URL: str = os.environ.get("SUPABASE_URL")
SUPABASE_KEY: str = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

class ChatRequest(BaseModel):
    message: str
    phone: Optional[str] = None
    chat_history: Optional[List[Dict[str, str]]] = None

@app.get("/")
def read_root():
    return {"status": "Solara Brain Online", "tech": "FastAPI + Polars + Celery"}

@app.post("/api/ai/chat")
async def chat_endpoint(request: ChatRequest):
    # Futuro: Aqui integraremos o Polars para buscar de forma ultra rápida 
    # o histórico do paciente no Supabase antes de enviar para a IA
    
    response_text = await chat_with_solara(request.message, request.chat_history)
    
    # Futuro: Aqui acionaremos o Celery para enfileirar o disparo da mensagem 
    # via Evolution API para o WhatsApp do paciente, garantindo zero travamento no servidor
    
    return {
        "status": "success",
        "solara_response": response_text
    }
