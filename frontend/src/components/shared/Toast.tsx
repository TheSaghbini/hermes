/**
 * @ai-context Toast notification system for success/error/info messages.
 * Exposes a ToastProvider context and useToast hook.
 * Auto-dismisses after 4 seconds. Accessible via role="alert".
 * Toasts slide in from top-right with scale animation and support manual dismiss.
 * @ai-related frontend/src/styles/index.css
 * @ai-mutates Manages toast state array; auto-removes toasts after timeout
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";

type ToastType = "success" | "error" | "info";

/** Auto-dismiss timeout in milliseconds */
const TOAST_TIMEOUT = 4000;

interface Toast {
  id: number;
  type: ToastType;
  message: string;
  /** Whether the toast is currently exiting (for animation) */
  exiting?: boolean;
}

interface ToastContextValue {
  addToast: (type: ToastType, message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Hook to access the toast system. Must be used within a ToastProvider.
 * @returns Object with addToast function
 * @throws Error if used outside of ToastProvider
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextIdRef = useRef(0);

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = nextIdRef.current++;
    setToasts((prev) => [...prev, { id, type, message }]);

    setTimeout(() => {
      // Mark as exiting for animation
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
      );

      // Remove after exit animation completes
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 200);
    }, TOAST_TIMEOUT);
  }, []);

  const removeToast = useCallback((id: number) => {
    // Mark as exiting for animation
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
    );

    // Remove after exit animation completes
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 200);
  }, []);

  return (
    <ToastContext value={{ addToast }}>
      {children}
      <div className="toast-container" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast toast-${toast.type}${
              toast.exiting ? " toast-exit" : ""
            }`}
            role="alert"
          >
            <span className="toast-message">{toast.message}</span>
            <button
              className="toast-close"
              onClick={() => removeToast(toast.id)}
              aria-label="Dismiss notification"
              type="button"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext>
  );
}
