import type { CSSProperties, HTMLAttributes } from "react";

import {
  SPACE_FOCUS_MASK,
  SPACE_ORBIT_BACK_MASK,
  SPACE_ORBIT_FRONT_MASK,
  SPACE_WORDMARK_MASK,
} from "./brand-attribution-masks";

export type BrandAttributionVariant = "standard-stacked" | "compact-horizontal";
export type BrandAttributionTone = "brand" | "monochrome" | "inverse";
export type BrandAttributionAccentScope = "focus-and-orbit" | "orbit-only";
export type BrandAttributionPlacement =
  | "rail-footer"
  | "account-surface-footer"
  | "auth-panel-footer"
  | "authorization-panel-footer"
  | "home-footer"
  | "shell-footer"
  | "page-footer";

export interface BrandAttributionProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children" | "role" | "aria-label"> {
  variant?: BrandAttributionVariant;
  tone?: BrandAttributionTone;
  accentScope?: BrandAttributionAccentScope;
  placement?: BrandAttributionPlacement;
}

const wordmarkMaskStyle = {
  WebkitMaskImage: SPACE_WORDMARK_MASK,
  maskImage: SPACE_WORDMARK_MASK,
} satisfies CSSProperties;

const focusMaskStyle = {
  WebkitMaskImage: SPACE_FOCUS_MASK,
  maskImage: SPACE_FOCUS_MASK,
} satisfies CSSProperties;

const orbitBackMaskStyle = {
  WebkitMaskImage: SPACE_ORBIT_BACK_MASK,
  maskImage: SPACE_ORBIT_BACK_MASK,
} satisfies CSSProperties;

const orbitFrontMaskStyle = {
  WebkitMaskImage: SPACE_ORBIT_FRONT_MASK,
  maskImage: SPACE_ORBIT_FRONT_MASK,
} satisfies CSSProperties;

export function BrandAttribution({
  variant = "standard-stacked",
  tone = "brand",
  accentScope = "focus-and-orbit",
  placement,
  className,
  ...props
}: BrandAttributionProps) {
  const classes = [
    "dc-brand-attribution",
    `dc-brand-attribution--${variant}`,
    `dc-brand-attribution--${tone}`,
    `dc-brand-attribution--accent-${accentScope}`,
    className,
  ].filter(Boolean).join(" ");

  return (
    <div
      {...props}
      className={classes}
      data-placement={placement}
      data-accent-scope={accentScope}
      data-tone={tone}
      data-variant={variant}
      role="img"
      aria-label="Powered by SPACE AI Native"
    >
      <span className="dc-brand-attribution__copy" aria-hidden="true">Powered by</span>
      <span className="dc-brand-attribution__identity" aria-hidden="true">
        <span className="dc-brand-attribution__mark">
          <span className="dc-brand-attribution__mark-layer dc-brand-attribution__mark-layer--orbit-back" style={orbitBackMaskStyle} />
          <span className="dc-brand-attribution__mark-layer dc-brand-attribution__mark-layer--neutral" style={wordmarkMaskStyle} />
          <span className="dc-brand-attribution__mark-layer dc-brand-attribution__mark-layer--focus" style={focusMaskStyle} />
          <span className="dc-brand-attribution__mark-layer dc-brand-attribution__mark-layer--orbit-front" style={orbitFrontMaskStyle} />
        </span>
        <span className="dc-brand-attribution__native">AI NATIVE</span>
      </span>
    </div>
  );
}
