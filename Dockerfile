# syntax=docker/dockerfile:1.6
# Hermes Workspace — all-in-one production image
#
# Bundles:
#   • hermes-workspace  (Node.js UI, TanStack Start SSR)
#   • hermes-agent      (gateway on :8642)
#   • codex-adapter     (Codex CLI → OpenAI-compat API on :8645)
#   • @openai/codex     (CLI binary)
#
# Build:
#   docker build -t hermes .
# Run:
#   docker run -p 3000:3000 -e OPENAI_API_KEY=sk-... -v hermes-data:/data hermes

# ── Stage 1: build the workspace UI ──────────────────────────────────────────
FROM node:22-slim AS build

RUN corepack enable \
    && apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cache-friendly: install deps before copying sources
COPY package.json pnpm-lock.yaml* .npmrc* ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM python:3.11-slim

ARG HERMES_REF=v2026.4.23
ARG CODEX_NPM_PACKAGE=@openai/codex@latest

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=3000 \
    HERMES_HOME=/data/.hermes \
    CODEX_HOME=/data/.hermes/.codex \
    CODEX_UNSAFE_ALLOW_NO_SANDBOX=1 \
    CODEX_CLI_SANDBOX=none \
    API_SERVER_ENABLED=true \
    API_SERVER_HOST=127.0.0.1 \
    DISCORD_COMMAND_SYNC_POLICY=off

# Route workspace core chat/models traffic to the OpenAI-compatible codex adapter.
# Enhanced APIs (sessions, skills, config, jobs) are served separately by the dashboard.
ENV HERMES_API_URL=http://127.0.0.1:8645 \
    HERMES_DASHBOARD_URL=http://127.0.0.1:9119 \
    HERMES_WEB_DIST=/opt/hermes-agent/hermes_cli/web_dist \
    GATEWAY_HEALTH_URL=http://127.0.0.1:8642/health/detailed

WORKDIR /app

# ── Install Node.js 22 + system utilities ─────────────────────────────────────
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        curl ca-certificates tini gnupg git \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
        | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" \
        > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# ── Install @openai/codex CLI globally ────────────────────────────────────────
RUN npm install --global "$CODEX_NPM_PACKAGE" \
    && npm cache clean --force \
    && codex --version

# ── Install hermes-agent + codex-adapter Python deps ─────────────────────────
COPY codex_adapter/requirements.txt /tmp/adapter-requirements.txt
RUN pip install --no-cache-dir \
        git+https://github.com/nousresearch/hermes-agent.git@${HERMES_REF} \
    && git clone --depth 1 --branch "${HERMES_REF}" https://github.com/nousresearch/hermes-agent.git /opt/hermes-agent \
    && cd /opt/hermes-agent/web \
    && npm install --silent \
    && npm run build \
    && pip install --no-cache-dir -e "/opt/hermes-agent[web,messaging,cron]" \
    && pip install --no-cache-dir -r /tmp/adapter-requirements.txt

# ── Copy workspace build artefacts ───────────────────────────────────────────
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server-entry.js ./server-entry.js
COPY --from=build /app/public ./public
COPY --from=build /app/skills ./skills

# ── Copy adapter + bridge + entrypoint ───────────────────────────────────────
COPY codex_adapter/ ./codex_adapter/
COPY codex_cli_bridge.py ./
COPY start.sh ./

RUN chmod +x /app/start.sh

# Run as root so Railway volume mounts under /data are writable.
# Railway mounts volumes as root-owned at container start, after Dockerfile
# chown/mkdir steps would have run — so non-root users can never mkdir there.

EXPOSE 3000

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/app/start.sh"]
