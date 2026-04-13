"""@ai-context Backup and restore orchestration for Hermes config and database.

Purpose: create timestamped backup snapshots of config.yaml, .env, and hermes.db,
list/restore/delete backups, and provide tar.gz downloads.  Each backup lives in
its own directory under DATA_DIR/backups/<id>/ with a manifest.json.
Dependencies: standard library shutil, tarfile, json, uuid, tempfile.
@ai-related server.py, hermes_config.py, database.py
@ai-security Backup IDs are validated against path-traversal (alphanumeric + T + Z).
"""

from __future__ import annotations

import json
import logging
import re
import shutil
import tarfile
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from hermes_config import CONFIG_PATH, DATA_DIR, ENV_PATH, HERMES_HOME

LOGGER = logging.getLogger("hermes-admin.backup")

BACKUP_DIR: Path = DATA_DIR / "backups"
MAX_BACKUPS = 20

# @ai-security Only allow alphanumeric chars plus 'T' and 'Z' (timestamp format).
_VALID_BACKUP_ID = re.compile(r"^[0-9A-Za-z]+$")

# Files to include in every backup (source path → filename stored in backup).
_BACKUP_SOURCES: list[tuple[Path, str]] = [
    (CONFIG_PATH, "config.yaml"),
    (ENV_PATH, ".env"),
    (DATA_DIR / "hermes.db", "hermes.db"),
]


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


def _validate_backup_id(backup_id: str) -> None:
    """@ai-security Reject IDs that could cause path traversal."""
    if not backup_id or not _VALID_BACKUP_ID.match(backup_id):
        raise ValueError(f"Invalid backup ID: {backup_id!r}")


def _backup_path(backup_id: str) -> Path:
    """Return the directory for a given backup after validating the ID."""
    _validate_backup_id(backup_id)
    return BACKUP_DIR / backup_id


# ---------------------------------------------------------------------------
# Public interface
# ---------------------------------------------------------------------------


def create_backup(label: str = "") -> dict:
    """@ai-context Copy current config files and DB into a timestamped backup directory.

    Returns backup metadata dict.  Automatically prunes oldest backups beyond MAX_BACKUPS.
    """
    backup_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    dest = _backup_path(backup_id)
    dest.mkdir(parents=True, exist_ok=True)

    included_files: list[str] = []
    total_size = 0

    for source, filename in _BACKUP_SOURCES:
        if source.exists():
            target = dest / filename
            shutil.copy2(source, target)
            total_size += target.stat().st_size
            included_files.append(filename)
            LOGGER.debug("Backed up %s → %s", source, target)

    manifest = {
        "id": backup_id,
        "label": label,
        "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "size_bytes": total_size,
        "files": included_files,
    }
    (dest / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    LOGGER.info("Created backup %s (%d files, %d bytes)", backup_id, len(included_files), total_size)
    _auto_prune()
    return manifest


def list_backups() -> list[dict]:
    """Return all backup manifests sorted newest-first."""
    if not BACKUP_DIR.is_dir():
        return []

    backups: list[dict] = []
    for entry in BACKUP_DIR.iterdir():
        if not entry.is_dir():
            continue
        manifest_path = entry / "manifest.json"
        if manifest_path.exists():
            try:
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                backups.append(manifest)
            except (json.JSONDecodeError, OSError):
                LOGGER.warning("Skipping corrupt manifest in %s", entry)
    backups.sort(key=lambda b: b.get("created_at", ""), reverse=True)
    return backups


def get_backup(backup_id: str) -> dict | None:
    """Return metadata for a single backup, or None if not found."""
    _validate_backup_id(backup_id)
    manifest_path = _backup_path(backup_id) / "manifest.json"
    if not manifest_path.exists():
        return None
    try:
        return json.loads(manifest_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        LOGGER.warning("Corrupt manifest for backup %s", backup_id)
        return None


def restore_backup(backup_id: str) -> dict:
    """@ai-context Overwrite current files with backup contents.

    Automatically creates a pre-restore safety backup first.
    Returns the metadata of the restored backup.

    @ai-warning This overwrites config.yaml, .env, and hermes.db in-place.
    """
    _validate_backup_id(backup_id)
    source_dir = _backup_path(backup_id)
    manifest_path = source_dir / "manifest.json"

    if not manifest_path.exists():
        raise FileNotFoundError(f"Backup {backup_id} not found")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    # @ai-context Safety net: snapshot current state before restoring.
    LOGGER.info("Creating pre-restore safety backup before restoring %s", backup_id)
    create_backup(label=f"pre-restore ({backup_id})")

    # Restore each file to its original location.
    restore_targets: dict[str, Path] = {
        "config.yaml": CONFIG_PATH,
        ".env": ENV_PATH,
        "hermes.db": DATA_DIR / "hermes.db",
    }

    for filename in manifest.get("files", []):
        target = restore_targets.get(filename)
        if target is None:
            continue
        backup_file = source_dir / filename
        if not backup_file.exists():
            LOGGER.warning("Expected file %s missing from backup %s", filename, backup_id)
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(backup_file, target)
        LOGGER.info("Restored %s → %s", backup_file, target)

    LOGGER.info("Restore of backup %s complete", backup_id)
    return manifest


def delete_backup(backup_id: str) -> None:
    """Remove a backup directory."""
    _validate_backup_id(backup_id)
    target = _backup_path(backup_id)
    if target.is_dir():
        shutil.rmtree(target)
        LOGGER.info("Deleted backup %s", backup_id)


def download_backup(backup_id: str) -> Path:
    """@ai-context Create a temporary tar.gz of the backup for download.

    Returns the Path to the temporary archive.  The caller is responsible for
    cleanup (e.g. Flask's after_request or send_file with a temp path).
    """
    _validate_backup_id(backup_id)
    source_dir = _backup_path(backup_id)
    if not source_dir.is_dir():
        raise FileNotFoundError(f"Backup {backup_id} not found")

    tmp = tempfile.NamedTemporaryFile(
        prefix=f"hermes-backup-{backup_id}-",
        suffix=".tar.gz",
        delete=False,
    )
    tmp.close()
    archive_path = Path(tmp.name)

    with tarfile.open(archive_path, "w:gz") as tar:
        for item in source_dir.iterdir():
            tar.add(item, arcname=item.name)

    LOGGER.info("Created download archive for backup %s at %s", backup_id, archive_path)
    return archive_path


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _auto_prune() -> None:
    """Delete oldest backups when total count exceeds MAX_BACKUPS."""
    all_backups = list_backups()
    if len(all_backups) <= MAX_BACKUPS:
        return

    # list_backups returns newest-first; prune from the tail.
    to_prune = all_backups[MAX_BACKUPS:]
    for backup in to_prune:
        try:
            delete_backup(backup["id"])
            LOGGER.info("Auto-pruned old backup %s", backup["id"])
        except (ValueError, OSError):
            LOGGER.warning("Failed to prune backup %s", backup.get("id"))
