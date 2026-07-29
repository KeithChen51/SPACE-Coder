import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, symlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import test from "node:test";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = join(SCRIPT_DIR, "manage-visual-system.mjs");
const CHECKER_PATH = join(SCRIPT_DIR, "check-component-runtime.mjs");
const REPO_ROOT = resolve(SCRIPT_DIR, "../../..");
const TSC_PATH = join(REPO_ROOT, "node_modules/typescript/bin/tsc");
const VITEST_PATH = join(REPO_ROOT, "node_modules/vitest/vitest.mjs");
const workspaces = [];
const CORE_COMPONENTS = [
  ["button", "Button"],
  ["icon-button", "IconButton"],
  ["field", "FieldShell"],
  ["choice-field", "SelectField"],
  ["dialog", "Dialog"],
  ["resource-state", "ResourcePanel"],
  ["status", "StatusBadge"],
  ["data-table", "DataTable"],
];
const GREENFIELD_COMPONENTS = [
  ...CORE_COMPONENTS,
  ["text-field", "TextField"],
  ["tertiary-nav", "TertiaryNav"],
  ["filter-bar", "FilterBar"],
  ["definition-list", "DefinitionList"],
  ["mobile-record-card", "MobileRecordCard"],
  ["pagination", "TablePagination"],
  ["approval-panel", "ApprovalPanel"],
  ["searchable-select", "SearchableSelect"],
  ["multi-select-field", "MultiSelectField"],
  ["metric-card", "MetricCard"],
  ["form-selection", "CheckboxField"],
  ["overlay", "Tooltip"],
  ["action-overlay", "ActionMenu"],
  ["feedback", "InlineNotice"],
  ["brand-attribution", "BrandAttribution"],
];

async function makeReactProject(name = "react-operations") {
  const localTemp = join(REPO_ROOT, ".tmp");
  await mkdir(localTemp, { recursive: true });
  const workspace = await mkdtemp(join(localTemp, "design-consultant-react-"));
  workspaces.push(workspace);
  const project = join(workspace, name);
  await mkdir(join(project, "src"), { recursive: true });
  await writeFile(join(project, "package.json"), `${JSON.stringify({
    name,
    private: true,
    dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" },
    devDependencies: { typescript: "^7.0.0", vite: "^7.0.0" },
  }, null, 2)}\n`, "utf8");
  return project;
}

function runCli(project, command, args = []) {
  const result = spawnSync(process.execPath, [SCRIPT_PATH, command, ...args, "--target", project], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stdout || result.stderr);
  return JSON.parse(result.stdout);
}

function runCliProcess(project, command, args = []) {
  return spawnSync(process.execPath, [SCRIPT_PATH, command, ...args, "--target", project], {
    encoding: "utf8",
  });
}

async function exists(path) {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function sha256(content, prefix = false) {
  const value = createHash("sha256").update(content).digest("hex");
  return prefix ? `sha256:${value}` : value;
}

function runGeneratedChecker(output, checker, options = {}) {
  return spawnSync(process.execPath, [join(output, "checks", checker), output], {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
  });
}

function assertGeneratedCheckers(output, expectedStatus, label, options = {}) {
  for (const checker of ["check-adoption-contract.mjs", "check-component-runtime.mjs"]) {
    const result = runGeneratedChecker(output, checker, options);
    assert.equal(result.status, expectedStatus, `${label} (${checker}): ${result.stdout || result.stderr}`);
  }
}

async function snapshotDirectory(root) {
  const snapshot = {};
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else snapshot[path.slice(root.length + 1).replaceAll("\\", "/")] = (await readFile(path)).toString("base64");
    }
  }
  await walk(root);
  return snapshot;
}

async function createLinkOrSkip(t, target, path, type) {
  try {
    await symlink(target, path, process.platform === "win32" && type === "dir" ? "junction" : type);
    return true;
  } catch (error) {
    if (["EPERM", "EACCES", "ENOSYS", "UNKNOWN"].includes(error.code)) {
      t.diagnostic(`links unavailable on this platform: ${error.code}`);
      return false;
    }
    throw error;
  }
}

async function adoptGeneratedStatusProject(name) {
  const project = await makeReactProject(name);
  const output = join(project, "design-system");
  runCli(project, "extract");
  const planPath = join(output, "adoption/adoption-plan.json");
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  plan.status = "confirmed";
  plan.strategy = "augment";
  for (const mapping of plan.tokenMappings) mapping.status = "rejected";
  for (const mapping of plan.componentMappings) {
    mapping.status = "rejected";
    mapping.strategy = "reject";
  }
  plan.componentMappings.push({ component: "status", strategy: "generate", approved: true, status: "confirmed" });
  await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  runCli(project, "adopt");
  return { project, output };
}

async function adoptWrappedButtonProject(name) {
  const project = await makeReactProject(name);
  const sourceRoot = join(project, "src/components");
  await mkdir(sourceRoot, { recursive: true });
  await writeFile(
    join(sourceRoot, "Button.tsx"),
    `import type { ReactNode } from "react";
export interface ExistingButtonProps { text: ReactNode; pending?: boolean; tone?: "primary" | "secondary" | "ghost" | "danger"; }
export function Button({ text, pending = false }: ExistingButtonProps) { return <button disabled={pending}>{text}</button>; }
`,
    "utf8",
  );
  const output = join(project, "design-system");
  runCli(project, "extract");
  const planPath = join(output, "adoption/adoption-plan.json");
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  plan.status = "confirmed";
  plan.strategy = "preserve";
  for (const mapping of plan.tokenMappings) mapping.status = "rejected";
  const button = plan.componentMappings.find((mapping) => mapping.component === "button");
  button.status = "confirmed";
  button.strategy = "wrapper";
  button.propMap = [
    { canonicalProp: "children", sourceProp: "text", transform: "identity" },
    { canonicalProp: "loading", sourceProp: "pending", transform: "identity" },
    { canonicalProp: "variant", sourceProp: "tone", transform: "identity" },
  ];
  await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  runCli(project, "adopt");
  return { project, output };
}

test.afterEach(async () => {
  while (workspaces.length > 0) await rm(workspaces.pop(), { recursive: true, force: true });
});

test("Skill 自身的 React 参考运行时与 Manifest 保持一致", () => {
  const checked = spawnSync(process.execPath, [CHECKER_PATH], { encoding: "utf8" });
  assert.equal(checked.status, 0, checked.stdout || checked.stderr);
  const result = JSON.parse(checked.stdout);
  assert.equal(result.layout, "skill-source");
  assert.equal(result.summary.implemented, 23);
});

test("业务页面通过统一 barrel 消费生成组件并通过 TypeScript 编译", async () => {
  const project = await makeReactProject("compiled-react-page");
  runCli(project, "init");
  await writeFile(
    join(project, "src/OrdersPage.tsx"),
    `import { Button, DataTable, StatusBadge } from "../design-system/runtime/react/src";

const rows = [{ id: "one", name: "六月结算", status: "已完成" }];

export function OrdersPage() {
  return <main>
    <Button>创建任务</Button>
    <DataTable
      caption="结算任务"
      columns={[
        { id: "name", header: "任务", accessor: "name" },
        { id: "status", header: "状态", render: (row) => <StatusBadge tone="success">{row.status}</StatusBadge> },
      ]}
      rows={rows}
      rowKey="id"
    />
  </main>;
}
`,
    "utf8",
  );
  await writeFile(join(project, "tsconfig.json"), `${JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      lib: ["ES2022", "DOM"],
      module: "ESNext",
      moduleResolution: "Bundler",
      jsx: "react-jsx",
      strict: true,
      noEmit: true,
      skipLibCheck: true,
    },
    include: ["src/**/*.tsx", "design-system/runtime/react/src/**/*.ts", "design-system/runtime/react/src/**/*.tsx"],
  }, null, 2)}\n`, "utf8");

  const compiled = spawnSync(process.execPath, [TSC_PATH, "-p", join(project, "tsconfig.json")], {
    cwd: project,
    encoding: "utf8",
  });
  assert.equal(compiled.status, 0, compiled.stdout || compiled.stderr);
});

