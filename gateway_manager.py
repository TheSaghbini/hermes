"""@ai-context Hermes gateway subprocess supervisor.

Purpose: launch `hermes gateway run --replace`, capture recent logs in memory,
and keep a persistent text log under /data for the admin UI.
Dependencies: standard library subprocess/threading plus hermes_config paths.
@ai-related server.py, hermes_config.py
"""

from __future__ import annotations

import logging
import os
import queue
import subprocess
import threading
import time
from collections import deque
from typing import Any

from hermes_config import HERMES_HOME, LOG_PATH

LOGGER = logging.getLogger("hermes-admin.gateway")


class GatewayWatchdog:
    """Daemon thread that auto-restarts the gateway when it crashes."""

    def __init__(self, manager: GatewayManager) -> None:
        self._manager = manager
        self._consecutive_failures = 0
        self._last_restart_at = 0.0
        self._running_since = 0.0
        self._thread = threading.Thread(
            target=self._run, daemon=True, name="gateway-watchdog",
        )

    def start(self) -> None:
        self._thread.start()

    def reset_failures(self) -> None:
        """Reset failure counter (called on manual start/restart)."""
        self._consecutive_failures = 0
        self._running_since = time.time()

    def _run(self) -> None:
        while True:
            time.sleep(2)
            try:
                self._check()
            except Exception:
                LOGGER.exception("Watchdog check failed")

    def _check(self) -> None:
        # Lazy import to avoid circular import at module level
        from database import get_watchdog_config

        policy = get_watchdog_config()
        if not policy["enabled"]:
            self._consecutive_failures = 0
            return

        # If gateway is running, check if cooldown period reached to reset failures
        if self._manager.is_running():
            if self._running_since and (time.time() - self._running_since) > policy["cooldown_seconds"]:
                self._consecutive_failures = 0
            return

        # Gateway is NOT running — should we restart?
        if self._consecutive_failures >= policy["max_retries"]:
            return  # exhausted

        elapsed = time.time() - self._last_restart_at
        backoff = min(
            policy["backoff_base_seconds"] * (2 ** self._consecutive_failures),
            policy["backoff_max_seconds"],
        )
        if elapsed < backoff:
            return  # waiting for backoff

        # Do the restart
        self._consecutive_failures += 1
        self._last_restart_at = time.time()
        LOGGER.warning(
            "Watchdog auto-restarting gateway (attempt %d/%d)",
            self._consecutive_failures, policy["max_retries"],
        )
        self._manager.start()
        self._running_since = time.time()


class GatewayManager:
    """Run Hermes gateway as a single managed foreground subprocess."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._process: subprocess.Popen[str] | None = None
        self._started_at: float | None = None
        self._last_exit_code: int | None = None
        self._last_error = ""
        self._logs: deque[str] = deque(maxlen=200)
        self._log_subscribers: list[queue.Queue] = []
        self._subscriber_lock = threading.Lock()
        self.watchdog = GatewayWatchdog(self)

    def start(self) -> dict[str, Any]:
        """Launch the gateway if it is not already running."""
        with self._lock:
            if self._process and self._process.poll() is None:
                return self.status()

            env = os.environ.copy()
            env["HERMES_HOME"] = str(HERMES_HOME)

            try:
                self._process = subprocess.Popen(
                    [os.getenv("HERMES_BIN", "hermes"), "gateway", "run", "--replace"],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1,
                    env=env,
                )
            except OSError as exc:
                self._process = None
                self._last_error = str(exc)
                LOGGER.exception("Failed to launch Hermes gateway")
                return self.status()

            self._started_at = time.time()
            self._last_exit_code = None
            self._last_error = ""
            threading.Thread(
                target=self._capture_output,
                args=(self._process,),
                daemon=True,
            ).start()
            self._append_log("Hermes gateway process started.")
            self.watchdog.reset_failures()
            return self.status()

    def stop(self) -> dict[str, Any]:
        """Stop the gateway process gracefully, then force-kill if needed."""
        with self._lock:
            process = self._process
            if not process or process.poll() is not None:
                self._process = None
                return self.status()

            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)

            self._last_exit_code = process.returncode
            self._process = None
            self._append_log("Hermes gateway process stopped.")
            return self.status()

    def restart(self) -> dict[str, Any]:
        """Restart the managed gateway process."""
        self.stop()
        return self.start()

    def is_running(self) -> bool:
        """Report whether the managed process is alive."""
        with self._lock:
            return bool(self._process and self._process.poll() is None)

    def status(self) -> dict[str, Any]:
        """Return a serializable view of the gateway state."""
        with self._lock:
            if self._process and self._process.poll() is not None:
                self._last_exit_code = self._process.returncode
                self._process = None

            return {
                "running": self.is_running(),
                "pid": self._process.pid if self._process else None,
                "started_at": self._started_at,
                "last_exit_code": self._last_exit_code,
                "last_error": self._last_error,
                "logs": list(self._logs),
                "log_path": str(LOG_PATH),
                "command": "hermes gateway run --replace",
            }

    def _capture_output(self, process: subprocess.Popen[str]) -> None:
        """@ai-context Stream gateway logs to memory and a persistent file."""
        if not process.stdout:
            return

        try:
            handle = LOG_PATH.open("a", encoding="utf-8")
        except OSError:
            LOGGER.warning("Cannot open log file %s; falling back to memory-only.", LOG_PATH)
            handle = None

        try:
            for raw_line in iter(process.stdout.readline, ""):
                message = raw_line.rstrip()
                if not message:
                    continue
                stamped = f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {message}"
                self._append_log(stamped)
                if handle:
                    handle.write(stamped + "\n")
                    handle.flush()
        finally:
            if handle:
                handle.close()

        with self._lock:
            if process.returncode not in (None, 0):
                self._last_error = f"Gateway exited with code {process.returncode}."

    def subscribe_logs(self) -> queue.Queue:
        """Create a new log subscriber queue for SSE streaming."""
        q: queue.Queue = queue.Queue(maxsize=100)
        with self._subscriber_lock:
            self._log_subscribers.append(q)
        return q

    def unsubscribe_logs(self, q: queue.Queue) -> None:
        """Remove a log subscriber queue."""
        with self._subscriber_lock:
            try:
                self._log_subscribers.remove(q)
            except ValueError:
                pass

    def start_watchdog(self) -> None:
        """Start the watchdog daemon thread (call after DB init)."""
        self.watchdog.start()

    def _append_log(self, message: str) -> None:
        """Store a recent log line and broadcast to subscribers."""
        with self._lock:
            self._logs.append(message)
        with self._subscriber_lock:
            for q in self._log_subscribers:
                try:
                    q.put_nowait(message)
                except queue.Full:
                    pass  # drop for slow consumers
