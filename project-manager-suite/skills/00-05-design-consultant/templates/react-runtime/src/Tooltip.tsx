import { type ReactElement, type ReactNode } from "react";
import {
  Dialog as AriaDialog,
  DialogTrigger,
  Heading,
  Popover,
  Pressable,
  Tooltip as AriaTooltip,
  TooltipTrigger,
} from "react-aria-components";

export interface TooltipProps {
  content: ReactNode;
  children: ReactElement;
  placement?: "top" | "bottom" | "left" | "right" | "start" | "end";
  delay?: number;
  closeDelay?: number;
  disabled?: boolean;
}

export function Tooltip({
  content,
  children,
  placement = "top",
  delay = 500,
  closeDelay = 100,
  disabled = false,
}: TooltipProps) {
  return (
    <TooltipTrigger delay={delay} closeDelay={closeDelay} isDisabled={disabled}>
      <Pressable>{children as ReactElement<Record<string, unknown>, string>}</Pressable>
      <AriaTooltip className="dc-tooltip" placement={placement} offset={6}>
        {content}
      </AriaTooltip>
    </TooltipTrigger>
  );
}

export interface PopoverCardProps {
  trigger: ReactElement;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  placement?: "top" | "bottom" | "left" | "right" | "start" | "end";
  className?: string;
}

export function PopoverCard({
  trigger,
  title,
  description,
  children,
  placement = "bottom",
  className = "",
}: PopoverCardProps) {
  return (
    <DialogTrigger>
      <Pressable>{trigger as ReactElement<Record<string, unknown>, string>}</Pressable>
      <Popover className={`dc-popover-card ${className}`.trim()} placement={placement} offset={6}>
        <AriaDialog className="dc-popover-card__dialog">
          <Heading slot="title" level={3}>{title}</Heading>
          {description ? <p className="dc-popover-card__description">{description}</p> : null}
          <div className="dc-popover-card__body">{children}</div>
        </AriaDialog>
      </Popover>
    </DialogTrigger>
  );
}
