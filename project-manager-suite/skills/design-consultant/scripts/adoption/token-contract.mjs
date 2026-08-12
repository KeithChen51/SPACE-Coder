export const TOKEN_SOURCE_KINDS = Object.freeze(["css-variable", "literal", "design-consultant"]);
export const CSS_CUSTOM_PROPERTY_PATTERN = /^--[A-Za-z_][A-Za-z0-9_-]*$/;
export const SAFE_TOKEN_EVIDENCE_PATTERN = /^\S(?:.*\S)?$/;
export const SAFE_TOKEN_SELECTOR_PATTERN_SOURCE = "^(?::root|(?::root|[A-Za-z][A-Za-z0-9_-]*)?(?:\\.[A-Za-z_][A-Za-z0-9_-]*|\\[(?:data-theme|data-mode)=(?:\"[A-Za-z_][A-Za-z0-9_-]*\"|'[A-Za-z_][A-Za-z0-9_-]*'|[A-Za-z_][A-Za-z0-9_-]*)\\])+)$";
export const SAFE_TOKEN_SELECTOR_PATTERN = new RegExp(SAFE_TOKEN_SELECTOR_PATTERN_SOURCE);

export const ADOPTION_STRATEGIES = Object.freeze(["preserve", "augment", "migrate"]);
export const ADOPTION_CONFIG_POINTERS = Object.freeze({
  sourceOfTruth: Object.freeze({
    tokens: "tokens/external-map.json",
    runtimeTokens: "tokens/external-bridge.css",
  }),
  integration: Object.freeze({
    tokenBridge: "tokens/external-map.json",
    componentAdapterMap: null,
    legacyBaseline: "checks/ui-contract-baseline.json",
  }),
  checks: Object.freeze({
    tokenContract: "checks/sync-tokens.mjs",
    adoptionContract: "checks/check-adoption-contract.mjs",
  }),
});

export const COMPONENT_ADOPTION_CONFIG_POINTERS = Object.freeze({
  sourceOfTruth: Object.freeze({
    componentManifest: "components/manifest.json",
    componentRuntime: "runtime/react/src/index.ts",
    componentTypeEvidence: "components/type-evidence-attestation.json",
    componentRuntimeStyles: "runtime/react/src/generated-components.css",
  }),
  integration: Object.freeze({
    componentAdapterMap: "components/adapter-map.json",
  }),
  checks: Object.freeze({
    componentRuntime: "checks/check-component-runtime.mjs",
  }),
});

export function adoptionConfigPointers({ tokenBridgeActive, componentRuntimeActive, generatedStylesActive = false, legacyBaseline = null }) {
  return {
    sourceOfTruth: {
      tokens: tokenBridgeActive ? ADOPTION_CONFIG_POINTERS.sourceOfTruth.tokens : null,
      runtimeTokens: tokenBridgeActive ? ADOPTION_CONFIG_POINTERS.sourceOfTruth.runtimeTokens : null,
      componentManifest: componentRuntimeActive ? COMPONENT_ADOPTION_CONFIG_POINTERS.sourceOfTruth.componentManifest : null,
      componentRuntime: componentRuntimeActive ? COMPONENT_ADOPTION_CONFIG_POINTERS.sourceOfTruth.componentRuntime : null,
      componentTypeEvidence: componentRuntimeActive ? COMPONENT_ADOPTION_CONFIG_POINTERS.sourceOfTruth.componentTypeEvidence : null,
      componentRuntimeStyles: componentRuntimeActive && generatedStylesActive
        ? COMPONENT_ADOPTION_CONFIG_POINTERS.sourceOfTruth.componentRuntimeStyles
        : null,
    },
    integration: {
      tokenBridge: tokenBridgeActive ? ADOPTION_CONFIG_POINTERS.integration.tokenBridge : null,
      componentAdapterMap: componentRuntimeActive ? COMPONENT_ADOPTION_CONFIG_POINTERS.integration.componentAdapterMap : null,
      legacyBaseline,
    },
    checks: {
      tokenContract: tokenBridgeActive ? ADOPTION_CONFIG_POINTERS.checks.tokenContract : null,
      adoptionContract: tokenBridgeActive || componentRuntimeActive ? ADOPTION_CONFIG_POINTERS.checks.adoptionContract : null,
      componentRuntime: componentRuntimeActive ? COMPONENT_ADOPTION_CONFIG_POINTERS.checks.componentRuntime : null,
    },
  };
}

export function adoptionTokenOwnership(strategy) {
  return strategy === "migrate" ? "mixed" : "existing";
}

export function isSafeTokenSelector(selector) {
  return typeof selector === "string" && SAFE_TOKEN_SELECTOR_PATTERN.test(selector);
}

export function validateTokenMappingEvidence(evidence) {
  if (!Array.isArray(evidence) || evidence.length === 0) {
    return [sourceIssue("invalid-token-evidence", "evidence must be a non-empty array of unique trimmed strings")];
  }
  if (evidence.some((item) => typeof item !== "string" || !SAFE_TOKEN_EVIDENCE_PATTERN.test(item))) {
    return [sourceIssue("invalid-token-evidence", "evidence entries must be trimmed non-empty strings")];
  }
  if (new Set(evidence).size !== evidence.length) {
    return [sourceIssue("invalid-token-evidence", "evidence entries must be unique")];
  }
  return [];
}

