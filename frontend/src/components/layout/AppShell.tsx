/**
 * @ai-context Main application shell with collapsible sidebar, hamburger menu, and content area.
 * Provides smooth sidebar slide transition and backdrop overlay on mobile.
 * Manages sidebar open/close state and passes gateway status to Sidebar.
 * @ai-related frontend/src/components/layout/Sidebar.tsx, frontend/src/components/layout/Header.tsx
 * @ai-mutates Sets sidebarOpen state on navigation and backdrop click
 */

import { useState, useCallback, type ReactNode } from "react";
import { Sidebar } from "./Sidebar.tsx";
import { useStatus } from "../../hooks/useStatus.ts";

interface AppShellProps {
  children: ReactNode;
}

/* ── Inline SVG for hamburger/close ── */

function MenuIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="20"
      height="20"
      aria-hidden="true"
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="20"
      height="20"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function AppShell({ children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { status } = useStatus();
  const gatewayRunning = status?.gateway.running ?? false;

  const handleToggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const handleCloseSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  const handleBackdropClick = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  return (
    <div className="app-shell">
      <a href="#main-content" className="sr-only">
        Skip to content
      </a>
      <button
        className="hamburger-btn"
        onClick={handleToggleSidebar}
        aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
        aria-expanded={sidebarOpen}
        aria-controls="sidebar-nav"
      >
        <span className="hamburger-icon" aria-hidden="true">
          {sidebarOpen ? <CloseIcon /> : <MenuIcon />}
        </span>
      </button>

      {sidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={handleBackdropClick}
          aria-hidden="true"
        />
      )}

      <Sidebar
        open={sidebarOpen}
        gatewayRunning={gatewayRunning}
        onNavigate={handleCloseSidebar}
      />

      <main className="app-content" id="main-content" role="main">
        {children}
      </main>
    </div>
  );
}
