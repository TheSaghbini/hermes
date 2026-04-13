"""@ai-context HTTP admin wrapper for Hermes Agent.

Purpose: serve the admin UI, protect it with HTTP Basic auth, and manage a
single Hermes gateway subprocess using the persisted config under /data/.hermes.
Dependencies: Flask, waitress, gateway_manager.py, hermes_config.py.
@ai-related hermes_config.py, gateway_manager.py, templates/index.html
"""

from __future__ import annotations

import atexit
import hmac
import json as _json
import logging
import os
import secrets
import socket
import time
import urllib.error
import urllib.request
from dataclasses import asdict
from typing import Any
from urllib.parse import urlsplit

import queue
import re
from pathlib import Path

import yaml
from flask import Flask, Response, jsonify, render_template, request, send_file, send_from_directory
from waitress import serve
from werkzeug.exceptions import BadRequest
from werkzeug.middleware.proxy_fix import ProxyFix

from gateway_manager import GatewayManager
from hermes_config import (
    CONFIG_PATH,
    DEFAULT_OPENROUTER_BASE_URL,
    ENV_PATH,
    LOCAL_OLLAMA_HINT,
    PROVIDER_ENV_REQUIREMENTS,
    PROVIDER_OPTIONS,
    RAILWAY_OLLAMA_HINT,
    ensure_runtime_home,
    is_inference_ready,
    load_settings,
    normalize_provider,
    read_env_file,
    save_settings,
    seed_files_from_env,
    write_env_file,
)
from database import (
    add_message,
    close_db,
    create_conversation,
    delete_conversation,
    get_conversation,
    get_messages,
    get_watchdog_config,
    init_db,
    list_conversations,
    set_watchdog_config,
    update_conversation,
)
from backup_manager import (
    create_backup,
    delete_backup,
    download_backup,
    get_backup,
    list_backups,
    restore_backup,
)
from chat_proxy import resolve_provider, stream_chat

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
LOGGER = logging.getLogger("hermes-admin")
APP = Flask(__name__)
APP.wsgi_app = ProxyFix(APP.wsgi_app, x_for=1, x_proto=1, x_host=1)
GATEWAY = GatewayManager()
GENERATED_PASSWORD = secrets.token_urlsafe(18)
LOCAL_TEST_ONLY_ADMIN_PASSWORD = "local-test-only-change-this-password"
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", GENERATED_PASSWORD)
TRUSTED_ORIGIN = os.getenv("TRUSTED_ORIGIN", "").strip()
AUTO_START = os.getenv("HERMES_AUTO_START", "true").strip().lower() not in {
    "0",
    "false",
    "no",
}
FRONTEND_DIR = Path(__file__).parent / "frontend" / "dist"
USE_LEGACY_UI = os.getenv("USE_LEGACY_UI", "false").strip().lower() in {"1", "true", "yes"}
SECRET_UNCHANGED_PREFIX = "\u2022\u2022\u2022\u2022"
_SECRET_KEY_PATTERN = re.compile(r"(KEY|SECRET|TOKEN|PASSWORD)", re.IGNORECASE)
STATE_CHANGING_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


def admin_response() -> Response:
    """Return the HTTP Basic auth challenge used by the admin routes."""
    return Response(
        "Authentication required.",
        401,
        {"WWW-Authenticate": 'Basic realm="Hermes Admin"'},
    )


def mask_secret(value: str) -> str:
    """Show only the last 4 characters of a secret, or empty if blank."""
    if not value:
        return ""
    return SECRET_UNCHANGED_PREFIX + value[-4:]


def json_error(message: str, status_code: int) -> Response:
    """Return a JSON error payload for API clients.

    @ai-context Keep admin write failures machine-readable for the SPA.
    @ai-security Avoid HTML error pages on CSRF and JSON validation failures.
    """
    response = jsonify({"error": message})
    response.status_code = status_code
    return response


def require_basic_auth() -> Response | None:
    """Verify admin credentials for every route except the health check."""
    auth = request.authorization
    if not auth:
        return admin_response()
    if not hmac.compare_digest(auth.username or "", ADMIN_USERNAME):
        return admin_response()
    if not hmac.compare_digest(auth.password or "", ADMIN_PASSWORD):
        return admin_response()
    return None


