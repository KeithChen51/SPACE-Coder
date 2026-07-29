import { posix, relative as pathRelative, resolve as pathResolve } from "node:path";

const SAFE_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const SAFE_PATH_SEGMENT = /^[A-Za-z0-9_$@+.,()](?:[-A-Za-z0-9_$@+.,() ]*[A-Za-z0-9_$@+.,()-])?$/;
const SAFE_SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);
const MAPPING_STRATEGIES = new Set(["direct", "wrapper", "generate", "manual", "reject"]);
const MAPPING_STATUSES = new Set(["proposed", "confirmed", "rejected"]);
const PROP_TRANSFORMS = new Set(["identity", "boolean-inverse", "event-target-value"]);

export const CANONICAL_COMPONENTS = Object.freeze([
  Object.freeze({
    id: "button",
    exportName: "Button",
    aliases: Object.freeze(["Button", "PrimaryButton"]),
    states: Object.freeze(["default", "hover", "active", "focus-visible", "disabled", "loading"]),
    props: Object.freeze([
      Object.freeze({ name: "variant", type: '"primary" | "secondary" | "ghost" | "danger"', required: false }),
      Object.freeze({ name: "loading", type: "boolean", required: false }),
      Object.freeze({ name: "children", type: "ReactNode", required: true }),
    ]),
  }),
  Object.freeze({
    id: "icon-button",
    exportName: "IconButton",
    aliases: Object.freeze(["IconButton", "ActionButton"]),
    states: Object.freeze(["default", "hover", "active", "focus-visible", "disabled", "loading"]),
    props: Object.freeze([
      Object.freeze({ name: "label", type: "string", required: true }),
      Object.freeze({ name: "variant", type: '"primary" | "secondary" | "ghost" | "danger"', required: false }),
      Object.freeze({ name: "children", type: "ReactNode", required: true }),
    ]),
  }),
  Object.freeze({
    id: "field",
    exportName: "FieldShell",
    aliases: Object.freeze(["FieldShell", "FormField", "Field"]),
    states: Object.freeze(["default", "focus", "disabled", "loading", "error", "helper"]),
    props: Object.freeze([
      Object.freeze({ name: "label", type: "ReactNode", required: true }),
      Object.freeze({ name: "description", type: "ReactNode", required: false }),
      Object.freeze({ name: "error", type: "ReactNode", required: false }),
      Object.freeze({ name: "children", type: "ReactNode", required: true }),
    ]),
  }),
  Object.freeze({
    id: "choice-field",
    exportName: "SelectField",
    aliases: Object.freeze(["SelectField", "Select", "ChoiceField"]),
    states: Object.freeze(["closed", "open", "active option", "selected", "disabled option", "read-only", "error", "empty"]),
    props: Object.freeze([
      Object.freeze({ name: "label", type: "ReactNode", required: true }),
      Object.freeze({ name: "options", type: "readonly { value: string; label: string; disabled?: boolean }[]", required: true }),
      Object.freeze({ name: "value", type: "string", required: true }),
      Object.freeze({ name: "error", type: "ReactNode", required: false }),
    ]),
  }),
  Object.freeze({
    id: "dialog",
    exportName: "Dialog",
    aliases: Object.freeze(["Dialog", "Modal"]),
    states: Object.freeze(["open", "closing", "loading", "error", "unsaved changes"]),
    props: Object.freeze([
      Object.freeze({ name: "open", type: "boolean", required: true }),
      Object.freeze({ name: "title", type: "ReactNode", required: true }),
      Object.freeze({ name: "onClose", type: "() => void", required: true }),
      Object.freeze({ name: "children", type: "ReactNode", required: true }),
    ]),
  }),
  Object.freeze({
    id: "resource-state",
    exportName: "ResourcePanel",
    aliases: Object.freeze(["ResourcePanel", "EmptyState", "StatePanel"]),
    states: Object.freeze(["loading", "empty", "error", "permission denied", "partial data"]),
    props: Object.freeze([
      Object.freeze({ name: "state", type: '"ready" | "loading" | "empty" | "error" | "permission" | "partial"', required: true }),
      Object.freeze({ name: "title", type: "ReactNode", required: true }),
      Object.freeze({ name: "children", type: "ReactNode", required: true }),
    ]),
  }),
  Object.freeze({
    id: "status",
    exportName: "StatusBadge",
    aliases: Object.freeze(["StatusBadge", "Badge", "Tag"]),
    states: Object.freeze(["success", "warning", "danger", "info", "neutral"]),
    props: Object.freeze([
      Object.freeze({ name: "tone", type: '"neutral" | "success" | "warning" | "danger" | "info"', required: true }),
      Object.freeze({ name: "children", type: "ReactNode", required: true }),
    ]),
  }),
  Object.freeze({
    id: "data-table",
    exportName: "DataTable",
    aliases: Object.freeze(["DataTable", "Table"]),
    states: Object.freeze(["loading", "empty", "error", "permission denied", "partial data"]),
    props: Object.freeze([
      Object.freeze({ name: "columns", type: "readonly unknown[]", required: true }),
      Object.freeze({ name: "rows", type: "readonly unknown[]", required: true }),
      Object.freeze({ name: "rowKey", type: "string | ((row: unknown, index: number) => string | number)", required: true }),
      Object.freeze({ name: "state", type: '"ready" | "loading" | "empty" | "error" | "permission" | "partial"', required: true }),
    ]),
  }),
]);

