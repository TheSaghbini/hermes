"""@ai-context Hermes config and dotenv persistence helpers.

Purpose: keep Hermes inference settings split between config.yaml and .env,
while letting runtime environment variables seed the initial files when they do
not exist yet.
Dependencies: standard library pathlib/url helpers and PyYAML.
@ai-related server.py, gateway_manager.py, .env.example
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import SplitResult, urlsplit, urlunsplit

import yaml

from codex_cli_bridge import (
    codex_cli_has_known_auth,
    codex_cli_ready,
    is_codex_cli_base_url,
    is_codex_cli_enabled,
)

LOGGER = logging.getLogger("hermes-admin.config")
DATA_DIR = Path(os.getenv("DATA_DIR", "/data"))
HERMES_HOME = Path(os.getenv("HERMES_HOME", str(DATA_DIR / ".hermes")))
CONFIG_PATH = HERMES_HOME / "config.yaml"
ENV_PATH = HERMES_HOME / ".env"
LOG_PATH = DATA_DIR / "hermes-gateway.log"
DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
LOCAL_OLLAMA_HINT = "http://ollama:11434"
RAILWAY_OLLAMA_HINT = "http://${{YOUR_OLLAMA_SERVICE.RAILWAY_PRIVATE_DOMAIN}}:11434"
OPENAI_KEY_MARKER = "HERMES_TEMPLATE_OPENAI_API_KEY_SOURCE"
OPENAI_KEY_MARKER_VALUE = "ollama_admin"
LEGACY_PROVIDER_ALIASES = {
    "lmstudio": "custom",
    "vllm": "custom",
    "llamacpp": "custom",
    "codex": "openai-codex",
}
LOCAL_PROVIDER_IDS = frozenset({"custom", "ollama", "openai-codex"})
PROVIDER_OPTIONS = [
    ("auto", "Auto"),
    ("ollama", "Ollama (Local)"),
    ("openai-codex", "OpenAI Codex (Local / CLI bridge)"),
    ("openrouter", "OpenRouter"),
    ("custom", "Ollama or other OpenAI-compatible endpoint"),
    ("anthropic", "Anthropic"),
    ("gemini", "Google Gemini"),
    ("zai", "z.ai / GLM"),
    ("kimi-coding", "Kimi / Moonshot"),
    ("minimax", "MiniMax"),
    ("huggingface", "Hugging Face"),
    ("ai-gateway", "Vercel AI Gateway"),
]
PROVIDER_ENV_REQUIREMENTS = {
    "anthropic": ("ANTHROPIC_API_KEY",),
    "gemini": ("GOOGLE_API_KEY", "GEMINI_API_KEY"),
    "zai": ("GLM_API_KEY",),
    "kimi-coding": ("KIMI_API_KEY",),
    "minimax": ("MINIMAX_API_KEY",),
    "minimax-cn": ("MINIMAX_CN_API_KEY",),
    "huggingface": ("HF_TOKEN",),
    "ai-gateway": ("AI_GATEWAY_API_KEY",),
    "nous-api": ("NOUS_API_KEY",),
    "copilot": ("GITHUB_TOKEN",),
    "kilocode": ("KILOCODE_API_KEY",),
}


@dataclass(slots=True)
class HermesSettings:
    """Persisted and seeded values exposed through the admin API."""

    provider: str = "auto"
    default_model: str = ""
    ollama_base_url: str = ""
    ollama_api_key: str = ""
    codex_base_url: str = ""
    codex_api_key: str = ""
    openrouter_api_key: str = ""


def ensure_runtime_home() -> None:
    """Create the persistent Hermes home and log directory."""
    HERMES_HOME.mkdir(parents=True, exist_ok=True)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(HERMES_HOME, 0o700)
    except OSError:
        LOGGER.debug("Unable to tighten permissions for %s", HERMES_HOME)


def read_env_file(path: Path = ENV_PATH) -> dict[str, str]:
    """Load simple KEY=VALUE pairs from a dotenv-style file."""
    if not path.exists():
        return {}

    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in line:
            continue
        key, raw_value = line.split("=", 1)
        value = raw_value.strip().strip('"').strip("'")
        values[key.strip()] = value
    return values


def quote_env_value(value: str) -> str:
    """Quote dotenv values only when whitespace or comment chars require it."""
    if not value or all(char not in value for char in ' #"'):
        return value
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def write_env_file(path: Path, values: dict[str, str]) -> None:
    """Persist env values in a stable order for readable diffs."""
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [f"{key}={quote_env_value(value)}" for key, value in sorted(values.items())]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    try:
        os.chmod(path, 0o600)
    except OSError:
        LOGGER.debug("Unable to tighten permissions for %s", path)


def read_config_file(path: Path = CONFIG_PATH) -> dict[str, Any]:
    """Load YAML config if present, otherwise return an empty mapping."""
    if not path.exists():
        return {}
    try:
        loaded = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError:
        LOGGER.exception("Failed to parse %s", path)
        return {}
    return loaded if isinstance(loaded, dict) else {}


def write_config_file(path: Path, config: dict[str, Any]) -> None:
    """Persist config.yaml while preserving predictable key ordering."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        yaml.safe_dump(config, sort_keys=False, allow_unicode=False),
        encoding="utf-8",
    )
    try:
        os.chmod(path, 0o600)
    except OSError:
        LOGGER.debug("Unable to tighten permissions for %s", path)


