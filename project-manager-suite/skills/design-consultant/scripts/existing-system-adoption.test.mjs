import assert from "node:assert/strict";
import Ajv2020 from "ajv/dist/2020.js";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import test from "node:test";
import { buildRuntimePlan, renderReactAdapter } from "./adoption/component-adapters.mjs";
import { collectComponentEvidence, collectSystemInventory, readPackageContext } from "./adoption/inventory.mjs";
import { buildTokenBridge } from "./adoption/token-bridge.mjs";
import { validateAdoptionContract } from "./check-adoption-contract.mjs";
import { renderMigrationPlan } from "./adoption/migration-plan.mjs";
import { UI_CONTRACT_BASELINE_PROVENANCE, UI_CONTRACT_BASELINE_SOURCE } from "./check-ui-contract.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = resolve(SCRIPT_DIR, "..");
const REPO_ROOT = resolve(SKILL_ROOT, "../..");
const SCRIPT_PATH = join(SCRIPT_DIR, "manage-visual-system.mjs");
const COMPATIBILITY_PATH = join(SCRIPT_DIR, "adoption/compatibility.mjs");
const ALIASES_TEMPLATE = join(SKILL_ROOT, "templates/adoption-component-aliases.json");
const PLAN_SCHEMA = join(SKILL_ROOT, "templates/adoption-plan.schema.json");
const PLAN_TEMPLATE = join(SKILL_ROOT, "templates/adoption-plan.json");
const DESIGN_SYSTEM_PACKAGE = join(SKILL_ROOT, "templates/design-system-package.json");
const FIXTURES = resolve(SKILL_ROOT, "../../evals/design-consultant/fixtures");
const ADOPTION_CHECK_PATH = join(SCRIPT_DIR, "check-adoption-contract.mjs");
const UI_CONTRACT_CHECK_PATH = join(SCRIPT_DIR, "check-ui-contract.mjs");
const MIGRATION_PLAN_SOURCE = "generated:adoption-migration-plan";
const MIGRATION_PLAN_PROVENANCE = Object.freeze({ schemaVersion: 1, type: "existing-system-migration-plan", mode: "planning-only" });
const ADOPTION_OUTPUT_FILES = [
  ".design-consultant-lock.json",
  "adoption/adoption-plan.json",
  "adoption/adoption-plan.schema.json",
  "adoption/compatibility-report.json",
  "intake/extraction-report.json",
];
const CONFIRMED_ADOPTION_OUTPUT_FILES = [...ADOPTION_OUTPUT_FILES, "checks/ui-contract-baseline.json", "migration/plan.md"].sort();

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

test("project identity normalizes confirmed inventory Unicode and path projections without collapsing distinct evidence", async () => {
  const { deriveProjectIdentity } = await import(pathToFileURL(COMPATIBILITY_PATH));
  const inventory = {
    inventoryDigest: `sha256:${"a".repeat(64)}`,
    project: { name: "Cafe\u0301 Project", root: ".", output: "design-system\\v0.10" },
    detected: {
      components: [{
        path: "src\\Cafe\u0301.tsx",
        rawSha256: `sha256:${"b".repeat(64)}`,
        metadata: { "re\u0301sume\u0301": ["Cafe\u0301", { output: "assets\\Cafe\u0301.css", profile: "literal\\value" }] },
      }],
    },
  };
  const identity = deriveProjectIdentity(inventory);
  assert.match(identity, /^dc-project-v1:[a-f0-9]{64}$/);
  assert.equal(deriveProjectIdentity(structuredClone(inventory)), identity);
  assert.equal(deriveProjectIdentity({
    detected: {
      components: [{
        metadata: { "r\u00e9sum\u00e9": ["Caf\u00e9", { output: "assets/Caf\u00e9.css", profile: "literal\\value" }] },
        rawSha256: `sha256:${"b".repeat(64)}`,
        path: "src/Caf\u00e9.tsx",
      }],
    },
    project: { output: "design-system/v0.10", root: ".", name: "Caf\u00e9 Project" },
    inventoryDigest: `sha256:${"c".repeat(64)}`,
  }), identity);
  assert.notEqual(deriveProjectIdentity({
    ...inventory,
    detected: { components: [{ ...inventory.detected.components[0], path: "src/Other.tsx" }] },
  }), identity);
  assert.notEqual(deriveProjectIdentity({
    ...inventory,
    detected: { components: [{ ...inventory.detected.components[0], rawSha256: `sha256:${"d".repeat(64)}` }] },
  }), identity);
  const changedProfile = structuredClone(inventory);
  changedProfile.detected.components[0].metadata["re\u0301sume\u0301"][1].profile = "literal/value";
  assert.notEqual(deriveProjectIdentity(changedProfile), identity);
  assert.notEqual(deriveProjectIdentity({ ...inventory, project: { ...inventory.project, name: "Other Project" } }), identity);
  assert.doesNotMatch(identity, /Cafe|design-system/i);
  await assert.rejects(
    async () => deriveProjectIdentity({
      ...inventory,
      detected: { "Cafe\u0301": 1, "Caf\u00e9": 2 },
    }),
    /normalization.*collision|collision.*normalization/i,
  );
  for (const project of [
    { ...inventory.project, output: "C:/absolute/design-system" },
    { ...inventory.project, output: "../design-system" },
  ]) await assert.rejects(async () => deriveProjectIdentity({ ...inventory, project }), /stable.*inventory|absolute path/i);
});

test("project identity and inventory digest share recursive unordered array semantics", async () => {
  const { computeInventoryDigest, deriveProjectIdentity } = await import(pathToFileURL(COMPATIBILITY_PATH));
  const confirm = (value) => {
    const confirmed = structuredClone(value);
    confirmed.inventoryDigest = computeInventoryDigest(confirmed);
    return confirmed;
  };
  const source = {
    project: { name: "Cafe\u0301 Project", root: ".", output: "design-system\\v0.10" },
    detected: {
      frameworks: [{ name: "React", version: "19" }, { name: "Vite", version: "7" }],
      components: [
        { name: "Button", path: "src\\Cafe\u0301Button.tsx", rawSha256: `sha256:${"a".repeat(64)}` },
        { name: "Select", path: "src\\Select.tsx", rawSha256: `sha256:${"b".repeat(64)}` },
      ],
      tokens: {
        items: [
          { name: "--color-accent", value: "Cafe\u0301" },
          { name: "--space-control", value: "8px" },
        ],
      },
      nestedEvidence: [
        { group: "components", files: ["src\\Select.tsx", "src\\Cafe\u0301Button.tsx"] },
        { group: "tokens", files: ["src\\theme-b.css", "src\\theme-a.css"] },
      ],
    },
  };
  const original = confirm(source);
  const reversedSource = structuredClone(source);
  reversedSource.detected.frameworks.reverse();
  reversedSource.detected.components.reverse();
  reversedSource.detected.tokens.items.reverse();
  reversedSource.detected.nestedEvidence.reverse();
  for (const item of reversedSource.detected.nestedEvidence) item.files.reverse();
  const reversed = confirm(reversedSource);

  assert.equal(reversed.inventoryDigest, original.inventoryDigest);
  assert.equal(deriveProjectIdentity(reversed), deriveProjectIdentity(original));

  const normalizedAndReversed = structuredClone(reversed);
  normalizedAndReversed.project.name = "Caf\u00e9 Project";
  normalizedAndReversed.project.output = "design-system/v0.10";
  normalizedAndReversed.detected.components.find((item) => item.name === "Button").path = "src/Caf\u00e9Button.tsx";
  normalizedAndReversed.detected.tokens.items.find((item) => item.name === "--color-accent").value = "Caf\u00e9";
  for (const item of normalizedAndReversed.detected.nestedEvidence) item.files = item.files.map((file) => file.replaceAll("\\", "/").normalize("NFC"));
  normalizedAndReversed.inventoryDigest = computeInventoryDigest(normalizedAndReversed);
  assert.equal(deriveProjectIdentity(normalizedAndReversed), deriveProjectIdentity(original));

  for (const mutate of [
    (inventory) => inventory.detected.frameworks.push({ name: "Next", version: "1" }),
    (inventory) => inventory.detected.components.pop(),
    (inventory) => inventory.detected.tokens.items.push(structuredClone(inventory.detected.tokens.items[0])),
    (inventory) => inventory.detected.nestedEvidence[0].files.push(inventory.detected.nestedEvidence[0].files[0]),
  ]) {
    const changedSource = structuredClone(source);
    mutate(changedSource);
    const changed = confirm(changedSource);
    assert.notEqual(changed.inventoryDigest, original.inventoryDigest);
    assert.notEqual(deriveProjectIdentity(changed), deriveProjectIdentity(original));
  }
});

async function readFixture(relativePath) {
  return readFile(join(FIXTURES, relativePath), "utf8");
}

async function collectFiles(root) {
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else files.push(path);
    }
  }
  await walk(root);
  return files;
}

async function makeInventoryProject(t) {
  const projectRoot = await mkdtemp(join(tmpdir(), "design-consultant-inventory-"));
  t.after(() => rm(projectRoot, { recursive: true, force: true }));
  return projectRoot;
}

async function copyFixtureProject(t, fixtureName) {
  const workspace = await mkdtemp(join(tmpdir(), "design-consultant-adoption-"));
  const projectRoot = join(workspace, fixtureName);
  await cp(join(FIXTURES, fixtureName), projectRoot, { recursive: true });
  t.after(() => rm(workspace, { recursive: true, force: true }));
  return projectRoot;
}

function runCliProcess(projectRoot, args) {
  return spawnSync(process.execPath, [SCRIPT_PATH, ...args, "--target", projectRoot], { encoding: "utf8" });
}

