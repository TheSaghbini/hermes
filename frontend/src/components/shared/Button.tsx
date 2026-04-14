/**
 * @ai-context Styled button component with primary/secondary/danger/ghost variants,
 * sizes (sm/md/lg), loading state with spinner, and icon support.
 * Extends native button attributes for full HTML button API compatibility.
 * @ai-related frontend/src/styles/index.css
 * @ai-mutates Can set aria-busy when loading
 */

import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style variant */
  variant?: "primary" | "secondary" | "danger" | "ghost";
  /** Size preset */
  size?: "sm" | "md" | "lg";
  /** Shows a spinner and disables interaction when true */
  loading?: boolean;
  /** Optional icon rendered before children */
  icon?: ReactNode;
  /** Button label content */
  children: ReactNode;
}

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  icon,
  children,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  const sizeClass = size !== "md" ? `btn-${size}` : "";
  const loadingClass = loading ? "btn-loading" : "";

  return (
    <button
      className={`btn ${variant} ${sizeClass} ${loadingClass} ${className}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {icon && !loading && (
        <span className="btn-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      {children}
    </button>
  );
}
