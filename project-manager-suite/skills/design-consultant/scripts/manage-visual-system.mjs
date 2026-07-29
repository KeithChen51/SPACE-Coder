#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  rmdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeInventoryDigest,
  createDraftAdoptionPlan,
  deriveProjectIdentity,
  evaluateCompatibility,
} from "./adoption/compatibility.mjs";
import {
  MIGRATION_PLAN_PROVENANCE,
  MIGRATION_PLAN_SOURCE,
  renderMigrationPlan,
} from "./adoption/migration-plan.mjs";
import { collectSystemInventory, readPackageContext, walkSourceFiles } from "./adoption/inventory.mjs";
import {
  UI_CONTRACT_BASELINE_PROVENANCE,
  UI_CONTRACT_BASELINE_SOURCE,
  classifyIssues,
  collectUiContractIssues,
  createBaseline,
  isSafeLegacyBaselinePath,
  validateBaseline,
  validateManagedBaselineLockEntry,
} from "./check-ui-contract.mjs";
import {
  buildRuntimePlan,
  buildAdoptionManifestTask5Fields,
  canonicalComponent,
  renderGeneratedComponentStyles,
  renderReactAdapter,
  renderRuntimeBarrel,
} from "./adoption/component-adapters.mjs";
import { validateRuntimeTypeEvidence } from "./adoption/typescript-evidence.mjs";
import {
  TYPE_EVIDENCE_LOCK_PROVENANCE,
  buildTypeEvidenceAttestation,
  validateTypeEvidenceLock,
} from "./adoption/evidence-attestation.mjs";
import { buildTokenBridge } from "./adoption/token-bridge.mjs";
import {
  CSS_CUSTOM_PROPERTY_PATTERN,
  adoptionConfigPointers,
  adoptionTokenOwnership,
  isSafeTokenSelector,
  validateTokenMappingEvidence,
  validateTokenSourceShape,
} from "./adoption/token-contract.mjs";
import {
  ADOPTION_PLAN_SCHEMA_DIGEST,
  adoptionPlanBinding,
  adoptionPlanValidationErrors,
  exactAdoptionPlanBinding,
} from "./adoption/plan-contract.mjs";

const VERSION = "0.10.0";
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = resolve(SCRIPT_DIR, "..");
const LOCK_FILE = ".design-consultant-lock.json";
const DEFAULT_OUTPUT = "design-system";
const VALID_COMMANDS = new Set(["init", "extract", "adopt", "update", "migrate-lock"]);
const VALID_MODES = new Set(["default", "customize", "design-system"]);
const VALID_KIT_PROFILES = new Set(["core", "data-workspace", "agent-workspace", "full"]);
const PROJECT_IDENTITY_PATTERN = /^dc-project-v1:[a-f0-9]{64}$/;

const REACT_COMPONENTS = [
  { id: "button", exportName: "Button", typeExports: ["ButtonProps", "ButtonSize", "ButtonVariant"], props: { variant: "primary | secondary | ghost | danger", size: "small | medium | large", loading: "boolean", leadingIcon: "ReactNode", trailingIcon: "ReactNode", children: "ReactNode" } },
  { id: "icon-button", exportName: "IconButton", props: { label: "string", variant: "primary | secondary | ghost | danger", size: "small | medium | large", tooltip: "ReactNode | false", children: "ReactNode" } },
  { id: "field", exportName: "FieldShell", props: { label: "ReactNode", description: "ReactNode", error: "ReactNode", children: "ReactNode" } },
  { id: "choice-field", exportName: "SelectField", typeExports: ["SelectFieldProps", "SelectOption"], props: { label: "ReactNode", options: "SelectOption[]", value: "string", loading: "boolean", error: "ReactNode" } },
  { id: "dialog", exportName: "Dialog", props: { open: "boolean", title: "ReactNode", variant: "dialog | alert", dismissable: "boolean", onClose: "() => void", children: "ReactNode" } },
  { id: "resource-state", exportName: "ResourcePanel", typeExports: ["ResourcePanelProps", "ResourceState"], props: { state: "ready | loading | empty | error | permission | partial", title: "ReactNode", children: "ReactNode" } },
  { id: "status", exportName: "StatusBadge", props: { tone: "neutral | success | warning | danger | info", children: "ReactNode" } },
  { id: "data-table", exportName: "DataTable", typeExports: ["DataTableColumn", "DataTableProps"], props: { columns: "DataTableColumn<Row>[]", rows: "Row[]", rowKey: "keyof Row | (row => Key)", state: "ResourceState", onSort: "(columnId, direction) => void", selectionMode: "none | single | multiple", onSelectionChange: "(keys: Set<Key>) => void", renderRowActions: "(row) => ReactNode" } },
];

const REACT_SYSTEM_COMPONENTS = [
  {
    id: "brand-attribution",
    exportName: "BrandAttribution",
    typeExports: [
      "BrandAttributionAccentScope",
      "BrandAttributionPlacement",
      "BrandAttributionProps",
      "BrandAttributionTone",
      "BrandAttributionVariant",
    ],
    props: {
      variant: "standard-stacked | compact-horizontal",
      tone: "brand | monochrome | inverse",
      accentScope: "focus-and-orbit | orbit-only",
      placement: "rail-footer | account-surface-footer | auth-panel-footer | authorization-panel-footer | home-footer | shell-footer | page-footer",
    },
  },
];

const REACT_HEADLESS_COMPONENTS = [
  {
    id: "multi-select-field",
    exportName: "MultiSelectField",
    typeExports: ["MultiSelectFieldProps", "MultiSelectOption"],
    props: {
      label: "ReactNode",
      options: "MultiSelectOption[]",
      value: "string[]",
      onChange: "(value: string[]) => void",
      loading: "boolean",
      error: "ReactNode",
    },
  },
  {
    id: "searchable-select",
    exportName: "SearchableSelect",
    typeExports: ["SearchableSelectOption", "SearchableSelectProps"],
    props: {
      label: "ReactNode",
      options: "SearchableSelectOption[]",
      value: "string | null",
      onChange: "(value: string | null) => void",
      loading: "boolean",
      clearable: "boolean",
      error: "ReactNode",
    },
  },
  {
    id: "form-selection",
    exportName: "CheckboxField",
    exportNames: ["CheckboxField", "CheckboxGroupField", "RadioGroupField", "SwitchField"],
    typeExports: ["CheckboxFieldProps", "CheckboxGroupFieldProps", "FormSelectionOption", "RadioGroupFieldProps", "SwitchFieldProps"],
    props: { components: "CheckboxField | CheckboxGroupField | RadioGroupField | SwitchField", label: "ReactNode", description: "ReactNode", error: "ReactNode" },
  },
  {
    id: "overlay",
    exportName: "Tooltip",
    exportNames: ["Tooltip", "PopoverCard"],
    typeExports: ["PopoverCardProps", "TooltipProps"],
    props: { Tooltip: "content + focusable trigger", PopoverCard: "trigger + title + content", placement: "Placement" },
  },
  {
    id: "action-overlay",
    exportName: "ActionMenu",
    exportNames: ["ActionMenu"],
    typeExports: ["ActionMenuItem", "ActionMenuProps"],
    props: { label: "string", items: "ActionMenuItem[]", onAction: "(id: string) => void", placement: "Placement" },
  },
  {
    id: "feedback",
    exportName: "InlineNotice",
    exportNames: ["FeedbackQueue", "InlineNotice", "ToastViewport", "feedbackQueue"],
    typeExports: ["FeedbackToast", "FeedbackToastAction", "FeedbackToastOptions", "FeedbackTone", "InlineNoticeProps", "ToastViewportProps"],
    props: { InlineNotice: "tone + title + description + action", ToastViewport: "FeedbackQueue", "FeedbackQueue.show": "message + timeout" },
  },
];

const REACT_WORKSPACE_COMPONENTS = [
  {
    id: "text-field",
    exportName: "TextField",
    exportNames: ["TextField", "TextAreaField", "NumberField"],
    typeExports: ["TextFieldProps", "TextAreaFieldProps", "NumberFieldProps"],
    props: { TextField: "label + native input props + prefix/suffix", TextAreaField: "label + rows + maxLength + showCount", NumberField: "label + min/max/step + prefix/suffix" },
  },
  {
    id: "tertiary-nav",
    exportName: "TertiaryNav",
    typeExports: ["TertiaryNavItem", "TertiaryNavProps"],
    props: { label: "string", items: "TertiaryNavItem[]", selectedKey: "Key", onSelectionChange: "(key: Key) => void" },
  },
  {
    id: "filter-bar",
    exportName: "FilterBar",
    typeExports: ["FilterBarProps"],
    props: { children: "ReactNode", resultSummary: "ReactNode", dirty: "boolean", submitting: "boolean", onSubmit: "FormEventHandler", onReset: "FormEventHandler" },
  },
  {
    id: "metric-card",
    exportName: "MetricCard",
    typeExports: ["MetricCardProps"],
    props: { label: "ReactNode", value: "ReactNode", unit: "ReactNode", description: "ReactNode", meta: "ReactNode", href: "string", linkLabel: "string", loading: "boolean" },
  },
  {
    id: "definition-list",
    exportName: "DefinitionList",
    typeExports: ["DefinitionListItem", "DefinitionListProps"],
    props: { items: "DefinitionListItem[]", columns: "1 | 2", emptyMessage: "ReactNode" },
  },
  {
    id: "mobile-record-card",
    exportName: "MobileRecordCard",
    typeExports: ["MobileRecordCardProps", "MobileRecordField"],
    props: { title: "ReactNode", meta: "ReactNode", status: "ReactNode", fields: "MobileRecordField[]", actions: "ReactNode", selectable: "boolean", selected: "boolean", onSelectionChange: "(selected: boolean) => void", loading: "boolean" },
  },
  {
    id: "pagination",
    exportName: "TablePagination",
    typeExports: ["TablePaginationProps"],
    props: { page: "number", totalPages: "number", totalItems: "number", pageSize: "number", onPageChange: "(page: number) => void", onPageSizeChange: "(pageSize: number) => void" },
  },
  {
    id: "approval-panel",
    exportName: "ApprovalPanel",
    typeExports: ["ApprovalPanelProps", "ApprovalStatus"],
    props: { status: "ApprovalStatus", title: "ReactNode", description: "ReactNode", details: "ReactNode", onApprove: "() => void", onReject: "() => void" },
  },
];

const REACT_RUNTIME_COMPONENTS = [...REACT_COMPONENTS, ...REACT_WORKSPACE_COMPONENTS, ...REACT_HEADLESS_COMPONENTS, ...REACT_SYSTEM_COMPONENTS];

const KIT_PROFILE_COMPONENTS = Object.freeze({
  core: Object.freeze([
    "app-frame",
    "brand-attribution",
    "button",
    "icon-button",
    "field",
    "text-field",
    "choice-field",
    "form-selection",
    "overlay",
    "action-overlay",
    "dialog",
    "feedback",
    "resource-state",
    "status",
  ]),
  "data-workspace": Object.freeze([
    "app-frame",
    "brand-attribution",
    "tertiary-nav",
    "button",
    "icon-button",
    "field",
    "text-field",
    "choice-field",
    "multi-select-field",
    "searchable-select",
    "form-selection",
    "overlay",
    "action-overlay",
    "data-table",
    "filter-bar",
    "metric-card",
    "definition-list",
    "mobile-record-card",
    "pagination",
    "dialog",
    "feedback",
    "resource-state",
    "status",
  ]),
  "agent-workspace": Object.freeze([
    "app-frame",
    "brand-attribution",
    "button",
    "icon-button",
    "field",
    "text-field",
    "choice-field",
    "searchable-select",
    "form-selection",
    "overlay",
    "action-overlay",
    "dialog",
    "feedback",
    "resource-state",
    "status",
    "command-palette",
    "agent-event-row",
    "approval-panel",
    "file-artifact-row",
  ]),
});

const COMPONENT_DEPENDENCIES = Object.freeze({
  "icon-button": Object.freeze(["overlay"]),
  "choice-field": Object.freeze(["field"]),
  "text-field": Object.freeze(["field"]),
  "multi-select-field": Object.freeze(["field"]),
  "searchable-select": Object.freeze(["field"]),
  "form-selection": Object.freeze(["field"]),
  "action-overlay": Object.freeze(["icon-button"]),
  feedback: Object.freeze(["icon-button"]),
  dialog: Object.freeze(["icon-button"]),
  "data-table": Object.freeze(["resource-state"]),
  "filter-bar": Object.freeze(["button", "field"]),
  "metric-card": Object.freeze(["overlay"]),
  "command-palette": Object.freeze(["dialog", "searchable-select"]),
  "agent-event-row": Object.freeze(["status"]),
  "approval-panel": Object.freeze(["button", "status"]),
  "file-artifact-row": Object.freeze(["button", "status"]),
});

const REACT_ARIA_COMPONENT_IDS = new Set([
  "choice-field",
  "multi-select-field",
  "searchable-select",
  "form-selection",
  "overlay",
  "action-overlay",
  "feedback",
  "dialog",
]);

const LUCIDE_COMPONENT_IDS = new Set([
  "choice-field",
  "multi-select-field",
  "searchable-select",
]);

function runtimeExportNames(definition) {
  return definition.exportNames ?? [definition.exportName];
}

function componentKitUsesReactAria(componentKit) {
  return [...componentKit.selectedIds].some((id) => REACT_ARIA_COMPONENT_IDS.has(id));
}

function componentKitUsesLucide(componentKit) {
  return [...componentKit.selectedIds].some((id) => LUCIDE_COMPONENT_IDS.has(id));
}

const CATALOG_BASELINE_GENERATION = "3f5d58c0fcbe48c78f848e6f8e6f237b";
const CATALOG_BASELINE_SPECS = [
  { source: "../../evals/design-consultant/visual-baselines/v0.10.0/current.json", destination: "checks/visual-baselines/current.json", binary: true },
  {
    source: `../../evals/design-consultant/visual-baselines/v0.10.0/generations/${CATALOG_BASELINE_GENERATION}/manifest.json`,
    destination: `checks/visual-baselines/generations/${CATALOG_BASELINE_GENERATION}/manifest.json`,
    binary: true,
  },
  ...["desktop", "narrow", "mobile", "reduced-motion"].map((id) => ({
    source: `../../evals/design-consultant/visual-baselines/v0.10.0/generations/${CATALOG_BASELINE_GENERATION}/${id}.png`,
    destination: `checks/visual-baselines/generations/${CATALOG_BASELINE_GENERATION}/${id}.png`,
    binary: true,
  })),
];

const FINAL_ACCEPTANCE_SPECS = [
  { source: "scripts/verify-project.mjs", destination: "checks/verify-project.mjs" },
  { source: "scripts/product-acceptance.mjs", destination: "checks/product-acceptance.mjs" },
  { source: "templates/product-acceptance.config.mjs", destination: "checks/product-acceptance.config.mjs" },
  { source: "templates/product-commitments.json", destination: "checks/product-commitments.json" },
];

const CATALOG_BUILD_DEPENDENCY_SPECS = [
  { source: "scripts/adoption/compatibility.mjs", destination: "checks/adoption/compatibility.mjs" },
  { source: "scripts/adoption/plan-contract.mjs", destination: "checks/adoption/plan-contract.mjs" },
];

const REACT_RUNTIME_SPECS = [
  { source: "templates/design-system-package.json", destination: "package.json" },
  { source: "templates/react-runtime/package.json", destination: "runtime/react/package.json" },
  { source: "templates/react-runtime/tsconfig.json", destination: "runtime/react/tsconfig.json" },
  { source: "templates/react-runtime/vitest.config.mjs", destination: "runtime/react/vitest.config.mjs" },
  { source: "templates/react-runtime/tests/components.test.tsx", destination: "runtime/react/tests/components.test.tsx" },
  { source: "templates/react-runtime/src/brand-attribution-masks.ts", destination: "runtime/react/src/brand-attribution-masks.ts" },
  { source: "templates/catalog-react.tsx", destination: "catalog/src/catalog.tsx" },
  { source: "scripts/build-component-catalog.mjs", destination: "checks/build-component-catalog.mjs" },
  ...CATALOG_BUILD_DEPENDENCY_SPECS,
  { source: "scripts/visual-regression.mjs", destination: "checks/visual-regression.mjs" },
  { source: "scripts/adoption/visual-route-contract.mjs", destination: "checks/adoption/visual-route-contract.mjs" },
  ...FINAL_ACCEPTANCE_SPECS,
  ...CATALOG_BASELINE_SPECS,
];

