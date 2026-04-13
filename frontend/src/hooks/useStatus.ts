/**
 * @ai-context Hook that polls /api/status every 15s.
 * Returns current gateway + config status, loading flag, error, and manual refresh.
 * @ai-related frontend/src/api/client.ts
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type { StatusPayload } from "../api/types.ts";
import { getStatus } from "../api/client.ts";

const POLL_INTERVAL_MS = 15_000;

interface UseStatusReturn {
  status: StatusPayload | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useStatus(): UseStatusReturn {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const payload = await getStatus();
      setStatus(payload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    intervalRef.current = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refresh]);

  return { status, loading, error, refresh };
}