test("组件运行时校验器验证 Manifest 路径与 barrel export", async () => {
  const project = await makeReactProject("checked-react-runtime");
  runCli(project, "init");
  const output = join(project, "design-system");
  const checker = join(output, "checks/check-component-runtime.mjs");
  assert.equal(await exists(checker), true);

  const valid = spawnSync(process.execPath, [checker, output], { encoding: "utf8" });
  assert.equal(valid.status, 0, valid.stdout || valid.stderr);
  const validResult = JSON.parse(valid.stdout);
  assert.equal(validResult.summary.implemented, 23);

  const barrelPath = join(output, "runtime/react/src/index.ts");
  const barrel = await readFile(barrelPath, "utf8");
  await writeFile(barrelPath, barrel.replace(", PopoverCard", ""), "utf8");
  const missingSecondaryExport = spawnSync(process.execPath, [checker, output], { encoding: "utf8" });
  assert.equal(missingSecondaryExport.status, 1, missingSecondaryExport.stdout || missingSecondaryExport.stderr);
  assert.ok(JSON.parse(missingSecondaryExport.stdout).issues.some((issue) => issue.component === "PopoverCard" && issue.rule === "barrel-export"));
  await writeFile(barrelPath, barrel, "utf8");

  const manifestPath = join(output, "components/manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.families.find((entry) => entry.id === "button").implementationPath = "runtime/react/src/MissingButton.tsx";
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const invalid = spawnSync(process.execPath, [checker, output], { encoding: "utf8" });
  assert.equal(invalid.status, 1, invalid.stdout || invalid.stderr);
  const invalidResult = JSON.parse(invalid.stdout);
  assert.ok(invalidResult.issues.some((issue) => issue.component === "Button" && issue.rule === "implementation-path"));
  assert.ok(invalidResult.issues.every((issue) => issue.fix));
});

test("React 项目生成 23 个运行时家族，并提供统一导出和可验证 Manifest", async () => {
  const project = await makeReactProject();
  const result = runCli(project, "init");
  const output = join(project, "design-system");

  assert.equal(result.runtime.framework, "react");
  assert.equal(result.runtime.generated, 23);
  assert.equal(await exists(join(output, "runtime/react/src/index.ts")), true);
  assert.equal(await exists(join(output, "runtime/react/src/styles.css")), true);
  assert.equal(await exists(join(output, "runtime/react/tsconfig.json")), true);

  const manifest = JSON.parse(await readFile(join(output, "components/manifest.json"), "utf8"));
  const barrel = await readFile(join(output, "runtime/react/src/index.ts"), "utf8");
  for (const [id, exportName] of GREENFIELD_COMPONENTS) {
    const component = manifest.families.find((entry) => entry.id === id);
    assert.ok(component, `manifest 缺少 ${id}`);
    assert.equal(component.framework, "react");
    assert.equal(component.status, "generated");
    assert.equal(component.exportName, exportName);
    assert.equal(component.importPath, "./runtime/react/src");
    assert.equal(component.implementationPath, `runtime/react/src/${exportName}.tsx`);
    assert.ok(component.api?.props, `${exportName} 缺少 props schema`);
    assert.equal(await exists(join(output, component.implementationPath)), true);
    assert.match(barrel, new RegExp(`export \\{[^}]*\\b${exportName}\\b[^}]*\\} from "\\./${exportName}"`));
  }
  assert.match(barrel, /BrandAttributionAccentScope/);
  assert.match(barrel, /BrandAttributionPlacement/);
});

test("confirmed adoption maps mature React components without generating replacement defaults", async () => {
  const project = await makeReactProject("existing-react-components");
  const componentRoot = join(project, "src/components");
  await mkdir(componentRoot, { recursive: true });
  await writeFile(
    join(componentRoot, "PrimaryButton.tsx"),
    `import type { ReactNode } from "react";

export interface PrimaryButtonProps {
  children: ReactNode;
  isLoading?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger";
}

export function PrimaryButton({ children, isLoading = false }: PrimaryButtonProps) {
  return <button type="button" aria-busy={isLoading} disabled={isLoading}>{isLoading ? "Loading" : children}</button>;
}
`,
    "utf8",
  );
  await writeFile(
    join(componentRoot, "Modal.tsx"),
    `import type { ReactNode } from "react";

export interface ModalProps {
  open: boolean;
  heading: ReactNode;
  requestClose: () => void;
  children: ReactNode;
}

export function Modal({ open, heading, requestClose, children }: ModalProps) {
  if (!open) return null;
  return <section role="dialog" aria-label={String(heading)}><h2>{heading}</h2>{children}<button onClick={requestClose}>Close</button></section>;
}
`,
    "utf8",
  );
  const existingPagePath = join(project, "src/ExistingPage.tsx");
  const existingPageSource = `import { PrimaryButton } from "./components/PrimaryButton";
export function ExistingPage() { return <PrimaryButton>Existing</PrimaryButton>; }
`;
  await writeFile(existingPagePath, existingPageSource, "utf8");

  const output = join(project, "design-system");
  runCli(project, "extract");
  const planPath = join(output, "adoption/adoption-plan.json");
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  plan.status = "confirmed";
  plan.strategy = "augment";
  for (const mapping of plan.tokenMappings) mapping.status = "rejected";
  for (const mapping of plan.componentMappings) {
    mapping.status = "confirmed";
    mapping.strategy = "wrapper";
    if (mapping.component === "button") {
      mapping.propMap = [
        { canonicalProp: "children", sourceProp: "children", transform: "identity" },
        { canonicalProp: "loading", sourceProp: "isLoading", transform: "identity" },
        { canonicalProp: "variant", sourceProp: "variant", transform: "identity" },
      ];
    } else if (mapping.component === "dialog") {
      mapping.propMap = [
        { canonicalProp: "open", sourceProp: "open", transform: "identity" },
        { canonicalProp: "title", sourceProp: "heading", transform: "identity" },
        { canonicalProp: "onClose", sourceProp: "requestClose", transform: "identity" },
        { canonicalProp: "children", sourceProp: "children", transform: "identity" },
      ];
    }
  }
  await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");

  const result = runCli(project, "adopt");
  assert.equal(result.runtime.framework, "react");
  assert.equal(result.runtime.mapped, 2);
  assert.equal(result.runtime.generated, 0);
  assert.equal(await exists(join(output, "runtime/react/src/Button.tsx")), false);
  assert.equal(await exists(join(output, "runtime/react/src/Dialog.tsx")), false);
  assert.equal(await exists(join(output, "runtime/react/src/adapters/Button.tsx")), true);
  assert.equal(await exists(join(output, "runtime/react/src/adapters/Dialog.tsx")), true);
  assert.equal(await exists(join(output, "runtime/react/src/index.ts")), true);
  assert.equal(await exists(join(output, "components/adapter-map.json")), true);
  assert.equal(await exists(join(output, "components/manifest.json")), true);
  assert.equal(await exists(join(output, "checks/check-component-runtime.mjs")), true);
  assert.equal(await exists(join(output, "checks/sync-tokens.mjs")), false);
  assert.equal(await exists(join(output, "catalog/component-library.html")), true);
  assert.equal(await exists(join(output, "catalog/src/catalog.tsx")), true);
  assert.equal(await exists(join(output, "checks/build-component-catalog.mjs")), true);
  assert.equal(await exists(join(output, "catalog/component-library.js")), false);
  assert.equal(await exists(join(output, "tokens/tokens.json")), false);
  assert.equal(await exists(join(project, "DESIGN.md")), false);
  assert.equal(await exists(join(output, "DESIGN.md")), false);
  assert.equal(await readFile(existingPagePath, "utf8"), existingPageSource);

  const config = JSON.parse(await readFile(join(output, "system.config.json"), "utf8"));
  assert.equal(config.integration.componentAdapterMap, "components/adapter-map.json");
  assert.equal(config.sourceOfTruth.componentManifest, "components/manifest.json");
  assert.equal(config.sourceOfTruth.componentRuntime, "runtime/react/src/index.ts");
  assert.equal(config.checks.componentRuntime, "checks/check-component-runtime.mjs");
  const manifest = JSON.parse(await readFile(join(output, "components/manifest.json"), "utf8"));
  assert.equal(manifest.families.filter((family) => CORE_COMPONENTS.some(([id]) => id === family.id)).length, 8);
  assert.equal(manifest.families.find((family) => family.id === "button").origin, "adapter");
  assert.equal(manifest.families.find((family) => family.id === "dialog").mappingStatus, "confirmed");
  assert.equal(manifest.families.find((family) => family.id === "button").availability, "runtime-ready");
  assert.equal(manifest.families.find((family) => family.id === "dialog").availability, "runtime-ready");
  assert.equal(manifest.families.find((family) => family.id === "icon-button").availability, "contract-only");
  assert.equal(manifest.families.filter((family) => family.availability === "runtime-ready").length, 2);
  assert.equal(manifest.families.filter((family) => family.availability === "contract-only").length, 6);
  const adoptionChecked = spawnSync(process.execPath, [join(output, "checks/check-adoption-contract.mjs"), output], { encoding: "utf8" });
  assert.equal(adoptionChecked.status, 0, adoptionChecked.stdout || adoptionChecked.stderr);
  const runtimeChecked = spawnSync(process.execPath, [join(output, "checks/check-component-runtime.mjs"), output], { encoding: "utf8" });
  assert.equal(runtimeChecked.status, 0, runtimeChecked.stdout || runtimeChecked.stderr);
  const updated = runCli(project, "update");
  assert.equal(updated.runtime.framework, "react");
  assert.equal(updated.runtime.mapped, 2);
  assert.equal(updated.runtime.generated, 0);

  await writeFile(
    join(project, "src/OrdersPage.tsx"),
    `import { Button, Dialog } from "../design-system/runtime/react/src";

export function OrdersPage({ open, close }: { open: boolean; close: () => void }) {
  return <main><Button loading={false}>Save</Button><Dialog open={open} title="Confirm" onClose={close}>Body</Dialog></main>;
}
`,
    "utf8",
  );
  await writeFile(join(project, "tsconfig.json"), `${JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      lib: ["ES2022", "DOM"],
      module: "ESNext",
      moduleResolution: "Bundler",
      jsx: "react-jsx",
      strict: true,
      noEmit: true,
      skipLibCheck: true,
    },
    include: ["src/**/*.tsx", "design-system/runtime/react/src/**/*.ts", "design-system/runtime/react/src/**/*.tsx"],
  }, null, 2)}\n`, "utf8");
  const compiled = spawnSync(process.execPath, [TSC_PATH, "-p", join(project, "tsconfig.json")], { cwd: project, encoding: "utf8" });
  assert.equal(compiled.status, 0, compiled.stdout || compiled.stderr);

  const behaviorTest = join(project, "src/adopted-runtime.test.tsx");
  await writeFile(
    behaviorTest,
    `import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Button, Dialog } from "../design-system/runtime/react/src";

afterEach(cleanup);

test("Button forwards loading behavior", () => {
  render(<Button loading>Save</Button>);
  expect(screen.getByRole("button").hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("button").getAttribute("aria-busy")).toBe("true");
});

test("Dialog forwards close behavior", () => {
  const close = vi.fn();
  render(<Dialog open title="Confirm" onClose={close}>Body</Dialog>);
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(close).toHaveBeenCalledOnce();
});
`,
    "utf8",
  );
  const vitestConfig = join(project, "vitest.config.mjs");
  await writeFile(
    vitestConfig,
    `import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "jsdom", include: ["src/adopted-runtime.test.tsx"] } });
`,
    "utf8",
  );
  const behavior = spawnSync(process.execPath, [VITEST_PATH, "run", "--config", vitestConfig], { cwd: project, encoding: "utf8" });
  assert.equal(behavior.status, 0, behavior.stdout || behavior.stderr);

  const checked = spawnSync(process.execPath, [join(output, "checks/check-component-runtime.mjs"), output], { encoding: "utf8" });
  assert.equal(checked.status, 1, checked.stdout || checked.stderr);
  assert.ok(JSON.parse(checked.stdout).issues.some((issue) => issue.rule === "runtime-type-evidence"));
  const buttonAdapterPath = join(output, "runtime/react/src/adapters/Button.tsx");
  await writeFile(buttonAdapterPath, `${await readFile(buttonAdapterPath, "utf8")}\n// drift\n`, "utf8");
  const drifted = spawnSync(process.execPath, [join(output, "checks/check-component-runtime.mjs"), output], { encoding: "utf8" });
  assert.equal(drifted.status, 1, drifted.stdout || drifted.stderr);
  assert.ok(JSON.parse(drifted.stdout).issues.some((issue) => issue.rule === "adapter-drift"));
});

test("generated adoption checks run outside the repository after installing declared dependencies and attest source bytes", async (t) => {
  const workspace = await mkdtemp(join(tmpdir(), "design-consultant-standalone-"));
  workspaces.push(workspace);
  const project = join(workspace, "react-without-node-modules");
  await mkdir(join(project, "src/components"), { recursive: true });
  await writeFile(join(project, "package.json"), `${JSON.stringify({
    name: "react-without-node-modules",
    private: true,
    dependencies: { react: "19.2.8" },
  }, null, 2)}\n`, "utf8");
  const buttonPath = join(project, "src/components/PrimaryButton.tsx");
  await writeFile(buttonPath, `import type { ReactNode } from "react";
export interface PrimaryButtonProps { children: ReactNode; isLoading?: boolean; variant?: "primary" | "secondary" | "ghost" | "danger"; }
export function PrimaryButton(props: PrimaryButtonProps) { return <button disabled={props.isLoading}>{props.children}</button>; }
`, "utf8");
  const themePath = join(project, "src/theme.css");
  const themeSource = ":root { --brand-primary: #2457d6; }\n";
  await writeFile(themePath, themeSource, "utf8");

  runCli(project, "extract");
  const output = join(project, "design-system");
  const planPath = join(output, "adoption/adoption-plan.json");
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  plan.status = "confirmed";
  plan.strategy = "preserve";
  for (const mapping of plan.tokenMappings) mapping.status = "rejected";
  const primaryToken = plan.tokenMappings.find((mapping) => mapping.source?.name === "--brand-primary");
  assert.ok(primaryToken, "fixture must expose a token candidate for component+token closure");
  primaryToken.status = "confirmed";
  primaryToken.canonicalToken = "semantic.color.primary";
  primaryToken.canonicalCssVariable = "--primary";
  primaryToken.source.kind = "css-variable";
  primaryToken.theme = "light";
  primaryToken.selector = primaryToken.source.selector;
  primaryToken.evidence = [`${primaryToken.source.file}:${primaryToken.source.line}`];
  for (const mapping of plan.componentMappings) {
    if (mapping.component === "button") {
      mapping.status = "confirmed";
      mapping.strategy = "wrapper";
      mapping.propMap = [
        { canonicalProp: "children", sourceProp: "children", transform: "identity" },
        { canonicalProp: "loading", sourceProp: "isLoading", transform: "identity" },
        { canonicalProp: "variant", sourceProp: "variant", transform: "identity" },
      ];
    } else {
      mapping.status = "rejected";
      mapping.strategy = "reject";
    }
  }
  await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");

  const unsafeSourceRoot = join(workspace, "unsafe-source-root");
  const unsafeSourceLink = join(project, "src/unsafe-source-root");
  await mkdir(unsafeSourceRoot, { recursive: true });
  await writeFile(join(unsafeSourceRoot, "LinkedButton.tsx"), "export function LinkedButton() { return <button />; }\n", "utf8");
  if (await createLinkOrSkip(t, unsafeSourceRoot, unsafeSourceLink, "dir")) {
    const beforeAdopt = await snapshotDirectory(output);
    const blockedAdopt = runCliProcess(project, "adopt");
    assert.notEqual(blockedAdopt.status, 0, blockedAdopt.stdout || blockedAdopt.stderr);
    assert.match(blockedAdopt.stderr, /link|symbolic|junction|reparse/i);
    assert.deepEqual(await snapshotDirectory(output), beforeAdopt, "unsafe source evidence must block adopt before writes");
    await rm(unsafeSourceLink);
  }
  runCli(project, "adopt");

  const install = process.platform === "win32"
    ? spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "npm install --ignore-scripts --no-audit --no-fund --no-package-lock"], { cwd: output, encoding: "utf8", timeout: 150000 })
    : spawnSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--no-package-lock"], { cwd: output, encoding: "utf8", timeout: 150000 });
  assert.equal(install.status, 0, install.stderr || install.stdout);

  await mkdir(join(project, "node_modules/typescript"), { recursive: true });
  await writeFile(join(project, "node_modules/typescript/package.json"), `${JSON.stringify({ name: "typescript", version: "0.0.0-forged", type: "module", exports: { "./*": "./poison.mjs" } })}\n`, "utf8");
  await writeFile(join(project, "node_modules/typescript/poison.mjs"), "throw new Error('TARGET_TYPESCRIPT_MUST_NOT_LOAD');\n", "utf8");
  await mkdir(join(project, "build"), { recursive: true });
  await mkdir(join(project, ".git"), { recursive: true });
  await mkdir(join(output, "runtime/scratch"), { recursive: true });
  await writeFile(join(project, "build/IgnoredButton.tsx"), "export const Button = 1;\n", "utf8");
  await writeFile(join(project, ".git/ignored.css"), ":root { --ignored: red; }\n", "utf8");
  await writeFile(join(output, "runtime/scratch/Ignored.tsx"), "export const Button = 1;\n", "utf8");
  const checkerEnvironment = { ...process.env, NODE_PATH: "" };
  for (const checker of ["check-adoption-contract.mjs", "check-component-runtime.mjs"]) {
    const checked = spawnSync(process.execPath, [join(output, "checks", checker), output], {
      cwd: project,
      env: checkerEnvironment,
      encoding: "utf8",
    });
    assert.equal(checked.status, 0, `${checker}: ${checked.stdout || checked.stderr}`);
    assert.doesNotMatch(`${checked.stdout}\n${checked.stderr}`, /TARGET_TYPESCRIPT_MUST_NOT_LOAD/);
  }
  assert.equal(await exists(join(output, "checks/adoption/typescript-evidence.mjs")), false);
  assert.equal(await exists(join(output, "checks/adoption/inventory.mjs")), false);

  assertGeneratedCheckers(output, 0, "ignored output and build inputs", { cwd: project, env: checkerEnvironment });

  const addedCandidatePath = join(project, "src/design-system/Button.tsx");
  await mkdir(dirname(addedCandidatePath), { recursive: true });
  await writeFile(addedCandidatePath, "export function SecondaryButton() { return <button />; }\n", "utf8");
  assertGeneratedCheckers(output, 1, "new component candidate under a non-output design-system directory", { cwd: project, env: checkerEnvironment });
  await rm(addedCandidatePath);

  await writeFile(themePath, `${themeSource}:root { --new-token: #fff; }\n`, "utf8");
  assertGeneratedCheckers(output, 1, "new CSS token evidence", { cwd: project, env: checkerEnvironment });
  await writeFile(themePath, themeSource, "utf8");

  const packagePath = join(project, "package.json");
  const packageSource = await readFile(packagePath, "utf8");
  const packageJson = JSON.parse(packageSource);
  packageJson.dependencies.vue = "latest";
  await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
  assertGeneratedCheckers(output, 1, "framework dependency drift", { cwd: project, env: checkerEnvironment });
  await writeFile(packagePath, packageSource, "utf8");

  const buttonSource = await readFile(buttonPath, "utf8");
  await writeFile(buttonPath, `${buttonSource}\n// external drift\n`, "utf8");
  assertGeneratedCheckers(output, 1, "mapped source modification", { cwd: project, env: checkerEnvironment });
  await rm(buttonPath);
  assertGeneratedCheckers(output, 1, "mapped source deletion", { cwd: project, env: checkerEnvironment });
  await writeFile(buttonPath, buttonSource, "utf8");
  assertGeneratedCheckers(output, 0, "restored complete source closure", { cwd: project, env: checkerEnvironment });

  const linkedEvidenceTarget = join(workspace, "linked-evidence.css");
  const linkedEvidencePath = join(project, "src/linked-evidence.css");
  await writeFile(linkedEvidenceTarget, ":root { --linked-token: red; }\n", "utf8");
  if (await createLinkOrSkip(t, linkedEvidenceTarget, linkedEvidencePath, "file")) {
    assertGeneratedCheckers(output, 1, "eligible source symlink is incomplete evidence", { cwd: project, env: checkerEnvironment });
    await rm(linkedEvidencePath);
    assertGeneratedCheckers(output, 0, "restored ordinary standalone evidence", { cwd: project, env: checkerEnvironment });
  }

  const updateLinkTarget = join(workspace, "unsafe-update-source");
  const updateLinkPath = join(project, "src/unsafe-update-source");
  await mkdir(updateLinkTarget, { recursive: true });
  await writeFile(join(updateLinkTarget, "theme.css"), ":root { --linked-update: red; }\n", "utf8");
  if (await createLinkOrSkip(t, updateLinkTarget, updateLinkPath, "dir")) {
    assertGeneratedCheckers(output, 1, "source subtree junction invalidates standalone closure", { cwd: project, env: checkerEnvironment });
    const beforeUpdate = await snapshotDirectory(output);
    const blockedUpdate = runCliProcess(project, "update");
    assert.notEqual(blockedUpdate.status, 0, blockedUpdate.stdout || blockedUpdate.stderr);
    assert.match(blockedUpdate.stderr, /link|symbolic|junction|reparse/i);
    assert.deepEqual(await snapshotDirectory(output), beforeUpdate, "unsafe source evidence must block update before writes");
    await rm(updateLinkPath);
    assertGeneratedCheckers(output, 0, "restored standalone closure after junction removal", { cwd: project, env: checkerEnvironment });
  }
});

