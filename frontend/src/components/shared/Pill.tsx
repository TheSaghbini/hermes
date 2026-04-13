/**
 * @ai-context Reusable status pill component with good/warn/danger variants.
 * Matches the existing .pill styling from the legacy CSS.
 * @ai-related frontend/src/styles/index.css
 */

import type { ReactNode } from "react";

interface PillProps {
  variant: "good" | "warn" | "danger";
  children: ReactNode;
}

export function Pill({ variant, children }: PillProps) {
  return (
    <span className={`pill ${variant}`} role="status">
      {children}
    </span>
  );
}
