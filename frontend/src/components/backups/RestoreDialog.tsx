/**
 * @ai-context Confirmation dialog for backup restoration.
 * Includes a checkbox to restart the gateway after restore.
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
      <p>
        Are you sure you want to restore the backup{" "}
        <strong>{backup.label || backup.id}</strong>? This will overwrite current
        configuration files.
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
    </Dialog>
  );
}
