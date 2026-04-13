# @ai-context Railway-ready Hermes admin service.
# Multi-stage build: React frontend + Python backend.

# Stage 1: Build React frontend
FROM node:22-alpine AS frontend-build
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Python runtime
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

COPY requirements.txt ./

RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir \
        "hermes-agent[messaging,cron] @ git+https://github.com/nousresearch/hermes-agent.git@${HERMES_REF}"

COPY server.py gateway_manager.py hermes_config.py database.py backup_manager.py chat_proxy.py ./
COPY start.sh ./
COPY static ./static
COPY templates ./templates
COPY --from=frontend-build /build/dist ./frontend/dist

RUN chmod +x /app/start.sh && mkdir -p /data/.hermes

RUN groupadd --system hermes \
    && useradd --system --gid hermes --create-home hermes \
    && chown -R hermes:hermes /data

USER hermes

EXPOSE 8080

CMD ["/app/start.sh"]
