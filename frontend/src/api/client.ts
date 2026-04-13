/**
 * @ai-context API client for all Hermes backend endpoints.
 * All requests use same-origin credentials for HTTP Basic Auth pass-through.
 * Ported from static/app.js requestJson pattern.
 * @ai-related server.py, frontend/src/api/types.ts
 */

import type {
  StatusPayload,
  Conversation,
  ConversationListResponse,
  BackupMeta,
  BackupListResponse,
  WatchdogPolicy,
  ModelInfo,
  Provider,
  EnvEntry,
  LogsHistoryResponse,
  ConnectionTestResult,
} from "./types.ts";

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function requestJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(options.headers as Record<string, string> ?? {}),
  };

  if (method !== "GET" && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    credentials: "same-origin",
    mode: "same-origin",
    ...options,
    headers,
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new ApiError(payload.error ?? "Request failed.", response.status);
  }
  return payload as T;
}

/* ── Status ── */

export async function getStatus(): Promise<StatusPayload> {
  return requestJson<StatusPayload>("/api/status");
}

export async function saveConfig(
  payload: Record<string, unknown>,
  restart = false,
): Promise<StatusPayload> {
  return requestJson<StatusPayload>("/api/config", {
    method: "POST",
    body: JSON.stringify({ ...payload, restart_gateway: restart }),
  });
}

export async function gatewayAction(action: string): Promise<StatusPayload> {
  return requestJson<StatusPayload>(`/api/gateway/${encodeURIComponent(action)}`, {
    method: "POST",
    body: "{}",
  });
}

export async function testConnection(): Promise<ConnectionTestResult> {
  return requestJson<ConnectionTestResult>("/api/test-connection", {
    method: "POST",
    body: "{}",
  });
}

/* ── Conversations ── */

export async function getConversations(
  limit = 50,
  offset = 0,
): Promise<ConversationListResponse> {
  return requestJson<ConversationListResponse>(
    `/api/conversations?limit=${limit}&offset=${offset}`,
  );
}

export async function getConversation(id: string): Promise<Conversation> {
  return requestJson<Conversation>(`/api/conversations/${encodeURIComponent(id)}`);
}

export async function createConversation(title?: string): Promise<Conversation> {
  return requestJson<Conversation>("/api/conversations", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

export async function deleteConversation(id: string): Promise<{ ok: boolean }> {
  return requestJson<{ ok: boolean }>(
    `/api/conversations/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

export async function updateConversation(
  id: string,
  title: string,
): Promise<Conversation> {
  return requestJson<Conversation>(
    `/api/conversations/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify({ title }) },
  );
}

/* ── Config Management ── */

export async function getConfigYaml(): Promise<{ content: string }> {
  return requestJson<{ content: string }>("/api/config/yaml");
}

export async function putConfigYaml(content: string): Promise<{ ok: boolean }> {
  return requestJson<{ ok: boolean }>("/api/config/yaml", {
    method: "PUT",
    body: JSON.stringify({ content }),
  });
}

export async function getConfigEnv(): Promise<{ entries: EnvEntry[] }> {
  return requestJson<{ entries: EnvEntry[] }>("/api/config/env");
}

export async function putConfigEnv(entries: EnvEntry[]): Promise<{ ok: boolean }> {
  return requestJson<{ ok: boolean }>("/api/config/env", {
    method: "PUT",
    body: JSON.stringify({ entries }),
  });
}

/* ── Models & Providers ── */

export async function getModels(): Promise<{ models: ModelInfo[] }> {
  return requestJson<{ models: ModelInfo[] }>("/api/models");
}

export async function getProviders(): Promise<{ providers: Provider[] }> {
  return requestJson<{ providers: Provider[] }>("/api/providers");
}

/* ── Backups ── */

export async function getBackups(): Promise<BackupListResponse> {
  return requestJson<BackupListResponse>("/api/backups");
}

export async function createBackup(label?: string): Promise<BackupMeta> {
  return requestJson<BackupMeta>("/api/backups", {
    method: "POST",
    body: JSON.stringify({ label }),
  });
}

export async function restoreBackup(
  id: string,
  restartGateway = false,
): Promise<{ ok: boolean; restored: BackupMeta }> {
  return requestJson<{ ok: boolean; restored: BackupMeta }>(
    `/api/backups/${encodeURIComponent(id)}/restore`,
    {
      method: "POST",
      body: JSON.stringify({ restart_gateway: restartGateway }),
    },
  );
}

export async function deleteBackup(id: string): Promise<{ ok: boolean }> {
  return requestJson<{ ok: boolean }>(
    `/api/backups/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

export function downloadBackupUrl(id: string): string {
  return `/api/backups/${encodeURIComponent(id)}/download`;
}

/* ── Logs ── */

export async function getLogsHistory(): Promise<LogsHistoryResponse> {
  return requestJson<LogsHistoryResponse>("/api/logs/history");
}

/* ── Watchdog ── */

export async function getWatchdog(): Promise<WatchdogPolicy> {
  return requestJson<WatchdogPolicy>("/api/gateway/watchdog");
}

export async function setWatchdog(policy: WatchdogPolicy): Promise<WatchdogPolicy> {
  return requestJson<WatchdogPolicy>("/api/gateway/watchdog", {
    method: "PUT",
    body: JSON.stringify(policy),
  });
}

export { ApiError };
