/**
 * @ai-context Quick action buttons for gateway control: start/stop/restart/refresh.
 * @ai-related frontend/src/api/client.ts
 */

import { Button } from "../shared/Button.tsx";

interface QuickActionsProps {
  gatewayRunning: boolean;
  onAction: (action: string) => void;
  onRefresh: () => void;
  disabled?: boolean;
}

export function QuickActions({
  gatewayRunning,
  onAction,
  onRefresh,
  disabled = false,
}: QuickActionsProps) {
  return (
    <div className="status-actions" role="group" aria-label="Gateway actions">
      {!gatewayRunning && (
        <Button
          variant="primary"
          onClick={() => onAction("start")}
          disabled={disabled}
        >
          Start Gateway
        </Button>
      )}
      {gatewayRunning && (
        <>
          <Button
            variant="secondary"
            onClick={() => onAction("restart")}
            disabled={disabled}
          >
            Restart
          </Button>
          <Button
            variant="danger"
            onClick={() => onAction("stop")}
            disabled={disabled}
          >
            Stop Gateway
          </Button>
        </>
      )}
      <Button variant="secondary" onClick={onRefresh} disabled={disabled}>
        Refresh Status
      </Button>
    </div>
  );
}
