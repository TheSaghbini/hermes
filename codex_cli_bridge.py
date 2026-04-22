"""@ai-context Adapter for using Codex CLI as a local chat transport.

Purpose: run `codex exec` non-interactively when Hermes is configured for an
OpenAI Codex provider without an HTTP endpoint, then translate its stdout into
the same SSE event stream used by HTTP providers.
Dependencies: standard library only (subprocess, tempfile, shutil, json).
@ai-related chat_proxy.py, hermes_config.py, server.py
"""

from __future__ import annotations

import json
import logging
import os
import shlex
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Generator, Mapping
from urllib.parse import urlsplit

LOGGER = logging.getLogger("hermes-admin.codex-cli")
CODEX_CLI_BASE_URL = "cli://local/v1"
DEFAULT_CODEX_CLI_BIN = "codex"
DEFAULT_CODEX_APPROVAL_MODE = "never"
DEFAULT_CODEX_SANDBOX = "read-only"
STREAM_FLUSH_CHARS = 96


def _merged_env(env_values: Mapping[str, str] | None = None) -> dict[str, str]:
    """Return process env with optional overrides layered on top."""
    merged = dict(os.environ)
    if env_values:
        merged.update({key: value for key, value in env_values.items() if value is not None})
    return merged


def _is_truthy(value: str) -> bool:
    """Parse common env-style truthy values."""
    return value.strip().lower() in {"1", "true", "yes", "on"}


def is_codex_cli_base_url(value: str) -> bool:
    """Detect the sentinel scheme that routes Codex through the local CLI."""
    return urlsplit((value or "").strip()).scheme == "cli"


def is_codex_cli_enabled(
    explicit_base_url: str,
    env_values: Mapping[str, str] | None = None,
) -> bool:
    """Determine whether CLI mode should be used for Codex requests."""
    if is_codex_cli_base_url(explicit_base_url):
        return True
    if (explicit_base_url or "").strip():
        return False

    merged_env = _merged_env(env_values)
    if merged_env.get("CODEX_CLI_BIN", "").strip():
        return True
    return _is_truthy(merged_env.get("CODEX_CLI_ENABLED", ""))


def resolve_codex_cli_base_url(
    explicit_base_url: str,
    env_values: Mapping[str, str] | None = None,
) -> str:
    """Return the effective Codex transport URL, falling back to CLI mode."""
    base_url = (explicit_base_url or "").strip()
    if base_url:
        return base_url
    if is_codex_cli_enabled(base_url, env_values):
        return CODEX_CLI_BASE_URL
    return ""


def resolve_codex_cli_binary(env_values: Mapping[str, str] | None = None) -> str:
    """Resolve the Codex executable path or command name."""
    merged_env = _merged_env(env_values)
    return merged_env.get("CODEX_CLI_BIN", "").strip() or DEFAULT_CODEX_CLI_BIN


def has_codex_cli_binary(env_values: Mapping[str, str] | None = None) -> bool:
    """Check whether the configured Codex CLI binary is available."""
    return bool(shutil.which(resolve_codex_cli_binary(env_values)))


def codex_cli_ready(
    explicit_base_url: str,
    env_values: Mapping[str, str] | None = None,
) -> bool:
    """Return whether CLI mode is enabled and the binary is reachable."""
    return is_codex_cli_enabled(explicit_base_url, env_values) and has_codex_cli_binary(env_values)


