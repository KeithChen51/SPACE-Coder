import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = resolve(SCRIPT_DIR, "..");
const MANAGE_SCRIPT = join(SCRIPT_DIR, "manage-visual-system.mjs");
const VERIFY_SCRIPT = join(SCRIPT_DIR, "verify-project.mjs");
const ACCEPTANCE_SCRIPT = join(SCRIPT_DIR, "product-acceptance.mjs");
const workspaces = [];

async function exists(path) {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function importFresh(path) {
  return import(`${pathToFileURL(path).href}?test=${Date.now()}-${Math.random()}`);
}

async function makeReactProject() {
  const base = join(resolve(SKILL_ROOT, "../.."), ".tmp");
  await mkdir(base, { recursive: true });
  const project = await mkdtemp(join(base, "final-verification-"));
  workspaces.push(project);
  await mkdir(join(project, "src"), { recursive: true });
  await writeFile(join(project, "package.json"), `${JSON.stringify({
    name: "acceptance-fixture",
    private: true,
    dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" },
  }, null, 2)}\n`, "utf8");
  await writeFile(
    join(project, "src/VehicleSelector.tsx"),
    'export function VehicleSelector() { return <select aria-label="车辆" />; }\n',
    "utf8",
  );
  return project;
}

async function startFixtureServer() {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`<!doctype html><html><body>
      <main><label>车辆<select aria-label="车辆"><option value="car-a">车辆 A</option><option value="car-b">车辆 B</option></select></label></main>
    </body></html>`);
  });
  await new Promise((accept, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", accept);
  });
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((accept) => server.close(accept)),
  };
}

test.afterEach(async () => {
  while (workspaces.length > 0) await rm(workspaces.pop(), { recursive: true, force: true });
});

