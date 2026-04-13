/**
 * @ai-context Log controls: auto-scroll toggle, filter input, clear display button.
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
        <label className="log-checkbox-label">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => onAutoScrollChange(e.target.checked)}
          />
          Auto-scroll
        </label>
        <span className={`log-connection-dot ${connected ? "connected" : "disconnected"}`} aria-label={connected ? "Connected" : "Disconnected"} role="status" />
      </div>
      <div className="log-controls-right">
        <label htmlFor="log-filter" className="sr-only">
          Filter logs
        </label>
        <input
          id="log-filter"
          type="text"
          className="log-filter-input"
          placeholder="Filter logs…"
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          aria-label="Filter log lines"
        />
        <Button variant="secondary" onClick={onClear}>
          Clear
        </Button>
      </div>
    </div>
  );
}
