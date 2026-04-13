/**
 * @ai-context Navigation sidebar with route links and gateway status indicator.
 * Uses NavLink for active-state styling. Collapses on mobile.
 * @ai-related frontend/src/components/layout/AppShell.tsx
 */

import { NavLink } from "react-router-dom";
import { Pill } from "../shared/Pill.tsx";

interface SidebarProps {
  open: boolean;
  gatewayRunning: boolean;
  onNavigate: () => void;
}

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: "⌂" },
  { to: "/chat", label: "Chat", icon: "💬" },
  { to: "/config", label: "Config", icon: "⚙" },
  { to: "/logs", label: "Logs", icon: "▸" },
  { to: "/backups", label: "Backups", icon: "🗄" },
] as const;

export function Sidebar({ open, gatewayRunning, onNavigate }: SidebarProps) {
  return (
    <nav
      id="sidebar-nav"
      className={`sidebar ${open ? "sidebar-open" : ""}`}
      aria-label="Main navigation"
    >
      <div className="sidebar-header">
        <h1 className="sidebar-brand">Hermes</h1>
      </div>

      <ul className="sidebar-links" role="list">
        {NAV_ITEMS.map(({ to, label, icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `sidebar-link ${isActive ? "sidebar-link-active" : ""}`
              }
              onClick={onNavigate}
            >
              <span className="sidebar-link-icon" aria-hidden="true">
                {icon}
              </span>
              <span>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="sidebar-footer">
        <Pill variant={gatewayRunning ? "good" : "warn"}>
          {gatewayRunning ? "Gateway running" : "Gateway stopped"}
        </Pill>
      </div>
    </nav>
  );
}
