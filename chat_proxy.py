"""@ai-context Streaming chat proxy to OpenAI-compatible inference providers.

Purpose: POST to a provider's /chat/completions endpoint with streaming enabled,
yield SSE-formatted events as content arrives, and collect final usage stats.
Uses only stdlib (urllib.request) — no requests/httpx dependency.
Dependencies: standard library urllib, json.
@ai-related server.py, hermes_config.py, database.py
@ai-security API keys are passed via Authorization header, never logged.
"""

from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
from typing import Generator

from codex_cli_bridge import (
    is_codex_cli_base_url,
    resolve_codex_cli_base_url,
    stream_codex_cli_chat,
)
from hermes_config import (
    DEFAULT_OPENROUTER_BASE_URL,
    PROVIDER_ENV_REQUIREMENTS,
    HermesSettings,
    normalize_provider,
    read_env_file,
    resolve_runtime_provider,
)

LOGGER = logging.getLogger("hermes-admin.chat")


# ---------------------------------------------------------------------------
# Provider resolution
# ---------------------------------------------------------------------------

# @ai-context Map non-custom provider IDs to their base URLs.
_PROVIDER_BASE_URLS: dict[str, str] = {
    "openrouter": DEFAULT_OPENROUTER_BASE_URL,
    "anthropic": "https://api.anthropic.com/v1",
    "gemini": "https://generativelanguage.googleapis.com/v1beta/openai",
    "zai": "https://open.bigmodel.cn/api/paas/v4",
    "kimi-coding": "https://api.moonshot.cn/v1",
    "minimax": "https://api.minimax.chat/v1",
    "huggingface": "https://api-inference.huggingface.co/v1",
    "ai-gateway": "https://gateway.ai.cloudflare.com/v1",
}


def resolve_provider(settings: HermesSettings) -> tuple[str, str | None]:
    """@ai-context Return (base_url, api_key) for the active provider.

    Reads persisted env values as a fallback for API keys so the caller does
    not need to handle env-file parsing.
    """
    provider = normalize_provider(settings.provider)
    runtime_provider = resolve_runtime_provider(provider)
    env_values = read_env_file()

    if provider == "openai-codex":
        key = settings.codex_api_key or None
        return resolve_codex_cli_base_url(settings.codex_base_url, env_values), key

    if runtime_provider == "custom":
        key = settings.ollama_api_key or None
        return settings.ollama_base_url, key

    if provider == "openrouter":
        return DEFAULT_OPENROUTER_BASE_URL, settings.openrouter_api_key or None

    # Named providers: look up base URL and resolve the API key from env.
    base_url = _PROVIDER_BASE_URLS.get(provider, settings.ollama_base_url)
    required_keys = PROVIDER_ENV_REQUIREMENTS.get(provider, ())
    api_key: str | None = None
    for key_name in required_keys:
        api_key = env_values.get(key_name) or os.getenv(key_name, "")
        if api_key:
            break

    return base_url, api_key or None


# ---------------------------------------------------------------------------
# Streaming chat proxy
# ---------------------------------------------------------------------------


def stream_chat(
    base_url: str,
    api_key: str | None,
    model: str,
    messages: list[dict],
) -> Generator[str, None, dict]:
    """@ai-context Stream an OpenAI-compatible chat completion, yielding SSE events.

    Yields SSE-formatted strings:
        event: delta\\ndata: {...}\\n\\n   — for content chunks
        event: done\\ndata: {...}\\n\\n    — when the stream finishes
        event: error\\ndata: {...}\\n\\n   — on failures

    After the generator is exhausted the return value (accessible via
    StopIteration.value) contains {"content": str, "usage": dict}.

    @ai-mutates Nothing — pure network I/O and string generation.
    """
    if is_codex_cli_base_url(base_url):
        return (yield from stream_codex_cli_chat(api_key, model, messages))

    url = f"{base_url.rstrip('/')}/chat/completions"
    payload = json.dumps({
        "model": model,
        "messages": messages,
        "stream": True,
    }).encode("utf-8")

    headers: dict[str, str] = {
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    accumulated_content: list[str] = []
    usage: dict = {}

    try:
        req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=120) as resp:  # noqa: S310
            for raw_line in resp:
                line = raw_line.decode("utf-8", errors="replace").strip()
                if not line:
                    continue

                # SSE data lines are prefixed with "data: "
                if not line.startswith("data: "):
                    continue

                data_str = line[len("data: "):]

                # End-of-stream marker
                if data_str.strip() == "[DONE]":
                    done_payload = json.dumps({
                        "content": "".join(accumulated_content),
                        "usage": usage,
                    })
                    yield f"event: done\ndata: {done_payload}\n\n"
                    return {"content": "".join(accumulated_content), "usage": usage}

                try:
                    chunk = json.loads(data_str)
                except json.JSONDecodeError:
                    continue

                # Extract content delta
                choices = chunk.get("choices") or []
                if choices:
                    delta = choices[0].get("delta") or {}
                    content_piece = delta.get("content", "")
                    if content_piece:
                        accumulated_content.append(content_piece)
                        delta_payload = json.dumps({"content": content_piece})
                        yield f"event: delta\ndata: {delta_payload}\n\n"

                    # Some providers send finish_reason inline
                    if choices[0].get("finish_reason"):
                        chunk_usage = chunk.get("usage") or {}
                        if chunk_usage:
                            usage = chunk_usage

                # Usage may arrive in the final chunk
                if "usage" in chunk and chunk["usage"]:
                    usage = chunk["usage"]

    except urllib.error.HTTPError as exc:
        body = ""
        try:
            body = exc.read().decode("utf-8", errors="replace")[:500]
        except OSError:
            pass
        LOGGER.error("Provider returned HTTP %s: %s", exc.code, body)
        error_payload = json.dumps({
            "error": f"Provider returned HTTP {exc.code}",
            "code": "provider_error",
        })
        yield f"event: error\ndata: {error_payload}\n\n"
    except (urllib.error.URLError, OSError) as exc:
        LOGGER.error("Connection to provider failed: %s", exc)
        error_payload = json.dumps({
            "error": f"Connection to provider failed: {exc}",
            "code": "connection_error",
        })
        yield f"event: error\ndata: {error_payload}\n\n"

    return {"content": "".join(accumulated_content), "usage": usage}
