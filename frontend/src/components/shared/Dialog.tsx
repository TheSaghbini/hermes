/**
 * @ai-context Modal dialog component with backdrop blur, slide-in animation,
 * close button, and proper focus trap via the native <dialog> element.
 * Prevents body scroll when open and restores focus on close.
 * @ai-related frontend/src/styles/index.css, frontend/src/components/shared/Button.tsx
 * @ai-mutates Manages focus (saves/restores previous focus), calls showModal/close on dialog element
 */

import { useEffect, useRef, useCallback, type ReactNode } from "react";
import { Button } from "./Button.tsx";

interface DialogProps {
  /** Whether the dialog is currently visible */
  open: boolean;
  /** Dialog title rendered in the header */
  title: string;
  /** Dialog body content */
  children: ReactNode;
  /** Label for the confirm action button; defaults to "Confirm" */
  confirmLabel?: string;
  /** Variant for the confirm button; defaults to "primary" */
  confirmVariant?: "primary" | "danger";
  /** Label for the cancel button; defaults to "Cancel" */
  cancelLabel?: string;
  /** Callback fired when the confirm button is clicked; if omitted, no confirm button is shown */
  onConfirm?: () => void;
  /** Callback fired when the dialog is dismissed (cancel button, close button, backdrop click, or Escape) */
  onCancel: () => void;
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="18"
      height="18"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function Dialog({
  open,
  title,
  children,
  confirmLabel = "Confirm",
  confirmVariant = "primary",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Open/close the native <dialog> element in response to the `open` prop
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;

    if (open && !el.open) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      el.showModal();
    } else if (!open && el.open) {
      el.close();
      previousFocusRef.current?.focus();
    }
  }, [open]);

  // Prevent the native Escape key from closing the dialog without calling onCancel
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;

    const handleCancel = (e: Event) => {
      e.preventDefault();
      onCancel();
    };

    el.addEventListener("cancel", handleCancel);
    return () => el.removeEventListener("cancel", handleCancel);
  }, [onCancel]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDialogElement>) => {
      if (e.target === dialogRef.current) {
        onCancel();
      }
    },
    [onCancel],
  );

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      onClick={handleBackdropClick}
      aria-labelledby="dialog-title"
      aria-modal="true"
    >
      <div className="dialog-content">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <h2 id="dialog-title" className="dialog-title">
            {title}
          </h2>
          <button
            className="ghost btn-sm"
            onClick={onCancel}
            aria-label="Close dialog"
            style={{ minHeight: 28, minWidth: 28, padding: 4 }}
          >
            <CloseIcon />
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        <div className="dialog-actions">
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          {onConfirm && (
            <Button variant={confirmVariant} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          )}
        </div>
      </div>
    </dialog>
  );
}
