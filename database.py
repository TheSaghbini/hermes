"""@ai-context SQLite database layer for Hermes conversations, messages, and config.

Purpose: manage a single SQLite database at DATA_DIR/hermes.db with thread-local
connections, WAL mode, schema migrations tracked via PRAGMA user_version, and
public query helpers that return plain dicts.
Dependencies: standard library sqlite3, threading, uuid.
@ai-related server.py, hermes_config.py, backup_manager.py
@ai-security Database file permissions are inherited from DATA_DIR.
"""

from __future__ import annotations

import logging
import sqlite3
import threading
import uuid
from pathlib import Path

from hermes_config import DATA_DIR

LOGGER = logging.getLogger("hermes-admin.database")

DB_PATH: Path = DATA_DIR / "hermes.db"
SCHEMA_VERSION = 1

_local = threading.local()

# ---------------------------------------------------------------------------
# Schema DDL
# ---------------------------------------------------------------------------

SCHEMA_V1 = """\
CREATE TABLE IF NOT EXISTS conversations (
    id            TEXT PRIMARY KEY,
    title         TEXT NOT NULL DEFAULT 'New Conversation',
    model         TEXT NOT NULL,
    system_prompt TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_conversations_updated
    ON conversations(updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
    id                TEXT PRIMARY KEY,
    conversation_id   TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role              TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content           TEXT NOT NULL,
    model             TEXT,
    prompt_tokens     INTEGER,
    completion_tokens INTEGER,
    created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation
    ON messages(conversation_id, created_at ASC);

CREATE TABLE IF NOT EXISTS backups (
    id          TEXT PRIMARY KEY,
    label       TEXT NOT NULL DEFAULT '',
    files       TEXT NOT NULL,
    size_bytes  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS watchdog_config (
    id                   INTEGER PRIMARY KEY CHECK (id = 1),
    enabled              INTEGER NOT NULL DEFAULT 1,
    max_retries          INTEGER NOT NULL DEFAULT 5,
    backoff_base_seconds REAL    NOT NULL DEFAULT 2.0,
    backoff_max_seconds  REAL    NOT NULL DEFAULT 60.0,
    cooldown_seconds     REAL    NOT NULL DEFAULT 300.0,
    notify_on_restart    INTEGER NOT NULL DEFAULT 1
);

INSERT OR IGNORE INTO watchdog_config (id) VALUES (1);
"""

# ---------------------------------------------------------------------------
# Connection helpers
# ---------------------------------------------------------------------------


def get_db() -> sqlite3.Connection:
    """@ai-context Return a thread-local SQLite connection with WAL mode and foreign keys."""
    conn: sqlite3.Connection | None = getattr(_local, "conn", None)
    if conn is not None:
        return conn

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    _local.conn = conn
    return conn


def close_db() -> None:
    """Close the thread-local connection so the DB file can be safely replaced."""
    conn: sqlite3.Connection | None = getattr(_local, "conn", None)
    if conn is not None:
        try:
            conn.close()
        except sqlite3.ProgrammingError:
            pass
        _local.conn = None


def init_db() -> None:
    """@ai-context Create tables, run migrations, and seed the watchdog singleton."""
    conn = get_db()
    _migrate(conn)
    LOGGER.info("Database initialised at %s (schema v%s)", DB_PATH, SCHEMA_VERSION)


def _migrate(conn: sqlite3.Connection) -> None:
    """Apply pending schema migrations using PRAGMA user_version."""
    current = conn.execute("PRAGMA user_version").fetchone()[0]
    if current < 1:
        conn.executescript(SCHEMA_V1)
        conn.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
        LOGGER.info("Applied schema migration v0 → v%s", SCHEMA_VERSION)


# ---------------------------------------------------------------------------
# Conversations
# ---------------------------------------------------------------------------


def create_conversation(
    title: str,
    model: str,
    system_prompt: str = "",
    conversation_id: str | None = None,
) -> dict:
    """Insert a new conversation and return it as a dict."""
    conn = get_db()
    cid = conversation_id or str(uuid.uuid4())
    conn.execute(
        "INSERT INTO conversations (id, title, model, system_prompt) VALUES (?, ?, ?, ?)",
        (cid, title, model, system_prompt),
    )
    conn.commit()
    return _row_to_dict(conn.execute("SELECT * FROM conversations WHERE id = ?", (cid,)).fetchone())