const FILE_SPECS = [
  { source: "templates/design-system-README.md", destination: "README.md" },
  { source: "templates/DESIGN.md", destination: "DESIGN.md" },
  { source: "templates/system.config.json", destination: "system.config.json" },
  { source: "templates/tokens.json", destination: "tokens/tokens.json" },
  { source: "templates/tokens.css", destination: "tokens/tokens.css" },
  { source: "templates/tokens.ts", destination: "tokens/tokens.ts" },
  { source: "templates/tokens.schema.json", destination: "tokens/tokens.schema.json" },
  { source: "templates/visualization-manifest.json", destination: "visualizations/manifest.json" },
  { source: "templates/visualization-lieflat/lieflat-theme.js", destination: "visualizations/lieflat/lieflat-theme.js" },
  { source: "templates/visualization-lieflat/mono-tokens.js", destination: "visualizations/lieflat/mono-tokens.js" },
  { source: "templates/visualization-lieflat/lupi-gallery.html", destination: "visualizations/lieflat/lupi-gallery.html" },
  { source: "templates/visualization-lieflat/basics-gallery.html", destination: "visualizations/lieflat/basics-gallery.html" },
  { source: "templates/visualization-lieflat/glance-gallery.html", destination: "visualizations/lieflat/glance-gallery.html" },
  { source: "templates/visualization-lieflat/big-circular.html", destination: "visualizations/lieflat/big-circular.html" },
  { source: "templates/visualization-lieflat/big-force.html", destination: "visualizations/lieflat/big-force.html" },
  { source: "templates/visualization-lieflat/big-threads.html", destination: "visualizations/lieflat/big-threads.html" },
  { source: "templates/visualization-lieflat/runtime/RUNTIME.json", destination: "visualizations/lieflat/runtime/RUNTIME.json" },
  { source: "templates/visualization-lieflat/runtime/chart.umd.min.js", destination: "visualizations/lieflat/runtime/chart.umd.min.js" },
  { source: "templates/visualization-lieflat/runtime/chart.LICENSE.md", destination: "visualizations/lieflat/runtime/chart.LICENSE.md" },
  { source: "templates/visualization-lieflat/runtime/echarts.min.js", destination: "visualizations/lieflat/runtime/echarts.min.js" },
  { source: "templates/visualization-lieflat/runtime/echarts.LICENSE", destination: "visualizations/lieflat/runtime/echarts.LICENSE" },
  { source: "templates/visualization-lieflat/runtime/echarts.NOTICE", destination: "visualizations/lieflat/runtime/echarts.NOTICE" },
  { source: "vendor/lieflat-charts/catalog.md", destination: "visualizations/lieflat/catalog.md" },
  { source: "vendor/lieflat-charts/SKILL.md", destination: "visualizations/lieflat/upstream-skill.md" },
  { source: "vendor/lieflat-charts/LICENSE", destination: "visualizations/lieflat/LICENSE" },
  { source: "vendor/lieflat-charts/THIRD_PARTY_NOTICES.md", destination: "visualizations/lieflat/THIRD_PARTY_NOTICES.md" },
  { source: "vendor/lieflat-charts/UPSTREAM.json", destination: "visualizations/lieflat/UPSTREAM.json" },
  { source: "templates/component-kit.json", destination: "components/kit.json" },
  { source: "templates/component-manifest.json", destination: "components/manifest.json" },
  { source: "templates/component-decisions.json", destination: "components/decisions.json" },
  {
    source: "templates/astryx-component-map.json",
    destination: "components/external/astryx-component-map.json",
  },
  { source: "templates/catalog-foundation.css", destination: "catalog/catalog-foundation.css" },
  { source: "templates/component-library.css", destination: "catalog/component-library.css" },
  { source: "templates/component-library.js", destination: "catalog/component-library.js" },
  { source: "templates/react-runtime/src/styles.css", destination: "runtime/react/src/styles.css" },
  { source: "templates/react-runtime/src/ethnocentric-regular.otf", destination: "runtime/react/src/ethnocentric-regular.otf" },
  { source: "templates/component-preview.css", destination: "catalog/component-preview.css" },
  { source: "templates/component-library.html", destination: "catalog/component-library.html" },
  { source: "templates/component-preview.html", destination: "catalog/component-preview.html" },
  { source: "templates/brand-attribution/space-mark-parametric-orbit-accent.svg", destination: "assets/brand/space-ai-native/space-mark-parametric-orbit-accent.svg" },
  { source: "templates/brand-attribution/space-mark-parametric-orbit-accent-dark.svg", destination: "assets/brand/space-ai-native/space-mark-parametric-orbit-accent-dark.svg" },
  { source: "templates/brand-attribution/space-mark-parametric-wordmark-mask.svg", destination: "assets/brand/space-ai-native/space-mark-parametric-wordmark-mask.svg" },
  { source: "templates/brand-attribution/space-mark-parametric-accent-mask.svg", destination: "assets/brand/space-ai-native/space-mark-parametric-accent-mask.svg" },
  { source: "templates/brand-attribution/space-mark-parametric-focus-mask.svg", destination: "assets/brand/space-ai-native/space-mark-parametric-focus-mask.svg" },
  { source: "templates/brand-attribution/space-mark-parametric-orbit-mask.svg", destination: "assets/brand/space-ai-native/space-mark-parametric-orbit-mask.svg" },
  { source: "templates/brand-attribution/space-mark-parametric-orbit-back-mask.svg", destination: "assets/brand/space-ai-native/space-mark-parametric-orbit-back-mask.svg" },
  { source: "templates/brand-attribution/space-mark-parametric-orbit-front-mask.svg", destination: "assets/brand/space-ai-native/space-mark-parametric-orbit-front-mask.svg" },
  { source: "templates/brand-attribution/space-mark-parametric-wordmark-mask.svg", destination: "runtime/brand-attribution/space-mark-parametric-wordmark-mask.svg" },
  { source: "templates/brand-attribution/space-mark-parametric-accent-mask.svg", destination: "runtime/brand-attribution/space-mark-parametric-accent-mask.svg" },
  { source: "templates/brand-attribution/space-mark-parametric-focus-mask.svg", destination: "runtime/brand-attribution/space-mark-parametric-focus-mask.svg" },
  { source: "templates/brand-attribution/space-mark-parametric-orbit-mask.svg", destination: "runtime/brand-attribution/space-mark-parametric-orbit-mask.svg" },
  { source: "templates/brand-attribution/space-mark-parametric-orbit-back-mask.svg", destination: "runtime/brand-attribution/space-mark-parametric-orbit-back-mask.svg" },
  { source: "templates/brand-attribution/space-mark-parametric-orbit-front-mask.svg", destination: "runtime/brand-attribution/space-mark-parametric-orbit-front-mask.svg" },
  { source: "templates/project-design-agent-rules.md", destination: "agent-rules.md" },
  { source: "scripts/check-css-vars.ps1", destination: "checks/check-css-vars.ps1" },
  { source: "scripts/sync-tokens.mjs", destination: "checks/sync-tokens.mjs" },
  {
    source: "scripts/check-design-system-contract.ps1",
    destination: "checks/check-design-system-contract.ps1",
  },
  { source: "scripts/text-content.mjs", destination: "checks/text-content.mjs" },
  { source: "scripts/check-component-runtime.mjs", destination: "checks/check-component-runtime.mjs" },
  { source: "scripts/check-ui-contract.mjs", destination: "checks/check-ui-contract.mjs" },
  { source: "scripts/check-greenfield-adoption.mjs", destination: "checks/check-adoption-contract.mjs" },
  {
    source: "scripts/check-visualization-module.mjs",
    destination: "checks/check-visualization-module.mjs",
  },
];

const ADOPTION_CATALOG_SPECS = [
  { source: "templates/adoption-design-system-package.json", destination: "package.json" },
  { source: "templates/adoption-catalog-foundation.css", destination: "catalog/catalog-foundation.css" },
  { source: "templates/component-library.css", destination: "catalog/component-library.css" },
  { source: "templates/component-library.html", destination: "catalog/component-library.html" },
  { source: "templates/adoption-catalog-react.tsx", destination: "catalog/src/catalog.tsx" },
  { source: "templates/adoption-visual.config.json", destination: "checks/adoption-visual.config.json" },
  { source: "scripts/build-component-catalog.mjs", destination: "checks/build-component-catalog.mjs" },
  { source: "scripts/visual-regression.mjs", destination: "checks/visual-regression.mjs" },
  ...FINAL_ACCEPTANCE_SPECS,
  ...CATALOG_BASELINE_SPECS,
  ...FILE_SPECS.filter((spec) => spec.destination.startsWith("visualizations/")),
];

const EXTRACT_SPECS = [
  { source: "templates/adoption-plan.schema.json", destination: "adoption/adoption-plan.schema.json" },
];
const ADOPTION_SPECS = {
  preserve: [],
  augment: [],
  migrate: [],
};
const ADOPTION_PORTABLE_CHECK_SPECS = [
  ...CATALOG_BUILD_DEPENDENCY_SPECS,
  { source: "scripts/adoption/token-contract.mjs", destination: "checks/adoption/token-contract.mjs" },
  { source: "scripts/adoption/token-bridge.mjs", destination: "checks/adoption/token-bridge.mjs" },
  { source: "scripts/adoption/visual-route-contract.mjs", destination: "checks/adoption/visual-route-contract.mjs" },
  { source: "scripts/check-adoption-contract.mjs", destination: "checks/check-adoption-contract.mjs" },
  { source: "scripts/check-ui-contract.mjs", destination: "checks/check-ui-contract.mjs" },
];
const ADOPTION_TOKEN_CHECK_SPECS = [
  ...ADOPTION_PORTABLE_CHECK_SPECS,
  { source: "scripts/adoption/inventory.mjs", destination: "checks/adoption/inventory.mjs" },
  { source: "scripts/sync-tokens.mjs", destination: "checks/sync-tokens.mjs" },
];
const ADOPTION_CHECK_DEPENDENCY_SPECS = ADOPTION_PORTABLE_CHECK_SPECS;
const ADOPTION_COMPONENT_CHECK_SPECS = [
  { source: "scripts/adoption/component-adapters.mjs", destination: "checks/adoption/component-adapters.mjs" },
  { source: "scripts/adoption/evidence-attestation.mjs", destination: "checks/adoption/evidence-attestation.mjs" },
  { source: "scripts/check-component-runtime.mjs", destination: "checks/check-component-runtime.mjs" },
];
const ADOPTION_TOKEN_SOURCES = {
  "tokens/external-map.json": "generated:confirmed-token-map",
  "tokens/external-bridge.css": "generated:confirmed-token-bridge",
  "system.config.json": "generated:adoption-system-config",
  "checks/adoption/compatibility.mjs": "scripts/adoption/compatibility.mjs",
  "checks/adoption/inventory.mjs": "scripts/adoption/inventory.mjs",
  "checks/adoption/token-contract.mjs": "scripts/adoption/token-contract.mjs",
  "checks/adoption/token-bridge.mjs": "scripts/adoption/token-bridge.mjs",
  "checks/check-adoption-contract.mjs": "scripts/check-adoption-contract.mjs",
  "checks/sync-tokens.mjs": "scripts/sync-tokens.mjs",
};
const ADOPTION_COMPONENT_SOURCES = {
  "components/adapter-map.json": "generated:component-adapter-map",
  "components/manifest.json": "generated:adoption-component-manifest",
  "components/type-evidence-attestation.json": "generated:component-type-evidence-attestation",
  "runtime/react/src/index.ts": "generated:adoption-react-runtime-barrel",
  "runtime/react/src/generated-components.css": "generated:approved-component-styles",
  "checks/adoption/component-adapters.mjs": "scripts/adoption/component-adapters.mjs",
  "checks/adoption/evidence-attestation.mjs": "scripts/adoption/evidence-attestation.mjs",
  "checks/check-component-runtime.mjs": "scripts/check-component-runtime.mjs",
};
const ADOPTION_MARKER_SOURCES = {
  "intake/extraction-report.json": "generated:project-extraction",
  "adoption/adoption-plan.json": "generated:draft-adoption-plan",
  "adoption/compatibility-report.json": "generated:compatibility-analysis",
  "adoption/adoption-plan.schema.json": "templates/adoption-plan.schema.json",
};
const ADOPTION_MARKER_PATHS = Object.keys(ADOPTION_MARKER_SOURCES);
const TASK5_UNIQUE_DISK_PATHS = new Set([
  "components/adapter-map.json",
  "components/type-evidence-attestation.json",
  "runtime/react/src/generated-components.css",
]);
const TASK5_SHARED_CHECK_PATHS = new Set([
  "checks/adoption/component-adapters.mjs",
  "checks/adoption/evidence-attestation.mjs",
  "checks/check-component-runtime.mjs",
]);
const GREENFIELD_INIT_PROVENANCE = Object.freeze({
  schemaVersion: 1,
  type: "greenfield-init",
  skillVersion: VERSION,
});
const LEGACY_V09_BASE_COMMIT = "3ae3d3cb549174fe4576a8f7c43d10be9fc69385";
const POST_V09_BASE_DESTINATIONS = new Set([
  "components/kit.json",
  "runtime/react/src/ethnocentric-regular.otf",
  "checks/check-adoption-contract.mjs",
]);
const LEGACY_V09_BASE_SOURCES = Object.freeze(Object.fromEntries(
  FILE_SPECS
    .filter((spec) => !POST_V09_BASE_DESTINATIONS.has(spec.destination)
      && !spec.destination.startsWith("assets/brand/")
      && !spec.destination.startsWith("runtime/brand-attribution/"))
    .map((spec) => [spec.destination, spec.source]),
));
const LEGACY_V09_REACT_SOURCES = Object.freeze({
  "package.json": "templates/design-system-package.json",
  "runtime/react/package.json": "templates/react-runtime/package.json",
  "runtime/react/tsconfig.json": "templates/react-runtime/tsconfig.json",
  "runtime/react/vitest.config.mjs": "templates/react-runtime/vitest.config.mjs",
  "runtime/react/tests/components.test.tsx": "templates/react-runtime/tests/components.test.tsx",
  "catalog/src/catalog.tsx": "templates/catalog-react.tsx",
  "checks/build-component-catalog.mjs": "scripts/build-component-catalog.mjs",
  "checks/visual-regression.mjs": "scripts/visual-regression.mjs",
  "checks/visual-baselines/desktop.png": "../../evals/design-consultant/visual-baselines/v0.9/desktop.png",
  "checks/visual-baselines/narrow.png": "../../evals/design-consultant/visual-baselines/v0.9/narrow.png",
  "checks/visual-baselines/mobile.png": "../../evals/design-consultant/visual-baselines/v0.9/mobile.png",
  "checks/visual-baselines/reduced-motion.png": "../../evals/design-consultant/visual-baselines/v0.9/reduced-motion.png",
  ...Object.fromEntries(REACT_COMPONENTS.map((component) => [
    `runtime/react/src/${component.exportName}.tsx`,
    `templates/react-runtime/src/${component.exportName}.tsx`,
  ])),
  "runtime/react/src/index.ts": "generated:react-runtime-barrel",
});
const LEGACY_V09_MANIFEST_DIGESTS = Object.freeze({
  core: "b17ad91e2a41bbf2ddb6aa95e2487ad6a242df9fa7fb4e85986baf6cfec3ce4e",
  react: "2030835af9d44cfdf97ca0c3a6440bc5f5781d670e80e4cff5a21f1978b2d287",
});

const COMPONENT_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".vue", ".svelte"]);

function usage() {
  return `设计顾问项目视觉系统脚手架 v${VERSION}

用法：
  node manage-visual-system.mjs <init|extract|adopt|update|migrate-lock> [options]

命令：
  init      初始化项目本地视觉系统；已有文件保持不变
  extract   仅写入采集报告、兼容性建议和待确认采用计划
  adopt     仅在采用计划通过确认与安全校验后写入所选策略文件
  update    更新仍保持生成态的文件；用户修改过的文件保持不变
  migrate-lock  验证 v0.9 greenfield lock 与所有受管文件，仅补充可审计 workflow provenance

选项：
  --target <path>        目标项目目录，默认当前目录
  --output <path>        项目内输出目录，默认 design-system
  --mode <mode>          default | customize | design-system；已有配置时沿用原值
  --kit-profile <name>   core | data-workspace | agent-workspace | full
  --components <ids>     逗号分隔的组件 family id；精确选择并自动补齐依赖
  --project-name <name>  项目名称；已有配置时沿用原值，否则使用目标目录名
  --dry-run              只输出计划，不写入文件
  --help                 显示帮助
`;
}

function parseArguments(argv) {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    return { help: true };
  }

  const command = argv[0];
  if (!VALID_COMMANDS.has(command)) {
    throw new Error(`未知命令：${command}。可用命令为 init、extract、adopt、update、migrate-lock。`);
  }

  const options = {
    command,
    target: process.cwd(),
    output: DEFAULT_OUTPUT,
    mode: null,
    kitProfile: null,
    components: null,
    projectName: null,
    dryRun: false,
  };

  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      return { help: true };
    }

    const valueOptions = new Map([
      ["--target", "target"],
      ["--output", "output"],
      ["--mode", "mode"],
      ["--kit-profile", "kitProfile"],
      ["--components", "components"],
      ["--project-name", "projectName"],
    ]);
    const key = valueOptions.get(argument);
    if (!key) {
      throw new Error(`未知参数：${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${argument} 需要一个值。`);
    }
    options[key] = value;
    index += 1;
  }

  if (options.mode !== null && !VALID_MODES.has(options.mode)) {
    throw new Error(`无效模式：${options.mode}。可用模式为 default、customize、design-system。`);
  }
  if (options.kitProfile !== null && !VALID_KIT_PROFILES.has(options.kitProfile)) {
    throw new Error(`无效 Kit 档位：${options.kitProfile}。可用档位为 core、data-workspace、agent-workspace、full。`);
  }
  if (options.kitProfile !== null && options.components !== null) {
    throw new Error("--kit-profile 与 --components 不能同时使用；需要精确选择时只使用 --components。");
  }
  if ((options.kitProfile !== null || options.components !== null) && !["init", "update"].includes(command)) {
    throw new Error("--kit-profile 与 --components 只适用于 greenfield init 或 update。");
  }
  if (options.components !== null) {
    const ids = options.components.split(",").map((value) => value.trim()).filter(Boolean);
    if (ids.length === 0) throw new Error("--components 至少需要一个组件 family id。");
    options.components = [...new Set(ids)];
  }
  if (isAbsolute(options.output)) {
    throw new Error("--output 必须是目标项目内的相对路径。");
  }

  return options;
}

function toPosixPath(value) {
  return value.split(sep).join("/");
}

function isInside(parent, child) {
  const pathFromParent = relative(parent, child);
  return pathFromParent !== "" && !pathFromParent.startsWith(`..${sep}`) && pathFromParent !== ".." && !isAbsolute(pathFromParent);
}

function isInsideOrEqual(parent, child) {
  return resolve(parent) === resolve(child) || isInside(parent, child);
}