function runCli(projectRoot, args) {
  const result = runCliProcess(projectRoot, args);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function runUiGuard(projectRoot, baselinePath, args = []) {
  return spawnSync(process.execPath, [UI_CONTRACT_CHECK_PATH, "--root", projectRoot, "--baseline", baselinePath, ...args], { encoding: "utf8" });
}

function runGeneratedUiGuard(outputRoot, args = []) {
  return spawnSync(process.execPath, [join(outputRoot, "checks/check-ui-contract.mjs"), ...args], {
    cwd: outputRoot,
    encoding: "utf8",
  });
}

function hash(content) {
  return createHash("sha256").update(content).digest("hex");
}

async function outputFiles(projectRoot) {
  const outputRoot = join(projectRoot, "design-system");
  return (await collectFiles(outputRoot)).map((path) => relative(outputRoot, path).replaceAll("\\", "/")).sort();
}

async function snapshotOutput(projectRoot) {
  const outputRoot = join(projectRoot, "design-system");
  if (!await exists(outputRoot)) return null;
  const snapshot = {};
  for (const file of await collectFiles(outputRoot)) {
    snapshot[relative(outputRoot, file).replaceAll("\\", "/")] = (await readFile(file)).toString("base64");
  }
  return snapshot;
}

async function readAliases() {
  return JSON.parse(await readFile(ALIASES_TEMPLATE, "utf8"));
}

function buildMatureInventory(aliases) {
  const tokenEntries = Object.entries(aliases.tokens).slice(0, 23);
  const tokens = tokenEntries.map(([semanticToken, names], index) => ({
    name: names[0],
    value: index % 2 === 0 ? "#2457d6" : `${index + 4}px`,
    selector: ":root",
    theme: "light",
    file: "src/theme.css",
    line: index + 2,
    usageCount: 1,
    status: "observed",
    semanticToken,
  }));
  const components = Object.entries(aliases.components).slice(0, 6).map(([component, names], index) => ({
    path: `src/ui/${names[0]}.tsx`,
    exports: [names[0]],
    namedExports: [names[0]],
    defaultExport: null,
    externalImports: [],
    jsxRoles: [index === 0 ? "button" : "div"],
    roles: [index === 0 ? "button" : "div"],
    status: "observed",
    component,
  }));
  return {
    schemaVersion: 2,
    generatedAt: "2026-07-27T00:00:00.000Z",
    project: { name: "mature", root: ".", output: "design-system" },
    detected: {
      packageManager: "npm",
      frameworks: ["React"],
      buildTools: ["Vite"],
      styling: [],
      componentLibraries: [],
      sharedComponentDirectories: [{ path: "src/ui", sourceFileCount: 6 }],
      cssCustomProperties: { count: tokens.length, items: tokens.map((item) => ({ name: item.name, files: [item.file] })) },
      existingDesignArtifacts: ["DESIGN.md"],
      scannedSourceFiles: 30,
      tokens: { count: tokens.length, items: tokens },
      components,
      themes: [
        { selector: ":root", theme: "light", file: "src/theme.css", line: 1, status: "observed" },
      ],
      typography: tokens.filter((item) => /font|text/.test(item.name)),
      spacingAndRadius: tokens.filter((item) => /space|radius/.test(item.name)),
      reactRuntimeCandidates: components,
    },
    evidenceLimitReached: false,
    warnings: [],
  };
}

function componentRuntimeInventory({ framework = "React", candidates = [] } = {}) {
  return {
    schemaVersion: 2,
    project: { name: "component-runtime", root: ".", output: "design-system" },
    detected: {
      frameworks: [framework],
      components: candidates,
      reactRuntimeCandidates: framework === "React" ? candidates : [],
    },
  };
}

test("PrimaryButton maps to Button through a confirmed prop wrapper", () => {
  const inventory = componentRuntimeInventory({
    candidates: [{
      path: "src/ui/PrimaryButton.tsx",
      exports: ["PrimaryButton"],
      namedExports: ["PrimaryButton"],
      defaultExport: null,
    }],
  });
  const mappings = [{
    component: "button",
    source: { path: "src/ui/PrimaryButton.tsx", exportName: "PrimaryButton" },
    strategy: "wrapper",
    propMap: [
      { canonicalProp: "children", sourceProp: "children", transform: "identity" },
      { canonicalProp: "loading", sourceProp: "isLoading", transform: "identity" },
      { canonicalProp: "variant", sourceProp: "variant", transform: "identity" },
    ],
    status: "confirmed",
  }];

  const runtime = buildRuntimePlan({ strategy: "preserve", mappings, inventory });

  assert.equal(runtime.generatedComponents.length, 0);
  assert.equal(runtime.adapters[0].canonicalExport, "Button");
  assert.match(renderReactAdapter(runtime.adapters[0]), /PrimaryButton/);
  assert.match(renderReactAdapter(runtime.adapters[0]), /isLoading=\{loading\}/);
});

test("unresolved candidates prevent a duplicate canonical component", () => {
  const inventory = componentRuntimeInventory({
    candidates: [{ path: "src/ui/Button.tsx", exports: ["Button"], namedExports: ["Button"], defaultExport: null }],
  });
  const unresolvedMappings = [{
    component: "button",
    source: { path: "src/ui/Button.tsx", exportName: "Button" },
    strategy: "direct",
    status: "proposed",
  }];

  assert.throws(
    () => buildRuntimePlan({ strategy: "augment", mappings: unresolvedMappings, inventory }),
    /candidate.*must be confirmed or rejected/i,
  );
});

test("non-React projects never receive a React runtime", () => {
  const vueInventory = componentRuntimeInventory({
    framework: "Vue",
    candidates: [{ path: "src/Button.vue", exports: ["Button"] }],
  });
  const runtime = buildRuntimePlan({ strategy: "preserve", mappings: [{ malformed: true }], inventory: vueInventory });

  assert.equal(runtime.framework, null);
  assert.deepEqual(runtime.adapters, []);
});

test("compatibility reports every matching named export as terminal mapping evidence", async () => {
  const { evaluateCompatibility } = await import(pathToFileURL(COMPATIBILITY_PATH));
  const inventory = componentRuntimeInventory({
    candidates: [{
      path: "src/ui/buttons.tsx",
      exports: ["Button", "PrimaryButton"],
      namedExports: ["Button", "PrimaryButton"],
      defaultExport: null,
    }],
  });
  const report = evaluateCompatibility(inventory, await readAliases());
  assert.deepEqual(
    report.componentCandidates.filter((candidate) => candidate.component === "button").map((candidate) => candidate.source.exportName),
    ["Button", "PrimaryButton"],
  );
});

async function confirmPlan(projectRoot, mutate = () => {}, output = "design-system") {
  const planPath = join(projectRoot, output, "adoption/adoption-plan.json");
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  plan.status = "confirmed";
  plan.strategy = "preserve";
  for (const mapping of plan.tokenMappings) mapping.status = "rejected";
  for (const mapping of plan.componentMappings) {
    mapping.status = "rejected";
    mapping.strategy = "reject";
  }
  mutate(plan);
  await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  return plan;
}

async function refreshConfirmedPlanInventory(projectRoot, output = "design-system") {
  runCli(projectRoot, ["extract", "--output", output]);
  const extraction = JSON.parse(await readFile(join(projectRoot, output, "intake/extraction-report.json"), "utf8"));
  const planPath = join(projectRoot, output, "adoption/adoption-plan.json");
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  plan.status = "confirmed";
  plan.inventoryDigest = extraction.inventoryDigest;
  await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  return plan;
}

function confirmTokenMapping(plan, semanticToken = "color.primary") {
  const mapping = plan.tokenMappings.find((item) => item.semanticToken === semanticToken);
  assert.ok(mapping, `missing token mapping for ${semanticToken}`);
  mapping.status = "confirmed";
  mapping.canonicalToken = `semantic.${semanticToken}`;
  mapping.canonicalCssVariable = semanticToken === "color.primary" ? "--primary" : `--${semanticToken.replaceAll(".", "-")}`;
  mapping.source.kind = "css-variable";
  mapping.theme = "light";
  mapping.selector = mapping.source.selector;
  mapping.evidence = [`${mapping.source.file}:${mapping.source.line}`];
  return mapping;
}

function configuredVisualVerification(baseUrl = "http://127.0.0.1:4173") {
  return {
    status: "configured",
    baseUrl,
    routes: [{
      id: "dashboard",
      path: "/dashboard",
      viewports: [
        { id: "desktop", width: 1280, height: 800 },
        { id: "mobile", width: 390, height: 844 },
      ],
    }],
  };
}

function tokenBridgeInventory() {
  return {
    detected: {
      tokens: {
        items: [
          { name: "--brand-primary", value: "#2457d6", selector: ":root", file: "src/theme.css", line: 2 },
          { name: "--brand-primary-dark", value: "#8bc4dc", selector: '[data-theme="dark"]', file: "src/theme.css", line: 6 },
        ],
      },
      themeDeclarations: [
        { selector: ":root", theme: "light", file: "src/theme.css", line: 1, status: "observed" },
        { selector: '[data-theme="dark"]', theme: "dark", file: "src/theme.css", line: 5, status: "observed" },
      ],
    },
  };
}

function confirmedBridgeMappings() {
  return [
    {
      semanticToken: "color.primary",
      canonicalToken: "semantic.color.primary",
      canonicalCssVariable: "--primary",
      source: { kind: "css-variable", name: "--brand-primary", file: "src/theme.css", line: 2, selector: ":root", value: "#2457d6" },
      match: "candidate",
      theme: "light",
      selector: ":root",
      status: "confirmed",
      evidence: ["src/theme.css:2"],
    },
    {
      semanticToken: "color.primary",
      canonicalToken: "semantic.color.primary",
      canonicalCssVariable: "--primary",
      source: { kind: "css-variable", name: "--brand-primary-dark", file: "src/theme.css", line: 6, selector: '[data-theme="dark"]', value: "#8bc4dc" },
      fallback: { kind: "css-variable", name: "--brand-primary", file: "src/theme.css", line: 2, selector: ":root", value: "#2457d6" },
      match: "candidate",
      theme: "dark",
      selector: '[data-theme="dark"]',
      status: "confirmed",
      evidence: ["src/theme.css:2", "src/theme.css:6"],
    },
  ];
}

async function forgeAdoptionArtifacts(projectRoot, mutateInventory) {
  const { computeInventoryDigest, createDraftAdoptionPlan, evaluateCompatibility } = await import(pathToFileURL(COMPATIBILITY_PATH));
  const outputRoot = join(projectRoot, "design-system");
  const extractionPath = join(outputRoot, "intake/extraction-report.json");
  const compatibilityPath = join(outputRoot, "adoption/compatibility-report.json");
  const planPath = join(outputRoot, "adoption/adoption-plan.json");
  const inventory = JSON.parse(await readFile(extractionPath, "utf8"));
  mutateInventory(inventory);
  inventory.inventoryDigest = computeInventoryDigest(inventory);
  const compatibility = evaluateCompatibility(inventory, await readAliases());
  const plan = createDraftAdoptionPlan(compatibility);
  plan.status = "confirmed";
  plan.strategy = "preserve";
  for (const mapping of plan.tokenMappings) mapping.status = "rejected";
  for (const mapping of plan.componentMappings) {
    mapping.status = "rejected";
    mapping.strategy = "reject";
  }
  await writeFile(extractionPath, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
  await writeFile(compatibilityPath, `${JSON.stringify(compatibility, null, 2)}\n`, "utf8");
  await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
}

async function createDirectoryLinkOrSkip(t, target, path) {
  try {
    await symlink(target, path, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOSYS", "UNKNOWN"].includes(error.code)) {
      t.skip(`Directory links unavailable on this platform: ${error.code}`);
      return false;
    }
    throw error;
  }
  return true;
}

async function createFileLinkOrSkip(t, target, path) {
  try {
    await symlink(target, path, "file");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOSYS", "UNKNOWN"].includes(error.code)) {
      t.diagnostic(`File link case skipped on this platform: ${error.code}`);
      return false;
    }
    throw error;
  }
  return true;
}

test("adoption plan exposes the three explicit strategies", async () => {
  const schema = JSON.parse(await readFile(PLAN_SCHEMA, "utf8"));
  const draft = JSON.parse(await readFile(PLAN_TEMPLATE, "utf8"));
  const validate = new Ajv2020({ allErrors: true }).compile(schema);
  assert.deepEqual(schema.properties.strategy.enum, [null, "preserve", "augment", "migrate"]);
  assert.deepEqual(schema.properties.status.enum, ["draft", "confirmed"]);
  assert.ok(schema.required.includes("tokenMappings"));
  assert.ok(schema.required.includes("componentMappings"));
  assert.ok(schema.required.includes("appEntryImports"));
  assert.deepEqual(draft.appEntryImports, []);
  assert.deepEqual(schema.$defs.tokenMapping.properties.status.enum, ["proposed", "confirmed", "rejected", "manual"]);
  assert.equal(schema.$defs.tokenMapping.additionalProperties, false);
  assert.equal(schema.$defs.componentMapping.oneOf.length, 6);
  assert.equal(validate(draft), true);

  const invalidConfirmed = { ...draft, status: "confirmed", inventoryDigest: "sha256:fixture" };
  assert.equal(validate(invalidConfirmed), false);

  const validConfirmed = { ...invalidConfirmed, strategy: "preserve" };
  assert.equal(validate(validConfirmed), true);
  assert.equal(validate({ ...validConfirmed, inventoryDigest: "" }), false);
});

test("generated design-system package runs the UI guard without baseline arguments", async () => {
  const packageTemplate = JSON.parse(await readFile(DESIGN_SYSTEM_PACKAGE, "utf8"));
  assert.equal(packageTemplate.scripts["guard:ui"], "node checks/check-ui-contract.mjs");
});

test("appEntryImports accepts only safe relative POSIX paths and trimmed static imports", async () => {
  const schema = JSON.parse(await readFile(PLAN_SCHEMA, "utf8"));
  const draft = JSON.parse(await readFile(PLAN_TEMPLATE, "utf8"));
  const validate = new Ajv2020({ allErrors: true }).compile(schema);
  const base = { ...draft, status: "confirmed", strategy: "preserve", inventoryDigest: "sha256:fixture" };
  const validEntries = [
    { path: "src/main.tsx", statement: 'import "./design-system/tokens/external-bridge.css";' },
    { path: "src/app-entry.ts", statement: 'import App, { bootstrap as start } from "./App";' },
    { path: "src/main.tsx", statement: 'import * as Runtime from "./design-system/runtime/react/src";' },
  ];
  assert.equal(validate({ ...base, appEntryImports: validEntries }), true, JSON.stringify(validate.errors));

  for (const path of ["/src/main.tsx", "C:/src/main.tsx", "../src/main.tsx", "./src/main.tsx", "src//main.tsx", "src\\main.tsx", "src/../main.tsx", "src/main.tsx\n# injected", "src/[main].tsx"]) {
    assert.equal(validate({ ...base, appEntryImports: [{ ...validEntries[0], path }] }), false, path);
  }
  for (const statement of [
    ' import "./theme.css";',
    'import "./theme.css"; ',
    'import("./theme.css")',
    'const theme = "./theme.css";',
    'import `./theme.css`;',
    'import "./theme.css";\n# injected',
    'import "./theme.css"; [click](https://example.com)',
  ]) {
    assert.equal(validate({ ...base, appEntryImports: [{ ...validEntries[0], statement }] }), false, statement);
  }
  assert.equal(validate({ ...base, appEntryImports: [{ ...validEntries[0], execute: true }] }), false);
});

test("legacyBaseline schema and runtime agree on safe and reserved checks JSON destinations", async () => {
  const schema = JSON.parse(await readFile(PLAN_SCHEMA, "utf8"));
  const draft = JSON.parse(await readFile(PLAN_TEMPLATE, "utf8"));
  const { isSafeLegacyBaselinePath } = await import(`${pathToFileURL(UI_CONTRACT_CHECK_PATH).href}?baseline-path=${Date.now()}`);
  const validate = new Ajv2020({ allErrors: true }).compile(schema);
  const base = { ...draft, status: "confirmed", strategy: "preserve", inventoryDigest: "sha256:fixture" };
  for (const path of [
    "checks/baselines/legacy-ui.json",
    "checks/my-planner.json",
    "checks/manifestation.json",
  ]) {
    const schemaAccepted = validate({ ...base, legacyBaseline: { mode: "ratchet", path } });
    assert.equal(schemaAccepted, isSafeLegacyBaselinePath(path), `${path}: ${JSON.stringify(validate.errors)}`);
    assert.equal(schemaAccepted, true, path);
  }

  for (const path of [
    "migration/plan.md",
    ".design-consultant-lock.json",
    ".design-consultant-ui-baseline-transaction.json",
    "system.config.json",
    "adoption/adoption-plan.json",
    "components/manifest.json",
    "checks/check-ui-contract.mjs",
    "checks/check-ui-contract.json",
    "checks/manifest.json",
    "checks/foo-checker.json",
    "checks/mychecker.json",
    "checks/foo-plan.json",
    "checks/foo_manifest.json",
  ]) {
    const schemaAccepted = validate({ ...base, legacyBaseline: { mode: "ratchet", path } });
    assert.equal(schemaAccepted, isSafeLegacyBaselinePath(path), `${path}: ${JSON.stringify(validate.errors)}`);
    assert.equal(schemaAccepted, false, path);
  }
});

test("manage rejects duplicate destinations before action planning", async () => {
  const { assertUniqueItemDestinations } = await import(`${pathToFileURL(SCRIPT_PATH).href}?destinations=${Date.now()}`);
  assert.throws(
    () => assertUniqueItemDestinations([
      { source: "generated:first", destination: "checks/duplicate.json" },
      { source: "generated:second", destination: "checks/Duplicate.json" },
    ]),
    /duplicate.*destination|destination.*duplicate/i,
  );
});

test("adoption plan schema accepts only finite conditional ComponentMappingV1 shapes", async () => {
  const schema = JSON.parse(await readFile(PLAN_SCHEMA, "utf8"));
  const draft = JSON.parse(await readFile(PLAN_TEMPLATE, "utf8"));
  const validate = new Ajv2020({ allErrors: true }).compile(schema);
  const base = { ...draft, status: "confirmed", strategy: "augment", inventoryDigest: "sha256:fixture" };
  const source = { path: "src/ui/PrimaryButton.tsx", exportName: "PrimaryButton" };
  const direct = {
    component: "button",
    source: { path: "src/ui/Button.tsx", exportName: "Button", propsExport: "ButtonProps" },
    strategy: "direct",
    api: { props: ["variant", "loading", "children"] },
    status: "confirmed",
  };
  const wrapper = {
    component: "button",
    source,
    strategy: "wrapper",
    propMap: [{ canonicalProp: "children", sourceProp: "children", transform: "identity" }],
    status: "confirmed",
  };
  const generate = { component: "button", strategy: "generate", approved: true, status: "confirmed" };
  const manual = { component: "button", strategy: "manual", adapterPath: "src/adapters/Button.tsx", status: "confirmed" };
  const rejected = { component: "button", source, strategy: "reject", status: "rejected" };
  const proposed = { component: "button", source, strategy: "wrapper", status: "proposed" };

  for (const mapping of [direct, wrapper, generate, manual, rejected]) {
    assert.equal(validate({ ...base, componentMappings: [mapping] }), true, JSON.stringify(validate.errors));
  }
  for (const path of [" src/ui/Button.tsx", "src/ui/Button.tsx ", "src /ui/Button.tsx", "src/ui /Button.tsx"]) {
    assert.equal(validate({ ...base, componentMappings: [{ ...wrapper, source: { ...source, path } }] }), false, path);
  }
  assert.equal(validate({ ...base, componentMappings: [proposed] }), false);
  assert.equal(validate({ ...base, componentMappings: [{ ...wrapper, adapterCode: "export const Button = eval(code)" }] }), false);
  assert.equal(validate({ ...base, componentMappings: [{ ...wrapper, source: { ...source, path: "../Button.tsx" } }] }), false);
  assert.equal(validate({ ...base, componentMappings: [{ ...wrapper, source: { ...source, exportName: "Button; injected" } }] }), false);
  assert.equal(validate({ ...base, componentMappings: [{ ...wrapper, propMap: [{ canonicalProp: "children", sourceProp: "children", transform: "expression" }] }] }), false);
  assert.equal(validate({ ...base, componentMappings: [{ ...generate, approved: false }] }), false);
  assert.equal(validate({ ...base, componentMappings: [{ ...manual, status: "manual" }] }), false);
});

test("component runtime planner enforces direct, generate, transform, and candidate rules", () => {
  const buttonCandidate = { path: "src/ui/PrimaryButton.tsx", exports: ["PrimaryButton"], namedExports: ["PrimaryButton"] };
  const inventory = componentRuntimeInventory({ candidates: [buttonCandidate] });
  const reject = {
    component: "button",
    source: { path: buttonCandidate.path, exportName: "PrimaryButton" },
    strategy: "reject",
    status: "rejected",
  };
  const generate = { component: "button", strategy: "generate", approved: true, status: "confirmed" };

  assert.throws(() => buildRuntimePlan({ strategy: "preserve", mappings: [reject, generate], inventory }), /preserve/i);
  assert.equal(buildRuntimePlan({ strategy: "augment", mappings: [reject, generate], inventory }).generatedComponents.length, 1);
  assert.throws(
    () => buildRuntimePlan({ strategy: "augment", mappings: [generate], inventory }),
    /candidate.*confirmed or rejected|every observed candidate/i,
  );
  assert.throws(
    () => buildRuntimePlan({
      strategy: "augment",
      inventory,
      mappings: [{
        component: "button",
        source: { path: buttonCandidate.path, exportName: "PrimaryButton" },
        strategy: "wrapper",
        propMap: [{ canonicalProp: "children", sourceProp: "children", transform: "() => arbitraryCode" }],
        status: "confirmed",
      }],
    }),
    /transform.*not allowed/i,
  );
  assert.throws(
    () => buildRuntimePlan({
      strategy: "augment",
      inventory: componentRuntimeInventory({ candidates: [{ path: "src/ui/Button.tsx", exports: ["Button"] }] }),
      mappings: [{
        component: "button",
        source: { path: "src/ui/Button.tsx", exportName: "Button", propsExport: "ButtonProps" },
        strategy: "direct",
        api: { props: ["children"] },
        status: "confirmed",
      }],
    }),
    /exactly match.*canonical API/i,
  );
  assert.throws(
    () => buildRuntimePlan({
      strategy: "augment",
      inventory,
      mappings: [reject, {
        component: "dialog",
        source: { path: "src/ui/InventedModal.tsx", exportName: "Modal" },
        strategy: "reject",
        status: "rejected",
      }],
    }),
    /not backed by an observed candidate/i,
  );
  const unsafePath = 'src/ui/Bad";alert(1).tsx';
  assert.throws(
    () => buildRuntimePlan({
      strategy: "augment",
      inventory: componentRuntimeInventory({ candidates: [{ path: unsafePath, exports: ["Button"] }] }),
      mappings: [{
        component: "button",
        source: { path: unsafePath, exportName: "Button", propsExport: "ButtonProps" },
        strategy: "direct",
        api: { props: ["variant", "loading", "children"] },
        status: "confirmed",
      }],
    }),
    /safe.*path/i,
  );
  assert.throws(
    () => buildRuntimePlan({ strategy: "augment", inventory, mappings: [reject, { ...reject }] }),
    /exactly one terminal mapping decision/i,
  );
  assert.throws(
    () => buildRuntimePlan({
      strategy: "augment",
      inventory,
      mappings: [reject, {
        component: "button",
        source: { path: buttonCandidate.path, exportName: "PrimaryButton" },
        strategy: "wrapper",
        propMap: [
          { canonicalProp: "children", sourceProp: "children", transform: "identity" },
          { canonicalProp: "loading", sourceProp: "loading", transform: "identity" },
          { canonicalProp: "variant", sourceProp: "variant", transform: "identity" },
        ],
        status: "confirmed",
      }],
    }),
    /exactly one terminal mapping decision/i,
  );
});

test("adoption plan schema accepts only the finite confirmed TokenMappingV1 shape", async () => {
  const schema = JSON.parse(await readFile(PLAN_SCHEMA, "utf8"));
  const draft = JSON.parse(await readFile(PLAN_TEMPLATE, "utf8"));
  const validate = new Ajv2020({ allErrors: true }).compile(schema);
  const mapping = confirmedBridgeMappings()[0];
  const confirmed = {
    ...draft,
    status: "confirmed",
    strategy: "preserve",
    inventoryDigest: "sha256:fixture",
    tokenMappings: [mapping],
  };

  assert.equal(validate(confirmed), true, JSON.stringify(validate.errors));
  assert.equal(validate({ ...confirmed, tokenMappings: [{ ...mapping, source: { ...mapping.source, kind: "remote-token" } }] }), false);
  assert.equal(validate({ ...confirmed, tokenMappings: [{ ...mapping, canonicalCssVariable: "primary" }] }), false);
  assert.equal(validate({ ...confirmed, tokenMappings: [{ ...mapping, deferredRule: "component-adapter" }] }), false);
  assert.equal(validate({ ...confirmed, tokenMappings: [{ ...mapping, source: { ...mapping.source, adapterPath: "generated/tokens.ts" } }] }), false);
  assert.equal(validate({ ...confirmed, tokenMappings: [{ ...mapping, source: { ...mapping.source, name: "--Brand_PRIMARY" } }] }), true, JSON.stringify(validate.errors));
  assert.equal(validate({ ...confirmed, tokenMappings: [{ ...mapping, source: { kind: "literal", value: "red; } body { color: black" }, evidence: ["literal:red"] }] }), false);
  assert.equal(validate({ ...confirmed, tokenMappings: [{ ...mapping, source: { kind: "literal", value: "#0f6cdd", file: "src/theme.css" }, evidence: ["literal:#0f6cdd"] }] }), false);
  for (const evidence of [null, [], [""], [" "], [" src/theme.css:2"], ["src/theme.css:2 "], ["src/theme.css:\n2"], ["src/theme.css:2", "src/theme.css:2"], [7], [{}]]) {
    assert.equal(validate({ ...confirmed, tokenMappings: [{ ...mapping, evidence }] }), false, JSON.stringify(evidence));
  }
  for (const selector of [":root } body {", ".night;body", "@media screen", "/*x*/.night", ".night\nbody", ".night[", ".night)"]) {
    assert.equal(validate({ ...confirmed, tokenMappings: [{ ...mapping, selector, source: { ...mapping.source, selector } }] }), false, selector);
  }
  const safeCompound = {
    ...confirmedBridgeMappings()[1],
    selector: 'html[data-theme="dark"].night',
    source: { ...confirmedBridgeMappings()[1].source, selector: 'html[data-theme="dark"].night' },
  };
  assert.equal(validate({ ...confirmed, tokenMappings: [safeCompound] }), true, JSON.stringify(validate.errors));
  const conditional = confirmedBridgeMappings()[1];
  delete conditional.fallback.line;
  assert.equal(validate({ ...confirmed, tokenMappings: [conditional] }), false);
});

test("confirmed token bridge emits deterministic canonical aliases for each declared theme", () => {
  const result = buildTokenBridge({
    mappings: [...confirmedBridgeMappings()].reverse(),
    inventory: tokenBridgeInventory(),
    strategy: "augment",
  });

  assert.deepEqual(result.issues, []);
  assert.match(result.css, /:root\s*\{[\s\S]*--primary: var\(--brand-primary\);/);
  assert.match(result.css, /\[data-theme="dark"\]\s*\{[\s\S]*--primary: var\(--brand-primary-dark, var\(--brand-primary\)\);/);
  assert.ok(result.css.indexOf(":root") < result.css.indexOf('[data-theme="dark"]'));
  assert.deepEqual(result.map.mappings.map((item) => [item.selector, item.canonicalCssVariable]), [
    [":root", "--primary"],
    ['[data-theme="dark"]', "--primary"],
  ]);
});

test("token bridge fails closed with structured issues for unsafe or partial mappings", () => {
  const unsafe = confirmedBridgeMappings();
  unsafe[0].status = "proposed";
  unsafe.push({
    ...confirmedBridgeMappings()[0],
    canonicalToken: "semantic.color.secondary",
    source: { ...confirmedBridgeMappings()[0].source, name: "--missing-source" },
  });
  unsafe.push({
    ...confirmedBridgeMappings()[0],
    semanticToken: "color.secondary",
    canonicalToken: "semantic.color.secondary",
    source: { ...confirmedBridgeMappings()[0].source, name: "--brand-primary-dark" },
  });

  const result = buildTokenBridge({ mappings: unsafe, inventory: tokenBridgeInventory(), strategy: "augment" });

  assert.equal(result.css, "");
  assert.deepEqual(result.map, { schemaVersion: 1, ownership: "existing", mappings: [] });
  assert.ok(result.issues.some((issue) => issue.rule === "unconfirmed-token-mapping"));
  assert.ok(result.issues.some((issue) => issue.rule === "missing-token-source"));
  assert.ok(result.issues.some((issue) => issue.rule === "canonical-token-collision"));
});

test("token bridge enforces source kinds, conditional fallbacks and preserve ownership", () => {
  const cases = [
    {
      expected: "invalid-token-source-kind",
      mapping: { ...confirmedBridgeMappings()[0], source: { kind: "remote-token", name: "--brand-primary" } },
      strategy: "augment",
    },
    {
      expected: "conditional-token-fallback-required",
      mapping: { ...confirmedBridgeMappings()[1], fallback: undefined },
      strategy: "augment",
    },
    {
      expected: "preserve-design-consultant-source",
      mapping: {
        ...confirmedBridgeMappings()[0],
        source: { kind: "design-consultant", token: "color.primary", cssVariable: "--primary", value: "#0f6cdd" },
        evidence: ["design-consultant:color.primary"],
      },
      strategy: "preserve",
    },
    {
      expected: "unresolved-token-theme",
      mapping: { ...confirmedBridgeMappings()[1], theme: "sepia" },
      strategy: "augment",
    },
  ];

  for (const item of cases) {
    const result = buildTokenBridge({ mappings: [item.mapping], inventory: tokenBridgeInventory(), strategy: item.strategy });
    assert.equal(result.css, "", item.expected);
    assert.ok(result.issues.some((issue) => issue.rule === item.expected), JSON.stringify(result.issues));
  }

  const sameName = confirmedBridgeMappings()[0];
  sameName.source = { ...sameName.source, name: "--primary" };
  const inventory = tokenBridgeInventory();
  inventory.detected.tokens.items.push({ ...inventory.detected.tokens.items[0], name: "--primary" });
  const result = buildTokenBridge({ mappings: [sameName], inventory, strategy: "augment" });
  assert.deepEqual(result.issues, []);
  assert.doesNotMatch(result.css, /--primary\s*:/);
  assert.equal(result.map.mappings.length, 1);
});

test("token bridge treats rejected mappings as exclusions and blocks proposed or manual mappings", () => {
  const confirmed = confirmedBridgeMappings()[0];
  const rejected = { ...confirmedBridgeMappings()[1], status: "rejected" };
  const accepted = buildTokenBridge({ mappings: [rejected, confirmed], inventory: tokenBridgeInventory(), strategy: "augment" });
  assert.deepEqual(accepted.issues, []);
  assert.equal(accepted.map.mappings.length, 1);

  for (const status of ["proposed", "manual"]) {
    const blocked = buildTokenBridge({ mappings: [{ ...confirmed, status }], inventory: tokenBridgeInventory(), strategy: "augment" });
    assert.equal(blocked.css, "", status);
    assert.ok(blocked.issues.some((item) => item.rule === "unconfirmed-token-mapping"), status);
  }
});

test("token bridge rejects unsafe primary and fallback CSS values", () => {
  const maliciousValues = [
    "red; } body { color: black",
    "/* injected */ #fff",
    "@import 'https://example.test/x.css'",
    "red\n--owned: 1px",
    "url(javascript:alert(1))",
    "expression(alert(1))",
  ];
  for (const value of maliciousValues) {
    for (const kind of ["literal", "design-consultant"]) {
      const source = kind === "literal"
        ? { kind, value }
        : { kind, token: "color.primary", cssVariable: "--primary", value };
      const mapping = {
        ...confirmedBridgeMappings()[0],
        source,
        evidence: [kind === "literal" ? `literal:${value}` : "design-consultant:color.primary"],
      };
      const result = buildTokenBridge({ mappings: [mapping], inventory: tokenBridgeInventory(), strategy: "augment" });
      assert.equal(result.css, "", `${kind}: ${value}`);
      assert.ok(result.issues.some((item) => item.rule === "unsafe-css-token-value"), JSON.stringify(result.issues));
    }

    const conditional = confirmedBridgeMappings()[1];
    conditional.fallback = { kind: "literal", value };
    conditional.evidence = ["src/theme.css:6", `literal:${value}`];
    const result = buildTokenBridge({ mappings: [conditional], inventory: tokenBridgeInventory(), strategy: "augment" });
    assert.equal(result.css, "", `fallback: ${value}`);
    assert.ok(result.issues.some((item) => item.rule === "unsafe-css-token-value"), JSON.stringify(result.issues));
  }
});

test("token bridge accepts the finite safe design-token value forms", () => {
  const safeValues = [
    "#0f6cdd",
    "14px",
    "1.55",
    "rgb(0 0 0 / 24%)",
    "0 1px 2px rgb(0 0 0 / 24%)",
    "\"Segoe UI\", sans-serif",
    "cubic-bezier(.2, .75, .25, 1)",
  ];
  for (const value of safeValues) {
    const mapping = {
      ...confirmedBridgeMappings()[0],
      source: { kind: "literal", value },
      evidence: [`literal:${value}`],
    };
    const result = buildTokenBridge({ mappings: [mapping], inventory: tokenBridgeInventory(), strategy: "augment" });
    assert.deepEqual(result.issues, [], `${value}: ${JSON.stringify(result.issues)}`);
  }
});

test("preserve accepts only css-variable primary and fallback sources", () => {
  const cases = [
    { ...confirmedBridgeMappings()[0], source: { kind: "literal", value: "#0f6cdd" }, evidence: ["literal:#0f6cdd"] },
    {
      ...confirmedBridgeMappings()[0],
      source: { kind: "design-consultant", token: "color.primary", cssVariable: "--primary", value: "#0f6cdd" },
      evidence: ["design-consultant:color.primary"],
    },
    { ...confirmedBridgeMappings()[1], fallback: { kind: "literal", value: "#0f6cdd" }, evidence: ["src/theme.css:6", "literal:#0f6cdd"] },
    {
      ...confirmedBridgeMappings()[1],
      fallback: { kind: "design-consultant", token: "color.primary", cssVariable: "--primary", value: "#0f6cdd" },
      evidence: ["src/theme.css:6", "design-consultant:color.primary"],
    },
  ];
  for (const mapping of cases) {
    const result = buildTokenBridge({ mappings: [mapping], inventory: tokenBridgeInventory(), strategy: "preserve" });
    assert.equal(result.css, "");
    assert.ok(result.issues.some((item) => item.rule === "preserve-non-variable-source"), JSON.stringify(result.issues));
  }
});

test("css-variable sources and fallbacks require exact live evidence", () => {
  for (const field of ["file", "line", "selector", "value"]) {
    const mapping = confirmedBridgeMappings()[0];
    delete mapping.source[field];
    const result = buildTokenBridge({ mappings: [mapping], inventory: tokenBridgeInventory(), strategy: "augment" });
    assert.ok(result.issues.some((item) => item.rule === "incomplete-css-variable-evidence"), `${field}: ${JSON.stringify(result.issues)}`);
  }

  const fallback = confirmedBridgeMappings()[1];
  delete fallback.fallback.line;
  const result = buildTokenBridge({ mappings: [fallback], inventory: tokenBridgeInventory(), strategy: "augment" });
  assert.ok(result.issues.some((item) => item.rule === "incomplete-css-variable-evidence"), JSON.stringify(result.issues));

  const literal = {
    ...confirmedBridgeMappings()[0],
    source: { kind: "literal", value: "#0f6cdd", file: "src/theme.css" },
    evidence: ["literal:#0f6cdd"],
  };
  const literalResult = buildTokenBridge({ mappings: [literal], inventory: tokenBridgeInventory(), strategy: "augment" });
  assert.ok(literalResult.issues.some((item) => item.rule === "invalid-literal-source"), JSON.stringify(literalResult.issues));
});

test("canonical registry and reverse uniqueness reject arbitrary aliases and source reuse", () => {
  const arbitrary = { ...confirmedBridgeMappings()[0], canonicalCssVariable: "--brand-action" };
  let result = buildTokenBridge({ mappings: [arbitrary], inventory: tokenBridgeInventory(), strategy: "augment" });
  assert.ok(result.issues.some((item) => item.rule === "canonical-registry-mismatch"), JSON.stringify(result.issues));

  const secondary = {
    ...confirmedBridgeMappings()[0],
    semanticToken: "color.secondary",
    canonicalToken: "semantic.color.secondary",
    canonicalCssVariable: "--secondary",
  };
  result = buildTokenBridge({ mappings: [confirmedBridgeMappings()[0], secondary], inventory: tokenBridgeInventory(), strategy: "augment" });
  assert.ok(result.issues.some((item) => item.rule === "source-signature-collision"), JSON.stringify(result.issues));

  const reverse = { ...secondary, canonicalCssVariable: "--primary" };
  result = buildTokenBridge({ mappings: [confirmedBridgeMappings()[0], reverse], inventory: tokenBridgeInventory(), strategy: "augment" });
  assert.ok(result.issues.some((item) => item.rule === "canonical-variable-reused"), JSON.stringify(result.issues));
});

test("uppercase and underscore CSS custom properties remain valid bridge sources", () => {
  const mapping = {
    ...confirmedBridgeMappings()[0],
    source: { kind: "css-variable", name: "--Brand_PRIMARY", file: "src/theme.css", line: 2, selector: ":root", value: "#2457d6" },
  };
  const inventory = tokenBridgeInventory();
  inventory.detected.tokens.items = [{ ...mapping.source }];
  const result = buildTokenBridge({ mappings: [mapping], inventory, strategy: "augment" });
  assert.deepEqual(result.issues, [], JSON.stringify(result.issues));
  assert.match(result.css, /var\(--Brand_PRIMARY\)/);
});

test("inventory records explicit light and observed dark theme modes without bridge spelling heuristics", async (t) => {
  const projectRoot = await makeInventoryProject(t);
  await mkdir(join(projectRoot, "src"), { recursive: true });
  await writeFile(join(projectRoot, "src/theme.css"), [
    ":root { --base-primary: #123456; }",
    '[data-theme="light"] { color-scheme: light; --light-primary: #234567; }',
    ".night { color-scheme: dark; --night-primary: #abcdef; }",
    "",
  ].join("\n"), "utf8");
  const inventory = await collectSystemInventory({ projectRoot, outputRoot: join(projectRoot, "design-system") });
  assert.ok(inventory.detected.themeDeclarations.some((item) => item.selector === '[data-theme="light"]' && item.theme === "light"));
  assert.ok(inventory.detected.themeDeclarations.some((item) => item.selector === ".night" && item.theme === "dark"));

  const base = { kind: "css-variable", name: "--base-primary", file: "src/theme.css", line: 1, selector: ":root", value: "#123456" };
  const mappings = [
    {
      ...confirmedBridgeMappings()[0],
      source: { kind: "css-variable", name: "--light-primary", file: "src/theme.css", line: 2, selector: '[data-theme="light"]', value: "#234567" },
      fallback: base,
      selector: '[data-theme="light"]',
      theme: "light",
      evidence: ["src/theme.css:1", "src/theme.css:2"],
    },
    {
      ...confirmedBridgeMappings()[0],
      source: { kind: "css-variable", name: "--night-primary", file: "src/theme.css", line: 3, selector: ".night", value: "#abcdef" },
      fallback: base,
      selector: ".night",
      theme: "dark",
      evidence: ["src/theme.css:1", "src/theme.css:3"],
    },
  ];
  const result = buildTokenBridge({ mappings, inventory, strategy: "augment" });
  assert.deepEqual(result.issues, [], JSON.stringify(result.issues));
});

test("token bridge rejects unsafe live selectors and accepts finite safe compound selectors", () => {
  const maliciousSelectors = [
    ":root } body {",
    ".night;body",
    "@media screen",
    "/*x*/.night",
    ".night\nbody",
    ".night[",
    ".night)",
  ];
  for (const selector of maliciousSelectors) {
    const mapping = structuredClone(confirmedBridgeMappings()[1]);
    mapping.selector = selector;
    mapping.source.selector = selector;
    const inventory = tokenBridgeInventory();
    inventory.detected.tokens.items[1].selector = selector;
    inventory.detected.themeDeclarations[1].selector = selector;
    const result = buildTokenBridge({ mappings: [mapping], inventory, strategy: "augment" });
    assert.equal(result.css, "", selector);
    assert.ok(result.issues.some((item) => item.rule === "invalid-token-selector"), `${selector}: ${JSON.stringify(result.issues)}`);
  }

  for (const selector of [".night", ".theme.night", "html.night", 'html[data-theme="dark"].night']) {
    const mapping = structuredClone(confirmedBridgeMappings()[1]);
    mapping.selector = selector;
    mapping.source.selector = selector;
    const inventory = tokenBridgeInventory();
    inventory.detected.tokens.items[1].selector = selector;
    inventory.detected.themeDeclarations[1].selector = selector;
    const result = buildTokenBridge({ mappings: [mapping], inventory, strategy: "augment" });
    assert.deepEqual(result.issues, [], `${selector}: ${JSON.stringify(result.issues)}`);
    assert.match(result.css, new RegExp(mapping.canonicalCssVariable));
  }
});

test("token bridge enforces schema-equivalent evidence and preserves original plan indices", () => {
  const invalidEvidence = [null, [], [""], [" "], [" src/theme.css:2"], ["src/theme.css:2 "], ["src/theme.css:\n2"], ["src/theme.css:2", "src/theme.css:2"], [7], [{}]];
  for (const evidence of invalidEvidence) {
    const mapping = { ...confirmedBridgeMappings()[0], evidence };
    const result = buildTokenBridge({ mappings: [mapping], inventory: tokenBridgeInventory(), strategy: "augment" });
    assert.equal(result.css, "", JSON.stringify(evidence));
    assert.ok(result.issues.some((item) => item.rule === "invalid-token-evidence" && item.mappingIndex === 0), JSON.stringify(result.issues));
  }

  const unsafe = structuredClone(confirmedBridgeMappings()[0]);
  unsafe.selector = ".night;body";
  unsafe.source.selector = unsafe.selector;
  let result = buildTokenBridge({
    mappings: [
      { ...confirmedBridgeMappings()[0], status: "rejected" },
      { ...confirmedBridgeMappings()[0], status: "rejected" },
      unsafe,
    ],
    inventory: tokenBridgeInventory(),
    strategy: "augment",
  });
  assert.ok(result.issues.some((item) => item.rule === "invalid-token-selector" && item.mappingIndex === 2), JSON.stringify(result.issues));

  const secondary = structuredClone(confirmedBridgeMappings()[0]);
  secondary.semanticToken = "color.secondary";
  secondary.canonicalToken = "semantic.color.secondary";
  secondary.canonicalCssVariable = "--secondary";
  result = buildTokenBridge({
    mappings: [
      { ...confirmedBridgeMappings()[0], status: "rejected" },
      confirmedBridgeMappings()[0],
      { ...confirmedBridgeMappings()[0], status: "rejected" },
      secondary,
    ],
    inventory: tokenBridgeInventory(),
    strategy: "augment",
  });
  assert.ok(result.issues.some((item) => item.rule === "source-signature-collision" && item.mappingIndex === 3), JSON.stringify(result.issues));
});

test("existing-system fixtures represent mature, partial and non-React projects", async () => {
  assert.equal(await exists(join(FIXTURES, "existing-mature-react/src/ui/PrimaryButton.tsx")), true);
  assert.equal(await exists(join(FIXTURES, "existing-partial-react/src/components/Button.tsx")), true);
  assert.equal(await exists(join(FIXTURES, "existing-non-react/src/styles.css")), true);

  const matureTheme = await readFixture("existing-mature-react/src/theme.css");
  assert.match(matureTheme, /:root\s*\{[\s\S]*--harbor-primary:/);
  assert.match(matureTheme, /\[data-theme="dark"\]\s*\{[\s\S]*--harbor-primary:/);
  assert.match(await readFixture("existing-mature-react/src/ui/PrimaryButton.tsx"), /export function PrimaryButton/);
  assert.match(await readFixture("existing-mature-react/src/ui/Modal.tsx"), /export function Modal/);

  const matureRoot = join(FIXTURES, "existing-mature-react");
  const muiImports = [];
  for (const file of await collectFiles(matureRoot)) {
    const source = await readFile(file, "utf8");
    if (/\.(?:[cm]?[jt]sx?)$/.test(file) && source.includes("@mui/material")) {
      muiImports.push(file);
    }
  }
  assert.ok(muiImports.length > 0, "mature fixture should contain at least one @mui/material import");
  for (const file of muiImports) assert.match(file, /[\\/]src[\\/]ui[\\/]/);

  const partialPackage = JSON.parse(await readFixture("existing-partial-react/package.json"));
  assert.equal(partialPackage.dependencies.react, "19.2.8");
  assert.match(await readFixture("existing-partial-react/src/styles.css"), /--color-primary:/);
  assert.doesNotMatch(await readFixture("existing-partial-react/src/styles.css"), /--color-secondary:/);
  assert.match(await readFixture("existing-partial-react/src/components/Button.tsx"), /export const Button\s*=/);

  const nonReactPackage = JSON.parse(await readFixture("existing-non-react/package.json"));
  assert.equal(nonReactPackage.dependencies.vue, "3.5.13");
  assert.equal(nonReactPackage.dependencies.react, undefined);
  assert.equal(nonReactPackage.dependencies["react-dom"], undefined);
  assert.match(await readFixture("existing-non-react/src/styles.css"), /--vue-primary:/);
  const nonReactFiles = await collectFiles(join(FIXTURES, "existing-non-react"));
  assert.equal(nonReactFiles.some((file) => /\.(jsx?|tsx?)$/.test(file)), false);
});

test("inventory records token definitions, selectors, values and usage counts", async () => {
  const report = await collectSystemInventory({
    projectRoot: join(FIXTURES, "existing-mature-react"),
    outputRoot: join(FIXTURES, "existing-mature-react", "design-system"),
  });
  const primary = report.detected.tokens.items.find((item) => item.name === "--brand-primary");

  assert.equal(primary.selector, ":root");
  assert.equal(primary.value, "#2457d6");
  assert.equal(primary.usageCount, 1);
  assert.equal(primary.status, "observed");
  assert.equal("strategy" in report, false);
  assert.equal(JSON.stringify(report).includes("confirmed"), false);
});

test("inventory records component exports without claiming semantic compatibility", async () => {
  const report = await collectSystemInventory({
    projectRoot: join(FIXTURES, "existing-mature-react"),
    outputRoot: join(FIXTURES, "existing-mature-react", "design-system"),
  });
  const button = report.detected.components.find((item) => item.exports.includes("PrimaryButton"));

  assert.equal(button.path, "src/ui/PrimaryButton.tsx");
  assert.equal(button.status, "observed");
  assert.ok(button.externalImports.includes("@mui/material"));
  assert.equal(button.semanticCompatibility, undefined);
});

test("inventory preserves non-React framework evidence without React runtime candidates", async () => {
  const report = await collectSystemInventory({
    projectRoot: join(FIXTURES, "existing-non-react"),
    outputRoot: join(FIXTURES, "existing-non-react", "design-system"),
  });

  assert.deepEqual(report.detected.frameworks, ["Vue"]);
  assert.deepEqual(report.detected.reactRuntimeCandidates, []);
  assert.equal(report.evidenceLimitReached, false);
});

test("inventory records dark declaration usage and config evidence separately", async (t) => {
  const projectRoot = await makeInventoryProject(t);
  await mkdir(join(projectRoot, "src"), { recursive: true });
  await writeFile(join(projectRoot, "src/theme.css"), ':root { --color-bg: white; }\n[data-theme="dark"] { --color-bg: black; }\n', "utf8");
  await writeFile(join(projectRoot, "src/App.tsx"), 'document.documentElement.dataset.theme = "dark";\nexport const App = () => <main />;\n', "utf8");
  await writeFile(join(projectRoot, "tailwind.config.js"), 'export default { darkMode: "class" };\n', "utf8");

  const report = await collectSystemInventory({ projectRoot, outputRoot: join(projectRoot, "design-system") });

  assert.ok(report.detected.themeDeclarations.some((item) => /dark/i.test(item.selector)));
  assert.ok(report.detected.themeUsage.some((item) => item.file === "src/App.tsx"));
  assert.equal(report.detected.themeUsage.some((item) => item.file === "src/theme.css"), false);
  assert.ok(report.detected.themeConfig.some((item) => item.file === "tailwind.config.js"));
  assert.ok([...report.detected.themeDeclarations, ...report.detected.themeUsage, ...report.detected.themeConfig]
    .every((item) => item.status === "observed"));
});

test("inventory excludes generated output artifacts from upstream evidence", async (t) => {
  const projectRoot = await makeInventoryProject(t);
  const outputRoot = join(projectRoot, "design-system");
  await mkdir(join(projectRoot, "src"), { recursive: true });
  await mkdir(join(outputRoot, "tokens"), { recursive: true });
  await writeFile(join(projectRoot, "src", "theme.css"), ":root { --upstream: #123456; }\n", "utf8");
  await writeFile(join(outputRoot, "DESIGN.md"), "generated design system\n", "utf8");
  await writeFile(join(outputRoot, "tokens", "tokens.json"), "{}\n", "utf8");

  const report = await collectSystemInventory({ projectRoot, outputRoot });

  assert.equal(report.detected.existingDesignArtifacts.includes("design-system/DESIGN.md"), false);
  assert.equal(report.detected.existingDesignArtifacts.includes("design-system/tokens/tokens.json"), false);
});

test("package context distinguishes missing, syntax, filesystem kind, and read I/O failures", async (t) => {
  const missingProject = await makeInventoryProject(t);
  const missing = await collectSystemInventory({ projectRoot: missingProject, outputRoot: join(missingProject, "design-system") });
  assert.deepEqual(missing.detected.frameworks, []);
  assert.deepEqual(missing.warnings, []);

  const syntaxProject = await makeInventoryProject(t);
  await writeFile(join(syntaxProject, "package.json"), "{invalid json\n", "utf8");
  const syntax = await collectSystemInventory({ projectRoot: syntaxProject, outputRoot: join(syntaxProject, "design-system") });
  assert.deepEqual(syntax.detected.frameworks, []);
  assert.equal(syntax.warnings.length, 1);
  assert.match(syntax.warnings[0], /package\.json/i);

  const directoryProject = await makeInventoryProject(t);
  await mkdir(join(directoryProject, "package.json"));
  await assert.rejects(
    collectSystemInventory({ projectRoot: directoryProject, outputRoot: join(directoryProject, "design-system") }),
    /package\.json.*ordinary file|ordinary file.*package\.json/i,
  );
  const directoryExtract = runCliProcess(directoryProject, ["extract"]);
  assert.notEqual(directoryExtract.status, 0, directoryExtract.stdout || directoryExtract.stderr);
  assert.match(directoryExtract.stderr, /package\.json.*ordinary file|ordinary file.*package\.json/i);
  assert.equal(directoryExtract.stdout, "");
  assert.equal(await exists(join(directoryProject, "design-system")), false);

  const ioProject = await makeInventoryProject(t);
  await writeFile(join(ioProject, "package.json"), "{}\n", "utf8");
  const ioError = Object.assign(new Error("injected package read failure"), { code: "EBUSY" });
  await assert.rejects(
    collectSystemInventory({
      projectRoot: ioProject,
      outputRoot: join(ioProject, "design-system"),
      packageReadFile: async () => { throw ioError; },
    }),
    /package\.json.*EBUSY|EBUSY.*package\.json/i,
  );
  await assert.rejects(
    readPackageContext(ioProject, [], { readFile: async () => { throw ioError; } }),
    /package\.json.*EBUSY|EBUSY.*package\.json/i,
  );
});

test("inventory scans design-system directories that are not the exact configured output", async (t) => {
  const projectRoot = await makeInventoryProject(t);
  const outputRoot = join(projectRoot, "design-system");
  await mkdir(join(projectRoot, "src/design-system"), { recursive: true });
  await writeFile(join(projectRoot, "package.json"), `${JSON.stringify({ dependencies: { react: "19.2.0" } })}\n`, "utf8");
  await writeFile(
    join(projectRoot, "src/design-system/Button.tsx"),
    `import type { ReactNode } from "react";
export interface ButtonProps { variant?: "primary" | "secondary" | "ghost" | "danger"; loading?: boolean; children: ReactNode; }
export function Button(props: ButtonProps) { return <button disabled={props.loading}>{props.children}</button>; }
`,
    "utf8",
  );

  const inventory = await collectSystemInventory({ projectRoot, outputRoot });
  const candidate = inventory.detected.reactRuntimeCandidates.find((item) => item.path === "src/design-system/Button.tsx");
  assert.ok(candidate, "non-output design-system sources must remain observed candidates");

  const { createDraftAdoptionPlan, evaluateCompatibility: evaluate } = await import(pathToFileURL(COMPATIBILITY_PATH));
  const compatibility = evaluate(inventory, await readAliases());
  const plan = createDraftAdoptionPlan(compatibility);
  plan.strategy = "augment";
  plan.componentMappings.push({ component: "button", strategy: "generate", approved: true, status: "confirmed" });
  assert.throws(
    () => buildRuntimePlan({ strategy: plan.strategy, mappings: plan.componentMappings, inventory }),
    /candidate.*confirmed or rejected|terminal/i,
  );
});

test("inventory fails closed on source links while exact output and fixed generated directories remain excluded", async (t) => {
  const cases = [
    {
      label: "source subtree junction",
      setup: async (projectRoot, outside) => {
        await mkdir(join(outside, "linked-src"), { recursive: true });
        await writeFile(join(outside, "linked-src/Button.tsx"), "export function Button() { return null; }\n", "utf8");
        return createDirectoryLinkOrSkip(t, join(outside, "linked-src"), join(projectRoot, "src"));
      },
    },
    {
      label: "eligible TSX symlink",
      setup: async (projectRoot, outside) => {
        await mkdir(join(projectRoot, "src"), { recursive: true });
        await writeFile(join(outside, "Button.tsx"), "export function Button() { return null; }\n", "utf8");
        return createFileLinkOrSkip(t, join(outside, "Button.tsx"), join(projectRoot, "src/Button.tsx"));
      },
    },
    {
      label: "eligible CSS symlink",
      setup: async (projectRoot, outside) => {
        await mkdir(join(projectRoot, "src"), { recursive: true });
        await writeFile(join(outside, "theme.css"), ":root { --brand: red; }\n", "utf8");
        return createFileLinkOrSkip(t, join(outside, "theme.css"), join(projectRoot, "src/theme.css"));
      },
    },
    {
      label: "root tokens.css symlink",
      setup: async (projectRoot, outside) => {
        await writeFile(join(outside, "tokens.css"), ":root { --brand: red; }\n", "utf8");
        return createFileLinkOrSkip(t, join(outside, "tokens.css"), join(projectRoot, "tokens.css"));
      },
    },
    {
      label: "root package.json symlink",
      setup: async (projectRoot, outside) => {
        await writeFile(join(outside, "package.json"), "{\"dependencies\":{\"react\":\"19.2.0\"}}\n", "utf8");
        return createFileLinkOrSkip(t, join(outside, "package.json"), join(projectRoot, "package.json"));
      },
    },
  ];

  for (const { label, setup } of cases) {
    const projectRoot = await makeInventoryProject(t);
    const outside = await mkdtemp(join(tmpdir(), "design-consultant-linked-evidence-"));
    t.after(() => rm(outside, { recursive: true, force: true }));
    if (!await setup(projectRoot, outside)) continue;
    await assert.rejects(
      collectSystemInventory({ projectRoot, outputRoot: join(projectRoot, "design-system") }),
      (error) => /link|symbolic|junction|reparse|unsafe/i.test(error.message) && error.message.includes(label.includes("package") ? "package.json" : label.includes("tokens") ? "tokens.css" : label.includes("CSS") ? "theme.css" : label.includes("TSX") ? "Button.tsx" : "src"),
      label,
    );
  }

  const projectRoot = await makeInventoryProject(t);
  const outputRoot = join(projectRoot, "design-system");
  const outside = await mkdtemp(join(tmpdir(), "design-consultant-ignored-links-"));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await mkdir(join(projectRoot, "src"), { recursive: true });
  await writeFile(join(projectRoot, "src/App.tsx"), "export function App() { return null; }\n", "utf8");
  await mkdir(outputRoot, { recursive: true });
  await writeFile(join(outputRoot, "IgnoredOutput.tsx"), "export function Button() { return null; }\n", "utf8");
  await writeFile(join(outside, "ignored.tsx"), "export function Button() { return null; }\n", "utf8");
  for (const name of ["node_modules", "build", ".git"]) {
    await mkdir(join(projectRoot, name), { recursive: true });
    if (!await createDirectoryLinkOrSkip(t, outside, join(projectRoot, name, "linked-evidence"))) return;
  }
  if (await createFileLinkOrSkip(t, join(outside, "ignored.tsx"), join(outputRoot, "Ignored.tsx"))) {
    assert.equal(await exists(join(outputRoot, "Ignored.tsx")), true);
  }

  const inventory = await collectSystemInventory({ projectRoot, outputRoot });
  assert.deepEqual(inventory.detected.components.map((item) => item.path), ["src/App.tsx"]);
});

test("extract rejects linked source evidence before creating output", async (t) => {
  const projectRoot = await makeInventoryProject(t);
  const outside = await mkdtemp(join(tmpdir(), "design-consultant-linked-extract-source-"));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(join(projectRoot, "package.json"), "{\"dependencies\":{\"react\":\"19.2.0\"}}\n", "utf8");
  await writeFile(join(outside, "Button.tsx"), "export function Button() { return null; }\n", "utf8");
  if (!await createDirectoryLinkOrSkip(t, outside, join(projectRoot, "src"))) return;

  const result = runCliProcess(projectRoot, ["extract"]);

  assert.notEqual(result.status, 0, result.stdout || result.stderr);
  assert.match(result.stderr, /link|symbolic|junction|reparse/i);
  assert.equal(result.stdout, "");
  assert.equal(await exists(join(projectRoot, "design-system")), false);
});

test("inventory counts only exact var token references and excludes declarations", async (t) => {
  const projectRoot = await makeInventoryProject(t);
  const outputRoot = join(projectRoot, "design-system");
  await mkdir(join(projectRoot, "src"), { recursive: true });
  await writeFile(
    join(projectRoot, "src", "theme.css"),
    ":root { --brand-primary: #2457d6; --brand-primary-dark: #173042; }\n.sample { color: var(--brand-primary); background: var(--brand-primary-dark); }\n",
    "utf8",
  );

  const report = await collectSystemInventory({ projectRoot, outputRoot });
  const primary = report.detected.tokens.items.find((item) => item.name === "--brand-primary");
  const dark = report.detected.tokens.items.find((item) => item.name === "--brand-primary-dark");

  assert.equal(primary.usageCount, 1);
  assert.equal(dark.usageCount, 1);
});

test("inventory reports the evidence limit only after an additional eligible file", async (t) => {
  const projectRoot = await makeInventoryProject(t);
  const outputRoot = join(projectRoot, "design-system");
  await writeFile(join(projectRoot, "one.css"), ":root { --one: 1; }\n", "utf8");
  await writeFile(join(projectRoot, "two.css"), ":root { --two: 2; }\n", "utf8");

  assert.equal((await collectSystemInventory({ projectRoot, outputRoot, maxFiles: 2 })).evidenceLimitReached, false);

  await writeFile(join(projectRoot, "three.css"), ":root { --three: 3; }\n", "utf8");
  assert.equal((await collectSystemInventory({ projectRoot, outputRoot, maxFiles: 2 })).evidenceLimitReached, true);
});

test("inventory evidence limiting is deterministic across creation order", async (t) => {
  const projects = [await makeInventoryProject(t), await makeInventoryProject(t)];
  const creationOrders = [["c.css", "a.css", "b.css"], ["b.css", "c.css", "a.css"]];
  const inventories = [];
  for (const [index, projectRoot] of projects.entries()) {
    await mkdir(join(projectRoot, "src"), { recursive: true });
    for (const name of creationOrders[index]) {
      const token = name.slice(0, 1);
      await writeFile(join(projectRoot, "src", name), `:root { --${token}: ${token}; }\n`, "utf8");
    }
    inventories.push(await collectSystemInventory({ projectRoot, outputRoot: join(projectRoot, "design-system"), maxFiles: 2 }));
  }
  const { computeInventoryDigest } = await import(pathToFileURL(COMPATIBILITY_PATH));

  assert.equal(inventories[0].evidenceLimitReached, true);
  assert.equal(inventories[1].evidenceLimitReached, true);
  assert.deepEqual(inventories[0].detected.tokens.items.map((item) => item.name), ["--a", "--b"]);
  assert.deepEqual(inventories[1].detected.tokens.items.map((item) => item.name), ["--a", "--b"]);
  assert.equal(computeInventoryDigest(inventories[0]), computeInventoryDigest(inventories[1]));
});

test("inventory records complete interaction and accessibility evidence with provenance", async (t) => {
  const projectRoot = await makeInventoryProject(t);
  await mkdir(join(projectRoot, "src/components/ui"), { recursive: true });
  await writeFile(join(projectRoot, "DESIGN.md"), "# Existing design system\n", "utf8");
  await writeFile(
    join(projectRoot, "package.json"),
    `${JSON.stringify({ dependencies: { react: "19.2.0", "@mui/material": "7.0.0", clsx: "2.1.0" } }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    join(projectRoot, "src/components/ui/Button.tsx"),
    'import Button from "@mui/material/Button";\nexport const PrimaryButton = () => <Button aria-label="Save" onKeyDown={() => {}} disabled={false}>Save</Button>;\n',
    "utf8",
  );
  await writeFile(
    join(projectRoot, "src/components/ui/button.css"),
    '.button:hover {}\n.button:focus-visible {}\n.button:active {}\n.button:disabled {}\n.button[data-loading="true"] {}\n',
    "utf8",
  );

  const inventory = await collectSystemInventory({ projectRoot, outputRoot: join(projectRoot, "design-system") });
  const interactionKinds = new Set((inventory.detected.interactionStates ?? []).map((item) => item.kind));
  const accessibilityKinds = new Set((inventory.detected.accessibility ?? []).map((item) => item.kind));

  assert.deepEqual([...interactionKinds].sort(), ["active", "disabled", "focus", "hover", "loading"]);
  assert.deepEqual([...accessibilityKinds].sort(), ["focus-visible", "keyboard", "semantic-aria"]);
  assert.ok([...(inventory.detected.interactionStates ?? []), ...(inventory.detected.accessibility ?? [])]
    .every((item) => item.status === "observed" && item.file && Number.isInteger(item.line)));
});

test("inventory preserves comment-like strings while extracting imports, exports and JSX", () => {
  const evidence = collectComponentEvidence({
    file: "virtual.tsx",
    relativePath: "src/virtual.tsx",
    content: 'const label = "// literal"; export const Later = () => <Button />;\nconst source = "/* literal */"; import { Button } from "@mui/* literal */material";\n',
  });

  assert.ok(evidence.exports.includes("Later"));
  assert.ok(evidence.externalImports.includes("@mui/* literal */material"));
  assert.ok(evidence.jsxRoles.includes("Button"));
});

test("inventory strips real comments inside nested template expressions", () => {
  const evidence = collectComponentEvidence({
    file: "virtual.tsx",
    relativePath: "src/virtual.tsx",
    content: 'const text = `${/* export const Ghost = () => <Ghost />; import "phantom"; */ `${"nested"}`}`;\nexport const Actual = () => <button />;\n',
  });

  assert.equal(evidence.exports.includes("Ghost"), false);
  assert.equal(evidence.externalImports.includes("phantom"), false);
  assert.equal(evidence.jsxRoles.includes("Ghost"), false);
  assert.ok(evidence.exports.includes("Actual"));
  assert.ok(evidence.jsxRoles.includes("button"));
});

test("inventory strips Vue and Svelte HTML comments before component extraction", () => {
  for (const extension of ["vue", "svelte"]) {
    const evidence = collectComponentEvidence({
      file: `virtual.${extension}`,
      relativePath: `src/virtual.${extension}`,
      content: '<!-- export const Ghost = () => <Ghost />; import "phantom"; -->\n<script>export const Actual = () => <button />;</script>\n<div>{"export const MarkupGhost = 1"}</div>\n',
    });

    assert.equal(evidence.exports.includes("Ghost"), false, extension);
    assert.equal(evidence.exports.includes("MarkupGhost"), false, extension);
    assert.equal(evidence.externalImports.includes("phantom"), false, extension);
    assert.equal(evidence.jsxRoles.includes("Ghost"), false, extension);
    assert.ok(evidence.exports.includes("Actual"), extension);
    assert.ok(evidence.jsxRoles.includes("button"), extension);
  }
});

test("inventory classifies a default alias export by its local symbol", () => {
  const evidence = collectComponentEvidence({
    file: "virtual.tsx",
    relativePath: "src/virtual.tsx",
    content: "const Foo = () => null; export { Foo as default };\n",
  });

  assert.equal(evidence.defaultExport, "default");
  assert.equal(evidence.defaultExportLocalName, "Foo");
  assert.equal(evidence.exports.includes("default"), true);
  assert.equal(evidence.namedExports.includes("default"), false);
});

test("default React exports retain the executable module name and close candidate decisions", async () => {
  const { evaluateCompatibility } = await import(pathToFileURL(COMPATIBILITY_PATH));
  const aliases = await readAliases();
  const forms = [
    ["function", "export default function Button() { return null; }"],
    ["class", "export default class Button {}"],
    ["identifier", "const Button = () => null; export default Button;"],
    ["anonymous", "export default function () { return null; }"],
  ];
  for (const [name, content] of forms) {
    const evidence = collectComponentEvidence({ file: "Button.tsx", relativePath: "src/Button.tsx", content });
    assert.equal(evidence.defaultExport, "default", name);
    assert.equal(evidence.exports.includes("default"), true, name);
    const inventory = {
      schemaVersion: 2,
      project: { output: "design-system" },
      detected: { frameworks: ["React"], components: [evidence], reactRuntimeCandidates: [evidence] },
      evidenceLimitReached: false,
    };
    const compatibility = evaluateCompatibility(inventory, aliases);
    const candidate = compatibility.componentCandidates.find((item) => item.component === "button");
    assert.deepEqual(candidate?.source, { path: "src/Button.tsx", exportName: "default" }, name);
    assert.throws(() => buildRuntimePlan({ strategy: "augment", mappings: [], inventory }), /confirmed or rejected|terminal|candidate/i, name);
    assert.throws(() => buildRuntimePlan({
      strategy: "augment",
      inventory,
      mappings: [{ component: "button", strategy: "generate", approved: true, status: "confirmed" }],
    }), /rejected|candidate/i, name);
    const generated = buildRuntimePlan({
      strategy: "augment",
      inventory,
      mappings: [
        { component: "button", strategy: "reject", source: { path: "src/Button.tsx", exportName: "default" }, status: "rejected" },
        { component: "button", strategy: "generate", approved: true, status: "confirmed" },
      ],
    });
    assert.equal(generated.generatedComponents.length, 1, name);
  }

  const directInventory = {
    project: { output: "design-system" },
    detected: {
      frameworks: ["React"],
      reactRuntimeCandidates: [{
        path: "src/Button.tsx",
        exports: ["default"],
        namedExports: [],
        defaultExport: "default",
        defaultExportLocalName: "Button",
      }],
    },
  };
  const direct = buildRuntimePlan({
    strategy: "augment",
    inventory: directInventory,
    mappings: [{
      component: "button",
      strategy: "direct",
      source: { path: "src/Button.tsx", exportName: "default", propsExport: "ButtonProps" },
      api: { props: ["variant", "loading", "children"] },
      status: "confirmed",
    }],
  });
  assert.equal(direct.directComponents[0].source.exportName, "default");
  assert.match(direct.entries[0].sourceImportPath, /Button$/);
});

test("inventory export evidence ignores phantom and type-only exports", () => {
  const evidence = collectComponentEvidence({
    file: "virtual.tsx",
    relativePath: "src/virtual.tsx",
    content: `const Button = () => null;
const text = "export const StringPhantom = 1";
const template = \`export const TemplatePhantom = 1\`;
const pattern = /export\\s+const\\s+RegexPhantom/;
// export const CommentPhantom = 1;
export type TypeOnly = { value: string };
export { type TypeOnly as TypeAlias, Button as OtherButton };
export const RealButton = Button;
`,
  });

  assert.deepEqual(evidence.namedExports, ["OtherButton", "RealButton"]);
  assert.deepEqual(evidence.typeExports, ["TypeAlias", "TypeOnly"]);
  assert.deepEqual(evidence.reExports, []);
});

test("inventory semantic export evidence recognizes async values and rejects statement phantoms", () => {
  const evidence = collectComponentEvidence({
    file: "virtual.tsx",
    relativePath: "src/virtual.tsx",
    content: `if (true) /export\\s+async\\s+function\\s+RegexPhantom/;
const text = \`export async function TemplatePhantom() {}\`;
export async function Button() { return null; }
export default class Dialog {}
`,
  });

  assert.deepEqual(evidence.namedExports, ["Button"]);
  assert.equal(evidence.defaultExport, "default");
  assert.equal(evidence.defaultExportLocalName, "Dialog");
  assert.equal(evidence.exports.includes("RegexPhantom"), false);
  assert.equal(evidence.exports.includes("TemplatePhantom"), false);
});

test("inventory follows re-exports only when the target symbol is a value", async (t) => {
  const projectRoot = await makeInventoryProject(t);
  await mkdir(join(projectRoot, "src"), { recursive: true });
  await writeFile(join(projectRoot, "package.json"), `${JSON.stringify({ dependencies: { react: "19.2.8" } })}\n`, "utf8");
  await writeFile(join(projectRoot, "src/value.tsx"), "export function Button() { return null; }\n", "utf8");
  await writeFile(join(projectRoot, "src/types.ts"), "export interface Button { label: string; }\n", "utf8");
  await writeFile(join(projectRoot, "src/barrel.ts"), `export { Button } from "./value";
export { Button as TypeButton } from "./types";
`, "utf8");

  const inventory = await collectSystemInventory({ projectRoot, outputRoot: join(projectRoot, "design-system") });
  const barrel = inventory.detected.components.find((entry) => entry.path === "src/barrel.ts");
  assert.ok(barrel);
  assert.deepEqual(barrel.namedExports, ["Button"]);
  assert.equal(barrel.exports.includes("TypeButton"), false);
  assert.ok(barrel.typeExports.includes("TypeButton"));
});

test("inventory conservatively parses only real Vue and Svelte script exports", () => {
  for (const file of ["Component.vue", "Component.svelte"]) {
    const evidence = collectComponentEvidence({
      file,
      relativePath: `src/${file}`,
      content: `<script lang="ts">
const Local = {};
export { Local as RealComponent };
</script>
<div>{"export const MarkupPhantom = 1"}</div>`,
    });
    assert.deepEqual(evidence.namedExports, ["RealComponent"]);
  }
});

test("truncated extraction evidence blocks adopt and checker before every write", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-mature-react");
  runCli(projectRoot, ["extract"]);
  await forgeAdoptionArtifacts(projectRoot, (inventory) => {
    inventory.evidenceLimitReached = true;
    inventory.warnings = [...(inventory.warnings ?? []), "Evidence collection stopped at maxFiles; rerun extract with a complete inventory boundary."];
  });
  const before = await snapshotOutput(projectRoot);

  const adopted = runCliProcess(projectRoot, ["adopt"]);
  assert.notEqual(adopted.status, 0, adopted.stdout || adopted.stderr);
  assert.match(`${adopted.stdout}\n${adopted.stderr}`, /incomplete|evidence|limit|re-?extract|maxFiles/i);
  assert.deepEqual(await snapshotOutput(projectRoot), before);

  const checked = await validateAdoptionContract(join(projectRoot, "design-system"));
  assert.equal(checked.ok, false);
  assert.ok(checked.issues.some((issue) => /incomplete|evidence|limit/i.test(`${issue.rule} ${issue.message}`)), JSON.stringify(checked.issues));
  assert.deepEqual(await snapshotOutput(projectRoot), before);
});

test("truncated extraction evidence blocks confirmed update without touching managed bytes", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-mature-react");
  runCli(projectRoot, ["extract"]);
  await confirmPlan(projectRoot);
  runCli(projectRoot, ["adopt"]);
  await forgeAdoptionArtifacts(projectRoot, (inventory) => {
    inventory.evidenceLimitReached = true;
    inventory.warnings = [...(inventory.warnings ?? []), "Evidence collection stopped at maxFiles."];
  });
  const before = await snapshotOutput(projectRoot);

  const updated = runCliProcess(projectRoot, ["update"]);
  assert.notEqual(updated.status, 0, updated.stdout || updated.stderr);
  assert.match(`${updated.stdout}\n${updated.stderr}`, /incomplete|evidence|limit|maxFiles/i);
  assert.deepEqual(await snapshotOutput(projectRoot), before);
});

test("mature systems recommend preserve but keep every candidate proposed", async () => {
  const { computeInventoryDigest, evaluateCompatibility } = await import(pathToFileURL(COMPATIBILITY_PATH));
  const aliases = await readAliases();
  const inventory = buildMatureInventory(aliases);
  const inventoryBefore = structuredClone(inventory);
  const aliasesBefore = structuredClone(aliases);

  const report = evaluateCompatibility(inventory, aliases);

  assert.equal(report.schemaVersion, 1);
  assert.equal(report.inventoryDigest, computeInventoryDigest(inventory));
  assert.equal(report.recommendation.strategy, "preserve");
  assert.ok(report.recommendation.reasons.length > 0);
  assert.equal(report.tokenCoverage.required, 28);
  assert.ok(report.tokenCoverage.exact + report.tokenCoverage.candidate >= 23);
  assert.equal(report.componentCoverage.required, 8);
  assert.ok(report.componentCoverage.direct + report.componentCoverage.wrapper + report.componentCoverage.manual >= 6);
  assert.ok(report.tokenCandidates.every((item) => item.status === "proposed"));
  assert.ok(report.componentCandidates.every((item) => item.status === "proposed"));
  assert.equal(report.optimizationAdvice.benchmark, "design-consultant-v0.10");
  assert.ok(report.optimizationAdvice.alignedAreas.length > 0);
  assert.ok(report.optimizationAdvice.opportunities.length > 0);
  assert.ok(report.optimizationAdvice.alignedAreas.every((item) => item.reason?.length > 0));
  assert.ok(report.optimizationAdvice.opportunities.every((item) => item.requiresConfirmation === true));
  assert.ok(report.optimizationAdvice.opportunities.every((item) => item.difference?.length > 0));
  const comparedAreas = [...report.optimizationAdvice.alignedAreas, ...report.optimizationAdvice.opportunities]
    .map((item) => item.area)
    .sort();
  assert.deepEqual(comparedAreas, [
    "accessibility",
    "components",
    "governance",
    "interaction-states",
    "spacing-radius",
    "themes",
    "tokens",
    "typography",
  ]);
  for (const opportunity of report.optimizationAdvice.opportunities) {
    assert.ok(Array.isArray(opportunity.evidence));
    assert.ok(opportunity.evidence.length > 0);
    assert.ok(opportunity.baselineRule.length > 0);
    assert.ok(opportunity.suggestion.length > 0);
    assert.ok(opportunity.expectedBenefit.length > 0);
  }
  assert.deepEqual(inventory, inventoryBefore);
  assert.deepEqual(aliases, aliasesBefore);
  assert.ok(report.optimizationAdvice.opportunities.some((item) => item.area === "tokens"));
  assert.ok(report.optimizationAdvice.opportunities.some((item) => item.area === "components"));
  assert.equal(report.optimizationAdvice.alignedAreas.some((item) => item.area === "tokens"), false);
  assert.equal(report.optimizationAdvice.alignedAreas.some((item) => item.area === "components"), false);
});

test("inventory digest ignores display names and unordered evidence array order", async () => {
  const { computeInventoryDigest } = await import(pathToFileURL(COMPATIBILITY_PATH));
  const aliases = await readAliases();
  const inventory = buildMatureInventory(aliases);
  const permuted = structuredClone(inventory);
  permuted.project.name = "Display Name From --project-name";
  for (const key of ["frameworks", "buildTools", "sharedComponentDirectories", "existingDesignArtifacts", "components", "themes", "typography", "spacingAndRadius", "reactRuntimeCandidates"]) {
    permuted.detected[key] = [...(permuted.detected[key] ?? [])].reverse();
  }
  permuted.detected.tokens.items.reverse();
  permuted.detected.cssCustomProperties.items.reverse();

  assert.equal(computeInventoryDigest(permuted), computeInventoryDigest(inventory));
  permuted.detected.tokens.items[0].value = "genuine-evidence-change";
  assert.notEqual(computeInventoryDigest(permuted), computeInventoryDigest(inventory));
});

test("partial systems recommend augment and optimization advice cannot mutate the report", async () => {
  const { createDraftAdoptionPlan, evaluateCompatibility } = await import(pathToFileURL(COMPATIBILITY_PATH));
  const aliases = await readAliases();
  const inventory = await collectSystemInventory({
    projectRoot: join(FIXTURES, "existing-partial-react"),
    outputRoot: join(FIXTURES, "existing-partial-react", "design-system"),
  });
  const report = evaluateCompatibility(inventory, aliases);
  const reportBefore = structuredClone(report);

  const plan = createDraftAdoptionPlan(report);

  assert.equal(report.recommendation.strategy, "augment");
  assert.notEqual(report.recommendation.strategy, "migrate");
  assert.equal(plan.status, "draft");
  assert.equal(plan.strategy, null);
  assert.equal(plan.inventoryDigest, report.inventoryDigest);
  assert.ok(plan.tokenMappings.every((item) => item.status === "proposed"));
  assert.ok(plan.componentMappings.every((item) => item.status === "proposed"));
  assert.equal("optimizationAdvice" in plan, false);
  assert.deepEqual(report, reportBefore);
});

test("UI library presence alone does not align interaction states or accessibility", async () => {
  const { evaluateCompatibility } = await import(pathToFileURL(COMPATIBILITY_PATH));
  const aliases = await readAliases();
  const inventory = buildMatureInventory(aliases);
  inventory.detected.componentLibraries = ["Material UI"];

  const report = evaluateCompatibility(inventory, aliases);
  const opportunityAreas = report.optimizationAdvice.opportunities.map((item) => item.area);

  assert.ok(opportunityAreas.includes("interaction-states"));
  assert.ok(opportunityAreas.includes("accessibility"));
  assert.equal(report.optimizationAdvice.alignedAreas.some((item) => item.area === "interaction-states"), false);
  assert.equal(report.optimizationAdvice.alignedAreas.some((item) => item.area === "accessibility"), false);
});

test("complete observed interaction accessibility and governance evidence aligns advice", async (t) => {
  const { evaluateCompatibility } = await import(pathToFileURL(COMPATIBILITY_PATH));
  const projectRoot = await makeInventoryProject(t);
  await mkdir(join(projectRoot, "src/components/ui"), { recursive: true });
  await writeFile(join(projectRoot, "DESIGN.md"), "# Governed existing UI\n", "utf8");
  await writeFile(join(projectRoot, "package.json"), `${JSON.stringify({ dependencies: { react: "19.2.0", "@radix-ui/react-slot": "1.2.0" } })}\n`, "utf8");
  await writeFile(
    join(projectRoot, "src/components/ui/Button.tsx"),
    'import { Slot } from "@radix-ui/react-slot";\nexport const Button = () => <Slot role="button" aria-label="Save" onKeyDown={() => {}} />;\n',
    "utf8",
  );
  await writeFile(
    join(projectRoot, "src/components/ui/button.css"),
    '.button:hover {}\n.button:focus-visible {}\n.button:active {}\n.button:disabled {}\n.button[aria-busy="true"] {}\n',
    "utf8",
  );
  const inventory = await collectSystemInventory({ projectRoot, outputRoot: join(projectRoot, "design-system") });
  const inventoryBefore = structuredClone(inventory);

  const report = evaluateCompatibility(inventory, await readAliases());
  const aligned = report.optimizationAdvice.alignedAreas.map((item) => item.area);

  assert.ok(aligned.includes("interaction-states"));
  assert.ok(aligned.includes("accessibility"));
  assert.ok(aligned.includes("governance"));
  assert.equal(report.governance.directExternalImports, 0);
  assert.deepEqual(inventory, inventoryBefore);
});

test("partial behavior evidence produces precise opportunities", async (t) => {
  const { evaluateCompatibility } = await import(pathToFileURL(COMPATIBILITY_PATH));
  const projectRoot = await makeInventoryProject(t);
  await mkdir(join(projectRoot, "src"), { recursive: true });
  await writeFile(join(projectRoot, "src/Button.css"), ".button:hover {}\n.button:focus-visible {}\n", "utf8");
  await writeFile(join(projectRoot, "src/Button.tsx"), 'export const Button = () => <button aria-label="Save" />;\n', "utf8");
  const inventory = await collectSystemInventory({ projectRoot, outputRoot: join(projectRoot, "design-system") });

  const report = evaluateCompatibility(inventory, await readAliases());
  const interaction = report.optimizationAdvice.opportunities.find((item) => item.area === "interaction-states");
  const accessibility = report.optimizationAdvice.opportunities.find((item) => item.area === "accessibility");

  assert.deepEqual((inventory.detected.interactionStates ?? []).map((item) => item.kind).sort(), ["focus", "hover"]);
  assert.deepEqual((inventory.detected.accessibility ?? []).map((item) => item.kind).sort(), ["focus-visible", "semantic-aria"]);
  assert.match(interaction.difference, /active.*disabled.*loading/i);
  assert.match(accessibility.difference, /keyboard/i);
  assert.equal(interaction.requiresConfirmation, true);
  assert.equal(accessibility.requiresConfirmation, true);
});

test("behavior alignment uses exact evidence kinds rather than serialized keywords", async () => {
  const { evaluateCompatibility } = await import(pathToFileURL(COMPATIBILITY_PATH));
  const aliases = await readAliases();
  const inventory = buildMatureInventory(aliases);
  inventory.detected.interactionStates = [{
    kind: "hover",
    file: "src/focus-active-disabled-loading/Button.tsx",
    line: 4,
    evidence: "hover handler mentions focus active disabled loading",
    status: "observed",
  }];
  inventory.detected.accessibility = [{
    kind: "semantic-aria",
    file: "src/keyboard-focus-visible/AriaButton.tsx",
    line: 8,
    evidence: "aria-label includes keyboard and focus-visible wording",
    status: "observed",
  }];

  const report = evaluateCompatibility(inventory, aliases);
  const interaction = report.optimizationAdvice.opportunities.find((item) => item.area === "interaction-states");
  const accessibility = report.optimizationAdvice.opportunities.find((item) => item.area === "accessibility");

  assert.ok(interaction);
  assert.ok(accessibility);
  assert.match(interaction.difference, /focus.*active.*disabled.*loading/i);
  assert.match(accessibility.difference, /focus-visible.*keyboard/i);
  assert.match(interaction.evidence.join(" "), /active-disabled-loading/);
  assert.match(accessibility.evidence.join(" "), /keyboard-focus-visible/);
  assert.equal(report.optimizationAdvice.alignedAreas.some((item) => item.area === "interaction-states"), false);
  assert.equal(report.optimizationAdvice.alignedAreas.some((item) => item.area === "accessibility"), false);
});

test("governance counts only external UI imports outside shared boundaries", async () => {
  const { evaluateCompatibility } = await import(pathToFileURL(COMPATIBILITY_PATH));
  const aliases = await readAliases();
  const inventory = buildMatureInventory(aliases);
  inventory.detected.sharedComponentDirectories = [{ path: "src/components/ui", sourceFileCount: 1 }];
  inventory.detected.components = [
    { path: "src/components/ui/Button.tsx", exports: ["Button"], externalImports: ["@radix-ui/react-slot"], status: "observed" },
    { path: "src/pages/Dashboard.tsx", exports: ["Dashboard"], externalImports: ["react", "clsx", "@mui/material"], status: "observed" },
  ];

  const report = evaluateCompatibility(inventory, aliases);
  const governance = report.optimizationAdvice.opportunities.find((item) => item.area === "governance");

  assert.equal(report.governance.directExternalImports, 1);
  assert.deepEqual(report.governance.directExternalImportEvidence, [{ path: "src/pages/Dashboard.tsx", package: "@mui/material" }]);
  assert.match(governance.evidence.join(" "), /Dashboard.*@mui\/material/i);
  assert.doesNotMatch(governance.evidence.join(" "), /react|clsx/i);
});

test("declared dark mode remains a gap until dark semantic coverage is complete", async () => {
  const { evaluateCompatibility } = await import(pathToFileURL(COMPATIBILITY_PATH));
  const aliases = await readAliases();
  const inventory = buildMatureInventory(aliases);
  inventory.detected.themeDeclarations = [{ selector: ".dark", theme: "dark", mode: "dark", evidence: "tailwind.config.js darkMode=class" }];
  inventory.detected.themeUsage = [{ file: "src/App.tsx", evidence: "data-theme=dark" }];
  inventory.detected.themeConfig = [{ file: "tailwind.config.js", evidence: "darkMode=class" }];
  inventory.detected.tokens.items.push({
    ...inventory.detected.tokens.items[0],
    selector: '.dark',
    theme: "dark",
    line: 80,
  });
  inventory.detected.tokens.count = inventory.detected.tokens.items.length;
  inventory.detected.themes.push({ selector: ".dark", theme: "dark", file: "src/theme.css", line: 79, status: "observed" });

  const report = evaluateCompatibility(inventory, aliases);
  const themeAdvice = report.optimizationAdvice.opportunities.find((item) => item.area === "themes");

  assert.equal(report.themeCoverage.darkModeDeclared, true);
  assert.equal(report.themeCoverage.dark, true);
  assert.ok(report.themeCoverage.darkCovered < report.themeCoverage.darkRequired);
  assert.ok(report.themeCoverage.declarationEvidence.length > 0);
  assert.ok(report.themeCoverage.usageEvidence.length > 0);
  assert.ok(report.themeCoverage.configEvidence.length > 0);
  assert.equal(report.recommendation.strategy, "augment");
  assert.match(themeAdvice.difference, /dark|缺|missing/i);
});

test("common shadcn Radix and MUI custom properties remain proposed candidates", async () => {
  const { evaluateCompatibility } = await import(pathToFileURL(COMPATIBILITY_PATH));
  const aliases = await readAliases();
  const names = [
    "--primary",
    "--foreground",
    "--primary-foreground",
    "--mui-palette-primary-main",
    "--mui-palette-background-default",
    "--mui-palette-text-primary",
    "--accent-9",
    "--gray-12",
    "--color-background",
  ];
  for (const [index, name] of names.entries()) {
    const token = {
      name,
      value: index === 0 ? "240 5.9% 10%" : `fixture-${index}`,
      selector: ":root",
      file: "src/common-theme.css",
      line: 1,
      usageCount: 1,
      status: "observed",
    };
    const inventory = {
      schemaVersion: 2,
      generatedAt: "2026-07-27T00:00:00.000Z",
      project: { name: "common-aliases", root: ".", output: "design-system" },
      detected: {
        frameworks: ["React"], componentLibraries: ["Material UI"], existingDesignArtifacts: [],
        tokens: { count: 1, items: [token] }, components: [], themes: [{ selector: ":root", file: token.file, line: 1, status: "observed" }],
        typography: [], spacingAndRadius: [],
      },
      evidenceLimitReached: false,
      warnings: [],
    };

    const report = evaluateCompatibility(inventory, aliases);
    const candidate = report.tokenCandidates.find((item) => item.sourceToken === name);
    assert.ok(candidate, `${name} should be recognized`);
    assert.equal(candidate.status, "proposed");
  }
});

test("dark-only evidence cannot satisfy preserve theme parity", async () => {
  const { evaluateCompatibility } = await import(pathToFileURL(COMPATIBILITY_PATH));
  const aliases = await readAliases();
  const inventory = buildMatureInventory(aliases);
  inventory.detected.themes = [
    { selector: '[data-theme="dark"]', theme: "dark", file: "src/theme.css", line: 1, status: "observed" },
  ];
  for (const token of inventory.detected.tokens.items) {
    token.selector = '[data-theme="dark"]';
    token.theme = "dark";
  }

  const report = evaluateCompatibility(inventory, aliases);

  assert.equal(report.themeCoverage.light, false);
  assert.equal(report.themeCoverage.dark, true);
  assert.equal(report.recommendation.strategy, "augment");
});

test("extract creates only intake and adoption files", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-mature-react");
  const sourceBefore = await readFile(join(projectRoot, "src/theme.css"), "utf8");

  const result = runCli(projectRoot, ["extract"]);

  assert.deepEqual(result.created.sort(), [
    ".design-consultant-lock.json",
    "adoption/adoption-plan.json",
    "adoption/adoption-plan.schema.json",
    "adoption/compatibility-report.json",
    "intake/extraction-report.json",
  ]);
  assert.deepEqual(await outputFiles(projectRoot), result.created.sort());
  assert.equal(await exists(join(projectRoot, "design-system/tokens/tokens.json")), false);
  assert.equal(await exists(join(projectRoot, "design-system/runtime/react/src/Button.tsx")), false);
  assert.equal(await exists(join(projectRoot, "design-system/DESIGN.md")), false);
  assert.equal(await readFile(join(projectRoot, "src/theme.css"), "utf8"), sourceBefore);
});

test("extract digest is deterministic and the adoption plan is create-only", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-mature-react");
  runCli(projectRoot, ["extract"]);
  const outputRoot = join(projectRoot, "design-system");
  const extractionPath = join(outputRoot, "intake/extraction-report.json");
  const compatibilityPath = join(outputRoot, "adoption/compatibility-report.json");
  const planPath = join(outputRoot, "adoption/adoption-plan.json");
  const firstExtraction = JSON.parse(await readFile(extractionPath, "utf8"));
  const firstCompatibility = JSON.parse(await readFile(compatibilityPath, "utf8"));
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  plan.decisions.push("Keep this user decision");
  const userPlan = `${JSON.stringify(plan, null, 2)}\n`;
  await writeFile(planPath, userPlan, "utf8");

  runCli(projectRoot, ["extract"]);

  const secondExtraction = JSON.parse(await readFile(extractionPath, "utf8"));
  const secondCompatibility = JSON.parse(await readFile(compatibilityPath, "utf8"));
  assert.equal(firstExtraction.inventoryDigest, secondExtraction.inventoryDigest);
  assert.equal(firstCompatibility.inventoryDigest, secondCompatibility.inventoryDigest);
  assert.equal(secondExtraction.inventoryDigest, secondCompatibility.inventoryDigest);
  assert.equal(plan.inventoryDigest, secondExtraction.inventoryDigest);
  assert.equal(await readFile(planPath, "utf8"), userPlan);
});

