import {
  CANONICAL_TOKEN_REGISTRY,
  CSS_CUSTOM_PROPERTY_PATTERN,
  expectedSourceEvidence,
  isSafeTokenSelector,
  operationalTokenSource,
  tokenSourceSignature,
  validateTokenMappingEvidence,
  validateTokenSourceShape,
} from "./token-contract.mjs";

function compareStable(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function issue(rule, message, mappingIndex, details = {}) {
  return { rule, message, mappingIndex, ...details };
}

function sourceExpression(source, fallback) {
  const expression = source.kind === "css-variable" ? `var(${source.name})` : source.value;
  if (!fallback || source.kind !== "css-variable") return expression;
  return `var(${source.name}, ${sourceExpression(fallback)})`;
}

function inventoryTokens(inventory) {
  return inventory?.detected?.tokens?.items ?? [];
}

function declaredThemes(inventory) {
  return inventory?.detected?.themeDeclarations ?? inventory?.detected?.themes ?? [];
}

function hasEvidence(mapping, expected) {
  return Array.isArray(mapping.evidence) && mapping.evidence.includes(expected);
}

function exactInventorySource(source, inventory) {
  return inventoryTokens(inventory).find((item) => (
    item.name === source.name
    && item.selector === source.selector
    && item.file === source.file
    && item.line === source.line
    && item.value === source.value
  ));
}

function validateSourceEvidence(mapping, source, mappingIndex, inventory, issues, label) {
  const expected = expectedSourceEvidence(source);
  if (!hasEvidence(mapping, expected)) {
    issues.push(issue("missing-source-evidence", `Mapping evidence must include ${expected}`, mappingIndex, { expected, label }));
  }
  if (source.kind === "css-variable" && !exactInventorySource(source, inventory)) {
    issues.push(issue("missing-token-source", `${label} was not observed with exact live evidence`, mappingIndex, {
      source: source.name,
      selector: source.selector,
    }));
    issues.push(issue("missing-source-evidence", `${label} file, line, selector, name, or value no longer matches live inventory`, mappingIndex, {
      file: source.file,
      line: source.line,
    }));
    issues.push(issue("source-evidence-mismatch", `${label} does not exactly match live inventory evidence`, mappingIndex, {
      source: source.name,
      selector: source.selector,
      file: source.file,
      line: source.line,
    }));
  }
}

function validateFallback(mapping, mappingIndex, inventory, strategy, issues) {
  if (mapping.selector === ":root" && mapping.fallback === undefined) return;
  if (mapping.selector !== ":root" && !mapping.fallback) {
    issues.push(issue("conditional-token-fallback-required", `Conditional selector ${mapping.selector} requires an explicit fallback`, mappingIndex, { selector: mapping.selector }));
    return;
  }
  if (!mapping.fallback) return;
  const shapeIssues = validateTokenSourceShape(mapping.fallback, { label: "fallback" });
  issues.push(...shapeIssues.map((item) => issue(item.rule, item.message, mappingIndex, item)));
  if (shapeIssues.length > 0) return;
  if (strategy === "preserve" && mapping.fallback.kind !== "css-variable") {
    issues.push(issue("preserve-non-variable-source", "preserve may only use existing css-variable fallbacks", mappingIndex, { label: "fallback" }));
  }
  if (mapping.fallback.kind === "css-variable" && mapping.fallback.selector !== ":root") {
    issues.push(issue("invalid-token-fallback-selector", "A conditional mapping fallback must resolve from :root", mappingIndex));
  }
  validateSourceEvidence(mapping, mapping.fallback, mappingIndex, inventory, issues, "fallback");
}

function validateSelectorAndTheme(mapping, mappingIndex, inventory, issues) {
  if (!isSafeTokenSelector(mapping.selector)) {
    issues.push(issue("invalid-token-selector", `Selector ${mapping.selector ?? "<missing>"} is not a supported safe token selector`, mappingIndex, { selector: mapping.selector ?? null }));
    return;
  }
  const declaration = declaredThemes(inventory).find((item) => item.selector === mapping.selector);
  const sourceSelectorExists = inventoryTokens(inventory).some((item) => item.selector === mapping.selector);
  if (typeof mapping.selector !== "string" || !declaration || !sourceSelectorExists) {
    issues.push(issue("unresolved-token-selector", `Selector ${mapping.selector ?? "<missing>"} is not declared by live theme inventory`, mappingIndex, { selector: mapping.selector ?? null }));
    return;
  }
  if (typeof mapping.theme !== "string" || !declaration.theme || mapping.theme !== declaration.theme) {
    issues.push(issue("unresolved-token-theme", `Theme ${mapping.theme ?? "<missing>"} does not match live evidence for ${mapping.selector}`, mappingIndex, { theme: mapping.theme ?? null, selector: mapping.selector }));
  }
}

function validateMapping(mapping, mappingIndex, inventory, strategy, issues) {
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
    issues.push(issue("invalid-token-mapping", "Token mapping must be an object", mappingIndex));
    return;
  }
  const evidenceIssues = validateTokenMappingEvidence(mapping.evidence);
  issues.push(...evidenceIssues.map((item) => issue(item.rule, item.message, mappingIndex, item)));
  const expectedCanonical = CANONICAL_TOKEN_REGISTRY[mapping.canonicalToken];
  if (!expectedCanonical || mapping.canonicalToken !== `semantic.${mapping.semanticToken}`) {
    issues.push(issue("invalid-canonical-token", "canonicalToken must be a registered semantic token matching semanticToken", mappingIndex));
  }
  if (!CSS_CUSTOM_PROPERTY_PATTERN.test(mapping.canonicalCssVariable ?? "")) {
    issues.push(issue("invalid-canonical-css-variable", "canonicalCssVariable must be a CSS custom property", mappingIndex));
  } else if (expectedCanonical && mapping.canonicalCssVariable !== expectedCanonical) {
    issues.push(issue("canonical-registry-mismatch", `${mapping.canonicalToken} must map to ${expectedCanonical}`, mappingIndex, { expected: expectedCanonical }));
  }
  const sourceIssues = validateTokenSourceShape(mapping.source);
  issues.push(...sourceIssues.map((item) => issue(item.rule, item.message, mappingIndex, item)));
  validateSelectorAndTheme(mapping, mappingIndex, inventory, issues);
  validateFallback(mapping, mappingIndex, inventory, strategy, issues);
  if (sourceIssues.length === 0) {
    if (strategy === "preserve" && mapping.source.kind !== "css-variable") {
      issues.push(issue("preserve-non-variable-source", "preserve may only use existing css-variable sources", mappingIndex, { label: "source" }));
      if (mapping.source.kind === "design-consultant") {
        issues.push(issue("preserve-design-consultant-source", "preserve cannot source Design Consultant replacement values", mappingIndex));
      }
    }
    if (mapping.source.kind === "css-variable" && mapping.source.selector !== mapping.selector) {
      issues.push(issue("source-selector-mismatch", "source.selector must equal selector", mappingIndex));
    }
    validateSourceEvidence(mapping, mapping.source, mappingIndex, inventory, issues, "source");
  }
}