function safeRelativePosixPath(value) {
  return typeof value === "string"
    && value.length > 0
    && !value.includes("\\")
    && !isAbsolute(value)
    && !/^[A-Za-z]:/.test(value)
    && value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

async function assertSafeProjectPath(projectRoot, targetPath, label) {
  const resolvedTarget = resolve(targetPath);
  if (!isInsideOrEqual(projectRoot, resolvedTarget)) {
    throw new Error(`${label} 必须位于真实项目目录内：${resolvedTarget}`);
  }
  const pathFromProject = relative(projectRoot, resolvedTarget);
  let current = projectRoot;
  for (const segment of pathFromProject.split(sep).filter(Boolean)) {
    current = join(current, segment);
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if (error.code === "ENOENT") break;
      throw error;
    }
    if (info.isSymbolicLink()) {
      throw new Error(`${label} 包含 symbolic link / junction，已拒绝：${current}`);
    }
    const resolvedExistingPath = await realpath(current);
    if (!isInsideOrEqual(projectRoot, resolvedExistingPath)) {
      throw new Error(`${label} 的真实路径逃逸项目目录，已拒绝：${resolvedExistingPath}`);
    }
  }
}

function digest(content) {
  return createHash("sha256").update(content).digest("hex");
}

function checkedManagedProjectIdentity(value) {
  if (typeof value !== "string" || value.length !== 78 || value !== value.normalize("NFC") || !PROJECT_IDENTITY_PATTERN.test(value)) {
    throw new AdoptionValidationError("confirmed adoption projectIdentity must be an exact dc-project-v1 identity.");
  }
  return value;
}

async function pathKind(path) {
  try {
    const info = await stat(path);
    if (info.isFile()) return "file";
    if (info.isDirectory()) return "directory";
    return "other";
  } catch (error) {
    if (error.code === "ENOENT") return "missing";
    throw error;
  }
}

async function readJson(path) {
  return JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, ""));
}

async function resolveComponentKit(options, existingConfig) {
  const library = await readJson(resolve(SKILL_ROOT, "templates/component-manifest.json"));
  if (!Array.isArray(library.families) || library.families.length === 0) {
    throw new Error("组件 Library 缺少可用的 families 清单。");
  }
  const orderedIds = library.families.map((family) => family.id);
  const knownIds = new Set(orderedIds);
  const configured = existingConfig?.componentKit;
  let profile;
  let selectionSource;
  let requestedComponentIds;

  if (Array.isArray(options.components)) {
    profile = "custom";
    selectionSource = "explicit";
    requestedComponentIds = options.components;
  } else if (options.kitProfile) {
    profile = options.kitProfile;
    selectionSource = "profile";
    requestedComponentIds = profile === "full" ? orderedIds : KIT_PROFILE_COMPONENTS[profile];
  } else if (options.command === "update" && Array.isArray(configured?.componentIds)) {
    profile = typeof configured.profile === "string" ? configured.profile : "custom";
    selectionSource = typeof configured.selectionSource === "string" ? configured.selectionSource : "existing-config";
    requestedComponentIds = configured.requestedComponentIds?.length
      ? configured.requestedComponentIds
      : configured.componentIds;
  } else {
    profile = "full";
    selectionSource = "legacy-full";
    requestedComponentIds = orderedIds;
  }

  const unknownIds = [...new Set(requestedComponentIds)].filter((id) => !knownIds.has(id));
  if (unknownIds.length > 0) {
    throw new Error(`未知组件 ID：${unknownIds.join(", ")}。请从 templates/component-manifest.json 选择 family id。`);
  }

  const requested = new Set(requestedComponentIds);
  const selected = new Set();
  const visit = (id) => {
    if (selected.has(id)) return;
    for (const dependency of COMPONENT_DEPENDENCIES[id] ?? []) visit(dependency);
    selected.add(id);
  };
  for (const id of requested) visit(id);

  const componentIds = orderedIds.filter((id) => selected.has(id));
  const normalizedRequested = orderedIds.filter((id) => requested.has(id));
  const dependencyAddedComponentIds = componentIds.filter((id) => !requested.has(id));
  const runtimeDefinitions = REACT_RUNTIME_COMPONENTS.filter((definition) => selected.has(definition.id));
  return {
    profile,
    selectionSource,
    requestedComponentIds: normalizedRequested,
    dependencyAddedComponentIds,
    componentIds,
    runtimeComponentIds: runtimeDefinitions.map((definition) => definition.id),
    runtimeDefinitions,
    selectedIds: selected,
    full: componentIds.length === orderedIds.length,
    library,
  };
}

class AdoptionValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "AdoptionValidationError";
    this.exitCode = 2;
  }
}

export function assertUniqueItemDestinations(items) {
  const destinations = new Map();
  for (const item of items) {
    const key = item.destination.toLowerCase();
    const prior = destinations.get(key);
    if (prior) {
      throw new AdoptionValidationError(`duplicate managed destination before action planning: ${item.destination} (${prior} and ${item.source})`);
    }
    destinations.set(key, item.source);
  }
}

async function inspectUpdatePreflightPath(projectRoot, outputRoot, targetPath, label, expectedKind = null) {
  const resolvedProjectRoot = resolve(projectRoot);
  const resolvedOutputRoot = resolve(outputRoot);
  const resolvedTarget = resolve(targetPath);
  const prefix = `update preflight ${label}`;
  if (!isInsideOrEqual(resolvedProjectRoot, resolvedOutputRoot) || !isInsideOrEqual(resolvedProjectRoot, resolvedTarget)) {
    throw new AdoptionValidationError(`${prefix} escapes the canonical project root: ${resolvedTarget}.`);
  }
  if (!isInsideOrEqual(resolvedOutputRoot, resolvedTarget)) {
    throw new AdoptionValidationError(`${prefix} escapes the canonical output root: ${resolvedTarget}.`);
  }

  let outputInfo;
  try {
    outputInfo = await lstat(resolvedOutputRoot);
  } catch (error) {
    if (error.code === "ENOENT") return { kind: "missing", path: resolvedTarget, realPath: null };
    throw new AdoptionValidationError(`${prefix} could not inspect the output root: ${error.message}.`);
  }
  if (outputInfo.isSymbolicLink()) {
    throw new AdoptionValidationError(`${prefix} rejects a symbolic link / junction / reparse output root: ${resolvedOutputRoot}.`);
  }
  if (!outputInfo.isDirectory()) {
    throw new AdoptionValidationError(`${prefix} requires the canonical output root to be an ordinary directory: ${resolvedOutputRoot}.`);
  }

  const canonicalProjectRoot = await realpath(resolvedProjectRoot);
  const canonicalOutputRoot = await realpath(resolvedOutputRoot);
  if (!isInsideOrEqual(canonicalProjectRoot, canonicalOutputRoot)) {
    throw new AdoptionValidationError(`${prefix} output realpath escapes the canonical project root: ${canonicalOutputRoot}.`);
  }

  const segments = relative(resolvedOutputRoot, resolvedTarget).split(sep).filter(Boolean);
  let current = resolvedOutputRoot;
  let currentInfo = outputInfo;
  let currentRealPath = canonicalOutputRoot;
  for (const [index, segment] of segments.entries()) {
    current = join(current, segment);
    try {
      currentInfo = await lstat(current);
    } catch (error) {
      if (error.code === "ENOENT") return { kind: "missing", path: resolvedTarget, realPath: null };
      throw new AdoptionValidationError(`${prefix} could not inspect ${current}: ${error.message}.`);
    }
    if (currentInfo.isSymbolicLink()) {
      throw new AdoptionValidationError(`${prefix} rejects a symbolic link / junction / reparse path: ${current}.`);
    }
    if (index < segments.length - 1 && !currentInfo.isDirectory()) {
      throw new AdoptionValidationError(`${prefix} has a non-directory ancestor: ${current}.`);
    }
    currentRealPath = await realpath(current);
    if (
      !isInsideOrEqual(canonicalProjectRoot, currentRealPath)
      || !isInsideOrEqual(canonicalOutputRoot, currentRealPath)
    ) {
      throw new AdoptionValidationError(`${prefix} realpath escapes the canonical output/project boundary: ${currentRealPath}.`);
    }
  }

  const kind = currentInfo.isFile() ? "file" : currentInfo.isDirectory() ? "directory" : "other";
  if (kind === "other") {
    throw new AdoptionValidationError(`${prefix} is not an ordinary file or directory: ${resolvedTarget}.`);
  }
  if (expectedKind !== null && kind !== expectedKind) {
    throw new AdoptionValidationError(`${prefix} must be an ordinary ${expectedKind}: ${resolvedTarget}.`);
  }
  return { kind, path: resolvedTarget, realPath: currentRealPath };
}

async function readAdoptionJson(path, label) {
  if ((await pathKind(path)) !== "file") {
    throw new AdoptionValidationError(`${label} 不存在或不是普通文件：${path}`);
  }
  try {
    return await readJson(path);
  } catch (error) {
    throw new AdoptionValidationError(`${label} 无法解析：${error.message}`);
  }
}

function validateObjectFields(value, allowedFields, requiredFields, label, task) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AdoptionValidationError(`${task} ${label} 必须是对象。`);
  }
  const unknownFields = Object.keys(value).filter((field) => !allowedFields.includes(field));
  if (unknownFields.length > 0) {
    throw new AdoptionValidationError(`${task} ${label} 包含 Task 3 不允许的字段：${unknownFields.join(", ")}。`);
  }
  const missingFields = requiredFields.filter((field) => !Object.hasOwn(value, field));
  if (missingFields.length > 0) {
    throw new AdoptionValidationError(`${task} ${label} 缺少字段：${missingFields.join(", ")}。`);
  }
}

function requireNonEmptyString(value, label, task) {
  if (typeof value !== "string" || value.length === 0) {
    throw new AdoptionValidationError(`${task} ${label} 必须是非空字符串。`);
  }
}

function validateTokenSource(source, label, { requireKind = false } = {}) {
  const kind = source?.kind;
  if (!kind && !requireKind) {
    validateObjectFields(source, ["name", "file", "line", "selector", "value"], ["name"], label, "Task 4");
  } else {
    const issues = validateTokenSourceShape(source, { label });
    if (issues.length > 0) throw new AdoptionValidationError(`Task 4 ${issues.map((item) => `${item.rule}: ${item.message}`).join("; ")}`);
  }
  if (source.file !== undefined) requireNonEmptyString(source.file, `${label}.file`, "Task 4");
  if (source.selector !== undefined) requireNonEmptyString(source.selector, `${label}.selector`, "Task 4");
  if (source.value !== undefined && typeof source.value !== "string") throw new AdoptionValidationError(`Task 4 ${label}.value must be a string.`);
  if (source.line !== undefined && (!Number.isInteger(source.line) || source.line < 1)) throw new AdoptionValidationError(`Task 4 ${label}.line must be a positive integer.`);
}

function validateTask3Mappings(plan) {
  const statuses = new Set(["proposed", "confirmed", "rejected", "manual"]);
  for (const [index, mapping] of plan.tokenMappings.entries()) {
    const label = `tokenMappings[${index}]`;
    validateObjectFields(
      mapping,
      ["semanticToken", "canonicalToken", "canonicalCssVariable", "source", "fallback", "match", "theme", "selector", "evidence", "status"],
      ["semanticToken", "source", "match", "status"],
      label,
      "Task 4",
    );
    requireNonEmptyString(mapping.semanticToken, `${label}.semanticToken`, "Task 4");
    validateTokenSource(mapping.source, `${label}.source`, { requireKind: mapping.status === "confirmed" });
    if (!new Set(["exact", "candidate"]).has(mapping.match)) {
      throw new AdoptionValidationError(`Task 4 ${label}.match 包含 Task 3 不允许的值：${mapping.match}。`);
    }
    if (!statuses.has(mapping.status)) {
      throw new AdoptionValidationError(`Task 4 ${label}.status 包含 Task 3 不允许的值：${mapping.status}。`);
    }
    if (mapping.source.file !== undefined) requireNonEmptyString(mapping.source.file, `${label}.source.file`, "Task 4");
    if (mapping.source.selector !== undefined) requireNonEmptyString(mapping.source.selector, `${label}.source.selector`, "Task 4");
    if (mapping.source.value !== undefined && typeof mapping.source.value !== "string") {
      throw new AdoptionValidationError(`Task 4 ${label}.source.value 必须是字符串。`);
    }
    if (mapping.source.line !== undefined && (!Number.isInteger(mapping.source.line) || mapping.source.line < 1)) {
      throw new AdoptionValidationError(`Task 4 ${label}.source.line 必须是正整数。`);
    }
  }
  for (const [index, mapping] of plan.tokenMappings.entries()) {
    if (mapping.status !== "confirmed") continue;
    const label = `tokenMappings[${index}]`;
    for (const field of ["canonicalToken", "canonicalCssVariable", "theme", "selector"]) {
      requireNonEmptyString(mapping[field], `${label}.${field}`, "Task 4");
    }
    if (mapping.canonicalToken !== `semantic.${mapping.semanticToken}`) {
      throw new AdoptionValidationError(`Task 4 ${label}.canonicalToken must match semanticToken.`);
    }
    if (!CSS_CUSTOM_PROPERTY_PATTERN.test(mapping.canonicalCssVariable)) {
      throw new AdoptionValidationError(`Task 4 ${label}.canonicalCssVariable must be a CSS variable.`);
    }
    const evidenceIssues = validateTokenMappingEvidence(mapping.evidence);
    if (evidenceIssues.length > 0) throw new AdoptionValidationError(`Task 4 ${label}: ${evidenceIssues.map((item) => item.message).join("; ")}.`);
    if (!isSafeTokenSelector(mapping.selector)) throw new AdoptionValidationError(`Task 4 ${label}.selector is not a supported safe token selector.`);
    if (mapping.selector !== ":root" && !mapping.fallback) {
      throw new AdoptionValidationError(`Task 4 ${label} conditional selector must declare fallback.`);
    }
    if (mapping.fallback !== undefined) validateTokenSource(mapping.fallback, `${label}.fallback`, { requireKind: true });
  }
}