test("custom project name metadata does not stale a confirmed adoption", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-mature-react");
  runCli(projectRoot, ["extract", "--project-name", "Harbor Display Name"]);
  await confirmPlan(projectRoot);

  const result = runCli(projectRoot, ["adopt"]);

  assert.equal(result.strategy, "preserve");
  assert.deepEqual(await outputFiles(projectRoot), CONFIRMED_ADOPTION_OUTPUT_FILES);
});

test("existing system config display name does not stale a confirmed adoption", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-mature-react");
  const outputRoot = join(projectRoot, "design-system");
  await mkdir(outputRoot, { recursive: true });
  await writeFile(
    join(outputRoot, "system.config.json"),
    `${JSON.stringify({ mode: "default", project: { name: "Configured Display Name" } }, null, 2)}\n`,
    "utf8",
  );
  runCli(projectRoot, ["extract"]);
  await confirmPlan(projectRoot);

  const result = runCli(projectRoot, ["adopt"]);

  assert.equal(result.strategy, "preserve");
  assert.equal(await exists(join(outputRoot, "DESIGN.md")), false);
});

test("extract dry-run leaves the project filesystem unchanged", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-partial-react");
  const result = runCli(projectRoot, ["extract", "--dry-run"]);

  assert.equal(result.dryRun, true);
  assert.equal(result.created.length, 5);
  assert.equal(await exists(join(projectRoot, "design-system")), false);
});

