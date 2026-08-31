import { createHash } from "node:crypto";

const BENCHMARK = "design-consultant-v0.10";

const ADVICE = {
  tokens: {
    baselineRule: "semantic-token-coverage>=80%",
    suggestion: "补齐未覆盖的语义 token，并逐项确认现有变量映射",
    expectedBenefit: "减少跨页面视觉漂移，同时保留现有变量作为上游事实",
  },
  typography: {
    baselineRule: "semantic-typography-scale",
    suggestion: "建立可追溯的字体、字号、字重与行高语义层级",
    expectedBenefit: "提升文字层级一致性并降低局部样式重复",
  },
  "spacing-radius": {
    baselineRule: "spacing-and-radius-scale",
    suggestion: "把间距与圆角收敛到经过确认的离散尺度",
    expectedBenefit: "减少布局和组件轮廓的随机差异",
  },
  components: {
    baselineRule: "eight-core-component-contracts",
    suggestion: "补齐核心组件候选，并确认直接复用、现有包装或人工处理方式",
    expectedBenefit: "提高常用交互的一致性且不替换成熟实现",
  },
  "interaction-states": {
    baselineRule: "hover-focus-active-disabled-loading",
    suggestion: "为核心交互组件核对悬停、焦点、按下、禁用与加载状态",
    expectedBenefit: "减少状态缺失和跨组件行为差异",
  },
  accessibility: {
    baselineRule: "focus-visible",
    suggestion: "为可交互组件补齐一致的键盘焦点状态",
    expectedBenefit: "提升键盘可用性并减少跨组件状态差异",
  },
  themes: {
    baselineRule: "declared-theme-parity",
    suggestion: "为已声明主题核对语义 token 和组件状态覆盖",
    expectedBenefit: "避免主题切换后出现缺色或不可读状态",
  },
  governance: {
    baselineRule: "documented-source-of-truth",
    suggestion: "明确现有 token 与组件的上游归属、变更入口和直接依赖边界",
    expectedBenefit: "降低重复实现和未经确认的系统迁移风险",
  },
};

function compareStable(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalizeUnorderedArray(values, project) {
  return values
    .map(project)
    .filter((item) => item !== undefined)
    .sort((left, right) => compareStable(JSON.stringify(left), JSON.stringify(right)));
}

function canonicalize(value, key = "", path = []) {
  if (key === "generatedAt" || key === "inventoryDigest") return undefined;
  if (key === "name" && path.length === 2 && path[0] === "project" && path[1] === "name") return undefined;
  if (Array.isArray(value)) {
    return canonicalizeUnorderedArray(value, (item) => canonicalize(item, "", path));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((childKey) => [childKey, canonicalize(value[childKey], childKey, [...path, childKey])])
        .filter(([, childValue]) => childValue !== undefined),
    );
  }
  return value;
}

const IDENTITY_IGNORED_KEYS = new Set(["generatedAt", "inventoryDigest"]);
const IDENTITY_PATH_KEYS = new Set(["path", "paths", "file", "files", "filename", "filenames", "root", "output", "entry", "entries", "directory", "directories", "asset", "assets", "existingdesignartifacts"]);

function isIdentityPathKey(key) {
  if (IDENTITY_PATH_KEYS.has(key.toLowerCase())) return true;
  return /(?:Path|Paths|File|Files|Filename|Filenames|Root|Output|Entry|Entries|Directory|Directories|Asset|Assets)$/.test(key)
    || /(?:^|[_-])(?:path|paths|file|files|filename|filenames|root|output|entry|entries|directory|directories|asset|assets)$/i.test(key);
}

function normalizeIdentityString(value, key) {
  const normalized = value.normalize("NFC");
  return isIdentityPathKey(key) ? normalized.replaceAll("\\", "/") : normalized;
}

function identityProjection(value, key = "", seen = new WeakSet()) {
  if (typeof value === "string") return normalizeIdentityString(value, key);
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("project identity requires finite JSON numbers");
    return value;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new Error("project identity cannot contain cyclic inventory facts");
    seen.add(value);
    const projected = canonicalizeUnorderedArray(value, (item) => identityProjection(item, key, seen));
    seen.delete(value);
    return projected;
  }
  if (value && typeof value === "object") {
    if (seen.has(value)) throw new Error("project identity cannot contain cyclic inventory facts");
    seen.add(value);
    const normalizedKeys = new Map();
    for (const originalKey of Object.keys(value)) {
      const normalizedKey = originalKey.normalize("NFC");
      if (normalizedKeys.has(normalizedKey)) {
        throw new Error(`project identity key normalization collision: ${JSON.stringify(normalizedKey)}`);
      }
      normalizedKeys.set(normalizedKey, originalKey);
    }
    const projected = {};
    for (const normalizedKey of [...normalizedKeys.keys()].sort(compareStable)) {
      if (IDENTITY_IGNORED_KEYS.has(normalizedKey)) continue;
      const originalKey = normalizedKeys.get(normalizedKey);
      projected[normalizedKey] = identityProjection(value[originalKey], normalizedKey, seen);
    }
    seen.delete(value);
    return projected;
  }
  throw new Error(`project identity requires JSON inventory facts; unsupported ${typeof value}`);
}