export const CANONICAL_TOKEN_REGISTRY = Object.freeze({
  "semantic.color.primary": "--primary",
  "semantic.color.secondary": "--secondary",
  "semantic.color.bg": "--bg",
  "semantic.color.surface": "--surface",
  "semantic.color.surfaceElevated": "--surface-raised",
  "semantic.color.text": "--text",
  "semantic.color.textMuted": "--text-muted",
  "semantic.color.border": "--border",
  "semantic.color.focus": "--focus-ring",
  "semantic.color.success": "--success",
  "semantic.color.warning": "--warning",
  "semantic.color.danger": "--danger",
  "semantic.color.info": "--info",
  "semantic.font.family": "--font-sans",
  "semantic.font.size.sm": "--text-sm",
  "semantic.font.size.md": "--text-body",
  "semantic.font.size.lg": "--text-subtitle",
  "semantic.font.weight.regular": "--font-weight-regular",
  "semantic.font.weight.medium": "--font-weight-medium",
  "semantic.font.weight.bold": "--font-weight-bold",
  "semantic.lineHeight.body": "--line-body",
  "semantic.space.1": "--space-1",
  "semantic.space.2": "--space-2",
  "semantic.space.3": "--space-3",
  "semantic.space.4": "--space-4",
  "semantic.radius.sm": "--radius-sm",
  "semantic.radius.md": "--radius-md",
  "semantic.radius.lg": "--radius-lg",
});

const SAFE_FUNCTIONS = new Set([
  "calc",
  "clamp",
  "color",
  "color-mix",
  "cubic-bezier",
  "hsl",
  "hsla",
  "lab",
  "lch",
  "linear-gradient",
  "max",
  "min",
  "oklab",
  "oklch",
  "rgb",
  "rgba",
  "var",
]);

export function isSafeCssTokenValue(value) {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim() || value.length > 512) return false;
  if (/[;{}@\r\n\\<>]/.test(value) || /\/\*|\*\//.test(value)) return false;
  if (/\b(?:url|expression)\s*\(/i.test(value)) return false;
  if (!/^[A-Za-z0-9\s#%.,'"+\-*/()]+$/.test(value)) return false;

  let quote = null;
  let depth = 0;
  for (const character of value) {
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"') quote = character;
    else if (character === "(") depth += 1;
    else if (character === ")" && --depth < 0) return false;
  }
  if (quote || depth !== 0) return false;

  for (const match of value.matchAll(/([A-Za-z][A-Za-z0-9-]*)\s*\(/g)) {
    if (!SAFE_FUNCTIONS.has(match[1].toLowerCase())) return false;
  }
  return true;
}

export function operationalTokenSource(source) {
  if (source.kind === "css-variable") return { kind: source.kind, name: source.name };
  if (source.kind === "literal") return { kind: source.kind, value: source.value };
  return {
    kind: source.kind,
    token: source.token,
    cssVariable: source.cssVariable,
    value: source.value,
  };
}

export function tokenSourceSignature(source) {
  return JSON.stringify(operationalTokenSource(source));
}

function sourceIssue(rule, message, details = {}) {
  return { rule, message, ...details };
}

function hasOnlyFields(source, fields) {
  return Object.keys(source).every((field) => fields.has(field));
}

export function validateTokenSourceShape(source, { label = "source" } = {}) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return [sourceIssue("invalid-token-source", `${label} must be an object`)];
  }
  if (!TOKEN_SOURCE_KINDS.includes(source.kind)) {
    return [sourceIssue("invalid-token-source-kind", `${label}.kind must be css-variable, literal, or design-consultant`, { kind: source.kind ?? null })];
  }
  if (source.kind === "css-variable") {
    const fields = new Set(["kind", "name", "file", "line", "selector", "value"]);
    if (!hasOnlyFields(source, fields)) return [sourceIssue("invalid-token-source-fields", `${label} contains fields not allowed for css-variable`)];
    if (!CSS_CUSTOM_PROPERTY_PATTERN.test(source.name ?? "")) {
      return [sourceIssue("invalid-css-variable-source", `${label}.name must be a CSS custom property`, { name: source.name ?? null })];
    }
    if (
      typeof source.file !== "string" || source.file.length === 0
      || !Number.isInteger(source.line) || source.line < 1
      || typeof source.selector !== "string" || source.selector.length === 0
      || typeof source.value !== "string" || source.value.length === 0
    ) {
      return [sourceIssue("incomplete-css-variable-evidence", `${label} must define exact name, selector, file, line, and value evidence`)];
    }
    if (!isSafeTokenSelector(source.selector)) {
      return [sourceIssue("invalid-token-selector", `${label}.selector is not a supported safe token selector`, { selector: source.selector })];
    }
    return [];
  }
  if (source.kind === "literal") {
    if (!hasOnlyFields(source, new Set(["kind", "value"]))) {
      return [sourceIssue("invalid-literal-source", `${label} literal must not contain file evidence`)];
    }
    if (!isSafeCssTokenValue(source.value)) {
      return [sourceIssue("unsafe-css-token-value", `${label}.value is not a safe supported CSS token value`)];
    }
    return [];
  }
  if (!hasOnlyFields(source, new Set(["kind", "token", "cssVariable", "value"]))) {
    return [sourceIssue("invalid-token-source-fields", `${label} design-consultant source must not contain file evidence`)];
  }
  if (
    typeof source.token !== "string" || source.token.length === 0
    || !CSS_CUSTOM_PROPERTY_PATTERN.test(source.cssVariable ?? "")
    || !isSafeCssTokenValue(source.value)
  ) {
    return [sourceIssue(
      isSafeCssTokenValue(source.value) ? "invalid-design-consultant-source" : "unsafe-css-token-value",
      `${label} must define a token, CSS custom property, and safe supported value`,
    )];
  }
  return [];
}

export function expectedSourceEvidence(source) {
  if (source.kind === "css-variable") return `${source.file}:${source.line}`;
  if (source.kind === "literal") return `literal:${source.value}`;
  return `design-consultant:${source.token}`;
}