test("adopt rejects draft plans without writing", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-mature-react");
  runCli(projectRoot, ["extract"]);
  const outputRoot = join(projectRoot, "design-system");
  const lockBefore = await readFile(join(outputRoot, ".design-consultant-lock.json"), "utf8");

  const result = runCliProcess(projectRoot, ["adopt"]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /status.*confirmed/i);
  assert.equal(result.stdout, "");
  assert.equal(await exists(join(outputRoot, "DESIGN.md")), false);
  assert.equal(await readFile(join(outputRoot, ".design-consultant-lock.json"), "utf8"), lockBefore);
});

test("adopt rejects an invalid schema before calculating actions", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-mature-react");
  runCli(projectRoot, ["extract"]);
  await confirmPlan(projectRoot, (plan) => { plan.unexpectedRootProperty = true; });

  const result = runCliProcess(projectRoot, ["adopt"]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /schema|模式校验/i);
  assert.equal(result.stdout, "");
  assert.equal(await exists(join(projectRoot, "design-system/DESIGN.md")), false);
});

test("adopt rejects reserved or colliding legacy baseline destinations with zero writes", async (t) => {
  for (const path of ["migration/plan.md", ".design-consultant-lock.json", "checks/check-ui-contract.mjs", "checks/check-ui-contract.json"]) {
    const projectRoot = await copyFixtureProject(t, "existing-mature-react");
    runCli(projectRoot, ["extract"]);
    await confirmPlan(projectRoot, (plan) => {
      confirmTokenMapping(plan);
      plan.legacyBaseline.path = path;
    });
    const before = await snapshotOutput(projectRoot);

    const result = runCliProcess(projectRoot, ["adopt"]);

    assert.equal(result.status, 2, `${path}: ${result.stderr || result.stdout}`);
    assert.match(result.stderr, /schema|baseline|destination|reserved|checks/i);
    assert.equal(result.stdout, "");
    assert.deepEqual(await snapshotOutput(projectRoot), before, path);
  }
});