const COMPONENT_BY_ID = new Map(CANONICAL_COMPONENTS.map((component) => [component.id, component]));

const GENERATED_STYLE_CHUNKS = Object.freeze({
  button: `.dc-button {
  box-sizing: border-box; display: inline-flex; min-height: var(--control-height); align-items: center; justify-content: center;
  gap: var(--space-2); border: var(--border-width) solid transparent; border-radius: var(--control-radius);
  padding: 0 var(--space-4); font: 700 var(--text-table)/1 var(--font-sans); letter-spacing: 0; cursor: pointer;
}
.dc-button:focus-visible { outline: 0; box-shadow: var(--focus-ring); }
.dc-button:active:not(:disabled) { transform: translateY(1px); }
.dc-button:disabled { cursor: not-allowed; opacity: 0.55; }
.dc-button--primary { background: var(--primary); color: var(--text-inverse); }
.dc-button--primary:hover:not(:disabled) { background: var(--primary-hover); }
.dc-button--secondary { border-color: var(--border-strong); background: var(--surface); color: var(--text); }
.dc-button--secondary:hover:not(:disabled), .dc-button--ghost:hover:not(:disabled) { background: var(--surface-muted); }
.dc-button--ghost { background: transparent; color: var(--text); }
.dc-button--danger { background: var(--danger); color: var(--text-inverse); }
.dc-spinner { box-sizing: border-box; width: 14px; height: 14px; flex: 0 0 auto; border: 2px solid currentColor; border-right-color: transparent; border-radius: var(--radius-full); animation: dc-spin 0.75s linear infinite; }
@keyframes dc-spin { to { transform: rotate(360deg); } }`,
  "icon-button": `.dc-icon-button {
  box-sizing: border-box; display: inline-flex; width: var(--control-height); min-height: var(--control-height); align-items: center;
  justify-content: center; gap: var(--space-2); border: var(--border-width) solid transparent; border-radius: var(--control-radius);
  padding: 0; font: 700 var(--text-table)/1 var(--font-sans); letter-spacing: 0; cursor: pointer;
}
.dc-icon-button:focus-visible { outline: 0; box-shadow: var(--focus-ring); }
.dc-icon-button:active:not(:disabled) { transform: translateY(1px); }
.dc-icon-button:disabled { cursor: not-allowed; opacity: 0.55; }
.dc-button--primary { background: var(--primary); color: var(--text-inverse); }
.dc-button--primary:hover:not(:disabled) { background: var(--primary-hover); }
.dc-button--secondary { border-color: var(--border-strong); background: var(--surface); color: var(--text); }
.dc-button--secondary:hover:not(:disabled), .dc-button--ghost:hover:not(:disabled) { background: var(--surface-muted); }
.dc-button--ghost { background: transparent; color: var(--text); }
.dc-button--danger { background: var(--danger); color: var(--text-inverse); }
.dc-spinner { box-sizing: border-box; width: 14px; height: 14px; flex: 0 0 auto; border: 2px solid currentColor; border-right-color: transparent; border-radius: var(--radius-full); animation: dc-spin 0.75s linear infinite; }
@keyframes dc-spin { to { transform: rotate(360deg); } }`,
  field: `.dc-field-shell { box-sizing: border-box; display: grid; gap: var(--space-2); min-width: 0; color: var(--text); font-family: var(--font-sans); }
.dc-field-label { font-size: var(--text-table); font-weight: 700; }
.dc-field-description, .dc-field-error { font-size: var(--text-xs); line-height: var(--line-body); }
.dc-field-description { color: var(--text-muted); }
.dc-field-error { color: var(--danger); }
.dc-field-shell :is(input, select, textarea) { box-sizing: border-box; width: 100%; min-height: var(--control-height); border: var(--border-width) solid var(--border-strong); border-radius: var(--control-radius); padding: 0 var(--space-3); background: var(--surface); color: var(--text); font: var(--text-body)/var(--line-body) var(--font-sans); }
.dc-field-shell :is(input, select, textarea):focus-visible { outline: 0; box-shadow: var(--focus-ring); }
.dc-field-shell :is(input, select, textarea):disabled { background: var(--surface-muted); color: var(--text-muted); cursor: not-allowed; }
.dc-field-shell--error :is(input, select, textarea) { border-color: var(--danger); }`,
  "choice-field": `.dc-field-shell { box-sizing: border-box; display: grid; gap: var(--space-2); min-width: 0; color: var(--text); font-family: var(--font-sans); }
.dc-field-label { font-size: var(--text-table); font-weight: 700; }
.dc-field-required { color: var(--danger); }
.dc-field-description, .dc-field-error { font-size: var(--text-xs); line-height: var(--line-body); }
.dc-field-description { color: var(--text-muted); }
.dc-field-error { color: var(--danger); }
.dc-select { min-width: 0; }
.dc-select-trigger { box-sizing: border-box; display: flex; width: 100%; min-height: var(--control-height); align-items: center; gap: var(--space-2); border: var(--border-width) solid var(--border-strong); border-radius: var(--control-radius); padding: 0 var(--space-3); background: var(--surface); color: var(--text); cursor: pointer; font: 600 var(--text-table)/1.35 var(--font-sans); text-align: left; }
.dc-select-trigger:hover:not([data-disabled]) { background: var(--surface-muted); }
.dc-select-trigger[data-focus-visible] { outline: 0; border-color: var(--primary); box-shadow: var(--focus-ring); }
.dc-select-trigger[data-disabled] { background: var(--surface-muted); color: var(--text-muted); cursor: not-allowed; }
.dc-field-shell--error .dc-select-trigger { border-color: var(--danger); }
.dc-select-icon { width: 16px; height: 16px; flex: 0 0 16px; pointer-events: none; }
.dc-select-spinner { animation: dc-spin 0.75s linear infinite; }
.dc-select-chevron-icon { color: var(--text-muted); }
.dc-select[data-open] .dc-select-chevron-icon { transform: rotate(180deg); }
.dc-select-value { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dc-selection-popover, .dc-select-popover { width: var(--trigger-width, 320px); max-height: 320px; overflow: auto; border: var(--border-width) solid var(--border-strong); border-radius: var(--control-radius); background: var(--surface-raised); color: var(--text); box-shadow: var(--shadow-overlay); font-family: var(--font-sans); }
.dc-selection-listbox, .dc-select-listbox { display: grid; gap: 2px; padding: var(--space-1); outline: 0; }
.dc-selection-option, .dc-select-option { display: flex; min-height: 34px; align-items: center; justify-content: space-between; gap: var(--space-3); border-radius: var(--radius-md); padding: 7px var(--space-2); color: var(--text); cursor: pointer; font-size: var(--text-table); outline: 0; }
.dc-selection-option-copy { display: grid; min-width: 0; gap: 2px; }
.dc-selection-option-copy small { color: var(--text-muted); font-size: var(--text-xs); font-weight: 400; }
.dc-selection-option[data-focused] { background: var(--surface-muted); }
.dc-selection-option[data-selected] { background: var(--primary-soft); font-weight: 700; }
.dc-selection-option[data-disabled] { color: var(--text-muted); cursor: not-allowed; opacity: 0.72; }
.dc-selection-option-check { color: var(--primary); opacity: 0; }
.dc-selection-option-check[data-selected] { opacity: 1; }
.dc-selection-empty { padding: var(--space-4); color: var(--text-muted); font-size: var(--text-table); text-align: center; }
@keyframes dc-spin { to { transform: rotate(360deg); } }`,
  dialog: `.dc-dialog-backdrop { box-sizing: border-box; position: fixed; z-index: 1000; inset: 0; display: grid; place-items: center; padding: var(--space-4); background: color-mix(in srgb, var(--surface-inverse) 58%, transparent); }
.dc-dialog { box-sizing: border-box; width: min(520px, 100%); max-height: min(720px, calc(100dvh - 32px)); overflow: auto; border-radius: var(--radius-lg); background: var(--surface-raised); color: var(--text); box-shadow: var(--shadow-overlay); }
.dc-dialog-header, .dc-dialog-footer { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-4); padding: var(--space-4); }
.dc-dialog-header { border-bottom: var(--border-width) solid var(--border); }
.dc-dialog-header h2 { margin: 0; font: 700 var(--text-subtitle)/var(--line-title) var(--font-display); }
.dc-dialog-header p { margin: var(--space-1) 0 0; color: var(--text-muted); font-size: var(--text-table); }
.dc-dialog-body { padding: var(--space-4); }
.dc-dialog-footer { justify-content: flex-end; border-top: var(--border-width) solid var(--border); }
.dc-icon-button { box-sizing: border-box; display: inline-flex; width: var(--control-height); min-height: var(--control-height); align-items: center; justify-content: center; border: var(--border-width) solid transparent; border-radius: var(--control-radius); padding: 0; cursor: pointer; }
.dc-icon-button:focus-visible { outline: 0; box-shadow: var(--focus-ring); }
.dc-button--ghost { background: transparent; color: var(--text); }
.dc-button--ghost:hover:not(:disabled) { background: var(--surface-muted); }`,
  "resource-state": `.dc-resource-panel { box-sizing: border-box; display: grid; min-height: 120px; place-items: center; align-content: center; gap: var(--space-2); border: var(--border-width) dashed var(--border-strong); border-radius: var(--radius-md); padding: var(--space-5); background: var(--surface-muted); color: var(--text-muted); text-align: center; font-family: var(--font-sans); }
.dc-resource-panel strong { color: var(--text); }
.dc-resource-panel--error { border-color: var(--danger); background: var(--danger-soft); color: var(--danger); }
.dc-resource-panel--partial { border-color: var(--warning); background: var(--warning-soft); }
.dc-resource-action { margin-top: var(--space-2); }
.dc-resource-content { width: 100%; margin-top: var(--space-3); color: var(--text); text-align: left; }
.dc-spinner { box-sizing: border-box; width: 14px; height: 14px; flex: 0 0 auto; border: 2px solid currentColor; border-right-color: transparent; border-radius: var(--radius-full); animation: dc-spin 0.75s linear infinite; }
@keyframes dc-spin { to { transform: rotate(360deg); } }`,
  status: `.dc-status-badge { box-sizing: border-box; display: inline-flex; min-height: 22px; align-items: center; gap: 6px; border-radius: var(--radius-full); padding: 2px 8px; font: 700 var(--text-xs)/var(--line-body) var(--font-sans); white-space: nowrap; }
.dc-status-dot { width: 7px; height: 7px; border-radius: var(--radius-full); background: currentColor; }
.dc-status-badge--neutral { background: var(--surface-muted); color: var(--text-muted); }
.dc-status-badge--success { background: var(--success-soft); color: var(--success); }
.dc-status-badge--warning { background: var(--warning-soft); color: var(--warning); }
.dc-status-badge--danger { background: var(--danger-soft); color: var(--danger); }
.dc-status-badge--info { background: var(--info-soft); color: var(--info); }`,
  "data-table": `.dc-table-wrap { box-sizing: border-box; overflow-x: auto; border: var(--border-width) solid var(--border); border-radius: var(--radius-md); background: var(--surface); }
.dc-data-table { width: 100%; border-collapse: collapse; color: var(--text); font: var(--text-table)/var(--line-body) var(--font-sans); }
.dc-data-table caption { padding: var(--space-3) var(--space-4); color: var(--text-muted); text-align: left; }
.dc-data-table :is(th, td) { min-height: var(--control-height); border-bottom: var(--border-width) solid var(--border); padding: var(--space-3) var(--space-4); text-align: left; }
.dc-data-table th { background: var(--surface-muted); color: var(--text-muted); font-weight: 700; }
.dc-data-table tbody tr:last-child td { border-bottom: 0; }
.dc-data-table tbody tr:hover { background: var(--primary-soft); }
.dc-table-sort { display: inline-flex; width: 100%; align-items: center; gap: var(--space-2); border: 0; padding: 0; background: transparent; color: inherit; font: inherit; font-weight: inherit; cursor: pointer; }
.dc-table-sort:focus-visible { border-radius: var(--radius-md); outline: 0; box-shadow: var(--focus-ring); }
.dc-table-sort__indicator { color: var(--primary); }
.dc-align-start { text-align: left !important; }
.dc-align-center { text-align: center !important; }
.dc-align-end { text-align: right !important; font-variant-numeric: tabular-nums; }
.dc-table-notice { margin: 0; border-top: var(--border-width) solid var(--warning); padding: var(--space-2) var(--space-4); background: var(--warning-soft); color: var(--warning); font-size: var(--text-xs); }
.dc-table-selection-cell { box-sizing: border-box; width: 44px; text-align: center !important; }
.dc-table-actions-cell { width: 1%; white-space: nowrap; }
.dc-table-selection-control { position: relative; display: inline-grid; width: 20px; height: 20px; place-items: center; cursor: pointer; }
.dc-table-selection-control input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.dc-table-selection-control span { box-sizing: border-box; width: 17px; height: 17px; border: var(--border-width) solid var(--border-strong); border-radius: var(--radius-md); background: var(--surface); }
.dc-table-selection-control input[type="radio"] + span { border-radius: var(--radius-full); }
.dc-table-selection-control input:focus-visible + span { box-shadow: var(--focus-ring); }
.dc-table-selection-control input:checked + span,
.dc-table-selection-control input:indeterminate + span { border-color: var(--primary); background: var(--primary); }
.dc-table-selection-control input:checked + span::after { display: block; width: 8px; height: 4px; border: solid var(--text-inverse); border-width: 0 0 2px 2px; margin: 4px 0 0 3px; content: ""; transform: rotate(-45deg); }
.dc-table-selection-control input:indeterminate + span::after { display: block; width: 9px; height: 2px; margin: 7px 0 0 3px; background: var(--text-inverse); content: ""; }
.dc-sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; clip-path: inset(50%); }
.dc-resource-panel { box-sizing: border-box; display: grid; min-height: 120px; place-items: center; padding: var(--space-5); background: var(--surface-muted); color: var(--text-muted); text-align: center; }
.dc-resource-panel--loading, .dc-resource-panel--empty { border: var(--border-width) dashed var(--border-strong); }
.dc-resource-panel--error { border: var(--border-width) dashed var(--danger); background: var(--danger-soft); color: var(--danger); }
.dc-resource-panel--permission, .dc-resource-panel--partial { border: var(--border-width) dashed var(--warning); background: var(--warning-soft); color: var(--warning); }`,
});

