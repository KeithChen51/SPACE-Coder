import { type ReactNode } from "react";
import {
  CheckboxButton,
  CheckboxField as AriaCheckboxField,
  CheckboxGroup,
  FieldError,
  Label,
  RadioButton,
  RadioField,
  RadioGroup,
  SwitchButton,
  SwitchField as AriaSwitchField,
  Text,
} from "react-aria-components";

export interface FormSelectionOption {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

export interface CheckboxFieldProps {
  label: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  value?: string;
  name?: string;
  isSelected?: boolean;
  defaultSelected?: boolean;
  isIndeterminate?: boolean;
  isDisabled?: boolean;
  isReadOnly?: boolean;
  isRequired?: boolean;
  onChange?: (selected: boolean) => void;
  className?: string;
}

function SelectionIndicator({ kind }: { kind: "checkbox" | "radio" | "switch" }) {
  return <span className={`dc-selection__indicator dc-selection__indicator--${kind}`} aria-hidden="true" />;
}

function SelectionCopy({ label, description }: { label: ReactNode; description?: ReactNode }) {
  return (
    <span className="dc-selection__copy">
      <span className="dc-selection__label">{label}</span>
      {description ? <span className="dc-selection__description">{description}</span> : null}
    </span>
  );
}

export function CheckboxField({
  label,
  description,
  error,
  className = "",
  ...props
}: CheckboxFieldProps) {
  return (
    <AriaCheckboxField
      {...props}
      className={`dc-selection-field ${error ? "dc-selection-field--error" : ""} ${className}`.trim()}
      isInvalid={Boolean(error)}
    >
      <CheckboxButton className="dc-selection-control">
        <SelectionIndicator kind="checkbox" />
        <SelectionCopy label={label} />
      </CheckboxButton>
      {description ? <Text slot="description" className="dc-selection__description">{description}</Text> : null}
      {error ? <FieldError className="dc-field-error">{error}</FieldError> : null}
    </AriaCheckboxField>
  );
}

export interface CheckboxGroupFieldProps {
  label: ReactNode;
  options: FormSelectionOption[];
  description?: ReactNode;
  error?: ReactNode;
  value?: string[];
  defaultValue?: string[];
  name?: string;
  orientation?: "horizontal" | "vertical";
  isDisabled?: boolean;
  isReadOnly?: boolean;
  isRequired?: boolean;
  onChange?: (value: string[]) => void;
  className?: string;
}

export function CheckboxGroupField({
  label,
  options,
  description,
  error,
  orientation = "vertical",
  className = "",
  ...props
}: CheckboxGroupFieldProps) {
  return (
    <CheckboxGroup
      {...props}
      isInvalid={Boolean(error)}
      data-orientation={orientation}
      className={`dc-selection-group dc-selection-group--${orientation} ${error ? "dc-selection-group--error" : ""} ${className}`.trim()}
    >
      <Label className="dc-field-label">{label}{props.isRequired ? <span aria-hidden="true"> *</span> : null}</Label>
      {description ? <Text slot="description" className="dc-field-description">{description}</Text> : null}
      <div className="dc-selection-group__options">
        {options.map((option) => (
          <AriaCheckboxField key={option.value} value={option.value} isDisabled={option.disabled} className="dc-selection-field">
            <CheckboxButton className="dc-selection-control">
              <SelectionIndicator kind="checkbox" />
              <SelectionCopy label={option.label} description={option.description} />
            </CheckboxButton>
          </AriaCheckboxField>
        ))}
      </div>
      {error ? <FieldError className="dc-field-error">{error}</FieldError> : null}
    </CheckboxGroup>
  );
}

export interface RadioGroupFieldProps {
  label: ReactNode;
  options: FormSelectionOption[];
  description?: ReactNode;
  error?: ReactNode;
  value?: string;
  defaultValue?: string;
  name?: string;
  orientation?: "horizontal" | "vertical";
  isDisabled?: boolean;
  isReadOnly?: boolean;
  isRequired?: boolean;
  onChange?: (value: string) => void;
  className?: string;
}

export function RadioGroupField({
  label,
  options,
  description,
  error,
  orientation = "vertical",
  className = "",
  ...props
}: RadioGroupFieldProps) {
  return (
    <RadioGroup
      {...props}
      orientation={orientation}
      isInvalid={Boolean(error)}
      className={`dc-selection-group dc-selection-group--${orientation} ${error ? "dc-selection-group--error" : ""} ${className}`.trim()}
    >
      <Label className="dc-field-label">{label}{props.isRequired ? <span aria-hidden="true"> *</span> : null}</Label>
      {description ? <Text slot="description" className="dc-field-description">{description}</Text> : null}
      <div className="dc-selection-group__options">
        {options.map((option) => (
          <RadioField key={option.value} value={option.value} isDisabled={option.disabled} className="dc-selection-field">
            <RadioButton className="dc-selection-control">
              <SelectionIndicator kind="radio" />
              <SelectionCopy label={option.label} description={option.description} />
            </RadioButton>
          </RadioField>
        ))}
      </div>
      {error ? <FieldError className="dc-field-error">{error}</FieldError> : null}
    </RadioGroup>
  );
}

export interface SwitchFieldProps {
  label: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  name?: string;
  value?: string;
  isSelected?: boolean;
  defaultSelected?: boolean;
  isDisabled?: boolean;
  isReadOnly?: boolean;
  isRequired?: boolean;
  onChange?: (selected: boolean) => void;
  className?: string;
}

export function SwitchField({
  label,
  description,
  error,
  className = "",
  ...props
}: SwitchFieldProps) {
  return (
    <AriaSwitchField
      {...props}
      isInvalid={Boolean(error)}
      className={`dc-selection-field ${error ? "dc-selection-field--error" : ""} ${className}`.trim()}
    >
      <SwitchButton className="dc-selection-control dc-selection-control--switch">
        <SelectionIndicator kind="switch" />
        <SelectionCopy label={label} />
      </SwitchButton>
      {description ? <Text slot="description" className="dc-selection__description">{description}</Text> : null}
      {error ? <FieldError className="dc-field-error">{error}</FieldError> : null}
    </AriaSwitchField>
  );
}