def normalized_origin(value: str) -> str:
    """Collapse Origin or Referer values to a comparable scheme+host string."""
    parsed = urlsplit((value or "").strip())
    if not parsed.scheme or not parsed.netloc:
        return ""
    return f"{parsed.scheme.lower()}://{parsed.netloc.lower()}"


def require_same_origin_json_write() -> Response | None:
    """Reject CSRF-prone writes unless they are same-origin JSON requests.

    @ai-context The admin UI uses same-origin fetches with JSON bodies, while
    cross-site form posts cannot satisfy this policy.
    @ai-security Enforces both a JSON-only write contract and a strict browser
    origin check for state-changing routes.
    """
    if request.method not in STATE_CHANGING_METHODS:
        return None
    if not request.is_json:
        return json_error("State-changing routes only accept JSON requests.", 415)

    fetch_site = request.headers.get("Sec-Fetch-Site", "").strip().lower()
    if fetch_site and fetch_site not in {"same-origin", "none"}:
        return json_error("Cross-site writes are not allowed.", 403)

    source = request.headers.get("Origin", "").strip() or request.headers.get(
        "Referer", ""
    ).strip()
    source_origin = normalized_origin(source)
    target_origin = normalized_origin(
        TRUSTED_ORIGIN if TRUSTED_ORIGIN else request.host_url
    )
    LOGGER.debug(
        "CSRF check: source_origin=%r target_origin=%r", source_origin, target_origin
    )
    if not source_origin or not target_origin:
        return json_error(
            "State-changing routes require a same-origin browser request.",
            403,
        )
    if not hmac.compare_digest(source_origin, target_origin):
        return json_error("Cross-site writes are not allowed.", 403)
    return None


def read_json_object() -> tuple[dict[str, Any] | None, Response | None]:
    """Parse a JSON object body for admin writes.

    Returns the decoded object or a JSON error response when parsing fails.
    """
    try:
        payload = request.get_json(silent=False)
    except BadRequest:
        return None, json_error("Request body must be valid JSON.", 400)

    if payload is None:
        return {}, None
    if not isinstance(payload, dict):
        return None, json_error("Request body must be a JSON object.", 400)
    return payload, None


def active_base_url(provider: str, ollama_base_url: str) -> str:
    """Expose the endpoint Hermes will actively use for the current provider."""
    if provider == "custom":
        return ollama_base_url
    if provider == "openrouter":
        return DEFAULT_OPENROUTER_BASE_URL
    return ""


def status_payload() -> dict[str, Any]:
    """Build the admin status object consumed by the UI."""
    settings = load_settings()
    provider = normalize_provider(settings.provider)
    config_dict = asdict(settings)
    config_dict["ollama_api_key"] = mask_secret(settings.ollama_api_key)
    config_dict["openrouter_api_key"] = mask_secret(settings.openrouter_api_key)
    return {
        "config": {
            **config_dict,
            "provider": provider,
            "ready": is_inference_ready(settings),
            "ollama_configured": bool(settings.ollama_base_url),
            "openrouter_configured": bool(settings.openrouter_api_key),
            "active_base_url": active_base_url(provider, settings.ollama_base_url),
        },
        "gateway": GATEWAY.status(),
    }


@APP.before_request
def protect_admin_routes() -> Response | None:
    """Leave health public while protecting the rest of the admin surface."""
    if request.path == "/health":
        return None
    auth_failure = require_basic_auth()
    if auth_failure is not None:
        return auth_failure
    return require_same_origin_json_write()


@APP.after_request
def add_no_store_headers(response: Response) -> Response:
    """Avoid caching secrets returned by the admin API."""
    response.headers["Cache-Control"] = "no-store"
    return response