test("canonical-named candidates may use a confirmed wrapper when AST evidence supports it", async () => {
  const project = await makeReactProject("advisory-component-support");
  const sourceRoot = join(project, "src/components");
  await mkdir(sourceRoot, { recursive: true });
  await writeFile(
    join(sourceRoot, "Button.tsx"),
    `import type { ReactNode } from "react";
export interface ExistingButtonProps { text: ReactNode; pending?: boolean; tone?: "primary" | "secondary" | "ghost" | "danger"; }
export function Button({ text, pending = false }: ExistingButtonProps) { return <button disabled={pending}>{text}</button>; }
`,
    "utf8",
  );
  const output = join(project, "design-system");
  runCli(project, "extract");
  const planPath = join(output, "adoption/adoption-plan.json");
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  plan.status = "confirmed";
  plan.strategy = "preserve";
  for (const mapping of plan.tokenMappings) mapping.status = "rejected";
  const button = plan.componentMappings.find((mapping) => mapping.component === "button");
  assert.equal(button.strategy, "direct");
  button.status = "confirmed";
  button.strategy = "wrapper";
  button.propMap = [
    { canonicalProp: "children", sourceProp: "text", transform: "identity" },
    { canonicalProp: "loading", sourceProp: "pending", transform: "identity" },
    { canonicalProp: "variant", sourceProp: "tone", transform: "identity" },
  ];
  await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");

  const adopted = runCli(project, "adopt");

  assert.equal(adopted.runtime.mapped, 1);
  assert.match(await readFile(join(output, "runtime/react/src/adapters/Button.tsx"), "utf8"), /Button as SourceButton/);
  assert.equal(await exists(join(output, "runtime/react/src/generated-components.css")), false);
  assert.equal(JSON.parse(await readFile(join(output, "system.config.json"), "utf8")).sourceOfTruth.componentRuntimeStyles, null);
});

