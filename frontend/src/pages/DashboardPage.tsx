/**
 * @ai-context Dashboard page — production-quality control room with hero section,
 * status cards, horizontal setup checklist, inference setup form, and quick actions.
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

/** @ai-context Inline SVG icons for status cards */
function ProviderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function ModelIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2" ry="2" />
      <rect x="9" y="9" width="6" height="6" />
      <line x1="9" y1="1" x2="9" y2="4" />
      <line x1="15" y1="1" x2="15" y2="4" />
      <line x1="9" y1="20" x2="9" y2="23" />
      <line x1="15" y1="20" x2="15" y2="23" />
      <line x1="20" y1="9" x2="23" y2="9" />
      <line x1="20" y1="14" x2="23" y2="14" />
      <line x1="1" y1="9" x2="4" y2="9" />
      <line x1="1" y1="14" x2="4" y2="14" />
    </svg>
  );
}

function EndpointIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );
}

function SaveRestartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}

function TestIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

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
        <div className="page-loading-spinner" aria-hidden="true" />
        <p>Loading dashboard…</p>
      </div>
    );
  }

  const providerLabel = status.config.provider === "auto" ? "Auto-detect" : status.config.provider === "ollama" ? "Ollama" : status.config.provider === "openrouter" ? "OpenRouter" : status.config.provider || "Not set";

  return (
    <div className="dashboard-page">
      <Header title="Hermes" gatewayRunning={status.gateway.running} />

      {/* Hero Section */}
      <div className="hero">
        <h1>Hermes Control Room</h1>
        <p className="lede">Inference gateway control panel — configure your provider, manage the gateway, and monitor status.</p>
      </div>

      {/* Status Cards Grid */}
      <div className="status-card-grid">
        <GatewayStatus gateway={status.gateway} />

        <div className="status-card">
          <div className="status-card-icon blue">
            <ProviderIcon />
          </div>
          <div className="status-card-body">
            <p className="status-card-label">Provider</p>
            <p className="status-card-value">{providerLabel}</p>
          </div>
        </div>

        <div className="status-card">
          <div className="status-card-icon green">
            <ModelIcon />
          </div>
          <div className="status-card-body">
            <p className="status-card-label">Model</p>
            <p className="status-card-value">{status.config.default_model || "Not set"}</p>
          </div>
        </div>

        <div className="status-card">
          <div className="status-card-icon amber">
            <EndpointIcon />
          </div>
          <div className="status-card-body">
            <p className="status-card-label">Active Endpoint</p>
            <p className="status-card-value" style={{ fontSize: "0.85rem" }}>
              {status.config.active_base_url || "Not configured"}
            </p>
          </div>
        </div>
      </div>

      {/* Setup Checklist */}
      <SetupChecklist status={status} connectionResult={connectionResult} />

      {/* Quick Actions */}
      <div className="panel">
        <h3>Gateway Controls</h3>
        <QuickActions
          gatewayRunning={status.gateway.running}
          onAction={handleGatewayAction}
          onRefresh={refresh}
          disabled={saving}
        />
      </div>

      {/* Inference Setup Form */}
      <div className="panel">
        <h2>Inference Setup</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-section">
            <h3 className="form-section-title">Provider Configuration</h3>
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
          </div>

          <div className="form-section">
            <h3 className="form-section-title">Endpoint & Authentication</h3>
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
                  placeholder="sk-or-…"
                  autoComplete="off"
                />
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3 className="form-section-title">Connection Test</h3>
            <div className="connection-test">
              <Button
                variant="secondary"
                onClick={handleTestConnection}
                disabled={testing}
                loading={testing}
                icon={<TestIcon />}
              >
                Test Connection
              </Button>
              {connectionResult && (
                <div className={`connection-result ${connectionResult.success ? "success" : "failure"}`}>
                  {connectionResult.success ? (
                    <span>Connected in {connectionResult.latency_ms}ms{connectionResult.models ? ` — ${connectionResult.models.length} models available` : ""}</span>
                  ) : (
                    <span>{connectionResult.error ?? "Connection failed."}</span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="form-actions">
            <Button
              variant="primary"
              type="submit"
              disabled={saving}
              loading={saving}
              icon={<SaveIcon />}
            >
              Save Configuration
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleSave(true)}
              disabled={saving}
              loading={saving}
              icon={<SaveRestartIcon />}
            >
              Save & Restart Gateway
            </Button>
          </div>

          {statusMessage && (
            <p className={`form-status-message ${statusMessage.includes("failed") || statusMessage.includes("error") ? "form-status-error" : "form-status-success"}`}>
              {statusMessage}
            </p>
          )}
        </form>
      </div>

      {/* Gateway Logs */}
      {status.gateway.logs.length > 0 && (
        <div className="panel">
          <h3>Recent Gateway Logs</h3>
          <div className="logs" aria-label="Gateway logs">
            <pre>{status.gateway.logs.join("\n")}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
