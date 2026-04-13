/**
 * @ai-context Application entry point — mounts React into #root.
 * @ai-related frontend/index.html, frontend/src/App.tsx
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./styles/index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found.");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