def get_conversation(conversation_id: str) -> dict | None:
    """Return a conversation dict or None if not found."""
    row = get_db().execute("SELECT * FROM conversations WHERE id = ?", (conversation_id,)).fetchone()
    return _row_to_dict(row) if row else None


def list_conversations(limit: int = 50, offset: int = 0) -> list[dict]:
    """Return conversations ordered by most recently updated."""
    rows = get_db().execute(
        "SELECT * FROM conversations ORDER BY updated_at DESC LIMIT ? OFFSET ?",
        (limit, offset),
    ).fetchall()
    return [_row_to_dict(r) for r in rows]


def count_conversations() -> int:
    """Return the total number of persisted conversations."""
    row = get_db().execute("SELECT COUNT(*) AS total FROM conversations").fetchone()
    return int(row["total"] if row is not None else 0)


def update_conversation(conversation_id: str, title: str) -> dict:
    """Rename a conversation and bump its updated_at timestamp."""
    conn = get_db()
    conn.execute(
        "UPDATE conversations SET title = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?",
        (title, conversation_id),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM conversations WHERE id = ?", (conversation_id,)).fetchone()
    if row is None:
        raise ValueError(f"Conversation {conversation_id} not found")
    return _row_to_dict(row)


def delete_conversation(conversation_id: str) -> None:
    """Delete a conversation and its messages (via ON DELETE CASCADE)."""
    conn = get_db()
    conn.execute("DELETE FROM conversations WHERE id = ?", (conversation_id,))
    conn.commit()


# ---------------------------------------------------------------------------
# Messages
# ---------------------------------------------------------------------------


def add_message(
    conversation_id: str,
    role: str,
    content: str,
    model: str | None = None,
    prompt_tokens: int | None = None,
    completion_tokens: int | None = None,
) -> dict:
    """Insert a message and touch the parent conversation's updated_at."""
    conn = get_db()
    mid = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO messages (id, conversation_id, role, content, model, prompt_tokens, completion_tokens) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (mid, conversation_id, role, content, model, prompt_tokens, completion_tokens),
    )
    conn.execute(
        "UPDATE conversations SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?",
        (conversation_id,),
    )
    conn.commit()
    return _row_to_dict(conn.execute("SELECT * FROM messages WHERE id = ?", (mid,)).fetchone())


def get_messages(conversation_id: str) -> list[dict]:
    """Return all messages for a conversation in chronological order."""
    rows = get_db().execute(
        "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
        (conversation_id,),
    ).fetchall()
    return [_row_to_dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Watchdog config (singleton row)
# ---------------------------------------------------------------------------


def get_watchdog_config() -> dict:
    """Read the singleton watchdog policy row."""
    row = get_db().execute("SELECT * FROM watchdog_config WHERE id = 1").fetchone()
    if row is None:
        raise RuntimeError("Watchdog config row missing — call init_db() first")
    cfg = _row_to_dict(row)
    cfg["enabled"] = bool(cfg["enabled"])
    cfg["notify_on_restart"] = bool(cfg["notify_on_restart"])
    return cfg


def set_watchdog_config(**kwargs: object) -> dict:
    """Update one or more watchdog policy fields and return the full config.

    @ai-warning Only known columns are accepted; unknown keys are silently ignored.
    """
    allowed = {
        "enabled", "max_retries", "backoff_base_seconds",
        "backoff_max_seconds", "cooldown_seconds", "notify_on_restart",
    }
    updates = {k: v for k, v in kwargs.items() if k in allowed}
    if not updates:
        return get_watchdog_config()

    # Coerce to correct types to prevent type confusion from user input
    for key in ("enabled", "notify_on_restart"):
        if key in updates:
            updates[key] = int(bool(updates[key]))
    for key in ("max_retries",):
        if key in updates:
            updates[key] = int(updates[key])
    for key in ("backoff_base_seconds", "backoff_max_seconds", "cooldown_seconds"):
        if key in updates:
            updates[key] = float(updates[key])

    set_clause = ", ".join(f"{col} = ?" for col in updates)
    conn = get_db()
    conn.execute(f"UPDATE watchdog_config SET {set_clause} WHERE id = 1", list(updates.values()))
    conn.commit()
    return get_watchdog_config()


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _row_to_dict(row: sqlite3.Row) -> dict:
    """Convert a sqlite3.Row to a plain dict."""
    return dict(row)
