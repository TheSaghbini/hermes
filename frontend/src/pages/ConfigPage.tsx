/**
 * @ai-context Config page with four-tab layout: Provider, YAML, Environment, Models.
 * Active tab has blue underline indicator. Clean tab interface at top.
 * @ai-related frontend/src/components/config/ProviderForm.tsx, ConfigYamlEditor.tsx, EnvEditor.tsx, ModelBrowser.tsx
 */

import { useState, type ReactElement } from "react";
import { Header } from "../components/layout/Header.tsx";
import { ProviderForm } from "../components/config/ProviderForm.tsx";
import { ConfigYamlEditor } from "../components/config/ConfigYamlEditor.tsx";
import { EnvEditor } from "../components/config/EnvEditor.tsx";
import { ModelBrowser } from "../components/config/ModelBrowser.tsx";

type TabId = "provider" | "yaml" | "env" | "models";

interface TabDef {
  id: TabId;
  label: string;
  icon: ReactElement;
}

const TABS: TabDef[] = [
  {
    id: "provider",
    label: "Provider",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" aria-hidden="true">
        <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
        <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
        <line x1="6" y1="6" x2="6.01" y2="6" />
        <line x1="6" y1="18" x2="6.01" y2="18" />
      </svg>
    ),
  },
  {
    id: "yaml",
    label: "YAML",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" aria-hidden="true">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
  },
  {
    id: "env",
    label: "Environment",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" aria-hidden="true">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  {
    id: "models",
    label: "Models",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

const TAB_COMPONENTS: Record<TabId, () => ReactElement> = {
  provider: () => <ProviderForm />,
  yaml: () => <ConfigYamlEditor />,
  env: () => <EnvEditor />,
  models: () => <ModelBrowser />,
};

export function ConfigPage() {
  const [activeTab, setActiveTab] = useState<TabId>("provider");

  const ActiveComponent = TAB_COMPONENTS[activeTab];

  return (
    <div className="config-page">
      <Header title="Configuration" />

      <nav className="config-tabs" role="tablist" aria-label="Configuration sections">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              className={`config-tab-btn ${isActive ? "config-tab-btn-active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="config-tab-icon" aria-hidden="true">{tab.icon}</span>
              <span className="config-tab-label">{tab.label}</span>
              {isActive && <span className="config-tab-underline" />}
            </button>
          );
        })}
      </nav>

      <div
        role="tabpanel"
        id={`panel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        className="config-tab-panel"
      >
        <ActiveComponent />
      </div>
    </div>
  );
}
