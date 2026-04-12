/* @ai-context Client-side admin UI logic for status refresh and save actions.
Purpose: keep the SPA aligned with the Flask admin API using same-origin JSON
requests only.
Dependencies: templates/index.html, server.py.
@ai-related templates/index.html, server.py, static/app.css
*/

const form = document.getElementById("config-form");
const statusMessage = document.getElementById("status-message");
const logs = document.getElementById("gateway-logs");
const gatewayPill = document.getElementById("gateway-pill");
const summaryProvider = document.getElementById("summary-provider");
const summaryEndpoint = document.getElementById("summary-endpoint");
const summaryOllama = document.getElementById("summary-ollama");
const summaryReady = document.getElementById("summary-ready");
const summaryPid = document.getElementById("summary-pid");
const connectionResultEl = document.getElementById("connection-result");

/* @ai-context Stores the last connection-test result for checklist updates. */
let lastConnectionResult = null;

async function requestJson(url, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const headers = {
    Accept: "application/json",
    ...(options.headers || {}),
  };

  if (method !== "GET" && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    credentials: "same-origin",
    mode: "same-origin",
    ...options,
    headers,
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }
  return payload;
}

function applyStatus(payload) {
  const { config, gateway } = payload;
  form.provider.value = config.provider;
  form.default_model.value = config.default_model || "";
  form.ollama_base_url.value = config.ollama_base_url || "";

  // Don't overwrite password fields with masked values from the server.
  const masked = "\u2022\u2022\u2022\u2022";
  if (!config.ollama_api_key.startsWith(masked)) {
    form.ollama_api_key.value = config.ollama_api_key || "";
  }
  if (!config.openrouter_api_key.startsWith(masked)) {
    form.openrouter_api_key.value = config.openrouter_api_key || "";
  }

  gatewayPill.textContent = gateway.running ? "Gateway running" : "Gateway stopped";
  gatewayPill.className = `pill ${gateway.running ? "good" : "warn"}`;
  summaryProvider.textContent = config.provider || "auto";
  summaryEndpoint.textContent = config.active_base_url || "Not set";
  summaryOllama.textContent = config.ollama_configured ? "Yes" : "No";
  summaryReady.textContent = config.ready ? "Yes" : "No";
  summaryPid.textContent = gateway.pid || "-";
  logs.textContent = gateway.logs.length ? gateway.logs.join("\n") : "No logs captured yet.";
  updateChecklist(payload, lastConnectionResult);
}

async function refreshStatus(message = "") {
  try {
    const payload = await requestJson("/api/status", { method: "GET" });
    applyStatus(payload);
    statusMessage.textContent = message;
  } catch (error) {
    statusMessage.textContent = error.message;
  }
}

async function saveConfig(restartGateway) {
  statusMessage.textContent = restartGateway
    ? "Saving and restarting gateway..."
    : "Saving configuration...";

  const payload = {
    provider: form.provider.value,
    default_model: form.default_model.value,
    ollama_base_url: form.ollama_base_url.value,
    ollama_api_key: form.ollama_api_key.value,
    openrouter_api_key: form.openrouter_api_key.value,
    restart_gateway: restartGateway,
  };

  try {
    const updated = await requestJson("/api/config", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    applyStatus(updated);
    statusMessage.textContent = restartGateway
      ? "Configuration saved and gateway restarted."
      : "Configuration saved. Gateway state unchanged.";
  } catch (error) {
    statusMessage.textContent = error.message;
  }
}

async function gatewayAction(action) {
  statusMessage.textContent = `Gateway ${action} requested...`;
  try {
    const updated = await requestJson(`/api/gateway/${action}`, {
      method: "POST",
      body: "{}",
    });
    applyStatus(updated);
    statusMessage.textContent = `Gateway ${action} completed.`;
  } catch (error) {
    statusMessage.textContent = error.message;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveConfig(false);
});

document.getElementById("save-restart").addEventListener("click", async () => {
  await saveConfig(true);
});

document.getElementById("refresh-status").addEventListener("click", async () => {
  await refreshStatus("Status refreshed.");
});

document.getElementById("start-gateway").addEventListener("click", async () => {
  await gatewayAction("start");
});

document.getElementById("restart-gateway").addEventListener("click", async () => {
  await gatewayAction("restart");
});

document.getElementById("stop-gateway").addEventListener("click", async () => {
  await gatewayAction("stop");
});

/* @ai-context Updates each checklist item to pass/fail/pending based on status. */
function updateChecklist(statusPayload, connectionResult) {
  const { config, gateway } = statusPayload;

  function setCheck(id, state) {
    const el = document.getElementById(id);
    if (el) el.className = `check-item ${state}`;
  }

  // Provider selected
  const providerOk = config.provider && config.provider !== "auto";
  setCheck("check-provider", providerOk ? "pass" : (config.default_model ? "pass" : "pending"));

  // Model configured
  setCheck("check-model", config.default_model ? "pass" : "fail");

  // Endpoint configured
  const endpointOk = config.ollama_configured || config.openrouter_configured;
  setCheck("check-endpoint", endpointOk ? "pass" : "fail");

  // Connection verified
  if (connectionResult === null) {
    setCheck("check-connection", "pending");
  } else {
    setCheck("check-connection", connectionResult.success ? "pass" : "fail");
  }

  // Gateway running
  if (gateway.running) {
    setCheck("check-gateway", "pass");
  } else {
    setCheck("check-gateway", config.ready ? "fail" : "pending");
  }
}

/* @ai-context Calls /api/test-connection and renders the result inline. */
async function testConnection() {
  connectionResultEl.textContent = "Testing connection…";
  connectionResultEl.className = "connection-result testing";

  try {
    const result = await requestJson("/api/test-connection", {
      method: "POST",
      body: "{}",
    });
    lastConnectionResult = result;

    if (result.success) {
      const modelCount = result.models ? result.models.length : 0;
      const modelNote = result.model_configured
        ? "Configured model found."
        : "⚠ Configured model not found in endpoint model list.";
      connectionResultEl.textContent =
        `Connected in ${result.latency_ms}ms · ${modelCount} model${modelCount !== 1 ? "s" : ""} available · ${modelNote}`;
      connectionResultEl.className = "connection-result success";
    } else {
      connectionResultEl.textContent = result.error || "Connection failed.";
      connectionResultEl.className = "connection-result failure";
    }

    // Re-run checklist with latest status
    try {
      const status = await requestJson("/api/status", { method: "GET" });
      applyStatus(status);
    } catch (_) { /* non-critical */ }
  } catch (error) {
    lastConnectionResult = { success: false, error: error.message };
    connectionResultEl.textContent = error.message;
    connectionResultEl.className = "connection-result failure";
  }
}

document.getElementById("test-connection").addEventListener("click", async () => {
  await testConnection();
});

refreshStatus();
window.setInterval(() => refreshStatus(""), 15000);