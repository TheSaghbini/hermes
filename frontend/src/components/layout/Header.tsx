/**
 * @ai-context Page header component with title and gateway status pill.
 * @ai-related frontend/src/components/shared/Pill.tsx
 */

import { Pill } from "../shared/Pill.tsx";

interface HeaderProps {
  title: string;
  gatewayRunning?: boolean;
}

export function Header({ title, gatewayRunning }: HeaderProps) {
  return (
    <header className="page-header">
      <h1 className="page-title">{title}</h1>
      {gatewayRunning !== undefined && (
        <Pill variant={gatewayRunning ? "good" : "warn"}>
          {gatewayRunning ? "Running" : "Stopped"}
        </Pill>
      )}
    </header>
  );
}
