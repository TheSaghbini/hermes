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

from flask import Flask, Response, jsonify, render_template, request
from waitress import serve
from werkzeug.exceptions import BadRequest
from werkzeug.middleware.proxy_fix import ProxyFix

from gateway_manager import GatewayManager
from hermes_config import (
    DEFAULT_OPENROUTER_BASE_URL,
    LOCAL_OLLAMA_HINT,
    PROVIDER_OPTIONS,
    RAILWAY_OLLAMA_HINT,
    ensure_runtime_home,
    is_inference_ready,
    load_settings,
    normalize_provider,
    save_settings,
    seed_files_from_env,
)

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
AUTO_START = os.getenv("HERMES_AUTO_START", "true").strip().lower() not in {
    "0",
    "false",
    "no",
}
SECRET_UNCHANGED_PREFIX = "\u2022\u2022\u2022\u2022"
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
    target_origin = normalized_origin(request.host_url)
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
def index() -> str:
    """Render the single-page admin UI."""
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
        return jsonify({"error": "Unsupported action."}), 404
    if action in {"start", "restart"} and not is_inference_ready(load_settings()):
        return jsonify({"error": "Inference config is not complete enough to start."}), 400
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


def bootstrap() -> None:
    """Prepare the persistent Hermes home and optionally auto-start."""
    ensure_runtime_home()
    seed_files_from_env()
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
