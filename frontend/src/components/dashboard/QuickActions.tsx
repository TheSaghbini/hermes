/**
 * @ai-context Quick action buttons for gateway control: start/stop/restart/refresh.
 * Uses inline SVG icons for a polished, production-quality look.
 * @ai-related frontend/src/api/client.ts, frontend/src/components/shared/Button.tsx
 */

import { Button } from "../shared/Button.tsx";

interface QuickActionsProps {
  gatewayRunning: boolean;
  onAction: (action: string) => void;
  onRefresh: () => void;
  disabled?: boolean;
}

/** @ai-context Inline SVG icons for quick actions */
function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function RestartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

export function QuickActions({
  gatewayRunning,
  onAction,
  onRefresh,
  disabled = false,
}: QuickActionsProps) {
  return (
    <div className="quick-actions" role="group" aria-label="Gateway actions">
      {!gatewayRunning && (
        <Button
          variant="primary"
          onClick={() => onAction("start")}
          disabled={disabled}
          icon={<PlayIcon />}
        >
          Start
        </Button>
      )}
      {gatewayRunning && (
        <>
          <Button
            variant="secondary"
            onClick={() => onAction("restart")}
            disabled={disabled}
            icon={<RestartIcon />}
          >
            Restart
          </Button>
          <Button
            variant="danger"
            onClick={() => onAction("stop")}
            disabled={disabled}
            icon={<StopIcon />}
          >
            Stop
          </Button>
        </>
      )}
      <Button variant="ghost" onClick={onRefresh} disabled={disabled} icon={<RefreshIcon />}>
        Refresh
      </Button>
    </div>
  );
}
