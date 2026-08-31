const CANONICAL_EXPORTS = Object.freeze({
  button: "Button",
  "icon-button": "IconButton",
  field: "FieldShell",
  "choice-field": "SelectField",
  dialog: "Dialog",
  "resource-state": "ResourcePanel",
  status: "StatusBadge",
  "data-table": "DataTable",
});

export const MIGRATION_PLAN_SOURCE = "generated:adoption-migration-plan";
export const MIGRATION_PLAN_PROVENANCE = Object.freeze({
  schemaVersion: 1,
  type: "existing-system-migration-plan",
  mode: "planning-only",
});

function itemList(items, empty) {
  return items.length === 0 ? [`- ${empty}`] : items.map((item) => `- ${item}`);
}

function componentSource(mapping) {
  if (mapping.strategy === "manual") return mapping.adapterPath;
  const path = mapping.source?.path ?? "unrecorded source";
  return mapping.source?.exportName ? `${path}#${mapping.source.exportName}` : path;
}

function migrationItem(mapping) {
  const name = CANONICAL_EXPORTS[mapping.component] ?? mapping.component;
  if (mapping.strategy === "generate") return `approved generate: ${name}`;
  if (mapping.strategy === "direct") return `direct: ${name} <- ${componentSource(mapping)}`;
  if (mapping.strategy === "wrapper") return `wrapper adapter: ${name} <- ${componentSource(mapping)}`;
  if (mapping.strategy === "manual") return `manual adapter: ${name} <- ${componentSource(mapping)}`;
  return `${mapping.strategy}: ${name}`;
}

function tokenSource(mapping) {
  const source = mapping.source ?? {};
  const identity = source.name ?? source.token ?? source.value ?? "unrecorded source";
  const location = source.file && source.line ? ` at ${source.file}:${source.line}` : "";
  const selector = source.selector ? ` [${source.selector}]` : "";
  return `${source.kind ?? "legacy"} ${identity}${selector}${location}`;
}

function tokenMappingItem(mapping) {
  const canonical = mapping.canonicalToken ?? mapping.semanticToken;
  const cssVariable = mapping.canonicalCssVariable ? ` (${mapping.canonicalCssVariable})` : "";
  return `${canonical}${cssVariable} <- ${tokenSource(mapping)}`;
}

function conflictItem(conflict) {
  if (typeof conflict === "string") return `critical conflict: ${conflict}`;
  const id = conflict?.id ? `${conflict.id}: ` : "";
  const detail = conflict?.message ?? conflict?.reason ?? JSON.stringify(conflict);
  return `critical conflict ${id}${detail}`;
}

function migrationBatches(plan, confirmedMappings) {
  const batches = ["Batch 1: 固化基线、确认 token source-of-truth，并处理 new violations。"];
  if (confirmedMappings.length === 0) {
    batches.push("Batch 2: 无已确认组件映射；保持现有组件不变。");
  } else {
    confirmedMappings.forEach((mapping, index) => {
      batches.push(`Batch 2.${index + 1}: ${migrationItem(mapping)}`);
    });
  }
  if (plan.strategy === "migrate") {
    batches.push("Batch 3: 经用户确认后，按业务入口逐个替换；本计划不修改业务文件。");
  }
  return batches;
}

export function renderMigrationPlan({ plan, compatibility, adoptionIssues }) {
  const confirmedMappings = (plan.componentMappings ?? [])
    .filter((mapping) => mapping.status === "confirmed" && ["direct", "wrapper", "manual", "generate"].includes(mapping.strategy));
  const confirmedTokens = (plan.tokenMappings ?? []).filter((mapping) => mapping.status === "confirmed");
  const unresolvedMappings = (plan.componentMappings ?? []).filter((mapping) => !["confirmed", "rejected"].includes(mapping.status));
  const unresolvedTokens = (plan.tokenMappings ?? []).filter((mapping) => !["confirmed", "rejected"].includes(mapping.status));
  const resolved = new Set(
    (plan.decisions ?? [])
      .filter((item) => typeof item === "string" && item.startsWith("resolve:"))
      .map((item) => item.slice("resolve:".length)),
  );
  const unresolvedConflicts = (compatibility?.criticalConflicts ?? [])
    .filter((conflict) => typeof conflict === "string" || !conflict?.id || !resolved.has(conflict.id));
  const blockers = [
    ...unresolvedConflicts.map(conflictItem),
    ...unresolvedMappings.map((mapping) => `component mapping unresolved: ${mapping.component} (${mapping.status})`),
    ...unresolvedTokens.map((mapping) => `token mapping unresolved: ${mapping.semanticToken} (${mapping.status})`),
  ];
  const issues = adoptionIssues?.issues ?? adoptionIssues ?? [];
  const knownIssues = issues.filter((issue) => issue.baselineStatus === "known");
  const newIssues = issues.filter((issue) => issue.baselineStatus === "new");
  const staleBaseline = adoptionIssues?.staleBaseline ?? [];
  const staleCount = staleBaseline.reduce((sum, entry) => sum + (entry.staleCount ?? 0), 0);
  const visual = plan.visualVerification ?? { baseUrl: null, routes: [], status: "not-configured" };
  const visualRoutes = visual.routes ?? [];
  const visualStatus = visual.status === "configured" && visualRoutes.length > 0
    ? "configured, not verified"
    : "not configured, not verified";
  const entryImports = plan.appEntryImports ?? [];

  return [
    "# Existing System Migration Plan",
    "",
    "## Current Strategy",
    `- Strategy: ${plan.strategy ?? "unconfirmed"}`,
    "- Application integration: 待集成。此计划未修改 app entry 或业务文件。",
    "",
    "## Source Of Truth",
    `- Tokens: ${plan.sourceOfTruth?.tokens ?? "unconfirmed"}`,
    `- Components: ${plan.sourceOfTruth?.components ?? "unconfirmed"}`,
    "",
    "## Confirmed Mappings",
    "### Tokens",
    ...itemList(confirmedTokens.map(tokenMappingItem), "无已确认 token 映射。"),
    "### Components",
    ...itemList(confirmedMappings.map(migrationItem), "无已确认组件映射。"),
    "",
    "## Unresolved Blockers",
    ...itemList(blockers, "无已知 blocker。"),
    "",
    "## UI Contract Ratchet",
    `- Known violations: ${knownIssues.length}`,
    `- New violations: ${newIssues.length}`,
    `- Stale baseline occurrences: ${staleCount}`,
    ...itemList(newIssues.map((issue) => `${issue.rule}: ${issue.file}:${issue.line}`), "无 new violations。"),
    ...staleBaseline.map((entry) => `- stale ${entry.rule}: ${entry.file} (${entry.staleCount})`),
    "",
    "## App Entry Imports",
    ...(entryImports.length > 0
      ? entryImports.map((entry) => `- pending user confirmation: add \`${entry.statement}\` to \`${entry.path}\``)
      : ["- 待集成：未配置经确认的 app entry 导入；不得自动推断或写入 import。"]),
    "",
    "## Visual Verification",
    `- Status: ${visualStatus}`,
    ...itemList(visualRoutes.map((route) => `Route configured but not verified: ${route}`), "未配置 route/browser 验证；不得声明视觉集成已完成。"),
    "",
    "## Ordered Migration Batches",
    ...migrationBatches(plan, confirmedMappings).map((batch) => `- ${batch}`),
    "",
  ].join("\n");
}
