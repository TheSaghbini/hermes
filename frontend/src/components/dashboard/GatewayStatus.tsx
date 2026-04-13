/**
 * @ai-context Gateway status display with running/stopped pill, PID, and uptime.
 * @ai-related frontend/src/api/types.ts
 */

import type { GatewayState } from "../../api/types.ts";
import { Pill } from "../shared/Pill.tsx";

interface GatewayStatusProps {
  gateway: GatewayState;
}

function formatUptime(seconds: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export function GatewayStatus({ gateway }: GatewayStatusProps) {
  return (
    <div className="panel gateway-status">
      <h2>Gateway Status</h2>
      <div className="gateway-status-row">
        <Pill variant={gateway.running ? "good" : "warn"}>
          {gateway.running ? "Running" : "Stopped"}
        </Pill>
      </div>
      <dl className="summary-list">
        <dt>PID</dt>
        <dd>{gateway.pid ?? "—"}</dd>
        <dt>Uptime</dt>
        <dd>{formatUptime(gateway.uptime)}</dd>
      </dl>
      {gateway.logs.length > 0 && (
        <div className="logs" aria-label="Gateway logs">
          <pre>{gateway.logs.join("\n")}</pre>
        </div>
      )}
    </div>
  );
}