test("focus-ring shadow token is never assigned to outline", async () => {
  const runtimeStyles = await readFile(join(SKILL_ROOT, "templates/react-runtime/src/styles.css"), "utf8");
  const catalogStyles = await readFile(join(SKILL_ROOT, "templates/component-library.css"), "utf8");
  const adoptionAdapters = await readFile(join(SKILL_ROOT, "scripts/adoption/component-adapters.mjs"), "utf8");
  assert.doesNotMatch(runtimeStyles, /outline\s*:\s*var\(--focus-ring\)/);
  assert.doesNotMatch(catalogStyles, /outline\s*:\s*var\(--focus-ring\)/);
  assert.doesNotMatch(adoptionAdapters, /outline\s*:\s*var\(--focus-ring\)/);
  assert.match(runtimeStyles, /:focus-visible[^{}]*\{[^{}]*box-shadow\s*:\s*var\(--focus-ring\)/s);
});

test("Composition Kit template exposes the executable acceptance contract", async () => {
  const pageTemplates = await readFile(join(SKILL_ROOT, "references/page-templates.md"), "utf8");
  assert.match(pageTemplates, /- Acceptance commitments:/);
  for (const field of ["source", "requirement", "required", "implementationStatus", "codeRefs", "scenarioIds", "waiver"]) {
    assert.match(pageTemplates, new RegExp(`\\b${field}\\b`), `Composition Kit 缺少 ${field}`);
  }
  assert.match(pageTemplates, /checks\/product-commitments\.json/);
  assert.match(pageTemplates, /checks\/product-acceptance\.config\.mjs/);
  assert.match(pageTemplates, /审查结论一旦进入实现，必须补回 Acceptance commitments/);
});

test("React scaffold includes a mandatory one-click final verification gate", async () => {
  const project = await makeReactProject();
  const generated = spawnSync(process.execPath, [MANAGE_SCRIPT, "init", "--target", project], { encoding: "utf8" });
  assert.equal(generated.status, 0, generated.stdout || generated.stderr);
  const output = join(project, "design-system");

  for (const path of [
    "checks/verify-project.mjs",
    "checks/product-acceptance.mjs",
    "checks/product-acceptance.config.mjs",
    "checks/product-commitments.json",
    "runtime/react/src/SearchableSelect.tsx",
    "runtime/react/src/CheckboxField.tsx",
    "runtime/react/src/Tooltip.tsx",
    "runtime/react/src/ActionMenu.tsx",
    "runtime/react/src/InlineNotice.tsx",
  ]) assert.equal(await exists(join(output, path)), true, `脚手架缺少 ${path}`);

  const packageJson = JSON.parse(await readFile(join(output, "package.json"), "utf8"));
  assert.equal(packageJson.dependencies["react-aria-components"], "1.19.0");
  assert.equal(packageJson.scripts.verify, "node checks/verify-project.mjs final");
  assert.equal(packageJson.scripts["verify:system"], "node checks/verify-project.mjs system");
  assert.equal(packageJson.scripts["verify:product"], "node checks/verify-project.mjs product");
  assert.equal(packageJson.scripts["product:acceptance"], "node checks/product-acceptance.mjs test --config checks/product-acceptance.config.mjs --project-root ..");

  const systemConfig = JSON.parse(await readFile(join(output, "system.config.json"), "utf8"));
  assert.equal(systemConfig.checks.productAcceptance, "checks/product-acceptance.config.mjs");
  assert.equal(systemConfig.checks.productCommitments, "checks/product-commitments.json");
  assert.equal(systemConfig.checks.finalVerification, "checks/verify-project.mjs");

  const manifest = JSON.parse(await readFile(join(output, "components/manifest.json"), "utf8"));
  assert.equal(manifest.runtime.generated, 23);
  assert.equal(manifest.families.find((family) => family.id === "searchable-select").availability, "runtime-ready");
});

test("final verification cannot omit UI contract or executable product acceptance", async () => {
  assert.equal(await exists(VERIFY_SCRIPT), true, "缺少最终验收编排器");
  const { verificationPlan } = await importFresh(VERIFY_SCRIPT);
  const packageJson = JSON.parse(await readFile(join(SKILL_ROOT, "templates/design-system-package.json"), "utf8"));
  const ids = verificationPlan(packageJson, "final").map((step) => step.id);
  assert.ok(ids.includes("ui:check"));
  assert.ok(ids.includes("product:acceptance"));
  assert.equal(ids.at(-1), "product:acceptance");

  const withoutUiCheck = structuredClone(packageJson);
  delete withoutUiCheck.scripts["ui:check"];
  assert.throws(() => verificationPlan(withoutUiCheck, "final"), /ui:check/);

  const kitPackage = structuredClone(packageJson);
  kitPackage.name = "design-consultant-kit";
  delete kitPackage.scripts["catalog:build"];
  delete kitPackage.scripts["catalog:check"];
  delete kitPackage.scripts["visual:test"];
  const kitIds = verificationPlan(kitPackage, "final").map((step) => step.id);
  assert.ok(kitIds.includes("components:test"));
  assert.ok(kitIds.includes("visualization:check"));
  assert.ok(kitIds.includes("product:acceptance"));
  assert.ok(!kitIds.includes("catalog:check"));
  assert.ok(!kitIds.includes("visual:test"));
});

test("product acceptance fails closed when Composition Kit commitments lack scenarios", async () => {
  assert.equal(await exists(ACCEPTANCE_SCRIPT), true, "缺少产品验收运行器");
  const { validateAcceptanceDefinition } = await importFresh(ACCEPTANCE_SCRIPT);
  const empty = {
    schemaVersion: 2,
    project: "acceptance-fixture",
    baseUrl: null,
    startCommand: null,
    commitmentContract: { schemaVersion: 2, commitments: [] },
    scenarios: [],
  };
  assert.throws(() => validateAcceptanceDefinition(empty, { requireExecutable: true }), /至少.*一条.*承诺/);

  const scenario = {
    id: "keyboard-selection",
    title: "键盘切换车辆",
    route: "/maintenance",
    viewport: { width: 1280, height: 800 },
    run: async () => {},
  };
  const configured = {
    ...empty,
    baseUrl: "http://127.0.0.1:4173",
    commitmentContract: {
      schemaVersion: 2,
      commitments: [{
        id: "composition-keyboard-selection",
        source: "Composition Kit / Interaction",
        requirement: "车辆选择支持完整键盘路径",
        required: true,
        implementationStatus: "implemented",
        codeRefs: [{ path: "src/VehicleSelector.tsx", anchor: "VehicleSelector" }],
        scenarioIds: [scenario.id],
        waiver: null,
      }],
    },
    scenarios: [scenario],
  };
  const validated = validateAcceptanceDefinition(configured, { requireExecutable: true });
  assert.equal(validated.status, "configured");
  assert.deepEqual(validated.commitments[0].scenarioIds, [scenario.id]);

  configured.commitmentContract.commitments[0].scenarioIds = ["missing-scenario"];
  assert.throws(() => validateAcceptanceDefinition(configured, { requireExecutable: true }), /missing-scenario/);

  configured.commitmentContract.commitments[0].scenarioIds = [scenario.id];
  configured.commitmentContract.commitments[0].implementationStatus = "planned";
  assert.throws(() => validateAcceptanceDefinition(configured, { requireExecutable: true }), /planned/);
});

test("product acceptance verifies commitment code locations inside the project root", async () => {
  const project = await makeReactProject();
  const { validateAcceptanceDefinition, validateCommitmentCodeReferences } = await importFresh(ACCEPTANCE_SCRIPT);
  const scenario = {
    id: "keyboard-selection",
    title: "键盘切换车辆",
    route: "/maintenance",
    viewport: { width: 1280, height: 800 },
    run: async () => {},
  };
  const definition = {
    schemaVersion: 2,
    project: "acceptance-fixture",
    baseUrl: "http://127.0.0.1:4173",
    startCommand: null,
    commitmentContract: {
      schemaVersion: 2,
      commitments: [{
        id: "composition-keyboard-selection",
        source: "Composition Kit / Interaction",
        requirement: "车辆选择支持完整键盘路径",
        required: true,
        implementationStatus: "implemented",
        codeRefs: [{ path: "src/VehicleSelector.tsx", anchor: "VehicleSelector" }],
        scenarioIds: [scenario.id],
        waiver: null,
      }],
    },
    scenarios: [scenario],
  };
  const validated = validateAcceptanceDefinition(definition, { requireExecutable: true });
  await validateCommitmentCodeReferences(validated.commitments, { projectRoot: project });

  validated.commitments[0].codeRefs[0].anchor = "MissingVehicleSelector";
  await assert.rejects(
    validateCommitmentCodeReferences(validated.commitments, { projectRoot: project }),
    /MissingVehicleSelector/,
  );
});

test("product acceptance loads a project scenario and executes it in Chromium", async () => {
  const project = await makeReactProject();
  const configPath = join(project, "product-acceptance.config.mjs");
  const outputRoot = join(project, "acceptance-output");
  const server = await startFixtureServer();
  try {
    await writeFile(join(project, "product-commitments.json"), `${JSON.stringify({
      schemaVersion: 2,
      commitments: [{
        id: "composition-keyboard-selection",
        source: "Composition Kit / Interaction",
        requirement: "车辆选择支持完整键盘路径",
        required: true,
        implementationStatus: "implemented",
        codeRefs: [{ path: "src/VehicleSelector.tsx", anchor: "VehicleSelector" }],
        scenarioIds: ["keyboard-selection"],
        waiver: null,
      }],
    }, null, 2)}\n`, "utf8");
    await writeFile(configPath, `import commitmentContract from "./product-commitments.json" with { type: "json" };

export default {
  schemaVersion: 2,
  project: "acceptance-fixture",
  baseUrl: ${JSON.stringify(server.baseUrl)},
  startCommand: null,
  commitmentContract,
  scenarios: [{
    id: "keyboard-selection",
    title: "键盘切换车辆",
    route: "/maintenance",
    viewport: { width: 390, height: 844 },
    async run({ page, assert }) {
      const field = page.getByRole("combobox", { name: "车辆" });
      await field.focus();
      await page.keyboard.press("ArrowDown");
      assert.equal(await field.inputValue(), "car-b");
    },
  }],
};\n`, "utf8");

    const { loadAcceptanceDefinition, runProductAcceptance } = await importFresh(ACCEPTANCE_SCRIPT);
    const loaded = await loadAcceptanceDefinition(configPath, { requireExecutable: true, projectRoot: project });
    assert.equal(loaded.validated.status, "configured");
    const result = await runProductAcceptance(loaded.definition, { outputRoot, projectRoot: project });
    assert.equal(result.ok, true);
    assert.equal(result.commitments[0].verificationStatus, "verified");
    assert.equal(result.report[0].id, "keyboard-selection");
    assert.equal(await exists(join(outputRoot, "keyboard-selection.png")), true);
    assert.equal(await exists(join(outputRoot, "report.json")), true);
  } finally {
    await server.close();
  }
});