const GENERATED_STYLE_FALLBACKS = Object.freeze({
  "--border": "#d8dee8",
  "--border-strong": "#aeb8c7",
  "--border-width": "1px",
  "--control-height": "40px",
  "--control-radius": "6px",
  "--danger": "#b42318",
  "--danger-soft": "#fee4e2",
  "--focus-ring": "2px solid #175cd3",
  "--font-display": "system-ui, sans-serif",
  "--font-sans": "system-ui, sans-serif",
  "--info": "#175cd3",
  "--info-soft": "#dbeafe",
  "--line-body": "1.5",
  "--line-title": "1.25",
  "--primary": "#175cd3",
  "--primary-hover": "#1849a9",
  "--primary-soft": "#eff6ff",
  "--radius-full": "9999px",
  "--radius-lg": "8px",
  "--radius-md": "6px",
  "--shadow-overlay": "0 20px 40px rgb(16 24 40 / 18%)",
  "--space-1": "4px",
  "--space-2": "8px",
  "--space-3": "12px",
  "--space-4": "16px",
  "--space-5": "20px",
  "--space-8": "32px",
  "--success": "#067647",
  "--success-soft": "#dcfae6",
  "--surface": "#ffffff",
  "--surface-inverse": "#101828",
  "--surface-muted": "#f2f4f7",
  "--surface-raised": "#ffffff",
  "--text": "#101828",
  "--text-body": "16px",
  "--text-inverse": "#ffffff",
  "--text-muted": "#475467",
  "--text-subtitle": "20px",
  "--text-table": "14px",
  "--text-xs": "12px",
  "--warning": "#b54708",
  "--warning-soft": "#fef0c7",
});

