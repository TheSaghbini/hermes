/**
 * @ai-context Raw YAML config editor textarea with save and validation.
 * @ai-related frontend/src/api/client.ts
 */

import { useState, useEffect, type FormEvent } from "react";
import { Button } from "../shared/Button.tsx";
import { useToast } from "../shared/Toast.tsx";
import { getConfigYaml, putConfigYaml } from "../../api/client.ts";

export function ConfigYamlEditor() {
  const { addToast } = useToast();
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const result = await getConfigYaml();
        setContent(result.content);
      } catch (err) {
        addToast("error", err instanceof Error ? err.message : "Failed to load config YAML.");
      } finally {
        setLoading(false);
      }
    })();
  }, [addToast]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await putConfigYaml(content);
      addToast("success", "Config YAML saved.");
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : "Failed to save config YAML.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="hint">Loading config.yaml…</p>;

  return (
    <form className="yaml-editor" onSubmit={handleSave}>
      <label htmlFor="yaml-content" className="sr-only">
        Config YAML content
      </label>
      <textarea
        id="yaml-content"
        className="yaml-textarea"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        spellCheck={false}
        aria-label="Config YAML editor"
      />
      <div className="buttons">
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? "Saving…" : "Save YAML"}
        </Button>
      </div>
    </form>
  );
}