function detectCollisions(entries, issues) {
  const canonicalAssignments = new Map();
  const variables = new Map();
  const sources = new Map();
  entries.forEach(({ mapping, mappingIndex }) => {
    if (!mapping?.source || typeof mapping.selector !== "string") return;
    const declarationKey = `${mapping.selector}\u0000${mapping.canonicalCssVariable}`;
    const assignment = `${tokenSourceSignature(mapping.source)}\u0000${mapping.fallback ? tokenSourceSignature(mapping.fallback) : ""}`;
    const previousAssignment = canonicalAssignments.get(declarationKey);
    if (previousAssignment && previousAssignment !== assignment) {
      issues.push(issue("canonical-token-collision", `${mapping.canonicalCssVariable} has multiple sources in ${mapping.selector}`, mappingIndex));
    } else canonicalAssignments.set(declarationKey, assignment);

    const previousToken = variables.get(mapping.canonicalCssVariable);
    if (previousToken && previousToken !== mapping.canonicalToken) {
      issues.push(issue("canonical-variable-reused", `${mapping.canonicalCssVariable} represents multiple canonical tokens`, mappingIndex));
    } else variables.set(mapping.canonicalCssVariable, mapping.canonicalToken);

    const sourceKey = `${mapping.selector}\u0000${tokenSourceSignature(mapping.source)}`;
    const previousSourceToken = sources.get(sourceKey);
    if (previousSourceToken && previousSourceToken !== mapping.canonicalToken) {
      issues.push(issue("source-signature-collision", "One source in a selector cannot satisfy multiple canonical tokens", mappingIndex));
    } else sources.set(sourceKey, mapping.canonicalToken);
  });
}