function fail(message) {
  throw new Error(`ComponentMappingV1 ${message}`);
}

function ownKeys(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value) : [];
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object.`);
}

function assertAllowedKeys(value, allowed, label) {
  const unknown = ownKeys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) fail(`${label} contains unsupported field(s): ${unknown.join(", ")}.`);
}

function assertIdentifier(value, label) {
  if (typeof value !== "string" || !SAFE_IDENTIFIER.test(value)) fail(`${label} must be a safe JavaScript identifier.`);
}

export function isSafeRelativePosixPath(value, { extensions = null } = {}) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\\") || value.includes("\0")) return false;
  if (value.startsWith("/") || /^[A-Za-z]:/.test(value) || value !== posix.normalize(value)) return false;
  const segments = value.split("/");
  if (segments.some((segment) => !SAFE_PATH_SEGMENT.test(segment))) return false;
  if (extensions && !extensions.has(posix.extname(value).toLowerCase())) return false;
  return true;
}

function isSafeRelativeImportSpecifier(value) {
  if (typeof value !== "string" || value.includes("\\") || value.includes("\0") || value.includes("//")) return false;
  if (!value.startsWith("./") && !value.startsWith("../")) return false;
  const segments = value.split("/");
  let targetStart = segments[0] === "." ? 1 : 0;
  while (segments[targetStart] === "..") targetStart += 1;
  return targetStart < segments.length && segments.slice(targetStart).every((segment) => SAFE_PATH_SEGMENT.test(segment));
}

function withoutSourceExtension(path) {
  const extension = posix.extname(path);
  return extension ? path.slice(0, -extension.length) : path;
}

function importSpecifier(fromDirectory, targetFile) {
  const target = withoutSourceExtension(targetFile);
  const relativePath = posix.relative(fromDirectory, target);
  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
}

function validateSource(source, label, { direct = false } = {}) {
  assertObject(source, label);
  assertAllowedKeys(source, new Set(["path", "exportName", ...(direct ? ["propsExport"] : [])]), label);
  if (!isSafeRelativePosixPath(source.path, { extensions: SAFE_SOURCE_EXTENSIONS })) {
    fail(`${label}.path must be a safe normalized relative POSIX React source path.`);
  }
  assertIdentifier(source.exportName, `${label}.exportName`);
  if (direct) assertIdentifier(source.propsExport, `${label}.propsExport`);
}

function validateApi(api, definition, label) {
  assertObject(api, label);
  assertAllowedKeys(api, new Set(["props"]), label);
  if (!Array.isArray(api.props) || api.props.some((prop) => typeof prop !== "string" || !SAFE_IDENTIFIER.test(prop))) {
    fail(`${label}.props must be an array of safe property names.`);
  }
  const expected = definition.props.map((prop) => prop.name).sort();
  const actual = [...new Set(api.props)].sort();
  if (actual.length !== api.props.length || JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label}.props must exactly match the ${definition.exportName} canonical API contract.`);
  }
}

