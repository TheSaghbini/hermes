#!/bin/sh
# Hermes all-in-one container entrypoint.
#
# Starts four processes:
#   1. codex-adapter    — Codex CLI → OpenAI-compat API on :8645 (background)
#   2. hermes-agent     — full gateway on :8642 (background)
#   3. hermes dashboard — sessions/skills/config UI API on :9119 (background)
#   4. hermes-workspace — Node.js UI on $PORT (foreground / exec)
#
# The workspace UI is pointed at the codex-adapter for core chat/model APIs and
# at the Hermes dashboard for sessions/skills/config/jobs.
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
# In the split zero-fork setup, :8645 serves the OpenAI-compatible chat/model
# APIs while :9119 serves the enhanced Hermes dashboard APIs.
cat > "$HERMES_HOME/workspace-overrides.json" <<'JSON'
{
  "hermesApiUrl": "http://127.0.0.1:8645",
  "hermesDashboardUrl": "http://127.0.0.1:9119"
}
JSON
chmod 600 "$HERMES_HOME/workspace-overrides.json"

# ── Always normalize hermes-agent config.yaml ────────────────────────────────
# Railway persists /data across deploys, so stale config from earlier boots can
# pin Hermes to openai-codex. Force the primary model back to our local adapter.
HERMES_CONFIG="$HERMES_HOME/config.yaml"
cat > "$HERMES_CONFIG" <<'YAML'
model:
  provider: custom
  default: codex-cli
  base_url: http://127.0.0.1:8645/v1
  api_key: local
  timeout: 600
YAML
chmod 600 "$HERMES_CONFIG"
echo "[start] Wrote $HERMES_CONFIG with custom codex adapter provider"

# ── Always normalize hermes-agent .env ───────────────────────────────────────
# Railway persists /data across deploys, so stale env from an older image can
# keep API_SERVER_HOST=0.0.0.0 and block the API server unless API_SERVER_KEY
# is set. Keep the API server bound to localhost inside this all-in-one image.
HERMES_ENV="$HERMES_HOME/.env"
{
  echo "API_SERVER_ENABLED=true"
  echo "API_SERVER_HOST=127.0.0.1"
  [ -n "${OPENAI_API_KEY:-}" ]  && printf 'OPENAI_API_KEY=%s\n'  "$OPENAI_API_KEY"
  [ -n "${API_SERVER_KEY:-}" ]  && printf 'API_SERVER_KEY=%s\n'  "$API_SERVER_KEY"
} > "$HERMES_ENV"
chmod 600 "$HERMES_ENV"
echo "[start] Wrote $HERMES_ENV"

# ── Service 1: Codex CLI adapter ──────────────────────────────────────────────
echo "[start] Starting Codex CLI adapter on :8645 ..."
python /app/codex_adapter/server.py &
ADAPTER_PID=$!

# ── Service 2: hermes-agent gateway ───────────────────────────────────────────
echo "[start] Starting hermes-agent gateway on :8642 ..."
hermes gateway run &
GATEWAY_PID=$!

# ── Service 3: hermes dashboard ───────────────────────────────────────────────
echo "[start] Starting hermes dashboard on :9119 ..."
python - <<'PY' &
from hermes_cli.web_server import start_server

start_server(host="127.0.0.1", port=9119, open_browser=False)
PY
DASHBOARD_PID=$!

# Give background services a moment to bind before the workspace connects.
sleep 2

# ── Service 4: hermes-workspace (foreground) ──────────────────────────────────
echo "[start] Starting hermes-workspace UI on :${PORT:-3000} ..."
exec node /app/server-entry.js

