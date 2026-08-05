from celery import Celery
from celery.schedules import crontab
from .config import settings

celery_app = Celery(
    "clinicas_celery",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_URL,
    include=["app.tasks"]
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="America/Sao_Paulo",
    enable_utc=True,
)

# Agendamento periódico (Celery beat): todo dia às 09:00 de São Paulo, dispara os
# lembretes das consultas do dia seguinte. Precisa do serviço `celery-beat` rodando.
celery_app.conf.beat_schedule = {
    "dispatch-appointment-reminders": {
        "task": "app.tasks.dispatch_appointment_reminders",
        "schedule": crontab(hour=9, minute=0),
    },
}
