#!/bin/sh
# @ai-context Start Ollama and optionally pre-pull one model after readiness.

set -eu

ollama serve &
ollama_pid=$!

if [ -n "${OLLAMA_DEFAULT_MODEL:-}" ]; then
  (
    tries=0
    until ollama list >/dev/null 2>&1; do
      tries=$((tries + 1))
      if [ "$tries" -ge 60 ]; then
        echo "Ollama was not ready within 60 seconds; skipping model pull." >&2
        exit 0
      fi
      sleep 1
    done

    echo "Pulling ${OLLAMA_DEFAULT_MODEL} ..."
    ollama pull "${OLLAMA_DEFAULT_MODEL}" \
      || echo "Model pull failed; continuing with the running server." >&2
  ) &
fi

wait "$ollama_pid"