test("adopt rejects a stale confirmed plan without writing", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-mature-react");
  runCli(projectRoot, ["extract"]);
  await confirmPlan(projectRoot, (plan) => { plan.inventoryDigest = "sha256:stale"; });

  const result = runCliProcess(projectRoot, ["adopt"]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /digest|过期|stale/i);
  assert.equal(result.stdout, "");
  assert.equal(await exists(join(projectRoot, "design-system/DESIGN.md")), false);
});

test("adopt rejects live source changes even when stored artifacts still agree", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-mature-react");
  runCli(projectRoot, ["extract"]);
  await confirmPlan(projectRoot);
  await writeFile(
    join(projectRoot, "src/theme.css"),
    `${await readFile(join(projectRoot, "src/theme.css"), "utf8")}\n:root { --source-changed-after-confirmation: 1; }\n`,
    "utf8",
  );

  const result = runCliProcess(projectRoot, ["adopt"]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /live|current|source|当前|重新 extract/i);
  assert.equal(result.stdout, "");
  assert.equal(await exists(join(projectRoot, "design-system/DESIGN.md")), false);
});

test("adopt rejects consistently forged artifacts that do not match live source", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-mature-react");
  runCli(projectRoot, ["extract"]);
  await forgeAdoptionArtifacts(projectRoot, (inventory) => {
    inventory.detected.tokens.items = [];
    inventory.detected.tokens.count = 0;
    inventory.detected.cssCustomProperties = { count: 0, items: [] };
    inventory.detected.themes = [];
  });

  const result = runCliProcess(projectRoot, ["adopt"]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /live|current|source|当前|重新 extract/i);
  assert.equal(result.stdout, "");
  assert.equal(await exists(join(projectRoot, "design-system/DESIGN.md")), false);
});

test("adopt rejects extraction evidence changed without a new digest", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-mature-react");
  runCli(projectRoot, ["extract"]);
  await confirmPlan(projectRoot);
  const extractionPath = join(projectRoot, "design-system/intake/extraction-report.json");
  const extraction = JSON.parse(await readFile(extractionPath, "utf8"));
  extraction.warnings.push("tampered after extraction");
  await writeFile(extractionPath, `${JSON.stringify(extraction, null, 2)}\n`, "utf8");

  const result = runCliProcess(projectRoot, ["adopt"]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /digest|evidence|证据/i);
  assert.equal(result.stdout, "");
  assert.equal(await exists(join(projectRoot, "design-system/DESIGN.md")), false);
});

test("adopt rejects a compatibility report that no longer matches extraction", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-mature-react");
  runCli(projectRoot, ["extract"]);
  await confirmPlan(projectRoot);
  const compatibilityPath = join(projectRoot, "design-system/adoption/compatibility-report.json");
  const compatibility = JSON.parse(await readFile(compatibilityPath, "utf8"));
  compatibility.recommendation.strategy = "preserve";
  compatibility.recommendation.reasons = ["manually replaced"];
  await writeFile(compatibilityPath, `${JSON.stringify(compatibility, null, 2)}\n`, "utf8");

  const result = runCliProcess(projectRoot, ["adopt"]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /compatibility|重新 extract/i);
  assert.equal(result.stdout, "");
  assert.equal(await exists(join(projectRoot, "design-system/DESIGN.md")), false);
});

test("adopt rejects unresolved proposed mappings without writing", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-mature-react");
  runCli(projectRoot, ["extract"]);
  const planPath = join(projectRoot, "design-system/adoption/adoption-plan.json");
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  plan.status = "confirmed";
  plan.strategy = "preserve";
  await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");

  const result = runCliProcess(projectRoot, ["adopt"]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /mapping|映射|proposed/i);
  assert.equal(result.stdout, "");
  assert.equal(await exists(join(projectRoot, "design-system/DESIGN.md")), false);
});

test("adopt rejects unsupported React adapter strategies without writing", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-mature-react");
  runCli(projectRoot, ["extract"]);
  await confirmPlan(projectRoot, (plan) => {
    plan.componentMappings.push({
      component: "button",
      source: { path: "src/ui/PrimaryButton.tsx", exportName: "PrimaryButton" },
      support: "wrapper",
      adapterStrategy: "generate-react-wrapper",
      status: "confirmed",
    });
  });

  const result = runCliProcess(projectRoot, ["adopt"]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /Task 5|adapter|适配/i);
  assert.equal(result.stdout, "");
  assert.equal(await exists(join(projectRoot, "design-system/DESIGN.md")), false);
});

test("adopt rejects Task 5 adapter and manual-runtime intent for Vue and Svelte", async (t) => {
  for (const framework of ["vue", "svelte"]) {
    const projectRoot = await makeInventoryProject(t);
    await writeFile(join(projectRoot, "package.json"), JSON.stringify({ dependencies: { [framework]: "1.0.0" } }), "utf8");
    await mkdir(join(projectRoot, "src/components"), { recursive: true });
    await writeFile(
      join(projectRoot, `src/components/Button.${framework}`),
      "<script>export const Button = {};</script>\n<button type=\"button\">Save</button>\n",
      "utf8",
    );
    runCli(projectRoot, ["extract"]);
    await confirmPlan(projectRoot, (plan) => {
      const mapping = plan.componentMappings.find((item) => item.component === "button");
      if (framework === "vue") {
        mapping.status = "confirmed";
        mapping.adapterStrategy = "generate-vue-wrapper";
      } else {
        mapping.status = "manual";
        mapping.runtimeStrategy = "manual-runtime";
      }
    });

    const result = runCliProcess(projectRoot, ["adopt"]);

    assert.equal(result.status, 2, `${framework}: ${result.stdout || result.stderr}`);
    assert.match(result.stderr, /Task 5|adapter|runtime|适配/i, framework);
    assert.equal(result.stdout, "", framework);
    assert.equal(await exists(join(projectRoot, "design-system/DESIGN.md")), false, framework);
  }
});

test("adopt rejects unknown and deferred token mapping intent", async (t) => {
  for (const mutate of [
    (mapping) => { mapping.generate = false; },
    (mapping) => { mapping.bridgeStrategy = "confirmed-token-bridge"; },
    (mapping) => { mapping.source.adapterPath = "generated/tokens.ts"; },
  ]) {
    const projectRoot = await copyFixtureProject(t, "existing-non-react");
    await writeFile(join(projectRoot, "src/styles.css"), ':root { --primary: #2457d6; }\n', "utf8");
    runCli(projectRoot, ["extract"]);
    await confirmPlan(projectRoot, (plan) => mutate(plan.tokenMappings[0]));
    const before = await snapshotOutput(projectRoot);

    const result = runCliProcess(projectRoot, ["adopt"]);

    assert.equal(result.status, 2, result.stderr || result.stdout);
    assert.match(result.stderr, /Task 4|token|mapping|field|字段|bridge|generate/i);
    assert.equal(result.stdout, "");
    assert.deepEqual(await snapshotOutput(projectRoot), before);
  }
});

test("adopt rejects unknown and deferred component mapping intent for non-React systems", async (t) => {
  for (const mutate of [
    (mapping) => { mapping.adapterPath = "generated/Button.vue"; },
    (mapping) => { mapping.adapterCode = "export default {}"; },
    (mapping) => { mapping.runtimeStrategy = "manual-runtime"; },
  ]) {
    const projectRoot = await copyFixtureProject(t, "existing-non-react");
    await mkdir(join(projectRoot, "src/components"), { recursive: true });
    await writeFile(join(projectRoot, "src/components/Button.vue"), '<script>export const Button = {};</script>\n<button type="button">Save</button>\n', "utf8");
    runCli(projectRoot, ["extract"]);
    await confirmPlan(projectRoot, (plan) => mutate(plan.componentMappings[0]));
    const before = await snapshotOutput(projectRoot);

    const result = runCliProcess(projectRoot, ["adopt"]);

    assert.equal(result.status, 2, result.stderr || result.stdout);
    assert.match(result.stderr, /Task 5|component|mapping|field|字段|adapter|runtime/i);
    assert.equal(result.stdout, "");
    assert.deepEqual(await snapshotOutput(projectRoot), before);
  }
});

test("adopt rejects mappings not backed by the latest compatibility evidence", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-mature-react");
  runCli(projectRoot, ["extract"]);
  await confirmPlan(projectRoot, (plan) => {
    plan.tokenMappings.push({
      semanticToken: "color.primary",
      source: { name: "--invented-token" },
      match: "candidate",
      status: "confirmed",
    });
  });

  const result = runCliProcess(projectRoot, ["adopt"]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /mapping|evidence|证据/i);
  assert.equal(result.stdout, "");
  assert.equal(await exists(join(projectRoot, "design-system/DESIGN.md")), false);
});

test("adopt rejects confirmed plans that omit compatibility candidates", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-mature-react");
  runCli(projectRoot, ["extract"]);
  await confirmPlan(projectRoot, (plan) => {
    plan.tokenMappings = [];
    plan.componentMappings = [];
  });

  const result = runCliProcess(projectRoot, ["adopt"]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /mapping|candidate|映射|候选/i);
  assert.equal(result.stdout, "");
  assert.equal(await exists(join(projectRoot, "design-system/DESIGN.md")), false);
});

test("manual token mappings block manual-only and mixed adopt plans without filesystem changes", async (t) => {
  for (const mixed of [false, true]) {
    const projectRoot = await copyFixtureProject(t, "existing-mature-react");
    runCli(projectRoot, ["extract"]);
    await confirmPlan(projectRoot, (plan) => {
      if (mixed) confirmTokenMapping(plan);
      const manual = plan.tokenMappings.find((item) => item.status === "rejected");
      manual.status = "manual";
    });
    const before = await snapshotOutput(projectRoot);

    const result = runCliProcess(projectRoot, ["adopt"]);

    assert.equal(result.status, 2, result.stderr || result.stdout);
    assert.match(result.stderr, /token mappings must be confirmed or rejected/i);
    assert.doesNotMatch(result.stderr, /标记 manual|manual (?:is )?acceptable/i);
    assert.equal(result.stdout, "");
    assert.deepEqual(await snapshotOutput(projectRoot), before);
  }
});

test("manual token mappings block adoption update and checker without artifact changes", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-mature-react");
  runCli(projectRoot, ["extract"]);
  await confirmPlan(projectRoot, (plan) => confirmTokenMapping(plan));
  runCli(projectRoot, ["adopt"]);
  const outputRoot = join(projectRoot, "design-system");
  const planPath = join(outputRoot, "adoption/adoption-plan.json");
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  plan.tokenMappings.find((item) => item.status === "rejected").status = "manual";
  await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  const before = await snapshotOutput(projectRoot);

  const update = runCliProcess(projectRoot, ["update"]);
  assert.equal(update.status, 2, update.stderr || update.stdout);
  assert.deepEqual(await snapshotOutput(projectRoot), before);

  const validation = await validateAdoptionContract(outputRoot);
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((item) => item.rule === "unconfirmed-token-mapping"), JSON.stringify(validation.issues));
  assert.deepEqual(await snapshotOutput(projectRoot), before);
});

test("confirmed adopt generates only the reference token bridge and adoption-safe checks", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-mature-react");
  runCli(projectRoot, ["extract"]);
  await confirmPlan(projectRoot, (plan) => confirmTokenMapping(plan));

  const result = runCli(projectRoot, ["adopt"]);
  const outputRoot = join(projectRoot, "design-system");
  const config = JSON.parse(await readFile(join(outputRoot, "system.config.json"), "utf8"));
  const map = JSON.parse(await readFile(join(outputRoot, "tokens/external-map.json"), "utf8"));
  const css = await readFile(join(outputRoot, "tokens/external-bridge.css"), "utf8");

  assert.equal(result.strategy, "preserve");
  assert.deepEqual(await outputFiles(projectRoot), [
    ...CONFIRMED_ADOPTION_OUTPUT_FILES,
    "checks/adoption/compatibility.mjs",
    "checks/adoption/inventory.mjs",
    "checks/adoption/plan-contract.mjs",
    "checks/adoption/token-contract.mjs",
    "checks/adoption/token-bridge.mjs",
    "checks/adoption/visual-route-contract.mjs",
    "checks/check-adoption-contract.mjs",
    "checks/check-ui-contract.mjs",
    "checks/sync-tokens.mjs",
    "package.json",
    "system.config.json",
    "tokens/external-bridge.css",
    "tokens/external-map.json",
  ].sort());
  assert.equal(config.integration.adoptionStrategy, "preserve");
  assert.equal(config.integration.tokenOwnership, "existing");
  assert.equal(config.integration.tokenBridge, "tokens/external-map.json");
  assert.equal(config.integration.componentAdapterMap, null);
  assert.equal(config.integration.legacyBaseline, "checks/ui-contract-baseline.json");
  assert.equal(config.sourceOfTruth.tokens, "tokens/external-map.json");
  assert.equal(config.sourceOfTruth.runtimeTokens, "tokens/external-bridge.css");
  assert.equal(map.mappings[0].canonicalToken, "semantic.color.primary");
  assert.match(css, /--primary: var\(--brand-primary\);/);
  for (const path of ["tokens/tokens.json", "DESIGN.md", "catalog/component-library.html", "components/manifest.json", "runtime/react/src/index.ts"]) {
    assert.equal(await exists(join(outputRoot, path)), false, path);
  }

  const contract = await validateAdoptionContract(outputRoot);
  assert.equal(contract.ok, true, JSON.stringify(contract.issues));
  const cli = spawnSync(process.execPath, [ADOPTION_CHECK_PATH, "--root", outputRoot], { encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr || cli.stdout);
  assert.equal(JSON.parse(cli.stdout).ok, true);
  const install = process.platform === "win32"
    ? spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "npm install --ignore-scripts --no-audit --no-fund --no-package-lock"], { cwd: outputRoot, encoding: "utf8", timeout: 150000 })
    : spawnSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--no-package-lock"], { cwd: outputRoot, encoding: "utf8", timeout: 150000 });
  assert.equal(install.status, 0, install.stderr || install.stdout);
  const sync = spawnSync(process.execPath, [join(outputRoot, "checks/sync-tokens.mjs"), "check", "--root", outputRoot], { encoding: "utf8" });
  assert.equal(sync.status, 0, sync.stderr || sync.stdout);
  assert.equal(JSON.parse(sync.stdout).layout, "adoption-token-bridge");
});

