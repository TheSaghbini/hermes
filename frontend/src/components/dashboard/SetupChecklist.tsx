/**
 * @ai-context Setup checklist showing provider→model→endpoint→connection→gateway status.
 * Ports the check-item logic from the legacy app.js.
 * @ai-related frontend/src/api/types.ts, static/app.js
 */

import type { StatusPayload, ConnectionTestResult } from "../../api/types.ts";

interface SetupChecklistProps {
  status: StatusPayload;
  connectionResult: ConnectionTestResult | null;
}

type CheckState = "pass" | "fail" | "pending";

function getCheckStates(
  status: StatusPayload,
  connectionResult: ConnectionTestResult | null,
): { label: string; state: CheckState; id: string }[] {
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
    { label: "Provider selected", state: providerOk || modelOk ? "pass" : "pending", id: "check-provider" },
    { label: "Model configured", state: modelOk ? "pass" : "fail", id: "check-model" },
    { label: "Endpoint configured", state: endpointOk ? "pass" : "fail", id: "check-endpoint" },
    { label: "Connection verified", state: connectionState, id: "check-connection" },
    { label: "Gateway running", state: gatewayState, id: "check-gateway" },
  ];
}

export function SetupChecklist({ status, connectionResult }: SetupChecklistProps) {
  const checks = getCheckStates(status, connectionResult);

  return (
    <div className="checklist" role="region" aria-label="Setup checklist">
      <h3>Setup Checklist</h3>
      <ul className="check-items" role="list">
        {checks.map(({ label, state, id }) => (
          <li
            key={id}
            className={`check-item ${state}`}
            aria-label={`${label}: ${state === "pass" ? "complete" : state === "fail" ? "incomplete" : "pending"}`}
          >
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}
