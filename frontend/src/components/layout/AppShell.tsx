/**
 * @ai-context Main application shell with collapsible sidebar and content area.
 * Provides the top-level layout structure for all pages.
 * @ai-related frontend/src/components/layout/Sidebar.tsx, frontend/src/components/layout/Header.tsx
 */

import { useState, type ReactNode } from "react";
import { Sidebar } from "./Sidebar.tsx";
import { useStatus } from "../../hooks/useStatus.ts";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { status } = useStatus();
  const gatewayRunning = status?.gateway.running ?? false;

  return (
    <div className="app-shell">
      <button
        className="hamburger-btn"
        onClick={() => setSidebarOpen((prev) => !prev)}
        aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
        aria-expanded={sidebarOpen}
        aria-controls="sidebar-nav"
      >
        <span className="hamburger-icon" aria-hidden="true">
          {sidebarOpen ? "✕" : "☰"}
        </span>
      </button>

      {sidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <Sidebar
        open={sidebarOpen}
        gatewayRunning={gatewayRunning}
        onNavigate={() => setSidebarOpen(false)}
      />

      <main className="app-content" id="main-content">
        {children}
      </main>
    </div>
  );
}