function renderCss(mappings) {
  const declarations = new Map();
  for (const mapping of mappings) {
    const selectorDeclarations = declarations.get(mapping.selector) ?? [];
    selectorDeclarations.push([mapping.canonicalCssVariable, sourceExpression(mapping.source, mapping.fallback)]);
    declarations.set(mapping.selector, selectorDeclarations);
  }
  const lines = [
    "/* Generated from a confirmed existing-system adoption plan. */",
    "/* Existing project tokens remain the source of truth. */",
  ];
  for (const selector of [...declarations.keys()].sort(compareStable)) {
    const rendered = declarations.get(selector)
      .filter(([name, value]) => value !== `var(${name})`)
      .sort((left, right) => compareStable(left[0], right[0]));
    if (rendered.length === 0) continue;
    lines.push("", `${selector} {`);
    for (const [name, value] of rendered) lines.push(`  ${name}: ${value};`);
    lines.push("}");
  }
  return `${lines.join("\n")}\n`;
}

function renderMap(mappings) {
  return {
    schemaVersion: 1,
    ownership: "existing",
    mappings: mappings.map((mapping) => ({
      canonicalToken: mapping.canonicalToken,
      canonicalCssVariable: mapping.canonicalCssVariable,
      source: operationalTokenSource(mapping.source),
      theme: mapping.theme,
      selector: mapping.selector,
      status: "confirmed",
      evidence: [...mapping.evidence].sort(compareStable),
      ...(mapping.fallback ? { fallback: operationalTokenSource(mapping.fallback) } : {}),
    })),
  };
}

export function buildTokenBridge({ mappings, inventory, strategy = "augment" }) {
  const supplied = Array.isArray(mappings) ? [...mappings] : [];
  const indexed = supplied.map((mapping, mappingIndex) => ({ mapping, mappingIndex }));
  const blocking = indexed
    .filter(({ mapping }) => mapping?.status !== "confirmed" && mapping?.status !== "rejected")
    .map(({ mapping, mappingIndex }) => issue("unconfirmed-token-mapping", "Proposed or manual token mappings block adoption", mappingIndex, { status: mapping?.status ?? null }));
  const confirmed = indexed.filter(({ mapping }) => mapping?.status === "confirmed");
  const issues = [...blocking];
  confirmed.forEach(({ mapping, mappingIndex }) => validateMapping(mapping, mappingIndex, inventory, strategy, issues));
  detectCollisions(confirmed, issues);
  issues.sort((left, right) => compareStable(`${left.mappingIndex}:${left.rule}:${left.message}`, `${right.mappingIndex}:${right.rule}:${right.message}`));
  if (issues.length > 0) return { css: "", map: { schemaVersion: 1, ownership: "existing", mappings: [] }, issues };

  confirmed.sort((left, right) => compareStable(
    `${left.mapping.selector}\u0000${left.mapping.canonicalCssVariable}\u0000${left.mapping.canonicalToken}\u0000${tokenSourceSignature(left.mapping.source)}`,
    `${right.mapping.selector}\u0000${right.mapping.canonicalCssVariable}\u0000${right.mapping.canonicalToken}\u0000${tokenSourceSignature(right.mapping.source)}`,
  ));
  const normalized = confirmed.map(({ mapping }) => mapping);
  return { css: renderCss(normalized), map: renderMap(normalized), issues: [] };
}
