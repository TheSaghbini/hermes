# @ai-context Railway-ready Hermes admin service.
# Installs the lightweight admin wrapper plus the upstream Hermes CLI.

FROM python:3.12-slim

ARG HERMES_REF=v2026.4.8

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080 \
    HERMES_HOME=/data/.hermes \
    HERMES_AUTO_START=true

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./requirements.txt

RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir \
        "hermes-agent[messaging,cron] @ git+https://github.com/nousresearch/hermes-agent.git@${HERMES_REF}"

COPY server.py ./server.py
COPY gateway_manager.py ./gateway_manager.py
COPY hermes_config.py ./hermes_config.py
COPY start.sh ./start.sh
COPY static ./static
COPY templates ./templates

RUN chmod +x /app/start.sh \
    && mkdir -p /data/.hermes

RUN groupadd --system hermes \
    && useradd --system --gid hermes --create-home hermes \
    && chown -R hermes:hermes /data

USER hermes

EXPOSE 8080

CMD ["/app/start.sh"]
