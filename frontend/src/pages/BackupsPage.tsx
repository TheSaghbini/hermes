/**
 * @ai-context Backups page with backup list, create, restore, delete, and watchdog config.
 * @ai-related frontend/src/api/client.ts
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

      <div className="panel">
        <div className="backup-create-row">
          <label htmlFor="backup-label" className="sr-only">
            Backup label
          </label>
          <input
            id="backup-label"
            type="text"
            placeholder="Optional label…"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            aria-label="Backup label"
          />
          <Button
            variant="primary"
            onClick={handleCreate}
            disabled={creating}
          >
            {creating ? "Creating…" : "Create Backup"}
          </Button>
        </div>

        {loading ? (
          <p className="hint">Loading backups…</p>
        ) : (
          <BackupList
            backups={backups}
            onRestore={setRestoreTarget}
            onDelete={setDeleteTarget}
          />
        )}
      </div>

      <RestoreDialog
        backup={restoreTarget}
        onConfirm={handleRestore}
        onCancel={() => setRestoreTarget(null)}
      />

      <Dialog
        open={!!deleteTarget}
        title="Delete Backup"
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      >
        <p>
          Are you sure you want to permanently delete backup{" "}
          <strong>{deleteTarget?.label || deleteTarget?.id}</strong>?
        </p>
      </Dialog>

      {/* Watchdog Config */}
      {watchdog && (
        <section className="panel watchdog-section" aria-label="Watchdog configuration">
          <h2>Auto-Restart Watchdog</h2>
          <form onSubmit={handleWatchdogSave}>
            <label className="log-checkbox-label">
              <input
                type="checkbox"
                checked={watchdog.enabled}
                onChange={(e) => updateWatchdog("enabled", e.target.checked)}
              />
              Enable auto-restart
            </label>

            <div className="field-row">
              <div className="field">
                <label htmlFor="wd-retries">Max Retries</label>
                <input
                  id="wd-retries"
                  type="number"
                  min={0}
                  value={watchdog.max_retries}
                  onChange={(e) => updateWatchdog("max_retries", parseInt(e.target.value, 10))}
                />
              </div>
              <div className="field">
                <label htmlFor="wd-backoff-base">Backoff Base (s)</label>
                <input
                  id="wd-backoff-base"
                  type="number"
                  min={0}
                  step={0.5}
                  value={watchdog.backoff_base_seconds}
                  onChange={(e) => updateWatchdog("backoff_base_seconds", parseFloat(e.target.value))}
                />
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="wd-backoff-max">Backoff Max (s)</label>
                <input
                  id="wd-backoff-max"
                  type="number"
                  min={0}
                  value={watchdog.backoff_max_seconds}
                  onChange={(e) => updateWatchdog("backoff_max_seconds", parseFloat(e.target.value))}
                />
              </div>
              <div className="field">
                <label htmlFor="wd-cooldown">Cooldown (s)</label>
                <input
                  id="wd-cooldown"
                  type="number"
                  min={0}
                  value={watchdog.cooldown_seconds}
                  onChange={(e) => updateWatchdog("cooldown_seconds", parseFloat(e.target.value))}
                />
              </div>
            </div>

            <label className="log-checkbox-label">
              <input
                type="checkbox"
                checked={watchdog.notify_on_restart}
                onChange={(e) => updateWatchdog("notify_on_restart", e.target.checked)}
              />
              Notify on auto-restart
            </label>

            <div className="buttons">
              <Button type="submit" variant="primary" disabled={savingWatchdog}>
                {savingWatchdog ? "Saving…" : "Save Watchdog Policy"}
              </Button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
