/**
 * @ai-context TypeScript interfaces matching the Hermes backend API schemas.
 * All shapes mirror the JSON returned by Flask endpoints defined in server.py.
 * @ai-related frontend/src/api/client.ts, .github/tasks/architecture.md
 */

/* ── Gateway & Config Status ── */

export interface GatewayState {
  running: boolean;
  pid: number | null;
  uptime: number | null;
  logs: string[];
}

export interface ConfigState {
  provider: string;
  default_model: string;
  ollama_base_url: string;
  ollama_api_key: string;
  openrouter_api_key: string;
  active_base_url: string;
  ollama_configured: boolean;
  openrouter_configured: boolean;
  ready: boolean;
}

export interface StatusPayload {
  config: ConfigState;
  gateway: GatewayState;
}

/* ── Chat ── */

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  model?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  created_at: string;
}

export interface Conversation {
  id: string;
  title: string;
  model: string;
  system_prompt: string;
  created_at: string;
  updated_at: string;
  messages?: Message[];
}

export interface ConversationListResponse {
  conversations: Conversation[];
  total: number;
}

export interface ChatRequest {
  conversation_id: string;
  message: string;
  model?: string;
  system_prompt?: string;
}

export interface ChatDelta {
  content: string;
  conversation_id: string;
  message_id: string;
}

export interface ChatDone {
  conversation_id: string;
  message_id: string;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

export interface ChatError {
  error: string;
  code?: string;
}

/* ── Backups ── */

export interface BackupMeta {
  id: string;
  label: string;
  created_at: string;
  size_bytes: number;
  files: string[];
}

export interface BackupListResponse {
  backups: BackupMeta[];
}

/* ── Watchdog ── */

export interface WatchdogPolicy {
  enabled: boolean;
  max_retries: number;
  backoff_base_seconds: number;
  backoff_max_seconds: number;
  cooldown_seconds: number;
  notify_on_restart: boolean;
}

/* ── Providers & Models ── */

export interface Provider {
  id: string;
  label: string;
  configured: boolean;
}

export interface ModelInfo {
  id: string;
  name: string;
  context_length?: number;
}

/* ── Config Management ── */

export interface EnvEntry {
  key: string;
  value: string;
  masked?: boolean;
}

/* ── Logs ── */

export interface LogEvent {
  line: string;
  level?: string;
}

export interface LogsHistoryResponse {
  lines: string[];
  total: number;
}

/* ── Connection Test ── */

export interface ConnectionTestResult {
  success: boolean;
  error?: string;
  latency_ms?: number;
  models?: string[];
  model_configured?: boolean;
}