async function loadConfirmedAdoptionPlan(projectRoot, outputRoot, { lock, requireBinding = false } = {}) {
  const planPath = join(outputRoot, "adoption/adoption-plan.json");
  const schemaPath = join(outputRoot, "adoption/adoption-plan.schema.json");
  const extractionPath = join(outputRoot, "intake/extraction-report.json");
  const compatibilityPath = join(outputRoot, "adoption/compatibility-report.json");
  for (const [path, label] of [[planPath, "adoption plan"], [extractionPath, "extraction report"], [compatibilityPath, "compatibility report"]]) {
    await assertSafeProjectPath(projectRoot, path, label);
  }
  const planRaw = await readFile(planPath);
  let plan;
  try {
    plan = JSON.parse(planRaw.toString("utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new AdoptionValidationError(`adoption plan could not be parsed: ${error.message}`);
  }
  const extraction = await readAdoptionJson(extractionPath, "extraction report");
  const compatibility = await readAdoptionJson(compatibilityPath, "compatibility report");
  if (extraction.evidenceLimitReached === true) {
    throw new AdoptionValidationError("extraction evidence is incomplete because maxFiles was reached; rerun extract with a complete or higher inventory boundary before confirming or writing adoption assets.");
  }
  if (Array.isArray(plan.tokenMappings) && Array.isArray(plan.componentMappings)) validateTask3Mappings(plan);
  const [managedSchemaRaw, trustedSchemaRaw] = await Promise.all([
    readFile(schemaPath),
    readFile(resolve(SKILL_ROOT, "templates/adoption-plan.schema.json")),
  ]);
  if (digest(trustedSchemaRaw) !== ADOPTION_PLAN_SCHEMA_DIGEST) {
    throw new AdoptionValidationError("trusted adoption plan schema differs from the pinned v0.10 contract.");
  }
  if (!managedSchemaRaw.equals(trustedSchemaRaw)) {
    throw new AdoptionValidationError("managed adoption plan schema bytes differ from the trusted v0.10 contract.");
  }
  const schema = JSON.parse(trustedSchemaRaw.toString("utf8").replace(/^\uFEFF/, ""));
  const schemaErrors = adoptionPlanValidationErrors(plan, schema);
  if (schemaErrors.length > 0) {
    const details = schemaErrors.join("; ");
    throw new AdoptionValidationError(`adoption plan schema 校验失败：${details}`);
  }
  const planBinding = adoptionPlanBinding(planRaw);
  if (requireBinding) {
    const entry = lock?.files?.[planBinding.path];
    if (!exactAdoptionPlanBinding(lock?.adoption?.plan, planRaw)
      || entry?.source !== ADOPTION_MARKER_SOURCES[planBinding.path]
      || entry?.generatedHash !== planBinding.digest) {
      throw new AdoptionValidationError("confirmed adoption plan bytes or digest drifted from the exact managed lock binding.");
    }
  }
  if (plan.status !== "confirmed") {
    throw new AdoptionValidationError("adoption plan status 必须为 confirmed。请先确认计划再执行 adopt。");
  }
  const liveInventory = await collectSystemInventory({ projectRoot, outputRoot });
  if (liveInventory.evidenceLimitReached === true) {
    throw new AdoptionValidationError("live inventory evidence is incomplete because maxFiles was reached; rerun extract with a complete or higher inventory boundary before adoption.");
  }
  const liveDigest = computeInventoryDigest(liveInventory);
  if (liveDigest !== extraction.inventoryDigest || liveDigest !== plan.inventoryDigest) {
    throw new AdoptionValidationError("当前 live source inventory digest 与 extraction report / adoption plan 不一致；请重新 extract 并确认计划。");
  }
  if (computeInventoryDigest(extraction) !== extraction.inventoryDigest) {
    throw new AdoptionValidationError("extraction report evidence 与其 inventory digest 不一致；请重新 extract。");
  }
  if (!extraction.inventoryDigest || plan.inventoryDigest !== extraction.inventoryDigest) {
    throw new AdoptionValidationError("adoption plan inventory digest 已过期；请重新 extract 并确认最新计划。");
  }
  if (compatibility.inventoryDigest !== extraction.inventoryDigest) {
    throw new AdoptionValidationError("compatibility report digest 与最新 extraction report 不一致；请重新 extract。");
  }
  const aliases = await readJson(resolve(SKILL_ROOT, "templates/adoption-component-aliases.json"));
  const expectedCompatibility = evaluateCompatibility(extraction, aliases);
  if (JSON.stringify(compatibility) !== JSON.stringify(expectedCompatibility)) {
    throw new AdoptionValidationError("compatibility report 与最新 extraction evidence 不一致；请重新 extract。");
  }

  if (
    plan.tokenMappings.some((mapping) => mapping.status === "proposed" || mapping.status === "manual")
    || plan.componentMappings.some((mapping) => mapping.status === "proposed")
  ) {
    throw new AdoptionValidationError("Token mappings must be confirmed or rejected; proposed and manual token mappings block adoption. Component mappings must not remain proposed.");
  }
  const tokenCandidateKey = (item) => `${item.semanticToken}\u0000${item.sourceToken ?? item.source?.name}`;
  const componentCandidateKey = (item) => `${item.component}\u0000${item.source?.path}\u0000${item.source?.exportName}`;
  const tokenCandidates = new Map(
    (compatibility.tokenCandidates ?? []).map((candidate) => [tokenCandidateKey(candidate), candidate]),
  );
  const componentCandidates = new Map(
    (compatibility.componentCandidates ?? []).map((candidate) => [componentCandidateKey(candidate), candidate]),
  );
  const representedTokenMappings = new Set(plan.tokenMappings.map(tokenCandidateKey));
  const representedComponentMappings = new Set(plan.componentMappings.map(componentCandidateKey));
  if (
    [...tokenCandidates.keys()].some((key) => !representedTokenMappings.has(key))
    || [...componentCandidates.keys()].some((key) => !representedComponentMappings.has(key))
  ) {
    throw new AdoptionValidationError("adoption plan 遗漏了 compatibility report 中的 mapping candidate；请重新确认完整计划。");
  }
  for (const mapping of plan.tokenMappings.filter((item) => item.status === "confirmed")) {
    if (mapping.source?.kind !== "css-variable") {
      if (!mapping.semanticToken || !mapping.source?.kind) {
        throw new AdoptionValidationError("confirmed token mapping is missing semanticToken or source.kind.");
      }
      continue;
    }
    if (!mapping.semanticToken || !mapping.source?.name) {
      throw new AdoptionValidationError("confirmed token mapping 缺少 semanticToken 或 source.name。");
    }
    if (!tokenCandidates.has(tokenCandidateKey(mapping))) {
      throw new AdoptionValidationError(`confirmed token mapping 缺少最新 compatibility evidence：${mapping.semanticToken}。`);
    }
  }
  for (const mapping of plan.componentMappings.filter((item) => item.status === "confirmed")) {
    if (["direct", "wrapper"].includes(mapping.strategy)) {
      const candidate = componentCandidates.get(componentCandidateKey(mapping));
      if (!candidate) {
        throw new AdoptionValidationError(`confirmed component mapping lacks current compatibility identity evidence: ${mapping.component}.`);
      }
      continue;
    }
    if (!["generate", "manual"].includes(mapping.strategy)) {
      throw new AdoptionValidationError(`unsupported confirmed component mapping strategy: ${mapping.strategy}.`);
    }
  }

  const decisions = new Set(plan.decisions);
  const unresolvedConflicts = (compatibility.criticalConflicts ?? []).filter((conflict) => !decisions.has(`resolve:${conflict.id}`));
  if (unresolvedConflicts.length > 0) {
    throw new AdoptionValidationError(`存在 ${unresolvedConflicts.length} 个未解决的 critical mapping 冲突。`);
  }

  const confirmedTokenMappings = plan.tokenMappings.filter((item) => item.status === "confirmed");
  const tokenBridge = buildTokenBridge({ mappings: plan.tokenMappings, inventory: liveInventory, strategy: plan.strategy });
  if (tokenBridge.issues.length > 0) {
    const details = tokenBridge.issues.map((item) => `${item.rule}: ${item.message}`).join("; ");
    throw new AdoptionValidationError(`token bridge validation failed: ${details}`);
  }

  let componentRuntime;
  try {
    componentRuntime = buildRuntimePlan({ strategy: plan.strategy, mappings: plan.componentMappings, inventory: liveInventory });
  } catch (error) {
    throw new AdoptionValidationError(`Task 5 component runtime validation failed: ${error.message}`);
  }
  await validateComponentRuntimeFiles(projectRoot, outputRoot, componentRuntime);

  const generatedSources = {};
  for (const adapter of componentRuntime.adapters) {
    generatedSources[adapter.adapterPath] = renderReactAdapter(adapter);
  }
  for (const component of componentRuntime.generatedComponents) {
    generatedSources[component.generatedPath] = await readFile(resolve(SKILL_ROOT, `templates/react-runtime/src/${component.canonicalExport}.tsx`), "utf8");
  }
  if (componentRuntime.enabled) {
    generatedSources["runtime/react/src/index.ts"] = renderRuntimeBarrel(componentRuntime.entries);
  }
  if (componentRuntime.generatedComponents.length > 0) {
    generatedSources["runtime/react/src/generated-components.css"] = renderGeneratedComponentStyles(componentRuntime.generatedComponents);
  }
  const typeEvidenceAttestation = componentRuntime.enabled
    ? await buildTypeEvidenceAttestation({ projectRoot, outputRoot, inventory: liveInventory, plan, runtime: componentRuntime, generatedSources })
    : null;

  return { plan, planRaw, planBinding, extraction, compatibility, liveInventory, tokenBridge, confirmedTokenMappings, componentRuntime, typeEvidenceAttestation };
}

async function readContainedComponentFile(projectRoot, relativePath, label) {
  const path = resolve(projectRoot, relativePath);
  try {
    await assertSafeProjectPath(projectRoot, path, label);
  } catch (error) {
    throw new AdoptionValidationError(error.message);
  }
  let info;
  try {
    info = await lstat(path);
  } catch (error) {
    throw new AdoptionValidationError(`${label} does not exist: ${relativePath}.`);
  }
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new AdoptionValidationError(`${label} must be an ordinary file: ${relativePath}.`);
  }
  const canonicalPath = await realpath(path);
  if (!isInsideOrEqual(projectRoot, canonicalPath)) {
    throw new AdoptionValidationError(`${label} resolves outside the project: ${relativePath}.`);
  }
  return readFile(canonicalPath, "utf8");
}

async function validateComponentRuntimeFiles(projectRoot, outputRoot, runtime) {
  if (!runtime.enabled) return;
  for (const mapping of [...runtime.directComponents, ...runtime.adapters]) {
    await readContainedComponentFile(projectRoot, mapping.source.path, `${mapping.canonicalExport} source`);
  }
  for (const mapping of runtime.manualComponents) {
    await readContainedComponentFile(projectRoot, mapping.adapterPath, `${mapping.canonicalExport} manual adapter`);
    if (isInsideOrEqual(outputRoot, resolve(projectRoot, mapping.adapterPath))) {
      throw new AdoptionValidationError(`${mapping.adapterPath} is inside the generated output and cannot be a user-owned manual adapter.`);
    }
  }
  const generatedSources = {};
  for (const mapping of runtime.generatedComponents) {
    generatedSources[mapping.generatedPath] = await readFile(
      resolve(SKILL_ROOT, `templates/react-runtime/src/${mapping.canonicalExport}.tsx`),
      "utf8",
    );
  }
  try {
    validateRuntimeTypeEvidence({ projectRoot, outputRoot, runtime, generatedSources });
  } catch (error) {
    throw new AdoptionValidationError(error.message);
  }
}

async function readLock(lockPath) {
  const kind = await pathKind(lockPath);
  if (kind === "missing") return null;
  if (kind !== "file") {
    throw new Error(`锁文件路径不是普通文件：${lockPath}`);
  }
  try {
    const source = await readFile(lockPath);
    const lock = JSON.parse(source.toString("utf8").replace(/^\uFEFF/, ""));
    if (lock.schemaVersion !== 1 || typeof lock.files !== "object" || lock.files === null) {
      throw new Error("缺少 schemaVersion=1 或 files 对象");
    }
    Object.defineProperty(lock, "__currentHash", { value: digest(source), enumerable: false });
    return lock;
  } catch (error) {
    throw new Error(`无法读取 ${LOCK_FILE}：${error.message}。为保护用户文件，已停止更新。`);
  }
}

async function readExistingSystemConfig(outputRoot, projectRoot = null) {
  const configPath = join(outputRoot, "system.config.json");
  const inspected = projectRoot === null
    ? { kind: await pathKind(configPath), realPath: configPath }
    : await inspectUpdatePreflightPath(projectRoot, outputRoot, configPath, "system config", "file");
  if (inspected.kind === "missing") return null;
  if (inspected.kind !== "file") throw new Error(`视觉系统配置路径不是普通文件：${configPath}`);
  try {
    return JSON.parse((await readFile(inspected.realPath, "utf8")).replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new Error(`无法读取现有 system.config.json：${error.message}。为保护现有模式和项目名称，已停止执行。`);
  }
}

function hasTask5ConfigState(config) {
  if (
    config?.sourceOfTruth?.componentTypeEvidence != null
    || config?.sourceOfTruth?.componentRuntimeStyles === "runtime/react/src/generated-components.css"
    || config?.integration?.componentAdapterMap != null
  ) return true;
  if (config?.integration?.adoptionStrategy == null) return false;
  return config?.sourceOfTruth?.componentManifest != null
    || config?.sourceOfTruth?.componentRuntime != null
    || config?.integration?.sharedComponentRoot != null
    || config?.integration?.sharedComponentExport != null
    || config?.checks?.componentRuntime != null;
}

function isTask5LockEntry(path, entry, { includeGenerated = false } = {}) {
  return TASK5_UNIQUE_DISK_PATHS.has(path)
    || (Object.hasOwn(ADOPTION_COMPONENT_SOURCES, path)
      && !TASK5_SHARED_CHECK_PATHS.has(path)
      && entry?.source === ADOPTION_COMPONENT_SOURCES[path])
    || path.startsWith("runtime/react/src/adapters/")
    || entry?.source?.startsWith("generated:component-wrapper:")
    || (includeGenerated && entry?.source?.startsWith("templates/react-runtime/src/"));
}

async function collectTask5PlanState(projectRoot, outputRoot) {
  const planPath = join(outputRoot, "adoption/adoption-plan.json");
  const inspected = await inspectUpdatePreflightPath(projectRoot, outputRoot, planPath, "component adoption plan", "file");
  if (inspected.kind === "missing") return false;
  let plan;
  try {
    plan = JSON.parse((await readFile(inspected.realPath, "utf8")).replace(/^\uFEFF/, ""));
  } catch {
    return false;
  }
  return plan?.status === "confirmed"
    && Array.isArray(plan.componentMappings)
    && plan.componentMappings.some((mapping) => mapping?.status === "confirmed"
      && ["direct", "wrapper", "generate", "manual"].includes(mapping.strategy));
}

async function collectTask5DiskState(projectRoot, outputRoot) {
  const fixedPaths = [];
  for (const path of Object.keys(ADOPTION_COMPONENT_SOURCES)) {
    const inspected = await inspectUpdatePreflightPath(projectRoot, outputRoot, join(outputRoot, path), `Task 5 marker ${path}`, "file");
    if (inspected.kind !== "missing") fixedPaths.push(path);
  }
  const runtimeRoot = join(outputRoot, "runtime/react/src");
  const runtimeState = await inspectUpdatePreflightPath(projectRoot, outputRoot, runtimeRoot, "Task 5 runtime root", "directory");
  const dynamicPaths = [];
  const adapterPaths = [];
  let adaptersPresent = false;
  if (runtimeState.kind === "directory") {
    let entries;
    try {
      entries = await readdir(runtimeState.realPath, { withFileTypes: true });
    } catch (error) {
      throw new AdoptionValidationError(`update could not inspect Task 5 runtime state: ${error.message}.`);
    }
    for (const entry of entries) {
      if (!entry.name.endsWith(".tsx")) continue;
      const path = `runtime/react/src/${entry.name}`;
      await inspectUpdatePreflightPath(projectRoot, outputRoot, join(outputRoot, path), `Task 5 runtime file ${path}`, "file");
      dynamicPaths.push(path);
    }
    const adaptersRoot = join(runtimeRoot, "adapters");
    const adaptersState = await inspectUpdatePreflightPath(projectRoot, outputRoot, adaptersRoot, "Task 5 adapters directory", "directory");
    if (adaptersState.kind === "directory") {
      adaptersPresent = true;
      let adapters;
      try {
        adapters = await readdir(adaptersState.realPath, { withFileTypes: true });
      } catch (error) {
        throw new AdoptionValidationError(`update could not inspect Task 5 adapter state: ${error.message}.`);
      }
      for (const entry of adapters) {
        const path = `runtime/react/src/adapters/${entry.name}`;
        await inspectUpdatePreflightPath(projectRoot, outputRoot, join(outputRoot, path), `Task 5 adapter file ${path}`, "file");
        adapterPaths.push(path);
        dynamicPaths.push(path);
      }
    }
  }
  let adoptionManifest = false;
  if (fixedPaths.includes("components/manifest.json")) {
    const inspected = await inspectUpdatePreflightPath(
      projectRoot,
      outputRoot,
      join(outputRoot, "components/manifest.json"),
      "Task 5 component manifest",
      "file",
    );
    try {
      const manifest = JSON.parse((await readFile(inspected.realPath, "utf8")).replace(/^\uFEFF/, ""));
      adoptionManifest = manifest?.runtime?.adoption === true;
    } catch {
      // Its adoption lock provenance or confirmed plan remains authoritative when malformed.
    }
  }
  return {
    fixedPaths,
    uniquePaths: fixedPaths.filter((path) => TASK5_UNIQUE_DISK_PATHS.has(path)),
    dynamicPaths,
    adapterPaths,
    runtimePresent: adaptersPresent,
    adoptionManifest,
  };
}

function renderJson(spec, source, context) {
  if (spec.source === "templates/adoption-plan.schema.json") return source;
  const value = JSON.parse(source);
  if (spec.source === "templates/component-kit.json") {
    value.profile = context.componentKit.profile;
    value.selectionSource = context.componentKit.selectionSource;
    value.requestedComponentIds = context.componentKit.requestedComponentIds;
    value.dependencyAddedComponentIds = context.componentKit.dependencyAddedComponentIds;
    value.componentIds = context.componentKit.componentIds;
    value.runtimeComponentIds = context.componentKit.runtimeComponentIds;
    value.generatedBy.version = VERSION;
    return `${JSON.stringify(value, null, 2)}\n`;
  }
  if (value.meta?.name === "[project] design tokens") {
    value.meta.name = `${context.projectName} design tokens`;
  }
  if (value.project && Object.hasOwn(value.project, "name")) {
    value.project.name = context.projectName;
  }
  if (Object.hasOwn(value, "mode")) {
    value.mode = context.mode;
  }
  if (Array.isArray(value.external_component_maps)) {
    value.external_component_maps = value.external_component_maps.map((entry) =>
      entry === "templates/astryx-component-map.json" ? "external/astryx-component-map.json" : entry,
    );
  }
  if (value.generatedBy?.skill === "design-consultant") {
    value.generatedBy.version = VERSION;
  }
  if (spec.source === "templates/design-system-package.json" && context.componentKit && !context.componentKit.full) {
    value.name = "design-consultant-kit";
    for (const script of ["catalog:build", "catalog:check", "visual:test"]) delete value.scripts[script];
    if (!componentKitUsesReactAria(context.componentKit)) delete value.dependencies["react-aria-components"];
    if (!componentKitUsesLucide(context.componentKit)) delete value.dependencies["lucide-react"];
  }
  if (spec.source === "templates/react-runtime/package.json"
    && context.componentKit
    && !componentKitUsesReactAria(context.componentKit)) {
    delete value.peerDependencies["react-aria-components"];
  }
  if (spec.source === "templates/react-runtime/package.json"
    && context.componentKit
    && !componentKitUsesLucide(context.componentKit)) {
    delete value.peerDependencies["lucide-react"];
  }
  if (spec.source === "templates/component-decisions.json" && context.componentKit && !context.componentKit.full) {
    const selectedFamilies = context.componentKit.library.families
      .filter((family) => context.componentKit.selectedIds.has(family.id));
    value.choices = Object.fromEntries(selectedFamilies.map((family) => [
      family.name,
      family.availability === "runtime-ready" ? "keep" : "hold",
    ]));
    value.counts = {
      keep: selectedFamilies.filter((family) => family.availability === "runtime-ready").length,
      adjust: 0,
      hold: selectedFamilies.filter((family) => family.availability !== "runtime-ready").length,
    };
  }
  if (spec.source === "templates/adoption-visual.config.json" && context.workflow === "existing-system-adoption") {
    value.projectIdentity = checkedManagedProjectIdentity(context.projectIdentity);
    value.baseUrl = context.adoption.plan.visualVerification.baseUrl;
    value.routes = context.adoption.plan.visualVerification.routes;
  }
  if (value.sourceOfTruth && value.integration) {
    value.sourceOfTruth.componentKit = context.componentKit ? "components/kit.json" : null;
    if (context.componentKit) {
      value.componentKit = {
        profile: context.componentKit.profile,
        selectionSource: context.componentKit.selectionSource,
        requestedComponentIds: context.componentKit.requestedComponentIds,
        dependencyAddedComponentIds: context.componentKit.dependencyAddedComponentIds,
        componentIds: context.componentKit.componentIds,
      };
    }
    value.sourceOfTruth.componentRuntime = context.reactRuntime?.enabled ? "runtime/react/src/index.ts" : null;
    value.sourceOfTruth.componentRuntimeStyles = context.reactRuntime?.enabled ? "runtime/react/src/styles.css" : null;
    value.integration.framework = context.reactRuntime?.enabled ? "React" : value.integration.framework;
    value.integration.sharedComponentRoot = context.reactRuntime?.enabled ? "runtime/react/src" : value.integration.sharedComponentRoot;
    value.integration.sharedComponentExport = context.reactRuntime?.enabled ? "runtime/react/src/index.ts" : value.integration.sharedComponentExport;
    value.sourceOfTruth.catalogSource = context.reactRuntime?.enabled ? "catalog/src/catalog.tsx" : null;
    value.sourceOfTruth.catalogBundle = "catalog/component-library.js";
    value.checks.componentRuntime = "checks/check-component-runtime.mjs";
    value.checks.uiContract = "checks/check-ui-contract.mjs";
    value.checks.catalogBuild = context.reactRuntime?.enabled ? "checks/build-component-catalog.mjs" : null;
    value.checks.visualRegression = context.reactRuntime?.enabled ? "checks/visual-regression.mjs" : null;
    if (context.componentKit && !context.componentKit.full) {
      for (const key of [
        "catalogFoundation",
        "componentCatalogStyles",
        "componentPreviewStyles",
        "catalog",
        "catalogSource",
        "catalogBundle",
        "visualizationCatalog",
      ]) value.sourceOfTruth[key] = null;
      value.checks.catalogBuild = null;
      value.checks.visualRegression = null;
    }
  }
  if (Array.isArray(value.families) && context.componentKit) {
    value.families = value.families.filter((family) => context.componentKit.selectedIds.has(family.id));
    value.kit = {
      profile: context.componentKit.profile,
      selectionSource: context.componentKit.selectionSource,
      componentIds: context.componentKit.componentIds,
    };
  }
  if (Array.isArray(value.families) && context.reactRuntime?.enabled) {
    value.schema_version = "0.4";
    value.runtime = {
      framework: "react",
      language: "typescript",
      styling: "css-variables",
      entry: "runtime/react/src/index.ts",
      styles: "runtime/react/src/styles.css",
      generated: context.reactRuntime.generated,
      mapped: context.reactRuntime.mapped,
    };
    for (const definition of context.reactRuntime.components) {
      const family = value.families.find((entry) => entry.id === definition.id);
      if (!family) throw new Error(`组件 Manifest 缺少 React 核心组件族：${definition.id}`);
      const mapping = context.reactRuntime.mappings.get(definition.exportName);
      family.implementationPath = mapping?.manifestPath ?? `runtime/react/src/${definition.exportName}.tsx`;
      family.importPath = "./runtime/react/src";
      family.exportName = definition.exportName;
      family.framework = "react";
      family.status = mapping ? "mapped" : "generated";
      family.origin = mapping ? "existing" : "design-consultant";
      family.mappingStatus = "confirmed";
      family.sourceImplementationPath = mapping?.projectPath ?? null;
      family.adapterPath = null;
      family.coverage = { candidates: mapping ? 1 : 0, confirmed: 1, rejected: 0, runtime: 1 };
      family.states = family.required_states;
      family.api = { props: definition.props };
    }
  } else if (Array.isArray(value.families)) {
    delete value.runtime;
    for (const definition of context.componentKit?.runtimeDefinitions ?? REACT_RUNTIME_COMPONENTS) {
      const family = value.families.find((entry) => entry.id === definition.id);
      if (!family) continue;
      family.status = "contract";
      for (const key of ["implementationPath", "importPath", "exportName", "framework", "states", "api", "origin", "mappingStatus", "sourceImplementationPath", "adapterPath", "coverage"]) delete family[key];
    }
  }
  return `${JSON.stringify(value, null, 2)}\n`;
}

function renderAdoptionSystemConfig(context, adoption) {
  const { plan, liveInventory: inventory, confirmedTokenMappings, componentRuntime } = adoption;
  const pointers = adoptionConfigPointers({
    tokenBridgeActive: confirmedTokenMappings.length > 0,
    componentRuntimeActive: componentRuntime.enabled,
    generatedStylesActive: componentRuntime.generatedComponents.length > 0,
    legacyBaseline: plan.legacyBaseline?.path ?? null,
  });
  const value = {
    schemaVersion: 1,
    project: { name: context.projectName, status: "active" },
    mode: context.mode,
    generatedBy: { skill: "design-consultant", version: VERSION },
    sourceOfTruth: {
      designDecisions: null,
      ...pointers.sourceOfTruth,
      tokenTypes: null,
      tokenSchema: null,
      visualizationManifest: null,
      visualizationTheme: null,
      visualizationTokenRuntime: null,
      visualizationDependencies: null,
      visualizationUpstream: null,
      componentManifest: pointers.sourceOfTruth.componentManifest,
      componentDecisions: null,
      catalogFoundation: componentRuntime.enabled ? "catalog/catalog-foundation.css" : null,
      componentCatalogStyles: componentRuntime.enabled ? "catalog/component-library.css" : null,
      componentPreviewStyles: null,
      catalog: componentRuntime.enabled ? "catalog/component-library.html" : null,
      catalogSource: componentRuntime.enabled ? "catalog/src/catalog.tsx" : null,
      catalogBundle: componentRuntime.enabled ? "catalog/component-library.js" : null,
      visualizationCatalog: componentRuntime.enabled ? "catalog/component-library.html#visualization/lupi" : null,
      agentRules: null,
      componentRuntime: pointers.sourceOfTruth.componentRuntime,
      componentRuntimeStyles: pointers.sourceOfTruth.componentRuntimeStyles,
    },
    integration: {
      adoptionStrategy: plan.strategy,
      tokenOwnership: adoptionTokenOwnership(plan.strategy),
      ...pointers.integration,
      framework: componentRuntime.enabled ? "React" : (inventory.detected?.frameworks?.[0] ?? null),
      runtimeTokenImport: null,
      sharedComponentRoot: componentRuntime.enabled ? "runtime/react/src" : null,
      sharedComponentExport: componentRuntime.enabled ? "runtime/react/src/index.ts" : null,
      iconEntry: null,
    },
    checks: {
      cssVariables: null,
      ...pointers.checks,
      designContract: null,
      visualizationModule: null,
      componentRuntime: pointers.checks.componentRuntime,
      uiContract: null,
      catalogBuild: componentRuntime.enabled ? "checks/build-component-catalog.mjs" : null,
      visualRegression: componentRuntime.enabled ? "checks/visual-regression.mjs" : null,
      productAcceptance: componentRuntime.enabled ? "checks/product-acceptance.config.mjs" : null,
      productCommitments: componentRuntime.enabled ? "checks/product-commitments.json" : null,
      finalVerification: componentRuntime.enabled ? "checks/verify-project.mjs" : null,
    },
  };
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sortedComponentMappings(mappings) {
  const order = new Map(REACT_COMPONENTS.map((component, index) => [component.id, index]));
  return [...mappings].sort((left, right) => (
    (order.get(left.component) ?? 999) - (order.get(right.component) ?? 999)
    || `${left.status}:${left.source?.path ?? left.adapterPath ?? ""}:${left.source?.exportName ?? ""}`
      .localeCompare(`${right.status}:${right.source?.path ?? right.adapterPath ?? ""}:${right.source?.exportName ?? ""}`)
  ));
}

function renderComponentAdapterMap(adoption) {
  const active = new Map(adoption.componentRuntime.entries.map((entry) => [entry.component, entry]));
  const mappings = sortedComponentMappings(adoption.plan.componentMappings).map((mapping) => {
    const definition = canonicalComponent(mapping.component);
    const runtime = active.get(mapping.component);
    return {
      component: mapping.component,
      canonicalExport: definition.exportName,
      strategy: mapping.strategy,
      status: mapping.status,
      sourceImplementationPath: mapping.source?.path ?? null,
      sourceExport: mapping.source?.exportName ?? null,
      sourcePropsExport: mapping.source?.propsExport ?? null,
      adapterPath: mapping.strategy === "wrapper"
        ? runtime.adapterPath
        : (mapping.strategy === "manual" ? mapping.adapterPath : null),
      generatedPath: mapping.strategy === "generate" ? runtime.generatedPath : null,
      ...(mapping.api ? { api: mapping.api } : {}),
      ...(mapping.propMap ? { propMap: mapping.propMap } : {}),
    };
  });
  return `${JSON.stringify({
    schemaVersion: 1,
    framework: "react",
    projectOutput: adoption.liveInventory.project.output,
    mappings,
  }, null, 2)}\n`;
}

function renderAdoptionComponentManifest(template, context, adoption) {
  const value = JSON.parse(template);
  delete value.external_component_maps;
  delete value.project_extractions;
  const runtime = adoption.componentRuntime;
  value.schema_version = "0.4";
  value.runtime = {
    framework: "react",
    language: "typescript",
    entry: "runtime/react/src/index.ts",
    adoption: true,
    active: runtime.entries.length,
    generated: runtime.generatedComponents.length,
    mapped: runtime.directComponents.length + runtime.adapters.length + runtime.manualComponents.length,
  };
  const expectedFamilies = buildAdoptionManifestTask5Fields({
    runtime,
    projectRoot: context.projectRoot,
    outputRoot: context.outputRoot,
  });
  const templateFamilies = new Map(value.families.map((family) => [family.id, family]));
  value.families = expectedFamilies.map((expected) => {
    const family = templateFamilies.get(expected.id);
    if (!family) throw new AdoptionValidationError(`Task 5 component manifest lacks core family ${expected.id}.`);
    return { ...family, ...expected.fields };
  });
  return `${JSON.stringify(value, null, 2)}\n`;
}

function renderReactKitSmokeTest(context) {
  const exports = context.reactRuntime.components.flatMap(runtimeExportNames).sort();
  return `import { describe, expect, it } from "vitest";
import * as runtime from "../src";

describe("project component kit exports", () => {
  it("exports exactly the selected runtime components", () => {
    expect(Object.keys(runtime).sort()).toEqual(${JSON.stringify(exports)});
  });
});
`;
}

function renderReactKitStyles(source, context) {
  const selected = context.componentKit.selectedIds;
  const rendered = source.replace(
    /\/\* dc-kit:([^*]+):start \*\/([\s\S]*?)\/\* dc-kit:end \*\//g,
    (_match, rawIds, content) => rawIds.split(",").some((id) => selected.has(id.trim()))
      ? `${content.trim()}\n`
      : "",
  );
  return `${rendered.trim().replace(/\n{3,}/g, "\n\n")}\n`;
}

function renderTemplate(spec, source, context) {
  if (extname(spec.source) === ".json") {
    return renderJson(spec, source, context);
  }
  if (spec.source === "templates/react-runtime/tests/components.test.tsx"
    && context.componentKit
    && !context.componentKit.full) {
    return renderReactKitSmokeTest(context);
  }
  if (spec.source === "templates/react-runtime/src/styles.css"
    && context.componentKit
    && !context.componentKit.full) {
    return renderReactKitStyles(source, context);
  }
  let rendered = source
    .replaceAll("{{PROJECT_NAME}}", context.projectName)
    .replaceAll("{{PROJECT_NAME_JSON}}", JSON.stringify(context.projectName))
    .replaceAll("{{MODE}}", context.mode)
    .replaceAll("[项目名称]", context.projectName);
  if (["templates/component-library.html", "templates/component-preview.html"].includes(spec.source)) {
    rendered = rendered.replace('href="tokens.css"', 'href="../tokens/tokens.css"');
  }
  if (spec.source === "templates/component-library.html") {
    rendered = rendered.replace('href="react-runtime/src/styles.css"', 'href="../runtime/react/src/styles.css"');
    rendered = rendered.replaceAll('visualization-lieflat/', '../visualizations/lieflat/');
    if (context.workflow === "existing-system-adoption") {
      rendered = rendered.replace('  <link rel="stylesheet" href="../tokens/tokens.css">\n', "");
      rendered = rendered.replace('  <link rel="stylesheet" href="../runtime/react/src/styles.css">\n', "");
    }
  }
  if (spec.source === "templates/component-library.css" && context.workflow === "existing-system-adoption") {
    rendered = rendered.replace(/var\(--([a-z0-9-]+)\)/gi, "var(--dc-catalog-$1)");
  }
  if (spec.source.startsWith("templates/visualization-lieflat/") && extname(spec.source) === ".html") {
    const tokenStylesheet = context.workflow === "existing-system-adoption"
      ? "../../tokens/external-bridge.css"
      : "../../tokens/tokens.css";
    rendered = rendered.replace('href="../tokens.css"', `href="${tokenStylesheet}"`);
  }
  return rendered;
}

function templateSpecsFor(context) {
  if (context.command === "extract") return EXTRACT_SPECS;
  if (context.command === "adopt") return ADOPTION_SPECS[context.strategy];
  if (context.command === "update" && context.workflow === "existing-system-adoption") return EXTRACT_SPECS;
  if (!context.componentKit || context.componentKit.full) return FILE_SPECS;
  return FILE_SPECS.filter((spec) => {
    if (spec.destination.startsWith("catalog/")) return false;
    if (spec.destination === "components/external/astryx-component-map.json") return false;
    const brandSelected = context.componentKit.selectedIds.has("brand-attribution");
    if (!brandSelected && (
      spec.destination.startsWith("assets/brand/")
      || spec.destination.startsWith("runtime/brand-attribution/")
      || spec.destination === "runtime/react/src/ethnocentric-regular.otf"
    )) return false;
    return true;
  });
}

function reactRuntimeSpecsFor(context) {
  if (!context.componentKit || context.componentKit.full) return REACT_RUNTIME_SPECS;
  const brandSelected = context.componentKit.selectedIds.has("brand-attribution");
  return REACT_RUNTIME_SPECS.filter((spec) => {
    if (spec.destination === "catalog/src/catalog.tsx") return false;
    if (["checks/build-component-catalog.mjs", "checks/visual-regression.mjs"].includes(spec.destination)) return false;
    if (CATALOG_BUILD_DEPENDENCY_SPECS.some((dependency) => dependency.destination === spec.destination)) return false;
    if (spec.destination.startsWith("checks/visual-baselines/")) return false;
    if (!brandSelected && spec.destination === "runtime/react/src/brand-attribution-masks.ts") return false;
    return true;
  });
}

async function validatedUpdateWorkflow(projectRoot, outputRoot, lock, existingConfig) {
  const markerState = [];
  for (const marker of ADOPTION_MARKER_PATHS) {
    const path = join(outputRoot, marker);
    const inspected = await inspectUpdatePreflightPath(projectRoot, outputRoot, path, `adoption marker ${marker}`, "file");
    markerState.push({ marker, exists: inspected.kind === "file" });
  }
  const existingMarkers = markerState.filter((item) => item.exists).map((item) => item.marker);
  if (!lock) {
    const markerNote = existingMarkers.length > 0 ? "检测到 on-disk adoption marker，但" : "";
    throw new AdoptionValidationError(`update ${markerNote}缺少可信 lock；请重新运行 extract，或从已知 greenfield init 备份恢复。`);
  }
  const lockMarkers = ADOPTION_MARKER_PATHS.filter((marker) => lock.files?.[marker]);
  if (existingMarkers.length > 0) {
    if (existingMarkers.length !== ADOPTION_MARKER_PATHS.length) {
      throw new AdoptionValidationError("update 检测到不完整的 adoption marker/artifact；请重新运行 extract 进行恢复。");
    }
    if (lock.workflow !== "existing-system-adoption") {
      throw new AdoptionValidationError("update 检测到 adoption artifact 与 lock workflow 冲突；请重新运行 extract 进行恢复。");
    }
    if (lockMarkers.length !== ADOPTION_MARKER_PATHS.length) {
      throw new AdoptionValidationError("update 检测到 adoption lock marker 条目缺失；请重新运行 extract 进行恢复。");
    }
    const invalidProvenance = ADOPTION_MARKER_PATHS.filter((marker) => {
      const entry = lock.files[marker];
      return entry.source !== ADOPTION_MARKER_SOURCES[marker] || typeof entry.generatedHash !== "string";
    });
    if (invalidProvenance.length > 0) {
      throw new AdoptionValidationError(`update 检测到 adoption lock provenance/source 被篡改：${invalidProvenance.join(", ")}；请重新运行 extract 进行恢复。`);
    }
    const task5DiskState = await collectTask5DiskState(projectRoot, outputRoot);
    const task5LockPaths = Object.entries(lock.files ?? {})
      .filter(([path, entry]) => isTask5LockEntry(path, entry))
      .map(([path]) => path);
    const hasConfirmedComponentPlan = await collectTask5PlanState(projectRoot, outputRoot);
    const hasComponentState = task5DiskState.uniquePaths.length > 0
      || task5DiskState.adoptionManifest
      || task5DiskState.adapterPaths.length > 0
      || task5DiskState.runtimePresent
      || task5LockPaths.length > 0
      || hasTask5ConfigState(existingConfig)
      || hasConfirmedComponentPlan;
    const tokenMarkers = ["tokens/external-map.json", "tokens/external-bridge.css"];
    const hasTokenArtifacts = tokenMarkers.some((path) => lock.files?.[path]);
    if (hasTokenArtifacts) {
      const tokenCheckSpecs = hasComponentState
        ? [...ADOPTION_CHECK_DEPENDENCY_SPECS, { source: "scripts/sync-tokens.mjs", destination: "checks/sync-tokens.mjs" }]
        : ADOPTION_TOKEN_CHECK_SPECS;
      const tokenArtifactSources = {
        "tokens/external-map.json": ADOPTION_TOKEN_SOURCES["tokens/external-map.json"],
        "tokens/external-bridge.css": ADOPTION_TOKEN_SOURCES["tokens/external-bridge.css"],
        "system.config.json": ADOPTION_TOKEN_SOURCES["system.config.json"],
        ...Object.fromEntries(tokenCheckSpecs.map((spec) => [spec.destination, spec.source])),
      };
      const tokenArtifactPaths = Object.keys(tokenArtifactSources);
      const incomplete = [];
      for (const path of tokenArtifactPaths) {
        const inspected = await inspectUpdatePreflightPath(projectRoot, outputRoot, join(outputRoot, path), `Task 4 token artifact ${path}`, "file");
        const exists = inspected.kind === "file";
        if (!exists || !lock.files?.[path]) incomplete.push(path);
      }
      if (incomplete.length > 0) {
        throw new AdoptionValidationError(`update detected incomplete Task 4 token artifacts: ${incomplete.join(", ")}.`);
      }
      const invalidTokenProvenance = tokenArtifactPaths.filter((path) => lock.files[path].source !== tokenArtifactSources[path]);
      if (invalidTokenProvenance.length > 0) {
        throw new AdoptionValidationError(`update detected invalid Task 4 provenance: ${invalidTokenProvenance.join(", ")}.`);
      }
    }
    if (hasComponentState) {
      const { ["runtime/react/src/generated-components.css"]: optionalStylesSource, ...requiredComponentSources } = ADOPTION_COMPONENT_SOURCES;
      const stylesPath = "runtime/react/src/generated-components.css";
      const hasGeneratedStyles = task5DiskState.fixedPaths.includes(stylesPath) || Boolean(lock.files?.[stylesPath]);
      const componentArtifactSources = {
        ...requiredComponentSources,
        ...(hasGeneratedStyles
          ? { [stylesPath]: optionalStylesSource }
          : {}),
        "system.config.json": ADOPTION_TOKEN_SOURCES["system.config.json"],
        ...Object.fromEntries(ADOPTION_CHECK_DEPENDENCY_SPECS.map((spec) => [spec.destination, spec.source])),
      };
      const componentArtifactPaths = Object.keys(componentArtifactSources);
      const dynamicComponentPaths = [...new Set([
        ...task5DiskState.dynamicPaths,
        ...Object.entries(lock.files)
          .filter(([path, entry]) => isTask5LockEntry(path, entry, { includeGenerated: true }) && !Object.hasOwn(ADOPTION_COMPONENT_SOURCES, path))
          .map(([path]) => path),
      ])];
      const incomplete = [];
      for (const path of [...componentArtifactPaths, ...dynamicComponentPaths]) {
        const inspected = await inspectUpdatePreflightPath(projectRoot, outputRoot, join(outputRoot, path), `Task 5 component artifact ${path}`, "file");
        const exists = inspected.kind === "file";
        if (!exists || !lock.files?.[path]) incomplete.push(path);
      }
      const invalidProvenance = componentArtifactPaths.filter((path) => lock.files[path]
        && lock.files[path].source !== componentArtifactSources[path]);
      const attestationPath = join(outputRoot, "components/type-evidence-attestation.json");
      let attestationSource = null;
      const attestationReadIssues = [];
      const attestationState = await inspectUpdatePreflightPath(
        projectRoot,
        outputRoot,
        attestationPath,
        "Task 5 type evidence attestation",
        "file",
      );
      if (attestationState.kind === "file") {
        attestationSource = await readFile(attestationState.realPath, "utf8");
      } else {
        attestationReadIssues.push("type evidence attestation is missing or not an ordinary file");
      }
      const attestationLockIssues = validateTypeEvidenceLock({ lock, attestationSource });
      const invalidDynamicProvenance = dynamicComponentPaths.filter((path) => lock.files[path]).filter((path) => {
        const source = lock.files[path].source;
        if (typeof source !== "string") return true;
        if (source.startsWith("generated:component-wrapper:")) return !/^runtime\/react\/src\/adapters\/[A-Za-z_$][A-Za-z0-9_$]*\.tsx$/.test(path);
        return source !== `templates/react-runtime/src/${basename(path)}` || !/^runtime\/react\/src\/[A-Za-z_$][A-Za-z0-9_$]*\.tsx$/.test(path);
      });
      const componentIssues = [
        ...(incomplete.length > 0 ? [`incomplete artifacts/lock entries: ${[...new Set(incomplete)].join(", ")}`] : []),
        ...(invalidProvenance.length > 0 ? [`invalid fixed provenance: ${invalidProvenance.join(", ")}`] : []),
        ...attestationReadIssues,
        ...attestationLockIssues,
        ...(invalidDynamicProvenance.length > 0 ? [`invalid generated provenance: ${invalidDynamicProvenance.join(", ")}`] : []),
      ];
      if (componentIssues.length > 0) {
        throw new AdoptionValidationError(`update detected invalid Task 5 component state: ${componentIssues.join("; ")}.`);
      }
    }
    return "existing-system-adoption";
  }
  if (lockMarkers.length > 0 || lock.workflow === "existing-system-adoption") {
    throw new AdoptionValidationError("update 检测到 adoption lock 与磁盘 marker 不一致；请重新运行 extract 进行恢复。");
  }
  if (lock.workflow === "greenfield") {
    if (!isVerifiedGreenfieldProvenance(lock.workflowProvenance)) {
      throw new AdoptionValidationError("update 无法验证 greenfield init provenance；请重新运行 init 或从可信备份恢复。");
    }
    return "greenfield";
  }
  const legacyNote = lock.skillVersion?.startsWith("0.9") ? "检测到可读取的 v0.9 lock；" : "";
  throw new AdoptionValidationError(`${legacyNote}update 不会从缺失 workflow 推断 greenfield。请先运行 extract 或执行显式恢复。`);
}

function hasExactProvenance(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === Object.keys(expected).sort().join(",")
    && Object.entries(expected).every(([key, expectedValue]) => value[key] === expectedValue);
}

function isExactLegacyMigrationProvenance(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const fields = [
    "legacyBaseCommit",
    "legacySkillVersion",
    "origin",
    "schemaVersion",
    "skillVersion",
    "type",
    "verifiedFiles",
  ];
  return Object.keys(value).sort().join(",") === fields.sort().join(",")
    && value.schemaVersion === 1
    && value.type === "greenfield-init"
    && value.skillVersion === VERSION
    && value.origin === "legacy-lock-migration"
    && value.legacySkillVersion === "0.9.0"
    && value.legacyBaseCommit === LEGACY_V09_BASE_COMMIT
    && [
      Object.keys(LEGACY_V09_BASE_SOURCES).length,
      Object.keys(LEGACY_V09_BASE_SOURCES).length + Object.keys(LEGACY_V09_REACT_SOURCES).length,
    ].includes(value.verifiedFiles);
}

function isVerifiedGreenfieldProvenance(value) {
  return hasExactProvenance(value, GREENFIELD_INIT_PROVENANCE)
    || isExactLegacyMigrationProvenance(value);
}

function validateDynamicArtifactLockEntry({ lock, path, raw, source, provenance }) {
  const entry = lock?.files?.[path];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)
    || Object.keys(entry).sort().join(",") !== "generatedHash,provenance,source,templateHash"
    || entry.source !== source || entry.templateHash !== null
    || !hasExactProvenance(entry.provenance, provenance)
    || !/^[a-f0-9]{64}$/.test(entry.generatedHash ?? "")
    || digest(raw) !== entry.generatedHash) {
    throw new AdoptionValidationError(`managed adoption artifact has an invalid exact lock entry, raw hash, or provenance: ${path}`);
  }
}

async function inspectAdoptionDynamicArtifacts({ projectRoot, outputRoot, lock, plan }) {
  if (!lock || lock.workflow !== "existing-system-adoption") {
    throw new AdoptionValidationError("adoption requires an existing-system-adoption lock before planning managed artifacts.");
  }
  const baselineRelativePath = plan.legacyBaseline?.path;
  if (!isSafeLegacyBaselinePath(baselineRelativePath)) {
    throw new AdoptionValidationError("legacy baseline path must be a non-reserved JSON destination below checks/.");
  }
  const descriptors = [
    {
      path: baselineRelativePath,
      label: "legacy UI baseline",
      source: UI_CONTRACT_BASELINE_SOURCE,
      provenance: UI_CONTRACT_BASELINE_PROVENANCE,
      parse(raw) {
        let value;
        try {
          value = JSON.parse(raw.toString("utf8").replace(/^\uFEFF/, ""));
        } catch (error) {
          throw new AdoptionValidationError(`legacy UI baseline is invalid JSON: ${error.message}`);
        }
        try {
          return validateBaseline(value, { label: "legacy UI baseline" });
        } catch (error) {
          throw new AdoptionValidationError(error.message);
        }
      },
    },
    {
      path: "migration/plan.md",
      label: "adoption migration plan",
      source: MIGRATION_PLAN_SOURCE,
      provenance: MIGRATION_PLAN_PROVENANCE,
      parse: () => null,
    },
  ];
  const subsequent = lock?.adoption?.status === "confirmed";
  const state = { initial: !subsequent, baselineRelativePath };
  for (const descriptor of descriptors) {
    const artifactPath = resolve(outputRoot, ...descriptor.path.split("/"));
    if (!isInsideOrEqual(outputRoot, artifactPath)) {
      throw new AdoptionValidationError(`${descriptor.label} escapes the design-system output.`);
    }
    const inspected = await inspectUpdatePreflightPath(projectRoot, outputRoot, artifactPath, descriptor.label, "file");
    const lockEntryExists = Object.hasOwn(lock?.files ?? {}, descriptor.path);
    if (!subsequent) {
      if (inspected.kind !== "missing" || lockEntryExists) {
        throw new AdoptionValidationError(`initial adoption refuses a pre-existing ${descriptor.label} without prior managed provenance: ${descriptor.path}`);
      }
      state[descriptor.path] = { path: artifactPath, raw: null, value: null };
      continue;
    }
    if (inspected.kind !== "file" || !lockEntryExists) {
      throw new AdoptionValidationError(`managed adoption artifact is missing or lacks its exact lock entry: ${descriptor.path}`);
    }
    const raw = await readFile(inspected.realPath);
    if (descriptor.path === baselineRelativePath) {
      try {
        validateManagedBaselineLockEntry({ lock, relativePath: descriptor.path, baselineRaw: raw });
      } catch (error) {
        throw new AdoptionValidationError(error.message);
      }
    } else {
      validateDynamicArtifactLockEntry({ lock, path: descriptor.path, raw, source: descriptor.source, provenance: descriptor.provenance });
    }
    state[descriptor.path] = { path: artifactPath, raw, value: descriptor.parse(raw) };
  }
  return state;
}

function generatedItem({ source, destination, content, updateStrategy, templateHash = null, provenance = null, requiredAdoptionArtifact = false }) {
  return {
    source,
    destination,
    content,
    generatedHash: digest(content),
    templateHash,
    provenance,
    updateStrategy,
    requiredAdoptionArtifact,
  };
}

async function loadTemplateItems(context) {
  const items = [];
  const specs = [...templateSpecsFor(context)];
  const includeReactRuntime = context.reactRuntime?.enabled
    && (context.command === "init" || (context.command === "update" && context.workflow === "greenfield"));
  if (includeReactRuntime) {
    specs.push(...reactRuntimeSpecsFor(context));
    for (const definition of context.reactRuntime.components) {
      if (context.reactRuntime.mappings.has(definition.exportName)) continue;
      specs.push({
        source: `templates/react-runtime/src/${definition.exportName}.tsx`,
        destination: `runtime/react/src/${definition.exportName}.tsx`,
      });
    }
  }
  const includeAdoptionCatalog = context.reactRuntime?.enabled
    && context.workflow === "existing-system-adoption"
    && ["adopt", "update"].includes(context.command);
  if (includeAdoptionCatalog) specs.push(...ADOPTION_CATALOG_SPECS);
  if (context.adoption
    && context.adoption.confirmedTokenMappings.length > 0
    && !context.reactRuntime?.enabled
    && ["adopt", "update"].includes(context.command)) {
    specs.push({ source: "templates/adoption-core-package.json", destination: "package.json" });
  }
  for (const spec of specs) {
    const sourcePath = resolve(SKILL_ROOT, spec.source);
    const sourceBuffer = await readFile(sourcePath);
    const source = spec.binary ? sourceBuffer : sourceBuffer.toString("utf8");
    const content = spec.binary ? source : renderTemplate(spec, source, context);
    items.push({
      source: spec.source,
      destination: spec.destination,
      content,
      generatedHash: digest(content),
      templateHash: digest(sourceBuffer),
      updateStrategy: context.command === "update"
        || spec.destination === "adoption/adoption-plan.schema.json"
        ? "managed"
        : "create-only",
    });
  }
  if (includeReactRuntime) {
    const content = `${context.reactRuntime.exports.join("\n")}\n`;
    items.push({
      source: "generated:react-runtime-barrel",
      destination: "runtime/react/src/index.ts",
      content,
      generatedHash: digest(content),
      templateHash: null,
      updateStrategy: context.command === "update" ? "managed" : "create-only",
    });
  }
  return items;
}

async function addAdoptionTokenItems(items, context, adoption) {
  if (!adoption || adoption.confirmedTokenMappings.length === 0) return;
  const managed = { updateStrategy: "managed", requiredAdoptionArtifact: true };
  items.push(generatedItem({
    source: ADOPTION_TOKEN_SOURCES["tokens/external-map.json"],
    destination: "tokens/external-map.json",
    content: `${JSON.stringify(adoption.tokenBridge.map, null, 2)}\n`,
    ...managed,
  }));
  items.push(generatedItem({
    source: ADOPTION_TOKEN_SOURCES["tokens/external-bridge.css"],
    destination: "tokens/external-bridge.css",
    content: adoption.tokenBridge.css,
    ...managed,
  }));
}

async function addAdoptionSharedItems(items, context, adoption) {
  if (!adoption || (adoption.confirmedTokenMappings.length === 0 && !adoption.componentRuntime.enabled)) return;
  const managed = { updateStrategy: "managed", requiredAdoptionArtifact: true };
  items.push(generatedItem({
    source: ADOPTION_TOKEN_SOURCES["system.config.json"],
    destination: "system.config.json",
    content: renderAdoptionSystemConfig(context, adoption),
    ...managed,
  }));
  const specs = [
    ...(adoption.componentRuntime.enabled
      ? ADOPTION_CHECK_DEPENDENCY_SPECS
      : [...ADOPTION_CHECK_DEPENDENCY_SPECS, { source: "scripts/adoption/inventory.mjs", destination: "checks/adoption/inventory.mjs" }]),
    ...(adoption.confirmedTokenMappings.length > 0 ? [{ source: "scripts/sync-tokens.mjs", destination: "checks/sync-tokens.mjs" }] : []),
    ...(adoption.componentRuntime.enabled ? ADOPTION_COMPONENT_CHECK_SPECS : []),
  ];
  for (const spec of specs) {
    const sourcePath = resolve(SKILL_ROOT, spec.source);
    const sourceBuffer = await readFile(sourcePath);
    items.push(generatedItem({
      source: spec.source,
      destination: spec.destination,
      content: sourceBuffer.toString("utf8"),
      templateHash: digest(sourceBuffer),
      ...managed,
    }));
  }
}

async function addAdoptionComponentItems(items, context, adoption) {
  if (!adoption?.componentRuntime.enabled) return;
  const managed = { updateStrategy: "managed", requiredAdoptionArtifact: true };
  const manifestTemplate = await readFile(resolve(SKILL_ROOT, "templates/component-manifest.json"), "utf8");
  items.push(generatedItem({
    source: ADOPTION_COMPONENT_SOURCES["components/adapter-map.json"],
    destination: "components/adapter-map.json",
    content: renderComponentAdapterMap(adoption),
    ...managed,
  }));
  items.push(generatedItem({
    source: ADOPTION_COMPONENT_SOURCES["components/type-evidence-attestation.json"],
    destination: "components/type-evidence-attestation.json",
    content: `${JSON.stringify(adoption.typeEvidenceAttestation, null, 2)}\n`,
    provenance: TYPE_EVIDENCE_LOCK_PROVENANCE,
    ...managed,
  }));
  items.push(generatedItem({
    source: ADOPTION_COMPONENT_SOURCES["components/manifest.json"],
    destination: "components/manifest.json",
    content: renderAdoptionComponentManifest(manifestTemplate, context, adoption),
    templateHash: digest(manifestTemplate),
    ...managed,
  }));
  items.push(generatedItem({
    source: ADOPTION_COMPONENT_SOURCES["runtime/react/src/index.ts"],
    destination: "runtime/react/src/index.ts",
    content: renderRuntimeBarrel(adoption.componentRuntime.entries),
    ...managed,
  }));
  if (adoption.componentRuntime.generatedComponents.length > 0) {
    items.push(generatedItem({
      source: ADOPTION_COMPONENT_SOURCES["runtime/react/src/generated-components.css"],
      destination: "runtime/react/src/generated-components.css",
      content: renderGeneratedComponentStyles(adoption.componentRuntime.generatedComponents),
      ...managed,
    }));
  }
  for (const adapter of adoption.componentRuntime.adapters) {
    items.push(generatedItem({
      source: `generated:component-wrapper:${adapter.canonicalExport}`,
      destination: adapter.adapterPath,
      content: renderReactAdapter(adapter),
      ...managed,
    }));
  }
  for (const component of adoption.componentRuntime.generatedComponents) {
    const sourcePath = resolve(SKILL_ROOT, `templates/react-runtime/src/${component.canonicalExport}.tsx`);
    const source = await readFile(sourcePath, "utf8");
    items.push(generatedItem({
      source: `templates/react-runtime/src/${component.canonicalExport}.tsx`,
      destination: component.generatedPath,
      content: source,
      templateHash: digest(source),
      ...managed,
    }));
  }
}

async function buildAction(item, outputRoot, lock) {
  const absolutePath = resolve(outputRoot, item.destination);
  const kind = await pathKind(absolutePath);
  if (kind === "missing") {
    item.expectedKind = "missing";
    item.currentHash = null;
    return { ...item, action: "create", reason: "文件不存在" };
  }
  if (kind !== "file") {
    return { ...item, action: "conflict", reason: "目标路径已存在且不是普通文件" };
  }

  item.expectedKind = "file";
  const current = await readFile(absolutePath);
  const currentHash = digest(current);
  if (currentHash === item.generatedHash) {
    return {
      ...item,
      action: "preserve",
      reason: "内容已经是当前版本",
      currentHash,
      adopt: lock?.files?.[item.destination]?.generatedHash !== currentHash,
    };
  }

  const lockEntry = lock?.files?.[item.destination];
  if (item.updateStrategy === "managed" && lockEntry?.generatedHash === currentHash) {
    return { ...item, action: "update", reason: "文件未被用户修改，可安全更新", currentHash };
  }

  return {
    ...item,
    action: "preserve",
    reason: lockEntry ? "检测到用户修改，保持现有内容" : "已有文件不属于脚手架，保持现有内容",
    currentHash,
    userManaged: true,
  };
}

async function fileExists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function exportedComponent(source, exportName) {
  const escaped = exportName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `(?:export\\s+(?:default\\s+)?(?:function|class|const|let|var)\\s+${escaped}\\b)|(?:export\\s*\\{[^}]*\\b${escaped}\\b[^}]*\\})`,
    "m",
  ).test(source);
}

