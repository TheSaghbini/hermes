/**
 * @ai-context Backups page with card-based backup list, create form, restore dialog,
 * delete confirmation, and watchdog auto-restart configuration.
 * @ai-related frontend/src/api/client.ts, frontend/src/components/backups/BackupList.tsx, RestoreDialog.tsx
 */

import { useState, useEffect, useCallback, type FormEvent } from "react";
import { Header } from "../components/layout/Header.tsx";
import { BackupList } from "../components/backups/BackupList.tsx";
import { RestoreDialog } from "../components/backups/RestoreDialog.tsx";
import { Button } from "../components/shared/Button.tsx";
import { Dialog } from "../components/shared/Dialog.tsx";
import { useToast } from "../components/shared/Toast.tsx";
import {
  getBackups,
  createBackup,
  restoreBackup,
  deleteBackup,
  getWatchdog,
  setWatchdog,
} from "../api/client.ts";
import type { BackupMeta, WatchdogPolicy } from "../api/types.ts";

/** Upload/create backup icon */
function UploadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="20"
      height="20"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

/** Plus icon */
function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="16"
      height="16"
      aria-hidden="true"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

/** Shield/watchdog icon */
function ShieldIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="20"
      height="20"
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

/** Save/floppy icon */
function SaveIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="16"
      height="16"
      aria-hidden="true"
    >
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );
}

/** Warning triangle icon */
function WarningIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="24"
      height="24"
      aria-hidden="true"
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

/** Loading spinner icon */
function SpinnerIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="24"
      height="24"
      className="spin-icon"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