def _stringify_message_content(content: object) -> str:
    """Render arbitrary OpenAI-style message content into plain text."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for entry in content:
            if isinstance(entry, dict) and entry.get("type") == "text":
                parts.append(str(entry.get("text") or ""))
            else:
                parts.append(json.dumps(entry, ensure_ascii=False))
        return "\n".join(part for part in parts if part)
    if content is None:
        return ""
    return json.dumps(content, ensure_ascii=False)


def _render_codex_cli_prompt(messages: list[dict]) -> str:
    """Flatten chat history into a single prompt for `codex exec`."""
    sections = [
        "You are responding through a local Codex CLI bridge.",
        "Return only the assistant reply for the latest user request.",
    ]
    for message in messages:
        role = str(message.get("role") or "user").upper()
        content = _stringify_message_content(message.get("content"))
        if not content:
            continue
        sections.append(f"{role}:\n{content}")
    return "\n\n".join(sections)


def _build_codex_cli_command(
    model: str,
    prompt: str,
    last_message_path: Path,
    env_values: Mapping[str, str] | None = None,
) -> tuple[list[str], str | None, dict[str, str]]:
    """Build the non-interactive Codex CLI command and execution env."""
    merged_env = _merged_env(env_values)
    command = [
        resolve_codex_cli_binary(merged_env),
        "exec",
        "--skip-git-repo-check",
        "--color",
        "never",
        "--output-last-message",
        str(last_message_path),
    ]

    approval_mode = (
        merged_env.get("CODEX_CLI_APPROVAL_MODE", "").strip()
        or DEFAULT_CODEX_APPROVAL_MODE
    )
    if approval_mode:
        command.extend(["--approval-mode", approval_mode])

    sandbox_mode = (
        merged_env.get("CODEX_CLI_SANDBOX", "").strip() or DEFAULT_CODEX_SANDBOX
    )
    if sandbox_mode:
        command.extend(["--sandbox", sandbox_mode])

    extra_args = merged_env.get("CODEX_CLI_ARGS", "").strip()
    if extra_args:
        command.extend(shlex.split(extra_args))

    if model:
        command.extend(["--model", model])

    command.append(prompt)

    if merged_env.get("CODEX_API_KEY", "").strip() and not merged_env.get(
        "OPENAI_API_KEY", ""
    ).strip():
        merged_env["OPENAI_API_KEY"] = merged_env["CODEX_API_KEY"].strip()

    cli_cwd = merged_env.get("CODEX_CLI_CWD", "").strip() or None
    return command, cli_cwd, merged_env


def _sse_event(event: str, payload: dict[str, object]) -> str:
    """Encode a single SSE event block."""
    return f"event: {event}\ndata: {json.dumps(payload)}\n\n"


def stream_codex_cli_chat(
    api_key: str | None,
    model: str,
    messages: list[dict],
    env_values: Mapping[str, str] | None = None,
) -> Generator[str, None, dict]:
    """Run `codex exec` and translate stdout into Hermes SSE events."""
    merged_env = _merged_env(env_values)
    if api_key and not merged_env.get("OPENAI_API_KEY", "").strip():
        merged_env["OPENAI_API_KEY"] = api_key

    if not has_codex_cli_binary(merged_env):
        yield _sse_event(
            "error",
            {
                "error": (
                    "Codex CLI binary is not available. Set CODEX_CLI_BIN or install `codex`."
                ),
                "code": "codex_cli_missing",
            },
        )
        return {"content": "", "usage": {}}

    prompt = _render_codex_cli_prompt(messages)
    last_message_fd, last_message_name = tempfile.mkstemp(prefix="hermes-codex-", suffix=".txt")
    os.close(last_message_fd)
    last_message_path = Path(last_message_name)

    stderr_file = tempfile.TemporaryFile(mode="w+t", encoding="utf-8")
    accumulated: list[str] = []

    try:
        command, cli_cwd, merged_env = _build_codex_cli_command(
            model,
            prompt,
            last_message_path,
            merged_env,
        )
        LOGGER.info("Running Codex CLI bridge via %s", command[0])
        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=stderr_file,
            stdin=subprocess.DEVNULL,
            text=True,
            bufsize=1,
            env=merged_env,
            cwd=cli_cwd,
        )
    except OSError as exc:
        stderr_file.close()
        last_message_path.unlink(missing_ok=True)
        yield _sse_event(
            "error",
            {"error": f"Failed to start Codex CLI: {exc}", "code": "codex_cli_start_failed"},
        )
        return {"content": "", "usage": {}}

    try:
        assert process.stdout is not None
        buffer = ""
        while True:
            chunk = process.stdout.read(1)
            if not chunk:
                break
            buffer += chunk
            if len(buffer) >= STREAM_FLUSH_CHARS or chunk == "\n":
                accumulated.append(buffer)
                yield _sse_event("delta", {"content": buffer})
                buffer = ""

        if buffer:
            accumulated.append(buffer)
            yield _sse_event("delta", {"content": buffer})

        return_code = process.wait()
        stderr_file.seek(0)
        stderr_text = stderr_file.read().strip()
        content = "".join(accumulated)

        if last_message_path.exists():
            saved_output = last_message_path.read_text(encoding="utf-8").strip()
            if saved_output and not content:
                content = saved_output
                yield _sse_event("delta", {"content": saved_output})
            elif saved_output.startswith(content) and len(saved_output) > len(content):
                remainder = saved_output[len(content) :]
                accumulated.append(remainder)
                content = saved_output
                yield _sse_event("delta", {"content": remainder})

        if return_code != 0:
            error_message = stderr_text or content.strip() or (
                f"Codex CLI exited with status {return_code}."
            )
            yield _sse_event(
                "error",
                {"error": error_message[:500], "code": "codex_cli_failed"},
            )
            return {"content": content, "usage": {}}

        yield _sse_event("done", {"content": content, "usage": {}})
        return {"content": content, "usage": {}}
    finally:
        stderr_file.close()
        last_message_path.unlink(missing_ok=True)