function importSpecifier(fromDirectory, targetFile) {
  const withoutExtension = targetFile.slice(0, -extname(targetFile).length);
  const path = toPosixPath(relative(fromDirectory, withoutExtension));
  return path.startsWith(".") ? path : `./${path}`;
}

async function inspectReactRuntime(context) {
  const warnings = [];
  const packageContext = await readPackageContext(context.projectRoot, warnings);
  const runtimeComponents = context.componentKit?.runtimeDefinitions ?? REACT_RUNTIME_COMPONENTS;
  if (!packageContext.frameworks.includes("React")) {
    return {
      enabled: false,
      framework: null,
      generated: 0,
      mapped: 0,
      mappings: new Map(),
      exports: [],
      components: runtimeComponents,
      warnings,
    };
  }

  if (runtimeComponents.length === 0) {
    return {
      enabled: false,
      framework: "react",
      generated: 0,
      mapped: 0,
      mappings: new Map(),
      exports: [],
      components: [],
      warnings,
    };
  }

  const sourceFiles = await walkSourceFiles(context.projectRoot, context.outputRoot);
  const mappings = new Map();
  for (const definition of runtimeComponents.filter((candidate) => REACT_COMPONENTS.includes(candidate))) {
    for (const file of sourceFiles) {
      if (!COMPONENT_EXTENSIONS.has(extname(file).toLowerCase())) continue;
      if (basename(file, extname(file)).toLowerCase() !== definition.exportName.toLowerCase()) continue;
      let source;
      try {
        source = await readFile(file, "utf8");
      } catch {
        continue;
      }
      if (!exportedComponent(source, definition.exportName)) continue;
      mappings.set(definition.exportName, {
        absolutePath: file,
        manifestPath: toPosixPath(relative(context.outputRoot, file)),
        projectPath: toPosixPath(relative(context.projectRoot, file)),
      });
      break;
    }
  }

  const barrelDirectory = join(context.outputRoot, "runtime/react/src");
  const exports = runtimeComponents.flatMap((definition) => {
    const mapping = mappings.get(definition.exportName);
    if (mapping) {
      return [`export { ${definition.exportName} } from "${importSpecifier(barrelDirectory, mapping.absolutePath)}";`];
    }
    const typeExports = definition.typeExports ?? [`${definition.exportName}Props`];
    return [
      `export { ${runtimeExportNames(definition).join(", ")} } from "./${definition.exportName}";`,
      `export type { ${typeExports.join(", ")} } from "./${definition.exportName}";`,
    ];
  });

  return {
    enabled: true,
    framework: "react",
    generated: runtimeComponents.length - mappings.size,
    mapped: mappings.size,
    mappings,
    exports,
    components: runtimeComponents,
    warnings,
  };
}

