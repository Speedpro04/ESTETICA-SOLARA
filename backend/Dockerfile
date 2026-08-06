FROM python:3.11-slim

# PYTHONUNBUFFERED: sem isso o log do uvicorn fica preso no buffer e o painel do
# EasyPanel mostra a tela vazia enquanto o serviço já está de pé.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# gcc entra só para compilar wheel que não tenha binário pronto para slim.
# O postgresql-client que estava aqui foi removido: nada no código chama psql —
# o acesso ao banco é pelo cliente do Supabase, por HTTP.
RUN apt-get update && apt-get install -y --no-install-recommends gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Processo sem privilégio de root: se a aplicação for comprometida, o atacante
# não herda o container.
RUN useradd --create-home --uid 1000 solara && chown -R solara:solara /app
USER solara

EXPOSE 8000

# ${PORT:-8000}: o EasyPanel injeta PORT em alguns modos de deploy. Fixar 8000
# no CMD faria o proxy bater numa porta onde não há ninguém escutando.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
