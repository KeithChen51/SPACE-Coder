import {
  useId,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";

interface FieldCopyProps {
  label: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  id?: string;
  className?: string;
}

export interface TextFieldProps extends FieldCopyProps, Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "id" | "className" | "required" | "prefix"> {
  type?: "text" | "email" | "number" | "password" | "search" | "tel" | "url";
  prefix?: ReactNode;
  suffix?: ReactNode;
}

function FieldHeader({ label, required, controlId }: { label: ReactNode; required?: boolean; controlId: string }) {
  return (
    <label className="dc-field-label" htmlFor={controlId}>
      {label}{required ? <span className="dc-field-required" aria-hidden="true"> *</span> : null}
    </label>
  );
}

function describedBy(...ids: Array<string | undefined>) {
  return ids.filter(Boolean).join(" ") || undefined;
}

export function TextField({
  label,
  description,
  error,
  required,
  id,
  className = "",
  type = "text",
  prefix,
  suffix,
  ...props
}: TextFieldProps) {
  const generatedId = useId();
  const controlId = id || `dc-text-${generatedId}`;
  const descriptionId = description ? `${controlId}-description` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const control = (
    <input
      {...props}
      id={controlId}
      type={type}
      required={required}
      aria-invalid={Boolean(error)}
      aria-describedby={describedBy(props["aria-describedby"], descriptionId, errorId)}
    />
  );

  return (
    <div className={`dc-field-shell ${error ? "dc-field-shell--error" : ""} ${className}`.trim()}>
      <FieldHeader label={label} required={required} controlId={controlId} />
      {description ? <span className="dc-field-description" id={descriptionId}>{description}</span> : null}
      {prefix || suffix ? (
        <span className="dc-field-affix">
          {prefix ? <span className="dc-field-affix__prefix" aria-hidden="true">{prefix}</span> : null}
          {control}
          {suffix ? <span className="dc-field-affix__suffix" aria-hidden="true">{suffix}</span> : null}
        </span>
      ) : control}
      {error ? <span className="dc-field-error" id={errorId} role="alert">{error}</span> : null}
    </div>
  );
}

export interface TextAreaFieldProps extends FieldCopyProps, Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id" | "className" | "required"> {
  showCount?: boolean;
}

export function TextAreaField({
  label,
  description,
  error,
  required,
  id,
  className = "",
  showCount = false,
  value,
  defaultValue,
  maxLength,
  onChange,
  rows = 4,
  ...props
}: TextAreaFieldProps) {
  const generatedId = useId();
  const controlId = id || `dc-textarea-${generatedId}`;
  const descriptionId = description ? `${controlId}-description` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const countId = showCount ? `${controlId}-count` : undefined;
  const [internalValue, setInternalValue] = useState(String(defaultValue ?? ""));
  const visibleValue = value === undefined ? internalValue : String(value);
  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    if (value === undefined) setInternalValue(event.target.value);
    onChange?.(event);
  };

  return (
    <div className={`dc-field-shell ${error ? "dc-field-shell--error" : ""} ${className}`.trim()}>
      <FieldHeader label={label} required={required} controlId={controlId} />
      {description ? <span className="dc-field-description" id={descriptionId}>{description}</span> : null}
      <textarea
        {...props}
        id={controlId}
        rows={rows}
        required={required}
        value={value}
        defaultValue={value === undefined ? defaultValue : undefined}
        maxLength={maxLength}
        onChange={handleChange}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy(props["aria-describedby"], descriptionId, errorId, countId)}
      />
      <span className="dc-field-footer">
        {error ? <span className="dc-field-error" id={errorId} role="alert">{error}</span> : <span />}
        {showCount ? <span className="dc-field-count" id={countId}>{visibleValue.length}{maxLength ? ` / ${maxLength}` : ""}</span> : null}
      </span>
    </div>
  );
}

export interface NumberFieldProps extends FieldCopyProps, Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "id" | "className" | "required" | "prefix"> {
  prefix?: ReactNode;
  suffix?: ReactNode;
}

export function NumberField({ prefix, suffix, ...props }: NumberFieldProps) {
  return <TextField {...props} type="number" inputMode="decimal" prefix={prefix} suffix={suffix} />;
}