@APP.get("/")
def index() -> str | Response:
    """Serve the React SPA or fall back to the legacy Jinja2 admin UI."""
    if not USE_LEGACY_UI and (FRONTEND_DIR / "index.html").is_file():
        return send_from_directory(FRONTEND_DIR, "index.html")
    return render_template(
        "index.html",
        provider_options=PROVIDER_OPTIONS,
        local_ollama_hint=LOCAL_OLLAMA_HINT,
        railway_ollama_hint=RAILWAY_OLLAMA_HINT,
    )


@APP.get("/health")
def health() -> Response:
    """Public health endpoint for Railway and docker-compose."""
    settings = load_settings()
    return jsonify(
        {
            "status": "ok",
            "gateway_running": GATEWAY.is_running(),
            "inference_ready": is_inference_ready(settings),
        }
    )


@APP.get("/api/status")
def api_status() -> Response:
    """Return persisted config and gateway state."""
    return jsonify(status_payload())


@APP.post("/api/config")
def api_config() -> Response:
    """Save config and optionally restart the gateway."""
    payload, error = read_json_object()
    if error is not None:
        return error
    if payload is None:
        return json_error("Empty payload.", 400)

    # Treat masked secrets as "unchanged" — merge with existing saved values.
    current = load_settings()
    if str(payload.get("ollama_api_key", "")).startswith(SECRET_UNCHANGED_PREFIX):
        payload["ollama_api_key"] = current.ollama_api_key
    if str(payload.get("openrouter_api_key", "")).startswith(SECRET_UNCHANGED_PREFIX):
        payload["openrouter_api_key"] = current.openrouter_api_key

    settings = save_settings(payload)
    restart_gateway = bool(payload.get("restart_gateway"))

    if restart_gateway and is_inference_ready(settings):
        GATEWAY.restart()

    return jsonify(status_payload())


@APP.post("/api/gateway/<action>")
def api_gateway(action: str) -> Response:
    """Expose explicit start, stop, and restart controls for the gateway."""
    handlers = {
        "start": GATEWAY.start,
        "stop": GATEWAY.stop,
        "restart": GATEWAY.restart,
    }
    handler = handlers.get(action)
    if not handler:
        return json_error("Unsupported action.", 404)
    if action in {"start", "restart"} and not is_inference_ready(load_settings()):
        return json_error("Inference config is not complete enough to start.", 400)
    handler()
    return jsonify(status_payload())