test("confirmed direct manual and approved generate strategies retain exact ownership", async (t) => {
  const project = await makeReactProject("mixed-component-ownership");
  const componentRoot = join(project, "src/components");
  const manualRoot = join(project, "src/adapters");
  await mkdir(componentRoot, { recursive: true });
  await mkdir(manualRoot, { recursive: true });
  const directPath = join(componentRoot, "Button.tsx");
  const manualPath = join(manualRoot, "Dialog.tsx");
  const directSource = `import type { ReactNode } from "react";
export interface ButtonProps { variant?: "primary" | "secondary" | "ghost" | "danger"; loading?: boolean; children: ReactNode; }
export function Button({ children, loading = false }: ButtonProps) { return <button disabled={loading}>{children}</button>; }
`;
  const manualSource = `import type { ReactNode } from "react";
export function Dialog({ open, title, onClose, children }: { open: boolean; title: ReactNode; onClose: () => void; children: ReactNode }) {
  return open ? <section role="dialog" aria-label={String(title)}>{children}<button onClick={onClose}>Close</button></section> : null;
}
`;
  await writeFile(directPath, directSource, "utf8");
  await writeFile(manualPath, manualSource, "utf8");

  const output = join(project, "design-system");
  runCli(project, "extract");
  const planPath = join(output, "adoption/adoption-plan.json");
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  plan.status = "confirmed";
  plan.strategy = "augment";
  for (const mapping of plan.tokenMappings) mapping.status = "rejected";
  for (const mapping of plan.componentMappings) {
    mapping.status = "rejected";
    mapping.strategy = "reject";
  }
  const button = plan.componentMappings.find((mapping) => mapping.component === "button" && mapping.source.path === "src/components/Button.tsx");
  button.status = "confirmed";
  button.strategy = "direct";
  button.source.propsExport = "ButtonProps";
  button.api = { props: ["variant", "loading", "children"] };
  plan.componentMappings.push({ component: "dialog", strategy: "manual", adapterPath: "src/adapters/Dialog.tsx", status: "confirmed" });
  plan.componentMappings.push({ component: "status", strategy: "generate", approved: true, status: "confirmed" });
  await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");

  const result = runCli(project, "adopt");
  assert.equal(result.runtime.mapped, 2);
  assert.equal(result.runtime.generated, 1);
  assert.equal(await readFile(manualPath, "utf8"), manualSource);
  assert.equal(await exists(join(output, "runtime/react/src/Button.tsx")), false);
  assert.equal(await exists(join(output, "runtime/react/src/Dialog.tsx")), false);
  assert.equal(await exists(join(output, "runtime/react/src/StatusBadge.tsx")), true);
  const generatedCssPath = join(output, "runtime/react/src/generated-components.css");
  const generatedCss = await readFile(generatedCssPath, "utf8");
  assert.match(generatedCss, /\.dc-status-badge/);
  assert.match(generatedCss, /\.dc-status-dot/);
  assert.doesNotMatch(generatedCss, /var\(\s*--[^,)]+\)/);
  assert.match(generatedCss, /var\(--font-sans,\s*[^)]+\)/);
  assert.match(generatedCss, /background:\s*var\([^,]+,\s*[^)]+\)/);
  assert.doesNotMatch(generatedCss, /\.dc-button(?:\W|$)|\.dc-dialog|\.dc-data-table|@keyframes/);
  const config = JSON.parse(await readFile(join(output, "system.config.json"), "utf8"));
  assert.equal(config.sourceOfTruth.componentRuntimeStyles, "runtime/react/src/generated-components.css");
  const barrel = await readFile(join(output, "runtime/react/src/index.ts"), "utf8");
  assert.ok(barrel.indexOf("Button") < barrel.indexOf("Dialog"));
  assert.ok(barrel.indexOf("Dialog") < barrel.indexOf("StatusBadge"));
  const manifest = JSON.parse(await readFile(join(output, "components/manifest.json"), "utf8"));
  assert.equal(manifest.families.find((family) => family.id === "button").origin, "existing");
  assert.equal(manifest.families.find((family) => family.id === "dialog").origin, "adapter");
  assert.equal(manifest.families.find((family) => family.id === "status").origin, "design-consultant");
  assert.equal(manifest.families.find((family) => family.id === "icon-button").origin, "design-consultant");
  assert.equal(manifest.families.filter((family) => family.availability === "runtime-ready").length, 3);
  assert.equal(manifest.families.filter((family) => family.availability === "contract-only").length, 5);

  const checker = join(output, "checks/check-component-runtime.mjs");
  const valid = spawnSync(process.execPath, [checker, output], { encoding: "utf8" });
  assert.equal(valid.status, 0, valid.stdout || valid.stderr);
  const attestationPath = join(output, "components/type-evidence-attestation.json");
  const attestationSource = await readFile(attestationPath, "utf8");
  const lockPath = join(output, ".design-consultant-lock.json");
  const lockSource = await readFile(lockPath, "utf8");
  const lock = JSON.parse(lockSource);
  assert.deepEqual(lock.files["components/type-evidence-attestation.json"], {
    source: "generated:component-type-evidence-attestation",
    generatedHash: sha256(attestationSource),
    templateHash: null,
    provenance: {
      schemaVersion: 1,
      type: "component-type-evidence-attestation",
      workflow: "existing-system-adoption",
    },
  });

  for (const [label, mutate] of [
    ["extra lock entry field", (entry) => { entry.unexpected = true; }],
    ["non-null lock templateHash", (entry) => { entry.templateHash = sha256("forged"); }],
    ["missing lock entry field", (entry) => { delete entry.generatedHash; }],
  ]) {
    const malformedLock = JSON.parse(lockSource);
    mutate(malformedLock.files["components/type-evidence-attestation.json"]);
    await writeFile(lockPath, `${JSON.stringify(malformedLock, null, 2)}\n`, "utf8");
    const beforeUpdate = await snapshotDirectory(output);
    const update = runCliProcess(project, "update");
    assert.equal(update.status, 2, `${label}: ${update.stdout || update.stderr}`);
    assert.equal(update.stdout, "");
    assert.deepEqual(await snapshotDirectory(output), beforeUpdate, `${label} must be zero-write`);
    assertGeneratedCheckers(output, 1, `${label} must fail both checkers`);
    await writeFile(lockPath, lockSource, "utf8");
  }

  const forgedDirect = `${directSource}\n// mapped source drift\n`;
  await writeFile(directPath, forgedDirect, "utf8");
  const selfSigned = JSON.parse(attestationSource);
  selfSigned.sourceFiles.find((file) => file.path === "src/components/Button.tsx").sha256 = sha256(forgedDirect, true);
  const { evidenceDigest: ignoredDigest, ...selfSignedBody } = selfSigned;
  selfSigned.evidenceDigest = sha256(JSON.stringify(selfSignedBody), true);
  await writeFile(attestationPath, `${JSON.stringify(selfSigned, null, 2)}\n`, "utf8");
  assertGeneratedCheckers(output, 1, "self-signed mapped source drift must not bypass the lock");
  await writeFile(directPath, directSource, "utf8");
  await writeFile(attestationPath, attestationSource, "utf8");

  const fieldDriftedAttestation = JSON.parse(attestationSource);
  fieldDriftedAttestation.projectOutput = "forged-output";
  const { evidenceDigest: ignoredFieldDigest, ...fieldDriftedBody } = fieldDriftedAttestation;
  fieldDriftedAttestation.evidenceDigest = sha256(JSON.stringify(fieldDriftedBody), true);
  await writeFile(attestationPath, `${JSON.stringify(fieldDriftedAttestation, null, 2)}\n`, "utf8");
  assertGeneratedCheckers(output, 1, "arbitrary attestation field drift must fail lock validation");
  await writeFile(attestationPath, attestationSource, "utf8");

  delete lock.files["components/type-evidence-attestation.json"];
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
  assertGeneratedCheckers(output, 1, "missing attestation lock entry must fail closed");
  await writeFile(lockPath, lockSource, "utf8");

  for (const [label, mutate] of [
    ["lock schema", (next) => { next.schemaVersion = 2; }],
    ["lock workflow", (next) => { next.workflow = "greenfield"; }],
    ["lock source", (next) => { next.files["components/type-evidence-attestation.json"].source = "user:forged"; }],
    ["lock provenance", (next) => { next.files["components/type-evidence-attestation.json"].provenance.type = "forged"; }],
  ]) {
    const driftedLock = JSON.parse(lockSource);
    mutate(driftedLock);
    await writeFile(lockPath, `${JSON.stringify(driftedLock, null, 2)}\n`, "utf8");
    assertGeneratedCheckers(output, 1, `${label} drift must fail closed`);
  }
  await writeFile(lockPath, lockSource, "utf8");
  assertGeneratedCheckers(output, 0, "restored lock-bound attestation");
  const adapterMapPath = join(output, "components/adapter-map.json");
  const adapterMapSource = await readFile(adapterMapPath, "utf8");
  const adapterMap = JSON.parse(adapterMapSource);
  adapterMap.mappings.find((mapping) => mapping.status === "rejected").sourceImplementationPath = "src/removed-evidence.tsx";
  await writeFile(adapterMapPath, `${JSON.stringify(adapterMap, null, 2)}\n`, "utf8");
  const mapDrift = spawnSync(process.execPath, [checker, output], { encoding: "utf8" });
  assert.equal(mapDrift.status, 1, mapDrift.stdout || mapDrift.stderr);
  const mapDriftIssues = JSON.parse(mapDrift.stdout).issues;
  assert.ok(mapDriftIssues.some((issue) => issue.rule === "adapter-map-drift"));
  assert.equal(mapDriftIssues.some((issue) => issue.rule === "source-path" && /removed-evidence/.test(issue.file)), false);
  await writeFile(adapterMapPath, adapterMapSource, "utf8");
  const manifestPath = join(output, "components/manifest.json");
  const manifestSource = await readFile(manifestPath, "utf8");
  const fieldDrifts = [
    ["status", (family) => { family.status = "contract"; }],
    ["framework", (family) => { family.framework = "vue"; }],
    ["exportName", (family) => { family.exportName = "OtherDialog"; }],
    ["implementationPath", (family) => { family.implementationPath = "src/OtherDialog.tsx"; }],
    ["importPath", (family) => { family.importPath = "./other"; }],
    ["api", (family) => { family.api.props.open = "string"; }],
    ["states", (family) => { family.states = ["open"]; }],
    ["origin", (family) => { family.origin = "existing"; }],
    ["mappingStatus", (family) => { family.mappingStatus = "rejected"; }],
    ["sourceImplementationPath", (family) => { family.sourceImplementationPath = "src/Other.tsx"; }],
    ["adapterPath", (family) => { family.adapterPath = "src/adapters/OtherDialog.tsx"; }],
    ["coverage", (family) => { family.coverage.runtime = 0; }],
    ["missing field", (family) => { delete family.adapterPath; }],
  ];
  for (const [field, mutate] of fieldDrifts) {
    const driftedManifest = JSON.parse(manifestSource);
    mutate(driftedManifest.families.find((family) => family.id === "dialog"));
    await writeFile(manifestPath, `${JSON.stringify(driftedManifest, null, 2)}\n`, "utf8");
    const manifestDrift = spawnSync(process.execPath, [checker, output], { encoding: "utf8" });
    assert.equal(manifestDrift.status, 1, `${field}: ${manifestDrift.stdout || manifestDrift.stderr}`);
    assert.ok(JSON.parse(manifestDrift.stdout).issues.some((issue) => issue.rule === "manifest-integrity"), `${field}: ${manifestDrift.stdout}`);
  }
  for (const [field, mutate] of [
    ["schema_version", (manifest) => { manifest.schema_version = "0.3"; }],
    ["runtime", (manifest) => { manifest.runtime.active = 0; }],
    ["adoption status", (manifest) => { manifest.runtime.adoption = false; }],
  ]) {
    const driftedManifest = JSON.parse(manifestSource);
    mutate(driftedManifest);
    await writeFile(manifestPath, `${JSON.stringify(driftedManifest, null, 2)}\n`, "utf8");
    const manifestDrift = spawnSync(process.execPath, [checker, output], { encoding: "utf8" });
    assert.equal(manifestDrift.status, 1, `${field}: ${manifestDrift.stdout || manifestDrift.stderr}`);
    assert.ok(JSON.parse(manifestDrift.stdout).issues.some((issue) => issue.rule === "manifest-integrity"), `${field}: ${manifestDrift.stdout}`);
  }
  for (const [field, mutate] of [
    ["non-array families", (next) => { next.families = {}; }],
    ["duplicate family", (next) => { next.families.push(structuredClone(next.families[0])); }],
    ["extra family", (next) => { next.families.push({ ...structuredClone(next.families[0]), id: "extra-family" }); }],
    ["missing family", (next) => { next.families.pop(); }],
    ["reordered families", (next) => { next.families.reverse(); }],
  ]) {
    const driftedManifest = JSON.parse(manifestSource);
    mutate(driftedManifest);
    await writeFile(manifestPath, `${JSON.stringify(driftedManifest, null, 2)}\n`, "utf8");
    const manifestDrift = spawnSync(process.execPath, [checker, output], { encoding: "utf8" });
    assert.equal(manifestDrift.status, 1, `${field}: ${manifestDrift.stdout || manifestDrift.stderr}`);
    assert.ok(JSON.parse(manifestDrift.stdout).issues.some((issue) => issue.rule === "manifest-integrity"), `${field}: ${manifestDrift.stdout}`);
  }
  await writeFile(manifestPath, manifestSource, "utf8");
  await writeFile(generatedCssPath, `${generatedCss}\n.dc-button { color: red; }\n`, "utf8");
  const styleDrift = spawnSync(process.execPath, [checker, output], { encoding: "utf8" });
  assert.equal(styleDrift.status, 1, styleDrift.stdout || styleDrift.stderr);
  assert.ok(JSON.parse(styleDrift.stdout).issues.some((issue) => issue.rule === "generated-styles-drift"));
  await writeFile(generatedCssPath, generatedCss, "utf8");
  const configPath = join(output, "system.config.json");
  const configSource = await readFile(configPath, "utf8");
  const driftedConfig = JSON.parse(configSource);
  driftedConfig.sourceOfTruth.componentRuntimeStyles = null;
  await writeFile(configPath, `${JSON.stringify(driftedConfig, null, 2)}\n`, "utf8");
  const configDrift = spawnSync(process.execPath, [checker, output], { encoding: "utf8" });
  assert.equal(configDrift.status, 1, configDrift.stdout || configDrift.stderr);
  assert.ok(JSON.parse(configDrift.stdout).issues.some((issue) => issue.rule === "component-config"));
  await writeFile(configPath, configSource, "utf8");
  const generatedPath = join(output, "runtime/react/src/StatusBadge.tsx");
  const generatedSource = await readFile(generatedPath, "utf8");
  for (const [path, broken, rule] of [
    [directPath, directSource.replace("children: ReactNode;", "children: ReactNode; unsafe?: string;"), "runtime-type-evidence"],
    [directPath, directSource.replace("function Button", "function BrokenButton"), "runtime-type-evidence"],
    [manualPath, manualSource.replace("export function Dialog", "// export function Dialog"), "runtime-type-evidence"],
    [manualPath, manualSource.replace("function Dialog", "function BrokenDialog"), "runtime-type-evidence"],
    [generatedPath, generatedSource.replace("function StatusBadge", "function BrokenStatusBadge"), "runtime-type-evidence"],
  ]) {
    const original = await readFile(path, "utf8");
    await writeFile(path, broken, "utf8");
    const invalid = spawnSync(process.execPath, [checker, output], { encoding: "utf8" });
    assert.equal(invalid.status, 1, invalid.stdout || invalid.stderr);
    assert.ok(JSON.parse(invalid.stdout).issues.some((issue) => issue.rule === rule), `${rule}: ${invalid.stdout}`);
    await writeFile(path, original, "utf8");
  }

  const workspace = dirname(project);
  const lockBackup = join(workspace, "linked-lock.json");
  await rename(lockPath, lockBackup);
  if (await createLinkOrSkip(t, lockBackup, lockPath, "file")) {
    assertGeneratedCheckers(output, 1, "lock symlink must fail output-contained ordinary-file validation");
    await rm(lockPath);
  }
  await rename(lockBackup, lockPath);

  const attestationBackup = join(workspace, "linked-attestation.json");
  await rename(attestationPath, attestationBackup);
  if (await createLinkOrSkip(t, attestationBackup, attestationPath, "file")) {
    assertGeneratedCheckers(output, 1, "attestation symlink must fail output-contained ordinary-file validation");
    await rm(attestationPath);
  }
  await rename(attestationBackup, attestationPath);

  const runtimeSourceRoot = join(output, "runtime/react/src");
  const escapedRuntimeRoot = join(project, "runtime-source-outside-output");
  await rename(runtimeSourceRoot, escapedRuntimeRoot);
  if (await createLinkOrSkip(t, escapedRuntimeRoot, runtimeSourceRoot, "dir")) {
    assertGeneratedCheckers(output, 1, "generated component ancestor junction must not escape canonical output");
  }
});

