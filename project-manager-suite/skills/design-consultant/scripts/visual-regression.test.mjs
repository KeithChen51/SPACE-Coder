import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { cp, link, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PNG } from "pngjs";
import { chromium } from "playwright";
import test from "node:test";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = resolve(SCRIPT_DIR, "..");
const REPO_ROOT = resolve(SKILL_ROOT, "../..");
const VISUAL_SCRIPT = join(SCRIPT_DIR, "visual-regression.mjs");
const MANAGE_SCRIPT = join(SCRIPT_DIR, "manage-visual-system.mjs");
const TEST_PROJECT_IDENTITY = `dc-project-v1:${createHash("sha256").update("visual-regression-test-project").digest("hex")}`;
const OTHER_PROJECT_IDENTITY = `dc-project-v1:${createHash("sha256").update("other-visual-regression-project").digest("hex")}`;
const CATALOG_PROJECT_IDENTITY = "dc-project-v1:134fce78ef7c6f6b0adfa78ba7561bd400d4a1a4906aa8ed8ad6b5ab9edc4447";
const CATALOG_SCENARIOS = [
  { id: "desktop", viewport: { width: 1440, height: 1000 }, reducedMotion: "no-preference" },
  { id: "narrow", viewport: { width: 1024, height: 900 }, reducedMotion: "no-preference" },
  { id: "mobile", viewport: { width: 390, height: 844 }, reducedMotion: "no-preference" },
  { id: "reduced-motion", viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" },
];
const workspaces = [];
let visualModulePromise;

async function exists(path) {
  try { return (await stat(path)).isFile(); } catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

function sha256(content) {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

async function currentGeneration(baselineRoot) {
  const pointerBytes = await readFile(join(baselineRoot, "current.json"));
  const pointer = JSON.parse(pointerBytes.toString("utf8"));
  const generationRoot = join(baselineRoot, "generations", pointer.generationId);
  const manifestBytes = await readFile(join(generationRoot, "manifest.json"));
  return { pointerBytes, pointer, generationRoot, manifestBytes, manifest: JSON.parse(manifestBytes.toString("utf8")) };
}

async function currentBaselinePath(baselineRoot, id) {
  const current = await currentGeneration(baselineRoot);
  return join(current.generationRoot, `${id}.png`);
}

async function snapshotTree(root) {
  const snapshot = [];
  async function visit(directory, prefix = "") {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        snapshot.push([`${relativePath}/`, null]);
        await visit(path, relativePath);
      } else {
        snapshot.push([relativePath, sha256(await readFile(path))]);
      }
    }
  }
  await visit(root);
  return snapshot.sort(([left], [right]) => left.localeCompare(right));
}

async function visualModule() {
  visualModulePromise ??= import(`${pathToFileURL(VISUAL_SCRIPT).href}?tests=${Date.now()}`);
  return visualModulePromise;
}

async function makeVisualConfig(overrides = {}) {
  const base = join(REPO_ROOT, ".tmp");
  await mkdir(base, { recursive: true });
  const workspace = await mkdtemp(join(base, "adoption-visual-"));
  workspaces.push(workspace);
  const configDir = join(workspace, "design-system/checks");
  await mkdir(configDir, { recursive: true });
  const configPath = join(configDir, "adoption-visual.config.json");
  const config = {
    projectIdentity: TEST_PROJECT_IDENTITY,
    baseUrl: null,
    routes: [],
    baselineDir: "visual-baselines/application-v1",
    outputDir: "visual-output/application-v1",
    threshold: 0.08,
    startCommand: null,
    ...overrides,
  };
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return { workspace, configDir, configPath, config };
}

function route(id, path) {
  return {
    id,
    path,
    viewports: [
      { id: "desktop", width: 1280, height: 800 },
      { id: "mobile", width: 390, height: 844 },
    ],
  };
}

async function startFixtureServer(render) {
  const server = createServer((request, response) => {
    const body = render(request.url || "/");
    response.writeHead(body.status ?? 200, { "Content-Type": body.type ?? "text/html; charset=utf-8", ...(body.headers ?? {}) });
    response.end(body.content ?? "");
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

test("视觉回归声明桌面、窄屏、移动端和减少动效四类基线", async () => {
  const result = spawnSync(process.execPath, [VISUAL_SCRIPT, "inspect"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout || result.stderr);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.scenarios.map((scenario) => scenario.id), ["desktop", "narrow", "mobile", "reduced-motion"]);
  assert.equal(report.scenarios.every((scenario) => scenario.baselineExists), true);
  assert.equal(report.checks.pixelDiff, true);
  assert.equal(report.checks.nonBlankPixels, true);
  assert.equal(report.checks.layoutOverflow, true);
  assert.equal(report.checks.interactions, true);
  assert.equal(report.checks.computedFocusRing, true);
});

test("React 脚手架携带视觉回归脚本和四张版本化基线", async () => {
  const base = join(REPO_ROOT, ".tmp");
  await mkdir(base, { recursive: true });
  const workspace = await mkdtemp(join(base, "visual-scaffold-"));
  workspaces.push(workspace);
  await mkdir(join(workspace, "src"), { recursive: true });
  await writeFile(join(workspace, "package.json"), `${JSON.stringify({ name: "visual-scaffold", private: true, dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" } })}\n`, "utf8");
  const generated = spawnSync(process.execPath, [MANAGE_SCRIPT, "init", "--target", workspace], { encoding: "utf8" });
  assert.equal(generated.status, 0, generated.stdout || generated.stderr);
  const output = join(workspace, "design-system");
  assert.equal(await exists(join(output, "checks/visual-regression.mjs")), true);
  const baselineRoot = join(output, "checks/visual-baselines");
  const current = await currentGeneration(baselineRoot);
  for (const id of ["desktop", "narrow", "mobile", "reduced-motion"]) {
    assert.equal(await exists(join(current.generationRoot, `${id}.png`)), true);
  }
  assert.deepEqual(current.manifest.scenarios.map((scenario) => scenario.id), ["desktop", "narrow", "mobile", "reduced-motion"]);
  const packageJson = JSON.parse(await readFile(join(output, "package.json"), "utf8"));
  assert.equal(packageJson.scripts["visual:test"], "node checks/visual-regression.mjs test");
});

test("application visual status remains unverified when no routes are configured", async () => {
  const { inspectVisualConfig } = await visualModule();
  const { configPath } = await makeVisualConfig();
  const report = await inspectVisualConfig(configPath);
  assert.equal(report.applicationVisualVerification, "not-configured");
  assert.equal(report.projectIdentity, TEST_PROJECT_IDENTITY);
  assert.deepEqual(report.routes, []);
});

test("adoption visual template declares only the strict portable contract", async () => {
  const template = JSON.parse(await readFile(join(SKILL_ROOT, "templates/adoption-visual.config.json"), "utf8"));
  assert.deepEqual(Object.keys(template), ["projectIdentity", "baseUrl", "routes", "baselineDir", "outputDir", "threshold", "startCommand"]);
  assert.match(template.projectIdentity, /^dc-project-v1:[a-f0-9]{64}$/);
  assert.equal(template.baseUrl, null);
  assert.deepEqual(template.routes, []);
  assert.equal(template.startCommand, null);
});

test("inspect, test and update never execute suggestion-only startCommand", async () => {
  const { inspectVisualConfig, runApplicationVisuals } = await visualModule();
  const server = await startFixtureServer(() => ({
    content: "<!doctype html><html><body style='margin:0;background:#f4f8fa'><header style='min-height:40vh;background:#2457d6'></header><main style='min-height:60vh'>configured</main></body></html>",
  }));
  try {
    const { workspace, configPath } = await makeVisualConfig({ baseUrl: server.baseUrl, routes: [route("configured", "/")] });
    const marker = join(workspace, "start-command-ran.txt");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.startCommand = { command: process.execPath, args: ["-e", `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`], cwd: "../..", readyTimeoutMs: 1000 };
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

    await inspectVisualConfig(configPath);
    await runApplicationVisuals("update", configPath);
    await runApplicationVisuals("test", configPath);
    assert.equal(await exists(marker), false);
  } finally {
    await server.close();
  }
});

test("visual config fails closed for unsafe paths, URLs, route ids, viewports and thresholds", async () => {
  const { inspectVisualConfig } = await visualModule();
  const cases = [
    ["extra field", { unexpected: true }],
    ["missing project identity", { projectIdentity: undefined }],
    ["generic project identity placeholder", { projectIdentity: "PROJECT_IDENTITY" }],
    ["uppercase project identity", { projectIdentity: `dc-project-v1:${"A".repeat(64)}` }],
    ["short project identity", { projectIdentity: `dc-project-v1:${"a".repeat(63)}` }],
    ["non-NFC project identity", { projectIdentity: `dc-project-v1:${"a".repeat(63)}e\u0301` }],
    ["Windows baseline", { baselineDir: "C:/screens" }],
    ["backslash output", { outputDir: "visual\\output" }],
    ["traversal baseline", { baselineDir: "../screens" }],
    ["same destinations", { outputDir: "visual-baselines/application-v1" }],
    ["bad base URL", { baseUrl: "file:///tmp/app", routes: [route("home", "/")] }],
    ["credential URL", { baseUrl: "http://user:pass@127.0.0.1", routes: [route("home", "/")] }],
    ["URL path base", { baseUrl: "http://127.0.0.1/app", routes: [route("home", "/")] }],
    ["route traversal", { baseUrl: "http://127.0.0.1", routes: [route("home", "/%2e%2e/secret")] }],
    ["double-encoded control", { baseUrl: "http://127.0.0.1", routes: [route("home", "/app%2500admin")] }],
    ["route backslash", { baseUrl: "http://127.0.0.1", routes: [route("home", "/app\\admin")] }],
    ["extra route field", { baseUrl: "http://127.0.0.1", routes: [{ ...route("home", "/"), label: "Home" }] }],
    ["duplicate route", { baseUrl: "http://127.0.0.1", routes: [route("home", "/"), route("home", "/other")] }],
    ["unsafe route id", { baseUrl: "http://127.0.0.1", routes: [route("Home Page", "/")] }],
    ["missing mobile", { baseUrl: "http://127.0.0.1", routes: [{ ...route("home", "/"), viewports: [{ id: "desktop", width: 1280, height: 800 }] }] }],
    ["duplicate viewport", { baseUrl: "http://127.0.0.1", routes: [{ ...route("home", "/"), viewports: [route("x", "/").viewports[0], route("x", "/").viewports[0]] }] }],
    ["bad viewport width", { baseUrl: "http://127.0.0.1", routes: [{ ...route("home", "/"), viewports: [{ id: "desktop", width: 1, height: 800 }, route("x", "/").viewports[1]] }] }],
    ["extra viewport field", { baseUrl: "http://127.0.0.1", routes: [{ ...route("home", "/"), viewports: [{ ...route("x", "/").viewports[0], scale: 2 }, route("x", "/").viewports[1]] }] }],
    ["NaN threshold", { threshold: "0.08" }],
    ["high threshold", { threshold: 0.5 }],
    ["bad command", { startCommand: { command: "", args: [], cwd: "../..", readyTimeoutMs: 1000 } }],
    ["extra command field", { startCommand: { command: process.execPath, args: [], cwd: "../..", readyTimeoutMs: 1000, shell: true } }],
  ];

  for (const [label, override] of cases) {
    const { configPath } = await makeVisualConfig(override);
    await assert.rejects(() => inspectVisualConfig(configPath), /config|identity|path|url|route|viewport|threshold|command|destination/i, label);
  }

  const { configDir, configPath } = await makeVisualConfig();
  await writeFile(join(configDir, "visual-output"), "not a directory", "utf8");
  await assert.rejects(() => inspectVisualConfig(configPath), /outputDir.*non-directory/i);
});

test("visual destinations reject Windows aliases, reserved names and nesting", async () => {
  const { inspectVisualConfig } = await visualModule();
  const cases = [
    ["trailing dot aliases", { baselineDir: "screens./v1", outputDir: "screens/v1-output" }],
    ["trailing space aliases", { baselineDir: "screens /v1", outputDir: "screens/v1-output" }],
    ["alternate data stream", { baselineDir: "screens/v1:baseline", outputDir: "screens/v1-output" }],
    ["CON device segment", { baselineDir: "CON/v1", outputDir: "screens/v1-output" }],
    ["NUL device segment", { baselineDir: "screens/NUL/v1", outputDir: "screens/v1-output" }],
    ["output nested under baseline", { baselineDir: "screens/v1", outputDir: "screens/v1/output" }],
    ["baseline nested under output", { baselineDir: "screens/v1/baseline", outputDir: "screens/v1" }],
  ];

  for (const [label, overrides] of cases) {
    const { configPath } = await makeVisualConfig(overrides);
    await assert.rejects(() => inspectVisualConfig(configPath), /alias|reserved|device|path|destination|nested/i, label);
  }
});

test("existing destination casing aliases fail closed on Windows", { skip: process.platform !== "win32" }, async () => {
  const { inspectVisualConfig } = await visualModule();
  const { configDir, configPath } = await makeVisualConfig({
    baselineDir: "visual-baselines/application-v1",
    outputDir: "visual-output/application-v1",
  });
  await mkdir(join(configDir, "Visual-Baselines/application-v1"), { recursive: true });
  await assert.rejects(() => inspectVisualConfig(configPath), /canonical|alias|case|casing/i);
});

test("startCommand cwd casing aliases fail closed on Windows", { skip: process.platform !== "win32" }, async () => {
  const { inspectVisualConfig } = await visualModule();
  const { workspace, configPath } = await makeVisualConfig();
  await mkdir(join(workspace, "ServeRoot"));
  const config = JSON.parse(await readFile(configPath, "utf8"));
  config.startCommand = { command: process.execPath, args: [], cwd: "../../serveroot", readyTimeoutMs: 1000 };
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  await assert.rejects(() => inspectVisualConfig(configPath), /canonical|alias|case|casing/i);
});

test("detectable Windows 8.3 destination aliases fail closed", { skip: process.platform !== "win32" }, async (t) => {
  const { inspectVisualConfig } = await visualModule();
  const { configDir, configPath } = await makeVisualConfig();
  const longDirectory = join(configDir, "VeryLongBaselineDirectoryName");
  await mkdir(join(longDirectory, "v1"), { recursive: true });
  const result = spawnSync("cmd.exe", ["/d", "/c", `for %I in ("${longDirectory}") do @echo %~sI`], { encoding: "utf8" });
  const shortName = result.status === 0 ? result.stdout.trim().split(/[\\/]/).at(-1) : "";
  if (!shortName.includes("~")) {
    t.diagnostic("8.3 aliases are disabled or unavailable on this volume");
    return;
  }
  const config = JSON.parse(await readFile(configPath, "utf8"));
  config.baselineDir = `${shortName}/v1`;
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  await assert.rejects(() => inspectVisualConfig(configPath), /canonical|alias|8\.3|casing/i);
});

test("destination junction aliases fail closed", async (t) => {
  const { inspectVisualConfig } = await visualModule();
  const { configDir, configPath } = await makeVisualConfig({ baselineDir: "baseline/v1", outputDir: "output-link" });
  const baselineRoot = join(configDir, "baseline/v1");
  await mkdir(baselineRoot, { recursive: true });
  const linkPath = join(configDir, "output-link");
  try {
    const { symlink } = await import("node:fs/promises");
    await symlink(baselineRoot, linkPath, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOSYS", "UNKNOWN"].includes(error.code)) {
      t.diagnostic(`directory links unavailable on this platform: ${error.code}`);
      return;
    }
    throw error;
  }
  await assert.rejects(() => inspectVisualConfig(configPath), /link|junction|reparse|canonical|alias/i);
});

test("high-entropy pixel analysis is incremental and does not overflow the call stack", async () => {
  const { analyzePixels } = await visualModule();
  const image = new PNG({ width: 1800, height: 1200 });
  for (let index = 0; index < image.width * image.height; index += 1) {
    const offset = index * 4;
    image.data[offset] = index & 255;
    image.data[offset + 1] = (index >>> 8) & 255;
    image.data[offset + 2] = (index >>> 16) & 255;
    image.data[offset + 3] = 255;
  }

  const result = analyzePixels(PNG.sync.write(image));
  assert.ok(result.uniqueColors > 100_000, JSON.stringify(result));
  assert.ok(result.nonBlankRatio > 0.99, JSON.stringify(result));
});

const BASELINE_CONFIG_IDENTITY = sha256("fixture-config-v1");
const BASELINE_SCENARIOS = [
  { id: "first", viewport: { width: 1280, height: 800 } },
  { id: "second", viewport: { width: 390, height: 844 } },
];

async function makeBaselineGenerationFixture() {
  const base = join(REPO_ROOT, ".tmp");
  await mkdir(base, { recursive: true });
  const workspace = await mkdtemp(join(base, "baseline-generation-"));
  workspaces.push(workspace);
  const baselineRoot = join(workspace, "visual-baselines/application-v1");
  await mkdir(baselineRoot, { recursive: true });
  const entries = ["first", "second"].map((id) => ({ id, content: Buffer.from(`new-${id}`) }));
  return { workspace, baselineRoot, entries, scenarios: BASELINE_SCENARIOS, projectIdentity: TEST_PROJECT_IDENTITY, configIdentity: BASELINE_CONFIG_IDENTITY };
}

async function publishCatalogBaseline(baselineRoot) {
  const { publishBaselineGeneration, visualBaselineConfigIdentity } = await visualModule();
  await mkdir(baselineRoot, { recursive: true });
  await publishBaselineGeneration({
    baselineRoot,
    projectIdentity: CATALOG_PROJECT_IDENTITY,
    configIdentity: visualBaselineConfigIdentity({
      projectIdentity: CATALOG_PROJECT_IDENTITY,
      kind: "catalog",
      scenarios: CATALOG_SCENARIOS,
      threshold: 0.08,
    }),
    scenarios: CATALOG_SCENARIOS,
    entries: CATALOG_SCENARIOS.map(({ id }) => ({ id, content: Buffer.from(`catalog-${id}`) })),
  });
  return currentGeneration(baselineRoot);
}

test("immutable baseline publication installs an exact generation then atomically points current at it", async () => {
  const { publishBaselineGeneration, readBaselineGeneration } = await visualModule();
  const fixture = await makeBaselineGenerationFixture();
  await publishBaselineGeneration(fixture);
  const current = await currentGeneration(fixture.baselineRoot);

  assert.deepEqual(Object.keys(current.pointer).sort(), ["generationId", "kind", "manifestSha256", "projectIdentity", "schemaVersion"]);
  assert.equal(current.pointer.schemaVersion, 1);
  assert.equal(current.pointer.kind, "design-consultant-visual-baseline-pointer");
  assert.equal(current.pointer.projectIdentity, fixture.projectIdentity);
  assert.match(current.pointer.generationId, /^[a-f0-9]{32}$/);
  assert.equal(current.pointer.manifestSha256, sha256(current.manifestBytes));
  assert.doesNotMatch(current.pointerBytes.toString("utf8"), /[\r\n]/);
  assert.doesNotMatch(current.manifestBytes.toString("utf8"), /[\r\n]/);
  assert.deepEqual(Object.keys(current.manifest).sort(), ["configIdentity", "generationId", "kind", "projectIdentity", "scenarios", "schemaVersion"]);
  assert.equal(current.manifest.configIdentity, fixture.configIdentity);
  assert.equal(current.manifest.projectIdentity, fixture.projectIdentity);
  assert.equal(current.manifest.generationId, current.pointer.generationId);
  assert.deepEqual(current.manifest.scenarios.map((scenario) => scenario.id), ["first", "second"]);
  assert.deepEqual((await readdir(current.generationRoot)).sort(), ["first.png", "manifest.json", "second.png"]);
  for (const entry of fixture.entries) {
    const record = current.manifest.scenarios.find((scenario) => scenario.id === entry.id);
    assert.deepEqual(Object.keys(record).sort(), ["file", "id", "sha256", "size", "viewport"]);
    assert.equal(record.file, `${entry.id}.png`);
    assert.equal(record.sha256, sha256(entry.content));
    assert.equal(record.size, entry.content.length);
    assert.equal(await exists(join(fixture.baselineRoot, `${entry.id}.png`)), false);
  }
  const snapshot = await readBaselineGeneration({
    baselineRoot: fixture.baselineRoot,
    projectIdentity: fixture.projectIdentity,
    configIdentity: fixture.configIdentity,
    scenarios: fixture.scenarios,
  });
  assert.equal(snapshot.baselines.get("first").content.toString("utf8"), "new-first");
});

test("generation publication revalidates exact bytes, identities, and file sets after hooks before exposing current", async () => {
  const { publishBaselineGeneration } = await visualModule();
  const mutations = {
    png: async (generationRoot) => writeFile(join(generationRoot, "first.png"), Buffer.from("tampered-png")),
    hardlink: async (generationRoot) => {
      await rm(join(generationRoot, "second.png"));
      await link(join(generationRoot, "first.png"), join(generationRoot, "second.png"));
    },
    extra: async (generationRoot) => writeFile(join(generationRoot, "extra.txt"), Buffer.from("unexpected")),
    manifest: async (generationRoot) => writeFile(join(generationRoot, "manifest.json"), Buffer.from("{}")),
    owner: async (generationRoot) => writeFile(join(generationRoot, ".owner.json"), Buffer.from("foreign-owner")),
  };
  for (const phase of ["afterManifestWritten", "beforePointerPublish"]) {
    for (const [mutationName, mutate] of Object.entries(mutations)) {
      const fixture = await makeBaselineGenerationFixture();
      const generationId = "9".repeat(32);
      const generationRoot = join(fixture.baselineRoot, "generations", generationId);
      await assert.rejects(
        () => publishBaselineGeneration({
          ...fixture,
          hooks: {
            generationId: () => generationId,
            [phase]: async (details) => mutate(details.generationRoot ?? generationRoot),
          },
        }),
        /baseline|generation|manifest|owner|hard link|identity|file set|bytes/i,
        `${phase}:${mutationName}`,
      );
      assert.equal(await exists(join(fixture.baselineRoot, "current.json")), false, `${phase}:${mutationName}`);
    }
  }
});

test("baseline identity rejects a complete generation copied from another project with the same scenarios", async () => {
  const { publishBaselineGeneration, readBaselineGeneration, visualBaselineConfigIdentity } = await visualModule();
  const source = await makeBaselineGenerationFixture();
  source.configIdentity = visualBaselineConfigIdentity({
    projectIdentity: source.projectIdentity,
    kind: "application",
    scenarios: source.scenarios,
    threshold: 0.08,
  });
  await publishBaselineGeneration(source);

  const target = await makeBaselineGenerationFixture();
  await rm(target.baselineRoot, { recursive: true });
  await cp(source.baselineRoot, target.baselineRoot, { recursive: true, errorOnExist: true });
  const targetConfigIdentity = visualBaselineConfigIdentity({
    projectIdentity: OTHER_PROJECT_IDENTITY,
    kind: "application",
    scenarios: target.scenarios,
    threshold: 0.08,
  });
  assert.notEqual(targetConfigIdentity, source.configIdentity);
  await assert.rejects(
    () => readBaselineGeneration({
      baselineRoot: target.baselineRoot,
      projectIdentity: OTHER_PROJECT_IDENTITY,
      configIdentity: targetConfigIdentity,
      scenarios: target.scenarios,
    }),
    /project.*identity|identity.*project/i,
  );
});

test("a published baseline namespace rejects every later publish and preserves all published bytes", async () => {
  const { publishBaselineGeneration } = await visualModule();
  const fixture = await makeBaselineGenerationFixture();
  await publishBaselineGeneration(fixture);
  const current = await currentGeneration(fixture.baselineRoot);
  const before = new Map();
  for (const path of [
    join(fixture.baselineRoot, "current.json"),
    join(current.generationRoot, "manifest.json"),
    ...fixture.entries.map((entry) => join(current.generationRoot, `${entry.id}.png`)),
  ]) before.set(path, await readFile(path));

  await assert.rejects(
    () => publishBaselineGeneration({
      ...fixture,
      entries: fixture.entries.map((entry) => ({ ...entry, content: Buffer.from(`replacement-${entry.id}`) })),
    }),
    /already.*published|versioned baselineDir|new.*version/i,
  );
  for (const [path, bytes] of before) assert.deepEqual(await readFile(path), bytes, path);
});

test("forged pointers and partial generations fail closed without rewriting unknown bytes", async () => {
  const { publishBaselineGeneration, readBaselineGeneration } = await visualModule();
  const fixture = await makeBaselineGenerationFixture();
  await publishBaselineGeneration(fixture);
  const pointerPath = join(fixture.baselineRoot, "current.json");
  const validPointer = await readFile(pointerPath);

  const forged = Buffer.from("{not-json\n");
  await writeFile(pointerPath, forged);
  await assert.rejects(
    () => readBaselineGeneration({ baselineRoot: fixture.baselineRoot, projectIdentity: fixture.projectIdentity, configIdentity: fixture.configIdentity, scenarios: fixture.scenarios }),
    /pointer|json|schema/i,
  );
  assert.deepEqual(await readFile(pointerPath), forged);

  const generationId = "f".repeat(32);
  const generationRoot = join(fixture.baselineRoot, "generations", generationId);
  await mkdir(generationRoot);
  const manifest = {
    schemaVersion: 1,
    kind: "design-consultant-visual-baseline-generation",
    generationId,
    projectIdentity: fixture.projectIdentity,
    configIdentity: fixture.configIdentity,
    scenarios: fixture.scenarios.map((scenario, index) => ({
      id: scenario.id,
      viewport: scenario.viewport,
      file: `${scenario.id}.png`,
      sha256: sha256(fixture.entries[index].content),
      size: fixture.entries[index].content.length,
    })),
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(generationRoot, "manifest.json"), manifestBytes);
  const partialPointer = Buffer.from(`${JSON.stringify({
    schemaVersion: 1,
    kind: "design-consultant-visual-baseline-pointer",
    generationId,
    projectIdentity: fixture.projectIdentity,
    manifestSha256: sha256(manifestBytes),
  }, null, 2)}\n`);
  await writeFile(pointerPath, partialPointer);
  await assert.rejects(
    () => readBaselineGeneration({ baselineRoot: fixture.baselineRoot, projectIdentity: fixture.projectIdentity, configIdentity: fixture.configIdentity, scenarios: fixture.scenarios }),
    /missing|generation|baseline|file|set/i,
  );
  assert.deepEqual(await readFile(pointerPath), partialPointer);
  assert.notDeepEqual(partialPointer, validPointer);
});

test("generation id collisions preserve pre-existing directories, files and links", async (t) => {
  const { publishBaselineGeneration } = await visualModule();
  const generationId = "a".repeat(32);
  for (const kind of ["empty-directory", "nonempty-directory", "file"]) {
    const fixture = await makeBaselineGenerationFixture();
    const generationsRoot = join(fixture.baselineRoot, "generations");
    const collision = join(generationsRoot, generationId);
    await mkdir(generationsRoot);
    const sentinel = Buffer.from(`unknown-${kind}-owner\n`);
    if (kind === "empty-directory") await mkdir(collision);
    if (kind === "nonempty-directory") {
      await mkdir(collision);
      await writeFile(join(collision, "sentinel.txt"), sentinel);
    }
    if (kind === "file") await writeFile(collision, sentinel);
    await assert.rejects(
      () => publishBaselineGeneration({ ...fixture, hooks: { generationId: () => generationId } }),
      /exist|collision|generation/i,
      kind,
    );
    if (kind === "empty-directory") assert.deepEqual(await readdir(collision), []);
    if (kind === "nonempty-directory") assert.deepEqual(await readFile(join(collision, "sentinel.txt")), sentinel);
    if (kind === "file") assert.deepEqual(await readFile(collision), sentinel);
    assert.equal(await exists(join(fixture.baselineRoot, "current.json")), false);
  }

  for (const linkKind of process.platform === "win32" ? ["file", "junction"] : ["file", "dir"]) {
    const fixture = await makeBaselineGenerationFixture();
    const generationsRoot = join(fixture.baselineRoot, "generations");
    const collision = join(generationsRoot, generationId);
    const external = linkKind === "file" ? join(fixture.workspace, "external-generation-file") : join(fixture.workspace, "external-generation-directory");
    const sentinel = Buffer.from(`unknown-${linkKind}-link-owner\n`);
    await mkdir(generationsRoot);
    if (linkKind === "file") await writeFile(external, sentinel);
    else {
      await mkdir(external);
      await writeFile(join(external, "sentinel.txt"), sentinel);
    }
    try {
      const { symlink } = await import("node:fs/promises");
      await symlink(external, collision, linkKind);
    } catch (error) {
      if (["EPERM", "EACCES", "ENOSYS", "UNKNOWN"].includes(error.code)) {
        t.diagnostic(`${linkKind} generation links unavailable: ${error.code}`);
        continue;
      }
      throw error;
    }
    await assert.rejects(
      () => publishBaselineGeneration({ ...fixture, hooks: { generationId: () => generationId } }),
      /exist|collision|generation/i,
      linkKind,
    );
    if (linkKind === "file") assert.deepEqual(await readFile(external), sentinel);
    else assert.deepEqual(await readFile(join(external, "sentinel.txt")), sentinel);
    assert.equal(await exists(join(fixture.baselineRoot, "current.json")), false);
  }
});

test("an unrelated unreferenced generation blocks first publication instead of being ignored", async () => {
  const { publishBaselineGeneration } = await visualModule();
  const fixture = await makeBaselineGenerationFixture();
  const unknownGeneration = join(fixture.baselineRoot, "generations", "d".repeat(32));
  const sentinel = Buffer.from("unknown-unreferenced-generation\n");
  await mkdir(unknownGeneration, { recursive: true });
  await writeFile(join(unknownGeneration, "sentinel.txt"), sentinel);

  await assert.rejects(
    () => publishBaselineGeneration({ ...fixture, hooks: { generationId: () => "e".repeat(32) } }),
    /unknown|unexpected|generation|versioned baselineDir/i,
  );
  assert.deepEqual(await readFile(join(unknownGeneration, "sentinel.txt")), sentinel);
  assert.equal(await exists(join(fixture.baselineRoot, "current.json")), false);
  assert.equal(await exists(join(fixture.baselineRoot, ".visual-update.lock")), false);
});

test("nonce collisions never delete unknown pointer-temp bytes", async () => {
  const { publishBaselineGeneration } = await visualModule();

  const pointerFixture = await makeBaselineGenerationFixture();
  const pointerId = "b".repeat(32);
  const collidingPointerTemp = join(pointerFixture.baselineRoot, `.current-${pointerId}.tmp`);
  const pointerSentinel = Buffer.from("unknown-pointer-temp-owner\n");
  await writeFile(collidingPointerTemp, pointerSentinel);
  await assert.rejects(
    () => publishBaselineGeneration({ ...pointerFixture, hooks: { generationId: () => pointerId } }),
    /exist|collision|pointer|temporary/i,
  );
  assert.deepEqual(await readFile(collidingPointerTemp), pointerSentinel);
  assert.equal(await exists(join(pointerFixture.baselineRoot, "current.json")), false);
});

test("generation reservation writes an exact owner marker before any baseline file", async () => {
  const { publishBaselineGeneration } = await visualModule();
  const fixture = await makeBaselineGenerationFixture();
  const generationId = "c".repeat(32);
  let observedReservation = false;
  const stop = new Error("stop after generation reservation");
  await assert.rejects(
    () => publishBaselineGeneration({
      ...fixture,
      hooks: {
        generationId: () => generationId,
        afterGenerationReserved: async ({ generationRoot, ownerPath, ownerBytes }) => {
          observedReservation = true;
          assert.equal(generationRoot, join(fixture.baselineRoot, "generations", generationId));
          assert.equal(ownerPath, join(generationRoot, ".owner.json"));
          assert.deepEqual(await readFile(ownerPath), ownerBytes);
          assert.deepEqual((await readdir(generationRoot)).sort(), [".owner.json"]);
          throw stop;
        },
      },
    }),
    /stop after generation reservation/i,
  );
  assert.equal(observedReservation, true);
  assert.equal(await exists(join(fixture.baselineRoot, "current.json")), false);
});

test("forged manifests, hard-linked files and linked generation directories fail closed", async (t) => {
  const { publishBaselineGeneration, readBaselineGeneration } = await visualModule();

  const forgedFixture = await makeBaselineGenerationFixture();
  await publishBaselineGeneration(forgedFixture);
  const forgedCurrent = await currentGeneration(forgedFixture.baselineRoot);
  const forgedManifest = { ...forgedCurrent.manifest, untrusted: true };
  const forgedManifestBytes = Buffer.from(`${JSON.stringify(forgedManifest, null, 2)}\n`);
  await writeFile(join(forgedCurrent.generationRoot, "manifest.json"), forgedManifestBytes);
  const forgedPointer = { ...forgedCurrent.pointer, manifestSha256: sha256(forgedManifestBytes) };
  await writeFile(join(forgedFixture.baselineRoot, "current.json"), `${JSON.stringify(forgedPointer, null, 2)}\n`);
  await assert.rejects(
    () => readBaselineGeneration({ baselineRoot: forgedFixture.baselineRoot, projectIdentity: forgedFixture.projectIdentity, configIdentity: forgedFixture.configIdentity, scenarios: forgedFixture.scenarios }),
    /manifest.*schema|exact schema/i,
  );

  const hardlinkFixture = await makeBaselineGenerationFixture();
  await publishBaselineGeneration(hardlinkFixture);
  const hardlinkCurrent = await currentGeneration(hardlinkFixture.baselineRoot);
  await rm(join(hardlinkCurrent.generationRoot, "second.png"));
  await link(join(hardlinkCurrent.generationRoot, "first.png"), join(hardlinkCurrent.generationRoot, "second.png"));
  await assert.rejects(
    () => readBaselineGeneration({ baselineRoot: hardlinkFixture.baselineRoot, projectIdentity: hardlinkFixture.projectIdentity, configIdentity: hardlinkFixture.configIdentity, scenarios: hardlinkFixture.scenarios }),
    /hard link|identity|hash|bytes/i,
  );

  const pointerHardlinkFixture = await makeBaselineGenerationFixture();
  await publishBaselineGeneration(pointerHardlinkFixture);
  await link(
    join(pointerHardlinkFixture.baselineRoot, "current.json"),
    join(pointerHardlinkFixture.baselineRoot, "current-alias.json"),
  );
  await assert.rejects(
    () => readBaselineGeneration({ baselineRoot: pointerHardlinkFixture.baselineRoot, projectIdentity: pointerHardlinkFixture.projectIdentity, configIdentity: pointerHardlinkFixture.configIdentity, scenarios: pointerHardlinkFixture.scenarios }),
    /hard link|identity|alias/i,
  );

  const linkedFixture = await makeBaselineGenerationFixture();
  await publishBaselineGeneration(linkedFixture);
  const linkedCurrent = await currentGeneration(linkedFixture.baselineRoot);
  const external = join(linkedFixture.workspace, "external-generation");
  await mkdir(external);
  for (const name of await readdir(linkedCurrent.generationRoot)) {
    await writeFile(join(external, name), await readFile(join(linkedCurrent.generationRoot, name)));
  }
  await rm(linkedCurrent.generationRoot, { recursive: true });
  try {
    const { symlink } = await import("node:fs/promises");
    await symlink(external, linkedCurrent.generationRoot, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOSYS", "UNKNOWN"].includes(error.code)) {
      t.diagnostic(`generation links unavailable on this platform: ${error.code}`);
      return;
    }
    throw error;
  }
  await assert.rejects(
    () => readBaselineGeneration({ baselineRoot: linkedFixture.baselineRoot, projectIdentity: linkedFixture.projectIdentity, configIdentity: linkedFixture.configIdentity, scenarios: linkedFixture.scenarios }),
    /link|junction|reparse|canonical/i,
  );
});

test("active or stale writer locks are never taken over automatically", async () => {
  const { publishBaselineGeneration } = await visualModule();
  for (const lock of [
    Buffer.from(`${JSON.stringify({ schemaVersion: 1, pid: process.pid, nonce: "a".repeat(32) })}\n`),
    Buffer.from(`${JSON.stringify({ schemaVersion: 1, pid: 2147483647, nonce: "b".repeat(32) })}\n`),
    Buffer.from("unknown-lock-bytes\n"),
  ]) {
    const fixture = await makeBaselineGenerationFixture();
    const lockPath = join(fixture.baselineRoot, ".visual-update.lock");
    await writeFile(lockPath, lock);
    await assert.rejects(() => publishBaselineGeneration(fixture), /lock|manual|review|exists/i);
    assert.deepEqual(await readFile(lockPath), lock);
    assert.equal(await exists(join(fixture.baselineRoot, "current.json")), false);
  }
});

test("the create-exclusive writer lock serializes concurrent publishers", async () => {
  const { publishBaselineGeneration } = await visualModule();
  const fixture = await makeBaselineGenerationFixture();
  let announceLocked;
  let releaseOwner;
  const locked = new Promise((accept) => { announceLocked = accept; });
  const release = new Promise((accept) => { releaseOwner = accept; });
  const owner = publishBaselineGeneration({
    ...fixture,
    hooks: { afterLockAcquired: async () => { announceLocked(); await release; } },
  });
  await locked;
  await assert.rejects(() => publishBaselineGeneration(fixture), /lock|concurrent|manual|exists/i);
  releaseOwner();
  await owner;
  assert.equal((await currentGeneration(fixture.baselineRoot)).manifest.scenarios.length, 2);
});

test("first-publication crashes expose either no pointer or one complete immutable generation", async () => {
  const { publishBaselineGeneration, readBaselineGeneration } = await visualModule();
  const phases = [
    "afterLockAcquired",
    "afterGenerationReserved",
    "afterFilesWritten",
    "afterManifestWritten",
    "afterGenerationInstalled",
    "beforePointerPublish",
    "afterPointerPublished",
  ];
  for (const phase of phases) {
    const fixture = await makeBaselineGenerationFixture();
    const error = new Error(`simulated crash ${phase}`);
    error.simulateCrash = true;
    await assert.rejects(
      () => publishBaselineGeneration({ ...fixture, hooks: { [phase]: () => { throw error; } } }),
      new RegExp(`simulated crash ${phase}`, "i"),
    );
    if (phase === "afterPointerPublished") {
      await readBaselineGeneration({
        baselineRoot: fixture.baselineRoot,
        projectIdentity: fixture.projectIdentity,
        configIdentity: fixture.configIdentity,
        scenarios: fixture.scenarios,
      });
    } else {
      assert.equal(await exists(join(fixture.baselineRoot, "current.json")), false, phase);
    }
    assert.equal(await exists(join(fixture.baselineRoot, ".visual-update.lock")), true, phase);
  }
});

test("pointer changes during immutable reads fail without rewriting the observed bytes", async () => {
  const { publishBaselineGeneration, readBaselineGeneration } = await visualModule();
  const fixture = await makeBaselineGenerationFixture();
  await publishBaselineGeneration(fixture);
  const pointerPath = join(fixture.baselineRoot, "current.json");
  const pointer = JSON.parse(await readFile(pointerPath, "utf8"));
  const concurrentPointer = Buffer.from(JSON.stringify({ ...pointer, projectIdentity: OTHER_PROJECT_IDENTITY }));

  await assert.rejects(
    () => readBaselineGeneration({
      baselineRoot: fixture.baselineRoot,
      projectIdentity: fixture.projectIdentity,
      configIdentity: fixture.configIdentity,
      scenarios: fixture.scenarios,
      hooks: { afterPointerRead: () => writeFile(pointerPath, concurrentPointer) },
    }),
    /pointer.*changed|concurrent/i,
  );
  assert.deepEqual(await readFile(pointerPath), concurrentPointer);
});

test("Catalog update stages all four default scenarios before publishing its versioned baseline", async () => {
  const { runCatalogVisuals } = await visualModule();
  const base = join(REPO_ROOT, ".tmp");
  await mkdir(base, { recursive: true });
  const workspace = await mkdtemp(join(base, "catalog-transaction-"));
  workspaces.push(workspace);
  const baselineRoot = join(workspace, "visual-baselines/v1");
  const outputRoot = join(workspace, "visual-output/v1");
  await mkdir(baselineRoot, { recursive: true });

  await assert.rejects(
    () => runCatalogVisuals("update", {
      baselineRoot,
      outputRoot,
      beforeScenario: ({ index }) => { if (index === 3) throw new Error("injected final Catalog failure"); },
    }),
    /injected final Catalog failure/i,
  );
  assert.equal(await exists(join(baselineRoot, "current.json")), false);
});

test("published Catalog update preflight leaves output absent and never launches Playwright", async () => {
  const { runCatalogVisuals } = await visualModule();
  const base = join(REPO_ROOT, ".tmp");
  await mkdir(base, { recursive: true });
  const workspace = await mkdtemp(join(base, "catalog-preflight-"));
  workspaces.push(workspace);
  const baselineRoot = join(workspace, "visual-baselines/v1");
  const outputRoot = join(workspace, "visual-output/v1");
  await mkdir(baselineRoot, { recursive: true });
  await writeFile(join(baselineRoot, "current.json"), Buffer.from("published-pointer-sentinel"));
  const before = await snapshotTree(workspace);
  let browserLaunched = false;
  let scenarioStarted = false;
  await assert.rejects(
    () => runCatalogVisuals("update", {
      baselineRoot,
      outputRoot,
      browserType: { launch: async () => { browserLaunched = true; throw new Error("browser must not launch"); } },
      beforeScenario: () => { scenarioStarted = true; },
    }),
    /already.*published|versioned baselineDir|new.*version/i,
  );
  assert.equal(browserLaunched, false);
  assert.equal(scenarioStarted, false);
  assert.deepEqual(await snapshotTree(workspace), before);
});

test("Catalog test validates its published baseline before creating output or launching Playwright", async () => {
  const { runCatalogVisuals } = await visualModule();
  const base = join(REPO_ROOT, ".tmp");
  await mkdir(base, { recursive: true });
  const workspace = await mkdtemp(join(base, "catalog-test-preflight-"));
  workspaces.push(workspace);
  const baselineRoot = join(workspace, "visual-baselines/v1");
  const outputRoot = join(workspace, "visual-output/v1");
  await mkdir(baselineRoot, { recursive: true });
  await writeFile(join(baselineRoot, "current.json"), "{malformed", "utf8");
  const before = await snapshotTree(workspace);
  let browserLaunched = false;

  await assert.rejects(
    () => runCatalogVisuals("test", {
      baselineRoot,
      outputRoot,
      browserType: { launch: async () => { browserLaunched = true; throw new Error("browser must not launch"); } },
    }),
    /pointer.*invalid|invalid JSON/i,
  );

  assert.equal(browserLaunched, false);
  assert.deepEqual(await snapshotTree(workspace), before);
});

test("joint update validates the complete Catalog baseline and empty application namespace before either runner", async () => {
  const { runVisualCommand } = await visualModule();
  let requestCount = 0;
  const server = await startFixtureServer(() => {
    requestCount += 1;
    return { content: "<!doctype html><html><body>must not be requested</body></html>" };
  });
  try {
    const corruptions = [
      ["missing current", async () => {}],
      ["malformed current", async (baselineRoot) => {
        await mkdir(baselineRoot, { recursive: true });
        await writeFile(join(baselineRoot, "current.json"), "{malformed", "utf8");
      }],
      ["linked current", async (baselineRoot) => {
        await publishCatalogBaseline(baselineRoot);
        const currentPath = join(baselineRoot, "current.json");
        const sourcePath = join(baselineRoot, "linked-current-source.json");
        await writeFile(sourcePath, await readFile(currentPath));
        await rm(currentPath);
        await link(sourcePath, currentPath);
      }],
      ["baseline hash drift", async (baselineRoot) => {
        const current = await publishCatalogBaseline(baselineRoot);
        await writeFile(join(current.generationRoot, "desktop.png"), "drifted-catalog-bytes", "utf8");
      }],
    ];

    for (const [label, corrupt] of corruptions) {
      const { workspace, configPath } = await makeVisualConfig({ baseUrl: server.baseUrl, routes: [route("home", "/")] });
      const baselineRoot = join(workspace, "catalog-baseline-v1");
      const outputRoot = join(workspace, "catalog-output-v1");
      await corrupt(baselineRoot);
      const before = await snapshotTree(workspace);
      let catalogCalled = false;
      let applicationCalled = false;

      await assert.rejects(
        () => runVisualCommand("update", {
          configPath,
          catalogOptions: { baselineRoot, outputRoot },
          catalogRunner: async () => { catalogCalled = true; },
          applicationRunner: async () => { applicationCalled = true; },
        }),
        /baseline|pointer|hash|immutable|missing|hard link|alias/i,
        label,
      );

      assert.equal(catalogCalled, false, label);
      assert.equal(applicationCalled, false, label);
      assert.equal(requestCount, 0, label);
      assert.deepEqual(await snapshotTree(workspace), before, label);
    }
  } finally {
    await server.close();
  }
});

test("joint update enters both runners only after valid Catalog and application preflights", async () => {
  const { runVisualCommand } = await visualModule();
  const { workspace, configPath } = await makeVisualConfig({ baseUrl: "http://127.0.0.1:65534", routes: [route("home", "/")] });
  const baselineRoot = join(workspace, "catalog-baseline-v1");
  const outputRoot = join(workspace, "catalog-output-v1");
  await publishCatalogBaseline(baselineRoot);
  const calls = [];

  const result = await runVisualCommand("update", {
    configPath,
    catalogOptions: { baselineRoot, outputRoot },
    catalogRunner: async (mode) => { calls.push(["catalog", mode]); return ["catalog-ok"]; },
    applicationRunner: async (mode) => {
      calls.push(["application", mode]);
      return { applicationVisualVerification: "baseline-updated", report: [], startCommandExecuted: false };
    },
  });

  assert.deepEqual(calls, [["catalog", "test"], ["application", "update"]]);
  assert.deepEqual(result.catalogReport, ["catalog-ok"]);
});

test("published application update preflight is globally read-only before Catalog, output, browser, or baseUrl access", async () => {
  const { publishBaselineGeneration, runApplicationVisuals, runVisualCommand, visualBaselineConfigIdentity } = await visualModule();
  let requestCount = 0;
  const server = await startFixtureServer(() => {
    requestCount += 1;
    return { content: "<!doctype html><html><body>must not be requested</body></html>" };
  });
  try {
    const configuredRoute = route("home", "/");
    const { workspace, configPath, configDir } = await makeVisualConfig({ baseUrl: server.baseUrl, routes: [configuredRoute] });
    const catalogBaselineRoot = join(workspace, "catalog-baseline-v1");
    const catalogOutputRoot = join(workspace, "catalog-output-v1");
    await publishCatalogBaseline(catalogBaselineRoot);
    const scenarios = configuredRoute.viewports.map((viewport) => ({ id: `home-${viewport.id}`, routePath: "/", viewport }));
    const baselineRoot = join(configDir, "visual-baselines/application-v1");
    await mkdir(baselineRoot, { recursive: true });
    await publishBaselineGeneration({
      baselineRoot,
      projectIdentity: TEST_PROJECT_IDENTITY,
      configIdentity: visualBaselineConfigIdentity({ projectIdentity: TEST_PROJECT_IDENTITY, kind: "application", scenarios, threshold: 0.08 }),
      scenarios,
      entries: scenarios.map(({ id }) => ({ id, content: Buffer.from(`published-${id}`) })),
    });
    const before = await snapshotTree(workspace);
    let catalogCalled = false;
    let applicationCalled = false;
    await assert.rejects(
      () => runVisualCommand("update", {
        configPath,
        catalogOptions: { baselineRoot: catalogBaselineRoot, outputRoot: catalogOutputRoot },
        catalogRunner: async () => { catalogCalled = true; },
        applicationRunner: async () => { applicationCalled = true; },
      }),
      /already.*published|versioned baselineDir|new.*version/i,
    );
    assert.equal(catalogCalled, false);
    assert.equal(applicationCalled, false);
    assert.equal(requestCount, 0);
    assert.deepEqual(await snapshotTree(workspace), before);

    let browserLaunched = false;
    await assert.rejects(
      () => runApplicationVisuals("update", configPath, {
        browserType: { launch: async () => { browserLaunched = true; throw new Error("browser must not launch"); } },
      }),
      /already.*published|versioned baselineDir|new.*version/i,
    );
    assert.equal(browserLaunched, false);
    assert.equal(requestCount, 0);
    assert.deepEqual(await snapshotTree(workspace), before);
  } finally {
    await server.close();
  }
});

test("configured routes require baselines and pass desktop/mobile pixel, overflow and threshold checks", async () => {
  const { runApplicationVisuals } = await visualModule();
  let color = "#2457d6";
  const server = await startFixtureServer((url) => ({
    content: `<!doctype html><html><style>html,body{margin:0;overflow-x:hidden;background:#f4f8fa;color:#173042;font-family:Arial,sans-serif}header{min-height:22vh;padding:32px;background:${color};color:white}main{min-height:78vh;padding:32px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.panel{min-height:180px;padding:24px;background:white;border:1px solid #b9cbd4}.panel:nth-child(2){background:#dfecef}button{background:${color};color:white;padding:12px 18px;border:0}@media(max-width:600px){main{grid-template-columns:1fr}}</style><header><h1>${url}</h1><p>Existing visual system fixture</p></header><main><section class="panel"><h2>Revenue</h2><button>Save</button></section><section class="panel"><h2>Activity</h2><p>Updated moments ago</p></section></main></html>`,
  }));
  try {
    const { configPath, configDir } = await makeVisualConfig({ baseUrl: server.baseUrl, routes: [route("home", "/"), route("details", "/details")] });
    await assert.rejects(() => runApplicationVisuals("test", configPath), /missing baseline/i);
    await assert.rejects(() => stat(join(configDir, "visual-baselines/application-v1")), { code: "ENOENT" });

    const updated = await runApplicationVisuals("update", configPath);
    assert.equal(updated.applicationVisualVerification, "baseline-updated");
    assert.equal(updated.report.length, 4);
    const baselineRoot = join(configDir, "visual-baselines/application-v1");
    const current = await currentGeneration(baselineRoot);
    for (const id of ["home-desktop", "home-mobile", "details-desktop", "details-mobile"]) {
      assert.equal(await exists(join(current.generationRoot, `${id}.png`)), true, id);
    }

    let secondUpdateLaunchedBrowser = false;
    const publishedPointer = await readFile(join(baselineRoot, "current.json"));
    await assert.rejects(
      () => runApplicationVisuals("update", configPath, {
        browserType: { launch: async () => { secondUpdateLaunchedBrowser = true; throw new Error("browser must not launch for a published baseline namespace"); } },
      }),
      /already.*published|versioned baselineDir|new.*version/i,
    );
    assert.equal(secondUpdateLaunchedBrowser, false);
    assert.deepEqual(await readFile(join(baselineRoot, "current.json")), publishedPointer);

    const pointerBeforeTest = await readFile(join(baselineRoot, "current.json"));
    const passed = await runApplicationVisuals("test", configPath);
    assert.equal(passed.applicationVisualVerification, "passed");
    assert.equal(passed.report.every((entry) => entry.horizontalOverflow <= 1 && entry.nonBlankRatio >= 0.015), true);
    assert.deepEqual(await readFile(join(baselineRoot, "current.json")), pointerBeforeTest);

    const baselineBytes = new Map();
    for (const id of ["home-desktop", "home-mobile", "details-desktop", "details-mobile"]) {
      baselineBytes.set(id, await readFile(join(current.generationRoot, `${id}.png`)));
    }
    const pointerBytes = await readFile(join(baselineRoot, "current.json"));
    color = "#c93f34";
    await assert.rejects(() => runApplicationVisuals("test", configPath), /visual mismatch/i);
    assert.deepEqual(await readFile(join(baselineRoot, "current.json")), pointerBytes);
    for (const [id, bytes] of baselineBytes) {
      assert.deepEqual(await readFile(join(current.generationRoot, `${id}.png`)), bytes, id);
    }
  } finally {
    await server.close();
  }
});

test("blank, overflowing and browser-error routes fail before publishing a baseline", async () => {
  const { runApplicationVisuals } = await visualModule();
  const server = await startFixtureServer((url) => {
    if (url === "/blank") return { content: "<!doctype html><html><body style='margin:0;background:white'></body></html>" };
    if (url === "/overflow") return { content: "<!doctype html><html><body><div style='width:140vw;height:500px;background:#2457d6'>wide</div></body></html>" };
    return { content: "<!doctype html><html><body><main style='min-height:100vh;background:#f4f8fa'><h1>Broken</h1><script>throw new Error('fixture boom')</script></main></body></html>" };
  });
  try {
    for (const [id, pattern] of [["blank", /blank/i], ["overflow", /overflow/i], ["error", /browser errors|fixture boom/i]]) {
      const { configPath, configDir } = await makeVisualConfig({ baseUrl: server.baseUrl, routes: [route(id, `/${id}`)] });
      await assert.rejects(() => runApplicationVisuals("update", configPath), pattern, id);
      assert.equal(await exists(join(configDir, "visual-baselines/application-v1/current.json")), false, id);
    }
  } finally {
    await server.close();
  }
});

test("a later invalid scenario leaves the new versioned baseline namespace unpublished", async () => {
  const { runApplicationVisuals } = await visualModule();
  const server = await startFixtureServer((url) => ({
    content: url.startsWith("/bad")
      ? "<!doctype html><html><body style='margin:0;background:white'></body></html>"
      : "<!doctype html><html><body style='margin:0;background:#f4f8fa'><header style='min-height:35vh;padding:40px;background:#2457d6;color:white'><h1>Valid first route</h1></header><main style='min-height:65vh;padding:40px'><section style='min-height:180px;background:white;border:2px solid #9fb4c4'><button>Continue</button></section></main></body></html>",
  }));
  try {
    const { configDir, configPath } = await makeVisualConfig({ baseUrl: server.baseUrl, routes: [route("good", "/good"), route("bad", "/bad")] });
    const baselineRoot = join(configDir, "visual-baselines/application-v1");
    await assert.rejects(() => runApplicationVisuals("update", configPath), /blank/i);
    assert.equal(await exists(join(baselineRoot, "current.json")), false);
  } finally {
    await server.close();
  }
});

test("scenario output and baseline hard links are rejected before either file is changed", async () => {
  const { runApplicationVisuals } = await visualModule();
  const server = await startFixtureServer(() => ({
    content: "<!doctype html><html><body style='margin:0;background:#f4f8fa'><header style='min-height:40vh;padding:40px;background:#2457d6;color:white'><h1>Alias fixture</h1></header><main style='min-height:60vh;padding:40px'><section style='height:180px;background:white;border:2px solid #9fb4c4'>Content</section></main></body></html>",
  }));
  try {
    const { configDir, configPath } = await makeVisualConfig({ baseUrl: server.baseUrl, routes: [route("alias", "/alias")] });
    await runApplicationVisuals("update", configPath);
    const baselineRoot = join(configDir, "visual-baselines/application-v1");
    const baseline = await currentBaselinePath(baselineRoot, "alias-desktop");
    const output = join(configDir, "visual-output/application-v1/alias-desktop.png");
    const original = await readFile(baseline);
    await rm(output);
    await link(baseline, output);

    await assert.rejects(() => runApplicationVisuals("test", configPath), /alias|identity|same file|hard link/i);
    await assert.rejects(
      () => runApplicationVisuals("update", configPath),
      /alias|identity|same file|hard link|already.*published|versioned baselineDir|new.*version/i,
    );
    assert.deepEqual(await readFile(baseline), original);
  } finally {
    await server.close();
  }
});

test("application visual update rejects cross-origin, cross-route, query and hash redirects", async () => {
  const { runApplicationVisuals } = await visualModule();
  const foreign = await startFixtureServer(() => ({ content: "<!doctype html><main style='min-height:100vh;background:#2457d6'>Foreign</main>" }));
  const server = await startFixtureServer((url) => {
    if (url.startsWith("/cross-origin")) return { status: 302, headers: { Location: `${foreign.baseUrl}/landing` } };
    if (url.startsWith("/cross-route")) return { status: 302, headers: { Location: "/login" } };
    if (url.startsWith("/query")) return { status: 302, headers: { Location: "/query?session=1" } };
    if (url.startsWith("/hash")) return { content: "<!doctype html><main style='min-height:100vh;background:#2457d6'>Hash<script>location.hash='login'</script></main>" };
    return { content: "<!doctype html><main style='min-height:100vh;background:#2457d6'>Login</main>" };
  });
  try {
    for (const id of ["cross-origin", "cross-route", "query", "hash"]) {
      const { configDir, configPath } = await makeVisualConfig({ baseUrl: server.baseUrl, routes: [route(id, `/${id}`)] });
      await assert.rejects(() => runApplicationVisuals("update", configPath), /redirect|final.*url|origin|route|path|query|hash/i, id);
      await assert.rejects(() => stat(join(configDir, "visual-baselines/application-v1/current.json")), { code: "ENOENT" });
    }
  } finally {
    await server.close();
    await foreign.close();
  }
});

test("startCommand is suggestion-only and allow-start-command is unknown to CLI and API", async () => {
  const { inspectVisualConfig, runApplicationVisuals } = await visualModule();
  const external = await startFixtureServer(() => ({
    content: "<!doctype html><html><body style='margin:0;background:#f4f8fa'><header style='min-height:40vh;background:#2457d6'></header><main style='min-height:60vh'>External owner</main></body></html>",
  }));
  try {
    const { workspace, configPath } = await makeVisualConfig({ baseUrl: external.baseUrl, routes: [route("manual", "/")] });
    const marker = join(workspace, "start-command-ran.txt");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.startCommand = {
      command: process.execPath,
      args: ["-e", `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`],
      cwd: "../..",
      readyTimeoutMs: 1000,
    };
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

    const inspected = await inspectVisualConfig(configPath);
    assert.equal(inspected.startCommandConfigured, true);
    assert.equal(inspected.startCommandExecutable, false);
    assert.equal(inspected.startCommandPolicy, "manual-external-service-only");

    await runApplicationVisuals("update", configPath);
    await runApplicationVisuals("test", configPath);
    for (const mode of ["test", "update"]) {
      await assert.rejects(
        () => runApplicationVisuals(mode, configPath, { allowStartCommand: true }),
        /unknown.*api.*allowStartCommand|allowStartCommand.*unknown/i,
        mode,
      );
    }

    const inspectCli = spawnSync(process.execPath, [VISUAL_SCRIPT, "inspect", "--config", configPath, "--allow-start-command"], { encoding: "utf8" });
    assert.notEqual(inspectCli.status, 0, inspectCli.stdout || inspectCli.stderr);
    assert.match(inspectCli.stderr, /unknown option.*--allow-start-command/i);
    for (const mode of ["test", "update"]) {
      const result = spawnSync(process.execPath, [VISUAL_SCRIPT, mode, "--config", configPath, "--allow-start-command"], { encoding: "utf8" });
      assert.notEqual(result.status, 0, mode);
      assert.match(result.stderr, /unknown option.*--allow-start-command/i, mode);
    }

    assert.equal(await exists(marker), false);
    assert.equal((await fetch(external.baseUrl)).status, 200);
  } finally {
    await external.close();
  }
});
