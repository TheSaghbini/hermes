#!/bin/sh
# @ai-context Prepare the persistent Hermes home and launch the admin wrapper.

set -eu

mkdir -p /data/.hermes
chmod 700 /data/.hermes || true

exec python /app/server.py
