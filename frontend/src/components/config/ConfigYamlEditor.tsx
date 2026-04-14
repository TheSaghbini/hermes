/**
 * @ai-context Raw YAML config editor with dark background (#1e1b2e), line numbers,
 * save button with validation feedback, and reset button.
 * @ai-related frontend/src/api/client.ts
 */

import { useState, useEffect, useRef, type FormEvent } from "react";
import { Button } from "../shared/Button.tsx";
import { useToast } from "../shared/Toast.tsx";
import { getConfigYaml, putConfigYaml } from "../../api/client.ts";

/* ── Inline SVG icon components ── */

function InfoIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={size} height={size} aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
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

function UndoIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={size} height={size} aria-hidden="true">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
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

export function ConfigYamlEditor() {
  const { addToast } = useToast();
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const result = await getConfigYaml();
        setContent(result.content);
        setOriginalContent(result.content);
      } catch (err) {
        addToast("error", err instanceof Error ? err.message : "Failed to load config YAML.");
      } finally {
        setLoading(false);
      }
    })();
  }, [addToast]);

  /** @ai-mutates updates local content state and dirty flag */
  const handleChange = (value: string) => {
    setContent(value);
    setDirty(value !== originalContent);
  };

  /** Saves YAML to backend with validation */
  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await putConfigYaml(content);
      setOriginalContent(content);
      setDirty(false);
      addToast("success", "Config YAML saved successfully.");
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : "Failed to save config YAML. Check for syntax errors.");
    } finally {
      setSaving(false);
    }
  };

  /** Resets editor to last saved content */
  const handleReset = () => {
    setContent(originalContent);
    setDirty(false);
    textareaRef.current?.focus();
  };

  /** Handles Tab key in textarea for indentation */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const newValue = content.substring(0, start) + "  " + content.substring(end);
      setContent(newValue);
      setDirty(newValue !== originalContent);
      // Restore cursor position after React re-render
      requestAnimationFrame(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      });
    }
  };

  if (loading) {
    return (
      <div className="yaml-loading">
        <SpinnerIcon size={24} />
        <span>Loading config.yaml…</span>
      </div>
    );
  }

  const lineCount = content.split("\n").length;

  return (
    <form className="yaml-editor" onSubmit={handleSave}>
      <div className="yaml-editor-header">
        <div className="yaml-editor-info">
          <InfoIcon size={16} />
          <span>Edit the raw config.yaml file. Invalid YAML will be rejected on save.</span>
        </div>
        <div className="yaml-editor-meta">
          <span className="yaml-line-count">{lineCount} lines</span>
          {dirty && <span className="yaml-dirty-indicator">Unsaved changes</span>}
        </div>
      </div>

      <div className="yaml-editor-container">
        <div className="yaml-line-numbers" aria-hidden="true">
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i} className="yaml-line-number">{i + 1}</div>
          ))}
        </div>
        <label htmlFor="yaml-content" className="sr-only">Config YAML content</label>
        <textarea
          ref={textareaRef}
          id="yaml-content"
          className="yaml-textarea"
          value={content}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          aria-label="Config YAML editor"
        />
      </div>

      <div className="yaml-editor-footer">
        <Button type="submit" variant="primary" disabled={saving || !dirty} icon={<SaveIcon size={16} />}>
          {saving ? "Saving…" : "Save YAML"}
        </Button>
        <Button type="button" variant="ghost" onClick={handleReset} disabled={!dirty} icon={<UndoIcon size={16} />}>
          Reset
        </Button>
      </div>
    </form>
  );
}
