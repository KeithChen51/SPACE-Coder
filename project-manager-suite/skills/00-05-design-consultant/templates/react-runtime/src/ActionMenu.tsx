import { type Key, type ReactNode } from "react";
import {
  Button as AriaButton,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
  Text,
} from "react-aria-components";

export interface ActionMenuItem {
  id: string;
  label: ReactNode;
  textValue?: string;
  description?: ReactNode;
  icon?: ReactNode;
  shortcut?: ReactNode;
  tone?: "default" | "danger";
  disabled?: boolean;
  onAction?: () => void;
}

export interface ActionMenuProps {
  label: string;
  items: ActionMenuItem[];
  triggerContent?: ReactNode;
  triggerVariant?: "secondary" | "ghost";
  placement?: "top" | "bottom" | "left" | "right" | "start" | "end" | "bottom start" | "bottom end" | "top start" | "top end";
  disabled?: boolean;
  onAction?: (id: string) => void;
  className?: string;
}

export function ActionMenu({
  label,
  items,
  triggerContent = <span aria-hidden="true">•••</span>,
  triggerVariant = "ghost",
  placement = "bottom end",
  disabled = false,
  onAction,
  className = "",
}: ActionMenuProps) {
  const handleAction = (key: Key) => {
    const id = String(key);
    items.find((item) => item.id === id)?.onAction?.();
    onAction?.(id);
  };

  return (
    <MenuTrigger>
      <AriaButton
        className={`dc-icon-button dc-button--${triggerVariant} ${className}`.trim()}
        aria-label={label}
        isDisabled={disabled}
      >
        {triggerContent}
      </AriaButton>
      <Popover className="dc-action-menu__popover" placement={placement} offset={4}>
        <Menu className="dc-action-menu" aria-label={label} onAction={handleAction}>
          {items.map((item) => (
            <MenuItem
              key={item.id}
              id={item.id}
              textValue={item.textValue || (typeof item.label === "string" ? item.label : item.id)}
              isDisabled={item.disabled}
              className="dc-action-menu__item"
              data-tone={item.tone || "default"}
            >
              {item.icon ? <span className="dc-action-menu__icon" aria-hidden="true">{item.icon}</span> : null}
              <span className="dc-action-menu__copy">
                <Text slot="label">{item.label}</Text>
                {item.description ? <Text slot="description">{item.description}</Text> : null}
              </span>
              {item.shortcut ? <span className="dc-action-menu__shortcut" aria-hidden="true">{item.shortcut}</span> : null}
            </MenuItem>
          ))}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
