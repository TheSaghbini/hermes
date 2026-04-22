#!/bin/sh
# @ai-context Prepare the persistent Hermes home and launch the admin wrapper.

set -eu

: "${HERMES_HOME:=/data/.hermes}"
: "${CODEX_HOME:=$HERMES_HOME/.codex}"

export HERMES_HOME
export CODEX_HOME

mkdir -p "$HERMES_HOME" "$CODEX_HOME"
chmod 700 "$HERMES_HOME" || true
chmod 700 "$CODEX_HOME" || true

exec python /app/server.py
