/**
 * @ai-context Backup list as cards with restore, delete, and download actions.
 * Each card shows label, date, size, file count, and action buttons.
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

/** Calendar/date icon */
function CalendarIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="14"
      height="14"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

/** Hard drive / size icon */
function SizeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="14"
      height="14"
      aria-hidden="true"
    >
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10" />
    </svg>
  );
}

/** File/files icon */
function FilesIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="14"
      height="14"
      aria-hidden="true"
    >
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="13 2 13 9 20 9" />
    </svg>
  );
}

/** Restore/rewind icon */
function RestoreIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="14"
      height="14"
      aria-hidden="true"
    >
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  );
}

/** Download icon */
function DownloadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="14"
      height="14"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

/** Trash/delete icon */
function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="14"
      height="14"
      aria-hidden="true"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

/** Empty state icon */
function EmptyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="40"
      height="40"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

export function BackupList({ backups, onRestore, onDelete }: BackupListProps) {
  if (backups.length === 0) {
    return (
      <div className="backup-empty-state">
        <EmptyIcon />
        <p className="backup-empty-title">No backups found</p>
        <p className="backup-empty-hint">
          Create a backup to get started. Backups snapshot your gateway configuration and data.
        </p>
      </div>
    );
  }

  return (
    <div className="backup-card-grid">
      {backups.map((backup) => (
        <div key={backup.id} className="backup-card">
          <div className="backup-card-header">
            <h3 className="backup-card-label">{backup.label || backup.id}</h3>
          </div>
          <div className="backup-card-meta">
            <div className="backup-card-meta-item">
              <CalendarIcon />
              <time dateTime={backup.created_at}>
                {new Date(backup.created_at).toLocaleString()}
              </time>
            </div>
            <div className="backup-card-meta-item">
              <SizeIcon />
              <span>{formatBytes(backup.size_bytes)}</span>
            </div>
            <div className="backup-card-meta-item">
              <FilesIcon />
              <span>{backup.files.length} file{backup.files.length !== 1 ? "s" : ""}</span>
            </div>
          </div>
          {backup.files.length > 0 && (
            <div className="backup-card-files">
              {backup.files.map((file) => (
                <span key={file} className="backup-file-tag">
                  {file}
                </span>
              ))}
            </div>
          )}
          <div className="backup-card-actions">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onRestore(backup)}
              icon={<RestoreIcon />}
            >
              Restore
            </Button>
            <a
              href={downloadBackupUrl(backup.id)}
              className="btn secondary btn-sm backup-download-btn"
              download
              aria-label={`Download backup ${backup.label || backup.id}`}
            >
              <span className="btn-icon" aria-hidden="true">
                <DownloadIcon />
              </span>
              Download
            </a>
            <Button
              variant="danger"
              size="sm"
              onClick={() => onDelete(backup)}
              icon={<TrashIcon />}
            >
              Delete
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
