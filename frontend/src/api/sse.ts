/**
 * @ai-context SSE streaming helpers for chat and log endpoints.
 * Uses ReadableStream to parse server-sent events from POST (chat) and GET (logs).
 * @ai-related server.py, frontend/src/api/types.ts
 */

import type { ChatRequest, ChatDelta, ChatDone } from "./types.ts";

/**
 * Stream chat completion via POST /api/chat.
 * Parses SSE events from the response body and dispatches typed callbacks.
 */
export async function streamChat(
  request: ChatRequest,
  onDelta: (delta: ChatDelta) => void,
  onDone: (done: ChatDone) => void,
  onError: (error: string) => void,
): Promise<void> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const text = await response.text();
    let msg = "Chat request failed.";
    try {
      msg = JSON.parse(text).error ?? msg;
    } catch {
      /* use default */
    }
    onError(msg);
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    onError("No response stream available.");
    return;
  }

  await parseSSEStream(reader, (eventType, data) => {
    if (eventType === "delta") {
      onDelta(data as ChatDelta);
    } else if (eventType === "done") {
      onDone(data as ChatDone);
    } else if (eventType === "error") {
      onError((data as { error: string }).error);
    }
  });
}

/**
 * Stream live gateway logs via GET /api/logs/stream.
 * Returns an AbortController so the caller can cancel the stream.
 */
export function streamLogs(
  onLog: (line: string, level?: string) => void,
  onError: (error: string) => void,
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const response = await fetch("/api/logs/stream", {
        credentials: "same-origin",
        signal: controller.signal,
      });

      if (!response.ok) {
        onError("Failed to connect to log stream.");
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        onError("No log stream available.");
        return;
      }

      await parseSSEStream(reader, (eventType, data) => {
        if (eventType === "log") {
          const event = data as { line: string; level?: string };
          onLog(event.line, event.level);
        }
      });
    } catch (err) {
      if ((err as DOMException).name !== "AbortError") {
        onError(String(err));
      }
    }
  })();

  return controller;
}

/**
 * @ai-context Low-level SSE parser for ReadableStream responses.
 * Handles event: and data: fields per the SSE spec.
 */
async function parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: (eventType: string, data: unknown) => void,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      let currentEvent = "message";
      let dataLines: string[] = [];

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          dataLines.push(line.slice(6));
        } else if (line === "") {
          if (dataLines.length > 0) {
            const raw = dataLines.join("\n");
            try {
              onEvent(currentEvent, JSON.parse(raw));
            } catch {
              onEvent(currentEvent, raw);
            }
          }
          currentEvent = "message";
          dataLines = [];
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
