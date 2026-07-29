import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { link, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { dirname, extname, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import test from "node:test";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = resolve(SCRIPT_DIR, "..");
const REPO_ROOT = resolve(SKILL_ROOT, "../..");
const BUILD_SCRIPT = join(SCRIPT_DIR, "build-component-catalog.mjs");
const MANAGE_SCRIPT = join(SCRIPT_DIR, "manage-visual-system.mjs");
const EVIDENCE_SCRIPT = join(SCRIPT_DIR, "adoption/evidence-attestation.mjs");
const CATALOG_PROJECT_IDENTITY = "dc-project-v1:134fce78ef7c6f6b0adfa78ba7561bd400d4a1a4906aa8ed8ad6b5ab9edc4447";
const CORE_EXPORTS = [
  "Button",
  "IconButton",
  "FieldShell",
  "SelectField",
  "Dialog",
  "ResourcePanel",
  "StatusBadge",
  "DataTable",
  "BrandAttribution",
  "SearchableSelect",
  "CheckboxField",
  "CheckboxGroupField",
  "RadioGroupField",
  "SwitchField",
  "Tooltip",
  "PopoverCard",
  "ActionMenu",
  "InlineNotice",
  "ToastViewport",
];
const ADOPTION_PACKAGE_SCRIPTS = Object.freeze({
  "adoption:check": "node checks/check-adoption-contract.mjs --root .",
  "ui:baseline": "node checks/check-ui-contract.mjs --write-baseline",
  "ui:check": "node checks/check-ui-contract.mjs",
  "catalog:build": "node checks/build-component-catalog.mjs build",
  "catalog:check": "node checks/build-component-catalog.mjs check",
  "guard:ui": "node checks/check-ui-contract.mjs",
  "visual:inspect": "node checks/visual-regression.mjs inspect --config checks/adoption-visual.config.json",
  "visual:test": "node checks/visual-regression.mjs test --config checks/adoption-visual.config.json",
  "product:acceptance": "node checks/product-acceptance.mjs test --config checks/product-acceptance.config.mjs --project-root ..",
  "verify:system": "node checks/verify-project.mjs system",
  "verify:product": "node checks/verify-project.mjs product",
  "verify": "node checks/verify-project.mjs final",
});
const workspaces = [];

async function exists(path) {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function digest(content) {
  return createHash("sha256").update(content).digest("hex");
}

async function writeManagedArtifact(output, relativePath, content) {
  const artifactPath = join(output, ...relativePath.split("/"));
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
  await writeFile(artifactPath, buffer);
  const lockPath = join(output, ".design-consultant-lock.json");
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  assert.ok(lock.files?.[relativePath], `fixture lock must manage ${relativePath}`);
  lock.files[relativePath].generatedHash = digest(buffer);
  if (relativePath === "adoption/adoption-plan.json" && lock.adoption) {
    lock.adoption.plan = { path: relativePath, bytes: buffer.byteLength, digest: digest(buffer) };
  }
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
}

async function writeManagedJson(output, relativePath, mutate) {
  const value = JSON.parse(await readFile(join(output, ...relativePath.split("/")), "utf8"));
  mutate(value);
  await writeManagedArtifact(output, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function attestSourceBytes(output, relativePath, content) {
  const attestationPath = "components/type-evidence-attestation.json";
  const attestation = JSON.parse(await readFile(join(output, ...attestationPath.split("/")), "utf8"));
  const source = attestation.sourceFiles.find((file) => file.path === relativePath);
  assert.ok(source, `fixture attestation must include ${relativePath}`);
  source.sha256 = `sha256:${digest(content)}`;
  const closure = attestation.fileClosure?.find((file) => file.scope === "project" && file.path === relativePath);
  assert.ok(closure, `fixture file closure must include ${relativePath}`);
  closure.sha256 = `sha256:${digest(content)}`;
  const { evidenceDigest: ignoredEvidenceDigest, ...body } = attestation;
  attestation.evidenceDigest = `sha256:${digest(JSON.stringify(body))}`;
  await writeManagedArtifact(output, attestationPath, `${JSON.stringify(attestation, null, 2)}\n`);
}

function runCatalogBuilder(output, command = "build") {
  return spawnSync(process.execPath, [join(output, "checks/build-component-catalog.mjs"), command], {
    cwd: output,
    encoding: "utf8",
  });
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

async function startStaticServer(root) {
  const mime = new Map([[".css", "text/css"], [".html", "text/html"], [".js", "text/javascript"], [".json", "application/json"], [".png", "image/png"], [".woff2", "font/woff2"]]);
  const server = createServer(async (request, response) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url || "/", "http://localhost").pathname); }
    catch { response.writeHead(400).end("Bad request"); return; }
    const candidate = resolve(root, `.${normalize(pathname)}`);
    const fromRoot = relative(root, candidate);
    if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`)) { response.writeHead(403).end("Forbidden"); return; }
    try {
      const content = await readFile(candidate);
      response.writeHead(200, { "Content-Type": mime.get(extname(candidate).toLowerCase()) ?? "application/octet-stream", "Cache-Control": "no-store" });
      response.end(content);
    } catch (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500).end(error.code === "ENOENT" ? "Not found" : "Server error");
    }
  });
  await new Promise((accept, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", accept);
  });
  const address = server.address();
  return { origin: `http://127.0.0.1:${address.port}`, close: () => new Promise((accept) => server.close(accept)) };
}

function runProcess(command, args, options = {}) {
  return new Promise((accept) => {
    const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", (error) => accept({ status: null, stdout, stderr, error }));
    child.once("close", (status) => accept({ status, stdout, stderr }));
  });
}

function npmInvocation(script, cwd) {
  return process.platform === "win32"
    ? { command: process.env.ComSpec ?? "cmd.exe", args: ["/d", "/s", "/c", `npm run ${script}`], options: { cwd } }
    : { command: "npm", args: ["run", script], options: { cwd } };
}

async function runNpmScript(script, cwd) {
  const invocation = npmInvocation(script, cwd);
  return runProcess(invocation.command, invocation.args, invocation.options);
}

async function makeReactProject() {
  const base = join(REPO_ROOT, ".tmp");
  await mkdir(base, { recursive: true });
  const workspace = await mkdtemp(join(base, "design-consultant-catalog-"));
  workspaces.push(workspace);
  const project = join(workspace, "catalog-project");
  await mkdir(join(project, "src"), { recursive: true });
  await writeFile(join(project, "package.json"), `${JSON.stringify({
    name: "catalog-project",
    private: true,
    dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" },
  }, null, 2)}\n`, "utf8");
  return project;
}

async function makeAdaptedCatalogProject(outputRelative = "design-system") {
  return makeMatureAdaptedCatalogProject(outputRelative);
}

async function makeMatureAdaptedCatalogProject(outputRelative = "design-system", { confirmPrimary = true } = {}) {
  const project = await makeReactProject();
  const files = {
    "src/components/Button.tsx": `import type { ReactNode } from "react";
import { buttonEvidence } from "../utils";
import "../utils/require-entry.js";
// @ts-ignore fixture CSS dependency is resolved by the Catalog bundler.
import "../theme/nested-entry.css";
export interface ButtonProps { variant?: "primary" | "secondary" | "ghost" | "danger"; loading?: boolean; children: ReactNode; }
export function createButtonEvidenceWorker() { return new Worker(new URL("../workers/button-worker.ts", import.meta.url), { type: "module" }); }
export function Button(props: ButtonProps) { const { variant = "primary", loading = false, children } = props; const runtime = props as ButtonProps & { loadingLabel?: string; className?: string; disabled?: boolean; onClick?: () => void }; return <button type="button" onClick={runtime.onClick} className={\`existing-button \${runtime.className ?? ""}\`.trim()} data-evidence={buttonEvidence()} data-variant={variant} disabled={runtime.disabled || loading}>{loading ? (runtime.loadingLabel ?? "Loading") : children}</button>; }
`,
    "src/utils/index.ts": `export { buttonEvidence } from "./button-evidence";\n`,
    "src/utils/button-evidence.ts": `import { evidenceSuffix } from "./evidence-suffix";
void import("./lazy-evidence");
export function buttonEvidence() { return \`confirmed-\${evidenceSuffix}\`; }
`,
    "src/utils/evidence-suffix.ts": `export const evidenceSuffix = "closure";\n`,
    "src/utils/lazy-evidence.ts": `export const lazyEvidence = "loaded";\n`,
    "src/utils/require-entry.js": `const requiredEvidence = require("./require-evidence.js");\nexport const requireEvidence = requiredEvidence;\n`,
    "src/utils/require-evidence.js": `module.exports = "attested-static-require";\n`,
    "src/workers/button-worker.ts": `import { workerEvidence } from "./worker-helper";
self.addEventListener("message", () => self.postMessage(workerEvidence));
`,
    "src/workers/worker-helper.ts": `export const workerEvidence = "attested-worker";\n`,
    "src/components/ActionButton.tsx": `import type { ReactNode } from "react";
export interface ActionButtonProps { ariaLabel: string; tone?: "primary" | "secondary" | "ghost" | "danger"; icon: ReactNode; }
export function ActionButton({ ariaLabel, tone = "primary", icon }: ActionButtonProps) { return <button className="existing-icon-button" aria-label={ariaLabel} data-tone={tone}>{icon}</button>; }
`,
    "src/adapters/FieldShell.tsx": `import type { ReactNode } from "react";
export function FieldShell({ label, description, error, children }: { label: ReactNode; description?: ReactNode; error?: ReactNode; children: ReactNode }) { return <label className="existing-field"><strong>{label}</strong>{children}{error ?? description}</label>; }
`,
    "src/components/SelectField.tsx": `import type { ReactNode } from "react";
export interface SelectFieldProps { label: ReactNode; options: readonly { value: string; label: string; disabled?: boolean }[]; value: string; error?: ReactNode; }
export function SelectField({ label, options, value, error }: SelectFieldProps) { return <label className="existing-select"><strong>{label}</strong><select defaultValue={value}>{options.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}</select>{error}</label>; }
`,
    "src/components/Modal.tsx": `import { useEffect, type ReactNode } from "react";
export interface ModalProps { visible: boolean; heading: ReactNode; dismiss: () => void; content: ReactNode; }
export function Modal({ visible, heading, dismiss, content }: ModalProps) { useEffect(() => { if (!visible) return undefined; const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") dismiss(); }; document.addEventListener("keydown", onKeyDown); return () => document.removeEventListener("keydown", onKeyDown); }, [visible, dismiss]); return visible ? <section className="existing-dialog" role="dialog" aria-label="Fixture dialog"><h2>{heading}</h2><div>{content}</div><button onClick={dismiss}>Close</button></section> : null; }
`,
    "src/components/ResourcePanel.tsx": `import type { ReactNode } from "react";
export interface ResourcePanelProps { state: "ready" | "loading" | "empty" | "error" | "permission" | "partial"; title: ReactNode; children: ReactNode; }
export function ResourcePanel({ state = "ready", title = "Fixture resource", children }: ResourcePanelProps) { return <section className="existing-resource" data-state={state}><strong>{title}</strong>{children}</section>; }
`,
    "src/components/DataTable.tsx": `export interface DataTableProps { columns: readonly unknown[]; rows: readonly unknown[]; rowKey: string | ((row: unknown, index: number) => string | number); state: "ready" | "loading" | "empty" | "error" | "permission" | "partial"; }
export function DataTable({ columns, rows, rowKey, state = "ready" }: DataTableProps) { const items = rows as readonly Record<string, unknown>[]; const fields = columns as readonly { id?: string; header?: unknown; accessor?: string }[]; return <table className="existing-table" data-state={state}><thead><tr>{fields.map((field, index) => <th key={field.id ?? index}>{String(field.header ?? field.id ?? index)}</th>)}</tr></thead><tbody>{items.map((row, index) => <tr key={typeof rowKey === "function" ? rowKey(row, index) : \`\${row[rowKey] ?? ""}\`}>{fields.map((field, fieldIndex) => <td key={field.id ?? fieldIndex}>{\`\${row[field.accessor ?? field.id ?? ""] ?? ""}\`}</td>)}</tr>)}</tbody></table>; }
`,
    "src/theme/index.css": `:root { --brand-primary: #2457d6; --fixture-global-css: applied; }
.existing-button, .existing-icon-button { border: 3px solid var(--brand-primary); background: var(--primary); color: white; }
.existing-field, .existing-select { display: grid; gap: 6px; }
.existing-dialog, .existing-resource, .existing-table { border: 2px solid var(--brand-primary); }
`,
    "src/theme/nested-entry.css": `@import "./nested.css";\n`,
    "src/theme/nested.css": `@font-face { font-family: Fixture; src: url("./fixture.woff2?v=1#font"); }
.fixture-nested { background-image: url("./dot.png?v=1#mark"); }
`,
    "src/theme/dot.png": Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
    "src/theme/fixture.woff2": Buffer.from("fixture-font-data"),
    "src/theme/palette.css": `:root { --brand-surface: #f4f8fa; }
body { background: var(--brand-surface); }
`,
  };
  for (const [relativePath, source] of Object.entries(files)) {
    const path = join(project, ...relativePath.split("/"));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, source, typeof source === "string" ? "utf8" : undefined);
  }

  const extract = spawnSync(process.execPath, [MANAGE_SCRIPT, "extract", "--target", project, "--output", outputRelative], { encoding: "utf8" });
  assert.equal(extract.status, 0, extract.stdout || extract.stderr);
  const output = join(project, ...outputRelative.split("/"));
  const planPath = join(output, "adoption/adoption-plan.json");
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  plan.status = "confirmed";
  plan.strategy = "augment";
  for (const mapping of plan.tokenMappings) mapping.status = "rejected";
  const primary = plan.tokenMappings.find((mapping) => mapping.source?.name === "--brand-primary");
  assert.ok(primary, "fixture must expose --brand-primary");
  if (confirmPrimary) {
    Object.assign(primary, {
      status: "confirmed",
      canonicalToken: "semantic.color.primary",
      canonicalCssVariable: "--primary",
      theme: "light",
      selector: primary.source.selector,
      evidence: [`${primary.source.file}:${primary.source.line}`],
    });
    primary.source.kind = "css-variable";
  }

  const directProps = new Map([
    ["button", ["variant", "loading", "children"]],
    ["choice-field", ["label", "options", "value", "error"]],
    ["resource-state", ["state", "title", "children"]],
    ["data-table", ["columns", "rows", "rowKey", "state"]],
  ]);
  for (const mapping of plan.componentMappings) {
    if (directProps.has(mapping.component)) {
      mapping.status = "confirmed";
      mapping.strategy = "direct";
      const exportName = CORE_EXPORTS[["button", "icon-button", "field", "choice-field", "dialog", "resource-state", "status", "data-table"].indexOf(mapping.component)];
      mapping.source.propsExport = `${exportName}Props`;
      mapping.api = { props: directProps.get(mapping.component) };
    } else if (mapping.component === "icon-button") {
      mapping.status = "confirmed";
      mapping.strategy = "wrapper";
      mapping.propMap = [
        { canonicalProp: "label", sourceProp: "ariaLabel", transform: "identity" },
        { canonicalProp: "variant", sourceProp: "tone", transform: "identity" },
        { canonicalProp: "children", sourceProp: "icon", transform: "identity" },
      ];
    } else if (mapping.component === "dialog") {
      mapping.status = "confirmed";
      mapping.strategy = "wrapper";
      mapping.propMap = [
        { canonicalProp: "open", sourceProp: "visible", transform: "identity" },
        { canonicalProp: "title", sourceProp: "heading", transform: "identity" },
        { canonicalProp: "onClose", sourceProp: "dismiss", transform: "identity" },
        { canonicalProp: "children", sourceProp: "content", transform: "identity" },
      ];
    } else {
      mapping.status = "rejected";
      mapping.strategy = "reject";
    }
  }
  plan.componentMappings.push(
    { component: "field", strategy: "manual", adapterPath: "src/adapters/FieldShell.tsx", status: "confirmed" },
    { component: "status", strategy: "generate", approved: true, status: "confirmed" },
  );
  await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  const adopt = spawnSync(process.execPath, [MANAGE_SCRIPT, "adopt", "--target", project, "--output", outputRelative], { encoding: "utf8" });
  assert.equal(adopt.status, 0, adopt.stdout || adopt.stderr);
  return { project, output };
}

test.afterEach(async () => {
  while (workspaces.length > 0) await rm(workspaces.pop(), { recursive: true, force: true });
});

test("Catalog HTML 只保留挂载外壳，React 源码消费全部真实组件", async () => {
  const html = await readFile(join(SKILL_ROOT, "templates/component-library.html"), "utf8");
  const source = await readFile(join(SKILL_ROOT, "templates/catalog-react.tsx"), "utf8");
  const runtimeStyles = await readFile(join(SKILL_ROOT, "templates/react-runtime/src/styles.css"), "utf8");
  const attributionSource = await readFile(join(SKILL_ROOT, "templates/react-runtime/src/BrandAttribution.tsx"), "utf8");
  const attributionMasks = await readFile(join(SKILL_ROOT, "templates/react-runtime/src/brand-attribution-masks.ts"), "utf8");

  assert.match(html, /id="catalogRoot"/);
  assert.match(html, /component-library\.js/);
  assert.doesNotMatch(html, /<article class="component"/);
  assert.doesNotMatch(html, /class="btn(?:\s|\")/);
  assert.match(source, /from "@design-consultant\/runtime"/);
  for (const exportName of CORE_EXPORTS) assert.match(source, new RegExp(`\\b${exportName}\\b`));
  assert.match(source, /data-catalog-density/);
  assert.match(source, /visualizationSubmenu/);
  assert.match(source, /id="brand-attribution"/);
  assert.match(source, /<BrandAttribution variant="standard-stacked"/);
  assert.match(source, /<BrandAttribution variant="compact-horizontal"/);
  assert.match(attributionSource, /SPACE_WORDMARK_MASK/);
  assert.match(attributionSource, /SPACE_FOCUS_MASK/);
  assert.match(attributionSource, /SPACE_ORBIT_BACK_MASK/);
  assert.match(attributionSource, /SPACE_ORBIT_FRONT_MASK/);
  assert.match(runtimeStyles, /accent-orbit-only/);
  assert.match(attributionMasks, /data:image\/svg\+xml;base64,/);
  assert.match(source, /rail-footer/);
  assert.match(source, /account-surface-footer/);
  assert.match(source, /home-footer/);
  assert.doesNotMatch(source, /BrandAttributionVariant = "horizontal" \| "stacked" \| "mark"/);
  assert.doesNotMatch(html, /brandAttributionRoot/);
});

test("Catalog 目录顺序与正文一致，并提供可跟随滚动的锚点导航", async () => {
  const source = await readFile(join(SKILL_ROOT, "templates/catalog-react.tsx"), "utf8");
  const catalogBody = source.slice(source.indexOf("function ComponentCatalog"), source.indexOf("function App"));
  const orderedMarkers = [
    '<Section id="tokens"',
    'id="brand-attribution"',
    '<Section id="foundation"',
    '<Section id="actions"',
    '<Section id="data"',
    '<Section id="overlays"',
    '<Section id="feedback"',
    "<ReviewWorkbench />",
    "<AvailabilityIndex />",
  ];
  let previousIndex = -1;
  for (const marker of orderedMarkers) {
    const currentIndex = catalogBody.indexOf(marker);
    assert.ok(currentIndex > previousIndex, `${marker} 应位于上一章节之后`);
    previousIndex = currentIndex;
  }

  assert.match(source, /const catalogNavigationGroups/);
  assert.match(source, /label: "维护信息"/);
  assert.match(source, /const catalogSectionIds = \[\.\.\.catalogNavigationGroups, catalogMaintenanceNavigationGroup\]\.flatMap/);
  assert.match(source, /window\.addEventListener\("scroll", schedule/);
  assert.match(source, /route === next/);
  assert.match(source, /className="catalog-nav-backdrop"/);
  assert.match(source, /aria-current=\{!isVisualization && activeSection === item\.id/);
  assert.doesNotMatch(source, /\|\| "foundation"/);
  assert.doesNotMatch(source, /role="tablist"/);
});

test("Catalog bundle 可确定性构建并通过漂移检查", async () => {
  const workspace = await mkdtemp(join(REPO_ROOT, ".tmp/design-consultant-catalog-build-"));
  workspaces.push(workspace);
  const output = join(workspace, "component-library.js");
  const first = spawnSync(process.execPath, [BUILD_SCRIPT, "build", "--output", output], { encoding: "utf8" });
  assert.equal(first.status, 0, first.stdout || first.stderr);
  const firstHash = digest(await readFile(output));
  const second = spawnSync(process.execPath, [BUILD_SCRIPT, "build", "--output", output], { encoding: "utf8" });
  assert.equal(second.status, 0, second.stdout || second.stderr);
  assert.equal(digest(await readFile(output)), firstHash);

  const checked = spawnSync(process.execPath, [BUILD_SCRIPT, "check"], { encoding: "utf8" });
  assert.equal(checked.status, 0, checked.stdout || checked.stderr);
  const result = JSON.parse(checked.stdout);
  assert.equal(result.status, "current");
});

test("React 脚手架携带 Catalog 源码、bundle 与本地构建命令", async () => {
  const project = await makeReactProject();
  const generated = spawnSync(process.execPath, [MANAGE_SCRIPT, "init", "--target", project], { encoding: "utf8" });
  assert.equal(generated.status, 0, generated.stdout || generated.stderr);
  const output = join(project, "design-system");
  const html = await readFile(join(output, "catalog/component-library.html"), "utf8");
  const packageJson = JSON.parse(await readFile(join(output, "package.json"), "utf8"));

  assert.equal(await exists(join(output, "catalog/src/catalog.tsx")), true);
  assert.equal(await exists(join(output, "catalog/component-library.js")), true);
  assert.equal(await exists(join(output, "checks/build-component-catalog.mjs")), true);
  assert.equal(await exists(join(output, "checks/adoption/compatibility.mjs")), true);
  assert.equal(await exists(join(output, "checks/adoption/plan-contract.mjs")), true);
  assert.equal(await exists(join(output, "assets/brand/space-ai-native/space-mark-parametric-orbit-accent.svg")), true);
  assert.equal(await exists(join(output, "assets/brand/space-ai-native/space-mark-parametric-orbit-accent-dark.svg")), true);
  assert.equal(await exists(join(output, "assets/brand/space-ai-native/space-mark-parametric-wordmark-mask.svg")), true);
  assert.equal(await exists(join(output, "assets/brand/space-ai-native/space-mark-parametric-accent-mask.svg")), true);
  assert.equal(await exists(join(output, "assets/brand/space-ai-native/space-mark-parametric-focus-mask.svg")), true);
  assert.equal(await exists(join(output, "assets/brand/space-ai-native/space-mark-parametric-orbit-mask.svg")), true);
  assert.equal(await exists(join(output, "assets/brand/space-ai-native/space-mark-parametric-orbit-back-mask.svg")), true);
  assert.equal(await exists(join(output, "assets/brand/space-ai-native/space-mark-parametric-orbit-front-mask.svg")), true);
  assert.equal(await exists(join(output, "runtime/brand-attribution/space-mark-parametric-wordmark-mask.svg")), true);
  assert.equal(await exists(join(output, "runtime/brand-attribution/space-mark-parametric-accent-mask.svg")), true);
  assert.equal(await exists(join(output, "runtime/brand-attribution/space-mark-parametric-focus-mask.svg")), true);
  assert.equal(await exists(join(output, "runtime/brand-attribution/space-mark-parametric-orbit-mask.svg")), true);
  assert.equal(await exists(join(output, "runtime/brand-attribution/space-mark-parametric-orbit-back-mask.svg")), true);
  assert.equal(await exists(join(output, "runtime/brand-attribution/space-mark-parametric-orbit-front-mask.svg")), true);
  assert.equal(await exists(join(output, "runtime/react/src/ethnocentric-regular.otf")), true);
  assert.equal(await exists(join(output, "runtime/react/src/brand-attribution-masks.ts")), true);
  assert.equal(await exists(join(output, "runtime/react/src/BrandAttribution.tsx")), true);
  assert.match(html, /href="\.\.\/runtime\/react\/src\/styles\.css"/);
  assert.doesNotMatch(html, /brandAttributionRoot/);
  assert.equal(packageJson.scripts["catalog:build"], "node checks/build-component-catalog.mjs build");
  assert.equal(packageJson.scripts["catalog:check"], "node checks/build-component-catalog.mjs check");
  const built = await runNpmScript("catalog:build", output);
  assert.equal(built.status, 0, built.stdout || built.stderr || built.error?.message);
  const checked = await runNpmScript("catalog:check", output);
  assert.equal(checked.status, 0, checked.stdout || checked.stderr || checked.error?.message);
});

test("adapted Catalog consumes existing styles, the bridge and canonical runtime in order", async () => {
  const { output } = await makeAdaptedCatalogProject();
  const builder = join(output, "checks/build-component-catalog.mjs");
  const built = spawnSync(process.execPath, [builder, "build"], { cwd: output, encoding: "utf8" });
  assert.equal(built.status, 0, built.stdout || built.stderr);

  const generatedCatalogSource = join(output, "catalog/src/adoption-entry.tsx");
  const source = await readFile(generatedCatalogSource, "utf8");
  const existingStyle = source.indexOf("src/theme/index.css");
  const bridge = source.indexOf("tokens/external-bridge.css");
  const runtime = source.indexOf("@design-consultant/runtime");
  assert.ok(existingStyle >= 0 && existingStyle < bridge && bridge < runtime, source);
  assert.doesNotMatch(source, /PrimaryButton|@mui\/material/);
  assert.match(source, /catalog\.tsx/);

  const bundle = await readFile(join(output, "catalog/component-library.js"), "utf8");
  const existingDefinition = bundle.search(/--brand-primary:\s*#2457d6/);
  const bridgeDefinition = bundle.search(/--primary:\s*var\(--brand-primary\)/);
  assert.ok(existingDefinition >= 0 && existingDefinition < bridgeDefinition, bundle.slice(0, 2000));
  assert.match(bundle, /Existing/);
  assert.match(bundle, /Adapter/);
  assert.match(bundle, /Design Consultant/);
  assert.doesNotMatch(bundle, /migration\/plan|adoption-plan|componentMappings/);

  const checked = spawnSync(process.execPath, [builder, "check"], { cwd: output, encoding: "utf8" });
  assert.equal(checked.status, 0, checked.stdout || checked.stderr);
  assert.equal(JSON.parse(checked.stdout).status, "current");
});

test("adoption Catalog never installs or links greenfield Harbor tokens", async () => {
  const { output } = await makeAdaptedCatalogProject();
  const html = await readFile(join(output, "catalog/component-library.html"), "utf8");
  const foundation = await readFile(join(output, "catalog/catalog-foundation.css"), "utf8");
  const catalogStyles = await readFile(join(output, "catalog/component-library.css"), "utf8");
  const source = await readFile(join(output, "catalog/src/catalog.tsx"), "utf8");
  const visualization = await readFile(join(output, "visualizations/lieflat/lupi-gallery.html"), "utf8");

  assert.equal(await exists(join(output, "tokens/tokens.css")), false);
  assert.doesNotMatch(html, /tokens\/tokens\.css|href=["'][^"']*tokens\.css/i);
  assert.match(`${foundation}\n${catalogStyles}`, /--dc-catalog-/);
  assert.doesNotMatch(`${foundation}\n${catalogStyles}`, /(?:^|[;{]\s*)--primary\s*:|palette-harbor|var\(--primary\)/im);
  assert.doesNotMatch(source, /harbor|coral|palette-harbor|--primary/i);
  assert.match(visualization, /href="\.\.\/\.\.\/tokens\/external-bridge\.css"/);
  assert.doesNotMatch(visualization, /tokens\/tokens\.css/);

  const privateDefinitions = new Set(
    [...foundation.matchAll(/(--dc-catalog-[a-z0-9-]+)\s*:/gi)].map((match) => match[1]),
  );
  const privateReferences = new Set(
    [...`${foundation}\n${catalogStyles}`.matchAll(/var\(\s*(--dc-catalog-[a-z0-9-]+)/gi)].map((match) => match[1]),
  );
  assert.deepEqual([...privateReferences].filter((name) => !privateDefinitions.has(name)).sort(), []);
});

test("missing adoption token mappings are not masked by Catalog defaults", async () => {
  const { output } = await makeMatureAdaptedCatalogProject("design-system", { confirmPrimary: false });
  const files = [
    "catalog/catalog-foundation.css",
    "catalog/component-library.css",
    "catalog/component-library.html",
    "catalog/src/catalog.tsx",
  ];
  const emitted = (await Promise.all(files.map((path) => readFile(join(output, ...path.split("/")), "utf8")))).join("\n");

  assert.equal(await exists(join(output, "tokens/tokens.css")), false);
  assert.equal(await exists(join(output, "tokens/external-bridge.css")), false);
  assert.doesNotMatch(emitted, /(?:^|[;{]\s*)--primary\s*:/im);
  assert.doesNotMatch(emitted, /palette-harbor|#0F6CDD|#0f6cdd/i);
});

test("adapted Catalog rejects unsafe or missing declared existing styles", async () => {
  for (const file of ["../outside.css", "src\\theme.css", "C:/theme.css", "src/missing.css"]) {
    const { output } = await makeAdaptedCatalogProject();
    await writeManagedJson(output, "adoption/adoption-plan.json", (plan) => {
      plan.tokenMappings.find((mapping) => mapping.status === "confirmed").source.file = file;
    });

    const result = spawnSync(process.execPath, [join(output, "checks/build-component-catalog.mjs"), "build"], { cwd: output, encoding: "utf8" });
    assert.notEqual(result.status, 0, file);
    assert.match(result.stderr, /style|path|missing|safe/i, file);
    assert.equal(await exists(join(output, "catalog/src/adoption-entry.tsx")), false, file);
  }
});

test("adapted Catalog resolves existing styles from a nested managed output", async () => {
  const { output } = await makeAdaptedCatalogProject("tools/design-system");
  const builder = join(output, "checks/build-component-catalog.mjs");
  const built = spawnSync(process.execPath, [builder, "build"], { cwd: output, encoding: "utf8" });
  assert.equal(built.status, 0, built.stdout || built.stderr);
  assert.match(await readFile(join(output, "catalog/src/adoption-entry.tsx"), "utf8"), /src\/theme\/index\.css/);
});

test("adapted Catalog refuses a hard-linked generated entry without changing its other identity", async () => {
  const { project, output } = await makeAdaptedCatalogProject();
  const external = join(project, "outside-adoption-entry.tsx");
  const entry = join(output, "catalog/src/adoption-entry.tsx");
  const original = Buffer.from("external identity must remain unchanged\n");
  await writeFile(external, original);
  await link(external, entry);

  const built = runCatalogBuilder(output);
  assert.notEqual(built.status, 0, built.stdout || built.stderr);
  assert.match(built.stderr, /hard.?link|identity|linked|ordinary/i);
  assert.deepEqual(await readFile(external), original);
});

test("real eight-component adoption emits the Task 7 Catalog and visual verification surface", async () => {
  const { output } = await makeMatureAdaptedCatalogProject();
  for (const path of [
    "catalog/src/catalog.tsx",
    "catalog/component-library.html",
    "checks/build-component-catalog.mjs",
    "checks/visual-regression.mjs",
    "checks/adoption-visual.config.json",
    "package.json",
  ]) assert.equal(await exists(join(output, path)), true, path);

  const packageJson = JSON.parse(await readFile(join(output, "package.json"), "utf8"));
  assert.deepEqual(packageJson.scripts, ADOPTION_PACKAGE_SCRIPTS);
  assert.equal(packageJson.devDependencies["@babel/parser"], "7.28.5");
  assert.equal(packageJson.devDependencies["@babel/traverse"], "7.28.5");
  for (const command of Object.values(packageJson.scripts)) {
    const match = /^node ([^ ]+)(?: |$)/.exec(command);
    assert.ok(match, `script must invoke an installed Node entry: ${command}`);
    assert.equal(await exists(join(output, ...match[1].split("/"))), true, match[1]);
  }
  const attestation = JSON.parse(await readFile(join(output, "components/type-evidence-attestation.json"), "utf8"));
  assert.equal(attestation.schemaVersion, 3);
  for (const path of [
    "src/utils/index.ts",
    "src/utils/button-evidence.ts",
    "src/utils/evidence-suffix.ts",
    "src/utils/lazy-evidence.ts",
    "src/utils/require-entry.js",
    "src/utils/require-evidence.js",
    "src/workers/button-worker.ts",
    "src/workers/worker-helper.ts",
    "src/theme/nested-entry.css",
    "src/theme/nested.css",
    "src/theme/dot.png",
    "src/theme/fixture.woff2",
  ]) {
    const entry = attestation.fileClosure.find((file) => file.scope === "project" && file.path === path);
    assert.ok(entry, `missing dependency closure ${path}`);
    assert.match(entry.sha256, /^sha256:[a-f0-9]{64}$/);
    assert.match(entry.purpose, /component:Button|style:/);
  }
  const config = JSON.parse(await readFile(join(output, "system.config.json"), "utf8"));
  assert.equal(config.sourceOfTruth.catalogSource, "catalog/src/catalog.tsx");
  assert.equal(config.sourceOfTruth.catalogBundle, "catalog/component-library.js");
  assert.equal(config.checks.catalogBuild, "checks/build-component-catalog.mjs");
  assert.equal(config.checks.visualRegression, "checks/visual-regression.mjs");
  const lock = JSON.parse(await readFile(join(output, ".design-consultant-lock.json"), "utf8"));
  const inventory = JSON.parse(await readFile(join(output, "intake/extraction-report.json"), "utf8"));
  const visualConfig = JSON.parse(await readFile(join(output, "checks/adoption-visual.config.json"), "utf8"));
  const visualTemplate = JSON.parse(await readFile(join(SKILL_ROOT, "templates/adoption-visual.config.json"), "utf8"));
  const { deriveProjectIdentity } = await import(`${pathToFileURL(join(SCRIPT_DIR, "adoption/compatibility.mjs")).href}?catalog-identity=${Date.now()}`);
  assert.equal(lock.adoption.projectIdentity, deriveProjectIdentity(inventory));
  assert.equal(visualConfig.projectIdentity, lock.adoption.projectIdentity);
  assert.notEqual(visualConfig.projectIdentity, visualTemplate.projectIdentity);
  const catalogPointer = JSON.parse(await readFile(join(output, "checks/visual-baselines/current.json"), "utf8"));
  assert.equal(catalogPointer.projectIdentity, CATALOG_PROJECT_IDENTITY);
  assert.notEqual(catalogPointer.projectIdentity, lock.adoption.projectIdentity);
});

test("existing adoption package contract rejects manifest, provenance and script-target drift", async () => {
  const { output } = await makeMatureAdaptedCatalogProject();
  const packagePath = join(output, "package.json");
  const lockPath = join(output, ".design-consultant-lock.json");
  const visualPath = join(output, "checks/visual-regression.mjs");
  const validator = join(output, "checks/check-adoption-contract.mjs");
  const originalPackage = await readFile(packagePath);
  const originalLock = await readFile(lockPath);
  const originalVisual = await readFile(visualPath);

  const runContract = () => spawnSync(process.execPath, [validator, output], { cwd: output, encoding: "utf8" });

  const tampered = JSON.parse(originalPackage.toString("utf8"));
  tampered.scripts["tokens:check"] = "node checks/missing-token-check.mjs";
  await writeFile(packagePath, `${JSON.stringify(tampered, null, 2)}\n`, "utf8");
  let checked = runContract();
  assert.equal(checked.status, 1, checked.stdout || checked.stderr);
  assert.match(checked.stdout, /managed-adoption-package|package-script-contract/i);

  await writeFile(packagePath, originalPackage);
  const badLock = JSON.parse(originalLock.toString("utf8"));
  badLock.files["package.json"].source = "templates/design-system-package.json";
  await writeFile(lockPath, `${JSON.stringify(badLock, null, 2)}\n`, "utf8");
  checked = runContract();
  assert.equal(checked.status, 1, checked.stdout || checked.stderr);
  assert.match(checked.stdout, /managed-adoption-package|package-lock-provenance/i);

  await writeFile(lockPath, originalLock);
  await rm(visualPath);
  checked = runContract();
  assert.equal(checked.status, 1, checked.stdout || checked.stderr);
  assert.match(checked.stdout, /package-script-target/i);
  await writeFile(visualPath, originalVisual);
});

test("adoption contract rejects a managed visual config whose project identity differs from the confirmed lock", async () => {
  const { output } = await makeMatureAdaptedCatalogProject();
  await writeManagedJson(output, "checks/adoption-visual.config.json", (config) => {
    config.projectIdentity = `dc-project-v1:${"f".repeat(64)}`;
  });
  const checked = spawnSync(process.execPath, [join(output, "checks/check-adoption-contract.mjs"), output], { cwd: output, encoding: "utf8" });
  assert.equal(checked.status, 1, checked.stdout || checked.stderr);
  assert.match(checked.stdout, /project.*identity|identity.*project/i);
});

test("matching forged lock and visual identities still fail the confirmed inventory derivation", async () => {
  const { output } = await makeMatureAdaptedCatalogProject();
  const forgedIdentity = `dc-project-v1:${"f".repeat(64)}`;
  await writeManagedJson(output, "checks/adoption-visual.config.json", (config) => {
    config.projectIdentity = forgedIdentity;
  });
  const lockPath = join(output, ".design-consultant-lock.json");
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  lock.adoption.projectIdentity = forgedIdentity;
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");

  const checked = spawnSync(process.execPath, [join(output, "checks/check-adoption-contract.mjs"), output], { cwd: output, encoding: "utf8" });
  assert.equal(checked.status, 1, checked.stdout || checked.stderr);
  assert.match(checked.stdout, /project.*identity|identity.*inventory/i);

  const built = runCatalogBuilder(output);
  assert.notEqual(built.status, 0, built.stdout || built.stderr);
  assert.match(built.stderr, /project identity.*inventory|inventory.*project identity/i);
});

test("adoption contract leaves the derived Catalog bundle to catalog:check and resolves visualization fragments", async () => {
  const { output } = await makeMatureAdaptedCatalogProject();
  const configSource = await readFile(join(output, "system.config.json"), "utf8");
  assert.equal(await exists(join(output, "catalog/component-library.js")), false);
  const checked = spawnSync(process.execPath, [join(output, "checks/check-adoption-contract.mjs"), output], { encoding: "utf8" });
  assert.equal(checked.status, 0, checked.stdout || checked.stderr);
  const stale = runCatalogBuilder(output, "check");
  assert.equal(stale.status, 2, stale.stdout || stale.stderr);
  assert.equal(JSON.parse(stale.stdout).reason, "missing-output");

  await writeManagedJson(output, "system.config.json", (config) => { config.sourceOfTruth.catalogBundle = "catalog/missing.js"; });
  const wrongBundle = spawnSync(process.execPath, [join(output, "checks/check-adoption-contract.mjs"), output], { encoding: "utf8" });
  assert.equal(wrongBundle.status, 1, wrongBundle.stdout || wrongBundle.stderr);
  assert.match(wrongBundle.stdout, /missing-config-path|catalog\/missing\.js/i);

  await writeManagedArtifact(output, "system.config.json", configSource);
  await writeManagedJson(output, "system.config.json", (config) => { config.sourceOfTruth.visualizationCatalog = "catalog/component-library.html?route=login"; });
  const badFragment = spawnSync(process.execPath, [join(output, "checks/check-adoption-contract.mjs"), output], { encoding: "utf8" });
  assert.equal(badFragment.status, 1, badFragment.stdout || badFragment.stderr);
  assert.match(badFragment.stdout, /invalid-config-path|visualizationCatalog/i);
});

test("adoption detection is lock-owned and rejects malformed or conflicting strategy state", async () => {
  const { output } = await makeMatureAdaptedCatalogProject();
  const configPath = join(output, "system.config.json");
  const lockPath = join(output, ".design-consultant-lock.json");
  const originalConfig = await readFile(configPath, "utf8");
  const originalLock = await readFile(lockPath, "utf8");
  const cases = [
    ["malformed strategy", async () => writeManagedJson(output, "system.config.json", (config) => { config.integration.adoptionStrategy = "sidegrade"; })],
    ["missing config strategy", async () => writeManagedJson(output, "system.config.json", (config) => { delete config.integration.adoptionStrategy; })],
    ["system config framework mismatch", async () => writeManagedJson(output, "system.config.json", (config) => { config.integration.framework = "Vue"; })],
    ["lock/config strategy mismatch", async () => writeManagedJson(output, "system.config.json", (config) => { config.integration.adoptionStrategy = "preserve"; })],
    ["malformed lock strategy", async () => {
      const lock = JSON.parse(originalLock);
      lock.adoption.strategy = "sidegrade";
      await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
    }],
    ["missing lock strategy", async () => {
      const lock = JSON.parse(originalLock);
      delete lock.adoption.strategy;
      await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
    }],
    ["missing lock project identity", async () => {
      const lock = JSON.parse(originalLock);
      delete lock.adoption.projectIdentity;
      await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
    }],
    ["malformed lock project identity", async () => {
      const lock = JSON.parse(originalLock);
      lock.adoption.projectIdentity = "PROJECT_IDENTITY";
      await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
    }],
    ["extra lock adoption field", async () => {
      const lock = JSON.parse(originalLock);
      lock.adoption.unexpected = true;
      await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
    }],
    ["unknown lock workflow", async () => {
      const lock = JSON.parse(originalLock);
      lock.workflow = "legacy-adoption";
      await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
    }],
    ["wrong lock schema", async () => {
      const lock = JSON.parse(originalLock);
      lock.schemaVersion = 2;
      await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
    }],
    ["wrong lock owner", async () => {
      const lock = JSON.parse(originalLock);
      lock.skill = "other-skill";
      await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
    }],
    ["greenfield lock with adoption config", async () => {
      const lock = JSON.parse(originalLock);
      lock.workflow = "greenfield";
      delete lock.adoption;
      await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
    }],
    ["managed output mismatch", async () => {
      const lock = JSON.parse(originalLock);
      lock.output = "other-design-system";
      await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
    }],
  ];

  for (const [label, mutate] of cases) {
    await writeFile(configPath, originalConfig);
    await writeFile(lockPath, originalLock);
    await mutate();
    const result = runCatalogBuilder(output);
    assert.notEqual(result.status, 0, label);
    assert.match(result.stderr, /adoption|strategy|workflow|lock|output|config/i, label);
  }
});

test("adapted provenance requires the exact eight canonical families and runtime-backed origins", async () => {
  const { output } = await makeMatureAdaptedCatalogProject();
  const manifestPath = join(output, "components/manifest.json");
  const lockPath = join(output, ".design-consultant-lock.json");
  const originalManifest = await readFile(manifestPath, "utf8");
  const originalLock = await readFile(lockPath, "utf8");
  const cases = [
    ["duplicate export", (manifest) => { manifest.families[1].exportName = manifest.families[0].exportName; }],
    ["missing family", (manifest) => { manifest.families.pop(); }],
    ["unknown family", (manifest) => { manifest.families[0].id = "unknown"; }],
    ["extra family", (manifest) => { manifest.families.push({ ...manifest.families[0], id: "extra", exportName: "Extra" }); }],
    ["unknown origin", (manifest) => { manifest.families[0].origin = "react"; }],
    ["origin disagrees with adapter map", (manifest) => { manifest.families[0].origin = "adapter"; }],
    ["runtime framework drift", (manifest) => { manifest.runtime.framework = "vue"; }],
    ["family framework drift", (manifest) => { manifest.families[0].framework = "vue"; }],
    ["duplicate implementation", (manifest) => { manifest.families[1].implementationPath = manifest.families[0].implementationPath; }],
  ];

  for (const [label, mutate] of cases) {
    await writeFile(manifestPath, originalManifest);
    await writeFile(lockPath, originalLock);
    await writeManagedJson(output, "components/manifest.json", mutate);
    const result = runCatalogBuilder(output);
    assert.notEqual(result.status, 0, label);
    assert.match(result.stderr, /component|family|manifest|origin|runtime|implementation|export/i, label);
  }
});

test("adapted Catalog rejects live implementation bytes that drift from Task 5 type evidence", async () => {
  const { project, output } = await makeMatureAdaptedCatalogProject();
  const buttonPath = join(project, "src/components/Button.tsx");
  await writeFile(buttonPath, `${await readFile(buttonPath, "utf8")}\n// drift after adoption\n`, "utf8");
  const result = runCatalogBuilder(output);
  assert.notEqual(result.status, 0, result.stdout || result.stderr);
  assert.match(result.stderr, /attestation|type evidence|source bytes|drift/i);
});

test("attested transitive source closure accepts confirmed dependencies and rejects every post-adopt drift", async () => {
  const initial = await makeMatureAdaptedCatalogProject();
  const safe = runCatalogBuilder(initial.output);
  assert.equal(safe.status, 0, safe.stdout || safe.stderr);
  assert.match(await readFile(join(initial.output, "catalog/component-library.js"), "utf8"), /fixture-nested/);

  for (const relativePath of ["src/theme/nested.css", "src/theme/dot.png", "src/utils/evidence-suffix.ts", "src/workers/worker-helper.ts"]) {
    const { project, output } = await makeMatureAdaptedCatalogProject();
    const path = join(project, ...relativePath.split("/"));
    const original = await readFile(path);
    await writeFile(path, Buffer.concat([original, Buffer.from("\npost-adopt-drift\n")]));
    const result = runCatalogBuilder(output);
    assert.notEqual(result.status, 0, relativePath);
    assert.match(result.stderr, /attestation|file closure|dependency|source bytes|drift|hash/i, relativePath);
  }

  const { project, output } = await makeMatureAdaptedCatalogProject();
  const helperPath = join(project, "src/utils/post-adopt-helper.ts");
  await writeFile(helperPath, 'export const postAdoptHelper = "unconfirmed";\n', "utf8");
  const buttonPath = join(project, "src/components/Button.tsx");
  const buttonSource = `import { postAdoptHelper } from "../utils/post-adopt-helper";\n${await readFile(buttonPath, "utf8")}\nvoid postAdoptHelper;\n`;
  await writeFile(buttonPath, buttonSource, "utf8");
  await attestSourceBytes(output, "src/components/Button.tsx", buttonSource);
  const added = runCatalogBuilder(output);
  assert.notEqual(added.status, 0, added.stdout || added.stderr);
  assert.match(added.stderr, /attestation|file closure|dependency|unconfirmed|graph/i);

  const dynamic = await makeMatureAdaptedCatalogProject();
  const dynamicButtonPath = join(dynamic.project, "src/components/Button.tsx");
  const originalDynamicButtonSource = await readFile(dynamicButtonPath, "utf8");
  const dynamicButtonSource = `${originalDynamicButtonSource}\nconst dynamicWorkerPath = "../workers/button-worker.ts";\nexport function createDynamicWorker() { return new Worker(new URL(dynamicWorkerPath, import.meta.url)); }\n`;
  await writeFile(dynamicButtonPath, dynamicButtonSource, "utf8");
  await attestSourceBytes(dynamic.output, "src/components/Button.tsx", dynamicButtonSource);
  const generatedEvidence = await import(`${pathToFileURL(join(dynamic.output, "checks/adoption/evidence-attestation.mjs")).href}?dynamic-worker`);
  await assert.rejects(
    () => generatedEvidence.staticWorkerDependencies(dynamicButtonSource, dynamicButtonPath),
    /worker.*static|runtime dependency.*Worker/i,
  );
  const dynamicResult = runCatalogBuilder(dynamic.output);
  assert.notEqual(dynamicResult.status, 0, dynamicResult.stdout || dynamicResult.stderr);
  assert.match(dynamicResult.stderr, /worker.*static|runtime dependency.*Worker|attest/i);

  const remoteButtonSource = `${originalDynamicButtonSource}\nexport function createRemoteWorker() { return new Worker("https://example.com/worker.js"); }\n`;
  await writeFile(dynamicButtonPath, remoteButtonSource, "utf8");
  await attestSourceBytes(dynamic.output, "src/components/Button.tsx", remoteButtonSource);
  const remoteResult = runCatalogBuilder(dynamic.output);
  assert.notEqual(remoteResult.status, 0, remoteResult.stdout || remoteResult.stderr);
  assert.match(remoteResult.stderr, /non-local worker|protocol|URL|attest/i);
});

test("runtime dependency AST audit rejects unprovable loaders and accepts only canonical static forms", async () => {
  const { staticWorkerDependencies } = await import(`${pathToFileURL(EVIDENCE_SCRIPT).href}?runtime-audit=${Date.now()}`);
  const rejected = [
    ["dynamic import", 'const path = "./helper.js"; void import(path);'],
    ["dynamic require", 'const path = "./helper.cjs"; require(path);'],
    ["import meta glob", 'const modules = import.meta.glob("./*.ts");'],
    ["import meta glob eager", 'const modules = import.meta["globEager"]("./*.ts");'],
    ["service worker", 'navigator.serviceWorker.register("./sw.js");'],
    ["destructured service worker", 'const { serviceWorker } = navigator; serviceWorker.register("./sw.js");'],
    ["non-worker import meta URL", 'const asset = new URL("./asset.png", import.meta.url);'],
    ["aliased import meta URL", 'const metaUrl = import.meta.url; const asset = new URL("./asset.png", metaUrl);'],
    ["global Worker", 'new globalThis.Worker("./worker.js");'],
    ["computed Worker", 'new globalThis["Worker"]("./worker.js");'],
    ["concatenated computed Worker", 'new globalThis["Wor" + "ker"]("./worker.js");'],
    ["optional concatenated Worker", 'globalThis?.["Wor" + "ker"]?.("./worker.js");'],
    ["destructured Worker", 'const { Worker: W } = globalThis; new W("./worker.js");'],
    ["aliased Worker", 'const W = Worker; new W("./worker.js");'],
    ["dynamic Worker", 'const path = "./worker.js"; new Worker(path);'],
    ["eval", 'eval("import(\\"./helper.js\\")");'],
    ["nested computed eval", 'export const View = () => <button onClick={() => globalThis?.["eval"]?.("1+1")} />;'],
    ["Function constructor", 'const Factory = Function; new Factory("return 1");'],
    ["global object constructor chain", 'globalThis.constructor.constructor(\'return import("./escape.js")\')();'],
    ["object literal constructor chain", '({}).constructor.constructor(\'return require("./escape.js")\')();'],
    ["array method constructor chain", '[]["filter"]["constructor"](\'return fetch("./asset.json")\')();'],
    ["prototype constructor", 'const fn = () => {}; Object.getPrototypeOf(fn).constructor("return 1")();'],
    ["concatenated constructor", 'const fn = () => {}; fn["con" + "structor"]("return 1")();'],
    ["prototype constructor member", 'const prototype = {}; prototype.constructor("return 1")();'],
    ["local custom constructor member", 'const local = { constructor: (value) => value }; local.constructor("value");'],
    ["optional constructor call", 'const fn = () => {}; fn?.constructor?.("return 1")?.();'],
    ["sequence constructor call", '(0, ({}).constructor.constructor)("return 1")();'],
    ["tagged constructor template", '[]["filter"]["constructor"]`return 1`;'],
    ["WebAssembly streaming", 'WebAssembly.instantiateStreaming(fetch("https://api.example.com/module.wasm"));'],
    ["WebAssembly memory", 'const memory = new WebAssembly.Memory({ initial: 1 });'],
    ["global WebAssembly module", 'const Module = globalThis["Web" + "Assembly"].Module;'],
    ["local fetch", 'fetch("./asset.json");'],
    ["computed global fetch", 'globalThis["fet" + "ch"]("https://api.example.com/data");'],
    ["aliased fetch", 'const request = fetch; request("./asset.json");'],
    ["XMLHttpRequest", 'const request = new XMLHttpRequest(); request.open("GET", "./asset.json");'],
    ["importScripts", 'self["importScripts"]("./worker-helper.js");'],
    ["computed service worker", 'navigator["service" + "Worker"].register("./sw.js");'],
    ["dynamic global property", 'const property = "document"; globalThis[property];'],
    ["dynamic navigator property", 'const property = "userAgent"; navigator[property];'],
    ["Reflect global get", 'Reflect.get(globalThis, "Worker")("./worker.js");'],
    ["Reflect computed get", 'Reflect["g" + "et"](navigator, "serviceWorker");'],
    ["Reflect alias", 'const reflectGet = Reflect.get; reflectGet(globalThis, "fetch");'],
    ["Reflect destructured alias", 'const { get } = Reflect; get(globalThis, "fetch");'],
    ["Reflect object alias", 'const reflection = Reflect; reflection.get(globalThis, "fetch");'],
    ["WebAssembly module", 'const module = new WebAssembly.Module(new Uint8Array());'],
    ["WebAssembly compile", 'WebAssembly.compile(new Uint8Array());'],
    ["nested TSX global fetch", 'export const View = () => <button onClick={() => globalThis?.["fet" + "ch"]?.("./asset.json")} />;'],
  ];
  for (const [label, source] of rejected) {
    await assert.rejects(
      () => staticWorkerDependencies(source, `src/probes/${label.replaceAll(" ", "-")}.tsx`),
      (error) => /src\/probes\//.test(error.message) && /unsupported|static|runtime|dependency|loader|worker|fetch|eval|wasm|service/i.test(error.message),
      label,
    );
  }

  const accepted = await staticWorkerDependencies(`
    void import("./helper.js");
    require("./helper.cjs");
    new Worker("./worker.js", { type: "module" });
    new SharedWorker(new URL("./shared-worker.js", import.meta.url), { type: "module" });
    fetch("https://api.example.com/data");
    export const Nested = () => <button onClick={() => {
      void import("./nested-helper.js");
      require("./nested-helper.cjs");
      new Worker("./nested-worker.js");
    }}>Load</button>;
  `, "src/probes/static-positive.tsx");
  assert.deepEqual(accepted, ["./nested-worker.js", "./shared-worker.js", "./worker.js"]);

  const shadowed = await staticWorkerDependencies(`
    import { fetch, Worker, SharedWorker, require, WebAssembly } from "./local-runtime";
    export const LocalBindings = ({ navigator, globalThis, Function, XMLHttpRequest, importScripts }) => (
      <button onClick={() => {
        const dynamic = "./not-a-bundle-dependency";
        fetch(dynamic);
        require(dynamic);
        new Worker(dynamic);
        new SharedWorker(dynamic);
        WebAssembly.instantiate(dynamic);
        navigator[dynamic];
        globalThis[dynamic];
        Function(dynamic);
        new XMLHttpRequest(dynamic);
        importScripts(dynamic);
      }}>Local</button>
    );
  `, "src/probes/shadowed-positive.tsx");
  assert.deepEqual(shadowed, []);

  const local = await staticWorkerDependencies(`
    const fetch = (value) => value;
    const require = (value) => value;
    function Worker(value) { this.value = value; }
    function SharedWorker(value) { this.value = value; }
    const WebAssembly = { instantiate: (value) => value };
    const Reflect = { get: (value) => value.fetch };
    const navigator = { serviceWorker: { register: (value) => value } };
    const globalThis = { fetch };
    const Function = (value) => value;
    export const Local = () => <button onClick={() => {
      const dynamic = "./local-only";
      fetch(dynamic);
      require(dynamic);
      new Worker(dynamic);
      new SharedWorker(dynamic);
      WebAssembly.instantiate(dynamic);
      Reflect.get(globalThis, "fetch")(dynamic);
      navigator.serviceWorker.register(dynamic);
      Function(dynamic);
    }}>Local</button>;
  `, "src/probes/local-positive.tsx");
  assert.deepEqual(local, []);
});

test("runtime dependency AST audit rejects reflected Function recovery and preserves safe Object calls and local shadows", async () => {
  const { staticWorkerDependencies } = await import(`${pathToFileURL(EVIDENCE_SCRIPT).href}?reflected-function-audit=${Date.now()}`);
  const rejected = [
    ["Reflect Function recovery", 'Reflect.get(Object.getPrototypeOf(() => {}), "constructor")("return 1")();'],
    ["descriptor Function recovery", 'Object.getOwnPropertyDescriptor(Object.getPrototypeOf(() => {}), "constructor").value.apply(null, ["return 1"])();'],
    ["destructured Function recovery", 'const { constructor: F } = Object.getPrototypeOf(() => {}); F("return 1")();'],
    ["AsyncFunction recovery", 'Reflect.get(Object.getPrototypeOf(async () => {}), "constructor")("return 1")();'],
    ["GeneratorFunction recovery", 'Object.getOwnPropertyDescriptor(Object.getPrototypeOf(function* () {}), "constructor").value("return 1")();'],
    ["AsyncGeneratorFunction recovery", 'const { constructor: F } = Object.getPrototypeOf(async function* () {}); F("return 1")();'],
    ["property descriptors", 'Object.getOwnPropertyDescriptors(Object.getPrototypeOf(() => {})).constructor.value("return 1")();'],
    ["property names", 'Object.getOwnPropertyNames(Object.getPrototypeOf(() => {}));'],
    ["property symbols", 'Object.getOwnPropertySymbols(Object.getPrototypeOf(() => {}));'],
    ["set prototype", 'Object.setPrototypeOf({}, Object.getPrototypeOf(() => {}));'],
    ["define property", 'Object.defineProperty({}, "loader", { value: Function });'],
    ["create with prototype", 'Object.create(Object.getPrototypeOf(() => {}));'],
    ["Object prototype", 'void Object.prototype;'],
    ["Reflect descriptor", 'Reflect.getOwnPropertyDescriptor(Object.getPrototypeOf(() => {}), "constructor");'],
    ["Reflect own keys", 'Reflect.ownKeys(Object.getPrototypeOf(() => {}));'],
    ["Reflect set prototype", 'Reflect.setPrototypeOf({}, Object.getPrototypeOf(() => {}));'],
    ["Object alias", 'const O = Object; O.getPrototypeOf(() => {});'],
    ["Object destructure", 'const { getPrototypeOf } = Object; getPrototypeOf(() => {});'],
    ["Reflect alias", 'const R = Reflect; R.get({}, "constructor");'],
    ["Reflect destructure", 'const { get } = Reflect; get({}, "constructor");'],
    ["Reflect method bind", 'const get = Reflect.get.bind(Reflect); get({}, "constructor");'],
    ["Reflect method call", 'Reflect.get.call(Reflect, {}, "constructor");'],
    ["Reflect method apply", 'Reflect.get.apply(Reflect, [{}, "constructor"]);'],
    ["Reflect tagged method", 'Reflect.get`constructor`;'],
    ["Reflect optional method", 'Reflect?.get?.({}, "constructor");'],
    ["Reflect optional call", 'Reflect.get?.({}, "constructor");'],
    ["Reflect sequence method", '(0, Reflect.get)({}, "constructor");'],
    ["Object method alias", 'const getProto = Object.getPrototypeOf; getProto(() => {});'],
    ["Object method bind", 'const getProto = Object.getPrototypeOf.bind(Object); getProto(() => {});'],
    ["Object method call", 'Object.getPrototypeOf.call(Object, () => {});'],
    ["Object method apply", 'Object.getPrototypeOf.apply(Object, [() => {}]);'],
    ["Object tagged method", 'Object.getPrototypeOf`loader`;'],
    ["Object optional method", 'Object?.getPrototypeOf?.(() => {});'],
    ["Object optional call", 'Object.getPrototypeOf?.(() => {});'],
    ["Object sequence method", '(0, Object.getPrototypeOf)(() => {});'],
    ["Object computed method", 'Object["get" + "PrototypeOf"](() => {});'],
    ["Object const computed method", 'const method = "get" + "PrototypeOf"; Object[method](() => {});'],
    ["Reflect computed method", 'Reflect["g" + "et"]({}, "constructor");'],
    ["const constructor key", 'const key = "constructor"; const fn = () => {}; fn[key]("return 1")();'],
    ["const concatenated constructor key", 'const key = "con" + "structor"; const fn = () => {}; fn[key]("return 1")();'],
    ["let Function constructor key", 'let key = "constructor"; (() => {})[key]("return 1")();'],
    ["let AsyncFunction constructor key", 'let key = "constructor"; (async () => {})[key]("return 1")();'],
    ["let GeneratorFunction constructor key", 'let key = "constructor"; (function* () {})[key]("return 1")();'],
    ["let AsyncGeneratorFunction constructor key", 'let key = "constructor"; (async function* () {})[key]("return 1")();'],
    ["runtime Function constructor key", 'const key = String.fromCharCode(99,111,110,115,116,114,117,99,116,111,114); (() => {})[key]("return 1")();'],
    ["runtime AsyncFunction constructor key", 'const key = String.fromCharCode(99,111,110,115,116,114,117,99,116,111,114); (async () => {})[key]("return 1")();'],
    ["runtime GeneratorFunction constructor key", 'const key = String.fromCharCode(99,111,110,115,116,114,117,99,116,111,114); (function* () {})[key]("return 1")();'],
    ["runtime AsyncGeneratorFunction constructor key", 'const key = String.fromCharCode(99,111,110,115,116,114,117,99,116,111,114); (async function* () {})[key]("return 1")();'],
    ["runtime constructor member alias", 'const key = String.fromCharCode(99,111,110,115,116,114,117,99,116,111,114); const Factory = (() => {})[key]; Factory("return 1")();'],
    ["runtime constructor destructuring", 'let key = "constructor"; const { [key]: Factory } = async function* () {}; Factory("return 1")();'],
    ["runtime optional constructor member", 'const key = getKey(); (() => {})?.[key]?.("return 1")?.(); function getKey() { return "constructor"; }'],
    ["shadowed String constructor recovery", 'const String = (value) => value; let key = "constructor"; String((() => {})[key])("return 1")();'],
    ["mutated global String constructor recovery", 'globalThis.__defineGetter__("String", () => (value) => value); let key = "constructor"; String((() => {})[key])("return 1")();'],
    ["reassigned constructor key", 'let key = "constructor"; key = "safe"; const value = { safe: () => "ok" }; value[key]();'],
    ["runtime presentation key", 'const key = getKey(); String(({ title: "ok" })[key]); function getKey() { return "title"; }'],
    ["runtime presentation member alias", 'const key = getKey(); const value = (() => {})[key]; `${value}`; function getKey() { return "constructor"; }'],
    ["runtime presentation call argument", 'const key = getKey(); sink(`${({ title: "ok" })[key]}`); function getKey() { return "title"; } function sink(value) { return value; }'],
    ["runtime presentation new argument", 'const key = getKey(); new Sink(`${({ title: "ok" })[key]}`); function getKey() { return "title"; } function Sink(value) { this.value = value; }'],
    ["runtime presentation string alias", 'const key = getKey(); const text = `${({ title: "ok" })[key]}`; sink(text); function getKey() { return "title"; } function sink(value) { return value; }'],
    ["runtime presentation component child", 'const key = getKey(); const view = <Sink>{`${({ title: "ok" })[key]}`}</Sink>; function getKey() { return "title"; } function Sink({ children }) { return children; }'],
    ["destructured const constructor key", 'const key = "constructor"; const { [key]: F } = { constructor: Function }; F("return 1")();'],
    ["ObjectPattern constructor", 'const { constructor: F } = value; F("return 1")();'],
    ["ObjectMethod constructor", 'const value = { ["con" + "structor"]() { return 1; } };'],
    ["ObjectMethod const constructor", 'const key = "constructor"; const value = { [key]() { return 1; } };'],
    ["Class constructor", 'class Value { constructor() {} }'],
    ["Class computed constructor", 'class Value { ["con" + "structor"]() {} }'],
    ["Class const constructor", 'const key = "constructor"; class Value { [key]() {} }'],
  ];
  for (const [label, source] of rejected) {
    await assert.rejects(
      () => staticWorkerDependencies(source, `src/reflection-probes/${label.replaceAll(" ", "-")}.tsx`),
      (error) => /src\/reflection-probes\//.test(error.message) && /unsupported|runtime|reflect|Object|constructor|prototype|static/i.test(error.message),
      label,
    );
  }

  const safeObjectCalls = await staticWorkerDependencies(`
    const record = Object.freeze({ a: 1 });
    Object.keys(record);
    Object.values(record);
    Object.entries(record);
    Object.assign({}, record);
    Object.fromEntries([["a", 1]]);
    Object.seal(record);
    Object.is(record, record);
    Object.isFrozen(record);
    Object.isSealed(record);
    Object.hasOwn(record, "a");
  `, "src/reflection-probes/safe-object-calls.ts");
  assert.deepEqual(safeObjectCalls, []);

  const shadowed = await staticWorkerDependencies(`
    import { Object, Reflect, Function } from "./local-runtime";
    const prototype = Object.getPrototypeOf("local");
    const value = Reflect.get(prototype, "local");
    Function(value);
  `, "src/reflection-probes/imported-shadows.ts");
  assert.deepEqual(shadowed, []);

  const local = await staticWorkerDependencies(`
    const Object = { getPrototypeOf: (value) => value, keys: (value) => value };
    const Reflect = { get: (value) => value.local };
    const Function = (value) => value;
    const value = Object.getPrototypeOf({ local: "ok" });
    Function(Reflect.get(value, "local"));
    Object.keys(value);
  `, "src/reflection-probes/local-shadows.ts");
  assert.deepEqual(local, []);

  const staticNonConstructorKeys = await staticWorkerDependencies(`
    const fn = () => {};
    const name = fn["name"];
    const key = "len" + "gth";
    const length = fn[key];
    const first = [fn][0];
    export { name, length, first };
  `, "src/reflection-probes/static-non-constructor-keys.ts");
  assert.deepEqual(staticNonConstructorKeys, []);

  const safeDynamicDisplay = await staticWorkerDependencies(`
    export function SafeDynamicDisplay({ record, field, rowKey }: { record: Record<string, unknown>; field: string; rowKey: string }) {
      return <table><tbody><tr key={\`\${record[rowKey] ?? ""}\`}><td>{\`\${record[field] ?? ""}\`}</td></tr></tbody></table>;
    }
  `, "src/reflection-probes/safe-dynamic-display.ts");
  assert.deepEqual(safeDynamicDisplay, []);
});

test("adapted CSS parser still rejects external imports and URL escapes after closure attestation", async () => {
  const cases = [
    ["parent import escape", '@import "../outside.css";\n'],
    ["remote import", '@import "https://example.com/remote.css";\n'],
    ["absolute asset", '.x { background: url("/assets/private.png"); }\n'],
    ["file protocol", '.x { background: url("file:///tmp/private.png"); }\n'],
    ["data URL", '.x { background: url("data:image/png;base64,AAAA"); }\n'],
    ["asset escape", '.x { background: url("../../package.json?raw=1#data"); }\n'],
  ];
  for (const [label, injected] of cases) {
    const { project, output } = await makeMatureAdaptedCatalogProject();
    const stylePath = join(project, "src/theme/index.css");
    const source = `${injected}${await readFile(stylePath, "utf8")}`;
    await writeFile(stylePath, source, "utf8");
    await attestSourceBytes(output, "src/theme/index.css", source);
    const result = runCatalogBuilder(output);
    assert.notEqual(result.status, 0, label);
    assert.match(result.stderr, /css|import|url|asset|protocol|outside|escape|allowed/i, label);
  }
});
test("adapted CSS dependency closure rejects linked imports", async (t) => {
  const { project, output } = await makeMatureAdaptedCatalogProject();
  const target = join(project, "linked-target");
  const link = join(project, "src/theme/linked");
  await mkdir(target);
  await writeFile(join(target, "linked.css"), ".linked { color: red; }\n", "utf8");
  if (!await createLinkOrSkip(t, target, link, "dir")) return;
  const stylePath = join(project, "src/theme/index.css");
  const linkedStyle = `@import "./linked/linked.css";\n${await readFile(stylePath, "utf8")}`;
  await writeFile(stylePath, linkedStyle, "utf8");
  await attestSourceBytes(output, "src/theme/index.css", linkedStyle);
  const result = runCatalogBuilder(output);
  assert.notEqual(result.status, 0, result.stdout || result.stderr);
  assert.match(result.stderr, /link|symbolic|junction|reparse/i);
});

test("real adapted Catalog renders all eight mapped families and passes browser update plus test", async () => {
  const { output } = await makeMatureAdaptedCatalogProject();
  const built = await runNpmScript("catalog:build", output);
  assert.equal(built.status, 0, built.stdout || built.stderr || built.error?.message);
  const checked = await runNpmScript("catalog:check", output);
  assert.equal(checked.status, 0, checked.stdout || checked.stderr || checked.error?.message);
  for (const script of ["adoption:check", "guard:ui", "visual:inspect"]) {
    const result = await runNpmScript(script, output);
    assert.equal(result.status, 0, `${script}:\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}\nerror:\n${result.error?.stack ?? ""}`);
  }

  const server = await startStaticServer(output);
  let browser;
  try {
    const configPath = join(output, "checks/adoption-visual.config.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.baseUrl = server.origin;
    config.routes = [{
      id: "adapted-catalog",
      path: "/catalog/component-library.html",
      viewports: [
        { id: "desktop", width: 1280, height: 900 },
        { id: "mobile", width: 390, height: 844 },
      ],
    }];
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    for (const command of ["update", "test"]) {
      const visual = await runProcess(process.execPath, [join(output, "checks/visual-regression.mjs"), command, "--config", configPath], {
        cwd: output,
      });
      assert.equal(visual.status, 0, `${command}: ${visual.stdout || visual.stderr}`);
      const report = JSON.parse(visual.stdout);
      assert.equal(report.applicationVisualVerification, command === "update" ? "baseline-updated" : "passed");
      assert.equal(report.report.length, 2);
    }
    const packagedVisualTest = await runNpmScript("visual:test", output);
    assert.equal(packagedVisualTest.status, 0, packagedVisualTest.stdout || packagedVisualTest.stderr || packagedVisualTest.error?.message);

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${server.origin}/catalog/component-library.html#foundation`, { waitUntil: "networkidle" });
    await page.locator("[data-catalog-item]").first().waitFor();
    const sources = await page.locator("[data-catalog-item][data-component-origin]").evaluateAll((cards) => Object.fromEntries(cards.map((card) => [
      card.querySelector("h3")?.textContent,
      { origin: card.getAttribute("data-component-origin"), label: card.querySelector(".catalog-code-label")?.textContent },
    ])));
    assert.deepEqual(sources, {
      FieldShell: { origin: "adapter", label: "Adapter" },
      SelectField: { origin: "existing", label: "Existing" },
      Button: { origin: "existing", label: "Existing" },
      IconButton: { origin: "adapter", label: "Adapter" },
      DataTable: { origin: "existing", label: "Existing" },
      StatusBadge: { origin: "design-consultant", label: "Design Consultant" },
      ResourcePanel: { origin: "existing", label: "Existing" },
      Dialog: { origin: "adapter", label: "Adapter" },
    });
    for (const selector of [".existing-field", ".existing-select", ".existing-button", ".existing-icon-button", ".existing-table", ".dc-status-badge", ".existing-resource"]) {
      assert.ok(await page.locator(selector).count(), selector);
    }
    await page.getByRole("button", { name: "打开复核对话框" }).click();
    await page.locator(".existing-dialog").waitFor();
    const cssEvidence = await page.locator(".existing-button").first().evaluate((element) => ({
      borderWidth: getComputedStyle(element).borderTopWidth,
      background: getComputedStyle(element).backgroundColor,
      globalMarker: getComputedStyle(document.documentElement).getPropertyValue("--fixture-global-css").trim(),
    }));
    assert.deepEqual(cssEvidence, { borderWidth: "3px", background: "rgb(36, 87, 214)", globalMarker: "applied" });
    assert.doesNotMatch(await page.locator("body").innerText(), /componentMappings|adoption-plan|migration\/plan/i);

    const deterministic = await runNpmScript("catalog:check", output);
    assert.equal(deterministic.status, 0, deterministic.stdout || deterministic.stderr);
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
});