def _probe_endpoint(url: str, api_key: str | None, timeout: int = 10) -> dict[str, Any]:
    """@ai-context Stdlib-only HTTP probe used by the test-connection endpoint.

    Makes a GET request to *url* and returns a dict with success, latency,
    parsed model list, and error information.  Uses only urllib so no extra
    pip dependency is needed.
    """
    headers: dict[str, str] = {"Accept": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    req = urllib.request.Request(url, headers=headers, method="GET")
    start = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            latency_ms = round((time.monotonic() - start) * 1000)
            body = _json.loads(resp.read().decode("utf-8"))
            models = [m.get("id", "") for m in body.get("data", [])] if isinstance(body, dict) else []
            return {"success": True, "latency_ms": latency_ms, "models": models, "error": None}
    except urllib.error.HTTPError as exc:
        latency_ms = round((time.monotonic() - start) * 1000)
        if exc.code in {401, 403}:
            msg = "Authentication failed. Check your API key."
        else:
            msg = f"Server returned HTTP {exc.code}."
        return {"success": False, "latency_ms": latency_ms, "models": [], "error": msg}
    except urllib.error.URLError as exc:
        latency_ms = round((time.monotonic() - start) * 1000)
        reason = exc.reason
        if isinstance(reason, socket.timeout):
            msg = f"Connection timed out after {timeout}s. Check that the URL is correct and the service is reachable."
        elif isinstance(reason, OSError) and reason.errno == 111:
            msg = f"Cannot connect to {url}. Is the Ollama service running?"
        elif isinstance(reason, socket.gaierror):
            msg = "Cannot resolve hostname. Check the URL."
        elif "Connection refused" in str(reason):
            msg = f"Cannot connect to {url}. Is the Ollama service running?"
        else:
            msg = f"Cannot connect to {url}. Is the Ollama service running?"
        return {"success": False, "latency_ms": latency_ms, "models": [], "error": msg}
    except socket.timeout:
        latency_ms = round((time.monotonic() - start) * 1000)
        msg = f"Connection timed out after {timeout}s. Check that the URL is correct and the service is reachable."
        return {"success": False, "latency_ms": latency_ms, "models": [], "error": msg}


@APP.post("/api/test-connection")
def api_test_connection() -> Response:
    """@ai-context Test connectivity to the configured inference endpoint.

    Reads the PERSISTED settings (not form values) so the test reflects what
    is actually saved to disk.
    """
    payload, error = read_json_object()
    if error is not None:
        return error

    settings = load_settings()
    provider = normalize_provider(settings.provider)

    if provider == "custom":
        base = settings.ollama_base_url.rstrip("/")
        if not base:
            return jsonify({
                "success": False, "provider": provider, "endpoint": "",
                "latency_ms": 0, "models": [], "model_configured": False,
                "error": "No Ollama base URL configured. Save your settings first.",
            })
        probe_url = f"{base}/v1/models" if "/v1" not in base else f"{base}/models"
        result = _probe_endpoint(probe_url, settings.ollama_api_key or None)
        endpoint = base

    elif provider == "openrouter":
        if not settings.openrouter_api_key:
            return jsonify({
                "success": False, "provider": provider, "endpoint": DEFAULT_OPENROUTER_BASE_URL,
                "latency_ms": 0, "models": [], "model_configured": False,
                "error": "No OpenRouter API key configured. Save your settings first.",
            })
        probe_url = f"{DEFAULT_OPENROUTER_BASE_URL}/models"
        result = _probe_endpoint(probe_url, settings.openrouter_api_key)
        endpoint = DEFAULT_OPENROUTER_BASE_URL

    else:
        return jsonify({
            "success": False, "provider": provider, "endpoint": "",
            "latency_ms": 0, "models": [], "model_configured": False,
            "error": f"Connection test not available for the '{provider}' provider.",
        })

    model_configured = bool(
        settings.default_model and settings.default_model in result["models"]
    )
    return jsonify({
        "success": result["success"],
        "provider": provider,
        "endpoint": endpoint,
        "latency_ms": result["latency_ms"],
        "models": result["models"],
        "model_configured": model_configured,
        "error": result["error"],
    })


# ---------------------------------------------------------------------------
# Chat routes
# ---------------------------------------------------------------------------


@APP.post("/api/chat")
def api_chat() -> Response:
    """@ai-context Streaming SSE chat endpoint.

    Parse JSON body, persist user message, stream provider response, and
    persist the assistant reply on completion.
    """
    payload, error = read_json_object()
    if error is not None:
        return error
    if payload is None:
        return json_error("Empty payload.", 400)

    conversation_id = payload.get("conversation_id")
    message = (payload.get("message") or "").strip()
    model_override = (payload.get("model") or "").strip()
    system_prompt = (payload.get("system_prompt") or "").strip()

    if not conversation_id or not message:
        return json_error("conversation_id and message are required.", 400)

    conversation = get_conversation(conversation_id)
    if conversation is None:
        return json_error("Conversation not found.", 404)

    settings = load_settings()
    model = model_override or conversation.get("model") or settings.default_model
    if not model:
        return json_error("No model configured.", 400)

    # Persist user message
    add_message(conversation_id, "user", message)

    # Build message history
    history = get_messages(conversation_id)
    messages: list[dict] = []
    effective_system = system_prompt or conversation.get("system_prompt", "")
    if effective_system:
        messages.append({"role": "system", "content": effective_system})
    for msg in history:
        messages.append({"role": msg["role"], "content": msg["content"]})

    base_url, api_key = resolve_provider(settings)
    if not base_url:
        return json_error("No provider base URL configured.", 400)

    def generate():  # type: ignore[no-untyped-def]
        accumulated: list[str] = []
        try:
            gen = stream_chat(base_url, api_key, model, messages)
            for event in gen:
                yield event
                # Extract content from delta events for accumulation
                if event.startswith("event: delta"):
                    lines = event.strip().split("\n")
                    for line in lines:
                        if line.startswith("data: "):
                            try:
                                data = _json.loads(line[6:])
                                if "content" in data:
                                    accumulated.append(data["content"])
                            except _json.JSONDecodeError:
                                pass
        except GeneratorExit:
            return
        finally:
            # Persist assistant message with accumulated content
            full_content = "".join(accumulated)
            if full_content:
                add_message(conversation_id, "assistant", full_content, model=model)

    return Response(
        generate(),
        content_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@APP.get("/api/conversations")
def api_list_conversations() -> Response:
    """@ai-context List conversations with pagination."""
    limit = request.args.get("limit", 50, type=int)
    offset = request.args.get("offset", 0, type=int)
    return jsonify({"conversations": list_conversations(limit, offset)})


@APP.get("/api/conversations/<conversation_id>")
def api_get_conversation(conversation_id: str) -> Response:
    """@ai-context Return a single conversation with all its messages."""
    conversation = get_conversation(conversation_id)
    if conversation is None:
        return json_error("Conversation not found.", 404)
    conversation["messages"] = get_messages(conversation_id)
    return jsonify(conversation)


@APP.post("/api/conversations")
def api_create_conversation() -> Response:
    """@ai-context Create a new conversation."""
    payload, error = read_json_object()
    if error is not None:
        return error
    settings = load_settings()
    title = (payload or {}).get("title", "New Conversation")
    model = (payload or {}).get("model") or settings.default_model or ""
    system_prompt = (payload or {}).get("system_prompt", "")
    conversation = create_conversation(title, model, system_prompt)
    return jsonify(conversation), 201


@APP.delete("/api/conversations/<conversation_id>")
def api_delete_conversation(conversation_id: str) -> Response:
    """@ai-context Delete a conversation and its messages."""
    if get_conversation(conversation_id) is None:
        return json_error("Conversation not found.", 404)
    delete_conversation(conversation_id)
    return jsonify({"ok": True})


@APP.patch("/api/conversations/<conversation_id>")
def api_update_conversation(conversation_id: str) -> Response:
    """@ai-context Rename a conversation."""
    payload, error = read_json_object()
    if error is not None:
        return error
    title = (payload or {}).get("title", "").strip()
    if not title:
        return json_error("title is required.", 400)
    if get_conversation(conversation_id) is None:
        return json_error("Conversation not found.", 404)
    conversation = update_conversation(conversation_id, title)
    return jsonify(conversation)


# ---------------------------------------------------------------------------
# Extended config routes
# ---------------------------------------------------------------------------


@APP.get("/api/config/yaml")
def api_get_config_yaml() -> Response:
    """@ai-context Return raw config.yaml content."""
    if not CONFIG_PATH.exists():
        return jsonify({"content": ""})
    return jsonify({"content": CONFIG_PATH.read_text(encoding="utf-8")})


@APP.put("/api/config/yaml")
def api_put_config_yaml() -> Response:
    """@ai-context Validate and write raw config.yaml."""
    payload, error = read_json_object()
    if error is not None:
        return error
    content = (payload or {}).get("content", "")
    if not isinstance(content, str):
        return json_error("content must be a string.", 400)
    try:
        yaml.safe_load(content)
    except yaml.YAMLError as exc:
        return json_error(f"Invalid YAML: {exc}", 400)
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(content, encoding="utf-8")
    try:
        os.chmod(CONFIG_PATH, 0o600)
    except OSError:
        pass
    return jsonify({"ok": True})


@APP.get("/api/config/env")
def api_get_config_env() -> Response:
    """@ai-context Return .env entries with secrets masked."""
    env_values = read_env_file()
    entries = []
    for key, value in sorted(env_values.items()):
        masked = bool(_SECRET_KEY_PATTERN.search(key))
        entries.append({
            "key": key,
            "value": mask_secret(value) if masked else value,
            "masked": masked,
        })
    return jsonify({"entries": entries})


@APP.put("/api/config/env")
def api_put_config_env() -> Response:
    """@ai-context Write .env entries."""
    payload, error = read_json_object()
    if error is not None:
        return error
    raw_entries = (payload or {}).get("entries")
    if not isinstance(raw_entries, list):
        return json_error("entries must be a list.", 400)

    current_env = read_env_file()
    for entry in raw_entries:
        if not isinstance(entry, dict):
            continue
        key = str(entry.get("key", "")).strip()
        value = str(entry.get("value", "")).strip()
        if not key:
            continue
        # Skip masked-unchanged values
        if value.startswith(SECRET_UNCHANGED_PREFIX):
            continue
        current_env[key] = value

    write_env_file(ENV_PATH, current_env)
    return jsonify({"ok": True})


@APP.get("/api/models")
def api_models() -> Response:
    """@ai-context Query models from the active provider."""
    settings = load_settings()
    provider = normalize_provider(settings.provider)

    if provider == "custom":
        base = settings.ollama_base_url.rstrip("/")
        if not base:
            return jsonify({"models": []})
        probe_url = f"{base}/v1/models" if "/v1" not in base else f"{base}/models"
        result = _probe_endpoint(probe_url, settings.ollama_api_key or None)
    elif provider == "openrouter":
        if not settings.openrouter_api_key:
            return jsonify({"models": []})
        probe_url = f"{DEFAULT_OPENROUTER_BASE_URL}/models"
        result = _probe_endpoint(probe_url, settings.openrouter_api_key)
    else:
        return jsonify({"models": []})

    models = [{"id": m} for m in result.get("models", [])]
    return jsonify({"models": models})


@APP.get("/api/providers")
def api_providers() -> Response:
    """@ai-context Return available providers with configured status."""
    settings = load_settings()
    env_values = read_env_file()
    providers = []
    for pid, label in PROVIDER_OPTIONS:
        configured = False
        if pid == "custom":
            configured = bool(settings.ollama_base_url)
        elif pid == "openrouter":
            configured = bool(settings.openrouter_api_key)
        elif pid == "auto":
            configured = bool(settings.ollama_base_url or settings.openrouter_api_key)
        else:
            required = PROVIDER_ENV_REQUIREMENTS.get(pid, ())
            configured = any(env_values.get(k) or os.getenv(k) for k in required)
        providers.append({"id": pid, "label": label, "configured": configured})
    return jsonify({"providers": providers})


# ---------------------------------------------------------------------------
# Backup routes
# ---------------------------------------------------------------------------


@APP.get("/api/backups")
def api_list_backups() -> Response:
    """@ai-context List all backups."""
    return jsonify({"backups": list_backups()})


@APP.post("/api/backups")
def api_create_backup() -> Response:
    """@ai-context Create a backup snapshot."""
    payload, error = read_json_object()
    if error is not None:
        return error
    label = (payload or {}).get("label", "")
    backup = create_backup(label)
    return jsonify(backup), 201


@APP.post("/api/backups/<backup_id>/restore")
def api_restore_backup(backup_id: str) -> Response:
    """@ai-context Restore a backup and optionally restart the gateway."""
    payload, error = read_json_object()
    if error is not None:
        return error

    meta = get_backup(backup_id)
    if meta is None:
        return json_error("Backup not found.", 404)

    close_db()
    try:
        restored = restore_backup(backup_id)
    except FileNotFoundError:
        return json_error("Backup not found.", 404)
    finally:
        init_db()

    restart_gateway = bool((payload or {}).get("restart_gateway"))
    if restart_gateway:
        GATEWAY.restart()

    return jsonify({"ok": True, "restored": restored})


@APP.delete("/api/backups/<backup_id>")
def api_delete_backup(backup_id: str) -> Response:
    """@ai-context Delete a backup."""
    if get_backup(backup_id) is None:
        return json_error("Backup not found.", 404)
    try:
        delete_backup(backup_id)
    except ValueError:
        return json_error("Invalid backup ID.", 400)
    return jsonify({"ok": True})


@APP.get("/api/backups/<backup_id>/download")
def api_download_backup(backup_id: str) -> Response:
    """@ai-context Stream a backup as a tar.gz download."""
    if get_backup(backup_id) is None:
        return json_error("Backup not found.", 404)
    try:
        archive_path = download_backup(backup_id)
    except FileNotFoundError:
        return json_error("Backup not found.", 404)
    except ValueError:
        return json_error("Invalid backup ID.", 400)
    response = send_file(
        archive_path,
        mimetype="application/gzip",
        as_attachment=True,
        download_name=f"hermes-backup-{backup_id}.tar.gz",
    )
    response.call_on_close(lambda: os.unlink(archive_path))
    return response


# ---------------------------------------------------------------------------
# Log routes
# ---------------------------------------------------------------------------


@APP.get("/api/logs/stream")
def api_logs_stream() -> Response:
    """@ai-context SSE endpoint for live gateway log streaming."""
    log_queue = GATEWAY.subscribe_logs()

    def generate():  # type: ignore[no-untyped-def]
        try:
            while True:
                try:
                    line = log_queue.get(timeout=30)
                    data = _json.dumps({"line": line, "level": "info"})
                    yield f"event: log\ndata: {data}\n\n"
                except queue.Empty:
                    yield ": keepalive\n\n"
        except GeneratorExit:
            pass
        finally:
            GATEWAY.unsubscribe_logs(log_queue)

    return Response(
        generate(),
        content_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@APP.get("/api/logs/history")
def api_logs_history() -> Response:
    """@ai-context Return a snapshot of recent gateway log lines."""
    logs = list(GATEWAY._logs)
    return jsonify({"lines": logs, "total": len(logs)})


# ---------------------------------------------------------------------------
# Watchdog routes
# ---------------------------------------------------------------------------


@APP.get("/api/gateway/watchdog")
def api_get_watchdog() -> Response:
    """@ai-context Return the current watchdog auto-restart policy."""
    return jsonify(get_watchdog_config())


@APP.put("/api/gateway/watchdog")
def api_put_watchdog() -> Response:
    """@ai-context Update the watchdog auto-restart policy."""
    payload, error = read_json_object()
    if error is not None:
        return error
    if not payload:
        return json_error("Empty payload.", 400)
    try:
        config = set_watchdog_config(**payload)
    except (TypeError, ValueError):
        return json_error("Invalid watchdog config values.", 400)
    return jsonify(config)


# ---------------------------------------------------------------------------
# SPA catchall (must be registered LAST)
# ---------------------------------------------------------------------------


@APP.get("/<path:fallback>")
def spa_fallback(fallback: str) -> Response:
    """@ai-context Serve static assets from frontend/dist or index.html for client-side routing."""
    if not USE_LEGACY_UI and FRONTEND_DIR.is_dir():
        # Serve static assets (JS, CSS, images) if they exist on disk
        candidate = FRONTEND_DIR / fallback
        if candidate.is_file():
            return send_from_directory(FRONTEND_DIR, fallback)
        # Otherwise serve index.html for client-side routing
        if (FRONTEND_DIR / "index.html").is_file():
            return send_from_directory(FRONTEND_DIR, "index.html")
    return json_error("Not found.", 404)


def bootstrap() -> None:
    """Prepare the persistent Hermes home and optionally auto-start."""
    ensure_runtime_home()
    seed_files_from_env()
    init_db()
    GATEWAY.start_watchdog()
    if os.getenv("ADMIN_PASSWORD") is None:
        hint = ADMIN_PASSWORD[:4] + "…" + ADMIN_PASSWORD[-4:] if len(ADMIN_PASSWORD) > 8 else "****"
        LOGGER.warning(
            "ADMIN_PASSWORD not set. Generated a one-time local password for this boot: %s",
            hint,
        )
    elif hmac.compare_digest(ADMIN_PASSWORD, LOCAL_TEST_ONLY_ADMIN_PASSWORD):
        LOGGER.warning(
            "ADMIN_PASSWORD is using the local test default. Replace it before "
            "exposing Hermes beyond local development."
        )
    if AUTO_START and is_inference_ready(load_settings()):
        GATEWAY.start()


def main() -> None:
    """Run the admin wrapper as a single-process production server."""
    bootstrap()
    atexit.register(GATEWAY.stop)
    serve(APP, host="0.0.0.0", port=int(os.getenv("PORT", "8080")))


if __name__ == "__main__":
    main()
