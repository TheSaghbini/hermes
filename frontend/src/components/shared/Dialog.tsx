/**
 * @ai-context Modal dialog component with backdrop, title, content, and action buttons.
 * Traps focus inside the dialog and closes on Escape key.
 * @ai-related frontend/src/styles/index.css
 */

import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./Button.tsx";

interface DialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  confirmVariant?: "primary" | "danger";
  cancelLabel?: string;
  onConfirm?: () => void;
  onCancel: () => void;
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

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) {
      onCancel();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      onClick={handleBackdropClick}
      aria-labelledby="dialog-title"
    >
      <div className="dialog-content">
        <h2 id="dialog-title" className="dialog-title">
          {title}
        </h2>
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
