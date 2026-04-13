/**
 * @ai-context Application root with BrowserRouter and route definitions.
 * Wraps all pages in AppShell layout and ToastProvider.
 * @ai-related frontend/src/main.tsx
 */

import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell.tsx";
import { ToastProvider } from "./components/shared/Toast.tsx";
import { DashboardPage } from "./pages/DashboardPage.tsx";
import { ChatPage } from "./pages/ChatPage.tsx";
import { ConfigPage } from "./pages/ConfigPage.tsx";
import { LogsPage } from "./pages/LogsPage.tsx";
import { BackupsPage } from "./pages/BackupsPage.tsx";

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AppShell>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/chat/:conversationId" element={<ChatPage />} />
            <Route path="/config" element={<ConfigPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="/backups" element={<BackupsPage />} />
          </Routes>
        </AppShell>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
