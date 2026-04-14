/**
 * @ai-context Model selector dropdown populated from /api/models.
 * Shows a styled select with model name and context length info.
 * @ai-related frontend/src/api/client.ts
 */

import { useState, useEffect, useRef } from "react";
import type { ModelInfo } from "../../api/types.ts";
import { getModels } from "../../api/client.ts";

interface ModelSelectorProps {
  value: string;
  onChange: (model: string) => void;
}

/** @ai-context Inline SVG chevron down icon */
function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

/** @ai-context Inline SVG CPU/model icon */
function CpuIcon() {
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

export function ModelSelector({ value, onChange }: ModelSelectorProps) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const result = await getModels();
        setModels(result.models);
      } catch {
        /* silent — user can still type a model name */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedModel = models.find((m) => m.id === value);
  const displayLabel = selectedModel
    ? `${selectedModel.name}${selectedModel.context_length ? ` (${Math.round(selectedModel.context_length / 1024)}K)` : ""}`
    : value || "Default model";

  return (
    <div className="model-selector" ref={dropdownRef}>
      <button
        type="button"
        className="model-selector-trigger"
        onClick={() => setOpen(!open)}
        disabled={loading}
        aria-label="Select model"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <CpuIcon />
        <span className="model-selector-value">{displayLabel}</span>
        <ChevronDownIcon />
      </button>

      {open && (
        <div className="model-selector-dropdown" role="listbox" aria-label="Available models">
          <button
            className={`model-selector-option ${!value ? "model-selector-option-active" : ""}`}
            onClick={() => { onChange(""); setOpen(false); }}
            role="option"
            aria-selected={!value}
          >
            Default model
          </button>
          {models.map((m) => (
            <button
              key={m.id}
              className={`model-selector-option ${value === m.id ? "model-selector-option-active" : ""}`}
              onClick={() => { onChange(m.id); setOpen(false); }}
              role="option"
              aria-selected={value === m.id}
            >
              <span className="model-selector-option-name">{m.name}</span>
              {m.context_length && (
                <span className="model-selector-option-ctx">{Math.round(m.context_length / 1024)}K ctx</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
