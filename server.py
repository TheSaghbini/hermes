"""@ai-context HTTP admin wrapper for Hermes Agent.

Purpose: serve the admin UI, protect it with HTTP Basic auth, and manage a
single Hermes gateway subprocess using the persisted config under /data/.hermes.
Dependencies: Flask, waitress, gateway_manager.py, hermes_config.py.
@ai-related hermes_config.py, gateway_manager.py, templates/index.html
"""

from __future__ import annotations

import atexit
import calendar
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
from datetime import datetime
from typing import Any
from urllib.parse import urlsplit
import uuid

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
    read_config_file,
    read_env_file,
    resolve_runtime_provider,
    save_settings,
    seed_files_from_env,
    write_config_file,
    write_env_file,
)
from database import (
    add_message,
    close_db,
    count_conversations,
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
from codex_cli_bridge import codex_cli_ready, resolve_codex_cli_base_url

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
API_TOKEN = os.getenv("HERMES_API_TOKEN", "").strip()
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


def has_valid_bearer_token() -> bool:
    """Allow server-to-server API access with a shared bearer token."""
    if not API_TOKEN:
        return False
    authorization = request.headers.get("Authorization", "").strip()
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return False
    return hmac.compare_digest(token.strip(), API_TOKEN)


def authenticate_request() -> str | None:
    """Return the auth mode for this request when credentials are valid."""
    if has_valid_bearer_token():
        return "bearer"
    if require_basic_auth() is None:
        return "basic"
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
    runtime_provider = resolve_runtime_provider(provider)
    if provider == "openai-codex":
        settings = load_settings()
        return resolve_codex_cli_base_url(settings.codex_base_url)
    if runtime_provider == "custom":
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
    config_dict["codex_api_key"] = mask_secret(settings.codex_api_key)
    config_dict["openrouter_api_key"] = mask_secret(settings.openrouter_api_key)
    return {
        "config": {
            **config_dict,
            "provider": provider,
            "ready": is_inference_ready(settings),
            "ollama_configured": bool(settings.ollama_base_url),
            "codex_configured": bool(
                settings.codex_base_url or codex_cli_ready(settings.codex_base_url)
            ),
            "openrouter_configured": bool(settings.openrouter_api_key),
            "active_base_url": active_base_url(provider, settings.ollama_base_url),
        },
        "gateway": GATEWAY.status(),
    }


def parse_event_block(raw_event: str) -> tuple[str, dict[str, Any]]:
    """Decode an internal SSE event block into an event name and JSON payload."""
    event_name = ""
    data_parts: list[str] = []
    for line in raw_event.strip().splitlines():
        if line.startswith("event: "):
            event_name = line[7:].strip()
        elif line.startswith("data: "):
            data_parts.append(line[6:])
    data = {}
    if data_parts:
        try:
            data = _json.loads("".join(data_parts))
        except _json.JSONDecodeError:
            data = {}
    return event_name, data


def sse_event(event: str, data: dict[str, Any]) -> str:
    """Encode a JSON payload as an SSE event block."""
    return f"event: {event}\ndata: {_json.dumps(data)}\n\n"


def iso_to_unix_seconds(value: str | None) -> int:
    """Convert an ISO 8601 UTC timestamp to unix seconds."""
    if not value:
        return 0
    try:
        parsed = datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ")
    except ValueError:
        return 0
    return calendar.timegm(parsed.utctimetuple())


def conversation_to_gateway_session(conversation: dict[str, Any]) -> dict[str, Any]:
    """Map a persisted conversation to the session shape Workspace expects."""
    messages = get_messages(conversation["id"])
    prompt_tokens = sum(int(message.get("prompt_tokens") or 0) for message in messages)
    completion_tokens = sum(
        int(message.get("completion_tokens") or 0) for message in messages
    )
    preview = messages[-1]["content"][:240] if messages else ""
    return {
        "id": conversation["id"],
        "source": "hermes-admin",
        "user_id": None,
        "model": conversation.get("model") or "",
        "title": conversation.get("title") or conversation["id"],
        "started_at": iso_to_unix_seconds(conversation.get("created_at")),
        "ended_at": None,
        "end_reason": None,
        "message_count": len(messages),
        "tool_call_count": 0,
        "input_tokens": prompt_tokens,
        "output_tokens": completion_tokens,
        "parent_session_id": None,
        "last_active": iso_to_unix_seconds(conversation.get("updated_at")),
        "is_active": True,
        "preview": preview,
    }


def message_to_gateway_message(message: dict[str, Any]) -> dict[str, Any]:
    """Map a persisted message to the Hermes session message shape."""
    return {
        "id": message["id"],
        "session_id": message["conversation_id"],
        "role": message["role"],
        "content": message["content"],
        "tool_call_id": None,
        "tool_calls": [],
        "tool_name": None,
        "timestamp": iso_to_unix_seconds(message.get("created_at")),
        "token_count": int(message.get("prompt_tokens") or 0)
        + int(message.get("completion_tokens") or 0),
        "finish_reason": "stop" if message["role"] == "assistant" else None,
    }


def default_model_config(settings: Any) -> dict[str, Any]:
    """Expose the active model/provider config in a lightweight gateway shape."""
    provider = normalize_provider(settings.provider)
    base_url = active_base_url(provider, settings.ollama_base_url)
    config = read_env_file()
    payload = read_config_file()
    model_block = payload.get("model") if isinstance(payload, dict) else None
    if not isinstance(model_block, dict):
        model_block = {}
    return {
        **payload,
        "provider": provider,
        "model": {
            **model_block,
            "provider": provider,
            "default": settings.default_model,
            "base_url": base_url or model_block.get("base_url", ""),
        },
        "base_url": base_url,
        "env": config,
    }


def consume_chat_stream(
    base_url: str,
    api_key: str | None,
    model: str,
    messages: list[dict[str, Any]],
) -> tuple[str, dict[str, Any]]:
    """Run the internal streaming proxy to completion and return full text + usage."""
    accumulated: list[str] = []
    usage: dict[str, Any] = {}
    for raw_event in stream_chat(base_url, api_key, model, messages):
        event_name, data = parse_event_block(raw_event)
        if event_name == "delta":
            piece = str(data.get("content") or "")
            if piece:
                accumulated.append(piece)
        elif event_name == "done":
            usage = data.get("usage") or usage
        elif event_name == "error":
            message = str(data.get("error") or data.get("message") or "Provider error")
            raise RuntimeError(message)
    return "".join(accumulated), usage


def build_conversation_messages(
    conversation: dict[str, Any],
    system_prompt_override: str,
) -> list[dict[str, Any]]:
    """Render the stored conversation into provider chat-completion messages."""
    history = get_messages(conversation["id"])
    messages: list[dict[str, Any]] = []
    effective_system = system_prompt_override or conversation.get("system_prompt", "")
    if effective_system:
        messages.append({"role": "system", "content": effective_system})
    for msg in history:
        messages.append({"role": msg["role"], "content": msg["content"]})
    return messages


def connection_probe_config(settings: Any) -> tuple[str, str, str | None] | None:
    """Resolve provider label, probe URL, and API key for model listing/tests."""
    provider = normalize_provider(settings.provider)
    if provider == "openrouter":
        return provider, f"{DEFAULT_OPENROUTER_BASE_URL}/models", settings.openrouter_api_key or None

    if provider in {"custom", "ollama"}:
        base_url = settings.ollama_base_url.rstrip("/")
        if not base_url:
            return None
        probe_url = f"{base_url}/models" if "/v1" in base_url else f"{base_url}/v1/models"
        return provider, probe_url, settings.ollama_api_key or None

    if provider == "openai-codex":
        base_url = settings.codex_base_url.rstrip("/")
        if not base_url:
            return None
        probe_url = f"{base_url}/models" if "/v1" in base_url else f"{base_url}/v1/models"
        return provider, probe_url, settings.codex_api_key or None

    return None


@APP.before_request
def protect_admin_routes() -> Response | None:
    """Leave health public while protecting the rest of the admin surface."""
    if request.path == "/health":
        return None
    auth_mode = authenticate_request()
    if auth_mode is None:
        return admin_response()
    if auth_mode == "bearer":
        if request.method in STATE_CHANGING_METHODS and not request.is_json:
            return json_error("State-changing routes only accept JSON requests.", 415)
        return None
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


@APP.get("/api/config")
def api_get_config() -> Response:
    """Return the active raw Hermes config payload."""
    settings = load_settings()
    return jsonify(default_model_config(settings))


@APP.patch("/api/config")
def api_patch_config() -> Response:
    """Apply a partial config patch for Workspace-compatible clients."""
    payload, error = read_json_object()
    if error is not None:
        return error
    if payload is None:
        return json_error("Empty payload.", 400)

    current = read_config_file()
    if not isinstance(current, dict):
        current = {}

    def deep_merge(target: dict[str, Any], updates: dict[str, Any]) -> None:
        for key, value in updates.items():
            if value is None:
                target.pop(key, None)
            elif isinstance(value, dict) and isinstance(target.get(key), dict):
                deep_merge(target[key], value)
            elif isinstance(value, dict):
                nested: dict[str, Any] = {}
                deep_merge(nested, value)
                target[key] = nested
            else:
                target[key] = value

    deep_merge(current, payload)
    write_config_file(CONFIG_PATH, current)
    return jsonify(current)


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
            msg = f"Cannot connect to {url}. Is the configured service running?"
        elif isinstance(reason, socket.gaierror):
            msg = "Cannot resolve hostname. Check the URL."
        elif "Connection refused" in str(reason):
            msg = f"Cannot connect to {url}. Is the configured service running?"
        else:
            msg = f"Cannot connect to {url}. Is the configured service running?"
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

    probe = connection_probe_config(settings)
    if probe is None:
        if provider == "openai-codex" and codex_cli_ready(settings.codex_base_url):
            models = [settings.default_model] if settings.default_model else []
            return jsonify({
                "success": True,
                "provider": provider,
                "endpoint": resolve_codex_cli_base_url(settings.codex_base_url),
                "latency_ms": 0,
                "models": models,
                "model_configured": bool(settings.default_model),
                "error": "",
            })
        if provider == "openrouter":
            return jsonify({
                "success": False, "provider": provider, "endpoint": DEFAULT_OPENROUTER_BASE_URL,
                "latency_ms": 0, "models": [], "model_configured": False,
                "error": "No OpenRouter API key configured. Save your settings first.",
            })
        return jsonify({
            "success": False, "provider": provider, "endpoint": "",
            "latency_ms": 0, "models": [], "model_configured": False,
            "error": f"Connection test not available for the '{provider}' provider.",
        })

    _, probe_url, api_key = probe
    result = _probe_endpoint(probe_url, api_key)
    endpoint = probe_url.removesuffix("/models").removesuffix("/v1") if probe_url.endswith("/v1/models") else probe_url.removesuffix("/models")

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
    messages = build_conversation_messages(conversation, system_prompt)

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


@APP.get("/v1/models")
def api_v1_models() -> Response:
    """Return OpenAI-compatible model metadata for Hermes Workspace portable mode."""
    settings = load_settings()
    probe = connection_probe_config(settings)
    models: list[dict[str, Any]] = []
    if probe is not None:
        provider, probe_url, api_key = probe
        result = _probe_endpoint(probe_url, api_key)
        models = [
            {
                "id": model_id,
                "object": "model",
                "created": 0,
                "owned_by": provider,
            }
            for model_id in result.get("models", [])
        ]
    elif settings.default_model:
        models = [{
            "id": settings.default_model,
            "object": "model",
            "created": 0,
            "owned_by": normalize_provider(settings.provider),
        }]
    return jsonify({"object": "list", "data": models})


@APP.post("/v1/chat/completions")
def api_v1_chat_completions() -> Response:
    """Expose a minimal OpenAI-compatible chat completions surface."""
    payload, error = read_json_object()
    if error is not None:
        return error
    if payload is None:
        return json_error("Empty payload.", 400)

    settings = load_settings()
    model = str(payload.get("model") or settings.default_model or "").strip()
    raw_messages = payload.get("messages")
    stream = bool(payload.get("stream"))
    if not model:
        return json_error("model is required.", 400)
    if not isinstance(raw_messages, list) or not raw_messages:
        return json_error("messages must be a non-empty array.", 400)

    messages = [
        {"role": str(entry.get("role") or "user"), "content": entry.get("content") or ""}
        for entry in raw_messages
        if isinstance(entry, dict)
    ]
    base_url, api_key = resolve_provider(settings)
    if not base_url:
        return json_error("No provider base URL configured.", 400)

    completion_id = f"chatcmpl-{uuid.uuid4().hex}"
    created_at = int(time.time())

    if not stream:
        try:
            content, usage = consume_chat_stream(base_url, api_key, model, messages)
        except RuntimeError as exc:
            return json_error(str(exc), 502)
        return jsonify({
            "id": completion_id,
            "object": "chat.completion",
            "created": created_at,
            "model": model,
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": content},
                "finish_reason": "stop",
            }],
            "usage": usage,
        })

    def generate() -> Any:
        done_sent = False
        for raw_event in stream_chat(base_url, api_key, model, messages):
            event_name, data = parse_event_block(raw_event)
            if event_name == "delta":
                piece = str(data.get("content") or "")
                if not piece:
                    continue
                chunk = {
                    "id": completion_id,
                    "object": "chat.completion.chunk",
                    "created": created_at,
                    "model": model,
                    "choices": [{
                        "index": 0,
                        "delta": {"content": piece},
                        "finish_reason": None,
                    }],
                }
                yield f"data: {_json.dumps(chunk)}\n\n"
            elif event_name == "done":
                final_chunk = {
                    "id": completion_id,
                    "object": "chat.completion.chunk",
                    "created": created_at,
                    "model": model,
                    "choices": [{
                        "index": 0,
                        "delta": {},
                        "finish_reason": "stop",
                    }],
                }
                usage = data.get("usage")
                if usage:
                    final_chunk["usage"] = usage
                yield f"data: {_json.dumps(final_chunk)}\n\n"
                yield "data: [DONE]\n\n"
                done_sent = True
            elif event_name == "error":
                error_chunk = {
                    "error": {
                        "message": str(data.get("error") or data.get("message") or "Provider error"),
                        "type": "provider_error",
                    }
                }
                yield f"data: {_json.dumps(error_chunk)}\n\n"
                yield "data: [DONE]\n\n"
                done_sent = True
        if not done_sent:
            yield "data: [DONE]\n\n"

    return Response(
        generate(),
        content_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@APP.get("/api/sessions")
def api_list_sessions() -> Response:
    """List sessions in the Hermes Workspace gateway shape."""
    limit = request.args.get("limit", 50, type=int)
    offset = request.args.get("offset", 0, type=int)
    sessions = [
        conversation_to_gateway_session(conversation)
        for conversation in list_conversations(limit, offset)
    ]
    return jsonify({
        "items": sessions,
        "sessions": sessions,
        "total": count_conversations(),
        "limit": limit,
        "offset": offset,
    })


@APP.post("/api/sessions")
def api_create_session() -> Response:
    """Create a session using the workspace-compatible payload shape."""
    payload, error = read_json_object()
    if error is not None:
        return error
    payload = payload or {}
    settings = load_settings()
    session_id = str(payload.get("id") or payload.get("friendlyId") or uuid.uuid4())
    title = str(payload.get("title") or payload.get("label") or session_id).strip()
    model = str(payload.get("model") or settings.default_model or "").strip()
    conversation = create_conversation(title, model, str(payload.get("system_message") or ""), session_id)
    return jsonify({"session": conversation_to_gateway_session(conversation)})


@APP.get("/api/sessions/<session_id>")
def api_get_session(session_id: str) -> Response:
    """Return a single session by id."""
    conversation = get_conversation(session_id)
    if conversation is None:
        return json_error("Session not found.", 404)
    return jsonify({"session": conversation_to_gateway_session(conversation)})


@APP.patch("/api/sessions/<session_id>")
def api_patch_session(session_id: str) -> Response:
    """Rename a session in the workspace-compatible shape."""
    payload, error = read_json_object()
    if error is not None:
        return error
    title = str((payload or {}).get("title") or "").strip()
    if not title:
        return json_error("title is required.", 400)
    if get_conversation(session_id) is None:
        return json_error("Session not found.", 404)
    updated = update_conversation(session_id, title)
    return jsonify({"session": conversation_to_gateway_session(updated)})


@APP.delete("/api/sessions/<session_id>")
def api_delete_session(session_id: str) -> Response:
    """Delete a session by id."""
    if get_conversation(session_id) is None:
        return json_error("Session not found.", 404)
    delete_conversation(session_id)
    return jsonify({"ok": True, "sessionKey": session_id})


@APP.get("/api/sessions/<session_id>/messages")
def api_get_session_messages(session_id: str) -> Response:
    """Return messages for a session in the Hermes Workspace gateway shape."""
    if get_conversation(session_id) is None:
        return json_error("Session not found.", 404)
    items = [message_to_gateway_message(message) for message in get_messages(session_id)]
    return jsonify({"items": items, "messages": items, "total": len(items)})


@APP.post("/api/sessions/<session_id>/chat")
def api_session_chat(session_id: str) -> Response:
    """Send a non-streaming session chat message."""
    payload, error = read_json_object()
    if error is not None:
        return error
    payload = payload or {}
    message = str(payload.get("message") or "").strip()
    if not message:
        return json_error("message is required.", 400)

    conversation = get_conversation(session_id)
    if conversation is None:
        return json_error("Session not found.", 404)

    settings = load_settings()
    model = str(payload.get("model") or conversation.get("model") or settings.default_model or "").strip()
    if not model:
        return json_error("No model configured.", 400)

    add_message(session_id, "user", message)
    messages = build_conversation_messages(conversation, str(payload.get("system_message") or ""))
    base_url, api_key = resolve_provider(settings)
    if not base_url:
        return json_error("No provider base URL configured.", 400)

    try:
        content, usage = consume_chat_stream(base_url, api_key, model, messages)
    except RuntimeError as exc:
        return json_error(str(exc), 502)

    assistant = add_message(
        session_id,
        "assistant",
        content,
        model=model,
        prompt_tokens=(usage or {}).get("prompt_tokens"),
        completion_tokens=(usage or {}).get("completion_tokens"),
    )
    return jsonify({
        "ok": True,
        "session": conversation_to_gateway_session(get_conversation(session_id) or conversation),
        "message": message_to_gateway_message(assistant),
    })


@APP.post("/api/sessions/<session_id>/chat/stream")
def api_session_chat_stream(session_id: str) -> Response:
    """Send a streaming session chat message with Hermes-style SSE events."""
    payload, error = read_json_object()
    if error is not None:
        return error
    payload = payload or {}
    message = str(payload.get("message") or "").strip()
    if not message:
        return json_error("message is required.", 400)

    conversation = get_conversation(session_id)
    if conversation is None:
        return json_error("Session not found.", 404)

    settings = load_settings()
    model = str(payload.get("model") or conversation.get("model") or settings.default_model or "").strip()
    if not model:
        return json_error("No model configured.", 400)

    base_url, api_key = resolve_provider(settings)
    if not base_url:
        return json_error("No provider base URL configured.", 400)

    add_message(session_id, "user", message)
    messages = build_conversation_messages(conversation, str(payload.get("system_message") or ""))
    pending_assistant_id = str(uuid.uuid4())

    def generate() -> Any:
        accumulated: list[str] = []
        usage: dict[str, Any] = {}
        persisted = False
        yield sse_event("started", {"sessionKey": session_id, "friendlyId": session_id})
        yield sse_event(
            "message.started",
            {"message": {"id": pending_assistant_id, "role": "assistant"}, "sessionKey": session_id},
        )
        try:
            for raw_event in stream_chat(base_url, api_key, model, messages):
                event_name, data = parse_event_block(raw_event)
                if event_name == "delta":
                    delta = str(data.get("content") or "")
                    if not delta:
                        continue
                    accumulated.append(delta)
                    yield sse_event("assistant.delta", {"delta": delta, "sessionKey": session_id})
                elif event_name == "done":
                    usage = data.get("usage") or {}
                    content = "".join(accumulated)
                    if content:
                        assistant = add_message(
                            session_id,
                            "assistant",
                            content,
                            model=model,
                            prompt_tokens=usage.get("prompt_tokens"),
                            completion_tokens=usage.get("completion_tokens"),
                        )
                        persisted = True
                        yield sse_event(
                            "assistant.completed",
                            {"content": content, "message": message_to_gateway_message(assistant), "sessionKey": session_id},
                        )
                    yield sse_event("run.completed", {"state": "complete", "sessionKey": session_id})
                elif event_name == "error":
                    error_message = str(data.get("error") or data.get("message") or "Provider error")
                    yield sse_event("error", {"message": error_message, "sessionKey": session_id})
        except GeneratorExit:
            return
        finally:
            if not persisted and accumulated:
                add_message(
                    session_id,
                    "assistant",
                    "".join(accumulated),
                    model=model,
                    prompt_tokens=usage.get("prompt_tokens"),
                    completion_tokens=usage.get("completion_tokens"),
                )

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
    conversation = create_conversation(
        title,
        model,
        system_prompt,
        conversation_id=(payload or {}).get("id"),
    )
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
    probe = connection_probe_config(settings)
    if probe is None:
        if provider == "openai-codex" and codex_cli_ready(settings.codex_base_url):
            models = []
            if settings.default_model:
                models.append({
                    "id": settings.default_model,
                    "name": settings.default_model,
                    "provider": provider,
                })
            return jsonify({
                "ok": True,
                "object": "list",
                "data": models,
                "models": models,
                "configuredProviders": [provider],
                "currentProvider": provider,
                "providerLabels": {pid: label for pid, label in PROVIDER_OPTIONS},
                "providers": [
                    {"id": pid, "label": label, "authenticated": pid == provider}
                    for pid, label in PROVIDER_OPTIONS
                ],
            })
        return jsonify({"models": []})

    provider, probe_url, api_key = probe
    result = _probe_endpoint(probe_url, api_key)

    models = [{"id": m, "name": m, "provider": provider} for m in result.get("models", [])]
    configured_providers = sorted({provider} if models else [])
    return jsonify({
        "ok": True,
        "object": "list",
        "data": models,
        "models": models,
        "configuredProviders": configured_providers,
        "currentProvider": provider,
        "providerLabels": {pid: label for pid, label in PROVIDER_OPTIONS},
        "providers": [
            {"id": pid, "label": label, "authenticated": provider == pid and bool(models)}
            for pid, label in PROVIDER_OPTIONS
        ],
    })


@APP.get("/api/providers")
def api_providers() -> Response:
    """@ai-context Return available providers with configured status."""
    settings = load_settings()
    env_values = read_env_file()
    providers = []
    for pid, label in PROVIDER_OPTIONS:
        configured = False
        if pid in {"custom", "ollama"}:
            configured = bool(settings.ollama_base_url)
        elif pid == "openai-codex":
            configured = bool(
                settings.codex_base_url or codex_cli_ready(settings.codex_base_url)
            )
        elif pid == "openrouter":
            configured = bool(settings.openrouter_api_key)
        elif pid == "auto":
            configured = bool(
                settings.ollama_base_url
                or settings.codex_base_url
                or codex_cli_ready(settings.codex_base_url)
                or settings.openrouter_api_key
            )
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