function validatePropMap(propMap, definition, label) {
  if (!Array.isArray(propMap) || propMap.length === 0) fail(`${label} must be a non-empty array.`);
  const canonicalNames = new Set(definition.props.map((prop) => prop.name));
  const seenCanonical = new Set();
  const seenSource = new Set();
  for (const [index, entry] of propMap.entries()) {
    const itemLabel = `${label}[${index}]`;
    assertObject(entry, itemLabel);
    assertAllowedKeys(entry, new Set(["canonicalProp", "sourceProp", "transform"]), itemLabel);
    assertIdentifier(entry.canonicalProp, `${itemLabel}.canonicalProp`);
    assertIdentifier(entry.sourceProp, `${itemLabel}.sourceProp`);
    if (!canonicalNames.has(entry.canonicalProp)) fail(`${itemLabel}.canonicalProp is not in the ${definition.exportName} contract.`);
    if (!PROP_TRANSFORMS.has(entry.transform)) fail(`${itemLabel}.transform is not allowed.`);
    if (seenCanonical.has(entry.canonicalProp) || seenSource.has(entry.sourceProp)) fail(`${label} contains a property collision.`);
    seenCanonical.add(entry.canonicalProp);
    seenSource.add(entry.sourceProp);
    const prop = definition.props.find((item) => item.name === entry.canonicalProp);
    if (entry.transform === "boolean-inverse" && prop.type !== "boolean") {
      fail(`${itemLabel} can use boolean-inverse only with a canonical boolean property.`);
    }
  }
  const missingCanonical = definition.props.filter((prop) => !seenCanonical.has(prop.name));
  if (missingCanonical.length > 0) fail(`${label} must cover every canonical prop; missing canonical prop(s): ${missingCanonical.map((prop) => prop.name).join(", ")}.`);
}

