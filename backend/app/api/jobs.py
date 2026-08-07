"""Rotinas periódicas: follow-up e expiração de handoff.

Endpoint em vez de worker porque o estado já vive no banco. Quem chama é um
agendador externo (pg_cron do Supabase, ou o cron da hospedagem) batendo aqui a
cada 15 minutos — sem Redis, sem Celery beat, sem mais um processo para
monitorar, cair de madrugada e pagar.

A proteção é um segredo compartilhado. Sem ele, qualquer um dispara a régua de
follow-up da base inteira quantas vezes quiser — e cada disparo fora da janela
de 24h é uma conversa cobrada pela Meta. É um endpoint que gasta dinheiro.
"""
import hmac
import logging

from fastapi import APIRouter, Header, HTTPException

from ..agents import followup
from ..config import settings

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


def _autorizar(token: str | None) -> None:
    if not settings.JOBS_SECRET:
        # Fail-closed em produção: melhor a rotina não rodar do que rodar aberta.
        if settings.ENVIRONMENT == "production":
            logging.error("JOBS_SECRET ausente em produção; rotina recusada.")
            raise HTTPException(status_code=503, detail="Rotina não configurada")
        logging.warning("JOBS_SECRET não configurado — rotina SEM autenticação (apenas dev).")
        return

    # compare_digest: comparação comum vaza o segredo pelo tempo de resposta.
    if not token or not hmac.compare_digest(token, settings.JOBS_SECRET):
        raise HTTPException(status_code=401, detail="Token inválido")


@router.post("/follow-up")
async def rodar_follow_up(x_job_token: str | None = Header(default=None)):
    """Dispara o follow-up de quem está vencido na régua."""
    _autorizar(x_job_token)
    return await followup.processar_fila()


@router.post("/handoff-timeout")
async def rodar_timeout_handoff(x_job_token: str | None = Header(default=None)):
    """Devolve à IA as conversas em que ninguém assumiu no prazo."""
    _autorizar(x_job_token)
    return followup.expirar_handoffs()


@router.post("/ciclo")
async def rodar_ciclo(x_job_token: str | None = Header(default=None)):
    """As duas rotinas numa chamada só — é este que o cron agenda.

    A ordem importa: expirar handoff ANTES do follow-up. Uma conversa devolvida à
    IA volta a ser elegível para reengajamento, e rodar na ordem inversa a
    deixaria parada mais um ciclo inteiro.
    """
    _autorizar(x_job_token)
    handoffs = followup.expirar_handoffs()
    follow = await followup.processar_fila()
    return {"handoff_timeout": handoffs, "follow_up": follow}
