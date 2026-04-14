/**
 * @ai-context Reusable status pill/badge component with dot indicator and color variants.
 * Supports good (green), warn (amber), danger (red), and info (blue) variants.
 * Uses role="status" for screen reader accessibility.
 * @ai-related frontend/src/styles/index.css
 */

import type { ReactNode } from "react";

interface PillProps {
  /** Visual variant controlling color scheme */
  variant: "good" | "warn" | "danger" | "info";
  /** Content displayed inside the pill */
  children: ReactNode;
}

export function Pill({ variant, children }: PillProps) {
  return (
    <span className={`pill ${variant}`} role="status">
      <span className="pill-dot" aria-hidden="true" />
      {children}
    </span>
  );
}
