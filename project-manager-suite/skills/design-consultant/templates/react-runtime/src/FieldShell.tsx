import {
  cloneElement,
  isValidElement,
  useId,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";

export interface FieldShellProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  label: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  controlId?: string;
  children: ReactElement<Record<string, unknown>>;
}

export function FieldShell({
  label,
  description,
  error,
  required = false,
  controlId,
  className = "",
  children,
  ...props
}: FieldShellProps) {
  const generatedId = useId();
  const id = controlId || (isValidElement(children) && typeof children.props.id === "string" ? children.props.id : null) || `dc-field-${generatedId}`;
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [
    typeof children.props["aria-describedby"] === "string" ? children.props["aria-describedby"] : undefined,
    descriptionId,
    errorId,
  ].filter(Boolean).join(" ") || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id: children.props.id ?? id,
        "aria-describedby": describedBy,
        "aria-invalid": children.props["aria-invalid"] ?? Boolean(error),
        required: children.props.required ?? required,
      })
    : children;

  return (
    <div {...props} className={`dc-field-shell ${error ? "dc-field-shell--error" : ""} ${className}`.trim()}>
      <label className="dc-field-label" htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {description ? <span className="dc-field-description" id={descriptionId}>{description}</span> : null}
      {control}
      {error ? <span className="dc-field-error" id={errorId} role="alert">{error}</span> : null}
    </div>
  );
}
