import type { CSSProperties, HTMLAttributes } from "react";

import {
  ATTRIBUTION_COMPACT_AI_MASK,
  ATTRIBUTION_COMPACT_NATIVE_MASK,
  ATTRIBUTION_COMPACT_POWERED_BY_MASK,
  ATTRIBUTION_STANDARD_AI_MASK,
  ATTRIBUTION_STANDARD_NATIVE_MASK,
  ATTRIBUTION_STANDARD_POWERED_BY_MASK,
  SPACE_FOCUS_MASK,
  SPACE_ORBIT_BACK_MASK,
  SPACE_ORBIT_FRONT_MASK,
  SPACE_WORDMARK_MASK,
} from "./brand-attribution-masks";

export type BrandAttributionVariant = "standard-stacked" | "compact-horizontal";
export type BrandAttributionTone = "brand" | "grayscale" | "grayscale-reverse" | "monochrome" | "inverse";
export type BrandAttributionMaterial = "metallic" | "flat";
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
  material?: BrandAttributionMaterial;
  accentScope?: BrandAttributionAccentScope;
  placement?: BrandAttributionPlacement;
}

function createMaskStyle(maskImage: string) {
  return {
    WebkitMaskImage: maskImage,
    maskImage,
  } satisfies CSSProperties;
}

const attributionGlyphStyles = {
  "standard-stacked": {
    poweredBy: createMaskStyle(ATTRIBUTION_STANDARD_POWERED_BY_MASK),
    ai: createMaskStyle(ATTRIBUTION_STANDARD_AI_MASK),
    native: createMaskStyle(ATTRIBUTION_STANDARD_NATIVE_MASK),
  },
  "compact-horizontal": {
    poweredBy: createMaskStyle(ATTRIBUTION_COMPACT_POWERED_BY_MASK),
    ai: createMaskStyle(ATTRIBUTION_COMPACT_AI_MASK),
    native: createMaskStyle(ATTRIBUTION_COMPACT_NATIVE_MASK),
  },
} satisfies Record<BrandAttributionVariant, Record<"poweredBy" | "ai" | "native", CSSProperties>>;

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
  material = "metallic",
  accentScope = "focus-and-orbit",
  placement,
  className,
  ...props
}: BrandAttributionProps) {
  const glyphStyles = attributionGlyphStyles[variant];
  const classes = [
    "dc-brand-attribution",
    `dc-brand-attribution--${variant}`,
    `dc-brand-attribution--${tone}`,
    `dc-brand-attribution--material-${material}`,
    `dc-brand-attribution--accent-${accentScope}`,
    className,
  ].filter(Boolean).join(" ");

  return (
    <div
      {...props}
      className={classes}
      data-placement={placement}
      data-accent-scope={accentScope}
      data-material={material}
      data-tone={tone}
      data-variant={variant}
      role="img"
      aria-label="Powered by SPACE AI Native"
    >
      <span className="dc-brand-attribution__copy" aria-hidden="true">
        <span className="dc-brand-attribution__glyph" data-brand-glyph="powered-by" style={glyphStyles.poweredBy} />
      </span>
      <span className="dc-brand-attribution__identity" aria-hidden="true">
        <span className="dc-brand-attribution__mark">
          <span className="dc-brand-attribution__mark-layer dc-brand-attribution__mark-layer--orbit-back" style={orbitBackMaskStyle} />
          <span className="dc-brand-attribution__mark-layer dc-brand-attribution__mark-layer--neutral" style={wordmarkMaskStyle} />
          <span className="dc-brand-attribution__mark-layer dc-brand-attribution__mark-layer--focus" style={focusMaskStyle} />
          <span className="dc-brand-attribution__mark-layer dc-brand-attribution__mark-layer--orbit-front" style={orbitFrontMaskStyle} />
        </span>
        <span className="dc-brand-attribution__descriptor">
          <span className="dc-brand-attribution__ai">
            <span className="dc-brand-attribution__glyph" data-brand-glyph="ai" style={glyphStyles.ai} />
          </span>
          <span className="dc-brand-attribution__native">
            <span className="dc-brand-attribution__glyph" data-brand-glyph="native" style={glyphStyles.native} />
          </span>
        </span>
      </span>
    </div>
  );
}
