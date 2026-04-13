/**
 * @ai-context Logs page combining historical log load with live SSE streaming.
 * @ai-related frontend/src/components/logs/LogStream.tsx, frontend/src/components/logs/LogControls.tsx
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Header } from "../components/layout/Header.tsx";
import { LogStream } from "../components/logs/LogStream.tsx";
import { LogControls } from "../components/logs/LogControls.tsx";
import { getLogsHistory } from "../api/client.ts";
import { streamLogs } from "../api/sse.ts";

export function LogsPage() {
  const [lines, setLines] = useState<string[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState("");
  const [connected, setConnected] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const history = await getLogsHistory();
        setLines(history.lines);
      } catch {
        /* history unavailable — will populate from SSE */
      }
    })();
  }, []);

  useEffect(() => {
    const controller = streamLogs(
      (line) => {
        setLines((prev) => [...prev, line]);
        setConnected(true);
      },
      () => {
        setConnected(false);
      },
    );

    controllerRef.current = controller;
    setConnected(true);

    return () => {
      controller.abort();
    };
  }, []);

  const handleClear = useCallback(() => {
    setLines([]);
  }, []);

  return (
    <div className="logs-page">
      <Header title="Gateway Logs" />

      <div className="panel">
        <LogControls
          autoScroll={autoScroll}
          onAutoScrollChange={setAutoScroll}
          filter={filter}
          onFilterChange={setFilter}
          onClear={handleClear}
          connected={connected}
        />
        <LogStream lines={lines} autoScroll={autoScroll} filter={filter} />
      </div>
    </div>
  );
}
