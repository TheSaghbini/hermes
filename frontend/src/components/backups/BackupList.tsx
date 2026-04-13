/**
 * @ai-context Backup list table with restore, delete, and download actions.
 * @ai-related frontend/src/api/client.ts
 */

import type { BackupMeta } from "../../api/types.ts";
import { Button } from "../shared/Button.tsx";
import { downloadBackupUrl } from "../../api/client.ts";

interface BackupListProps {
  backups: BackupMeta[];
  onRestore: (backup: BackupMeta) => void;
  onDelete: (backup: BackupMeta) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function BackupList({ backups, onRestore, onDelete }: BackupListProps) {
  if (backups.length === 0) {
    return <p className="hint">No backups found. Create one to get started.</p>;
  }

  return (
    <div className="backup-list-wrapper">
      <table className="backup-table" aria-label="Backups">
        <thead>
          <tr>
            <th scope="col">Label</th>
            <th scope="col">Date</th>
            <th scope="col">Size</th>
            <th scope="col">Files</th>
            <th scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {backups.map((backup) => (
            <tr key={backup.id}>
              <td>{backup.label || backup.id}</td>
              <td>
                <time dateTime={backup.created_at}>
                  {new Date(backup.created_at).toLocaleString()}
                </time>
              </td>
              <td>{formatBytes(backup.size_bytes)}</td>
              <td>{backup.files.join(", ")}</td>
              <td className="backup-actions">
                <Button variant="secondary" onClick={() => onRestore(backup)}>
                  Restore
                </Button>
                <a
                  href={downloadBackupUrl(backup.id)}
                  className="btn secondary"
                  download
                  aria-label={`Download backup ${backup.label || backup.id}`}
                >
                  Download
                </a>
                <Button variant="danger" onClick={() => onDelete(backup)}>
                  Delete
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
