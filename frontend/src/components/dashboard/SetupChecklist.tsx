/**
 * @ai-context Setup checklist as a horizontal step progress indicator.
 * Shows Provider → Model → Endpoint → Connection → Gateway with numbered circles and connecting lines.
 * @ai-related frontend/src/api/types.ts
 */

import type { StatusPayload, ConnectionTestResult } from "../../api/types.ts";

interface SetupChecklistProps {
  status: StatusPayload;
  connectionResult: ConnectionTestResult | null;
}

type CheckState = "pass" | "fail" | "pending";

interface CheckItem {
  label: string;
  state: CheckState;
  id: string;
  shortLabel: string;
}

function getCheckStates(
  status: StatusPayload,
  connectionResult: ConnectionTestResult | null,
): CheckItem[] {
  const { config, gateway } = status;

  const providerOk = config.provider && config.provider !== "auto";
  const modelOk = !!config.default_model;
  const endpointOk = config.ollama_configured || config.openrouter_configured;

  let connectionState: CheckState = "pending";
  if (connectionResult !== null) {
    connectionState = connectionResult.success ? "pass" : "fail";
  }

  let gatewayState: CheckState = "pending";
  if (gateway.running) {
    gatewayState = "pass";
  } else if (config.ready) {
    gatewayState = "fail";
  }

  return [
    { label: "Provider selected", shortLabel: "Provider", state: providerOk || modelOk ? "pass" : "pending", id: "check-provider" },
    { label: "Model configured", shortLabel: "Model", state: modelOk ? "pass" : "fail", id: "check-model" },
    { label: "Endpoint configured", shortLabel: "Endpoint", state: endpointOk ? "pass" : "fail", id: "check-endpoint" },
    { label: "Connection verified", shortLabel: "Connection", state: connectionState, id: "check-connection" },
    { label: "Gateway running", shortLabel: "Gateway", state: gatewayState, id: "check-gateway" },
  ];
}

/** @ai-context Inline SVG checkmark icon */
function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/** @ai-context Inline SVG X icon */
function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function SetupChecklist({ status, connectionResult }: SetupChecklistProps) {
  const checks = getCheckStates(status, connectionResult);
  const completedCount = checks.filter((c) => c.state === "pass").length;

  return (
    <div className="panel" role="region" aria-label="Setup checklist">
      <div className="checklist-header">
        <h3 className="checklist-title">Setup Progress</h3>
        <span className="checklist-counter">{completedCount}/{checks.length} complete</span>
      </div>

      <div className="step-progress" role="list" aria-label="Setup steps">
        {checks.map((check, index) => (
          <div
            key={check.id}
            className={`step-item step-item-${check.state}`}
            role="listitem"
            aria-label={`${check.label}: ${check.state === "pass" ? "complete" : check.state === "fail" ? "incomplete" : "pending"}`}
          >
            {index > 0 && (
              <div className={`step-connector step-connector-${checks[index - 1].state === "pass" ? "complete" : "incomplete"}`} aria-hidden="true" />
            )}
            <div className="step-circle">
              {check.state === "pass" ? <CheckIcon /> : check.state === "fail" ? <XIcon /> : <span className="step-number">{index + 1}</span>}
            </div>
            <span className="step-label">{check.shortLabel}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
