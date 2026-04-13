/**
 * @ai-context Model selector dropdown populated from /api/models.
 * @ai-related frontend/src/api/client.ts
 */

import { useState, useEffect } from "react";
import type { ModelInfo } from "../../api/types.ts";
import { getModels } from "../../api/client.ts";

interface ModelSelectorProps {
  value: string;
  onChange: (model: string) => void;
}

export function ModelSelector({ value, onChange }: ModelSelectorProps) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="model-selector">
      <label htmlFor="model-select" className="sr-only">
        Model
      </label>
      <select
        id="model-select"
        className="model-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
        aria-label="Select model"
      >
        <option value="">Default model</option>
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}{m.context_length ? ` (${Math.round(m.context_length / 1024)}K ctx)` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
