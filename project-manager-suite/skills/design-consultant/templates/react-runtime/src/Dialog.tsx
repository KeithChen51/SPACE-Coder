import { useEffect, useRef, type ReactNode } from "react";
import {
  Dialog as AriaDialog,
  Heading,
  ModalOverlay,
} from "react-aria-components";

export interface DialogProps {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel?: string;
  variant?: "dialog" | "alert";
  dismissable?: boolean;
  onClose: () => void;
}
export function Dialog({
  open,
  title,
  description,
  children,
  footer,
  closeLabel = "关闭",
  variant = "dialog",
  dismissable = true,
  onClose,
}: DialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  if (open && previousFocusRef.current === null && typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
    previousFocusRef.current = document.activeElement;
  }

  useEffect(() => {
    if (open || !previousFocusRef.current) return;
    const previousFocus = previousFocusRef.current;
    previousFocusRef.current = null;
    previousFocus.focus();
  }, [open]);

  useEffect(() => {
    if (!open || !overlayRef.current) return undefined;
    const overlay = overlayRef.current;
    const portalBoundary = [...document.body.children].find((element) => element === overlay || element.contains(overlay));
    const hiddenSiblings = [...document.body.children]
      .filter((element) => element !== portalBoundary && !element.hasAttribute("data-focus-scope-start") && !element.hasAttribute("data-focus-scope-end"))
      .map((element) => ({
        element: element as HTMLElement,
        ariaHidden: element.getAttribute("aria-hidden"),
        inert: (element as HTMLElement & { inert?: boolean }).inert,
      }));
    for (const item of hiddenSiblings) {
      item.element.setAttribute("aria-hidden", "true");
      (item.element as HTMLElement & { inert?: boolean }).inert = true;
    }
    return () => {
      for (const item of hiddenSiblings) {
        if (item.ariaHidden === null) item.element.removeAttribute("aria-hidden");
        else item.element.setAttribute("aria-hidden", item.ariaHidden);
        (item.element as HTMLElement & { inert?: boolean }).inert = item.inert || false;
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open || !dismissable) return undefined;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", handleEscape, true);
    return () => window.removeEventListener("keydown", handleEscape, true);
  }, [dismissable, onClose, open]);

  if (!open) return null;

  return (
    <ModalOverlay
      ref={overlayRef}
      className="dc-dialog-backdrop"
      isOpen={open}
      isDismissable={dismissable}
      isKeyboardDismissDisabled={!dismissable}
      onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}
    >
      <AriaDialog className="dc-dialog" role={variant === "alert" ? "alertdialog" : "dialog"}>
        <header className="dc-dialog-header">
          <div>
            <Heading slot="title" level={2}>{title}</Heading>
            {description ? <p>{description}</p> : null}
          </div>
          <button className="dc-icon-button dc-button--ghost" type="button" aria-label={closeLabel} onClick={onClose}>
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="dc-dialog-body">{children}</div>
        {footer ? <footer className="dc-dialog-footer">{footer}</footer> : null}
      </AriaDialog>
    </ModalOverlay>
  );
}
