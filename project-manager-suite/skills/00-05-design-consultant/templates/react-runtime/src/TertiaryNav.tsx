import { useState, type Key, type ReactNode } from "react";

export interface TertiaryNavItem {
  id: Key;
  label: ReactNode;
  count?: number;
  href?: string;
  disabled?: boolean;
}

export interface TertiaryNavProps {
  label: string;
  items: TertiaryNavItem[];
  selectedKey?: Key;
  defaultSelectedKey?: Key;
  onSelectionChange?: (key: Key) => void;
  className?: string;
}

export function TertiaryNav({
  label,
  items,
  selectedKey,
  defaultSelectedKey,
  onSelectionChange,
  className = "",
}: TertiaryNavProps) {
  const [internalKey, setInternalKey] = useState<Key | undefined>(defaultSelectedKey ?? items.find((item) => !item.disabled)?.id);
  const activeKey = selectedKey ?? internalKey;
  const select = (key: Key) => {
    if (selectedKey === undefined) setInternalKey(key);
    onSelectionChange?.(key);
  };

  return (
    <nav className={`dc-tertiary-nav ${className}`.trim()} aria-label={label}>
      <div className="dc-tertiary-nav__track">
        {items.map((item) => {
          const active = item.id === activeKey;
          const copy = <><span>{item.label}</span>{typeof item.count === "number" ? <span className="dc-tertiary-nav__count">{item.count}</span> : null}</>;
          return item.href ? (
            <a
              key={String(item.id)}
              className="dc-tertiary-nav__item"
              href={item.disabled ? undefined : item.href}
              aria-current={active ? "page" : undefined}
              aria-disabled={item.disabled || undefined}
              data-active={active || undefined}
              onClick={(event) => {
                if (item.disabled) event.preventDefault();
                else select(item.id);
              }}
            >{copy}</a>
          ) : (
            <button
              key={String(item.id)}
              className="dc-tertiary-nav__item"
              type="button"
              disabled={item.disabled}
              aria-current={active ? "page" : undefined}
              data-active={active || undefined}
              onClick={() => select(item.id)}
            >{copy}</button>
          );
        })}
      </div>
    </nav>
  );
}