test("component update preflight cannot be bypassed by deleting one lock marker", async () => {
  const task5FixedPaths = new Set([
    "components/adapter-map.json",
    "components/manifest.json",
    "components/type-evidence-attestation.json",
    "runtime/react/src/index.ts",
    "runtime/react/src/generated-components.css",
    "checks/adoption/component-adapters.mjs",
    "checks/adoption/evidence-attestation.mjs",
    "checks/check-component-runtime.mjs",
  ]);
  const task5LockEntry = (path, entry) => task5FixedPaths.has(path)
    || path.startsWith("runtime/react/src/adapters/")
    || entry?.source?.startsWith("generated:component-wrapper:")
    || entry?.source?.startsWith("templates/react-runtime/src/");

  async function assertUpdateBlocked(label, mutate) {
    const { project, output } = await adoptGeneratedStatusProject(`component-preflight-${label.replaceAll(" ", "-")}`);
    const lockPath = join(output, ".design-consultant-lock.json");
    const lock = JSON.parse(await readFile(lockPath, "utf8"));
    await mutate({ output, lock });
    await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
    const before = await snapshotDirectory(output);

    const result = runCliProcess(project, "update");

    assert.equal(result.status, 2, `${label}: ${result.stdout || result.stderr}`);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /Task 5|component|attestation|incomplete/i);
    assert.deepEqual(await snapshotDirectory(output), before, `${label} must be zero-write`);
  }

  await assertUpdateBlocked("extra attestation field without adapter map lock", async ({ lock }) => {
    lock.files["components/type-evidence-attestation.json"].unexpected = true;
    delete lock.files["components/adapter-map.json"];
  });
  await assertUpdateBlocked("template hash drift without adapter map lock", async ({ lock }) => {
    lock.files["components/type-evidence-attestation.json"].templateHash = sha256("forged");
    delete lock.files["components/adapter-map.json"];
  });
  await assertUpdateBlocked("missing fixed component marker lock", async ({ lock }) => {
    delete lock.files["components/manifest.json"];
  });
  await assertUpdateBlocked("missing generated component lock", async ({ lock }) => {
    delete lock.files["runtime/react/src/StatusBadge.tsx"];
  });
  await assertUpdateBlocked("attestation-only disk marker", async ({ output, lock }) => {
    for (const [path, entry] of Object.entries(lock.files)) {
      if (task5LockEntry(path, entry) || path === "system.config.json") delete lock.files[path];
    }
    for (const path of [
      "components/adapter-map.json",
      "components/manifest.json",
      "runtime/react",
      "checks/adoption/component-adapters.mjs",
      "checks/adoption/evidence-attestation.mjs",
      "checks/check-component-runtime.mjs",
      "system.config.json",
    ]) {
      await rm(join(output, path), { recursive: true, force: true });
    }
  });
  await assertUpdateBlocked("runtime-only disk marker", async ({ output, lock }) => {
    for (const [path, entry] of Object.entries(lock.files)) {
      if (task5LockEntry(path, entry) || path === "system.config.json") delete lock.files[path];
    }
    for (const path of [
      "components/adapter-map.json",
      "components/manifest.json",
      "components/type-evidence-attestation.json",
      "runtime/react/src/generated-components.css",
      "checks/adoption/component-adapters.mjs",
      "checks/adoption/evidence-attestation.mjs",
      "checks/check-component-runtime.mjs",
      "system.config.json",
    ]) {
      await rm(join(output, path), { recursive: true, force: true });
    }
  });
});