function evidence(values, fallback) {
  return values.length > 0 ? values : [fallback];
}

function adviceItem(area, evidenceItems, aligned, difference) {
  const definition = ADVICE[area];
  return {
    area,
    evidence: evidenceItems,
    baselineRule: definition.baselineRule,
    ...(aligned
      ? {
          reason: `Observed evidence meets ${definition.baselineRule}; keep the existing ${area} implementation unchanged.`,
        }
      : {
          priority: "recommended",
          difference,
          suggestion: definition.suggestion,
          expectedBenefit: definition.expectedBenefit,
          requiresConfirmation: true,
        }),
  };
}

function semanticCoverage(items, aliases) {
  return Object.values(aliases.tokens ?? {}).filter((names) => items.some((item) => names.includes(item.name))).length;
}

function asEvidenceItems(value) {
  if (!value) return [];
  const items = Array.isArray(value) ? value : [value];
  return items.map((item) => typeof item === "string" ? item : JSON.stringify(item));
}

function evidenceKinds(value) {
  const items = Array.isArray(value) ? value : [];
  return new Set(items.filter((item) => item && typeof item.kind === "string").map((item) => item.kind));
}

function isRecognizedUiLibrary(packageName) {
  return [
    /^@mui\/(?:material|base)(?:\/|$)/,
    /^@radix-ui\//,
    /^@headlessui\//,
    /^@chakra-ui\//,
    /^@fluentui\//,
    /^@carbon\//,
    /^@mantine\//,
    /^antd(?:\/|$)/,
    /^react-bootstrap(?:\/|$)/,
    /^semantic-ui-react(?:\/|$)/,
  ].some((pattern) => pattern.test(packageName));
}

function isInsideSharedBoundary(path, sharedDirectories) {
  const normalizedPath = path.replaceAll("\\", "/");
  return sharedDirectories.some((directory) => {
    const normalizedDirectory = directory.path.replaceAll("\\", "/").replace(/\/$/, "");
    return normalizedPath === normalizedDirectory || normalizedPath.startsWith(`${normalizedDirectory}/`);
  });
}

function governanceEvidence(inventory) {
  const sharedDirectories = inventory.detected?.sharedComponentDirectories ?? [];
  const evidence = [];
  for (const component of inventory.detected?.components ?? []) {
    if (isInsideSharedBoundary(component.path, sharedDirectories)) continue;
    for (const packageName of component.externalImports ?? []) {
      if (isRecognizedUiLibrary(packageName)) evidence.push({ path: component.path, package: packageName });
    }
  }
  return [...new Map(evidence.map((item) => [`${item.path}\u0000${item.package}`, item])).values()]
    .sort((left, right) => compareStable(`${left.path}\u0000${left.package}`, `${right.path}\u0000${right.package}`));
}

function tokenCompatibility(inventory, aliases) {
  const observed = inventory.detected?.tokens?.items ?? [];
  const candidates = [];
  const sourceAssignments = new Map();
  let exact = 0;
  let candidate = 0;

  for (const [semanticToken, names] of Object.entries(aliases.tokens ?? {})) {
    const matches = observed
      .filter((item) => names.includes(item.name))
      .sort((left, right) => {
        const selectorOrder = Number(right.selector === ":root") - Number(left.selector === ":root");
        return selectorOrder || compareStable(`${left.file}:${left.line}`, `${right.file}:${right.line}`);
      });
    const match = matches[0];
    if (!match) continue;
    const matchType = match.name === names[0] ? "exact" : "candidate";
    if (matchType === "exact") exact += 1;
    else candidate += 1;
    candidates.push({
      semanticToken,
      sourceToken: match.name,
      match: matchType,
      evidence: {
        file: match.file,
        line: match.line,
        selector: match.selector,
        value: match.value,
      },
      status: "proposed",
    });
    const assignments = sourceAssignments.get(match.name) ?? [];
    assignments.push(semanticToken);
    sourceAssignments.set(match.name, assignments);
  }

  const required = Object.keys(aliases.tokens ?? {}).length;
  return {
    coverage: { required, exact, candidate, missing: required - exact - candidate },
    candidates,
    collisions: [...sourceAssignments.entries()]
      .filter(([, semanticTokens]) => semanticTokens.length > 1)
      .map(([sourceToken, semanticTokens]) => ({
        id: `token:${sourceToken}`,
        type: "token-alias-collision",
        sourceToken,
        semanticTokens,
      })),
  };
}

