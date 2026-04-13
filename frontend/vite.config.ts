/**
 * @ai-context Vite dev server + build configuration for Hermes React SPA.
 * Proxies /api and /health to the Flask backend during development.
 * @ai-related frontend/package.json, server.py
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8080",
      "/health": "http://localhost:8080",
    },
  },
});
