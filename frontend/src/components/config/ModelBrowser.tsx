/**
 * @ai-context Grid of available models fetched from the active provider.
 * @ai-related frontend/src/api/client.ts
 */

import { useState, useEffect } from "react";
import type { ModelInfo } from "../../api/types.ts";
import { getModels } from "../../api/client.ts";

export function ModelBrowser() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const result = await getModels();
        setModels(result.models);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch models.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <p className="hint">Loading models…</p>;
  if (error) return <p className="hint">{error}</p>;
  if (models.length === 0) return <p className="hint">No models available from the provider.</p>;

  return (
    <div className="model-browser" role="region" aria-label="Available models">
      <div className="model-grid">
        {models.map((model) => (
          <div key={model.id} className="model-card panel">
            <h3 className="model-card-name">{model.name}</h3>
            <p className="model-card-id hint">{model.id}</p>
            {model.context_length && (
              <p className="model-card-ctx hint">
                Context: {Math.round(model.context_length / 1024)}K tokens
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
