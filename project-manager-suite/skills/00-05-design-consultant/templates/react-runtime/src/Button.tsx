import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "small" | "medium" | "large";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingLabel?: string;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  children: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "medium",
    loading = false,
    loadingLabel = "处理中",
    leadingIcon,
    trailingIcon,
    disabled,
    className = "",
    children,
    type = "button",
    ...props
  },
  ref,
) {
  const loadingName = loading && typeof children === "string" ? `${children}，${loadingLabel}` : undefined;
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      className={`dc-button dc-button--${variant} ${className}`.trim()}
      data-size={size}
      data-loading={loading || undefined}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-label={loadingName}
    >
      {loading ? <span className="dc-spinner" aria-hidden="true" /> : null}
      {!loading && leadingIcon ? <span className="dc-button__icon" aria-hidden="true">{leadingIcon}</span> : null}
      <span>{loading ? loadingLabel : children}</span>
      {!loading && trailingIcon ? <span className="dc-button__icon" aria-hidden="true">{trailingIcon}</span> : null}
    </button>
  );
});