def normalize_provider(value: str) -> str:
    """Normalize legacy aliases while preserving explicit provider choices."""
    normalized = (value or "auto").strip().lower()
    return LEGACY_PROVIDER_ALIASES.get(normalized, normalized or "auto")


def resolve_runtime_provider(value: str) -> str:
    """Collapse local OpenAI-compatible providers to the shared runtime path."""
    provider = normalize_provider(value)
    return "custom" if provider in LOCAL_PROVIDER_IDS else provider


def normalize_ollama_base_url(value: str) -> str:
    """Normalize Ollama endpoints to the OpenAI-compatible `/v1` shape.

    Accept bare hosts and legacy `/api` roots without duplicating an existing
    `/v1` suffix.
    """
    raw = (value or "").strip()
    if not raw:
        return ""

    parts = urlsplit(raw if "://" in raw else f"http://{raw}")
    netloc = parts.netloc or parts.path
    path = parts.path if parts.netloc else ""
    normalized = SplitResult(parts.scheme or "http", netloc, path.rstrip("/"), "", "")

    if normalized.path.endswith("/v1"):
        return urlunsplit(normalized)
    if normalized.path in {"", "/"}:
        return urlunsplit(normalized._replace(path="/v1"))
    if normalized.path.endswith("/api"):
        trimmed = normalized.path[: -len("/api")] or ""
        return urlunsplit(normalized._replace(path=f"{trimmed}/v1"))
    return urlunsplit(normalized._replace(path=f"{normalized.path}/v1"))


def is_openrouter_url(value: str) -> bool:
    """Detect whether a base URL resolves through OpenRouter."""
    return "openrouter.ai" in (value or "").strip().lower()


def env_seed(key: str, *fallbacks: str) -> str:
    """Read the first non-empty process env value from a fallback chain."""
    for candidate in (key, *fallbacks):
        value = os.getenv(candidate, "").strip()
        if value:
            return value
    return ""


def inferred_seed_provider(env_values: dict[str, str] | None = None) -> str:
    """Infer an initial provider when no persisted config exists yet."""
    persisted_env = env_values or {}
    explicit = env_seed("HERMES_INFERENCE_PROVIDER")
    if explicit:
        return normalize_provider(explicit)
    if persisted_env.get("CODEX_BASE_URL", "").strip() or env_seed("CODEX_BASE_URL"):
        return "openai-codex"
    if is_codex_cli_enabled("", persisted_env):
        return "openai-codex"
    if persisted_env.get("OLLAMA_BASE_URL", "").strip() or env_seed("OLLAMA_BASE_URL"):
        return "ollama"
    if persisted_env.get("OPENROUTER_API_KEY", "").strip() or env_seed(
        "OPENROUTER_API_KEY"
    ):
        return "openrouter"
    return "auto"