function publicAction(action, outputRoot) {
  return {
    path: toPosixPath(relative(outputRoot, resolve(outputRoot, action.destination))),
    action: action.action,
    reason: action.reason,
    ...(action.userManaged ? { userManaged: true } : {}),
  };
}

function summarize(actions) {
  const summary = { create: 0, update: 0, preserve: 0, conflict: 0 };
  for (const action of actions) summary[action.action] += 1;
  return summary;
}

async function removeCreatedDirectories(projectRoot, destinations) {
  const directories = [...new Set(destinations.map((path) => dirname(path)))]
    .sort((left, right) => right.length - left.length);
  for (const start of directories) {
    let current = start;
    while (isInside(projectRoot, current)) {
      try {
        await rmdir(current);
      } catch (error) {
        if (["ENOENT", "ENOTEMPTY", "EEXIST"].includes(error.code)) break;
        throw error;
      }
      current = dirname(current);
    }
  }
}

let atomicTemporarySequence = 0;

async function writeSyncedFile(path, content) {
  let handle;
  try {
    handle = await open(path, "wx");
    await handle.writeFile(content, typeof content === "string" ? "utf8" : undefined);
    await handle.sync();
  } finally {
    await handle?.close();
  }
}

async function writeAtomicJson(path, value) {
  const temporaryPath = join(dirname(path), `.journal-${process.pid}-${atomicTemporarySequence += 1}.tmp`);
  try {
    await writeSyncedFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

async function installSyncedContent({ destination, content, temporaryPath, beforeInstall }) {
  await writeSyncedFile(temporaryPath, content);
  await beforeInstall?.();
  await rename(temporaryPath, destination);
}

async function assertTransactionExpectedState(destination, operation, phase) {
  const kind = await pathKind(destination);
  if (kind !== operation.expectedKind) {
    throw new Error(`transaction target changed ${phase}: ${operation.destination}; expected ${operation.expectedKind}, found ${kind}`);
  }
  if (kind === "file") {
    const currentHash = digest(await readFile(destination));
    if (currentHash !== operation.expectedHash) {
      throw new Error(`transaction target changed ${phase}: ${operation.destination}; expected hash ${operation.expectedHash}, found ${currentHash}`);
    }
  }
}

async function readTransactionJournal(transactionRoot) {
  const journalPath = join(transactionRoot, "journal.json");
  let journal;
  try {
    const info = await lstat(journalPath);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error("journal is not an ordinary file");
    journal = JSON.parse((await readFile(journalPath, "utf8")).replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new Error(`transaction recovery diagnostic retained at ${transactionRoot}: ${error.message}`);
  }
  if (journal?.schemaVersion !== 2 || !Array.isArray(journal.operations)
    || !new Set(["staging", "committing", "committed"]).has(journal.status)
    || typeof journal.projectRoot !== "string" || typeof journal.outputRoot !== "string") {
    throw new Error(`transaction recovery diagnostic retained at ${transactionRoot}: journal contract is invalid`);
  }
  for (const record of journal.operations) {
    const destination = typeof record?.destination === "string"
      ? resolve(journal.outputRoot, ...record.destination.split("/"))
      : null;
    const stagedPath = typeof record?.stagedPath === "string" ? resolve(transactionRoot, record.stagedPath) : null;
    const backupPath = record?.backupPath === null || typeof record?.backupPath === "string"
      ? (record.backupPath === null ? null : resolve(transactionRoot, record.backupPath))
      : undefined;
    if (!destination || record.destination.includes("\\") || !isInsideOrEqual(resolve(journal.outputRoot), destination)
      || !stagedPath || !isInsideOrEqual(transactionRoot, stagedPath)
      || backupPath === undefined || (backupPath && !isInsideOrEqual(transactionRoot, backupPath))
      || !new Set(["staging", "staged", "installing", "committed"]).has(record.phase)
      || record.committed !== (record.phase === "committed")
      || !new Set(["missing", "file"]).has(record.expectedKind)
      || !/^[a-f0-9]{64}$/.test(record.committedHash ?? "")
      || (record.expectedKind === "file" && !/^[a-f0-9]{64}$/.test(record.expectedHash ?? ""))
      || (record.expectedKind === "missing" && record.expectedHash !== null)) {
      throw new Error(`transaction recovery diagnostic retained at ${transactionRoot}: operation contract is invalid`);
    }
  }
  if (journal.status === "committed" && journal.operations.some((record) => record.phase !== "committed")) {
    throw new Error(`transaction recovery diagnostic retained at ${transactionRoot}: committed journal has incomplete operations`);
  }
  if (journal.status === "staging" && journal.operations.some((record) => !["staging", "staged"].includes(record.phase))) {
    throw new Error(`transaction recovery diagnostic retained at ${transactionRoot}: staging journal has installed operations`);
  }
  return { journal, journalPath };
}

async function restoreBackupAtomically(transactionRoot, record, destination) {
  const backupPath = resolve(transactionRoot, record.backupPath);
  const backupInfo = await lstat(backupPath);
  const canonicalBackup = await realpath(backupPath);
  if (!backupInfo.isFile() || backupInfo.isSymbolicLink() || !isInsideOrEqual(transactionRoot, canonicalBackup)) {
    throw new Error(`transaction backup is not an ordinary contained file for ${record.destination}`);
  }
  const backup = await readFile(canonicalBackup);
  if (digest(backup) !== record.expectedHash) throw new Error(`transaction backup hash is invalid for ${record.destination}`);
  const restoreRoot = join(transactionRoot, "restore");
  await mkdir(restoreRoot, { recursive: true });
  const restorePath = join(restoreRoot, `${String(record.index).padStart(4, "0")}.restore`);
  await installSyncedContent({ destination, content: backup, temporaryPath: restorePath });
  const restoredHash = digest(await readFile(destination));
  if (restoredHash !== record.expectedHash) throw new Error(`transaction restore hash verification failed for ${record.destination}`);
}

async function recoverTransaction({ projectRoot, outputRoot, transactionRoot, journal }) {
  const conflicts = [];
  const createDestinations = [];
  if (journal.status === "committed") {
    for (const record of journal.operations) {
      const destination = resolve(outputRoot, record.destination);
      await assertSafeProjectPath(projectRoot, destination, `committed transaction recovery target ${record.destination}`);
      const kind = await pathKind(destination);
      const currentHash = kind === "file" ? digest(await readFile(destination)) : null;
      if (kind !== "file" || currentHash !== record.committedHash) {
        conflicts.push(`committed transaction target ${record.destination} is ${kind === "file" ? currentHash : kind}, expected ${record.committedHash}`);
      }
    }
  } else {
    for (const record of [...journal.operations].reverse()) {
      const destination = resolve(outputRoot, record.destination);
      try {
        await assertSafeProjectPath(projectRoot, destination, `transaction recovery target ${record.destination}`);
        if (record.phase === "staging" || record.phase === "staged") {
          const untouchedKind = await pathKind(destination);
          if (!["missing", "file"].includes(untouchedKind)) {
            conflicts.push(`${record.phase} transaction target ${record.destination} is not an ordinary file or missing (${untouchedKind})`);
          }
          continue;
        }
        const kind = await pathKind(destination);
        const currentHash = kind === "file" ? digest(await readFile(destination)) : null;
        const preInstallState = record.expectedKind === "missing"
          ? kind === "missing"
          : kind === "file" && currentHash === record.expectedHash;
        const installedState = kind === "file" && currentHash === record.committedHash;
        if (record.phase === "installing" && preInstallState) continue;
        if (["installing", "committed"].includes(record.phase) && installedState) {
          if (record.expectedKind === "missing") {
            await rm(destination, { force: true });
            createDestinations.push(destination);
          } else {
            await restoreBackupAtomically(transactionRoot, record, destination);
          }
          continue;
        }
        conflicts.push(`${record.phase} transaction target ${record.destination} contains concurrent user bytes (${kind === "file" ? currentHash : kind})`);
      } catch (error) {
        conflicts.push(`${record.destination}: ${error.message}`);
      }
    }
  }
  if (conflicts.length > 0) {
    throw new Error(`transaction recovery conflict preserved user content and retained diagnostic evidence at ${transactionRoot}: ${conflicts.join("; ")}`);
  }
  await removeCreatedDirectories(projectRoot, createDestinations);
  await rm(transactionRoot, { recursive: true, force: true });
}

async function recoverOrphanTransactions(projectRoot, outputRoot) {
  const entries = await readdir(projectRoot, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (!entry.name.startsWith(".design-consultant-transaction-")) continue;
    const transactionRoot = join(projectRoot, entry.name);
    if (!entry.isDirectory()) throw new Error(`transaction recovery diagnostic is not an ordinary directory: ${transactionRoot}`);
    const { journal } = await readTransactionJournal(transactionRoot);
    if (resolve(journal.projectRoot) !== resolve(projectRoot)) {
      throw new Error(`transaction recovery diagnostic retained at ${transactionRoot}: project root mismatch`);
    }
    if (resolve(journal.outputRoot) !== resolve(outputRoot)) continue;
    await recoverTransaction({ projectRoot, outputRoot, transactionRoot, journal });
  }
}

async function commitManagedTransaction({ projectRoot, outputRoot, operations, hooks = {} }) {
  if (operations.length === 0) return;
  const transactionRoot = await mkdtemp(join(projectRoot, ".design-consultant-transaction-"));
  const stagedRoot = join(transactionRoot, "staged");
  const backupRoot = join(transactionRoot, "backups");
  const journalPath = join(transactionRoot, "journal.json");
  const ordered = [...operations].sort((left, right) => (
    Number(left.destination === LOCK_FILE) - Number(right.destination === LOCK_FILE)
    || (left.destination < right.destination ? -1 : left.destination > right.destination ? 1 : 0)
  ));
  const journal = {
    schemaVersion: 2,
    status: "staging",
    projectRoot,
    outputRoot,
    operations: [],
  };
  let preserveForCrashRecovery = false;
  async function invokeCrashHook(event) {
    if (!hooks.crashAtPhase) return;
    try {
      await hooks.crashAtPhase(event);
    } catch (error) {
      preserveForCrashRecovery = true;
      throw error;
    }
  }
  try {
    await assertSafeProjectPath(projectRoot, transactionRoot, "transaction staging path");
    await mkdir(stagedRoot, { recursive: true });
    await mkdir(backupRoot, { recursive: true });
    await writeAtomicJson(journalPath, journal);
    for (const [index, operation] of ordered.entries()) {
      const destination = resolve(outputRoot, operation.destination);
      await assertSafeProjectPath(projectRoot, destination, `transaction staging target ${operation.destination}`);
      if (!new Set(["missing", "file"]).has(operation.expectedKind)
        || (operation.expectedKind === "file" && typeof operation.expectedHash !== "string")
        || (operation.expectedKind === "missing" && operation.expectedHash !== null)) {
        throw new Error(`transaction operation lacks an exact expected state: ${operation.destination}`);
      }
      await assertTransactionExpectedState(destination, operation, "before staging");
      const stagedPath = join(stagedRoot, `${String(index).padStart(4, "0")}.content`);
      const backupPath = join(backupRoot, `${String(index).padStart(4, "0")}.backup`);
      const record = {
        index,
        destination: operation.destination,
        action: operation.expectedKind === "file" ? "update" : "create",
        expectedKind: operation.expectedKind,
        expectedHash: operation.expectedHash,
        committedHash: digest(operation.content),
        stagedPath: relative(transactionRoot, stagedPath),
        backupPath: operation.expectedKind === "file" ? relative(transactionRoot, backupPath) : null,
        phase: "staging",
        committed: false,
      };
      journal.operations.push(record);
      await writeAtomicJson(journalPath, journal);
      await writeSyncedFile(stagedPath, operation.content);
      if (operation.expectedKind === "file") {
        const backup = await readFile(destination);
        const backupHash = digest(backup);
        if (backupHash !== operation.expectedHash) {
          throw new Error(`transaction target changed during backup: ${operation.destination}; expected hash ${operation.expectedHash}, found ${backupHash}`);
        }
        await writeSyncedFile(backupPath, backup);
      }
      record.phase = "staged";
      await writeAtomicJson(journalPath, journal);
      await invokeCrashHook({ index, destination: operation.destination, action: record.action, phase: "staged", installed: false });
    }
    journal.status = "committing";
    await writeAtomicJson(journalPath, journal);
    for (const [index, operation] of ordered.entries()) {
      const record = journal.operations[index];
      const destination = resolve(outputRoot, operation.destination);
      await hooks.beforeCommit?.({ index, destination: operation.destination, action: record.action });
      await assertSafeProjectPath(projectRoot, destination, `transaction commit target ${operation.destination}`);
      await mkdir(dirname(destination), { recursive: true });
      await assertTransactionExpectedState(destination, operation, "immediately before commit");
      if (digest(await readFile(resolve(transactionRoot, record.stagedPath))) !== record.committedHash) {
        throw new Error(`transaction staged content hash changed before commit: ${operation.destination}`);
      }
      record.phase = "installing";
      await writeAtomicJson(journalPath, journal);
      await invokeCrashHook({ index, destination: operation.destination, action: record.action, phase: "installing", installed: false });
      await hooks.beforeInstall?.({ index, destination: operation.destination, action: record.action });
      await assertSafeProjectPath(projectRoot, destination, `transaction final install target ${operation.destination}`);
      await assertTransactionExpectedState(destination, operation, "immediately before atomic install");
      await rename(resolve(transactionRoot, record.stagedPath), destination);
      const installedKind = await pathKind(destination);
      const installedHash = installedKind === "file" ? digest(await readFile(destination)) : null;
      if (installedKind !== "file" || installedHash !== record.committedHash) {
        throw new Error(`transaction final hash verification failed for ${operation.destination}`);
      }
      await invokeCrashHook({ index, destination: operation.destination, action: record.action, phase: "installing", installed: true });
      record.phase = "committed";
      record.committed = true;
      await writeAtomicJson(journalPath, journal);
      await hooks.afterCommit?.({ index, destination: operation.destination, action: record.action });
      if (hooks.crashAfterCommit) {
        try {
          await hooks.crashAfterCommit({ index, destination: operation.destination, action: record.action });
        } catch (error) {
          preserveForCrashRecovery = true;
          throw error;
        }
      }
    }
    journal.status = "committed";
    await writeAtomicJson(journalPath, journal);
    await invokeCrashHook({ destination: null, action: null, phase: "transaction-committed", installed: true });
  } catch (error) {
    if (preserveForCrashRecovery) throw error;
    try {
      await recoverTransaction({ projectRoot, outputRoot, transactionRoot, journal });
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], `transaction failed and rollback was incomplete; diagnostic evidence was retained: ${error.message}; ${rollbackError.message}`);
    }
    throw error;
  }
  await rm(transactionRoot, { recursive: true, force: true });
}

function exactLegacyV09Sources(lock) {
  const baseSources = LEGACY_V09_BASE_SOURCES;
  const reactSources = { ...baseSources, ...LEGACY_V09_REACT_SOURCES };
  const actualPaths = Object.keys(lock.files ?? {}).sort();
  const variants = [
    { id: "core", sources: baseSources },
    { id: "react", sources: reactSources },
  ];
  const variant = variants.find(({ sources }) => {
    const expectedPaths = Object.keys(sources).sort();
    return actualPaths.length === expectedPaths.length
      && actualPaths.every((path, index) => path === expectedPaths[index]);
  });
  if (!variant) {
    throw new AdoptionValidationError("legacy v0.9 lock has a partial or unknown managed file set; migration requires an exact v0.9 init layout.");
  }
  return variant;
}

function validateLegacyV09LockShape(lock) {
  if (!lock) throw new AdoptionValidationError("legacy-lock migration requires an existing v0.9 lock.");
  const expectedTopLevel = ["createdAt", "files", "output", "schemaVersion", "skill", "skillVersion", "updatedAt"];
  if (Object.keys(lock).sort().join(",") !== expectedTopLevel.sort().join(",")
    || lock.schemaVersion !== 1
    || lock.skill !== "design-consultant"
    || lock.skillVersion !== "0.9.0"
    || typeof lock.createdAt !== "string"
    || !Number.isFinite(Date.parse(lock.createdAt))
    || typeof lock.updatedAt !== "string"
    || !Number.isFinite(Date.parse(lock.updatedAt))
    || !lock.files
    || typeof lock.files !== "object"
    || Array.isArray(lock.files)) {
    throw new AdoptionValidationError("legacy v0.9 lock shape or provenance is not the exact schema emitted by v0.9 init.");
  }
  const variant = exactLegacyV09Sources(lock);
  const manifest = [];
  for (const path of Object.keys(variant.sources).sort()) {
    const entry = lock.files[path];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)
      || Object.keys(entry).sort().join(",") !== "generatedHash,source,templateHash"
      || entry.source !== variant.sources[path]
      || !/^[a-f0-9]{64}$/.test(entry.generatedHash ?? "")
      || (entry.source.startsWith("generated:")
        ? entry.templateHash !== null
        : !/^[a-f0-9]{64}$/.test(entry.templateHash ?? ""))) {
      throw new AdoptionValidationError(`legacy v0.9 lock source/provenance is forged or invalid: ${path}.`);
    }
    manifest.push({ path, source: entry.source, templateHash: entry.templateHash });
  }
  if (digest(JSON.stringify(manifest)) !== LEGACY_V09_MANIFEST_DIGESTS[variant.id]) {
    throw new AdoptionValidationError("legacy v0.9 lock template provenance does not match the trusted 3ae3d3cb init manifest.");
  }
  return variant;
}

