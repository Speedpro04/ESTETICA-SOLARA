# Backend Axos Hub - Setup Guide

## Stack
- **FastAPI** - API REST
- **Supabase** - PostgreSQL + Auth + Realtime
- **Redis** - Filas e Cache
- **Celery** - Tarefas assíncronas
- **Evolution API** - WhatsApp integration
- **Nginx** - Reverse proxy com SSL

## Configuração do Supabase

1. Crie um projeto em https://supabase.com

2. No SQL Editor, execute o arquivo `supabase_setup.sql`

3. Pegue as chaves em Settings > API:
   - Project URL
   - API keys (anon e service_role)

4. Copie a connection string em Settings > Database

## Configuração do Ambiente

```bash
# Copie o arquivo de exemplo
cp .env.example .env

# Edite com suas chaves do Supabase
```

## Rodar com Docker

```bash
docker-compose up -d
```

## SSL/HTTPS (Produção)

1. Gere certificados:
```bash
mkdir -p certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout certs/key.pem \
  -out certs/cert.pem \
  -subj "/C=BR/ST=SP/L=SaoPaulo/O=Axos/CN=seu-dominio.com"
```

2. No `.env`, defina:
```
USE_SSL=true
SSL_CERTFILE=/etc/nginx/certs/cert.pem
SSL_KEYFILE=/etc/nginx/certs/key.pem
```

## Tarefas Celery

O Celery processa:
- Envio de mensagens WhatsApp (Evolution API)
- Lembretes de consultas
- Relatórios diários

```bash
# Worker
celery -A app.celery_app worker -l info

# Beat (agendamento)
celery -A app.celery_app beat -l info
```
