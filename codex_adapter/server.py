"""Codex CLI → OpenAI-compatible API adapter.

Exposes two endpoints that hermes-agent treats as a custom provider:
  GET  /v1/models                 → static model list
  POST /v1/chat/completions       → streams / returns codex exec output

The adapter imports core subprocess logic from the sibling codex_cli_bridge.py
that lives one directory up at /app/codex_cli_bridge.py.

Run directly:
  python codex_adapter/server.py
or via env overrides:
  CODEX_ADAPTER_HOST=127.0.0.1 CODEX_ADAPTER_PORT=8645 python codex_adapter/server.py
"""

from __future__ import annotations

import json
import logging
import os
import sys
import time
import uuid
from typing import Generator

import uvicorn
from fastapi import FastAPI
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

# ── Bootstrap: import the bridge from the parent app directory ───────────────
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_APP_DIR = os.path.dirname(_THIS_DIR)
if _APP_DIR not in sys.path:
    sys.path.insert(0, _APP_DIR)

from codex_cli_bridge import stream_codex_cli_chat  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(name)s  %(message)s")
LOGGER = logging.getLogger("codex-adapter")

app = FastAPI(title="Codex CLI Adapter", version="1.0.0", docs_url=None, redoc_url=None)

CODEX_MODEL_ID = "codex-cli"
_MODEL_OBJECT = {
    "id": CODEX_MODEL_ID,
    "object": "model",
    "created": 0,
    "owned_by": "openai-codex-local",
}


# ── Request / response models ─────────────────────────────────────────────────

class _Message(BaseModel):
    role: str
    content: str | list | None = None


class _ChatRequest(BaseModel):
    model: str = CODEX_MODEL_ID
    messages: list[_Message]
    stream: bool = False
    temperature: float | None = None
    max_tokens: int | None = Field(default=None, alias="max_completion_tokens")

    model_config = {"populate_by_name": True}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _resolve_api_key() -> str:
    return (
        os.environ.get("OPENAI_API_KEY", "")
        or os.environ.get("CODEX_API_KEY", "")
    )


def _parse_hermes_sse(raw: str) -> tuple[str, dict]:
    """Extract (event_type, data_dict) from a hermes-internal SSE string."""
    event_type = ""
    data: dict = {}
    for line in raw.split("\n"):
        if line.startswith("event: "):
            event_type = line[7:].strip()
        elif line.startswith("data: "):
            try:
                data = json.loads(line[6:])
            except json.JSONDecodeError:
                pass
    return event_type, data


def _make_chunk(
    chunk_id: str,
    model: str,
    delta: dict,
    finish_reason: str | None = None,
) -> str:
    payload = {
        "id": chunk_id,
        "object": "chat.completion.chunk",
        "created": int(time.time()),
        "model": model,
        "choices": [
            {"index": 0, "delta": delta, "finish_reason": finish_reason}
        ],
    }
    return f"data: {json.dumps(payload)}\n\n"


def _stream_openai(
    chunk_id: str,
    model: str,
    messages: list[dict],
    api_key: str,
) -> Generator[str, None, None]:
    """Synchronous generator that drives codex exec and emits OpenAI SSE chunks."""
    # Role preamble
    yield _make_chunk(chunk_id, model, {"role": "assistant"})

    gen = stream_codex_cli_chat(api_key=api_key, model=model, messages=messages)
    had_error = False
    for raw_event in gen:
        event_type, data = _parse_hermes_sse(raw_event)
        if event_type == "delta":
            content = data.get("content", "")
            if content:
                yield _make_chunk(chunk_id, model, {"content": content})
        elif event_type == "error":
            error_msg = data.get("error", "Codex CLI error")
            LOGGER.warning("Codex error: %s", error_msg)
            yield _make_chunk(chunk_id, model, {"content": f"\n\n[Error: {error_msg}]"})
            had_error = True
            break

    finish = "stop" if not had_error else "content_filter"
    yield _make_chunk(chunk_id, model, {}, finish_reason=finish)
    yield "data: [DONE]\n\n"


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/v1/models")
async def list_models() -> Response:
    body = json.dumps({"object": "list", "data": [_MODEL_OBJECT]})
    return Response(content=body, media_type="application/json")


@app.post("/v1/chat/completions")
async def chat_completions(request: _ChatRequest) -> Response:
    messages = [m.model_dump() for m in request.messages]
    model = request.model or CODEX_MODEL_ID
    api_key = _resolve_api_key()
    chunk_id = f"chatcmpl-{uuid.uuid4().hex[:16]}"

    if request.stream:
        return StreamingResponse(
            _stream_openai(chunk_id, model, messages, api_key),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )

    # Non-streaming: collect full response
    content_parts: list[str] = []
    error_msg: str | None = None
    gen = stream_codex_cli_chat(api_key=api_key, model=model, messages=messages)
    for raw_event in gen:
        event_type, data = _parse_hermes_sse(raw_event)
        if event_type == "delta":
            piece = data.get("content", "")
            if piece:
                content_parts.append(piece)
        elif event_type == "error":
            error_msg = data.get("error", "Codex CLI error")
            break

    response_text = "".join(content_parts)
    if error_msg and not response_text:
        response_text = f"[Error: {error_msg}]"

    body = {
        "id": chunk_id,
        "object": "chat.completion",
        "created": int(time.time()),
        "model": model,
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": response_text},
                "finish_reason": "stop" if not error_msg else "content_filter",
            }
        ],
        "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
    }
    return Response(content=json.dumps(body), media_type="application/json")


@app.get("/health")
async def health() -> Response:
    return Response(content='{"status":"ok"}', media_type="application/json")


# ── Entrypoint ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    host = os.environ.get("CODEX_ADAPTER_HOST", "127.0.0.1")
    port = int(os.environ.get("CODEX_ADAPTER_PORT", "8645"))
    LOGGER.info("Codex CLI adapter listening on %s:%d", host, port)
    uvicorn.run(app, host=host, port=port, log_level="info", access_log=False)
