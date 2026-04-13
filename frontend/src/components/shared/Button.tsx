/**
 * @ai-context Styled button component with primary/secondary/danger variants.
 * Extends native button with consistent styling and proper focus indicators.
 * @ai-related frontend/src/styles/index.css
 */

import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger";
  children: ReactNode;
}

export function Button({
  variant = "secondary",
  children,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button className={`btn ${variant} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}
