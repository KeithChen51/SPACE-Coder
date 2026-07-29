import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  CANONICAL_COMPONENTS,
  buildRuntimePlan,
  renderGeneratedComponentStyles,
} from "./adoption/component-adapters.mjs";
import { validateRuntimeTypeEvidence } from "./adoption/typescript-evidence.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TEMP_ROOT = resolve(SCRIPT_DIR, "../../../.tmp/design-consultant-component-evidence");

async function makeProject(t, files) {
  await mkdir(TEMP_ROOT, { recursive: true });
  const projectRoot = await mkdtemp(join(TEMP_ROOT, "project-"));
  t.after(() => rm(projectRoot, { recursive: true, force: true }));
  await writeFile(join(projectRoot, "package.json"), `${JSON.stringify({ private: true, dependencies: { react: "19.2.8" } })}\n`, "utf8");
  for (const [path, content] of Object.entries(files)) {
    const absolutePath = join(projectRoot, path);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content, "utf8");
  }
  return projectRoot;
}

function inventoryFor(path, exportName) {
  return {
    project: { output: "design-system" },
    detected: {
      frameworks: ["React"],
      reactRuntimeCandidates: [{ path, exports: [exportName], namedExports: [exportName] }],
    },
  };
}

function directRuntime(path = "src/Button.tsx") {
  return buildRuntimePlan({
    strategy: "augment",
    inventory: inventoryFor(path, "Button"),
    mappings: [{
      component: "button",
      source: { path, exportName: "Button", propsExport: "ButtonProps" },
      strategy: "direct",
      api: { props: ["variant", "loading", "children"] },
      status: "confirmed",
    }],
  });
}

function wrapperRuntime(path = "src/PrimaryButton.tsx", propMap = [
  { canonicalProp: "children", sourceProp: "text", transform: "identity" },
  { canonicalProp: "loading", sourceProp: "pending", transform: "identity" },
  { canonicalProp: "variant", sourceProp: "tone", transform: "identity" },
]) {
  return buildRuntimePlan({
    strategy: "preserve",
    inventory: inventoryFor(path, "PrimaryButton"),
    mappings: [{ component: "button", source: { path, exportName: "PrimaryButton" }, strategy: "wrapper", propMap, status: "confirmed" }],
  });
}

function validate(projectRoot, runtime) {
  return validateRuntimeTypeEvidence({ projectRoot, outputRoot: join(projectRoot, "design-system"), runtime });
}

test("direct program evidence accepts inherited exact structural props", async (t) => {
  const projectRoot = await makeProject(t, {
    "src/Button.tsx": `import type { ReactNode } from "react";
interface BaseButtonProps { children: ReactNode; }
export interface ButtonProps extends BaseButtonProps {
  loading?: boolean;
  variant?: "danger" | "ghost" | "secondary" | "primary";
}
export function Button(props: ButtonProps) { return <button>{props.children}</button>; }
`,
  });

  assert.doesNotThrow(() => validate(projectRoot, directRuntime()));
});