test("adoption token ownership stays existing for augment and mixed for migrate", async (t) => {
  for (const [strategy, tokenOwnership] of [["augment", "existing"], ["migrate", "mixed"]]) {
    const projectRoot = await copyFixtureProject(t, "existing-mature-react");
    runCli(projectRoot, ["extract"]);
    await confirmPlan(projectRoot, (plan) => {
      plan.strategy = strategy;
      confirmTokenMapping(plan);
    });

    runCli(projectRoot, ["adopt"]);
    const config = JSON.parse(await readFile(join(projectRoot, "design-system/system.config.json"), "utf8"));
    assert.equal(config.integration.adoptionStrategy, strategy);
    assert.equal(config.integration.tokenOwnership, tokenOwnership);
    assert.equal(config.integration.componentAdapterMap, null);
  }
});

test("adoption contract resolves source evidence from a nested custom output", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-mature-react");
  const output = "tools/design-system";
  runCli(projectRoot, ["extract", "--output", output]);
  await confirmPlan(projectRoot, (plan) => confirmTokenMapping(plan), output);
  runCli(projectRoot, ["adopt", "--output", output]);

  const validation = await validateAdoptionContract(join(projectRoot, output));

  assert.equal(validation.ok, true, JSON.stringify(validation.issues));
});

test("failed token bridge validation and adopt dry-run write nothing", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-mature-react");
  runCli(projectRoot, ["extract"]);
  await confirmPlan(projectRoot, (plan) => {
    const mapping = confirmTokenMapping(plan);
    mapping.theme = "dark";
    mapping.selector = '[data-theme="dark"]';
    mapping.source.selector = '[data-theme="dark"]';
  });
  const before = await snapshotOutput(projectRoot);

  const invalid = runCliProcess(projectRoot, ["adopt"]);
  assert.equal(invalid.status, 2, invalid.stderr || invalid.stdout);
  assert.match(invalid.stderr, /fallback|conditional|token bridge/i);
  assert.deepEqual(await snapshotOutput(projectRoot), before);

  const planPath = join(projectRoot, "design-system/adoption/adoption-plan.json");
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  const mapping = plan.tokenMappings.find((item) => item.status === "confirmed");
  mapping.theme = "light";
  mapping.selector = ":root";
  mapping.source.selector = ":root";
  await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  const validBefore = await snapshotOutput(projectRoot);
  const dryRun = runCli(projectRoot, ["adopt", "--dry-run"]);

  assert.equal(dryRun.dryRun, true);
  assert.ok(dryRun.created.includes("tokens/external-map.json"));
  assert.ok(dryRun.created.includes("tokens/external-bridge.css"));
  assert.deepEqual(await snapshotOutput(projectRoot), validBefore);
});

test("adopt rejects malicious CSS and preserve non-variable sources or fallbacks without writes", async (t) => {
  const cases = [
    { strategy: "augment", position: "source", kind: "literal", value: "red; } body { color: black" },
    { strategy: "augment", position: "source", kind: "design-consultant", value: "url(javascript:alert(1))" },
    { strategy: "preserve", position: "source", kind: "literal", value: "#0f6cdd" },
    { strategy: "preserve", position: "source", kind: "design-consultant", value: "#0f6cdd" },
    { strategy: "preserve", position: "fallback", kind: "literal", value: "#0f6cdd" },
    { strategy: "preserve", position: "fallback", kind: "design-consultant", value: "#0f6cdd" },
    { strategy: "augment", position: "fallback", kind: "literal", value: "/* injected */ #fff" },
  ];
  for (const item of cases) {
    const projectRoot = await copyFixtureProject(t, "existing-mature-react");
    if (item.position === "fallback") {
      const themePath = join(projectRoot, "src/theme.css");
      const theme = await readFile(themePath, "utf8");
      await writeFile(themePath, theme.replace('[data-theme="dark"] {', '[data-theme="dark"] {\n  --brand-primary: #8bc4dc;'), "utf8");
    }
    runCli(projectRoot, ["extract"]);
    const extraction = JSON.parse(await readFile(join(projectRoot, "design-system/intake/extraction-report.json"), "utf8"));
    await confirmPlan(projectRoot, (plan) => {
      plan.strategy = item.strategy;
      const valueSource = item.kind === "literal"
        ? { kind: "literal", value: item.value }
        : { kind: "design-consultant", token: "color.primary", cssVariable: "--primary", value: item.value };
      if (item.position === "source") {
        plan.tokenMappings.push({
          semanticToken: "color.primary",
          canonicalToken: "semantic.color.primary",
          canonicalCssVariable: "--primary",
          source: valueSource,
          match: "candidate",
          theme: "light",
          selector: ":root",
          status: "confirmed",
          evidence: [item.kind === "literal" ? `literal:${item.value}` : "design-consultant:color.primary"],
        });
      } else {
        const mapping = confirmTokenMapping(plan);
        const dark = extraction.detected.tokens.items.find((entry) => entry.name === "--brand-primary" && entry.selector === '[data-theme="dark"]');
        mapping.source = { kind: "css-variable", name: dark.name, file: dark.file, line: dark.line, selector: dark.selector, value: dark.value };
        mapping.selector = dark.selector;
        mapping.theme = "dark";
        mapping.fallback = valueSource;
        mapping.evidence = [`${dark.file}:${dark.line}`, item.kind === "literal" ? `literal:${item.value}` : "design-consultant:color.primary"];
      }
    });
    const before = await snapshotOutput(projectRoot);

    const result = runCliProcess(projectRoot, ["adopt"]);

    assert.equal(result.status, 2, `${item.position}/${item.kind}: ${result.stderr || result.stdout}`);
    assert.match(result.stderr, /unsafe|preserve|token bridge|CSS/i);
    assert.equal(result.stdout, "");
    assert.deepEqual(await snapshotOutput(projectRoot), before);
  }
});

test("adopt rejects canonical and evidence contract violations without writes", async (t) => {
  const mutations = [
    (mapping) => { mapping.canonicalCssVariable = "--brand-action"; },
    (mapping) => { delete mapping.source.file; },
    (mapping) => { delete mapping.source.value; },
    (mapping) => { mapping.evidence = []; },
    (mapping) => { mapping.evidence = [""]; },
    (mapping) => { mapping.evidence = [" "]; },
    (mapping) => { mapping.evidence = [" src/theme.css:2"]; },
    (mapping) => { mapping.evidence = ["src/theme.css:2 "]; },
    (mapping) => { mapping.evidence = ["src/theme.css:\n2"]; },
    (mapping) => { mapping.evidence = ["src/theme.css:2", "src/theme.css:2"]; },
    (mapping) => { mapping.evidence = [7]; },
    (mapping) => { mapping.evidence = [{}]; },
  ];
  for (const mutate of mutations) {
    const projectRoot = await copyFixtureProject(t, "existing-mature-react");
    runCli(projectRoot, ["extract"]);
    await confirmPlan(projectRoot, (plan) => mutate(confirmTokenMapping(plan)));
    const before = await snapshotOutput(projectRoot);

    const result = runCliProcess(projectRoot, ["adopt"]);

    assert.equal(result.status, 2, result.stderr || result.stdout);
    assert.equal(result.stdout, "");
    assert.deepEqual(await snapshotOutput(projectRoot), before);
  }
});

test("adopt rejects a malicious selector observed in live inventory without writes", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-mature-react");
  const themePath = join(projectRoot, "src/theme.css");
  await writeFile(themePath, `${await readFile(themePath, "utf8")}\n.night;body {\n  color-scheme: dark;\n  --brand-primary: #abcdef;\n}\n`, "utf8");
  runCli(projectRoot, ["extract"]);
  const extraction = JSON.parse(await readFile(join(projectRoot, "design-system/intake/extraction-report.json"), "utf8"));
  await confirmPlan(projectRoot, (plan) => {
    const mapping = confirmTokenMapping(plan);
    const unsafe = extraction.detected.tokens.items.find((item) => item.name === "--brand-primary" && item.selector === ".night;body");
    const fallback = extraction.detected.tokens.items.find((item) => item.name === "--brand-primary" && item.selector === ":root");
    assert.ok(unsafe);
    mapping.source = { kind: "css-variable", name: unsafe.name, file: unsafe.file, line: unsafe.line, selector: unsafe.selector, value: unsafe.value };
    mapping.fallback = { kind: "css-variable", name: fallback.name, file: fallback.file, line: fallback.line, selector: fallback.selector, value: fallback.value };
    mapping.selector = unsafe.selector;
    mapping.theme = "dark";
    mapping.evidence = [`${unsafe.file}:${unsafe.line}`, `${fallback.file}:${fallback.line}`];
  });
  const before = await snapshotOutput(projectRoot);

  const result = runCliProcess(projectRoot, ["adopt"]);

  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stderr, /invalid-token-selector|selector/i);
  assert.equal(result.stdout, "");
  assert.deepEqual(await snapshotOutput(projectRoot), before);
});

test("adoption update rejects plan drift and explicit re-adopt regenerates a valid safe literal bridge", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-mature-react");
  runCli(projectRoot, ["extract"]);
  await confirmPlan(projectRoot, (plan) => confirmTokenMapping(plan));
  runCli(projectRoot, ["adopt"]);
  const outputRoot = join(projectRoot, "design-system");
  const planPath = join(outputRoot, "adoption/adoption-plan.json");
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  plan.strategy = "augment";
  plan.tokenMappings.find((item) => item.status === "confirmed").status = "rejected";
  plan.tokenMappings.push({
    semanticToken: "color.primary",
    canonicalToken: "semantic.color.primary",
    canonicalCssVariable: "--primary",
    source: { kind: "literal", value: "#0f6cdd" },
    match: "candidate",
    theme: "light",
    selector: ":root",
    status: "confirmed",
    evidence: ["literal:#0f6cdd"],
  });
  const expectedPlan = `${JSON.stringify(plan, null, 2)}\n`;
  await writeFile(planPath, expectedPlan, "utf8");

  const rejected = runCliProcess(projectRoot, ["update"]);
  assert.equal(rejected.status, 2, rejected.stderr || rejected.stdout);
  assert.match(rejected.stderr, /plan bytes|digest.*drift|lock binding/i);

  const result = runCli(projectRoot, ["adopt"]);

  assert.equal(await readFile(planPath, "utf8"), expectedPlan);
  assert.ok(result.updated.includes("tokens/external-map.json"));
  assert.ok(result.updated.includes("tokens/external-bridge.css"));
  assert.match(await readFile(join(outputRoot, "tokens/external-bridge.css"), "utf8"), /--primary: #0f6cdd;/);
  assert.equal(await exists(join(outputRoot, "tokens/tokens.json")), false);
});

test("adoption contract validator detects source, map, CSS and config drift", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-mature-react");
  runCli(projectRoot, ["extract"]);
  await confirmPlan(projectRoot, (plan) => confirmTokenMapping(plan));
  runCli(projectRoot, ["adopt"]);
  const outputRoot = join(projectRoot, "design-system");

  await writeFile(join(outputRoot, "tokens/external-bridge.css"), ":root { --primary: hotpink; }\n", "utf8");
  let validation = await validateAdoptionContract(outputRoot);
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((issue) => issue.rule === "token-bridge-css-drift"));

  const mapPath = join(outputRoot, "tokens/external-map.json");
  const map = JSON.parse(await readFile(mapPath, "utf8"));
  map.mappings[0].canonicalCssVariable = "--drifted-primary";
  await writeFile(mapPath, `${JSON.stringify(map, null, 2)}\n`, "utf8");
  validation = await validateAdoptionContract(outputRoot);
  assert.ok(validation.issues.some((issue) => issue.rule === "token-bridge-map-drift"));

  const configPath = join(outputRoot, "system.config.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  config.integration.tokenBridge = "tokens/missing-map.json";
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  validation = await validateAdoptionContract(outputRoot);
  assert.ok(validation.issues.some((issue) => issue.rule === "missing-config-path"));

  const sourcePath = join(projectRoot, "src/theme.css");
  const source = await readFile(sourcePath, "utf8");
  await writeFile(sourcePath, source.replace("--brand-primary", "--removed-primary"), "utf8");
  validation = await validateAdoptionContract(outputRoot);
  assert.ok(validation.issues.some((issue) => issue.rule === "missing-source-evidence"));
});

test("adoption checker recollects live inventory and rejects same-line selector or value drift without writes", async (t) => {
  for (const mutate of [
    (source) => source.replace(":root {", '[data-theme="light"] {'),
    (source) => source.replace("--brand-primary: #2457d6", "--brand-primary: #123456"),
  ]) {
    const projectRoot = await copyFixtureProject(t, "existing-mature-react");
    runCli(projectRoot, ["extract"]);
    await confirmPlan(projectRoot, (plan) => confirmTokenMapping(plan));
    runCli(projectRoot, ["adopt"]);
    const outputRoot = join(projectRoot, "design-system");
    const sourcePath = join(projectRoot, "src/theme.css");
    await writeFile(sourcePath, mutate(await readFile(sourcePath, "utf8")), "utf8");
    const before = await snapshotOutput(projectRoot);

    const validation = await validateAdoptionContract(outputRoot);

    assert.equal(validation.ok, false);
    assert.ok(validation.issues.some((item) => ["source-evidence-mismatch", "live-inventory-digest-mismatch"].includes(item.rule)), JSON.stringify(validation.issues));
    assert.deepEqual(await snapshotOutput(projectRoot), before);
  }
});

test("adoption checker directly rejects schema-invalid evidence without writes", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-mature-react");
  runCli(projectRoot, ["extract"]);
  await confirmPlan(projectRoot, (plan) => confirmTokenMapping(plan));
  runCli(projectRoot, ["adopt"]);
  const outputRoot = join(projectRoot, "design-system");
  const planPath = join(outputRoot, "adoption/adoption-plan.json");
  const original = JSON.parse(await readFile(planPath, "utf8"));
  for (const evidence of [null, [], [""], [" "], [" src/theme.css:2"], ["src/theme.css:2 "], ["src/theme.css:\n2"], ["src/theme.css:2", "src/theme.css:2"], [7], [{}]]) {
    const plan = structuredClone(original);
    plan.tokenMappings.find((item) => item.status === "confirmed").evidence = evidence;
    await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
    const before = await snapshotOutput(projectRoot);

    const validation = await validateAdoptionContract(outputRoot);

    assert.equal(validation.ok, false, JSON.stringify(evidence));
    assert.ok(validation.issues.some((item) => item.rule === "invalid-token-evidence"), JSON.stringify(validation.issues));
    assert.deepEqual(await snapshotOutput(projectRoot), before, JSON.stringify(evidence));
  }
});

test("adoption checker rejects every malformed integration field type without fallback", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-mature-react");
  runCli(projectRoot, ["extract"]);
  await confirmPlan(projectRoot, (plan) => confirmTokenMapping(plan));
  runCli(projectRoot, ["adopt"]);
  const outputRoot = join(projectRoot, "design-system");
  const configPath = join(outputRoot, "system.config.json");
  const original = JSON.parse(await readFile(configPath, "utf8"));
  const invalidValues = {
    adoptionStrategy: {},
    tokenOwnership: [],
    tokenBridge: 7,
    componentAdapterMap: {},
    legacyBaseline: 42,
    framework: [],
    runtimeTokenImport: {},
    sharedComponentRoot: 1,
    sharedComponentExport: [],
    iconEntry: {},
  };
  for (const [field, value] of Object.entries(invalidValues)) {
    const config = structuredClone(original);
    config.integration[field] = value;
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    const before = await snapshotOutput(projectRoot);

    const validation = await validateAdoptionContract(outputRoot);

    assert.equal(validation.ok, false, field);
    assert.ok(validation.issues.some((item) => item.rule === "invalid-integration-field-type" && item.field === field), `${field}: ${JSON.stringify(validation.issues)}`);
    assert.deepEqual(await snapshotOutput(projectRoot), before);
  }
});

test("adoption checker requires every Task 4 pointer at its exact owned destination", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-mature-react");
  runCli(projectRoot, ["extract"]);
  await confirmPlan(projectRoot, (plan) => confirmTokenMapping(plan));
  runCli(projectRoot, ["adopt"]);
  const outputRoot = join(projectRoot, "design-system");
  const configPath = join(outputRoot, "system.config.json");
  const original = JSON.parse(await readFile(configPath, "utf8"));
  const expectedPointers = [
    ["sourceOfTruth", "tokens", "tokens/external-map.json"],
    ["sourceOfTruth", "runtimeTokens", "tokens/external-bridge.css"],
    ["integration", "tokenBridge", "tokens/external-map.json"],
    ["integration", "componentAdapterMap", null],
    ["integration", "legacyBaseline", "checks/ui-contract-baseline.json"],
    ["checks", "tokenContract", "checks/sync-tokens.mjs"],
    ["checks", "adoptionContract", "checks/check-adoption-contract.mjs"],
  ];
  const cases = [];
  for (const [section, field, expected] of expectedPointers) {
    cases.push({ name: `${section}.${field} deleted`, section, field, mutate: (config) => { delete config[section][field]; } });
    cases.push({ name: `${section}.${field} malformed`, section, field, mutate: (config) => { config[section][field] = {}; } });
    cases.push({ name: `${section}.${field} wrong existing path`, section, field, mutate: (config) => { config[section][field] = "adoption/adoption-plan.json"; } });
    if (expected !== null) cases.push({ name: `${section}.${field} null`, section, field, mutate: (config) => { config[section][field] = null; } });
  }

  for (const item of cases) {
    const config = structuredClone(original);
    item.mutate(config);
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    const before = await snapshotOutput(projectRoot);

    const validation = await validateAdoptionContract(outputRoot);

    assert.equal(validation.ok, false, item.name);
    assert.ok(
      validation.issues.some((entry) => ["missing-config-pointer", "config-pointer-contract-mismatch"].includes(entry.rule) && entry.field === `${item.section}.${item.field}`),
      `${item.name}: ${JSON.stringify(validation.issues)}`,
    );
    assert.deepEqual(await snapshotOutput(projectRoot), before, item.name);
  }
});

test("adoption checker requires every non-null Task 4 pointer destination to be a file", async (t) => {
  const pointers = [
    ["sourceOfTruth.tokens", "tokens/external-map.json"],
    ["sourceOfTruth.runtimeTokens", "tokens/external-bridge.css"],
    ["integration.tokenBridge", "tokens/external-map.json"],
    ["checks.tokenContract", "checks/sync-tokens.mjs"],
    ["checks.adoptionContract", "checks/check-adoption-contract.mjs"],
  ];

  for (const [field, destination] of pointers) {
    const projectRoot = await copyFixtureProject(t, "existing-mature-react");
    runCli(projectRoot, ["extract"]);
    await confirmPlan(projectRoot, (plan) => confirmTokenMapping(plan));
    runCli(projectRoot, ["adopt"]);
    const outputRoot = join(projectRoot, "design-system");
    const destinationPath = join(outputRoot, destination);
    await rm(destinationPath, { force: true });
    await mkdir(destinationPath, { recursive: true });
    await writeFile(join(destinationPath, "sentinel.txt"), "unchanged\n", "utf8");
    const before = await snapshotOutput(projectRoot);

    const validation = await validateAdoptionContract(outputRoot);

    assert.equal(validation.ok, false, field);
    assert.ok(
      validation.issues.some((item) => item.rule === "config-path-not-file" && item.field === field),
      `${field}: ${JSON.stringify(validation.issues)}`,
    );
    assert.equal((await lstat(destinationPath)).isDirectory(), true, field);
    assert.deepEqual(await snapshotOutput(projectRoot), before, field);
  }
});

test("sync-tokens dispatches every adoption marker workspace without native writes", async (t) => {
  const mutations = [
    { name: "missing strategy", mutate: async (configPath) => {
      const config = JSON.parse(await readFile(configPath, "utf8"));
      delete config.integration.adoptionStrategy;
      await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    } },
    { name: "null strategy", mutate: async (configPath) => {
      const config = JSON.parse(await readFile(configPath, "utf8"));
      config.integration.adoptionStrategy = null;
      await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    } },
    { name: "object strategy", mutate: async (configPath) => {
      const config = JSON.parse(await readFile(configPath, "utf8"));
      config.integration.adoptionStrategy = {};
      await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    } },
    { name: "corrupt config", mutate: async (configPath) => writeFile(configPath, "{not-json\n", "utf8") },
    { name: "missing config", mutate: async (configPath) => rm(configPath) },
  ];
  for (const item of mutations) {
    const projectRoot = await copyFixtureProject(t, "existing-mature-react");
    runCli(projectRoot, ["extract"]);
    await confirmPlan(projectRoot, (plan) => confirmTokenMapping(plan));
    runCli(projectRoot, ["adopt"]);
    const outputRoot = join(projectRoot, "design-system");
    const configPath = join(outputRoot, "system.config.json");
    await item.mutate(configPath);
    await writeFile(join(outputRoot, "tokens/tokens.json"), "NATIVE_SENTINEL\n", "utf8");
    const before = await snapshotOutput(projectRoot);

    const sync = spawnSync(process.execPath, [join(outputRoot, "checks/sync-tokens.mjs"), "build", "--root", outputRoot], { encoding: "utf8" });
    const payload = JSON.parse(sync.stdout);

    assert.notEqual(sync.status, 0, item.name);
    assert.equal(payload.layout, "adoption-token-bridge", `${item.name}: ${sync.stdout || sync.stderr}`);
    assert.deepEqual(await snapshotOutput(projectRoot), before, item.name);
  }
});

test("sync-tokens routes retained v0.9 native tokens through adoption validation", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-mature-react");
  runCli(projectRoot, ["init"]);
  runCli(projectRoot, ["extract"]);
  const outputRoot = join(projectRoot, "design-system");
  const before = await snapshotOutput(projectRoot);

  const sync = spawnSync(process.execPath, [join(outputRoot, "checks/sync-tokens.mjs"), "build", "--root", outputRoot], { encoding: "utf8" });
  const payload = JSON.parse(sync.stdout);

  assert.notEqual(sync.status, 0);
  assert.equal(payload.layout, "adoption-token-bridge", sync.stdout || sync.stderr);
  assert.deepEqual(await snapshotOutput(projectRoot), before);
});

