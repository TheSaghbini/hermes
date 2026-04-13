/**
 * @ai-context Monospace log stream display fed by SSE with auto-scroll support.
 * @ai-related frontend/src/api/sse.ts
 */

import { useEffect, useRef } from "react";

interface LogStreamProps {
  lines: string[];
  autoScroll: boolean;
  filter: string;
}

export function LogStream({ lines, autoScroll, filter }: LogStreamProps) {
  const preRef = useRef<HTMLPreElement>(null);

  const filtered = filter
    ? lines.filter((line) => line.toLowerCase().includes(filter.toLowerCase()))
    : lines;

  useEffect(() => {
    if (autoScroll && preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [filtered, autoScroll]);

  return (
    <pre
      ref={preRef}
      className="log-stream"
      role="log"
      aria-label="Gateway log output"
      aria-live="polite"
      tabIndex={0}
    >
      {filtered.length > 0
        ? filtered.join("\n")
        : "No log lines yet."}
    </pre>
  );
}