def load_settings() -> HermesSettings:
    """Resolve saved config first, then fall back to runtime env seeds.

    Environment inference is only a first-boot seed. Once config.yaml exists,
    persisted values remain authoritative until the admin UI saves something
    different.
    """
    config_exists = CONFIG_PATH.exists()
    env_exists = ENV_PATH.exists()
    config = read_config_file()
    env_values = read_env_file()
    model = config.get("model") or {}
    if isinstance(model, str):
        model = {"default": model}

    saved_provider = normalize_provider(str(model.get("provider") or ""))
    saved_model = str(model.get("default") or model.get("model") or "").strip()
    active_base_url = str(model.get("base_url") or "").strip()
    saved_ollama_base = env_values.get("OLLAMA_BASE_URL", "").strip()
    saved_codex_base = env_values.get("CODEX_BASE_URL", "").strip()
    # Older installs may have stored the effective custom endpoint in
    # config.yaml, so a non-OpenRouter base_url wins over the dotenv copy.
    if active_base_url and not is_openrouter_url(active_base_url):
        if saved_provider == "openai-codex":
            saved_codex_base = active_base_url
        else:
            saved_ollama_base = active_base_url

    if env_exists:
        ollama_base_url = normalize_ollama_base_url(saved_ollama_base)
        codex_base_url = normalize_ollama_base_url(saved_codex_base)
        ollama_api_key = env_values.get("OLLAMA_API_KEY", "").strip()
        codex_api_key = env_values.get("CODEX_API_KEY", "").strip()
        if not ollama_api_key and active_base_url and not is_openrouter_url(active_base_url):
            if saved_provider in {"custom", "ollama"}:
                ollama_api_key = env_values.get("OPENAI_API_KEY", "").strip()
            elif saved_provider == "openai-codex":
                codex_api_key = env_values.get("OPENAI_API_KEY", "").strip()
        openrouter_api_key = env_values.get("OPENROUTER_API_KEY", "").strip()
    else:
        ollama_base_url = normalize_ollama_base_url(
            saved_ollama_base or env_seed("OLLAMA_BASE_URL")
        )
        codex_base_url = normalize_ollama_base_url(
            saved_codex_base or env_seed("CODEX_BASE_URL")
        )
        ollama_api_key = env_seed("OLLAMA_API_KEY")
        codex_api_key = env_seed("CODEX_API_KEY")
        if not ollama_api_key and active_base_url and not is_openrouter_url(active_base_url):
            if saved_provider in {"custom", "ollama"}:
                ollama_api_key = env_seed("OPENAI_API_KEY")
            elif saved_provider == "openai-codex":
                codex_api_key = env_seed("OPENAI_API_KEY")
        openrouter_api_key = env_seed("OPENROUTER_API_KEY")

    # Keep persisted values authoritative per file once that file exists.
    if config_exists:
        provider = saved_provider
        default_model = saved_model
    else:
        provider = inferred_seed_provider(env_values)
        default_model = env_seed(
            "HERMES_DEFAULT_MODEL",
            "DEFAULT_MODEL",
            "LLM_MODEL",
        )

    return HermesSettings(
        provider=provider,
        default_model=default_model,
        ollama_base_url=ollama_base_url,
        ollama_api_key=ollama_api_key,
        codex_base_url=codex_base_url,
        codex_api_key=codex_api_key,
        openrouter_api_key=openrouter_api_key,
    )


def is_inference_ready(settings: HermesSettings) -> bool:
    """Check whether the current provider has enough data for a real launch."""
    provider = normalize_provider(settings.provider)
    runtime_provider = resolve_runtime_provider(provider)
    env_values = read_env_file()
    has_codex_http_url = bool(
        settings.codex_base_url and not is_codex_cli_base_url(settings.codex_base_url)
    )
    has_codex_cli = codex_cli_ready(settings.codex_base_url, env_values)
    has_codex_cli_auth = codex_cli_has_known_auth(env_values)

    if provider == "openrouter":
        return bool(settings.default_model and settings.openrouter_api_key)
    if provider in {"custom", "ollama"}:
        return bool(settings.default_model and settings.ollama_base_url)
    if provider == "openai-codex":
        return bool(
            settings.default_model
            and (has_codex_http_url or (has_codex_cli and has_codex_cli_auth))
        )
    if provider == "auto":
        return bool(
            settings.default_model
            and (
                settings.openrouter_api_key
                or settings.ollama_base_url
                or has_codex_http_url
                or (has_codex_cli and has_codex_cli_auth)
            )
        )

    required = PROVIDER_ENV_REQUIREMENTS.get(runtime_provider, ())
    if not required:
        return False
    return bool(
        settings.default_model
        and any(env_values.get(key) or os.getenv(key) for key in required)
    )