test("exact component props include string, number, symbol, readonly, and any index contracts", async (t) => {
  const canonicalProps = `import type { ReactNode } from "react";
export interface ButtonProps { variant?: "primary" | "secondary" | "ghost" | "danger"; loading?: boolean; children: ReactNode; }`;
  const directCases = [
    ["string", "[name: string]: unknown;"],
    ["number", "[index: number]: unknown;"],
    ["symbol", "[key: symbol]: unknown;"],
    ["any", "[name: string]: any;"],
    ["readonly", "readonly [name: string]: unknown;"],
  ];
  for (const [name, indexSignature] of directCases) {
    const projectRoot = await makeProject(t, {
      "src/Button.tsx": `${canonicalProps.replace("export interface ButtonProps {", `export interface ButtonProps { ${indexSignature}`)}
export function Button(props: ButtonProps) { return <button>{props.children}</button>; }
`,
    });
    assert.throws(() => validate(projectRoot, directRuntime()), /index|structural|any/i, `direct ${name} index`);
  }

  const manualProject = await makeProject(t, {
    "src/Dialog.tsx": `import type { ReactNode } from "react";
export function Dialog(props: { [name: string]: unknown; open: boolean; title: ReactNode; onClose: () => void; children: ReactNode }) { return null; }
`,
  });
  const manualRuntime = buildRuntimePlan({
    strategy: "preserve",
    inventory: { project: { output: "design-system" }, detected: { frameworks: ["React"], reactRuntimeCandidates: [] } },
    mappings: [{ component: "dialog", strategy: "manual", adapterPath: "src/Dialog.tsx", status: "confirmed" }],
  });
  assert.throws(() => validate(manualProject, manualRuntime), /index|structural/i, "manual string index");

  const wrapperProject = await makeProject(t, {
    "src/PrimaryButton.tsx": `import type { ReactNode } from "react";
export function PrimaryButton(props: { [name: string]: unknown; text: ReactNode; pending?: boolean; tone?: "primary" | "secondary" | "ghost" | "danger" }) { return null; }
`,
  });
  assert.throws(() => validate(wrapperProject, wrapperRuntime()), /index|structural/i, "wrapper string index");
});

test("direct program evidence resolves value and type re-exports", async (t) => {
  const projectRoot = await makeProject(t, {
    "src/implementation.tsx": `import type { ReactNode } from "react";
export interface ButtonProps { variant?: "primary" | "secondary" | "ghost" | "danger"; loading?: boolean; children: ReactNode; }
export function Button(props: ButtonProps) { return <button>{props.children}</button>; }
`,
    "src/Button.tsx": `export { Button } from "./implementation";
export type { ButtonProps } from "./implementation";
`,
  });

  assert.doesNotThrow(() => validate(projectRoot, directRuntime()));
});

test("direct program evidence validates a real default component export", async (t) => {
  const projectRoot = await makeProject(t, {
    "src/Button.tsx": `import type { ReactNode } from "react";
export interface ButtonProps { variant?: "primary" | "secondary" | "ghost" | "danger"; loading?: boolean; children: ReactNode; }
export default function Button(props: ButtonProps) { return <button>{props.children}</button>; }
`,
  });
  const runtime = buildRuntimePlan({
    strategy: "augment",
    inventory: {
      project: { output: "design-system" },
      detected: { frameworks: ["React"], reactRuntimeCandidates: [{ path: "src/Button.tsx", exports: ["default"], namedExports: [], defaultExport: "default", defaultExportLocalName: "Button" }] },
    },
    mappings: [{
      component: "button",
      source: { path: "src/Button.tsx", exportName: "default", propsExport: "ButtonProps" },
      strategy: "direct",
      api: { props: ["variant", "loading", "children"] },
      status: "confirmed",
    }],
  });
  assert.doesNotThrow(() => validate(projectRoot, runtime));
});

test("wrapper program evidence validates and imports a real default component export", async (t) => {
  const projectRoot = await makeProject(t, {
    "src/PrimaryButton.tsx": `import type { ReactNode } from "react";
interface Props { text: ReactNode; pending?: boolean; tone?: "primary" | "secondary" | "ghost" | "danger"; }
export default function PrimaryButton(props: Props) { return <button>{props.text}</button>; }
`,
  });
  const runtime = buildRuntimePlan({
    strategy: "preserve",
    inventory: {
      project: { output: "design-system" },
      detected: { frameworks: ["React"], reactRuntimeCandidates: [{ path: "src/PrimaryButton.tsx", exports: ["default"], namedExports: [], defaultExport: "default", defaultExportLocalName: "PrimaryButton" }] },
    },
    mappings: [{
      component: "button",
      source: { path: "src/PrimaryButton.tsx", exportName: "default" },
      strategy: "wrapper",
      propMap: [
        { canonicalProp: "children", sourceProp: "text", transform: "identity" },
        { canonicalProp: "loading", sourceProp: "pending", transform: "identity" },
        { canonicalProp: "variant", sourceProp: "tone", transform: "identity" },
      ],
      status: "confirmed",
    }],
  });
  assert.doesNotThrow(() => validate(projectRoot, runtime));
  assert.match((await import("./adoption/component-adapters.mjs")).renderReactAdapter(runtime.adapters[0]), /import SourceButton from/);
});

test("direct program evidence rejects type-only, alias-away, and structural mismatches", async (t) => {
  const validProps = `import type { ReactNode } from "react";
export interface ButtonProps { variant?: "primary" | "secondary" | "ghost" | "danger"; loading?: boolean; children: ReactNode; }
`;
  const cases = [
    ["type-only value", `${validProps}export type Button = (props: ButtonProps) => unknown;`, /value export/i],
    ["alias away", `${validProps}function Button(props: ButtonProps) { return null; } export { Button as OtherButton };`, /value export/i],
    ["optional mismatch", `import type { ReactNode } from "react"; export interface ButtonProps { variant?: "primary" | "secondary" | "ghost" | "danger"; loading: boolean; children: ReactNode; } export function Button(props: ButtonProps) { return null; }`, /optionality|exact structural/i],
    ["type mismatch", `import type { ReactNode } from "react"; export interface ButtonProps { variant?: "primary" | "secondary" | "ghost" | "danger"; loading?: string; children: ReactNode; } export function Button(props: ButtonProps) { return null; }`, /type|exact structural/i],
    ["unused props", `${validProps}export function Button(props: { variant?: "primary" | "secondary" | "ghost" | "danger"; loading?: string; children: ReactNode }) { return null; }`, /consumed props|exact structural/i],
    ["extra required", `import type { ReactNode } from "react"; export interface ButtonProps { variant?: "primary" | "secondary" | "ghost" | "danger"; loading?: boolean; children: ReactNode; size: string; } export function Button(props: ButtonProps) { return null; }`, /extra|required|exact structural/i],
  ];
  for (const [name, source, expected] of cases) {
    const projectRoot = await makeProject(t, { "src/Button.tsx": source });
    assert.throws(() => validate(projectRoot, directRuntime()), expected, name);
  }
});

test("manual program evidence requires an actual canonical value export", async (t) => {
  const cases = [
    ["type-only", "export type Dialog = { open: boolean };"],
    ["alias-away", "function Dialog() { return null; } export { Dialog as OtherDialog };"],
    ["string-regex", "const text = 'export function Dialog() {}'; const pattern = /export\\s+function\\s+Dialog/; export const Other = 1;"],
  ];
  for (const [name, source] of cases) {
    const projectRoot = await makeProject(t, { "src/Dialog.tsx": source });
    const runtime = buildRuntimePlan({
      strategy: "preserve",
      inventory: { project: { output: "design-system" }, detected: { frameworks: ["React"], reactRuntimeCandidates: [] } },
      mappings: [{ component: "dialog", strategy: "manual", adapterPath: "src/Dialog.tsx", status: "confirmed" }],
    });
    assert.throws(() => validate(projectRoot, runtime), /actual.*value export|value export/i, name);
  }
});

test("manual program evidence requires a React component with the exact canonical consumed props", async (t) => {
  const cases = [
    ["number export", "export const Dialog = 1;", /component|callable|construct|consumed props/i],
    ["wrong props", `import type { ReactNode } from "react";
export function Dialog(props: { open: boolean; title: ReactNode; onClose: (reason: string) => void; children: ReactNode }) { return null; }
`, /onClose|exactly match|canonical contract/i],
    ["manual any", `import type { ReactNode } from "react";
export function Dialog(props: { open: boolean; title: any; onClose: () => void; children: ReactNode }) { return null; }
`, /any/i],
    ["non-React callable", `import type { ReactNode } from "react";
export function Dialog(props: { open: boolean; title: ReactNode; onClose: () => void; children: ReactNode }) { return { props }; }
`, /component|compilation|assignable/i],
  ];
  for (const [name, source, expected] of cases) {
    const projectRoot = await makeProject(t, { "src/Dialog.tsx": source });
    const runtime = buildRuntimePlan({
      strategy: "preserve",
      inventory: { project: { output: "design-system" }, detected: { frameworks: ["React"], reactRuntimeCandidates: [] } },
      mappings: [{ component: "dialog", strategy: "manual", adapterPath: "src/Dialog.tsx", status: "confirmed" }],
    });
    assert.throws(() => validate(projectRoot, runtime), expected, name);
  }

  const validProject = await makeProject(t, {
    "src/Dialog.tsx": `import type { ReactNode } from "react";
export function Dialog(props: { open: boolean; title: ReactNode; onClose: () => void; children: ReactNode }) { return null; }
`,
  });
  const validRuntime = buildRuntimePlan({
    strategy: "preserve",
    inventory: { project: { output: "design-system" }, detected: { frameworks: ["React"], reactRuntimeCandidates: [] } },
    mappings: [{ component: "dialog", strategy: "manual", adapterPath: "src/Dialog.tsx", status: "confirmed" }],
  });
  assert.doesNotThrow(() => validate(validProject, validRuntime));
});

test("component evidence rejects recursive any and ambiguous overloads", async (t) => {
  const cases = [
    ["direct any", `export interface ButtonProps { variant?: any; loading?: boolean; children: any; }
export function Button(props: ButtonProps) { return null; }
`, directRuntime(), /any/i],
    ["direct nested any", `import type { ReactNode } from "react";
export interface ButtonProps { variant?: "primary" | "secondary" | "ghost" | "danger"; loading?: boolean; children: ReactNode & { unsafe?: any }; }
export function Button(props: ButtonProps) { return null; }
`, directRuntime(), /any/i],
    ["ambiguous overload", `import type { ReactNode } from "react";
export interface ButtonProps { variant?: "primary" | "secondary" | "ghost" | "danger"; loading?: boolean; children: ReactNode; }
export function Button(props: ButtonProps): null;
export function Button(props: { children: ReactNode; loading: boolean }): null;
export function Button(props: ButtonProps) { return null; }
`, directRuntime(), /overload|signature|exact structural/i],
  ];
  for (const [name, source, runtime, expected] of cases) {
    const projectRoot = await makeProject(t, { "src/Button.tsx": source });
    assert.throws(() => validate(projectRoot, runtime), expected, name);
  }
});

test("canonical unknown remains valid when the source contract is otherwise exact", async (t) => {
  const projectRoot = await makeProject(t, {
    "src/DataTable.tsx": `export interface DataTableProps {
  columns: readonly unknown[];
  rows: readonly unknown[];
  rowKey: string | ((row: unknown, index: number) => string | number);
  state: "ready" | "loading" | "empty" | "error" | "permission" | "partial";
}
export function DataTable(props: DataTableProps) { return null; }
`,
  });
  const runtime = buildRuntimePlan({
    strategy: "preserve",
    inventory: inventoryFor("src/DataTable.tsx", "DataTable"),
    mappings: [{
      component: "data-table",
      source: { path: "src/DataTable.tsx", exportName: "DataTable", propsExport: "DataTableProps" },
      strategy: "direct",
      api: { props: ["columns", "rows", "rowKey", "state"] },
      status: "confirmed",
    }],
  });
  assert.doesNotThrow(() => validate(projectRoot, runtime));
});

test("wrapper program evidence validates transforms and every required source prop", async (t) => {
  const valid = `import type { ReactNode } from "react";
interface BaseProps { text: ReactNode; }
interface Props extends BaseProps { pending?: boolean; tone?: "primary" | "secondary" | "ghost" | "danger"; }
export function PrimaryButton(props: Props) { return <button>{props.text}</button>; }
`;
  const projectRoot = await makeProject(t, { "src/PrimaryButton.tsx": valid });
  assert.doesNotThrow(() => validate(projectRoot, wrapperRuntime()));

  const cases = [
    ["identity type", valid.replace("pending?: boolean", "pending?: string"), undefined, /identity.*type|compatible/i],
    ["boolean inverse source", valid.replace("pending?: boolean", "pending?: string"), [
      { canonicalProp: "children", sourceProp: "text", transform: "identity" },
      { canonicalProp: "loading", sourceProp: "pending", transform: "boolean-inverse" },
      { canonicalProp: "variant", sourceProp: "tone", transform: "identity" },
    ], /boolean-inverse.*boolean/i],
    ["event wrong direction", valid, [
      { canonicalProp: "children", sourceProp: "text", transform: "identity" },
      { canonicalProp: "loading", sourceProp: "pending", transform: "event-target-value" },
      { canonicalProp: "variant", sourceProp: "tone", transform: "identity" },
    ], /event-target-value.*callback|string value/i],
    ["unmapped required", valid.replace("pending?: boolean", "pending?: boolean; size: string"), undefined, /unmapped required source prop.*size/i],
    ["transform any", valid.replace("pending?: boolean", "pending?: any"), undefined, /any/i],
  ];
  for (const [name, source, propMap, expected] of cases) {
    const invalidProject = await makeProject(t, { "src/PrimaryButton.tsx": source });
    assert.throws(() => validate(invalidProject, wrapperRuntime("src/PrimaryButton.tsx", propMap)), expected, name);
  }
});

test("wrapper prop maps must cover every canonical prop exactly once", () => {
  for (const missing of ["variant", "loading", "children"]) {
    const propMap = [
      { canonicalProp: "variant", sourceProp: "tone", transform: "identity" },
      { canonicalProp: "loading", sourceProp: "pending", transform: "identity" },
      { canonicalProp: "children", sourceProp: "text", transform: "identity" },
    ].filter((entry) => entry.canonicalProp !== missing);
    assert.throws(() => wrapperRuntime("src/PrimaryButton.tsx", propMap), new RegExp(`missing canonical prop.*${missing}|cover.*${missing}`, "i"));
  }
  assert.throws(() => buildRuntimePlan({
    strategy: "preserve",
    inventory: inventoryFor("src/FormField.tsx", "FormField"),
    mappings: [{
      component: "field",
      source: { path: "src/FormField.tsx", exportName: "FormField" },
      strategy: "wrapper",
      status: "confirmed",
      propMap: [
        { canonicalProp: "label", sourceProp: "label", transform: "identity" },
        { canonicalProp: "description", sourceProp: "help", transform: "identity" },
        { canonicalProp: "children", sourceProp: "children", transform: "identity" },
      ],
    }],
  }), /missing canonical prop.*error|cover.*error/i);
});

test("approved family styles cover every generated visual class without unrelated family CSS", async () => {
  for (const component of CANONICAL_COMPONENTS) {
    const source = await readFile(resolve(SCRIPT_DIR, `../templates/react-runtime/src/${component.exportName}.tsx`), "utf8");
    const css = renderGeneratedComponentStyles([{
      component: component.id,
      canonicalExport: component.exportName,
      strategy: "generate",
      approved: true,
    }]);
    const visualClasses = [...new Set(source.match(/dc-[A-Za-z0-9-]+/g) ?? [])];
    for (const className of visualClasses) {
      assert.ok(css.includes(`.${className}`), `${component.exportName} CSS does not cover ${className}`);
    }
  }
  const statusCss = renderGeneratedComponentStyles([{
    component: "status",
    canonicalExport: "StatusBadge",
    strategy: "generate",
    approved: true,
  }]);
  assert.doesNotMatch(statusCss, /\.dc-button(?:\W|$)|\.dc-dialog|\.dc-data-table|@keyframes/);
  assert.doesNotMatch(statusCss, /:root\b/);
  assert.doesNotMatch(statusCss, /var\(\s*--[^,)]+\)/, "every generated token reference must have a fallback");
  assert.match(statusCss, /var\(--font-sans,\s*[^)]+\)/);
  assert.match(statusCss, /border-radius:\s*var\([^,]+,\s*[^)]+\)/);
  assert.match(statusCss, /background:\s*var\([^,]+,\s*[^)]+\)/);
});