test("sync-tokens treats empty or removed primary markers with any retained adoption footprint as adoption", async (t) => {
  const mutations = [
    { name: "empty primary markers", mutate: async (root) => {
      for (const path of ["adoption/adoption-plan.json", "adoption/compatibility-report.json", "intake/extraction-report.json"]) {
        await writeFile(join(root, path), "", "utf8");
      }
    } },
    { name: "empty adoption directories", mutate: async (root) => {
      await rm(join(root, "adoption"), { recursive: true, force: true });
      await rm(join(root, "intake"), { recursive: true, force: true });
      await mkdir(join(root, "adoption"), { recursive: true });
      await mkdir(join(root, "intake"), { recursive: true });
    } },
    { name: "retained bridge artifacts", mutate: async (root) => {
      await rm(join(root, "adoption"), { recursive: true, force: true });
      await rm(join(root, "intake"), { recursive: true, force: true });
      await rm(join(root, "checks/adoption"), { recursive: true, force: true });
      await rm(join(root, "checks/check-adoption-contract.mjs"), { force: true });
    } },
    { name: "retained checker dependencies", mutate: async (root) => {
      await rm(join(root, "adoption"), { recursive: true, force: true });
      await rm(join(root, "intake"), { recursive: true, force: true });
      await rm(join(root, "tokens/external-map.json"), { force: true });
      await rm(join(root, "tokens/external-bridge.css"), { force: true });
    } },
    { name: "retained adoption config", mutate: async (root) => {
      await rm(join(root, "adoption"), { recursive: true, force: true });
      await rm(join(root, "intake"), { recursive: true, force: true });
      await rm(join(root, "tokens/external-map.json"), { force: true });
      await rm(join(root, "tokens/external-bridge.css"), { force: true });
      await rm(join(root, "checks/adoption"), { recursive: true, force: true });
      await rm(join(root, "checks/check-adoption-contract.mjs"), { force: true });
    } },
  ];

  for (const item of mutations) {
    for (const command of ["build", "check"]) {
      const projectRoot = await copyFixtureProject(t, "existing-mature-react");
      runCli(projectRoot, ["extract"]);
      await confirmPlan(projectRoot, (plan) => confirmTokenMapping(plan));
      runCli(projectRoot, ["adopt"]);
      const outputRoot = join(projectRoot, "design-system");
      await item.mutate(outputRoot);
      await writeFile(join(outputRoot, ".design-consultant-lock.json"), "{malformed\n", "utf8");
      await writeFile(join(outputRoot, "tokens/tokens.json"), "NATIVE_SENTINEL\n", "utf8");
      const before = await snapshotOutput(projectRoot);

      const sync = spawnSync(process.execPath, [join(outputRoot, "checks/sync-tokens.mjs"), command, "--root", outputRoot], { encoding: "utf8" });
      const payload = JSON.parse(sync.stdout);

      assert.notEqual(sync.status, 0, `${item.name}/${command}`);
      assert.equal(payload.layout, "adoption-token-bridge", `${item.name}/${command}: ${sync.stdout || sync.stderr}`);
      assert.deepEqual(await snapshotOutput(projectRoot), before, `${item.name}/${command}`);
    }
  }
});

test("sync-tokens requires trusted greenfield init provenance for generated native build and check", async (t) => {
  const mutations = [
    { name: "missing lock", mutate: (path) => rm(path, { force: true }) },
    { name: "malformed lock", mutate: (path) => writeFile(path, "{malformed\n", "utf8") },
    { name: "missing provenance", mutate: async (path) => {
      const lock = JSON.parse(await readFile(path, "utf8"));
      delete lock.workflowProvenance;
      await writeFile(path, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
    } },
    { name: "wrong provenance", mutate: async (path) => {
      const lock = JSON.parse(await readFile(path, "utf8"));
      lock.workflowProvenance = { schemaVersion: 1, type: "forged-init", skillVersion: "0.10.0" };
      await writeFile(path, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
    } },
  ];

  for (const item of mutations) {
    for (const command of ["build", "check"]) {
      const projectRoot = await copyFixtureProject(t, "existing-mature-react");
      runCli(projectRoot, ["init"]);
      const outputRoot = join(projectRoot, "design-system");
      await item.mutate(join(outputRoot, ".design-consultant-lock.json"));
      await writeFile(join(outputRoot, "tokens/tokens.css"), "NATIVE_SENTINEL\n", "utf8");
      const before = await snapshotOutput(projectRoot);

      const sync = spawnSync(process.execPath, [join(outputRoot, "checks/sync-tokens.mjs"), command, "--root", outputRoot], { encoding: "utf8" });
      const payload = JSON.parse(sync.stdout);

      assert.notEqual(sync.status, 0, `${item.name}/${command}`);
      assert.equal(payload.layout, "untrusted-generated-design-system", `${item.name}/${command}: ${sync.stdout || sync.stderr}`);
      assert.match(JSON.stringify(payload.issues), /trusted greenfield init workflow provenance/i);
      assert.deepEqual(await snapshotOutput(projectRoot), before, `${item.name}/${command}`);
    }
  }
});

test("sync-tokens recognizes valid greenfield provenance independent of JSON property order", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-mature-react");
  runCli(projectRoot, ["init"]);
  const outputRoot = join(projectRoot, "design-system");
  const lockPath = join(outputRoot, ".design-consultant-lock.json");
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  lock.workflowProvenance = { skillVersion: "0.10.0", type: "greenfield-init", schemaVersion: 1 };
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
  const before = await snapshotOutput(projectRoot);

  const sync = spawnSync(process.execPath, [join(outputRoot, "checks/sync-tokens.mjs"), "check", "--root", outputRoot], { encoding: "utf8" });

  assert.equal(sync.status, 0, sync.stdout || sync.stderr);
  assert.equal(JSON.parse(sync.stdout).layout, "generated-design-system");
  assert.deepEqual(await snapshotOutput(projectRoot), before);
});

test("adopt dry-run calculates a confirmed plan without writing", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-mature-react");
  runCli(projectRoot, ["extract"]);
  await confirmPlan(projectRoot);
  const outputRoot = join(projectRoot, "design-system");
  const lockBefore = await readFile(join(outputRoot, ".design-consultant-lock.json"), "utf8");
  const planBefore = await readFile(join(outputRoot, "adoption/adoption-plan.json"), "utf8");

  const result = runCli(projectRoot, ["adopt", "--dry-run"]);

  assert.equal(result.dryRun, true);
  assert.equal(result.strategy, "preserve");
  assert.deepEqual(result.created, ["checks/ui-contract-baseline.json", "migration/plan.md"]);
  assert.deepEqual(result.actions.map((item) => item.path), ["checks/ui-contract-baseline.json", "migration/plan.md", ".design-consultant-lock.json"]);
  assert.equal(await exists(join(outputRoot, "DESIGN.md")), false);
  assert.equal(await readFile(join(outputRoot, ".design-consultant-lock.json"), "utf8"), lockBefore);
  assert.equal(await readFile(join(outputRoot, "adoption/adoption-plan.json"), "utf8"), planBefore);
});

test("preserve adoption records only safe lock metadata", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-mature-react");
  runCli(projectRoot, ["extract"]);
  await confirmPlan(projectRoot);

  const result = runCli(projectRoot, ["adopt"]);

  assert.equal(result.strategy, "preserve");
  assert.deepEqual(await outputFiles(projectRoot), CONFIRMED_ADOPTION_OUTPUT_FILES);
  const lock = JSON.parse(await readFile(join(projectRoot, "design-system/.design-consultant-lock.json"), "utf8"));
  assert.deepEqual(lock.adoption, {
    status: "confirmed",
    strategy: "preserve",
    inventoryDigest: lock.adoption.inventoryDigest,
    projectIdentity: lock.adoption.projectIdentity,
    plan: {
      path: "adoption/adoption-plan.json",
      bytes: lock.adoption.plan.bytes,
      digest: lock.adoption.plan.digest,
    },
  });
  assert.match(lock.adoption.inventoryDigest, /^sha256:/);
  assert.match(lock.adoption.projectIdentity, /^dc-project-v1:[a-f0-9]{64}$/);
  assert.match(lock.adoption.plan.digest, /^[a-f0-9]{64}$/);
  assert.ok(Number.isInteger(lock.adoption.plan.bytes) && lock.adoption.plan.bytes > 0);
  assert.equal(await exists(join(projectRoot, "design-system/DESIGN.md")), false);
  assert.equal(await exists(join(projectRoot, "design-system/system.config.json")), false);
  assert.equal(await exists(join(projectRoot, "design-system/README.md")), false);
  assert.equal(await exists(join(projectRoot, "design-system/tokens/tokens.json")), false);
  assert.equal(await exists(join(projectRoot, "design-system/runtime/react/src/Button.tsx")), false);
});

test("duplicate and contradictory component decisions abort adoption without writes", async (t) => {
  for (const contradictory of [false, true]) {
    const projectRoot = await copyFixtureProject(t, "existing-mature-react");
    runCli(projectRoot, ["extract"]);
    await confirmPlan(projectRoot, (plan) => {
      const rejected = plan.componentMappings[0];
      const duplicate = JSON.parse(JSON.stringify(rejected));
      if (contradictory) {
        duplicate.status = "confirmed";
        duplicate.strategy = "wrapper";
        duplicate.propMap = [
          { canonicalProp: "children", sourceProp: "children", transform: "identity" },
          { canonicalProp: "loading", sourceProp: "loading", transform: "identity" },
          { canonicalProp: "variant", sourceProp: "variant", transform: "identity" },
        ];
      }
      plan.componentMappings.push(duplicate);
    });
    const before = await snapshotOutput(projectRoot);

    const result = runCliProcess(projectRoot, ["adopt"]);

    assert.equal(result.status, 2, result.stdout || result.stderr);
    assert.match(result.stderr, /exactly one terminal mapping decision/i);
    assert.equal(result.stdout, "");
    assert.deepEqual(await snapshotOutput(projectRoot), before);
  }
});

test("augment and migrate remain plan intent without Task 4 or Task 5 artifacts", async (t) => {
  for (const strategy of ["augment", "migrate"]) {
    const projectRoot = await copyFixtureProject(t, "existing-mature-react");
    runCli(projectRoot, ["extract"]);
    await confirmPlan(projectRoot, (plan) => { plan.strategy = strategy; });

    const result = runCli(projectRoot, ["adopt"]);

    assert.equal(result.strategy, strategy);
    assert.equal(result.runtime.generated, 0);
    assert.equal(result.runtime.mapped, 0);
    assert.deepEqual(await outputFiles(projectRoot), CONFIRMED_ADOPTION_OUTPUT_FILES);
    for (const path of ["DESIGN.md", "tokens/tokens.json", "catalog/component-library.html", "runtime/react/src/index.ts", "components/manifest.json"]) {
      assert.equal(await exists(join(projectRoot, "design-system", path)), false, `${strategy}: ${path}`);
    }
  }
});

test("new extraction update preserves the plan and creates no unconfirmed system artifacts", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-partial-react");
  runCli(projectRoot, ["extract"]);
  const planPath = join(projectRoot, "design-system/adoption/adoption-plan.json");
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  plan.decisions.push("User-managed adoption decision");
  const expected = `${JSON.stringify(plan, null, 2)}\n`;
  await writeFile(planPath, expected, "utf8");

  const result = runCli(projectRoot, ["update"]);

  assert.equal(await readFile(planPath, "utf8"), expected);
  assert.deepEqual(await outputFiles(projectRoot), ADOPTION_OUTPUT_FILES);
  assert.deepEqual(result.created, []);
  for (const path of ["DESIGN.md", "tokens/tokens.json", "catalog/component-library.html", "runtime/react/src/index.ts"]) {
    assert.equal(await exists(join(projectRoot, "design-system", path)), false, path);
  }
});

test("update rejects a missing adoption lock without side effects", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-partial-react");
  runCli(projectRoot, ["extract"]);
  await rm(join(projectRoot, "design-system/.design-consultant-lock.json"));
  const before = await snapshotOutput(projectRoot);

  const result = runCliProcess(projectRoot, ["update"]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /lock|extract|recovery|恢复|重新/i);
  assert.equal(result.stdout, "");
  assert.deepEqual(await snapshotOutput(projectRoot), before);
});

test("update rejects adoption locks with stripped marker entries without side effects", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-partial-react");
  runCli(projectRoot, ["extract"]);
  const lockPath = join(projectRoot, "design-system/.design-consultant-lock.json");
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  for (const path of ["intake/extraction-report.json", "adoption/adoption-plan.json", "adoption/compatibility-report.json", "adoption/adoption-plan.schema.json"]) {
    delete lock.files[path];
  }
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
  const before = await snapshotOutput(projectRoot);

  const result = runCliProcess(projectRoot, ["update"]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /lock|marker|extract|recovery|恢复|重新/i);
  assert.equal(result.stdout, "");
  assert.deepEqual(await snapshotOutput(projectRoot), before);
});

test("update rejects tampered adoption marker provenance without side effects", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-partial-react");
  runCli(projectRoot, ["extract"]);
  const lockPath = join(projectRoot, "design-system/.design-consultant-lock.json");
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  lock.files["adoption/compatibility-report.json"].source = "templates/DESIGN.md";
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
  const before = await snapshotOutput(projectRoot);

  const result = runCliProcess(projectRoot, ["update"]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /provenance|source|lock|extract|recovery|恢复|重新/i);
  assert.equal(result.stdout, "");
  assert.deepEqual(await snapshotOutput(projectRoot), before);
});

test("update rejects contradictory adoption workflow labels without side effects", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-partial-react");
  runCli(projectRoot, ["extract"]);
  const lockPath = join(projectRoot, "design-system/.design-consultant-lock.json");
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  lock.workflow = "greenfield";
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
  const before = await snapshotOutput(projectRoot);

  const result = runCliProcess(projectRoot, ["update"]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /workflow|lock|extract|recovery|恢复|重新/i);
  assert.equal(result.stdout, "");
  assert.deepEqual(await snapshotOutput(projectRoot), before);
});

test("update rejects contradictory greenfield workflow labels without side effects", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-partial-react");
  runCli(projectRoot, ["init"]);
  const lockPath = join(projectRoot, "design-system/.design-consultant-lock.json");
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  lock.workflow = "existing-system-adoption";
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
  const before = await snapshotOutput(projectRoot);

  const result = runCliProcess(projectRoot, ["update"]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /workflow|marker|lock|recovery|恢复|重新/i);
  assert.equal(result.stdout, "");
  assert.deepEqual(await snapshotOutput(projectRoot), before);
});

test("update rejects incomplete on-disk adoption markers without side effects", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-partial-react");
  runCli(projectRoot, ["extract"]);
  await rm(join(projectRoot, "design-system/adoption/compatibility-report.json"));
  const before = await snapshotOutput(projectRoot);

  const result = runCliProcess(projectRoot, ["update"]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /marker|artifact|extract|recovery|恢复|重新/i);
  assert.equal(result.stdout, "");
  assert.deepEqual(await snapshotOutput(projectRoot), before);
});

test("extract reads old v0.9 locks and reports the artifact split migration", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-mature-react");
  runCli(projectRoot, ["init"]);
  const lockPath = join(projectRoot, "design-system/.design-consultant-lock.json");
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  lock.skillVersion = "0.9.0";
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");

  const result = runCli(projectRoot, ["extract"]);

  assert.ok(result.migrationNotes.some((note) => /v0\.9|runtime|默认/i.test(note)));
  assert.equal(await exists(join(projectRoot, "design-system/runtime/react/src/Button.tsx")), true);
  assert.equal(await exists(join(projectRoot, "design-system/adoption/adoption-plan.json")), true);

  await rm(join(projectRoot, "design-system/tokens/tokens.json"));
  await rm(join(projectRoot, "design-system/runtime/react/src/Button.tsx"));
  const updateResult = runCli(projectRoot, ["update"]);
  assert.equal(updateResult.created.includes("tokens/tokens.json"), false);
  assert.equal(updateResult.created.includes("runtime/react/src/Button.tsx"), false);
  assert.equal(await exists(join(projectRoot, "design-system/tokens/tokens.json")), false);
  assert.equal(await exists(join(projectRoot, "design-system/runtime/react/src/Button.tsx")), false);
});

test("update reads but does not infer greenfield from a v0.9 lock without workflow", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-mature-react");
  runCli(projectRoot, ["init"]);
  const lockPath = join(projectRoot, "design-system/.design-consultant-lock.json");
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  lock.skillVersion = "0.9.0";
  delete lock.workflow;
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
  const before = await snapshotOutput(projectRoot);

  const result = runCliProcess(projectRoot, ["update"]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /v0\.9|extract|recovery|恢复/i);
  assert.equal(result.stdout, "");
  assert.deepEqual(await snapshotOutput(projectRoot), before);
});

test("extract rejects a linked output root before any side effect", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-partial-react");
  const outside = await mkdtemp(join(tmpdir(), "design-consultant-outside-"));
  t.after(() => rm(outside, { recursive: true, force: true }));
  if (!await createDirectoryLinkOrSkip(t, outside, join(projectRoot, "design-system"))) return;

  const result = runCliProcess(projectRoot, ["extract"]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /link|symbolic|junction|链接|重解析/i);
  assert.deepEqual(await readdir(outside), []);
});

test("extract rejects a linked destination ancestor before writing any file", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-partial-react");
  const outputRoot = join(projectRoot, "design-system");
  const outside = await mkdtemp(join(tmpdir(), "design-consultant-linked-adoption-"));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await mkdir(outputRoot, { recursive: true });
  if (!await createDirectoryLinkOrSkip(t, outside, join(outputRoot, "adoption"))) return;

  const result = runCliProcess(projectRoot, ["extract"]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /link|symbolic|junction|链接|重解析/i);
  assert.deepEqual(await readdir(outside), []);
  assert.equal(await exists(join(outputRoot, "intake/extraction-report.json")), false);
  assert.equal(await exists(join(outputRoot, ".design-consultant-lock.json")), false);
});

test("manual component adapters reject junction escapes before action planning", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-mature-react");
  const externalRoot = await mkdtemp(join(tmpdir(), "design-consultant-manual-adapter-"));
  t.after(() => rm(externalRoot, { recursive: true, force: true }));
  await writeFile(join(externalRoot, "Button.tsx"), "export function Button() { return null; }\n", "utf8");
  const linkedRoot = join(projectRoot, "src/manual-adapters");
  runCli(projectRoot, ["extract"]);
  await confirmPlan(projectRoot, (plan) => {
    plan.componentMappings.push({
      component: "button",
      strategy: "manual",
      adapterPath: "src/manual-adapters/Button.tsx",
      status: "confirmed",
    });
  });
  if (!await createDirectoryLinkOrSkip(t, externalRoot, linkedRoot)) return;
  const before = await snapshotOutput(projectRoot);

  const result = runCliProcess(projectRoot, ["adopt"]);

  assert.notEqual(result.status, 0, result.stdout || result.stderr);
  assert.match(result.stderr, /symbolic link|junction|ordinary file|outside|source evidence/i);
  assert.equal(result.stdout, "");
  assert.deepEqual(await snapshotOutput(projectRoot), before);
});

test("initial adoption rejects a pre-existing baseline without managed provenance", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-mature-react");
  runCli(projectRoot, ["extract"]);
  await confirmPlan(projectRoot);
  const baselinePath = join(projectRoot, "design-system/checks/ui-contract-baseline.json");
  await mkdir(dirname(baselinePath), { recursive: true });
  await writeFile(baselinePath, `${JSON.stringify({ schemaVersion: 1, issues: [] }, null, 2)}\n`, "utf8");
  const before = await snapshotOutput(projectRoot);

  const result = runCliProcess(projectRoot, ["adopt"]);

  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stderr, /baseline|provenance|pre-existing|managed|lock/i);
  assert.equal(result.stdout, "");
  assert.deepEqual(await snapshotOutput(projectRoot), before);
});

test("adoption records exact dynamic artifact provenance with null template hashes", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-mature-react");
  runCli(projectRoot, ["extract"]);
  await confirmPlan(projectRoot);
  runCli(projectRoot, ["adopt"]);
  const outputRoot = join(projectRoot, "design-system");
  const lock = JSON.parse(await readFile(join(outputRoot, ".design-consultant-lock.json"), "utf8"));
  const expected = [
    ["checks/ui-contract-baseline.json", UI_CONTRACT_BASELINE_SOURCE, UI_CONTRACT_BASELINE_PROVENANCE],
    ["migration/plan.md", MIGRATION_PLAN_SOURCE, MIGRATION_PLAN_PROVENANCE],
  ];

  for (const [path, source, provenance] of expected) {
    const raw = await readFile(join(outputRoot, path));
    assert.deepEqual(lock.files[path], {
      source,
      generatedHash: hash(raw),
      templateHash: null,
      provenance,
    });
  }
});

test("subsequent adopt and update reject missing or drifted managed baseline and migration artifacts", async (t) => {
  const cases = [
    { path: "checks/ui-contract-baseline.json", command: "adopt", mutate: (path) => writeFile(path, '{"schemaVersion":1,"issues":[]}\n', "utf8") },
    { path: "checks/ui-contract-baseline.json", command: "update", mutate: (path) => rm(path) },
    { path: "migration/plan.md", command: "adopt", mutate: (path) => writeFile(path, "# drifted\n", "utf8") },
    { path: "migration/plan.md", command: "update", mutate: (path) => rm(path) },
  ];
  for (const item of cases) {
    const projectRoot = await copyFixtureProject(t, "existing-mature-react");
    runCli(projectRoot, ["extract"]);
    await confirmPlan(projectRoot);
    runCli(projectRoot, ["adopt"]);
    const artifactPath = join(projectRoot, "design-system", item.path);
    await item.mutate(artifactPath);
    const before = await snapshotOutput(projectRoot);

    const result = runCliProcess(projectRoot, [item.command]);

    assert.equal(result.status, 2, `${item.command} ${item.path}: ${result.stderr || result.stdout}`);
    assert.match(result.stderr, /managed adoption artifact|missing|drift|provenance|ordinary/i);
    assert.equal(result.stdout, "");
    assert.deepEqual(await snapshotOutput(projectRoot), before);
  }
});

test("subsequent adoption rejects malformed locks and forged dynamic artifact provenance", async (t) => {
  for (const malformed of [true, false]) {
    const projectRoot = await copyFixtureProject(t, "existing-mature-react");
    runCli(projectRoot, ["extract"]);
    await confirmPlan(projectRoot);
    runCli(projectRoot, ["adopt"]);
    const lockPath = join(projectRoot, "design-system/.design-consultant-lock.json");
    if (malformed) {
      await writeFile(lockPath, "{ malformed", "utf8");
    } else {
      const lock = JSON.parse(await readFile(lockPath, "utf8"));
      lock.files["checks/ui-contract-baseline.json"].provenance = { ...UI_CONTRACT_BASELINE_PROVENANCE, mode: "forged" };
      await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
    }
    const before = await snapshotOutput(projectRoot);

    const result = runCliProcess(projectRoot, ["update"]);

    assert.notEqual(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stderr, /lock|provenance|managed adoption artifact|read/i);
    assert.equal(result.stdout, "");
    assert.deepEqual(await snapshotOutput(projectRoot), before);
  }
});

test("subsequent adopt rejects a non-adoption lock workflow before planning actions", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-mature-react");
  runCli(projectRoot, ["extract"]);
  await confirmPlan(projectRoot);
  runCli(projectRoot, ["adopt"]);
  const lockPath = join(projectRoot, "design-system/.design-consultant-lock.json");
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  lock.workflow = "greenfield";
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
  const before = await snapshotOutput(projectRoot);

  const result = runCliProcess(projectRoot, ["adopt"]);

  assert.notEqual(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stderr, /workflow|adoption lock|provenance/i);
  assert.equal(result.stdout, "");
  assert.deepEqual(await snapshotOutput(projectRoot), before);
});

test("adoption artifact creation rolls back when the managed transaction fails mid-commit", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-mature-react");
  runCli(projectRoot, ["extract"]);
  await confirmPlan(projectRoot);
  const before = await snapshotOutput(projectRoot);
  const { run: runManageVisualSystem } = await import(`${pathToFileURL(SCRIPT_PATH).href}?rollback=${Date.now()}`);

  await assert.rejects(
    runManageVisualSystem(
      { command: "adopt", target: projectRoot, output: "design-system", mode: null, projectName: null, dryRun: false },
      { beforeInstall: ({ destination }) => { if (destination === "migration/plan.md") throw new Error("forced adoption artifact failure"); } },
    ),
    /forced adoption artifact failure/,
  );
  assert.deepEqual(await snapshotOutput(projectRoot), before);
});