function componentCompatibility(inventory, aliases) {
  const observed = inventory.detected?.components ?? [];
  const candidates = [];
  const sourceAssignments = new Map();
  const counts = { direct: 0, wrapper: 0, manual: 0 };

  for (const [component, names] of Object.entries(aliases.components ?? {})) {
    const matches = [];
    for (const item of observed) {
      for (const exportName of names.filter((name) => item.namedExports?.includes(name))) {
        matches.push({ item, exportName, support: exportName === names[0] ? "direct" : "wrapper" });
      }
      if (item.defaultExport === "default") {
        const fileHint = item.path?.replaceAll("\\", "/").split("/").at(-1)?.replace(/\.[^.]+$/, "");
        const familyHint = item.defaultExportLocalName || fileHint;
        if (names.includes(familyHint)) {
          matches.push({ item, exportName: "default", support: familyHint === names[0] ? "direct" : "wrapper" });
        }
      }
    }
    if (matches.length === 0) continue;
    counts[matches.some((match) => match.support === "direct") ? "direct" : "wrapper"] += 1;
    for (const selected of matches) {
      const sourceKey = `${selected.item.path}#${selected.exportName}`;
      candidates.push({
        component,
        source: { path: selected.item.path, exportName: selected.exportName },
        support: selected.support,
        evidence: {
          externalImports: [...(selected.item.externalImports ?? [])],
          jsxRoles: [...(selected.item.jsxRoles ?? [])],
        },
        status: "proposed",
      });
      const assignments = sourceAssignments.get(sourceKey) ?? [];
      assignments.push(component);
      sourceAssignments.set(sourceKey, assignments);
    }
  }

  const required = Object.keys(aliases.components ?? {}).length;
  return {
    coverage: { required, ...counts, missing: required - counts.direct - counts.wrapper - counts.manual },
    candidates,
    collisions: [...sourceAssignments.entries()]
      .filter(([, components]) => components.length > 1)
      .map(([source, components]) => ({
        id: `component:${source}`,
        type: "component-alias-collision",
        source,
        components,
      })),
  };
}

export function computeInventoryDigest(inventory) {
  const stable = JSON.stringify(canonicalize(inventory));
  return `sha256:${createHash("sha256").update(stable).digest("hex")}`;
}

export function deriveProjectIdentity(inventory) {
  const inventoryDigest = inventory?.inventoryDigest;
  if (!/^sha256:[a-f0-9]{64}$/.test(inventoryDigest ?? "")) {
    throw new Error("project identity requires exact stable confirmed inventory facts without an absolute path");
  }
  const projection = identityProjection(inventory);
  const project = projection?.project;
  const name = project?.name;
  const output = project?.output;
  if (typeof name !== "string" || name.length === 0 || name.length > 256 || /[\u0000-\u001f\u007f\\/]/.test(name)
    || project?.root !== "."
    || typeof output !== "string" || output.length === 0 || output.length > 512
    || output.includes("\\") || output.startsWith("/") || /^[A-Za-z]:/.test(output)
    || output.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("project identity requires exact stable confirmed inventory facts without an absolute path");
  }
  const body = {
    schemaVersion: 1,
    kind: "design-consultant-project-identity",
    workflow: "existing-system-adoption",
    inventory: projection,
  };
  return `dc-project-v1:${createHash("sha256").update(JSON.stringify(body)).digest("hex")}`;
}

