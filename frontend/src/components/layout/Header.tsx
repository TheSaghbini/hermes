/**
 * @ai-context Page header component with title and gateway status indicator.
 * Shows a pulsing green pill when running, amber pill when stopped.
 * @ai-related frontend/src/components/shared/Pill.tsx
 */

import { Pill } from "../shared/Pill.tsx";

interface HeaderProps {
  /** Page title displayed as h1 */
  title: string;
  /** Whether the gateway is running; if undefined, no status pill is shown */
  gatewayRunning?: boolean;
}

export function Header({ title, gatewayRunning }: HeaderProps) {
  return (
    <header className="page-header" role="banner">
      <h1 className="page-title">{title}</h1>
      {gatewayRunning !== undefined && (
        <div className="page-header-status">
          <Pill variant={gatewayRunning ? "good" : "warn"}>
            {gatewayRunning ? "Running" : "Stopped"}
          </Pill>
        </div>
      )}
    </header>
  );
}