function validateMapping(mapping, index) {
  const label = `componentMappings[${index}]`;
  assertObject(mapping, label);
  if (!MAPPING_STRATEGIES.has(mapping.strategy)) fail(`${label}.strategy is not allowed.`);
  if (!MAPPING_STATUSES.has(mapping.status)) fail(`${label}.status is not allowed.`);
  const definition = COMPONENT_BY_ID.get(mapping.component);
  if (!definition) fail(`${label}.component is not one of the eight canonical families.`);

  const common = new Set(["component", "strategy", "status"]);
  if (mapping.status === "proposed") {
    assertAllowedKeys(mapping, new Set([...common, "source"]), label);
    if (!new Set(["direct", "wrapper"]).has(mapping.strategy)) fail(`${label} proposed candidates must use direct or wrapper.`);
    validateSource(mapping.source, `${label}.source`);
    return definition;
  }
  if (mapping.status === "rejected") {
    assertAllowedKeys(mapping, new Set([...common, "source"]), label);
    if (mapping.strategy !== "reject") fail(`${label} rejected mappings must use reject.`);
    validateSource(mapping.source, `${label}.source`);
    return definition;
  }
  if (mapping.strategy === "direct") {
    assertAllowedKeys(mapping, new Set([...common, "source", "api"]), label);
    validateSource(mapping.source, `${label}.source`, { direct: true });
    if (![definition.exportName, "default"].includes(mapping.source.exportName) || mapping.source.propsExport !== `${definition.exportName}Props`) {
      fail(`${label} direct source must export ${definition.exportName} or default, plus ${definition.exportName}Props.`);
    }
    validateApi(mapping.api, definition, `${label}.api`);
  } else if (mapping.strategy === "wrapper") {
    assertAllowedKeys(mapping, new Set([...common, "source", "propMap"]), label);
    validateSource(mapping.source, `${label}.source`);
    validatePropMap(mapping.propMap, definition, `${label}.propMap`);
  } else if (mapping.strategy === "generate") {
    assertAllowedKeys(mapping, new Set([...common, "approved"]), label);
    if (mapping.approved !== true) fail(`${label} generate requires approved=true.`);
  } else if (mapping.strategy === "manual") {
    assertAllowedKeys(mapping, new Set([...common, "adapterPath"]), label);
    if (!isSafeRelativePosixPath(mapping.adapterPath, { extensions: SAFE_SOURCE_EXTENSIONS })) {
      fail(`${label}.adapterPath must be a normalized relative POSIX React source path.`);
    }
  } else {
    fail(`${label} reject cannot have confirmed status.`);
  }
  return definition;
}

function observedCandidates(inventory) {
  const observed = inventory?.detected?.reactRuntimeCandidates ?? inventory?.detected?.components ?? [];
  const candidates = [];
  for (const definition of CANONICAL_COMPONENTS) {
    for (const source of observed) {
      for (const exportName of source?.namedExports ?? []) {
        if (!definition.aliases.includes(exportName)) continue;
        candidates.push({
          component: definition.id,
          source: { path: source.path, exportName },
        });
      }
      if (source?.defaultExport === "default") {
        const fileHint = source.path?.replaceAll("\\", "/").split("/").at(-1)?.replace(/\.[^.]+$/, "");
        const familyHint = source.defaultExportLocalName || fileHint;
        if (definition.aliases.includes(familyHint)) {
          candidates.push({ component: definition.id, source: { path: source.path, exportName: "default" } });
        }
      }
    }
  }
  return candidates.sort((left, right) => (
    CANONICAL_COMPONENTS.findIndex((item) => item.id === left.component)
    - CANONICAL_COMPONENTS.findIndex((item) => item.id === right.component)
    || `${left.source.path}\0${left.source.exportName}`.localeCompare(`${right.source.path}\0${right.source.exportName}`)
  ));
}

function sourceKey(mapping) {
  return `${mapping.component}\0${mapping.source?.path ?? ""}\0${mapping.source?.exportName ?? ""}`;
}

function emptyRuntime() {
  return {
    enabled: false,
    framework: null,
    adapters: [],
    directComponents: [],
    manualComponents: [],
    generatedComponents: [],
    rejectedMappings: [],
    entries: [],
  };
}

