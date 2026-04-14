/**
 * @ai-context Provider configuration form with all provider fields.
 * Card layout with provider dropdown, model input, API key fields grouped by provider type,
 * connection test, and save/restart buttons. Uses inline SVG icons.
 * @ai-related frontend/src/api/client.ts
 */

import { useState, useEffect, type FormEvent } from "react";
import { Button } from "../shared/Button.tsx";
import { useToast } from "../shared/Toast.tsx";
import { getStatus, saveConfig, testConnection as apiTestConnection } from "../../api/client.ts";
import type { ConnectionTestResult } from "../../api/types.ts";

const MASKED = "••••";

/* ── Inline SVG icon components ── */

function ServerIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={size} height={size} aria-hidden="true">
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" />
      <line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  );
}

function LinkIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={size} height={size} aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function KeyIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={size} height={size} aria-hidden="true">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  );
}

function CheckCircleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={size} height={size} aria-hidden="true">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function XCircleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={size} height={size} aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

function SaveIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={size} height={size} aria-hidden="true">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );
}

function RefreshIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={size} height={size} aria-hidden="true">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}

function SpinnerIcon({ size = 24 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={size} height={size} className="spin-icon" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

export function ProviderForm() {
  const { addToast } = useToast();

  const [provider, setProvider] = useState("");
  const [defaultModel, setDefaultModel] = useState("");
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState("");
  const [ollamaApiKey, setOllamaApiKey] = useState("");
  const [openrouterApiKey, setOpenrouterApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connectionResult, setConnectionResult] = useState<ConnectionTestResult | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const status = await getStatus();
        const c = status.config;
        setProvider(c.provider);
        setDefaultModel(c.default_model);
        setOllamaBaseUrl(c.ollama_base_url);
        if (!c.ollama_api_key.startsWith(MASKED)) setOllamaApiKey(c.ollama_api_key);
        if (!c.openrouter_api_key.startsWith(MASKED)) setOpenrouterApiKey(c.openrouter_api_key);
        setLoaded(true);
      } catch (err) {
        addToast("error", err instanceof Error ? err.message : "Failed to load config.");
      }
    })();
  }, [addToast]);

  /** @ai-mutates saves provider config to backend, optionally restarts gateway */
  const handleSave = async (restart: boolean) => {
    setSaving(true);
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
      addToast("success", restart ? "Saved and gateway restarted." : "Configuration saved.");
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  /** Tests the current provider connection and reports latency + model count */
  const handleTest = async () => {
    setTesting(true);
    setConnectionResult(null);
    try {
      const result = await apiTestConnection();
      setConnectionResult(result);
      addToast(result.success ? "success" : "error", result.success ? `Connected in ${result.latency_ms}ms` : (result.error ?? "Failed"));
    } catch (err) {
      setConnectionResult({ success: false, error: String(err) });
      addToast("error", String(err));
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    handleSave(false);
  };

  if (!loaded) {
    return (
      <div className="provider-loading">
        <SpinnerIcon size={24} />
        <span>Loading configuration…</span>
      </div>
    );
  }

  return (
    <form className="provider-form" onSubmit={handleSubmit}>
      {/* ── Provider Selection ── */}
      <div className="provider-form-card">
        <div className="provider-form-section-header">
          <ServerIcon />
          <h3>Provider Settings</h3>
        </div>

        <div className="field">
          <label htmlFor="cfg-provider">Provider</label>
          <select id="cfg-provider" value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="auto">Auto-detect</option>
            <option value="ollama">Ollama</option>
            <option value="openrouter">OpenRouter</option>
            <option value="custom">Custom OpenAI-compatible</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="cfg-model">Default Model</label>
          <input id="cfg-model" type="text" value={defaultModel} onChange={(e) => setDefaultModel(e.target.value)} placeholder="e.g. llama3.2" />
        </div>
      </div>

      {/* ── Connection Settings ── */}
      <div className="provider-form-card">
        <div className="provider-form-section-header">
          <LinkIcon />
          <h3>Connection</h3>
        </div>

        <div className="field">
          <label htmlFor="cfg-ollama-url">Ollama / Custom Endpoint URL</label>
          <input id="cfg-ollama-url" type="url" value={ollamaBaseUrl} onChange={(e) => setOllamaBaseUrl(e.target.value)} placeholder="http://localhost:11434" />
        </div>
      </div>

      {/* ── API Keys ── */}
      <div className="provider-form-card">
        <div className="provider-form-section-header">
          <KeyIcon />
          <h3>API Keys</h3>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="cfg-ollama-key">Ollama / Custom API Key</label>
            <input id="cfg-ollama-key" type="password" value={ollamaApiKey} onChange={(e) => setOllamaApiKey(e.target.value)} placeholder="Optional" autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="cfg-or-key">OpenRouter API Key</label>
            <input id="cfg-or-key" type="password" value={openrouterApiKey} onChange={(e) => setOpenrouterApiKey(e.target.value)} placeholder="sk-or-..." autoComplete="off" />
          </div>
        </div>
      </div>

      {/* ── Connection Test ── */}
      <div className="provider-form-card provider-test-card">
        <div className="connection-test">
          <Button type="button" variant="secondary" onClick={handleTest} disabled={testing} icon={<CheckCircleIcon size={16} />}>
            {testing ? "Testing…" : "Test Connection"}
          </Button>
          {connectionResult && (
            <div className={`connection-result ${connectionResult.success ? "success" : "failure"}`} role="status">
              {connectionResult.success ? (
                <span className="connection-result-content">
                  <CheckCircleIcon size={16} />
                  Connected in {connectionResult.latency_ms}ms · {connectionResult.models?.length ?? 0} model(s)
                </span>
              ) : (
                <span className="connection-result-content">
                  <XCircleIcon size={16} />
                  {connectionResult.error ?? "Connection failed."}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Action Buttons ── */}
      <div className="provider-form-actions">
        <Button type="submit" variant="primary" disabled={saving} icon={<SaveIcon size={16} />}>
          {saving ? "Saving…" : "Save Config"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => handleSave(true)} disabled={saving} icon={<RefreshIcon size={16} />}>
          Save &amp; Restart
        </Button>
      </div>
    </form>
  );
}