async function migrateLegacyV09Lock({ projectRoot, outputRoot, lock, dryRun, hooks }) {
  const variant = validateLegacyV09LockShape(lock);
  for (const path of Object.keys(variant.sources).sort()) {
    const state = await inspectUpdatePreflightPath(
      projectRoot,
      outputRoot,
      join(outputRoot, path),
      `legacy v0.9 managed destination ${path}`,
      "file",
    );
    const currentHash = digest(await readFile(state.realPath));
    if (currentHash !== lock.files[path].generatedHash) {
      throw new AdoptionValidationError(`legacy v0.9 managed destination drift/hash mismatch: ${path}.`);
    }
  }

  const verifiedFiles = Object.keys(variant.sources).length;
  const workflowProvenance = {
    schemaVersion: 1,
    type: "greenfield-init",
    skillVersion: VERSION,
    origin: "legacy-lock-migration",
    legacySkillVersion: lock.skillVersion,
    legacyBaseCommit: LEGACY_V09_BASE_COMMIT,
    verifiedFiles,
  };
  const nextLock = {
    ...lock,
    workflow: "greenfield",
    workflowProvenance,
  };
  if (!dryRun) {
    await commitManagedTransaction({
      projectRoot,
      outputRoot,
      operations: [{
        destination: LOCK_FILE,
        content: `${JSON.stringify(nextLock, null, 2)}\n`,
        expectedKind: "file",
        expectedHash: lock.__currentHash,
      }],
      hooks,
    });
  }
  return {
    ok: true,
    command: "migrate-lock",
    dryRun,
    projectRoot,
    outputRoot,
    verifiedFiles,
    actions: [{
      path: LOCK_FILE,
      action: "update",
      reason: "verified exact v0.9 managed state and added greenfield workflow provenance only",
    }],
  };
}

