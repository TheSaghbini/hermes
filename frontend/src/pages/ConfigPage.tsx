/**
 * @ai-context Config page with three-tab layout: Provider, YAML, Env, plus Model Browser.
 * @ai-related frontend/src/components/config/ProviderForm.tsx
 */

import { useState } from "react";
import { Header } from "../components/layout/Header.tsx";
import { ProviderForm } from "../components/config/ProviderForm.tsx";
import { ConfigYamlEditor } from "../components/config/ConfigYamlEditor.tsx";
import { EnvEditor } from "../components/config/EnvEditor.tsx";
import { ModelBrowser } from "../components/config/ModelBrowser.tsx";

type TabId = "provider" | "yaml" | "env";

const TABS: { id: TabId; label: string }[] = [
  { id: "provider", label: "Provider" },
  { id: "yaml", label: "Config YAML" },
  { id: "env", label: "Environment" },
];

export function ConfigPage() {
  const [activeTab, setActiveTab] = useState<TabId>("provider");

  return (
    <div className="config-page">
      <Header title="Configuration" />

      <div className="tabs" role="tablist" aria-label="Configuration sections">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            className={`tab-btn ${activeTab === tab.id ? "tab-btn-active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="tab-panels">
        <div
          role="tabpanel"
          id="panel-provider"
          aria-labelledby="tab-provider"
          hidden={activeTab !== "provider"}
        >
          {activeTab === "provider" && (
            <div className="panel">
              <ProviderForm />
            </div>
          )}
        </div>

        <div
          role="tabpanel"
          id="panel-yaml"
          aria-labelledby="tab-yaml"
          hidden={activeTab !== "yaml"}
        >
          {activeTab === "yaml" && (
            <div className="panel">
              <h2>Config YAML</h2>
              <p className="hint">
                Edit the raw config.yaml file. Invalid YAML will be rejected on save.
              </p>
              <ConfigYamlEditor />
            </div>
          )}
        </div>

        <div
          role="tabpanel"
          id="panel-env"
          aria-labelledby="tab-env"
          hidden={activeTab !== "env"}
        >
          {activeTab === "env" && (
            <div className="panel">
              <h2>Environment Variables</h2>
              <p className="hint">
                Manage .env entries. Sensitive values are masked when loaded.
              </p>
              <EnvEditor />
            </div>
          )}
        </div>
      </div>

      <section className="panel config-models-section" aria-label="Available models">
        <h2>Model Browser</h2>
        <ModelBrowser />
      </section>
    </div>
  );
}
