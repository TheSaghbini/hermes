/**
 * @ai-context Key-value .env editor with add/remove rows, masked secrets, and save.
 * @ai-related frontend/src/api/client.ts
 */

import { useState, useEffect, type FormEvent } from "react";
import { Button } from "../shared/Button.tsx";
import { useToast } from "../shared/Toast.tsx";
import { getConfigEnv, putConfigEnv } from "../../api/client.ts";
import type { EnvEntry } from "../../api/types.ts";

export function EnvEditor() {
  const { addToast } = useToast();
  const [entries, setEntries] = useState<EnvEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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

  const updateEntry = (index: number, field: "key" | "value", val: string) => {
    setEntries((prev) =>
      prev.map((e, i) => (i === index ? { ...e, [field]: val } : e)),
    );
  };

  const addRow = () => {
    setEntries((prev) => [...prev, { key: "", value: "" }]);
  };

  const removeRow = (index: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  };

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

  if (loading) return <p className="hint">Loading .env…</p>;

  return (
    <form className="env-editor" onSubmit={handleSave}>
      <table className="env-table" role="grid" aria-label="Environment variables">
        <thead>
          <tr>
            <th scope="col">Key</th>
            <th scope="col">Value</th>
            <th scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, idx) => (
            <tr key={idx}>
              <td>
                <input
                  type="text"
                  value={entry.key}
                  onChange={(e) => updateEntry(idx, "key", e.target.value)}
                  placeholder="KEY_NAME"
                  aria-label={`Variable name, row ${idx + 1}`}
                />
              </td>
              <td>
                <input
                  type={entry.masked ? "password" : "text"}
                  value={entry.value}
                  onChange={(e) => updateEntry(idx, "value", e.target.value)}
                  placeholder={entry.masked ? "••••••" : "value"}
                  aria-label={`Variable value, row ${idx + 1}`}
                  autoComplete="off"
                />
              </td>
              <td>
                <button
                  type="button"
                  className="env-remove-btn"
                  onClick={() => removeRow(idx)}
                  aria-label={`Remove ${entry.key || `row ${idx + 1}`}`}
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="buttons">
        <Button type="button" variant="secondary" onClick={addRow}>
          + Add Variable
        </Button>
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? "Saving…" : "Save Environment"}
        </Button>
      </div>
    </form>
  );
}
