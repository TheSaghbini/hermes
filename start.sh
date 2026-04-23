#!/bin/sh
# Hermes all-in-one container entrypoint.
#
# Starts three processes:
#   1. codex-adapter    — Codex CLI → OpenAI-compat API on :8645 (background)
#   2. hermes-agent     — full gateway on :8642 (background)
#   3. hermes-workspace — Node.js UI on $PORT (foreground / exec)
#
# The workspace UI is pointed at hermes-agent (:8642) via workspace-overrides.json
# so it uses sessions/skills/config/jobs in addition to chat.
#
# tini (PID 1) handles signal forwarding and zombie reaping.

set -eu

: "${HERMES_HOME:=/data/.hermes}"
: "${CODEX_HOME:=$HERMES_HOME/.codex}"

export HERMES_HOME
export CODEX_HOME

mkdir -p "$HERMES_HOME" "$CODEX_HOME"
chmod 700 "$HERMES_HOME" "$CODEX_HOME" 2>/dev/null || true

# ── Always seed workspace URL override (highest-priority) ───────────────────────
# workspace-overrides.json takes precedence over HERMES_API_URL env var.
# Without this the workspace auto-detects :8645 (codex-adapter) first and
# skips hermes-agent's full API surface (sessions/skills/config/jobs).
cat > "$HERMES_HOME/workspace-overrides.json" <<'JSON'
{
  "hermesApiUrl": "http://127.0.0.1:8642"
}
JSON
chmod 600 "$HERMES_HOME/workspace-overrides.json"

# ── First-boot: seed hermes-agent config.yaml ─────────────────────────────────
HERMES_CONFIG="$HERMES_HOME/config.yaml"
if [ ! -f "$HERMES_CONFIG" ]; then
  cat > "$HERMES_CONFIG" <<'YAML'
provider: codex-local
model: codex-cli
custom_providers:
  - name: codex-local
    base_url: http://127.0.0.1:8645/v1
    api_key: local
    api_mode: chat_completions
YAML
  echo "[start] Seeded $HERMES_CONFIG with codex-local provider"
fi

# ── First-boot: seed hermes-agent .env ────────────────────────────────────────
HERMES_ENV="$HERMES_HOME/.env"
if [ ! -f "$HERMES_ENV" ]; then
  {
    echo "API_SERVER_ENABLED=true"
    echo "API_SERVER_HOST=0.0.0.0"
    [ -n "${OPENAI_API_KEY:-}" ]  && printf 'OPENAI_API_KEY=%s\n'  "$OPENAI_API_KEY"
    [ -n "${API_SERVER_KEY:-}" ]  && printf 'API_SERVER_KEY=%s\n'  "$API_SERVER_KEY"
  } > "$HERMES_ENV"
  chmod 600 "$HERMES_ENV"
  echo "[start] Seeded $HERMES_ENV"
fi

# ── Service 1: Codex CLI adapter ──────────────────────────────────────────────
echo "[start] Starting Codex CLI adapter on :8645 ..."
python /app/codex_adapter/server.py &
ADAPTER_PID=$!

# ── Service 2: hermes-agent gateway ───────────────────────────────────────────
echo "[start] Starting hermes-agent gateway on :8642 ..."
hermes gateway run &
GATEWAY_PID=$!

# Give background services a moment to bind before the workspace connects.
sleep 2

# ── Service 3: hermes-workspace (foreground) ──────────────────────────────────
echo "[start] Starting hermes-workspace UI on :${PORT:-3000} ..."
exec node /app/server-entry.js

