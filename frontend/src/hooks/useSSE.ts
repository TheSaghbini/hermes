/**
 * @ai-context Generic SSE hook with auto-reconnect logic.
 * Wraps the streamLogs helper and provides connection state.
 * @ai-related frontend/src/api/sse.ts
 */

import { useEffect, useRef, useState, useCallback } from "react";

interface UseSSEOptions {
  /** URL to connect to */
  url: string;
  /** Called for each SSE event */
  onEvent: (eventType: string, data: unknown) => void;
  /** Called on connection error */
  onError?: (error: string) => void;
  /** Auto-reconnect delay in ms (0 to disable) */
  reconnectDelay?: number;
  /** Whether the connection should be active */
  enabled?: boolean;
}

interface UseSSEReturn {
  connected: boolean;
  error: string | null;
  disconnect: () => void;
  reconnect: () => void;
}

export function useSSE({
  url,
  onEvent,
  onError,
  reconnectDelay = 3000,
  enabled = true,
}: UseSSEOptions): UseSSEReturn {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const connect = useCallback(() => {
    if (controllerRef.current) controllerRef.current.abort();

    const controller = new AbortController();
    controllerRef.current = controller;

    (async () => {
      try {
        const response = await fetch(url, {
          credentials: "same-origin",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`SSE connection failed: ${response.status}`);
        }

        setConnected(true);
        setError(null);

        const reader = response.body?.getReader();
        if (!reader) return;

        const decoder = new TextDecoder();
        let buffer = "";
        let currentEvent = "message";
        let dataLines: string[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              dataLines.push(line.slice(6));
            } else if (line === "") {
              if (dataLines.length > 0) {
                const raw = dataLines.join("\n");
                try {
                  onEventRef.current(currentEvent, JSON.parse(raw));
                } catch {
                  onEventRef.current(currentEvent, raw);
                }
              }
              currentEvent = "message";
              dataLines = [];
            }
          }
        }
      } catch (err) {
        if ((err as DOMException).name === "AbortError") return;
        const msg = err instanceof Error ? err.message : "SSE error.";
        setError(msg);
        onErrorRef.current?.(msg);
      } finally {
        setConnected(false);
        if (enabledRef.current && reconnectDelay > 0) {
          reconnectTimerRef.current = setTimeout(connect, reconnectDelay);
        }
      }
    })();
  }, [url, reconnectDelay]);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    controllerRef.current?.abort();
    controllerRef.current = null;
    setConnected(false);
  }, []);

  useEffect(() => {
    if (enabled) {
      connect();
    } else {
      disconnect();
    }
    return disconnect;
  }, [enabled, connect, disconnect]);

  return { connected, error, disconnect, reconnect: connect };
}