def seed_files_from_env() -> None:
    """Seed config.yaml and .env once when persisted files are still absent.

    This bootstrap path intentionally never overwrites files after first boot,
    so admin-edited values survive container restarts.
    """
    settings = load_settings()
    if not CONFIG_PATH.exists() and (settings.default_model or settings.ollama_base_url):
        write_config_file(CONFIG_PATH, build_config_payload(settings, {}))
    if not ENV_PATH.exists() and (
        settings.ollama_base_url
        or settings.ollama_api_key
        or settings.codex_base_url
        or settings.codex_api_key
        or settings.openrouter_api_key
    ):
        write_env_file(ENV_PATH, build_env_payload(settings, {}))


def build_config_payload(
    settings: HermesSettings,
    existing_config: dict[str, Any],
) -> dict[str, Any]:
    """Apply admin-managed inference fields without clobbering other config."""
    config = dict(existing_config)
    model = config.get("model") or {}
    if isinstance(model, str):
        model = {"default": model}
    else:
        model = dict(model)

    provider = normalize_provider(settings.provider)
    runtime_provider = resolve_runtime_provider(provider)
    model["provider"] = provider
    if settings.default_model:
        model["default"] = settings.default_model.strip()
    else:
        model.pop("default", None)
        model.pop("model", None)

    if runtime_provider == "custom":
        local_base_url = (
            settings.codex_base_url
            if provider == "openai-codex"
            else settings.ollama_base_url
        )
        if local_base_url:
            model["base_url"] = normalize_ollama_base_url(local_base_url)
        else:
            model.pop("base_url", None)
    elif provider == "openrouter":
        model["base_url"] = DEFAULT_OPENROUTER_BASE_URL
    else:
        model.pop("base_url", None)

    config["model"] = model
    return config


def set_or_remove(target: dict[str, str], key: str, value: str) -> None:
    """Store a non-empty env value or remove the key entirely."""
    if value:
        target[key] = value
    else:
        target.pop(key, None)


def build_env_payload(
    settings: HermesSettings,
    existing_env: dict[str, str],
) -> dict[str, str]:
    """Keep secrets in .env while preserving unrelated user-defined keys.

    For custom OpenAI-compatible providers, Hermes still expects the runtime
    key in OPENAI_API_KEY, so admin-managed values are mirrored there with a
    marker that prevents deleting a user-owned OPENAI_API_KEY later.
    """
    env_values = dict(existing_env)

    set_or_remove(env_values, "OLLAMA_BASE_URL", normalize_ollama_base_url(settings.ollama_base_url))
    set_or_remove(env_values, "OLLAMA_API_KEY", settings.ollama_api_key.strip())
    set_or_remove(env_values, "CODEX_BASE_URL", normalize_ollama_base_url(settings.codex_base_url))
    set_or_remove(env_values, "CODEX_API_KEY", settings.codex_api_key.strip())
    set_or_remove(env_values, "OPENROUTER_API_KEY", settings.openrouter_api_key.strip())

    # Only remove OPENAI_API_KEY when this admin flow created the mirror.
    active_openai_key = ""
    provider = normalize_provider(settings.provider)
    if provider in {"custom", "ollama"}:
        active_openai_key = settings.ollama_api_key.strip()
    elif provider == "openai-codex":
        active_openai_key = settings.codex_api_key.strip()

    if active_openai_key:
        env_values["OPENAI_API_KEY"] = active_openai_key
        env_values[OPENAI_KEY_MARKER] = OPENAI_KEY_MARKER_VALUE
    elif env_values.get(OPENAI_KEY_MARKER) == OPENAI_KEY_MARKER_VALUE:
        env_values.pop("OPENAI_API_KEY", None)
        env_values.pop(OPENAI_KEY_MARKER, None)

    return env_values


def save_settings(payload: dict[str, Any]) -> HermesSettings:
    """Persist admin form data into Hermes config.yaml and .env."""
    settings = HermesSettings(
        provider=normalize_provider(str(payload.get("provider") or "auto")),
        default_model=str(payload.get("default_model") or "").strip(),
        ollama_base_url=normalize_ollama_base_url(str(payload.get("ollama_base_url") or "")),
        ollama_api_key=str(payload.get("ollama_api_key") or "").strip(),
        codex_base_url=normalize_ollama_base_url(str(payload.get("codex_base_url") or "")),
        codex_api_key=str(payload.get("codex_api_key") or "").strip(),
        openrouter_api_key=str(payload.get("openrouter_api_key") or "").strip(),
    )
    write_config_file(CONFIG_PATH, build_config_payload(settings, read_config_file()))
    write_env_file(ENV_PATH, build_env_payload(settings, read_env_file()))
    return settings