test("component update preflight detects an adapter-only retained disk marker", async () => {
  const { project, output } = await adoptWrappedButtonProject("adapter-only-preflight");
  const lockPath = join(output, ".design-consultant-lock.json");
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  const task5FixedPaths = new Set([
    "components/adapter-map.json",
    "components/manifest.json",
    "components/type-evidence-attestation.json",
    "runtime/react/src/index.ts",
    "runtime/react/src/generated-components.css",
    "checks/adoption/component-adapters.mjs",
    "checks/adoption/evidence-attestation.mjs",
    "checks/check-component-runtime.mjs",
  ]);
  for (const [path, entry] of Object.entries(lock.files)) {
    if (
      task5FixedPaths.has(path)
      || path.startsWith("runtime/react/src/adapters/")
      || entry?.source?.startsWith("generated:component-wrapper:")
      || entry?.source?.startsWith("templates/react-runtime/src/")
    ) delete lock.files[path];
  }
  delete lock.adoption;

  const planPath = join(output, "adoption/adoption-plan.json");
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  plan.status = "draft";
  for (const mapping of plan.componentMappings) {
    mapping.status = "rejected";
    mapping.strategy = "reject";
    delete mapping.propMap;
  }
  const planSource = `${JSON.stringify(plan, null, 2)}\n`;
  await writeFile(planPath, planSource, "utf8");
  lock.files["adoption/adoption-plan.json"].generatedHash = sha256(planSource);

  const configPath = join(output, "system.config.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  for (const field of ["componentManifest", "componentRuntime", "componentTypeEvidence", "componentRuntimeStyles"]) {
    config.sourceOfTruth[field] = null;
  }
  for (const field of ["componentAdapterMap", "sharedComponentRoot", "sharedComponentExport"]) {
    config.integration[field] = null;
  }
  config.checks.componentRuntime = null;
  const configSource = `${JSON.stringify(config, null, 2)}\n`;
  await writeFile(configPath, configSource, "utf8");
  lock.files["system.config.json"].generatedHash = sha256(configSource);

  for (const path of [
    "components",
    "runtime/react/src/index.ts",
    "runtime/react/src/generated-components.css",
    "checks/adoption/component-adapters.mjs",
    "checks/adoption/evidence-attestation.mjs",
    "checks/check-component-runtime.mjs",
  ]) {
    await rm(join(output, path), { recursive: true, force: true });
  }
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
  const retainedAdapter = join(output, "runtime/react/src/adapters/Button.tsx");
  assert.equal(await exists(retainedAdapter), true);
  assert.deepEqual((await readdir(join(output, "runtime/react/src"))).sort(), ["adapters"]);
  const before = await snapshotDirectory(output);

  const result = runCliProcess(project, "update");

  assert.equal(result.status, 2, result.stdout || result.stderr);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Task 5|component|adapter|incomplete/i);
  assert.deepEqual(await snapshotDirectory(output), before);
});

