/**
 * @ai-context Gateway status card with icon, status indicator (green/amber dot with pulse),
 * PID, uptime, and recent log lines.
 * @ai-related frontend/src/api/types.ts, frontend/src/components/shared/Pill.tsx
 */

import type { GatewayState } from "../../api/types.ts";

interface GatewayStatusProps {
  gateway: GatewayState;
}

/** @ai-context Inline SVG icon for server */
function ServerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" />
      <line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  );
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
    <div className="status-card">
      <div className={`status-card-icon ${gateway.running ? "green" : "amber"}`}>
        <ServerIcon />
      </div>
      <div className="status-card-body">
        <p className="status-card-label">Gateway</p>
        <p className="status-card-value" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            className={`status-dot ${gateway.running ? "status-dot-running" : "status-dot-stopped"}`}
            aria-hidden="true"
          />
          {gateway.running ? "Running" : "Stopped"}
          {gateway.pid != null && (
            <span className="status-card-detail">PID {gateway.pid}</span>
          )}
        </p>
        {gateway.uptime != null && (
          <p className="status-card-detail">Uptime: {formatUptime(gateway.uptime)}</p>
        )}
      </div>
    </div>
  );
}
