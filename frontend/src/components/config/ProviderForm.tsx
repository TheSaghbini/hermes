/**
 * @ai-context Provider configuration form with all provider fields.
 * Extended version of the dashboard form showing environment key inputs per provider.
 * @ai-related frontend/src/api/client.ts
 */

import { useState, useEffect, type FormEvent } from "react";
import { Button } from "../shared/Button.tsx";
import { useToast } from "../shared/Toast.tsx";
import { getStatus, saveConfig, testConnection as apiTestConnection } from "../../api/client.ts";
import type { ConnectionTestResult } from "../../api/types.ts";

const MASKED = "••••";

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

  const handleTest = async () => {
    setTesting(true);
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

  if (!loaded) return <p className="hint">Loading configuration…</p>;

  return (
    <form className="provider-form" onSubmit={handleSubmit}>
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

      <div className="field">
        <label htmlFor="cfg-ollama-url">Ollama / Custom Endpoint URL</label>
        <input id="cfg-ollama-url" type="url" value={ollamaBaseUrl} onChange={(e) => setOllamaBaseUrl(e.target.value)} placeholder="http://localhost:11434" />
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

      <div className="connection-test">
        <Button type="button" variant="secondary" onClick={handleTest} disabled={testing}>
          {testing ? "Testing…" : "Test Connection"}
        </Button>
        {connectionResult && (
          <div className={`connection-result ${connectionResult.success ? "success" : "failure"}`} role="status">
            {connectionResult.success
              ? `Connected in ${connectionResult.latency_ms}ms · ${connectionResult.models?.length ?? 0} model(s)`
              : connectionResult.error ?? "Connection failed."}
          </div>
        )}
      </div>

      <div className="buttons">
        <Button type="submit" variant="primary" disabled={saving}>Save Config</Button>
        <Button type="button" variant="secondary" onClick={() => handleSave(true)} disabled={saving}>Save &amp; Restart</Button>
      </div>
    </form>
  );
}
