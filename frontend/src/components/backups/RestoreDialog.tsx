/**
 * @ai-context Confirmation dialog for backup restoration with warning icon,
 * "Are you sure?" message, and "Restart gateway after restore" checkbox.
 * @ai-related frontend/src/components/shared/Dialog.tsx
 */

import { useState } from "react";
import type { BackupMeta } from "../../api/types.ts";
import { Dialog } from "../shared/Dialog.tsx";

interface RestoreDialogProps {
  backup: BackupMeta | null;
  onConfirm: (backupId: string, restartGateway: boolean) => void;
  onCancel: () => void;
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

export function RestoreDialog({ backup, onConfirm, onCancel }: RestoreDialogProps) {
  const [restartGateway, setRestartGateway] = useState(true);

  if (!backup) return null;

  return (
    <Dialog
      open={!!backup}
      title="Restore Backup"
      confirmLabel="Restore"
      confirmVariant="danger"
      onConfirm={() => onConfirm(backup.id, restartGateway)}
      onCancel={onCancel}
    >
      <div className="restore-dialog-body">
        <div className="restore-dialog-warning">
          <WarningIcon />
        </div>
        <p className="restore-dialog-heading">Are you sure?</p>
        <p>
          Restoring backup{" "}
          <strong>{backup.label || backup.id}</strong> will overwrite your
          current configuration files.
        </p>
        <p className="hint">
          A safety backup will be created automatically before restoration.
        </p>
        <label className="restore-checkbox-label">
          <input
            type="checkbox"
            checked={restartGateway}
            onChange={(e) => setRestartGateway(e.target.checked)}
          />
          Restart gateway after restore
        </label>
      </div>
    </Dialog>
  );
}