export async function run(options, hooks = {}) {
  const requestedProjectRoot = resolve(options.target);
  if ((await pathKind(requestedProjectRoot)) !== "directory") {
    throw new Error(`目标项目目录不存在：${requestedProjectRoot}`);
  }
  const projectRoot = await realpath(requestedProjectRoot);

  const outputRoot = resolve(projectRoot, options.output);
  if (!isInside(projectRoot, outputRoot)) {
    throw new Error("--output 必须位于目标项目目录内，且不能直接指向项目根目录。");
  }
  await assertSafeProjectPath(projectRoot, outputRoot, "输出路径");
  if ((await pathKind(outputRoot)) === "file") {
    throw new Error(`输出路径已存在且是文件：${outputRoot}`);
  }
  await recoverOrphanTransactions(projectRoot, outputRoot);

  const lockPath = join(outputRoot, LOCK_FILE);
  await assertSafeProjectPath(projectRoot, lockPath, "锁文件路径");
  const lock = await readLock(lockPath);
  if (lock && lock.output !== toPosixPath(relative(projectRoot, outputRoot))) {
    throw new AdoptionValidationError("lock.output does not match the exact managed output root.");
  }
  if (options.command === "migrate-lock") {
    return migrateLegacyV09Lock({
      projectRoot,
      outputRoot,
      lock,
      dryRun: options.dryRun,
      hooks,
    });
  }
  const plannedLockKind = lock ? "file" : "missing";
  let existingConfig;
  if (options.command === "update") {
    existingConfig = await readExistingSystemConfig(outputRoot, projectRoot);
  }
  const updateWorkflow = options.command === "update"
    ? await validatedUpdateWorkflow(projectRoot, outputRoot, lock, existingConfig)
    : null;
  const adoption = options.command === "adopt"
    || (options.command === "update" && updateWorkflow === "existing-system-adoption" && lock?.adoption?.status === "confirmed")
    ? await loadConfirmedAdoptionPlan(projectRoot, outputRoot, {
        lock,
        requireBinding: options.command === "update",
      })
    : null;
  if (adoption) {
    const derivedProjectIdentity = deriveProjectIdentity(adoption.extraction);
    if (lock?.adoption?.projectIdentity !== undefined
      && checkedManagedProjectIdentity(lock.adoption.projectIdentity) !== derivedProjectIdentity) {
      throw new AdoptionValidationError("confirmed adoption projectIdentity differs from the stable confirmed inventory facts");
    }
    adoption.projectIdentity = derivedProjectIdentity;
  }
  const adoptionArtifacts = adoption
    ? await inspectAdoptionDynamicArtifacts({ projectRoot, outputRoot, lock, plan: adoption.plan })
    : null;

  if (existingConfig === undefined) {
    await assertSafeProjectPath(projectRoot, join(outputRoot, "system.config.json"), "视觉系统配置路径");
    existingConfig = await readExistingSystemConfig(outputRoot);
  }
  const effectiveMode = options.mode ?? existingConfig?.mode ?? "default";
  if (!VALID_MODES.has(effectiveMode)) {
    throw new Error(`现有 system.config.json 包含无效模式：${effectiveMode}`);
  }
  const existingProjectName = existingConfig?.project?.name;
  const workflow = options.command === "extract"
    ? "existing-system-adoption"
    : options.command === "init"
      ? "greenfield"
      : options.command === "update"
        ? updateWorkflow
        : lock?.workflow;

  const context = {
    ...options,
    projectRoot,
    outputRoot,
    mode: effectiveMode,
    projectName: options.projectName || existingProjectName || basename(projectRoot),
    projectIdentity: adoption?.projectIdentity ?? null,
    strategy: adoption?.plan.strategy ?? null,
    adoption,
    workflow,
  };
  context.componentKit = workflow === "greenfield"
    ? await resolveComponentKit(options, existingConfig)
    : null;
  const inspectRuntime = options.command === "init" || (options.command === "update" && workflow === "greenfield");
  context.reactRuntime = adoption
    ? {
        enabled: adoption.componentRuntime.enabled,
        framework: adoption.componentRuntime.framework,
        generated: adoption.componentRuntime.generatedComponents.length,
        mapped: adoption.componentRuntime.directComponents.length
          + adoption.componentRuntime.adapters.length
          + adoption.componentRuntime.manualComponents.length,
        mappings: new Map(),
        exports: [],
        components: [],
        warnings: [],
      }
    : !inspectRuntime
    ? {
        enabled: false,
        framework: null,
        generated: 0,
        mapped: 0,
        mappings: new Map(),
        exports: [],
        components: context.componentKit?.runtimeDefinitions ?? [],
        warnings: [],
      }
    : await inspectReactRuntime(context);
  const items = await loadTemplateItems(context);
  await addAdoptionTokenItems(items, context, adoption);
  await addAdoptionComponentItems(items, context, adoption);
  await addAdoptionSharedItems(items, context, adoption);

  let adoptionIssues = null;
  if (adoption) {
    const baselineRelativePath = adoptionArtifacts.baselineRelativePath;
    const scan = await collectUiContractIssues(projectRoot);
    const baselineState = adoptionArtifacts[baselineRelativePath];
    const baseline = adoptionArtifacts.initial ? createBaseline(scan.issues) : baselineState.value;
    const baselineContent = adoptionArtifacts.initial
      ? `${JSON.stringify(baseline, null, 2)}\n`
      : baselineState.raw;
    const classified = classifyIssues(scan.issues, baseline);
    adoptionIssues = {
      ...scan,
      ...classified,
    };
    items.push(generatedItem({
      source: UI_CONTRACT_BASELINE_SOURCE,
      destination: baselineRelativePath,
      content: baselineContent,
      provenance: UI_CONTRACT_BASELINE_PROVENANCE,
      updateStrategy: "managed",
      requiredAdoptionArtifact: true,
    }));
    const migrationPlan = renderMigrationPlan({ plan: adoption.plan, compatibility: adoption.compatibility, adoptionIssues });
    items.push(generatedItem({
      source: MIGRATION_PLAN_SOURCE,
      destination: "migration/plan.md",
      content: migrationPlan,
      provenance: MIGRATION_PLAN_PROVENANCE,
      updateStrategy: "managed",
      requiredAdoptionArtifact: true,
    }));
  }

  let extractionReport = null;
  let compatibilityReport = null;
  if (options.command === "extract") {
    extractionReport = await collectSystemInventory({ projectRoot, outputRoot });
    extractionReport.project.name = context.projectName;
    extractionReport.inventoryDigest = computeInventoryDigest(extractionReport);
    const aliases = await readJson(resolve(SKILL_ROOT, "templates/adoption-component-aliases.json"));
    compatibilityReport = evaluateCompatibility(extractionReport, aliases);
    const adoptionPlan = createDraftAdoptionPlan(compatibilityReport);
    items.push(generatedItem({
      source: "generated:project-extraction",
      destination: "intake/extraction-report.json",
      content: `${JSON.stringify(extractionReport, null, 2)}\n`,
      updateStrategy: "managed",
    }));
    items.push(generatedItem({
      source: "generated:compatibility-analysis",
      destination: "adoption/compatibility-report.json",
      content: `${JSON.stringify(compatibilityReport, null, 2)}\n`,
      updateStrategy: "managed",
    }));
    items.push(generatedItem({
      source: "generated:draft-adoption-plan",
      destination: "adoption/adoption-plan.json",
      content: `${JSON.stringify(adoptionPlan, null, 2)}\n`,
      updateStrategy: "create-only",
    }));
  }

  assertUniqueItemDestinations(items);
  for (const item of items) {
    await assertSafeProjectPath(projectRoot, resolve(outputRoot, item.destination), `目标路径 ${item.destination}`);
  }
  const actions = [];
  for (const item of items) actions.push(await buildAction(item, outputRoot, lock));
  const blockedAdoptionArtifacts = actions.filter((action) => action.requiredAdoptionArtifact && (action.action === "conflict" || action.userManaged));
  if (blockedAdoptionArtifacts.length > 0) {
    throw new AdoptionValidationError(`adoption artifacts cannot be updated safely: ${blockedAdoptionArtifacts.map((item) => item.destination).join(", ")}`);
  }
  const hasConflict = actions.some((action) => action.action === "conflict");

  const nextFiles = { ...(lock?.files ?? {}) };
  let adopted = false;
  for (const action of actions) {
    if (["create", "update"].includes(action.action) || (action.action === "preserve" && action.adopt)) {
      nextFiles[action.destination] = {
        source: action.source,
        generatedHash: action.generatedHash,
        templateHash: action.templateHash,
        ...(action.provenance ? { provenance: action.provenance } : {}),
      };
      if (action.adopt) adopted = true;
    }
  }
  if (adoption) {
    nextFiles[adoption.planBinding.path] = {
      source: ADOPTION_MARKER_SOURCES[adoption.planBinding.path],
      generatedHash: adoption.planBinding.digest,
      templateHash: null,
    };
  }

  const contentChanges = actions.some((action) => ["create", "update"].includes(action.action));
  const nextAdoption = adoption
    ? {
        status: "confirmed",
        strategy: adoption.plan.strategy,
        inventoryDigest: adoption.plan.inventoryDigest,
        projectIdentity: adoption.projectIdentity,
        plan: adoption.planBinding,
      }
    : lock?.adoption;
  const adoptionChanged = JSON.stringify(nextAdoption ?? null) !== JSON.stringify(lock?.adoption ?? null);
  const nextWorkflowProvenance = workflow === "greenfield"
    ? (options.command === "init" ? GREENFIELD_INIT_PROVENANCE : lock?.workflowProvenance)
    : null;
  const workflowProvenanceChanged = JSON.stringify(nextWorkflowProvenance ?? null) !== JSON.stringify(lock?.workflowProvenance ?? null);
  const workflowChanged = lock?.workflow !== workflow;
  const lockKind = plannedLockKind;
  const lockNeedsWrite = !hasConflict && (lockKind === "missing" || contentChanges || adopted || adoptionChanged || workflowChanged || workflowProvenanceChanged);
  const lockAction = {
    destination: LOCK_FILE,
    action: lockNeedsWrite ? (lockKind === "missing" ? "create" : "update") : "preserve",
    reason: adoptionChanged
      ? "记录已确认的采用计划元数据"
      : lockNeedsWrite ? "记录脚手架文件指纹" : "文件指纹没有变化",
  };
  const allPublicActions = [...actions.map((action) => publicAction(action, outputRoot)), publicAction(lockAction, outputRoot)];
  const migrationNotes = [];
  if (
    options.command === "extract"
    && lock?.skillVersion?.startsWith("0.9")
    && ["tokens/tokens.json", "runtime/react/src/Button.tsx"].some((path) => lock.files?.[path])
  ) {
    migrationNotes.push("检测到 v0.9 extract/init 生成的默认 token 或 runtime 文件；v0.10 extract 不再管理这些旧文件，请在确认采用计划后再处理。");
  }

  if (!options.dryRun && !hasConflict) {
    const operations = actions
      .filter((action) => ["create", "update"].includes(action.action))
      .map((action) => ({
        destination: action.destination,
        content: action.content,
        expectedKind: action.expectedKind,
        expectedHash: action.currentHash,
      }));
    if (lockNeedsWrite) {
      const now = new Date().toISOString();
      const nextLock = {
        schemaVersion: 1,
        skill: "design-consultant",
        skillVersion: VERSION,
        createdAt: lock?.createdAt ?? now,
        updatedAt: now,
        output: toPosixPath(relative(projectRoot, outputRoot)),
        workflow,
        ...(nextWorkflowProvenance ? { workflowProvenance: nextWorkflowProvenance } : {}),
        ...(nextAdoption ? { adoption: nextAdoption } : {}),
        files: nextFiles,
      };
      operations.push({
        destination: LOCK_FILE,
        content: `${JSON.stringify(nextLock, null, 2)}\n`,
        expectedKind: lockKind,
        expectedHash: lockKind === "file" ? lock.__currentHash : null,
      });
    }
    await commitManagedTransaction({ projectRoot, outputRoot, operations, hooks });
  }

  const result = {
    ok: !hasConflict,
    command: options.command,
    dryRun: options.dryRun,
    projectRoot,
    outputRoot,
    mode: context.mode,
    ...(adoption ? { strategy: adoption.plan.strategy } : {}),
    runtime: {
      framework: context.reactRuntime.framework,
      generated: context.reactRuntime.generated,
      mapped: context.reactRuntime.mapped,
      warnings: context.reactRuntime.warnings,
    },
    ...(context.componentKit
      ? {
          kit: {
            profile: context.componentKit.profile,
            selectionSource: context.componentKit.selectionSource,
            requestedComponentIds: context.componentKit.requestedComponentIds,
            dependencyAddedComponentIds: context.componentKit.dependencyAddedComponentIds,
            componentIds: context.componentKit.componentIds,
          },
        }
      : {}),
    summary: summarize(allPublicActions),
    actions: allPublicActions,
    created: allPublicActions.filter((action) => action.action === "create").map((action) => action.path),
    updated: allPublicActions.filter((action) => action.action === "update").map((action) => action.path),
    migrationNotes,
    ...(extractionReport
      ? {
          extraction: {
            frameworks: extractionReport.detected.frameworks,
            sharedComponentDirectories: extractionReport.detected.sharedComponentDirectories.map((item) => item.path),
            cssCustomPropertyCount: extractionReport.detected.cssCustomProperties.count,
            warnings: extractionReport.warnings,
            inventoryDigest: extractionReport.inventoryDigest,
            recommendation: compatibilityReport.recommendation,
          },
        }
      : {}),
  };

  return result;
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(usage());
      return;
    }
    const result = await run(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 2;
  } catch (error) {
    process.stderr.write(`错误：${error.message}\n`);
    process.exitCode = error.exitCode ?? 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
