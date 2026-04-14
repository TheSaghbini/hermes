/**
 * @ai-context Key-value .env editor with add/remove rows, masked secrets with reveal toggle,
 * clean table layout, and save button. Uses inline SVG icons.
 * @ai-related frontend/src/api/client.ts
 */

import { useState, useEffect, type FormEvent } from "react";
import { Button } from "../shared/Button.tsx";
import { useToast } from "../shared/Toast.tsx";
import { getConfigEnv, putConfigEnv } from "../../api/client.ts";
import type { EnvEntry } from "../../api/types.ts";

/* ── Inline SVG icon components ── */

function ShieldIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={size} height={size} aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function EyeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={size} height={size} aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={size} height={size} aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function TrashIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={size} height={size} aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function PlusIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={size} height={size} aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
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

function SpinnerIcon({ size = 24 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={size} height={size} className="spin-icon" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

export function EnvEditor() {
  const { addToast } = useToast();
  const [entries, setEntries] = useState<EnvEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [revealedKeys, setRevealedKeys] = useState<Set<number>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const result = await getConfigEnv();
        setEntries(result.entries);
      } catch (err) {
        addToast("error", err instanceof Error ? err.message : "Failed to load env.");
      } finally {
        setLoading(false);
      }
    })();
  }, [addToast]);

  /** @ai-mutates updates a single entry field by index */
  const updateEntry = (index: number, field: "key" | "value", val: string) => {
    setEntries((prev) =>
      prev.map((e, i) => (i === index ? { ...e, [field]: val } : e)),
    );
  };

  /** Adds a new empty row to the entries list */
  const addRow = () => {
    setEntries((prev) => [...prev, { key: "", value: "" }]);
  };

  /** Removes a row by index and cleans up reveal state */
  const removeRow = (index: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== index));
    setRevealedKeys((prev) => {
      const next = new Set<number>();
      prev.forEach((k) => {
        if (k < index) next.add(k);
        else if (k > index) next.add(k - 1);
      });
      return next;
    });
  };

  /** Toggles reveal/hide for a masked value */
  const toggleReveal = (index: number) => {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  /** Saves all entries with non-empty keys to backend */
  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await putConfigEnv(entries.filter((entry) => entry.key.trim()));
      addToast("success", "Environment saved.");
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : "Failed to save env.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="env-loading">
        <SpinnerIcon size={24} />
        <span>Loading .env…</span>
      </div>
    );
  }

  return (
    <form className="env-editor" onSubmit={handleSave}>
      <div className="env-editor-header">
        <div className="env-editor-info">
          <ShieldIcon size={16} />
          <span>Manage environment variables. Sensitive values are masked by default.</span>
        </div>
      </div>

      <div className="env-table-wrapper">
        <table className="env-table" role="grid" aria-label="Environment variables">
          <thead>
            <tr>
              <th scope="col" className="env-table-key-col">Key</th>
              <th scope="col" className="env-table-value-col">Value</th>
              <th scope="col" className="env-table-actions-col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, idx) => {
              const isRevealed = revealedKeys.has(idx);
              const isMasked = entry.masked && !isRevealed;

              return (
                <tr key={idx} className={isMasked ? "env-row-masked" : ""}>
                  <td>
                    <input
                      type="text"
                      className="env-key-input"
                      value={entry.key}
                      onChange={(e) => updateEntry(idx, "key", e.target.value)}
                      placeholder="KEY_NAME"
                      aria-label={`Variable name, row ${idx + 1}`}
                    />
                  </td>
                  <td>
                    <div className="env-value-cell">
                      <input
                        type={isMasked ? "password" : "text"}
                        className="env-value-input"
                        value={entry.value}
                        onChange={(e) => updateEntry(idx, "value", e.target.value)}
                        placeholder={isMasked ? "••••••••" : "value"}
                        aria-label={`Variable value, row ${idx + 1}`}
                        autoComplete="off"
                      />
                      {entry.masked && (
                        <button
                          type="button"
                          className="env-reveal-btn"
                          onClick={() => toggleReveal(idx)}
                          aria-label={isRevealed ? "Hide value" : "Reveal value"}
                          title={isRevealed ? "Hide value" : "Reveal value"}
                        >
                          {isRevealed ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                        </button>
                      )}
                    </div>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="env-remove-btn"
                      onClick={() => removeRow(idx)}
                      aria-label={`Remove ${entry.key || `row ${idx + 1}`}`}
                      title="Remove variable"
                    >
                      <TrashIcon size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="env-editor-actions">
        <Button type="button" variant="secondary" onClick={addRow} icon={<PlusIcon size={16} />}>
          Add Variable
        </Button>
        <Button type="submit" variant="primary" disabled={saving} icon={<SaveIcon size={16} />}>
          {saving ? "Saving…" : "Save Environment"}
        </Button>
      </div>
    </form>
  );
}
