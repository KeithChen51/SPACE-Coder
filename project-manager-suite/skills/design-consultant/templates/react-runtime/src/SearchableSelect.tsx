import { useState, type ReactNode } from "react";
import { Check, ChevronDown, LoaderCircle, X } from "lucide-react";
import {
  Button as AriaButton,
  ComboBox as AriaComboBox,
  FieldError,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Text,
} from "react-aria-components";

export interface SearchableSelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface SearchableSelectProps {
  label: ReactNode;
  options: SearchableSelectOption[];
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (value: string | null) => void;
  placeholder?: string;
  description?: ReactNode;
  error?: ReactNode;
  emptyMessage?: ReactNode;
  loading?: boolean;
  loadingMessage?: ReactNode;
  clearable?: boolean;
  clearLabel?: string;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  className?: string;
}

export function SearchableSelect({
  label,
  options,
  value,
  defaultValue,
  onChange,
  placeholder = "请选择",
  description,
  error,
  emptyMessage = "没有匹配选项",
  loading = false,
  loadingMessage = "正在加载选项",
  clearable = false,
  clearLabel,
  disabled = false,
  required = false,
  name,
  className = "",
}: SearchableSelectProps) {
  const controlled = value !== undefined;
  const [internalValue, setInternalValue] = useState<string | null>(defaultValue ?? null);
  const selectedValue = controlled ? value : internalValue;

  const setSelectedValue = (next: string | null) => {
    if (!controlled) setInternalValue(next);
    onChange?.(next);
  };
  const handleChange = (key: string | number | null) => {
    if (key === null) return;
    setSelectedValue(String(key));
  };
  const accessibleClearLabel = clearLabel || (typeof label === "string" ? `清除${label}` : "清除当前选择");

  return (
    <AriaComboBox<SearchableSelectOption>
      className={`dc-searchable-select dc-field-shell ${error ? "dc-field-shell--error" : ""} ${className}`.trim()}
      value={selectedValue}
      onChange={handleChange}
      disabledKeys={options.filter((option) => option.disabled).map((option) => option.value)}
      isDisabled={disabled || loading}
      isRequired={required}
      isInvalid={Boolean(error)}
      aria-busy={loading || undefined}
      name={name}
      menuTrigger="focus"
      allowsEmptyCollection
      defaultFilter={(textValue, inputValue) => textValue.toLocaleLowerCase("zh-CN").includes(inputValue.trim().toLocaleLowerCase("zh-CN"))}
    >
      <Label className="dc-field-label">
        {label}{required ? <span aria-hidden="true"> *</span> : null}
      </Label>
      {description ? <Text slot="description" className="dc-field-description">{description}</Text> : null}
      <div className="dc-searchable-select__control">
        <Input className="dc-searchable-select__input" placeholder={placeholder} />
        {clearable && selectedValue !== null && !loading ? (
          <button
            className="dc-searchable-select__clear"
            type="button"
            aria-label={accessibleClearLabel}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setSelectedValue(null)}
          >
            <X className="dc-select-icon" aria-hidden="true" />
          </button>
        ) : null}
        <AriaButton className="dc-searchable-select__trigger" aria-label="展开选项">
          {loading
            ? <LoaderCircle className="dc-select-icon dc-select-spinner" aria-hidden="true" />
            : <ChevronDown className="dc-select-icon dc-select-chevron-icon" aria-hidden="true" />}
        </AriaButton>
      </div>
      <Popover className="dc-selection-popover dc-searchable-select__popover" offset={4}>
        <ListBox<SearchableSelectOption> className="dc-selection-listbox dc-searchable-select__listbox" renderEmptyState={() => <div className="dc-selection-empty">{loading ? loadingMessage : emptyMessage}</div>}>
          {(loading ? [] : options).map((option) => (
            <ListBoxItem
              key={option.value}
              id={option.value}
              textValue={option.label}
              isDisabled={option.disabled}
              className="dc-selection-option dc-searchable-select__option"
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
          ))}
        </ListBox>
      </Popover>
      {error ? <FieldError className="dc-field-error">{error}</FieldError> : null}
    </AriaComboBox>
  );
}
