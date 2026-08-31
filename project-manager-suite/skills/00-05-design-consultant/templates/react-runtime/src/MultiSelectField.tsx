import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, ChevronDown, LoaderCircle, X } from "lucide-react";
import {
  Button as AriaButton,
  ListBox,
  ListBoxItem,
  Popover,
  type Key,
  type Selection,
} from "react-aria-components";

export interface MultiSelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface MultiSelectFieldProps {
  label: ReactNode;
  options: MultiSelectOption[];
  value?: string[];
  defaultValue?: string[];
  onChange?: (value: string[]) => void;
  placeholder?: string;
  description?: ReactNode;
  error?: ReactNode;
  emptyMessage?: ReactNode;
  loading?: boolean;
  loadingMessage?: ReactNode;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

export function MultiSelectField({
  label,
  options,
  value,
  defaultValue = [],
  onChange,
  placeholder = "请选择",
  description,
  error,
  emptyMessage = "暂无可选项",
  loading = false,
  loadingMessage = "正在加载选项",
  disabled = false,
  required = false,
  className = "",
}: MultiSelectFieldProps) {
  const generatedId = useId();
  const labelId = `dc-multi-select-${generatedId}-label`;
  const summaryId = `dc-multi-select-${generatedId}-summary`;
  const listboxId = `dc-multi-select-${generatedId}-listbox`;
  const descriptionId = description ? `dc-multi-select-${generatedId}-description` : undefined;
  const errorId = error ? `dc-multi-select-${generatedId}-error` : undefined;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const controlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(() => new Set(defaultValue));
  const [open, setOpen] = useState(false);
  const [focusStrategy, setFocusStrategy] = useState<"first" | "last">("first");
  const selectedKeys = useMemo(
    () => new Set(controlled ? value : internalValue),
    [controlled, internalValue, value],
  );
  const selectedOptions = options.filter((option) => selectedKeys.has(option.value));
  const unavailable = disabled || loading;

  const commit = (next: Iterable<Key>) => {
    const keys = new Set([...next].map(String));
    const ordered = options.filter((option) => keys.has(option.value)).map((option) => option.value);
    if (!controlled) setInternalValue(new Set(ordered));
    onChange?.(ordered);
  };

  const handleSelectionChange = (selection: Selection) => {
    if (selection === "all") {
      commit(options.filter((option) => !option.disabled).map((option) => option.value));
      return;
    }
    commit(selection);
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (unavailable || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    setFocusStrategy(event.key === "ArrowUp" || event.key === "End" ? "last" : "first");
    setOpen(true);
  };

  const summary = selectedOptions.length === 0
    ? placeholder
    : selectedOptions.length <= 2
      ? selectedOptions.map((option) => option.label).join("、")
      : `${selectedOptions[0].label}等 ${selectedOptions.length} 项`;

  return (
    <div className={`dc-multi-select dc-field-shell ${error ? "dc-field-shell--error" : ""} ${className}`.trim()} aria-busy={loading || undefined}>
      <span className="dc-field-label" id={labelId}>
        {label}{required ? <span aria-hidden="true"> *</span> : null}
      </span>
      {description ? <span className="dc-field-description" id={descriptionId}>{description}</span> : null}
      <AriaButton
        ref={triggerRef}
        className="dc-multi-select__trigger"
        aria-controls={listboxId}
        aria-describedby={[descriptionId, errorId].filter(Boolean).join(" ") || undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-invalid={Boolean(error)}
        aria-labelledby={`${labelId} ${summaryId}`}
        isDisabled={unavailable}
        onKeyDown={handleTriggerKeyDown}
        onPress={() => setOpen((current) => !current)}
      >
        <span className={`dc-multi-select__summary ${selectedOptions.length === 0 ? "dc-multi-select__summary--placeholder" : ""}`} id={summaryId}>
          {loading ? loadingMessage : summary}
        </span>
        {selectedOptions.length > 0 ? <span className="dc-multi-select__count" aria-hidden="true">{selectedOptions.length}</span> : null}
        {loading
          ? <LoaderCircle className="dc-select-icon dc-select-spinner" aria-hidden="true" />
          : <ChevronDown className="dc-select-icon dc-select-chevron-icon" aria-hidden="true" />}
      </AriaButton>
      {selectedOptions.length > 0 ? (
        <div className="dc-multi-select__selections" aria-label="已选项目">
          {selectedOptions.map((option) => (
            <span className="dc-multi-select__chip" key={option.value}>
              <span>{option.label}</span>
              <button
                type="button"
                aria-label={`移除${option.label}`}
                disabled={unavailable}
                onClick={() => commit([...selectedKeys].filter((key) => String(key) !== option.value))}
              >
                <X className="dc-select-icon" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <Popover
        className="dc-selection-popover dc-multi-select__popover"
        triggerRef={triggerRef}
        isOpen={open}
        onOpenChange={setOpen}
        placement="bottom"
        offset={4}
      >
        <div
          onKeyDownCapture={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            window.setTimeout(() => triggerRef.current?.focus(), 0);
          }}
        >
          <ListBox<MultiSelectOption>
            id={listboxId}
            className="dc-selection-listbox dc-multi-select__listbox"
            aria-labelledby={labelId}
            selectionMode="multiple"
            selectionBehavior="toggle"
            selectedKeys={selectedKeys}
            disabledKeys={options.filter((option) => option.disabled).map((option) => option.value)}
            onSelectionChange={handleSelectionChange}
            autoFocus={focusStrategy}
            renderEmptyState={() => <div className="dc-selection-empty">{loading ? loadingMessage : emptyMessage}</div>}
          >
            {(loading ? [] : options).map((option) => (
              <ListBoxItem
                key={option.value}
                id={option.value}
                textValue={option.label}
                isDisabled={option.disabled}
                className="dc-selection-option dc-multi-select__option"
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
        </div>
      </Popover>
      {error ? <span className="dc-field-error" id={errorId} role="alert">{error}</span> : null}
    </div>
  );
}
