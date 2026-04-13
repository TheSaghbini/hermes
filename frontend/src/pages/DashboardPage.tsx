/**
 * @ai-context Dashboard page — ports the current admin UI functionality to React.
 * Contains GatewayStatus, SetupChecklist, QuickActions, and Inference Setup form.
 * @ai-related server.py (GET /api/status, POST /api/config, POST /api/gateway/*)
 */

import { useState, useCallback, type FormEvent } from "react";
import { Header } from "../components/layout/Header.tsx";
import { GatewayStatus } from "../components/dashboard/GatewayStatus.tsx";
import { SetupChecklist } from "../components/dashboard/SetupChecklist.tsx";
import { QuickActions } from "../components/dashboard/QuickActions.tsx";
import { Button } from "../components/shared/Button.tsx";
import { useStatus } from "../hooks/useStatus.ts";
import { useToast } from "../components/shared/Toast.tsx";
import {
  saveConfig,
  gatewayAction,
  testConnection as apiTestConnection,
} from "../api/client.ts";
import type { ConnectionTestResult } from "../api/types.ts";

const MASKED = "••••";

export function DashboardPage() {
  const { status, loading, refresh } = useStatus();
  const { addToast } = useToast();

  const [provider, setProvider] = useState("");
  const [defaultModel, setDefaultModel] = useState("");
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState("");
  const [ollamaApiKey, setOllamaApiKey] = useState("");
  const [openrouterApiKey, setOpenrouterApiKey] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [connectionResult, setConnectionResult] = useState<ConnectionTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [formInitialized, setFormInitialized] = useState(false);

  // Sync form from status on first load
  if (status && !formInitialized) {
    setProvider(status.config.provider);
    setDefaultModel(status.config.default_model);
    setOllamaBaseUrl(status.config.ollama_base_url);
    if (!status.config.ollama_api_key.startsWith(MASKED)) {
      setOllamaApiKey(status.config.ollama_api_key);
    }
    if (!status.config.openrouter_api_key.startsWith(MASKED)) {
      setOpenrouterApiKey(status.config.openrouter_api_key);
    }
    setFormInitialized(true);
  }

  const handleSave = useCallback(
    async (restart: boolean) => {
      setSaving(true);
      setStatusMessage(restart ? "Saving and restarting gateway…" : "Saving configuration…");
      try {
        await saveConfig(
          {
            provider,
            default_model: defaultModel,
            ollama_base_url: ollamaBaseUrl,
            ollama_api_key: ollamaApiKey,
            openrouter_api_key: openrouterApiKey,
          },
          restart,
        );
        await refresh();
        const msg = restart
          ? "Configuration saved and gateway restarted."
          : "Configuration saved.";
        setStatusMessage(msg);
        addToast("success", msg);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Save failed.";
        setStatusMessage(msg);
        addToast("error", msg);
      } finally {
        setSaving(false);
      }
    },
    [provider, defaultModel, ollamaBaseUrl, ollamaApiKey, openrouterApiKey, refresh, addToast],
  );

  const handleGatewayAction = useCallback(
    async (action: string) => {
      setStatusMessage(`Gateway ${action} requested…`);
      try {
        await gatewayAction(action);
        await refresh();
        setStatusMessage(`Gateway ${action} completed.`);
        addToast("success", `Gateway ${action} completed.`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : `Gateway ${action} failed.`;
        setStatusMessage(msg);
        addToast("error", msg);
      }
    },
    [refresh, addToast],
  );

  const handleTestConnection = useCallback(async () => {
    setTesting(true);
    setConnectionResult(null);
    try {
      const result = await apiTestConnection();
      setConnectionResult(result);
      if (result.success) {
        addToast("success", `Connected in ${result.latency_ms}ms`);
      } else {
        addToast("error", result.error ?? "Connection failed.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Connection test failed.";
      setConnectionResult({ success: false, error: msg });
      addToast("error", msg);
    } finally {
      setTesting(false);
    }
  }, [addToast]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    handleSave(false);
  };

  if (loading || !status) {
    return (
      <div className="page-loading" role="status" aria-label="Loading dashboard">
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <Header title="Hermes" gatewayRunning={status.gateway.running} />

      <p className="lede">
        Inference gateway control panel — configure your provider, manage the gateway, and monitor status.
      </p>

      <div className="grid">
        {/* Left column — Config form */}
        <div className="panel">
          <h2>Inference Setup</h2>
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="provider">Provider</label>
              <select
                id="provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              >
                <option value="auto">Auto-detect</option>
                <option value="ollama">Ollama</option>
                <option value="openrouter">OpenRouter</option>
                <option value="custom">Custom OpenAI-compatible</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="default_model">Default Model</label>
              <input
                id="default_model"
                type="text"
                value={defaultModel}
                onChange={(e) => setDefaultModel(e.target.value)}
                placeholder="e.g. llama3.2"
              />
            </div>

            <div className="field">
              <label htmlFor="ollama_base_url">Ollama / Custom Endpoint URL</label>
              <input
                id="ollama_base_url"
                type="url"
                value={ollamaBaseUrl}
                onChange={(e) => setOllamaBaseUrl(e.target.value)}
                placeholder="http://localhost:11434"
              />
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="ollama_api_key">Ollama / Custom API Key</label>
                <input
                  id="ollama_api_key"
                  type="password"
                  value={ollamaApiKey}
                  onChange={(e) => setOllamaApiKey(e.target.value)}
                  placeholder="Optional"
                  autoComplete="off"
                />
              </div>
              <div className="field">
                <label htmlFor="openrouter_api_key">OpenRouter API Key</label>
                <input
                  id="openrouter_api_key"
                  type="password"
                  value={openrouterApiKey}
                  onChange={(e) => setOpenrouterApiKey(e.target.value)}
                  placeholder="sk-or-..."
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="connection-test">
              <Button
                type="button"
                variant="secondary"
                onClick={handleTestConnection}
                disabled={testing}
              >
                {testing ? "Testing…" : "Test Connection"}
              </Button>
              {connectionResult && (
                <div
                  className={`connection-result ${connectionResult.success ? "success" : "failure"}`}
                  role="status"
                >
                  {connectionResult.success
                    ? `Connected in ${connectionResult.latency_ms}ms · ${connectionResult.models?.length ?? 0} model(s) available`
                    : connectionResult.error ?? "Connection failed."}
                </div>
              )}
            </div>

            <div className="buttons">
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? "Saving…" : "Save Config"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => handleSave(true)}
                disabled={saving}
              >
                Save &amp; Restart
              </Button>
            </div>
          </form>

          {statusMessage && (
            <p className="hint" role="status" aria-live="polite">
              {statusMessage}
            </p>
          )}
        </div>

        {/* Right column — Status */}
        <div>
          <GatewayStatus gateway={status.gateway} />
          <SetupChecklist status={status} connectionResult={connectionResult} />
          <QuickActions
            gatewayRunning={status.gateway.running}
            onAction={handleGatewayAction}
            onRefresh={refresh}
            disabled={saving}
          />
        </div>
      </div>
    </div>
  );
}