export function BackupsPage() {
  const { addToast } = useToast();

  const [backups, setBackups] = useState<BackupMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [restoreTarget, setRestoreTarget] = useState<BackupMeta | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BackupMeta | null>(null);

  // Watchdog state
  const [watchdog, setWatchdogState] = useState<WatchdogPolicy | null>(null);
  const [savingWatchdog, setSavingWatchdog] = useState(false);

  const loadBackups = useCallback(async () => {
    try {
      const result = await getBackups();
      setBackups(result.backups);
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : "Failed to load backups.");
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  const loadWatchdog = useCallback(async () => {
    try {
      const policy = await getWatchdog();
      setWatchdogState(policy);
    } catch {
      /* watchdog config may not exist yet */
    }
  }, []);

  useEffect(() => {
    loadBackups();
    loadWatchdog();
  }, [loadBackups, loadWatchdog]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await createBackup(newLabel || undefined);
      setNewLabel("");
      addToast("success", "Backup created.");
      await loadBackups();
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : "Failed to create backup.");
    } finally {
      setCreating(false);
    }
  };

  const handleRestore = async (backupId: string, restartGateway: boolean) => {
    try {
      await restoreBackup(backupId, restartGateway);
      addToast("success", "Backup restored.");
      setRestoreTarget(null);
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : "Restore failed.");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteBackup(deleteTarget.id);
      addToast("success", "Backup deleted.");
      setDeleteTarget(null);
      await loadBackups();
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : "Delete failed.");
    }
  };

  const handleWatchdogSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!watchdog) return;
    setSavingWatchdog(true);
    try {
      const updated = await setWatchdog(watchdog);
      setWatchdogState(updated);
      addToast("success", "Watchdog policy saved.");
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : "Failed to save watchdog policy.");
    } finally {
      setSavingWatchdog(false);
    }
  };

  const updateWatchdog = (field: keyof WatchdogPolicy, value: unknown) => {
    setWatchdogState((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  return (
    <div className="backups-page">
      <Header title="Backups" />

      {/* Create Backup Card */}
      <div className="panel backup-create-card">
        <div className="backup-create-card-header">
          <div className="backup-create-card-icon">
            <UploadIcon />
          </div>
          <div>
            <h2 className="backup-create-card-title">Create Backup</h2>
            <p className="backup-create-card-desc">
              Snapshot the current gateway configuration and data.
            </p>
          </div>
        </div>
        <div className="backup-create-row">
          <label htmlFor="backup-label" className="sr-only">
            Backup label
          </label>
          <input
            id="backup-label"
            type="text"
            placeholder="Optional label for this backup\u2026"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            aria-label="Backup label"
          />
          <Button
            variant="primary"
            onClick={handleCreate}
            disabled={creating}
            icon={<PlusIcon />}
          >
            {creating ? "Creating\u2026" : "Create Backup"}
          </Button>
        </div>
      </div>

      {/* Backup List */}
      {loading ? (
        <div className="panel">
          <div className="backup-loading">
            <SpinnerIcon />
            <span>Loading backups\u2026</span>
          </div>
        </div>
      ) : (
        <BackupList
          backups={backups}
          onRestore={setRestoreTarget}
          onDelete={setDeleteTarget}
        />
      )}

      {/* Restore Dialog */}
      <RestoreDialog
        backup={restoreTarget}
        onConfirm={handleRestore}
        onCancel={() => setRestoreTarget(null)}
      />

      {/* Delete Confirmation */}
      <Dialog
        open={!!deleteTarget}
        title="Delete Backup"
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      >
        <div className="dialog-warning-body">
          <WarningIcon />
          <p>
            Are you sure you want to permanently delete backup{" "}
            <strong>{deleteTarget?.label || deleteTarget?.id}</strong>? This
            action cannot be undone.
          </p>
        </div>
      </Dialog>

      {/* Watchdog Config */}
      {watchdog && (
        <section className="panel watchdog-section" aria-label="Watchdog configuration">
          <div className="watchdog-header">
            <div className="watchdog-header-left">
              <div className="watchdog-icon">
                <ShieldIcon />
              </div>
              <div>
                <h2 className="watchdog-title">Auto-Restart Watchdog</h2>
                <p className="watchdog-desc">
                  Automatically restart the gateway when it crashes unexpectedly.
                </p>
              </div>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={watchdog.enabled}
                onChange={(e) => updateWatchdog("enabled", e.target.checked)}
                aria-label="Enable auto-restart watchdog"
              />
              <span className="toggle-track" />
              <span className="toggle-label">Enable auto-restart</span>
            </label>
          </div>

          <form onSubmit={handleWatchdogSave} className="watchdog-form">
            <div className="watchdog-fields">
              <div className="field">
                <label htmlFor="wd-retries">Max Retries</label>
                <input
                  id="wd-retries"
                  type="number"
                  min={0}
                  value={watchdog.max_retries}
                  onChange={(e) =>
                    updateWatchdog("max_retries", parseInt(e.target.value, 10))
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="wd-backoff-base">Backoff Base (s)</label>
                <input
                  id="wd-backoff-base"
                  type="number"
                  min={0}
                  value={watchdog.backoff_base_seconds}
                  onChange={(e) =>
                    updateWatchdog(
                      "backoff_base_seconds",
                      parseInt(e.target.value, 10),
                    )
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="wd-backoff-max">Backoff Max (s)</label>
                <input
                  id="wd-backoff-max"
                  type="number"
                  min={0}
                  value={watchdog.backoff_max_seconds}
                  onChange={(e) =>
                    updateWatchdog(
                      "backoff_max_seconds",
                      parseInt(e.target.value, 10),
                    )
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="wd-cooldown">Cooldown (s)</label>
                <input
                  id="wd-cooldown"
                  type="number"
                  min={0}
                  value={watchdog.cooldown_seconds}
                  onChange={(e) =>
                    updateWatchdog(
                      "cooldown_seconds",
                      parseInt(e.target.value, 10),
                    )
                  }
                />
              </div>
            </div>
            <div className="watchdog-actions">
              <Button
                type="submit"
                variant="primary"
                disabled={savingWatchdog}
                icon={<SaveIcon />}
              >
                {savingWatchdog ? "Saving\u2026" : "Save Watchdog"}
              </Button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