test("component update preflight rejects linked runtime evidence before reading it", async (t) => {
  const { project, output } = await adoptWrappedButtonProject("linked-component-preflight");
  const original = await snapshotDirectory(output);
  const workspace = dirname(project);

  async function assertLinkedDirectoryRejected(label, targetPath, replaceFile = false) {
    const suffix = label.replaceAll(" ", "-");
    const outsidePath = join(workspace, `outside-${suffix}`);
    const fileBackup = join(workspace, `backup-${suffix}.json`);
    if (replaceFile) {
      await rename(targetPath, fileBackup);
      await mkdir(outsidePath, { recursive: true });
      await writeFile(join(outsidePath, "external.json"), "{not target json}\n", "utf8");
    } else {
      await rename(targetPath, outsidePath);
    }
    const linked = await createLinkOrSkip(t, outsidePath, targetPath, "dir");
    if (!linked) {
      if (replaceFile) {
        await rm(outsidePath, { recursive: true, force: true });
        await rename(fileBackup, targetPath);
      } else {
        await rename(outsidePath, targetPath);
      }
      return;
    }
    try {
      const result = runCliProcess(project, "update");
      assert.equal(result.status, 2, `${label}: ${result.stdout || result.stderr}`);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /preflight/i, `${label}: ${result.stderr}`);
      assert.match(result.stderr, /link|junction|reparse|outside|escape|contained/i, `${label}: ${result.stderr}`);
    } finally {
      await rm(targetPath, { recursive: true, force: true });
      if (replaceFile) {
        await rm(outsidePath, { recursive: true, force: true });
        await rename(fileBackup, targetPath);
      } else {
        await rename(outsidePath, targetPath);
      }
    }
    assert.deepEqual(await snapshotDirectory(output), original, `${label} must be zero-write`);
  }

  await assertLinkedDirectoryRejected("runtime root", join(output, "runtime/react/src"));
  await assertLinkedDirectoryRejected("adapters directory", join(output, "runtime/react/src/adapters"));
  await assertLinkedDirectoryRejected("component manifest", join(output, "components/manifest.json"), true);
  await assertLinkedDirectoryRejected("system config", join(output, "system.config.json"), true);
  await assertLinkedDirectoryRejected("adoption plan", join(output, "adoption/adoption-plan.json"), true);
});

