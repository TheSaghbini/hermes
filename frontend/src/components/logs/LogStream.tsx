/**
 * @ai-context Dark terminal-style log stream display with colored log levels.
 * Parses each line for timestamp, level, and message. Auto-scrolls when enabled.
 * Background #1a1b26, monospace font, colored levels: INFO=green, WARN=amber, ERROR=red.
 * @ai-related frontend/src/api/sse.ts, frontend/src/components/logs/LogControls.tsx
 */

import { useEffect, useRef, useMemo } from "react";

interface LogStreamProps {
  lines: string[];
  autoScroll: boolean;
  filter: string;
}

/** Parse a log line into structured parts for colored rendering */
function parseLogLine(line: string): {
  timestamp: string;
  level: string;
  message: string;
} {
  const tsLevelPattern =
    /^(\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)\s*\[?(\w+)\]?\s*(.*)$/;
  const levelFirstPattern =
    /^(DEBUG|INFO|WARN|WARNING|ERROR|CRITICAL)\s+(.*)$/i;

  const tsMatch = line.match(tsLevelPattern);
  if (tsMatch) {
    return {
      timestamp: tsMatch[1],
      level: tsMatch[2].toUpperCase(),
      message: tsMatch[3],
    };
  }

  const levelMatch = line.match(levelFirstPattern);
  if (levelMatch) {
    return {
      timestamp: "",
      level: levelMatch[1].toUpperCase(),
      message: levelMatch[2],
    };
  }

  return { timestamp: "", level: "", message: line };
}

/** Map log level to CSS class */
function levelClassName(level: string): string {
  switch (level) {
    case "ERROR":
    case "CRITICAL":
      return "log-level-error";
    case "WARN":
    case "WARNING":
      return "log-level-warn";
    case "INFO":
      return "log-level-info";
    case "DEBUG":
      return "log-level-debug";
    default:
      return "log-level-default";
  }
}

/** Terminal icon SVG for empty state */
function TerminalIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="40"
      height="40"
      aria-hidden="true"
    >
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

export function LogStream({ lines, autoScroll, filter }: LogStreamProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!filter) return lines;
    const lowerFilter = filter.toLowerCase();
    return lines.filter((line) => line.toLowerCase().includes(lowerFilter));
  }, [lines, filter]);

  const parsed = useMemo(() => filtered.map(parseLogLine), [filtered]);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [parsed, autoScroll]);

  if (parsed.length === 0) {
    return (
      <div className="log-stream-empty" ref={containerRef}>
        <TerminalIcon />
        <p>
          {filter
            ? "No logs match the current filter."
            : "No log lines yet. Waiting for gateway output\u2026"}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="log-stream"
      role="log"
      aria-label="Gateway log output"
      aria-live="polite"
      tabIndex={0}
    >
      {parsed.map((entry, i) => (
        <div key={i} className={`log-line ${levelClassName(entry.level)}`}>
          {entry.timestamp && (
            <span className="log-timestamp">{entry.timestamp}</span>
          )}
          {entry.level && (
            <span className={`log-level-badge ${levelClassName(entry.level)}`}>
              {entry.level}
            </span>
          )}
          <span className="log-message">{entry.message}</span>
        </div>
      ))}
    </div>
  );
}
