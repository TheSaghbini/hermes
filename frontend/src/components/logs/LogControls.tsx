/**
 * @ai-context Log controls: connection status dot, auto-scroll toggle, filter input, clear button.
 * Dark terminal-style controls bar matching the log viewer aesthetic.
 * @ai-related frontend/src/components/logs/LogStream.tsx
 */

import { Button } from "../shared/Button.tsx";

interface LogControlsProps {
  autoScroll: boolean;
  onAutoScrollChange: (value: boolean) => void;
  filter: string;
  onFilterChange: (value: string) => void;
  onClear: () => void;
  connected: boolean;
}

/** Filter/search icon */
function SearchIcon() {
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
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

/** Trash/clear icon */
function ClearIcon() {
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

export function LogControls({
  autoScroll,
  onAutoScrollChange,
  filter,
  onFilterChange,
  onClear,
  connected,
}: LogControlsProps) {
  return (
    <div className="log-controls" role="toolbar" aria-label="Log controls">
      <div className="log-controls-left">
        <span
          className={`log-connection-dot ${connected ? "connected" : "disconnected"}`}
          aria-label={connected ? "Connected" : "Disconnected"}
          role="status"
        />
        <span className="log-connection-label">
          {connected ? "Live" : "Offline"}
        </span>
        <label className="log-checkbox-label">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => onAutoScrollChange(e.target.checked)}
          />
          Auto-scroll
        </label>
      </div>
      <div className="log-controls-right">
        <div className="log-filter-wrapper">
          <SearchIcon />
          <label htmlFor="log-filter" className="sr-only">
            Filter logs
          </label>
          <input
            id="log-filter"
            type="text"
            className="log-filter-input"
            placeholder="Filter logs\u2026"
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
            aria-label="Filter log lines"
          />
        </div>
        <Button variant="ghost" size="sm" onClick={onClear} icon={<ClearIcon />}>
          Clear
        </Button>
      </div>
    </div>
  );
}