export function buildRuntimePlan({ strategy, mappings, inventory }) {
  if (!(inventory?.detected?.frameworks ?? []).includes("React")) return emptyRuntime();
  if (inventory.evidenceLimitReached === true) fail("inventory evidence is incomplete because the extraction limit was reached; rerun a complete extract with a higher maxFiles boundary.");
  if (!new Set(["preserve", "augment", "migrate"]).has(strategy)) fail("adoption strategy is not allowed.");
  if (!Array.isArray(mappings)) fail("componentMappings must be an array.");

  const definitions = mappings.map((mapping, index) => validateMapping(mapping, index));
  if (mappings.some((mapping) => mapping.status === "proposed")) {
    fail("every candidate must be confirmed or rejected before runtime planning.");
  }

  const candidates = observedCandidates(inventory);
  const candidateKeys = new Set(candidates.map(sourceKey));
  const inventedEvidence = mappings.find((mapping) => mapping.source && !candidateKeys.has(sourceKey(mapping)));
  if (inventedEvidence) {
    fail(`mapping ${inventedEvidence.source.path}#${inventedEvidence.source.exportName} is not backed by an observed candidate.`);
  }
  const terminalKeys = new Set(mappings.filter((mapping) => mapping.source).map(sourceKey));
  const missingCandidate = candidates.find((candidate) => !terminalKeys.has(sourceKey(candidate)));
  if (missingCandidate) fail(`candidate ${missingCandidate.source.path}#${missingCandidate.source.exportName} must be confirmed or rejected.`);
  for (const candidate of candidates) {
    const decisions = mappings.filter((mapping) => mapping.source && sourceKey(mapping) === sourceKey(candidate));
    if (decisions.length !== 1) {
      fail(`candidate ${candidate.source.path}#${candidate.source.exportName} must have exactly one terminal mapping decision.`);
    }
  }

  const active = mappings
    .map((mapping, index) => ({ mapping, definition: definitions[index], index }))
    .filter(({ mapping }) => mapping.status === "confirmed");
  for (const definition of CANONICAL_COMPONENTS) {
    const family = active.filter((item) => item.definition.id === definition.id);
    if (family.length > 1) fail(`${definition.exportName} has more than one confirmed runtime mapping.`);
  }

  const sourceAssignments = new Map();
  for (const item of active.filter(({ mapping }) => mapping.source)) {
    const key = `${item.mapping.source.path}\0${item.mapping.source.exportName}`;
    if (sourceAssignments.has(key)) fail(`confirmed source ${item.mapping.source.path}#${item.mapping.source.exportName} has a collision.`);
    sourceAssignments.set(key, item.definition.id);
  }

  for (const { mapping, definition } of active.filter(({ mapping }) => mapping.strategy === "generate")) {
    if (strategy === "preserve") fail(`${definition.exportName} cannot be generated under preserve.`);
    const familyCandidates = candidates.filter((candidate) => candidate.component === definition.id);
    const rejected = new Set(mappings.filter((item) => item.status === "rejected").map(sourceKey));
    if (familyCandidates.some((candidate) => !rejected.has(sourceKey(candidate)))) {
      fail(`${definition.exportName} can be generated only after every observed candidate in the family is rejected.`);
    }
  }

  const output = inventory?.project?.output;
  if (!isSafeRelativePosixPath(output ?? "")) fail("inventory project output must be a safe relative POSIX path.");
  const runtimeDirectory = posix.join(output, "runtime/react/src");
  const adapterDirectory = posix.join(runtimeDirectory, "adapters");
  const adapters = [];
  const directComponents = [];
  const manualComponents = [];
  const generatedComponents = [];
  const entries = [];

  for (const definition of CANONICAL_COMPONENTS) {
    const item = active.find((candidate) => candidate.definition.id === definition.id);
    if (!item) continue;
    const { mapping } = item;
    if (mapping.strategy === "wrapper") {
      const adapterPath = `runtime/react/src/adapters/${definition.exportName}.tsx`;
      const adapter = {
        ...mapping,
        canonicalExport: definition.exportName,
        canonicalPropsExport: `${definition.exportName}Props`,
        canonicalProps: definition.props,
        adapterPath,
        projectAdapterPath: posix.join(output, adapterPath),
        sourceImportPath: importSpecifier(adapterDirectory, mapping.source.path),
      };
      adapters.push(adapter);
      entries.push({ ...adapter, importPath: `./adapters/${definition.exportName}` });
    } else if (mapping.strategy === "direct") {
      const direct = {
        ...mapping,
        canonicalExport: definition.exportName,
        canonicalPropsExport: `${definition.exportName}Props`,
        canonicalProps: definition.props,
        sourceImportPath: importSpecifier(runtimeDirectory, mapping.source.path),
      };
      directComponents.push(direct);
      entries.push({ ...direct, importPath: direct.sourceImportPath });
    } else if (mapping.strategy === "manual") {
      const manual = {
        ...mapping,
        canonicalExport: definition.exportName,
        canonicalPropsExport: null,
        canonicalProps: definition.props,
        sourceImportPath: importSpecifier(runtimeDirectory, mapping.adapterPath),
      };
      manualComponents.push(manual);
      entries.push({ ...manual, importPath: manual.sourceImportPath });
    } else if (mapping.strategy === "generate") {
      const generated = {
        ...mapping,
        canonicalExport: definition.exportName,
        canonicalPropsExport: `${definition.exportName}Props`,
        canonicalProps: definition.props,
        generatedPath: `runtime/react/src/${definition.exportName}.tsx`,
      };
      generatedComponents.push(generated);
      entries.push({ ...generated, importPath: `./${definition.exportName}` });
    }
  }

  return {
    enabled: entries.length > 0,
    framework: entries.length > 0 ? "react" : null,
    adapters,
    directComponents,
    manualComponents,
    generatedComponents,
    rejectedMappings: mappings.filter((mapping) => mapping.status === "rejected"),
    entries,
    candidates,
  };
}

function renderPropType(prop) {
  return `  ${prop.name}${prop.required ? "" : "?"}: ${prop.type};`;
}

function renderPropValue(entry) {
  if (entry.transform === "identity") return entry.canonicalProp;
  if (entry.transform === "boolean-inverse") return `!${entry.canonicalProp}`;
  return `(event: { target: { value: string } }) => ${entry.canonicalProp}(event.target.value)`;
}