export function evaluateCompatibility(inventory, aliases) {
  if (inventory?.schemaVersion !== 2) throw new Error("Compatibility evaluation requires ExtractionReportV2.");
  if (aliases?.schemaVersion !== 1) throw new Error("Compatibility aliases require schemaVersion 1.");

  const tokens = tokenCompatibility(inventory, aliases);
  const components = componentCompatibility(inventory, aliases);
  const themeEvidence = inventory.detected?.themes ?? [];
  const observedTokens = inventory.detected?.tokens?.items ?? [];
  const lightTokens = observedTokens.filter((item) => item.theme === "light");
  const darkTokens = observedTokens.filter((item) => item.theme === "dark");
  const themeDeclarations = asEvidenceItems(inventory.detected?.themeDeclarations ?? themeEvidence);
  const themeUsage = asEvidenceItems(inventory.detected?.themeUsage);
  const themeConfig = asEvidenceItems(inventory.detected?.themeConfig);
  const declarationEvidence = asEvidenceItems((inventory.detected?.themeDeclarations ?? themeEvidence).filter((item) => item.theme === "dark"));
  const usageEvidence = themeUsage.filter((item) => /dark/i.test(item));
  const configEvidence = themeConfig.filter((item) => /dark/i.test(item));
  const light = themeEvidence.some((item) => item.theme === "light") || lightTokens.length > 0;
  const dark = darkTokens.length > 0;
  const darkModeDeclared = declarationEvidence.length > 0 || usageEvidence.length > 0 || configEvidence.length > 0;
  const darkRequired = Object.keys(aliases.tokens ?? {}).length;
  const darkCovered = semanticCoverage(darkTokens, aliases);
  const themeCoverage = {
    light,
    dark,
    darkModeDeclared,
    darkRequired,
    darkCovered,
    darkMissing: Math.max(0, darkRequired - darkCovered),
    declarationEvidence,
    usageEvidence,
    configEvidence,
  };
  const existingDesignDocs = (inventory.detected?.existingDesignArtifacts ?? []).filter((path) => /(?:design|token|component)/i.test(path));
  const directExternalImportEvidence = governanceEvidence(inventory);
  const governance = {
    existingDesignDocs,
    directExternalImports: directExternalImportEvidence.length,
    directExternalImportEvidence,
  };
  const criticalConflicts = [...tokens.collisions, ...components.collisions];
  const tokenCovered = tokens.coverage.exact + tokens.coverage.candidate;
  const componentCovered = components.coverage.direct + components.coverage.wrapper + components.coverage.manual;
  const tokenReady = tokens.coverage.required > 0 && tokenCovered / tokens.coverage.required >= 0.8;
  const componentReady = componentCovered >= 6;
  const themeReady = light && (!darkModeDeclared || darkCovered === darkRequired);
  const preserve = tokenReady && componentReady && themeReady && criticalConflicts.length === 0;

  const semanticTokenIds = new Set(tokens.candidates.map((item) => item.semanticToken));
  const typographyGroups = {
    family: semanticTokenIds.has("font.family"),
    size: [...semanticTokenIds].some((item) => item.startsWith("font.size.")),
    weight: [...semanticTokenIds].some((item) => item.startsWith("font.weight.")),
    lineHeight: [...semanticTokenIds].some((item) => item.startsWith("lineHeight.")),
  };
  const missingTypography = Object.entries(typographyGroups).filter(([, present]) => !present).map(([name]) => name);
  const spacingIds = Object.keys(aliases.tokens ?? {}).filter((item) => item.startsWith("space.") || item.startsWith("radius."));
  const missingSpacing = spacingIds.filter((item) => !semanticTokenIds.has(item));
  const interactionEvidence = asEvidenceItems(inventory.detected?.interactionStates);
  const interactionKinds = evidenceKinds(inventory.detected?.interactionStates);
  const requiredStates = ["hover", "focus", "active", "disabled", "loading"];
  const missingStates = requiredStates.filter((state) => !interactionKinds.has(state));
  const accessibilityEvidence = asEvidenceItems(inventory.detected?.accessibility);
  const accessibilityKinds = evidenceKinds(inventory.detected?.accessibility);
  const requiredAccessibility = ["focus-visible", "keyboard", "semantic-aria"];
  const missingAccessibility = requiredAccessibility.filter((kind) => !accessibilityKinds.has(kind));
  const tokenEvidence = tokens.candidates.map((item) => `${item.semanticToken} -> ${item.sourceToken}`);
  const componentEvidence = components.candidates.map((item) => `${item.source.path}#${item.source.exportName}`);
  const comparisons = [
    {
      area: "tokens", aligned: tokens.coverage.missing === 0,
      evidence: evidence(tokenEvidence, "No semantic token candidate was observed"),
      difference: `${tokens.coverage.missing} of ${tokens.coverage.required} baseline semantic tokens are missing`,
    },
    {
      area: "typography", aligned: missingTypography.length === 0,
      evidence: evidence((inventory.detected?.typography ?? []).map((item) => `${item.file}:${item.line} ${item.name}`), "No typography token evidence was observed"),
      difference: `Missing typography groups: ${missingTypography.join(", ") || "none"}`,
    },
    {
      area: "spacing-radius", aligned: missingSpacing.length === 0,
      evidence: evidence((inventory.detected?.spacingAndRadius ?? []).map((item) => `${item.file}:${item.line} ${item.name}`), "No spacing or radius token evidence was observed"),
      difference: `Missing spacing/radius semantics: ${missingSpacing.join(", ") || "none"}`,
    },
    {
      area: "components", aligned: components.coverage.missing === 0,
      evidence: evidence(componentEvidence, "No core component candidate was observed"),
      difference: `${components.coverage.missing} of ${components.coverage.required} core component candidates are missing`,
    },
    {
      area: "interaction-states", aligned: missingStates.length === 0,
      evidence: evidence(interactionEvidence, "No explicit interaction-state evidence was observed; UI-library presence is not proof"),
      difference: `Missing explicit interaction-state evidence: ${missingStates.join(", ") || "none"}`,
    },
    {
      area: "accessibility", aligned: missingAccessibility.length === 0,
      evidence: evidence(accessibilityEvidence, "No explicit accessibility evidence was observed; UI-library presence is not proof"),
      difference: `Missing explicit accessibility evidence: ${missingAccessibility.join(", ") || "none"}`,
    },
    {
      area: "themes", aligned: themeReady,
      evidence: evidence([
        ...themeEvidence.map((item) => `${item.file}:${item.line} ${item.selector}`),
        ...themeDeclarations,
        ...themeUsage,
        ...themeConfig,
      ], "No theme declaration or token evidence was observed"),
      difference: darkModeDeclared
        ? `Dark mode is declared but ${themeCoverage.darkMissing} of ${darkRequired} dark semantic tokens are missing`
        : (light ? "No declared dark-mode gap" : "No light-theme token evidence was observed"),
    },
    {
      area: "governance", aligned: existingDesignDocs.length > 0 && governance.directExternalImports === 0,
      evidence: evidence([
        ...existingDesignDocs,
        ...directExternalImportEvidence.map((item) => `${item.path} imports ${item.package}`),
        `Direct external UI-library imports outside shared boundaries: ${governance.directExternalImports}`,
      ], "No design governance artifact was observed"),
      difference: existingDesignDocs.length === 0
        ? "No existing design source-of-truth document was observed"
        : `${governance.directExternalImports} direct external imports bypass governance`,
    },
  ];
  const alignedAreas = comparisons.filter((item) => item.aligned).map((item) => adviceItem(item.area, item.evidence, true, item.difference));
  const opportunities = comparisons.filter((item) => !item.aligned).map((item) => adviceItem(item.area, item.evidence, false, item.difference));

  const reasons = preserve
    ? [
        `${tokenCovered}/${tokens.coverage.required} semantic tokens have observed candidates`,
        `${componentCovered}/${components.coverage.required} core components have observed candidates`,
        "No critical alias collision was detected",
      ]
    : [
        ...(tokenReady ? [] : [`Semantic token coverage is ${tokenCovered}/${tokens.coverage.required}, below the 80% preserve threshold`]),
        ...(componentReady ? [] : [`Core component candidate coverage is ${componentCovered}/${components.coverage.required}, below the 6/8 preserve threshold`]),
        ...(themeReady ? [] : ["Declared theme evidence is incomplete"]),
        ...(criticalConflicts.length === 0 ? [] : [`${criticalConflicts.length} critical alias collision(s) require resolution`]),
      ];

  return {
    schemaVersion: 1,
    inventoryDigest: computeInventoryDigest(inventory),
    tokenCoverage: tokens.coverage,
    componentCoverage: components.coverage,
    themeCoverage,
    governance,
    criticalConflicts,
    tokenCandidates: tokens.candidates,
    componentCandidates: components.candidates,
    optimizationAdvice: { benchmark: BENCHMARK, alignedAreas, opportunities },
    recommendation: { strategy: preserve ? "preserve" : "augment", reasons },
  };
}

export function createDraftAdoptionPlan(report) {
  return {
    schemaVersion: 1,
    status: "draft",
    strategy: null,
    inventoryDigest: report.inventoryDigest,
    sourceOfTruth: { tokens: "existing", components: "existing" },
    tokenMappings: (report.tokenCandidates ?? []).map((item) => ({
      semanticToken: item.semanticToken,
      source: { name: item.sourceToken, ...item.evidence },
      match: item.match,
      status: "proposed",
    })),
    componentMappings: (report.componentCandidates ?? []).map((item) => ({
      component: item.component,
      source: { ...item.source },
      strategy: item.support,
      status: "proposed",
    })),
    legacyBaseline: { mode: "ratchet", path: "checks/ui-contract-baseline.json" },
    appEntryImports: [],
    visualVerification: { baseUrl: null, routes: [], status: "not-configured" },
    decisions: [],
  };
}
