import { useId, type ChangeEvent, type ReactNode } from "react";
import { Check, ChevronDown, LoaderCircle } from "lucide-react";
import {
  Button as AriaButton,
  FieldError,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Select as AriaSelect,
  SelectValue,
  Text,
  type Key,
} from "react-aria-components";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface SelectFieldProps {
  label: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** @deprecated Prefer onValueChange. Kept for native-select migration compatibility. */
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
  placeholder?: string;
  loading?: boolean;
  loadingLabel?: string;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  form?: string;
  autoFocus?: boolean;
  id?: string;
  className?: string;
}

function createLegacyChangeEvent(value: string, name?: string): ChangeEvent<HTMLSelectElement> {
  const target = { value, name: name || "" } as HTMLSelectElement;
  return { target, currentTarget: target, type: "change" } as ChangeEvent<HTMLSelectElement>;
}

export function SelectField({
  label,
  description,
  error,
  options,
  value,
  defaultValue,
  onValueChange,
  onChange,
  placeholder = "请选择",
  loading = false,
  loadingLabel = "正在加载选项",
  disabled = false,
  required = false,
  name,
  form,
  autoFocus,
  id,
  className = "",
}: SelectFieldProps) {
  const generatedId = useId();
  const controlId = id || `dc-select-${generatedId}`;
  const unavailable = disabled || loading;

  const handleSelectionChange = (key: Key | null) => {
    if (key === null) return;
    const nextValue = String(key);
    onValueChange?.(nextValue);
    onChange?.(createLegacyChangeEvent(nextValue, name));
  };

  return (
    <AriaSelect<SelectOption>
      id={controlId}
      className={`dc-select dc-field-shell ${error ? "dc-field-shell--error" : ""} ${className}`.trim()}
      selectedKey={value === undefined ? undefined : value || null}
      defaultSelectedKey={defaultValue || null}
      onSelectionChange={handleSelectionChange}
      disabledKeys={options.filter((option) => option.disabled).map((option) => option.value)}
      isDisabled={unavailable}
      isRequired={required}
      isInvalid={Boolean(error)}
      name={name}
      form={form}
      autoFocus={autoFocus}
      placeholder={placeholder}
      aria-busy={loading || undefined}
      data-busy={loading || undefined}
    >
      <Label className="dc-field-label">
        {label}{required ? <span className="dc-field-required" aria-hidden="true"> *</span> : null}
      </Label>
      {description ? <Text slot="description" className="dc-field-description">{description}</Text> : null}
      <AriaButton className="dc-select-trigger" aria-busy={loading || undefined}>
        {loading ? (
          <>
            <LoaderCircle className="dc-select-icon dc-select-spinner" aria-hidden="true" />
            <span className="dc-select-value" role="status" aria-live="polite">{loadingLabel}</span>
          </>
        ) : (
          <SelectValue<SelectOption> className="dc-select-value">
            {({ isPlaceholder, selectedItems }) => (
              isPlaceholder ? placeholder : selectedItems[0]?.label
            )}
          </SelectValue>
        )}
        <ChevronDown className="dc-select-icon dc-select-chevron-icon" aria-hidden="true" />
      </AriaButton>
      <Popover className="dc-selection-popover dc-select-popover" placement="bottom start" offset={4}>
        <ListBox<SelectOption>
          className="dc-selection-listbox dc-select-listbox"
          items={options}
          renderEmptyState={() => <div className="dc-selection-empty">暂无可选项</div>}
        >
          {(option) => (
            <ListBoxItem
              id={option.value}
              textValue={option.label}
              isDisabled={option.disabled}
              className="dc-selection-option dc-select-option"
            >
              {({ isSelected }) => (
                <>
                  <span className="dc-selection-option-copy">
                    <span>{option.label}</span>
                    {option.description ? <small>{option.description}</small> : null}
                  </span>
                  <Check
                    className="dc-select-icon dc-selection-option-check"
                    data-selected={isSelected || undefined}
                    aria-hidden="true"
                  />
                </>
              )}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
      {error ? <FieldError className="dc-field-error">{error}</FieldError> : null}
    </AriaSelect>
  );
}