export function renderReactAdapter(mapping) {
  assertIdentifier(mapping?.canonicalExport, "adapter canonicalExport");
  assertIdentifier(mapping?.source?.exportName, "adapter source.exportName");
  if (!isSafeRelativeImportSpecifier(mapping.sourceImportPath)) {
    fail("adapter sourceImportPath must be a generated relative import specifier.");
  }
  const definition = COMPONENT_BY_ID.get(mapping.component);
  if (!definition || mapping.canonicalExport !== definition.exportName) fail("adapter canonical export does not match its family.");
  validatePropMap(mapping.propMap, definition, "adapter propMap");
  const canonicalProps = mapping.propMap.map((entry) => entry.canonicalProp);
  const sourceProps = mapping.propMap.map((entry) => `      ${entry.sourceProp}={${renderPropValue(entry)}}`);
  const sourceLocal = `Source${definition.exportName}`;
  const sourceImport = mapping.source.exportName === "default"
    ? `import ${sourceLocal} from "${mapping.sourceImportPath}";`
    : `import { ${mapping.source.exportName} as ${sourceLocal} } from "${mapping.sourceImportPath}";`;
  return `import type { ReactNode } from "react";
${sourceImport}

export interface ${definition.exportName}Props {
${definition.props.map(renderPropType).join("\n")}
}

export function ${definition.exportName}({ ${canonicalProps.join(", ")} }: ${definition.exportName}Props) {
  return (
    <${sourceLocal}
${sourceProps.join("\n")}
    />
  );
}
`;
}

export function renderRuntimeBarrel(entries) {
  if (!Array.isArray(entries)) fail("runtime barrel entries must be an array.");
  const lines = [];
  for (const entry of entries) {
    assertIdentifier(entry.canonicalExport, "runtime barrel canonicalExport");
    if (!isSafeRelativeImportSpecifier(entry.importPath)) fail("runtime barrel importPath is unsafe.");
    const runtimeExport = entry.strategy === "direct" && entry.source?.exportName === "default"
      ? `default as ${entry.canonicalExport}`
      : entry.canonicalExport;
    lines.push(`export { ${runtimeExport} } from "${entry.importPath}";`);
    if (entry.canonicalPropsExport) {
      lines.push(`export type { ${entry.canonicalPropsExport} } from "${entry.importPath}";`);
    }
  }
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}

export function renderGeneratedComponentStyles(generatedComponents) {
  if (!Array.isArray(generatedComponents)) fail("generated component styles require an array.");
  const approved = new Set(generatedComponents.map((component) => {
    const definition = COMPONENT_BY_ID.get(component?.component);
    if (!definition || component.strategy !== "generate" || component.approved !== true) {
      fail("generated component styles may include only explicitly approved canonical families.");
    }
    return definition.id;
  }));
  const source = CANONICAL_COMPONENTS
    .filter((component) => approved.has(component.id))
    .map((component) => `/* ${component.exportName} */\n${GENERATED_STYLE_CHUNKS[component.id]}`)
    .join("\n\n")
    .concat(approved.size > 0 ? "\n" : "");
  return source.replace(/var\((--[A-Za-z0-9-]+)\)/g, (reference, token) => {
    const fallback = GENERATED_STYLE_FALLBACKS[token];
    if (!fallback) fail(`generated component style token ${token} lacks a deterministic fallback.`);
    return `var(${token}, ${fallback})`;
  });
}

function toPosixPath(path) {
  return path.replaceAll("\\", "/");
}

export function buildAdoptionManifestTask5Fields({ runtime, projectRoot, outputRoot }) {
  if (!runtime || typeof projectRoot !== "string" || typeof outputRoot !== "string") {
    fail("manifest reconstruction requires runtime, projectRoot, and outputRoot.");
  }
  return CANONICAL_COMPONENTS.map((definition) => {
    const active = runtime.entries.find((entry) => entry.component === definition.id);
    const candidates = runtime.candidates.filter((candidate) => candidate.component === definition.id);
    const rejected = runtime.rejectedMappings.filter((mapping) => mapping.component === definition.id);
    const implementationPath = !active
      ? null
      : active.strategy === "wrapper"
        ? active.adapterPath
        : active.strategy === "generate"
          ? active.generatedPath
          : active.strategy === "manual"
            ? toPosixPath(pathRelative(outputRoot, pathResolve(projectRoot, active.adapterPath)))
            : toPosixPath(pathRelative(outputRoot, pathResolve(projectRoot, active.source.path)));
    return {
      id: definition.id,
      fields: {
        availability: active ? "runtime-ready" : "contract-only",
        status: active ? (active.strategy === "generate" ? "generated" : "mapped") : "contract",
        framework: "react",
        exportName: definition.exportName,
        implementationPath,
        importPath: active ? "./runtime/react/src" : null,
        api: { props: Object.fromEntries(definition.props.map((prop) => [prop.name, prop.type])) },
        states: [...definition.states],
        origin: active?.strategy === "generate"
          ? "design-consultant"
          : ["wrapper", "manual"].includes(active?.strategy)
            ? "adapter"
            : (active || candidates.length > 0 ? "existing" : "design-consultant"),
        mappingStatus: active ? "confirmed" : (candidates.length > 0 && rejected.length === candidates.length ? "rejected" : "unmapped"),
        sourceImplementationPath: active?.source?.path ?? null,
        adapterPath: active?.strategy === "wrapper"
          ? active.projectAdapterPath
          : (active?.strategy === "manual" ? active.adapterPath : null),
        coverage: {
          candidates: candidates.length,
          confirmed: active ? 1 : 0,
          rejected: rejected.length,
          runtime: active ? 1 : 0,
        },
      },
    };
  });
}

export function canonicalComponent(component) {
  return COMPONENT_BY_ID.get(component) ?? null;
}

export const COMPONENT_MAPPING_STRATEGIES = Object.freeze([...MAPPING_STRATEGIES]);
export const COMPONENT_PROP_TRANSFORMS = Object.freeze([...PROP_TRANSFORMS]);
