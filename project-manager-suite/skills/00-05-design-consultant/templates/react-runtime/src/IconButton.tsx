import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { Tooltip } from "./Tooltip";

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  label: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "small" | "medium" | "large";
  loading?: boolean;
  tooltip?: ReactNode | false;
  tooltipDelay?: number;
  children: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    label,
    variant = "ghost",
    size = "medium",
    loading = false,
    tooltip = label,
    tooltipDelay = 500,
    disabled,
    className = "",
    children,
    type = "button",
    ...props
  },
  ref,
) {
  const control = (
    <button
      {...props}
      ref={ref}
      type={type}
      className={`dc-icon-button dc-button--${variant} ${className}`.trim()}
      data-size={size}
      aria-label={label}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
    >
      {loading ? <span className="dc-spinner" aria-hidden="true" /> : <span aria-hidden="true">{children}</span>}
    </button>
  );
  return tooltip && !disabled && !loading
    ? <Tooltip content={tooltip} delay={tooltipDelay}>{control}</Tooltip>
    : control;
});