test("approved managed baseline write and prune remain valid through guard, checker, and update", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-mature-react");
  const legacyPath = join(projectRoot, "src/LegacyRatchet.tsx");
  await writeFile(legacyPath, `export function LegacyRatchet() { return <><div role="dialog" /><div role="dialog" /></>; }\n`, "utf8");
  runCli(projectRoot, ["extract"]);
  await confirmPlan(projectRoot, (plan) => confirmTokenMapping(plan));
  runCli(projectRoot, ["adopt"]);
  const outputRoot = join(projectRoot, "design-system");
  const baselinePath = join(outputRoot, "checks/ui-contract-baseline.json");
  assert.equal(runUiGuard(projectRoot, baselinePath).status, 0);
  let generatedGuard = runGeneratedUiGuard(outputRoot);
  assert.equal(generatedGuard.status, 0, generatedGuard.stderr || generatedGuard.stdout);
  assert.ok(JSON.parse(generatedGuard.stdout).issues.some((issue) => issue.file === "src/LegacyRatchet.tsx" && issue.baselineStatus === "known"));

  await writeFile(legacyPath, `export function LegacyRatchet() { return <div role="dialog" />; }\n`, "utf8");
  const stale = runGeneratedUiGuard(outputRoot);
  assert.equal(stale.status, 0, stale.stderr || stale.stdout);
  assert.equal(JSON.parse(stale.stdout).staleBaseline.find((entry) => entry.file === "src/LegacyRatchet.tsx").staleCount, 1);
  await refreshConfirmedPlanInventory(projectRoot);
  runCli(projectRoot, ["update"]);
  assert.match(await readFile(join(outputRoot, "migration/plan.md"), "utf8"), /Stale baseline occurrences: 1/i);

  const pruned = runGeneratedUiGuard(outputRoot, ["--prune-baseline"]);
  assert.equal(pruned.status, 0, pruned.stderr || pruned.stdout);
  runCli(projectRoot, ["update"]);
  assert.equal((await validateAdoptionContract(outputRoot)).ok, true);

  await writeFile(legacyPath, `export function LegacyRatchet() { return <><div role="dialog" /><div role="dialog" /></>; }\n`, "utf8");
  generatedGuard = runGeneratedUiGuard(outputRoot);
  assert.equal(generatedGuard.status, 1, generatedGuard.stderr || generatedGuard.stdout);
  const written = runGeneratedUiGuard(outputRoot, ["--write-baseline"]);
  assert.equal(written.status, 0, written.stderr || written.stdout);
  await refreshConfirmedPlanInventory(projectRoot);
  runCli(projectRoot, ["update"]);
  assert.equal(runGeneratedUiGuard(outputRoot).status, 0);
  const validation = await validateAdoptionContract(outputRoot);
  assert.equal(validation.ok, true, JSON.stringify(validation.issues));
});

test("app entry imports are rendered as pending suggestions and never written to the application", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-mature-react");
  const entryPath = join(projectRoot, "src/main.tsx");
  await writeFile(entryPath, "export const appEntry = true;\n", "utf8");
  runCli(projectRoot, ["extract"]);
  await confirmPlan(projectRoot, (plan) => {
    plan.appEntryImports = [{ path: "src/main.tsx", statement: 'import "../design-system/tokens/external-bridge.css";' }];
  });
  const before = await readFile(entryPath, "utf8");

  runCli(projectRoot, ["adopt"]);

  assert.equal(await readFile(entryPath, "utf8"), before);
  const migration = await readFile(join(projectRoot, "design-system/migration/plan.md"), "utf8");
  assert.match(migration, /App Entry Imports/);
  assert.match(migration, /src\/main\.tsx/i);
  assert.match(migration, /import .*external-bridge\.css/i);
  assert.match(migration, /pending|待用户确认/i);
});

test("migration plan states preserve boundaries without claiming application integration", () => {
  const markdown = renderMigrationPlan({
    plan: {
      strategy: "preserve",
      sourceOfTruth: { tokens: "existing", components: "existing" },
      componentMappings: [],
      tokenMappings: [],
      visualVerification: { baseUrl: null, routes: [], status: "not-configured" },
    },
    compatibility: { criticalConflicts: [] },
    adoptionIssues: { issues: [{ rule: "raw-dialog", baselineStatus: "known", file: "src/Legacy.tsx", line: 1 }] },
  });
  assert.match(markdown, /preserve/i);
  assert.match(markdown, /待集成|未验证/);
  assert.doesNotMatch(markdown, /已完成应用集成/);
});

test("migration plan renders real confirmed mappings, unresolved blockers, and independent augment items", async () => {
  const schema = JSON.parse(await readFile(PLAN_SCHEMA, "utf8"));
  const plan = JSON.parse(await readFile(PLAN_TEMPLATE, "utf8"));
  plan.strategy = "augment";
  plan.tokenMappings = [
    confirmedBridgeMappings()[0],
    { semanticToken: "space.inline", source: { name: "--legacy-gap" }, match: "candidate", status: "manual" },
  ];
  plan.componentMappings = [
    {
      component: "button",
      source: { path: "src/ui/Button.tsx", exportName: "Button", propsExport: "ButtonProps" },
      strategy: "direct",
      api: { props: ["variant", "loading", "children"] },
      status: "confirmed",
    },
    {
      component: "dialog",
      source: { path: "src/ui/Modal.tsx", exportName: "Modal" },
      strategy: "wrapper",
      propMap: [{ canonicalProp: "children", sourceProp: "children", transform: "identity" }],
      status: "confirmed",
    },
    { component: "data-table", strategy: "generate", approved: true, status: "confirmed" },
    { component: "status", strategy: "manual", adapterPath: "src/adapters/StatusBadge.tsx", status: "confirmed" },
    {
      component: "icon-button",
      source: { path: "src/ui/RejectedIcon.tsx", exportName: "RejectedIcon" },
      strategy: "reject",
      status: "rejected",
    },
    {
      component: "field",
      source: { path: "src/ui/Field.tsx", exportName: "Field" },
      strategy: "wrapper",
      status: "proposed",
    },
  ];
  plan.appEntryImports = [{ path: "src/main.tsx", statement: 'import "./design-system/tokens/external-bridge.css";' }];
  plan.decisions = ["resolve:resolved-conflict"];
  const validate = new Ajv2020({ allErrors: true }).compile(schema);
  assert.equal(validate(plan), true, JSON.stringify(validate.errors));

  const markdown = renderMigrationPlan({
    plan,
    compatibility: {
      criticalConflicts: [
        { id: "resolved-conflict", message: "already resolved" },
        { id: "open-conflict", message: "still open" },
      ],
    },
    adoptionIssues: {
      issues: [],
      staleBaseline: [{ rule: "raw-dialog", file: "src/Legacy.tsx", count: 2, staleCount: 1 }],
    },
  });

  assert.match(markdown, /semantic\.color\.primary.*--primary.*--brand-primary.*src\/theme\.css:2/i);
  assert.match(markdown, /direct: Button.*src\/ui\/Button\.tsx.*Button/i);
  assert.doesNotMatch(markdown, /direct adapter: Button/i);
  assert.match(markdown, /wrapper adapter: Dialog.*src\/ui\/Modal\.tsx.*Modal/i);
  assert.match(markdown, /manual adapter: StatusBadge.*src\/adapters\/StatusBadge\.tsx/i);
  assert.match(markdown, /approved generate: DataTable/i);
  assert.doesNotMatch(markdown, /RejectedIcon/i);
  assert.match(markdown, /open-conflict.*still open/i);
  assert.doesNotMatch(markdown, /resolved-conflict|already resolved/i);
  assert.match(markdown, /component mapping.*field/i);
  assert.match(markdown, /token mapping.*space\.inline/i);
  assert.match(markdown, /Stale baseline occurrences: 1/i);
  assert.match(markdown, /src\/main\.tsx/i);
  assert.match(markdown, /import .*external-bridge\.css/i);
  const augmentLines = markdown.split("\n").filter((line) => /Batch 2\./.test(line));
  for (const expected of ["direct: Button", "wrapper adapter: Dialog", "approved generate: DataTable", "manual adapter: StatusBadge"]) {
    assert.equal(augmentLines.filter((line) => line.includes(expected)).length, 1, `${expected}: ${augmentLines.join(" | ")}`);
  }
});

test("migration plan lists approved generated components and adapters as separate augment items", () => {
  const markdown = renderMigrationPlan({
    plan: {
      strategy: "augment",
      sourceOfTruth: { tokens: "existing", components: "existing" },
      tokenMappings: [],
      visualVerification: { baseUrl: null, routes: [], status: "not-configured" },
      componentMappings: [
        { component: "button", strategy: "generate", status: "confirmed" },
        { component: "dialog", strategy: "wrapper", status: "confirmed", adapterPath: "runtime/react/src/adapters/Dialog.tsx" },
      ],
    },
    compatibility: { criticalConflicts: [] },
    adoptionIssues: { issues: [] },
  });
  assert.match(markdown, /approved generate.*Button/i);
  assert.match(markdown, /wrapper adapter.*Dialog/i);
});

test("migration plan orders migrate batches and does not change business files", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-mature-react");
  runCli(projectRoot, ["extract"]);
  await confirmPlan(projectRoot, (plan) => { plan.strategy = "migrate"; });
  const sourceBefore = await readFile(join(projectRoot, "src/ui/PrimaryButton.tsx"), "utf8");

  runCli(projectRoot, ["adopt"]);

  const markdown = await readFile(join(projectRoot, "design-system/migration/plan.md"), "utf8");
  assert.match(markdown, /Batch 1/i);
  assert.match(markdown, /Batch 2/i);
  assert.equal(await readFile(join(projectRoot, "src/ui/PrimaryButton.tsx"), "utf8"), sourceBefore);
});

test("visualVerification schema uses the strict configured and not-configured route contract", async () => {
  const schema = JSON.parse(await readFile(PLAN_SCHEMA, "utf8"));
  const validate = new Ajv2020({ allErrors: true }).compile(schema);
  const draft = JSON.parse(await readFile(PLAN_TEMPLATE, "utf8"));
  const confirmed = {
    ...draft,
    status: "confirmed",
    strategy: "preserve",
    inventoryDigest: "sha256:fixture",
    visualVerification: configuredVisualVerification(),
  };

  assert.equal(validate(confirmed), true, JSON.stringify(validate.errors));
  assert.equal(validate({
    ...confirmed,
    visualVerification: { status: "configured", baseUrl: confirmed.visualVerification.baseUrl, routes: [] },
  }), false, "configured requires at least one strict route");
  assert.equal(validate({
    ...confirmed,
    visualVerification: { status: "not-configured", baseUrl: null, routes: confirmed.visualVerification.routes },
  }), false, "not-configured forbids routes");
  assert.equal(validate({
    ...confirmed,
    visualVerification: { status: "not-configured", baseUrl: confirmed.visualVerification.baseUrl, routes: [] },
  }), false, "not-configured forbids baseUrl");
  assert.equal(validate({
    ...confirmed,
    visualVerification: {
      ...confirmed.visualVerification,
      routes: [{ ...confirmed.visualVerification.routes[0], label: "Dashboard" }],
    },
  }), false, "route objects reject unknown authorization fields");
});

test("confirmed visual routes survive confirm -> adopt -> visual inspect and test dispatch", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-mature-react");
  runCli(projectRoot, ["extract"]);
  const verification = configuredVisualVerification();
  await confirmPlan(projectRoot, (plan) => {
    plan.strategy = "augment";
    confirmTokenMapping(plan);
    plan.componentMappings.push({ component: "status", strategy: "generate", approved: true, status: "confirmed" });
    plan.visualVerification = verification;
  });

  runCli(projectRoot, ["adopt"]);

  const outputRoot = join(projectRoot, "design-system");
  const configPath = join(outputRoot, "checks/adoption-visual.config.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  assert.equal(config.baseUrl, verification.baseUrl);
  assert.deepEqual(config.routes, verification.routes);
  assert.equal(config.startCommand, null);

  const visual = await import(`${pathToFileURL(join(SCRIPT_DIR, "visual-regression.mjs")).href}?routes=${Date.now()}`);
  const inspected = await visual.inspectVisualConfig(configPath);
  assert.equal(inspected.applicationVisualVerification, "missing-baseline");
  assert.deepEqual(inspected.routes.map(({ routeId, path }) => ({ routeId, path })), [
    { routeId: "dashboard", path: "/dashboard" },
    { routeId: "dashboard", path: "/dashboard" },
  ]);
  let testedConfig = null;
  const report = await visual.runVisualCommand("test", {
    configPath,
    catalogRunner: async () => [],
    applicationRunner: async (mode, path) => {
      assert.equal(mode, "test");
      testedConfig = await visual.inspectVisualConfig(path);
      return { applicationVisualVerification: "passed", report: [], startCommandExecuted: false };
    },
  });
  assert.equal(report.applicationVisualVerification, "passed");
  assert.deepEqual(testedConfig.routes.map(({ routeId, path }) => ({ routeId, path })), [
    { routeId: "dashboard", path: "/dashboard" },
    { routeId: "dashboard", path: "/dashboard" },
  ]);
});

test("adoption checker binds exact confirmed plan bytes and validates the complete schema", async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-non-react");
  const stylesPath = join(projectRoot, "src/styles.css");
  await writeFile(stylesPath, `${await readFile(stylesPath, "utf8")}\n:root { --brand-primary: #2457d6; }\n`, "utf8");
  runCli(projectRoot, ["extract"]);
  await confirmPlan(projectRoot, (plan) => confirmTokenMapping(plan));
  runCli(projectRoot, ["adopt"]);

  const outputRoot = join(projectRoot, "design-system");
  const planPath = join(outputRoot, "adoption/adoption-plan.json");
  const schemaPath = join(outputRoot, "adoption/adoption-plan.schema.json");
  const lockPath = join(outputRoot, ".design-consultant-lock.json");
  const originalRaw = await readFile(planPath, "utf8");
  const originalSchemaRaw = await readFile(schemaPath, "utf8");
  const originalLock = JSON.parse(await readFile(lockPath, "utf8"));
  assert.deepEqual(originalLock.adoption.plan, {
    path: "adoption/adoption-plan.json",
    bytes: Buffer.byteLength(originalRaw),
    digest: hash(originalRaw),
  });
  assert.equal((await validateAdoptionContract(outputRoot)).ok, true);

  await writeFile(planPath, `${originalRaw}\n`, "utf8");
  let validation = await validateAdoptionContract(outputRoot);
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((item) => item.rule === "adoption-plan-lock-drift"), JSON.stringify(validation.issues));

  const typoPlan = JSON.parse(originalRaw);
  typoPlan.authorization = { allowUnconfirmedWrites: true };
  const typoRaw = `${JSON.stringify(typoPlan, null, 2)}\n`;
  await writeFile(planPath, typoRaw, "utf8");
  const forgedLock = structuredClone(originalLock);
  forgedLock.files["adoption/adoption-plan.json"].generatedHash = hash(typoRaw);
  forgedLock.adoption.plan = {
    path: "adoption/adoption-plan.json",
    bytes: Buffer.byteLength(typoRaw),
    digest: hash(typoRaw),
  };
  await writeFile(lockPath, `${JSON.stringify(forgedLock, null, 2)}\n`, "utf8");
  validation = await validateAdoptionContract(outputRoot);
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((item) => item.rule === "adoption-plan-schema"), JSON.stringify(validation.issues));

  const forgedSchema = JSON.parse(originalSchemaRaw);
  forgedSchema.title = "Forged adoption plan contract";
  const forgedSchemaRaw = `${JSON.stringify(forgedSchema, null, 2)}\n`;
  const forgedSchemaLock = structuredClone(originalLock);
  forgedSchemaLock.files["adoption/adoption-plan.schema.json"].generatedHash = hash(forgedSchemaRaw);
  forgedSchemaLock.files["adoption/adoption-plan.schema.json"].templateHash = hash(forgedSchemaRaw);
  await writeFile(planPath, originalRaw, "utf8");
  await writeFile(schemaPath, forgedSchemaRaw, "utf8");
  await writeFile(lockPath, `${JSON.stringify(forgedSchemaLock, null, 2)}\n`, "utf8");
  validation = await validateAdoptionContract(outputRoot);
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((item) => item.rule === "adoption-plan-schema-lock-drift"), JSON.stringify(validation.issues));
});

test("token-only non-React adoption installs and checks outside the source repository from declared dependencies", { timeout: 180000 }, async (t) => {
  const projectRoot = await copyFixtureProject(t, "existing-non-react");
  const stylesPath = join(projectRoot, "src/styles.css");
  await writeFile(stylesPath, `${await readFile(stylesPath, "utf8")}\n:root { --brand-primary: #2457d6; }\n`, "utf8");
  runCli(projectRoot, ["extract"]);
  await confirmPlan(projectRoot, (plan) => confirmTokenMapping(plan));
  runCli(projectRoot, ["adopt"]);

  const portableWorkspace = await mkdtemp(join(tmpdir(), "design-consultant-portable-adoption-"));
  t.after(() => rm(portableWorkspace, { recursive: true, force: true }));
  const portableProject = join(portableWorkspace, "project");
  await cp(projectRoot, portableProject, { recursive: true });
  const outputRoot = join(portableProject, "design-system");
  const packageJson = JSON.parse(await readFile(join(outputRoot, "package.json"), "utf8"));
  const declared = { ...(packageJson.dependencies ?? {}), ...(packageJson.devDependencies ?? {}) };
  assert.equal(declared.ajv, "8.17.1");
  assert.equal(declared.typescript, "7.0.2");
  assert.equal(declared["css-tree"], "3.2.1");
  assert.equal(Object.hasOwn(declared, "react"), false);
  assert.equal(Object.hasOwn(declared, "react-dom"), false);
  assert.equal(Object.keys(packageJson.scripts).some((name) => /react|component|catalog|visual/i.test(name)), false);

  const install = process.platform === "win32"
    ? spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "npm install --ignore-scripts --no-audit --no-fund --no-package-lock"], { cwd: outputRoot, encoding: "utf8", timeout: 150000 })
    : spawnSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--no-package-lock"], { cwd: outputRoot, encoding: "utf8", timeout: 150000 });
  assert.equal(install.status, 0, install.stderr || install.stdout);
  const checker = join(outputRoot, "checks/check-adoption-contract.mjs");
  let checked = spawnSync(process.execPath, [checker, "--root", outputRoot], { cwd: outputRoot, encoding: "utf8" });
  assert.equal(checked.status, 0, checked.stdout || checked.stderr);

  await writeFile(join(outputRoot, "adoption/adoption-plan.json"), `${await readFile(join(outputRoot, "adoption/adoption-plan.json"), "utf8")} `, "utf8");
  checked = spawnSync(process.execPath, [checker, "--root", outputRoot], { cwd: outputRoot, encoding: "utf8" });
  assert.notEqual(checked.status, 0, checked.stdout || checked.stderr);
  assert.ok(JSON.parse(checked.stdout).issues.some((item) => item.rule === "adoption-plan-lock-drift"), checked.stdout);
});

async function makeRealV09GreenfieldProject(t) {
  const workspace = await mkdtemp(join(tmpdir(), "design-consultant-v09-lock-"));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const archiveRoot = join(workspace, "v09-source");
  await mkdir(archiveRoot, { recursive: true });
  const archived = spawnSync("git", [
    "archive",
    "--format=tar",
    "3ae3d3cb",
    "skills/design-consultant",
    "evals/design-consultant/visual-baselines/v0.9",
  ], { cwd: REPO_ROOT, encoding: null, maxBuffer: 64 * 1024 * 1024 });
  assert.equal(archived.status, 0, archived.stderr?.toString() || "git archive failed");
  const extracted = spawnSync("tar", ["-xf", "-", "-C", archiveRoot], { input: archived.stdout, encoding: null, maxBuffer: 64 * 1024 * 1024 });
  assert.equal(extracted.status, 0, extracted.stderr?.toString() || "tar extraction failed");

  const projectRoot = join(workspace, "legacy-react-project");
  await mkdir(projectRoot, { recursive: true });
  await writeFile(join(projectRoot, "package.json"), `${JSON.stringify({
    name: "legacy-react-project",
    private: true,
    dependencies: { react: "19.2.8", "react-dom": "19.2.8" },
  }, null, 2)}\n`, "utf8");
  const legacyScript = join(archiveRoot, "skills/design-consultant/scripts/manage-visual-system.mjs");
  const generated = spawnSync(process.execPath, [legacyScript, "init", "--target", projectRoot], { encoding: "utf8", timeout: 60000 });
  assert.equal(generated.status, 0, generated.stderr || generated.stdout);
  const outputRoot = join(projectRoot, "design-system");
  const lock = JSON.parse(await readFile(join(outputRoot, ".design-consultant-lock.json"), "utf8"));
  assert.equal(lock.skillVersion, "0.9.0");
  assert.equal(Object.hasOwn(lock, "workflow"), false);
  return { projectRoot, outputRoot };
}

test("explicit legacy-lock migration verifies a real v0.9 fixture before provenance-only upgrade", { timeout: 180000 }, async (t) => {
  const { projectRoot, outputRoot } = await makeRealV09GreenfieldProject(t);
  const lockPath = join(outputRoot, ".design-consultant-lock.json");
  const originalRaw = await readFile(lockPath, "utf8");
  const original = JSON.parse(originalRaw);
  const readmePath = join(outputRoot, "README.md");
  const readmeRaw = await readFile(readmePath, "utf8");

  let migrated = runCliProcess(projectRoot, ["migrate-lock", "--dry-run"]);
  assert.equal(migrated.status, 0, migrated.stderr || migrated.stdout);
  assert.equal(await readFile(lockPath, "utf8"), originalRaw, "dry-run must not write the lock");
  assert.equal(JSON.parse(migrated.stdout).verifiedFiles, Object.keys(original.files).length);

  const forged = structuredClone(original);
  forged.files["README.md"].source = "templates/forged.md";
  await writeFile(lockPath, `${JSON.stringify(forged, null, 2)}\n`, "utf8");
  let rejected = runCliProcess(projectRoot, ["migrate-lock", "--dry-run"]);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /legacy|source|forged|provenance/i);

  const partial = structuredClone(original);
  delete partial.files["README.md"];
  await writeFile(lockPath, `${JSON.stringify(partial, null, 2)}\n`, "utf8");
  rejected = runCliProcess(projectRoot, ["migrate-lock", "--dry-run"]);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /legacy|partial|complete|file set/i);

  await writeFile(lockPath, originalRaw, "utf8");
  await writeFile(readmePath, `${readmeRaw}\ndrift\n`, "utf8");
  rejected = runCliProcess(projectRoot, ["migrate-lock", "--dry-run"]);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /drift|hash|managed destination/i);

  await writeFile(readmePath, readmeRaw, "utf8");
  migrated = runCliProcess(projectRoot, ["migrate-lock"]);
  assert.equal(migrated.status, 0, migrated.stderr || migrated.stdout);
  const upgraded = JSON.parse(await readFile(lockPath, "utf8"));
  const { workflow, workflowProvenance, ...unchanged } = upgraded;
  assert.equal(workflow, "greenfield");
  assert.deepEqual(unchanged, original);
  assert.equal(workflowProvenance.type, "greenfield-init");
  assert.equal(workflowProvenance.origin, "legacy-lock-migration");
  assert.match(workflowProvenance.legacyBaseCommit, /^3ae3d3cb/);

  const updated = runCliProcess(projectRoot, ["update"]);
  assert.equal(updated.status, 0, updated.stderr || updated.stdout);
});