test("wrapper compile failures abort before any Task 5 writes", async () => {
  const project = await makeReactProject("wrapper-compile-failure");
  await mkdir(join(project, "src/components"), { recursive: true });
  await writeFile(
    join(project, "src/components/PrimaryButton.tsx"),
    `import type { ReactNode } from "react";
interface Props { text: ReactNode; pending?: boolean; tone?: "primary" | "secondary" | "ghost" | "danger"; }
export function PrimaryButton(props: Props) { return { props }; }
`,
    "utf8",
  );
  const output = join(project, "design-system");
  runCli(project, "extract");
  const planPath = join(output, "adoption/adoption-plan.json");
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  plan.status = "confirmed";
  plan.strategy = "preserve";
  for (const mapping of plan.tokenMappings) mapping.status = "rejected";
  const button = plan.componentMappings.find((mapping) => mapping.component === "button");
  button.status = "confirmed";
  button.strategy = "wrapper";
  button.propMap = [
    { canonicalProp: "children", sourceProp: "text", transform: "identity" },
    { canonicalProp: "loading", sourceProp: "pending", transform: "identity" },
    { canonicalProp: "variant", sourceProp: "tone", transform: "identity" },
  ];
  await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  const lockPath = join(output, ".design-consultant-lock.json");
  const lockBefore = await readFile(lockPath, "utf8");

  const adopted = spawnSync(process.execPath, [SCRIPT_PATH, "adopt", "--target", project], { encoding: "utf8" });

  assert.equal(adopted.status, 2, adopted.stdout || adopted.stderr);
  assert.match(adopted.stderr, /compilation|jsx|component/i);
  for (const path of [
    "components/adapter-map.json",
    "components/manifest.json",
    "runtime/react/src/index.ts",
    "runtime/react/src/adapters/Button.tsx",
    "system.config.json",
  ]) assert.equal(await exists(join(output, path)), false, path);
  assert.equal(await readFile(lockPath, "utf8"), lockBefore);
});

test("wrapper destination collisions abort adoption without partial component artifacts", async () => {
  const project = await makeReactProject("wrapper-collision");
  const sourceRoot = join(project, "src/components");
  await mkdir(sourceRoot, { recursive: true });
  await writeFile(
    join(sourceRoot, "PrimaryButton.tsx"),
    `import type { ReactNode } from "react";
export interface PrimaryButtonProps { children: ReactNode; pending?: boolean; tone?: "primary" | "secondary" | "ghost" | "danger"; }
export function PrimaryButton({ children }: PrimaryButtonProps) { return <button>{children}</button>; }
`,
    "utf8",
  );
  const output = join(project, "design-system");
  runCli(project, "extract");
  const planPath = join(output, "adoption/adoption-plan.json");
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  plan.status = "confirmed";
  plan.strategy = "preserve";
  for (const mapping of plan.tokenMappings) mapping.status = "rejected";
  const button = plan.componentMappings.find((mapping) => mapping.component === "button");
  button.status = "confirmed";
  button.strategy = "wrapper";
  button.propMap = [
    { canonicalProp: "children", sourceProp: "children", transform: "identity" },
    { canonicalProp: "loading", sourceProp: "pending", transform: "identity" },
    { canonicalProp: "variant", sourceProp: "tone", transform: "identity" },
  ];
  await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  const collisionPath = join(output, "runtime/react/src/adapters/Button.tsx");
  await mkdir(dirname(collisionPath), { recursive: true });
  await writeFile(collisionPath, "// user-owned sentinel\n", "utf8");
  const lockBefore = await readFile(join(output, ".design-consultant-lock.json"), "utf8");

  const adopted = spawnSync(process.execPath, [SCRIPT_PATH, "adopt", "--target", project], { encoding: "utf8" });

  assert.equal(adopted.status, 2, adopted.stdout || adopted.stderr);
  assert.match(adopted.stderr, /component|adapter|artifact|safely/i);
  assert.equal(await readFile(collisionPath, "utf8"), "// user-owned sentinel\n");
  assert.equal(await exists(join(output, "components/adapter-map.json")), false);
  assert.equal(await exists(join(output, "components/manifest.json")), false);
  assert.equal(await exists(join(output, "runtime/react/src/index.ts")), false);
  assert.equal(await exists(join(output, "system.config.json")), false);
  assert.equal(await readFile(join(output, ".design-consultant-lock.json"), "utf8"), lockBefore);
});
