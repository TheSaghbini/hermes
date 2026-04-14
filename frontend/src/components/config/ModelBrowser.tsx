/**
 * @ai-context Card grid of available models from the active provider.
 * Each card shows model name, ID, context length. Click to set as default model.
 * Uses inline SVG icons.
 * @ai-related frontend/src/api/client.ts
 */

import { useState, useEffect } from "react";
import { useToast } from "../shared/Toast.tsx";
import type { ModelInfo } from "../../api/types.ts";
import { getModels, saveConfig, getStatus } from "../../api/client.ts";

/* ── Inline SVG icon components ── */

function CheckIcon({ size = 12 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={size} height={size} aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ContextIcon({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={size} height={size} aria-hidden="true">
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  );
}

function SettingsIcon({ size = 48 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={size} height={size} aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function ErrorIcon({ size = 24 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={size} height={size} aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

function SpinnerIcon({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={size} height={size} className="spin-icon" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

/** Formats context length as human-readable K/M tokens */
function formatContext(ctx: number): string {
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(1)}M`;
  return `${Math.round(ctx / 1024)}K`;
}

export function ModelBrowser() {
  const { addToast } = useToast();
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentDefault, setCurrentDefault] = useState<string>("");
  const [setting, setSetting] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [modelsResult, status] = await Promise.all([getModels(), getStatus()]);
        setModels(modelsResult.models);
        setCurrentDefault(status.config.default_model);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch models.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /** @ai-mutates sets the given model as the default in backend config */
  const handleSetDefault = async (modelId: string) => {
    setSetting(modelId);
    try {
      await saveConfig({ default_model: modelId }, false);
      setCurrentDefault(modelId);
      addToast("success", `Default model set to ${modelId}`);
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : "Failed to set default model.");
    } finally {
      setSetting(null);
    }
  };

  if (loading) {
    return (
      <div className="model-loading">
        <SpinnerIcon size={24} />
        <span>Loading models…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="model-error">
        <ErrorIcon size={24} />
        <p>{error}</p>
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <div className="model-empty">
        <SettingsIcon size={48} />
        <p>No models available from the provider.</p>
        <p className="hint">Configure a provider and test the connection first.</p>
      </div>
    );
  }

  return (
    <div className="model-browser" role="region" aria-label="Available models">
      <div className="model-browser-header">
        <p className="model-browser-count">{models.length} model{models.length !== 1 ? "s" : ""} available</p>
        <p className="model-browser-hint">Click a model card to set it as the default.</p>
      </div>
      <div className="model-grid">
        {models.map((model) => {
          const isDefault = model.id === currentDefault;
          const isSettingThis = setting === model.id;

          return (
            <button
              key={model.id}
              type="button"
              className={`model-card ${isDefault ? "model-card-default" : ""}`}
              onClick={() => handleSetDefault(model.id)}
              disabled={setting !== null}
              aria-label={`${model.name}${isDefault ? " (current default)" : ""}`}
            >
              <div className="model-card-header">
                <h3 className="model-card-name">{model.name}</h3>
                {isDefault && (
                  <span className="model-card-badge">
                    <CheckIcon size={12} />
                    Default
                  </span>
                )}
              </div>
              <p className="model-card-id">{model.id}</p>
              {model.context_length && (
                <div className="model-card-meta">
                  <ContextIcon size={14} />
                  <span>{formatContext(model.context_length)} context</span>
                </div>
              )}
              {isSettingThis && (
                <div className="model-card-setting">
                  <SpinnerIcon size={14} />
                  Setting…
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
