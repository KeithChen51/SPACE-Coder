import type { HTMLAttributes, ReactNode } from "react";

export interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  children: ReactNode;
  showDot?: boolean;
}

export function StatusBadge({ tone = "neutral", children, showDot = true, className = "", ...props }: StatusBadgeProps) {
  return (
    <span {...props} className={`dc-status-badge dc-status-badge--${tone} ${className}`.trim()}>
      {showDot ? <span className="dc-status-dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
