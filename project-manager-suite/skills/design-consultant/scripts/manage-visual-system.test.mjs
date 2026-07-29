import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { run as runManageVisualSystem } from "./manage-visual-system.mjs";

const SCRIPT_PATH = join(dirname(fileURLToPath(import.meta.url)), "manage-visual-system.mjs");
const SCRIPT_DIR = dirname(SCRIPT_PATH);
const SKILL_ROOT = resolve(SCRIPT_DIR, "..");
const EVALS_PATH = resolve(SKILL_ROOT, "../../evals/design-consultant/evals.json");
const SYNC_LIEFLAT_PATH = join(SCRIPT_DIR, "sync-lieflat-module.mjs");
const CHECK_VISUALIZATION_PATH = join(SCRIPT_DIR, "check-visualization-module.mjs");
const TEXT_CONTENT_PATH = join(SCRIPT_DIR, "text-content.mjs");
const workspaces = [];

async function makeProject(name = "visual-system-fixture") {
  const workspace = await mkdtemp(join(tmpdir(), "design-consultant-"));
  workspaces.push(workspace);
  const project = join(workspace, name);
  await mkdir(project, { recursive: true });
  return project;
}

function runCliProcess(project, args) {
  return spawnSync(
    process.execPath,
    [SCRIPT_PATH, ...args, "--target", project],
    { encoding: "utf8" },
  );
}

function runCli(project, args) {
  const result = runCliProcess(project, args);
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `脚手架退出码：${result.status}`);
  }
  return JSON.parse(result.stdout);
}

function digest(content) {
  return createHash("sha256").update(content).digest("hex");
}

async function collectFiles(root) {
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolutePath);
      else if (entry.isFile()) files.push(absolutePath);
    }
  }
  await walk(root);
  return files;
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function evaluateLieflatTheme(source, search = "?palette=coral&theme=light") {
  const documentElement = {
    dataset: {},
    style: { setProperty() {} },
  };
  const window = { location: { search } };
  runInNewContext(source, {
    window,
    document: { documentElement },
    URLSearchParams,
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    Element: class Element {},
    Document: class Document {},
    MutationObserver: class MutationObserver {},
  });
  return window.DC_LIEFLAT_THEME;
}

function applyLieflatEChartsTheme(source, option, search = "?palette=coral&theme=light") {
  let appliedOption;
  const documentElement = {
    dataset: {},
    style: { setProperty() {} },
  };
  const window = {
    location: { search },
    echarts: {
      init() {
        return {
          setOption(nextOption) {
            appliedOption = nextOption;
          },
        };
      },
    },
  };
  runInNewContext(source, {
    window,
    document: { documentElement, body: null },
    URLSearchParams,
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    Element: class Element {},
    Document: class Document {},
    MutationObserver: class MutationObserver {},
  });
  window.DC_LIEFLAT_THEME.installAdapters();
  window.echarts.init({ closest: () => null }).setOption(option);
  return appliedOption;
}

test("journaled writes roll back mixed create and update mutations byte-for-byte", async () => {
  const project = await makeProject("transaction-rollback");
  runCli(project, ["init"]);
  const output = join(project, "design-system");
  const designPath = join(output, "DESIGN.md");
  const missingPath = join(output, "agent-rules.md");
  const staleDesign = "# managed stale design\n";
  await writeFile(designPath, staleDesign, "utf8");
  await rm(missingPath);
  const lockPath = join(output, ".design-consultant-lock.json");
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  lock.files["DESIGN.md"].generatedHash = digest(staleDesign);
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
  const before = Object.fromEntries(await Promise.all((await collectFiles(output)).map(async (path) => [
    relative(output, path).replaceAll("\\", "/"),
    (await readFile(path)).toString("base64"),
  ])));
  let committed = 0;

  await assert.rejects(
    () => runManageVisualSystem({
      command: "update",
      target: project,
      output: "design-system",
      mode: null,
      projectName: null,
      dryRun: false,
    }, {
      afterCommit() {
        committed += 1;
        if (committed === 2) throw new Error("injected mid-commit failure");
      },
    }),
    /injected mid-commit failure/,
  );

  const after = Object.fromEntries(await Promise.all((await collectFiles(output)).map(async (path) => [
    relative(output, path).replaceAll("\\", "/"),
    (await readFile(path)).toString("base64"),
  ])));
  assert.deepEqual(after, before);
  assert.equal(await readFile(designPath, "utf8"), staleDesign);
  assert.equal(await exists(missingPath), false);
  assert.equal((await readdir(project)).some((name) => name.startsWith(".design-consultant-transaction-")), false);
  assert.equal((await readdir(output)).some((name) => /transaction|backup|staged/i.test(name)), false);
});

test("atomic final install failure leaves old bytes intact and rolls back prior commits", async () => {
  const project = await makeProject("transaction-install-failure");
  runCli(project, ["init"]);
  const output = join(project, "design-system");
  const designPath = join(output, "DESIGN.md");
  const createPath = join(output, "agent-rules.md");
  const lockPath = join(output, ".design-consultant-lock.json");
  const staleDesign = "# stale before atomic install\n";
  await writeFile(designPath, staleDesign, "utf8");
  await rm(createPath);
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  lock.files["DESIGN.md"].generatedHash = digest(staleDesign);
  const lockBefore = `${JSON.stringify(lock, null, 2)}\n`;
  await writeFile(lockPath, lockBefore, "utf8");
  let installs = 0;

  await assert.rejects(() => runManageVisualSystem({
    command: "update", target: project, output: "design-system", mode: null, projectName: null, dryRun: false,
  }, {
    beforeInstall() {
      installs += 1;
      if (installs === 2) throw new Error("injected atomic rename failure");
    },
  }), /atomic rename failure/);

  assert.equal(await readFile(designPath, "utf8"), staleDesign);
  assert.equal(await exists(createPath), false);
  assert.equal(await readFile(lockPath, "utf8"), lockBefore);
  assert.equal((await readdir(project)).some((name) => name.startsWith(".design-consultant-transaction-")), false);
});

test("the next run recovers an orphaned multi-file transaction before continuing", async () => {
  const project = await makeProject("transaction-crash-recovery");
  runCli(project, ["init"]);
  const output = join(project, "design-system");
  const designPath = join(output, "DESIGN.md");
  const createPath = join(output, "agent-rules.md");
  const staleDesign = "# stale before crash\n";
  await writeFile(designPath, staleDesign, "utf8");
  await rm(createPath);
  const lockPath = join(output, ".design-consultant-lock.json");
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  lock.files["DESIGN.md"].generatedHash = digest(staleDesign);
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
  let committed = 0;

  await assert.rejects(() => runManageVisualSystem({
    command: "update", target: project, output: "design-system", mode: null, projectName: null, dryRun: false,
  }, {
    crashAfterCommit() {
      committed += 1;
      if (committed === 2) throw new Error("simulated process crash");
    },
  }), /simulated process crash/);
  assert.equal((await readdir(project)).some((name) => name.startsWith(".design-consultant-transaction-")), true);

  const recovered = await runManageVisualSystem({
    command: "update", target: project, output: "design-system", mode: null, projectName: null, dryRun: false,
  });
  assert.equal(recovered.ok, true);
  assert.equal((await readdir(project)).some((name) => name.startsWith(".design-consultant-transaction-")), false);
});

test("orphan recovery preserves post-crash user bytes and retains diagnostics", async () => {
  const project = await makeProject("transaction-crash-conflict");
  runCli(project, ["init"]);
  const output = join(project, "design-system");
  const designPath = join(output, "DESIGN.md");
  const staleDesign = "# stale before crash conflict\n";
  const userDesign = "# user bytes after crash\n";
  await writeFile(designPath, staleDesign, "utf8");
  const lockPath = join(output, ".design-consultant-lock.json");
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  lock.files["DESIGN.md"].generatedHash = digest(staleDesign);
  const lockBefore = `${JSON.stringify(lock, null, 2)}\n`;
  await writeFile(lockPath, lockBefore, "utf8");

  await assert.rejects(() => runManageVisualSystem({
    command: "update", target: project, output: "design-system", mode: null, projectName: null, dryRun: false,
  }, {
    crashAfterCommit({ destination }) {
      if (destination === "DESIGN.md") throw new Error("simulated process crash with later user edit");
    },
  }), /simulated process crash/);
  await writeFile(designPath, userDesign, "utf8");

  await assert.rejects(() => runManageVisualSystem({
    command: "update", target: project, output: "design-system", mode: null, projectName: null, dryRun: false,
  }), /recovery.*conflict|preserved.*user|diagnostic/i);
  assert.equal(await readFile(designPath, "utf8"), userDesign);
  assert.equal(await readFile(lockPath, "utf8"), lockBefore);
  assert.equal((await readdir(project)).some((name) => name.startsWith(".design-consultant-transaction-")), true);
});

test("transaction preserves a target that drifts immediately before commit", async () => {
  const project = await makeProject("transaction-concurrent-drift");
  runCli(project, ["init"]);
  const output = join(project, "design-system");
  const designPath = join(output, "DESIGN.md");
  const createPath = join(output, "agent-rules.md");
  const driftPath = join(output, "tokens/tokens.css");
  const lockPath = join(output, ".design-consultant-lock.json");
  const staleDesign = "# stale managed design\n";
  const staleTokens = ":root { --stale: 1; }\n";
  const externalTokens = ":root { --external-user-change: 1; }\n";
  await writeFile(designPath, staleDesign, "utf8");
  await writeFile(driftPath, staleTokens, "utf8");
  await rm(createPath);
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  lock.files["DESIGN.md"].generatedHash = digest(staleDesign);
  lock.files["tokens/tokens.css"].generatedHash = digest(staleTokens);
  const lockBefore = `${JSON.stringify(lock, null, 2)}\n`;
  await writeFile(lockPath, lockBefore, "utf8");
  const committed = [];

  await assert.rejects(
    () => runManageVisualSystem({
      command: "update",
      target: project,
      output: "design-system",
      mode: null,
      projectName: null,
      dryRun: false,
    }, {
      async beforeCommit({ destination }) {
        if (destination === "tokens/tokens.css") await writeFile(driftPath, externalTokens, "utf8");
      },
      afterCommit({ destination }) {
        committed.push(destination);
      },
    }),
    /changed|drift|expected hash|rollback/i,
  );

  assert.ok(committed.includes("DESIGN.md"));
  assert.ok(committed.includes("agent-rules.md"));
  assert.equal(await readFile(designPath, "utf8"), staleDesign);
  assert.equal(await exists(createPath), false);
  assert.equal(await readFile(driftPath, "utf8"), externalTokens);
  assert.equal(await readFile(lockPath, "utf8"), lockBefore);
  assert.equal((await readdir(project)).some((name) => name.startsWith(".design-consultant-transaction-")), false);
  assert.equal((await readdir(output)).some((name) => /transaction|journal|backup|staged/i.test(name)), false);
});

test("rollback never overwrites concurrent content written after a transaction commit", async () => {
  const project = await makeProject("transaction-rollback-drift");
  runCli(project, ["init"]);
  const output = join(project, "design-system");
  const designPath = join(output, "DESIGN.md");
  const lockPath = join(output, ".design-consultant-lock.json");
  const staleDesign = "# stale before transaction\n";
  const externalDesign = "# concurrent user content\n";
  await writeFile(designPath, staleDesign, "utf8");
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  lock.files["DESIGN.md"].generatedHash = digest(staleDesign);
  const lockBefore = `${JSON.stringify(lock, null, 2)}\n`;
  await writeFile(lockPath, lockBefore, "utf8");

  await assert.rejects(
    () => runManageVisualSystem({
      command: "update",
      target: project,
      output: "design-system",
      mode: null,
      projectName: null,
      dryRun: false,
    }, {
      async afterCommit({ destination }) {
        if (destination === "DESIGN.md") {
          await writeFile(designPath, externalDesign, "utf8");
          throw new Error("injected post-commit user drift");
        }
      },
    }),
    /rollback was incomplete|preserved concurrent user content/i,
  );

  assert.equal(await readFile(designPath, "utf8"), externalDesign);
  assert.equal(await readFile(lockPath, "utf8"), lockBefore);
  assert.equal((await readdir(project)).some((name) => name.startsWith(".design-consultant-transaction-")), true);
});

test("staged orphan recovery never mutates an update target changed after the crash", async () => {
  const project = await makeProject("transaction-staged-update");
  runCli(project, ["init"]);
  const output = join(project, "design-system");
  const designPath = join(output, "DESIGN.md");
  const staleDesign = "# staged update old bytes\n";
  await writeFile(designPath, staleDesign, "utf8");
  const lockPath = join(output, ".design-consultant-lock.json");
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  lock.files["DESIGN.md"].generatedHash = digest(staleDesign);
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");

  await assert.rejects(() => runManageVisualSystem({
    command: "update", target: project, output: "design-system", mode: null, projectName: null, dryRun: false,
  }, {
    crashAtPhase({ destination, phase }) {
      if (destination === "DESIGN.md" && phase === "staged") throw new Error("crash after staged update");
    },
  }), /crash after staged update/);
  await rm(designPath);

  await runManageVisualSystem({
    command: "update", target: project, output: "design-system", mode: null, projectName: null, dryRun: true,
  });
  assert.equal(await exists(designPath), false, "recovery must not reconstruct a staged update target");
  assert.equal((await readdir(project)).some((name) => name.startsWith(".design-consultant-transaction-")), false);
});

test("staged orphan recovery never deletes a user-created target matching planned bytes", async () => {
  const project = await makeProject("transaction-staged-create");
  runCli(project, ["init"]);
  const output = join(project, "design-system");
  const createPath = join(output, "agent-rules.md");
  const plannedBytes = await readFile(createPath, "utf8");
  await rm(createPath);

  await assert.rejects(() => runManageVisualSystem({
    command: "update", target: project, output: "design-system", mode: null, projectName: null, dryRun: false,
  }, {
    crashAtPhase({ destination, phase }) {
      if (destination === "agent-rules.md" && phase === "staged") throw new Error("crash after staged create");
    },
  }), /crash after staged create/);
  await writeFile(createPath, plannedBytes, "utf8");

  await runManageVisualSystem({
    command: "update", target: project, output: "design-system", mode: null, projectName: null, dryRun: true,
  });
  assert.equal(await readFile(createPath, "utf8"), plannedBytes);
  assert.equal((await readdir(project)).some((name) => name.startsWith(".design-consultant-transaction-")), false);
});

test("installing orphan recovery distinguishes pre-install and post-install target states", async () => {
  for (const action of ["update", "create"]) {
    for (const installed of [false, true]) {
      const project = await makeProject(`transaction-installing-${action}-${installed ? "new" : "old"}`);
      runCli(project, ["init"]);
      const output = join(project, "design-system");
      const destination = action === "update" ? "DESIGN.md" : "agent-rules.md";
      const targetPath = join(output, destination);
      const plannedBytes = await readFile(targetPath, "utf8");
      const oldBytes = "# installing old bytes\n";
      if (action === "update") {
        await writeFile(targetPath, oldBytes, "utf8");
        const lockPath = join(output, ".design-consultant-lock.json");
        const lock = JSON.parse(await readFile(lockPath, "utf8"));
        lock.files[destination].generatedHash = digest(oldBytes);
        await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
      } else {
        await rm(targetPath);
      }

      await assert.rejects(() => runManageVisualSystem({
        command: "update", target: project, output: "design-system", mode: null, projectName: null, dryRun: false,
      }, {
        crashAtPhase(event) {
          if (event.destination === destination && event.phase === "installing" && event.installed === installed) {
            throw new Error(`crash while installing ${action} ${installed ? "after" : "before"} rename`);
          }
        },
      }), /crash while installing/);

      if (installed) assert.equal(await readFile(targetPath, "utf8"), plannedBytes);
      else if (action === "update") assert.equal(await readFile(targetPath, "utf8"), oldBytes);
      else assert.equal(await exists(targetPath), false);

      await runManageVisualSystem({
        command: "update", target: project, output: "design-system", mode: null, projectName: null, dryRun: true,
      });
      if (action === "update") assert.equal(await readFile(targetPath, "utf8"), oldBytes);
      else assert.equal(await exists(targetPath), false);
      assert.equal((await readdir(project)).some((name) => name.startsWith(".design-consultant-transaction-")), false);
    }
  }
});

test("fully committed orphan transactions are verified and cleaned without rollback", async () => {
  const project = await makeProject("transaction-committed-cleanup");
  runCli(project, ["init"]);
  const output = join(project, "design-system");
  const designPath = join(output, "DESIGN.md");
  const generatedDesign = await readFile(designPath, "utf8");
  const staleDesign = "# committed cleanup stale bytes\n";
  await writeFile(designPath, staleDesign, "utf8");
  const lockPath = join(output, ".design-consultant-lock.json");
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  lock.files["DESIGN.md"].generatedHash = digest(staleDesign);
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");

  await assert.rejects(() => runManageVisualSystem({
    command: "update", target: project, output: "design-system", mode: null, projectName: null, dryRun: false,
  }, {
    crashAtPhase({ phase }) {
      if (phase === "transaction-committed") throw new Error("crash after transaction commit");
    },
  }), /crash after transaction commit/);
  assert.equal(await readFile(designPath, "utf8"), generatedDesign);

  await runManageVisualSystem({
    command: "update", target: project, output: "design-system", mode: null, projectName: null, dryRun: true,
  });
  assert.equal(await readFile(designPath, "utf8"), generatedDesign);
  assert.equal((await readdir(project)).some((name) => name.startsWith(".design-consultant-transaction-")), false);
});

test.afterEach(async () => {
  while (workspaces.length > 0) {
    await rm(workspaces.pop(), { recursive: true, force: true });
  }
});

test("Skill 触发描述与 eval 覆盖未显式提及设计系统的前端入口", async () => {
  const skill = await readFile(join(SKILL_ROOT, "SKILL.md"), "utf8");
  const frontmatter = skill.match(/^---\s*\n([\s\S]*?)\n---/);
  assert.ok(frontmatter, "SKILL.md 应包含 frontmatter");
  assert.match(frontmatter[1], /entering frontend design or UI implementation/);
  assert.match(frontmatter[1], /project-local visual system/);

  const evaluation = JSON.parse(await readFile(EVALS_PATH, "utf8"));
  const implicitBootstrap = evaluation.evals.find((item) => item.id === "E20-implicit-ui-bootstrap");
  assert.ok(implicitBootstrap, "应包含隐式前端启动 eval");
  assert.doesNotMatch(implicitBootstrap.prompt, /设计系统|视觉系统|design-system/i);
  assert.match(implicitBootstrap.expected_output, /init --dry-run/);
});

test("Lieflat 派生层与 48 个 preset 保持同步", () => {
  const syncResult = spawnSync(process.execPath, [SYNC_LIEFLAT_PATH, "--check"], { encoding: "utf8" });
  assert.equal(syncResult.status, 0, syncResult.stdout || syncResult.stderr);
  const syncOutput = JSON.parse(syncResult.stdout);
  assert.equal(syncOutput.presets, 48);
  assert.equal(syncOutput.galleries, 6);

  const checkResult = spawnSync(process.execPath, [CHECK_VISUALIZATION_PATH], { encoding: "utf8" });
  assert.equal(checkResult.status, 0, checkResult.stdout || checkResult.stderr);
  const checkOutput = JSON.parse(checkResult.stdout);
  assert.equal(checkOutput.summary.presets, 48);
  assert.equal(checkOutput.summary.galleries, 6);
  assert.equal(checkOutput.summary.editorialColors, 38);
});

test("Lieflat 文本比较不受 Windows 换行符影响", async () => {
  const { normalizeTextContent, sameTextContent } = await import(pathToFileURL(TEXT_CONTENT_PATH));
  assert.equal(normalizeTextContent("alpha\r\nbeta\rgamma\n"), "alpha\nbeta\ngamma\n");
  assert.equal(sameTextContent("alpha\r\nbeta\r\n", "alpha\nbeta\n"), true);
});

test("dry-run 输出完整计划且不写入目录", async () => {
  const project = await makeProject();
  const result = runCli(project, ["init", "--mode", "default", "--dry-run"]);

  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.ok(result.summary.create >= 10);
  assert.equal(await exists(join(project, "design-system")), false);
});

test("update dry-run 分类 create、update、preserve、conflict 且不写入", async () => {
  const project = await makeProject();
  runCli(project, ["init"]);
  const output = join(project, "design-system");

  const designPath = join(output, "DESIGN.md");
  const stalePath = join(output, "tokens/tokens.css");
  const createPath = join(output, "catalog/component-preview.css");
  const conflictPath = join(output, "catalog/component-preview.html");
  const lockPath = join(output, ".design-consultant-lock.json");
  await appendFile(designPath, "\n用户维护的 dry-run 决策。\n", "utf8");

  const staleContent = "/* v0.5 generated token output */\n";
  await writeFile(stalePath, staleContent, "utf8");
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  lock.files["tokens/tokens.css"].generatedHash = digest(staleContent);
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");

  await rm(createPath);
  await rm(conflictPath);
  await mkdir(conflictPath);

  const designBefore = await readFile(designPath, "utf8");
  const lockBefore = await readFile(lockPath, "utf8");
  const result = runCliProcess(project, ["update", "--dry-run"]);
  assert.equal(result.status, 2, result.stdout || result.stderr);
  const plan = JSON.parse(result.stdout);

  assert.equal(plan.ok, false);
  for (const action of ["create", "update", "preserve", "conflict"]) {
    assert.ok(plan.summary[action] > 0, `dry-run 应列出 ${action}`);
  }
  assert.equal(plan.actions.find((item) => item.path === "DESIGN.md").action, "preserve");
  assert.equal(plan.actions.find((item) => item.path === "tokens/tokens.css").action, "update");
  assert.equal(plan.actions.find((item) => item.path === "catalog/component-preview.css").action, "create");
  assert.equal(plan.actions.find((item) => item.path === "catalog/component-preview.html").action, "conflict");
  assert.equal(await readFile(designPath, "utf8"), designBefore);
  assert.equal(await readFile(stalePath, "utf8"), staleContent);
  assert.equal(await readFile(lockPath, "utf8"), lockBefore);
  assert.equal(await exists(createPath), false);
  assert.equal((await stat(conflictPath)).isDirectory(), true);
});

test("init 创建标准目录并可幂等重复执行", async () => {
  const project = await makeProject("订单工作台");
  const first = runCli(project, ["init", "--mode", "customize"]);
  const output = join(project, "design-system");

  assert.equal(first.ok, true);
  for (const relativePath of [
    "README.md",
    "DESIGN.md",
    "system.config.json",
    "tokens/tokens.json",
    "tokens/tokens.css",
    "tokens/tokens.ts",
    "tokens/tokens.schema.json",
    "visualizations/manifest.json",
    "visualizations/lieflat/lieflat-theme.js",
    "visualizations/lieflat/mono-tokens.js",
    "visualizations/lieflat/lupi-gallery.html",
    "visualizations/lieflat/basics-gallery.html",
    "visualizations/lieflat/glance-gallery.html",
    "visualizations/lieflat/big-circular.html",
    "visualizations/lieflat/big-force.html",
    "visualizations/lieflat/big-threads.html",
    "visualizations/lieflat/runtime/RUNTIME.json",
    "visualizations/lieflat/runtime/chart.umd.min.js",
    "visualizations/lieflat/runtime/echarts.min.js",
    "visualizations/lieflat/UPSTREAM.json",
    "components/manifest.json",
    "components/decisions.json",
    "catalog/catalog-foundation.css",
    "catalog/component-library.css",
    "catalog/component-library.js",
    "catalog/component-preview.css",
    "catalog/component-library.html",
    "catalog/component-preview.html",
    "checks/check-css-vars.ps1",
    "checks/sync-tokens.mjs",
    "checks/check-visualization-module.mjs",
    "checks/check-ui-contract.mjs",
    "runtime/react/src/styles.css",
    "agent-rules.md",
    ".design-consultant-lock.json",
  ]) {
    assert.equal(await exists(join(output, relativePath)), true, `${relativePath} 应存在`);
  }

  const config = JSON.parse(await readFile(join(output, "system.config.json"), "utf8"));
  assert.equal(config.project.name, "订单工作台");
  assert.equal(config.mode, "customize");
  assert.equal(config.visualBaseline.palette, "harbor-blue");
  assert.deepEqual(config.visualBaseline.paletteOptions, ["harbor-blue", "coral-office"]);
  assert.equal(config.visualBaseline.colorMode, "light");
  assert.deepEqual(config.visualBaseline.colorModes, ["light", "dark"]);
  assert.equal(config.visualBaseline.navigationTone, "light");
  assert.deepEqual(config.visualBaseline.navigationVariants, ["light", "inverse"]);
  const componentPreview = await readFile(join(output, "catalog/component-library.html"), "utf8");
  assert.match(componentPreview, /href="\.\.\/tokens\/tokens\.css"/);
  assert.match(componentPreview, /href="component-library\.css"/);
  assert.match(componentPreview, /href="\.\.\/runtime\/react\/src\/styles\.css"/);
  assert.match(componentPreview, /id="catalogRoot"/);
  assert.match(componentPreview, /src="component-library\.js"/);
  const componentBundle = await readFile(join(output, "catalog/component-library.js"), "utf8");
  assert.match(componentBundle, /visualizationSubmenu/);
  assert.match(componentBundle, /SelectField/);
  assert.match(componentBundle, /SearchableSelect/);
  assert.match(componentBundle, /MultiSelectField/);
  assert.match(componentBundle, /MetricCard/);
  for (const label of ["可直接使用", "规划与适配", "按场景提供", "外部适配"]) {
    assert.match(componentBundle, new RegExp(label));
  }
  assert.match(componentBundle, /Visualization Tone \/ Structure/);
  assert.match(componentBundle, /--viz-grid/);
  assert.match(componentBundle, /lupi-gallery\.html/);
  assert.match(componentBundle, /big-threads\.html/);
  assert.doesNotMatch(componentPreview, /\sstyle=/);
  assert.equal(config.sourceOfTruth.visualizationCatalog, "catalog/component-library.html#visualization/lupi");
  const pagePreview = await readFile(join(output, "catalog/component-preview.html"), "utf8");
  assert.match(pagePreview, /href="component-preview\.css"/);
  assert.doesNotMatch(pagePreview, /<style>/);
  const lupiGallery = await readFile(join(output, "visualizations/lieflat/lupi-gallery.html"), "utf8");
  assert.match(lupiGallery, /href="\.\.\/\.\.\/tokens\/tokens\.css"/);
  assert.match(lupiGallery, /src="lieflat-theme\.js"/);
  assert.match(lupiGallery, /DC_LIEFLAT_THEME\.installAdapters/);
  const glanceGallery = await readFile(join(output, "visualizations/lieflat/glance-gallery.html"), "utf8");
  assert.match(glanceGallery, /src="runtime\/chart\.umd\.min\.js"/);
  assert.doesNotMatch(glanceGallery, /cdn\.jsdelivr/);
  const visualizationTokens = await readFile(join(output, "tokens/tokens.css"), "utf8");
  for (const token of [
    "--viz-accent-strong",
    "--viz-accent-mid",
    "--viz-accent-soft",
    "--viz-accent-subtle",
    "--viz-accent-area",
    "--viz-accent-on-dark-area",
    "--viz-grid",
    "--viz-reference",
  ]) {
    assert.match(visualizationTokens, new RegExp(`${token}:`));
  }
  const generatedTokens = JSON.parse(await readFile(join(output, "tokens/tokens.json"), "utf8"));
  const coralLight = generatedTokens.themes.variants["coral-light"].tokens;
  const coralDark = generatedTokens.themes.variants["coral-dark"].tokens;
  assert.equal(coralLight["color.secondary"], "#4F6F58");
  assert.equal(coralLight["color.secondarySoft"], "#E8F0EA");
  assert.equal(coralLight["color.info"], "#74506B");
  assert.equal(coralLight["color.infoSoft"], "#F4EDF2");
  assert.equal(coralDark["color.secondary"], "#9FC4A7");
  assert.equal(coralDark["color.secondarySoft"], "#293A2E");
  assert.equal(coralDark["color.info"], "#D3A9C8");
  assert.equal(coralDark["color.infoSoft"], "#3E2F3B");
  assert.match(componentBundle, /Coral \/ Sage \/ Plum/);
  assert.doesNotMatch(componentBundle, /coral-secondary[^\n]*#2563EB/);
  const visualizationTheme = await readFile(join(output, "visualizations/lieflat/lieflat-theme.js"), "utf8");
  for (const adapter of ["normalDataRamp", "inverseDataRamp", "mapMarkColor", "mapLineColor", "mapSvgDataColor", "areaColor"]) {
    assert.match(visualizationTheme, new RegExp(adapter));
  }
  for (const search of ["?palette=coral&theme=light", "?palette=coral&theme=dark"]) {
    const runtimeTheme = evaluateLieflatTheme(visualizationTheme, search);
    const darkMode = search.includes("theme=dark");
    assert.equal(runtimeTheme.ladder.length, 6, `${search} 应提供完整六阶数据色阶`);
    assert.equal(runtimeTheme.ladder[0], darkMode ? runtimeTheme.accentOnDarkStrong : runtimeTheme.accentStrong);
    assert.equal(runtimeTheme.ladder[5], darkMode ? runtimeTheme.accentOnDarkSubtle : runtimeTheme.accentSubtle);
    assert.ok(!runtimeTheme.ladder.includes(darkMode ? runtimeTheme.accentOnDarkArea : runtimeTheme.accentArea));
    assert.equal(runtimeTheme.ladderCompact.length, 5);
    assert.equal(runtimeTheme.ladderCompact[4], runtimeTheme.ladder[5]);
    const defaultColorOption = applyLieflatEChartsTheme(visualizationTheme, {
      series: [{ type: "line", data: [1, 2, 3] }],
    }, search);
    assert.deepEqual(Array.from(defaultColorOption.color), Array.from(runtimeTheme.ladder));
  }
  const visualizationManifest = JSON.parse(await readFile(join(output, "visualizations/manifest.json"), "utf8"));
  assert.equal(visualizationManifest.version, "0.7.0");
  assert.equal(visualizationManifest.paletteContract.rolePolicy.dataMarks.strategy, "single-root-tonal-ramp");
  assert.equal(visualizationManifest.paletteContract.rolePolicy.areaFill.strategy, "flat-tonal-fill");
  assert.equal(visualizationManifest.paletteContract.rolePolicy.structure.strategy, "neutral-only");
  assert.match(visualizationManifest.paletteContract.runtimeInjectionRule, /ECharts option\.color/);
  assert.deepEqual(visualizationManifest.paletteContract.rolePolicy.structure.tokens, ["--viz-grid", "--viz-reference"]);
  const tokenCheck = spawnSync(
    process.execPath,
    [join(output, "checks/sync-tokens.mjs"), "--check"],
    { encoding: "utf8" },
  );
  assert.equal(tokenCheck.status, 0, tokenCheck.stdout || tokenCheck.stderr);
  const tokenCheckOutput = JSON.parse(tokenCheck.stdout);
  assert.ok(tokenCheckOutput.themeContrast["harbor-dark"]["text/bg"] >= 4.5);
  assert.ok(tokenCheckOutput.themeContrast["coral-light"]["text/bg"] >= 4.5);
  assert.ok(tokenCheckOutput.themeContrast["coral-dark"]["text/bg"] >= 4.5);
  assert.equal(tokenCheckOutput.validation.manifestReferences.unresolved.length, 0);
  const componentManifest = JSON.parse(await readFile(join(output, "components/manifest.json"), "utf8"));
  assert.equal(componentManifest.schema_version, "0.4");
  assert.equal(componentManifest.families.length, 27);
  assert.equal(componentManifest.runtime, undefined);
  assert.equal(componentManifest.families.find((family) => family.id === "button").status, "contract");
  assert.equal(componentManifest.families.find((family) => family.id === "button").implementationPath, undefined);
  assert.equal(componentManifest.families.find((family) => family.id === "brand-attribution").status, "contract");
  assert.equal(componentManifest.families.find((family) => family.id === "brand-attribution").implementationPath, undefined);
  assert.equal(componentManifest.project_extractions[0].id, "dy-data-admin-controls");
  assert.ok(componentManifest.families.flatMap((family) => family.tokens).every((token) => token.startsWith("--")));
  const visualizationCheck = spawnSync(
    process.execPath,
    [join(output, "checks/check-visualization-module.mjs")],
    { encoding: "utf8" },
  );
  assert.equal(visualizationCheck.status, 0, visualizationCheck.stdout || visualizationCheck.stderr);
  const lockBefore = await readFile(join(output, ".design-consultant-lock.json"), "utf8");

  const second = runCli(project, ["init", "--mode", "customize"]);
  const lockAfter = await readFile(join(output, ".design-consultant-lock.json"), "utf8");
  assert.equal(second.summary.create, 0);
  assert.equal(second.summary.update, 0);
  assert.equal(second.summary.conflict, 0);
  assert.equal(lockAfter, lockBefore);

  const updateWithoutMode = runCli(project, ["update"]);
  assert.equal(updateWithoutMode.mode, "customize");
  assert.equal(updateWithoutMode.summary.update, 0);
});

test("init provenance permits update with pre-existing user-owned markers", async () => {
  const project = await makeProject("user-owned-greenfield-markers");
  const output = join(project, "design-system");
  const userFiles = {
    "DESIGN.md": Buffer.from("# User-owned design contract\r\nDo not rewrite.\r\n", "utf8"),
    "system.config.json": Buffer.from(`${JSON.stringify({ mode: "customize", project: { name: "User-owned display name" } }, null, 2)}\r\n`, "utf8"),
    "tokens/tokens.json": Buffer.from('{\r\n  "userOwned": true\r\n}\r\n', "utf8"),
  };
  await mkdir(join(output, "tokens"), { recursive: true });
  for (const [path, content] of Object.entries(userFiles)) await writeFile(join(output, path), content);

  const initialized = runCli(project, ["init"]);
  const initLock = JSON.parse(await readFile(join(output, ".design-consultant-lock.json"), "utf8"));

  assert.equal(initialized.ok, true);
  assert.deepEqual(initLock.workflowProvenance, {
    schemaVersion: 1,
    type: "greenfield-init",
    skillVersion: "0.10.0",
  });
  for (const [path, content] of Object.entries(userFiles)) {
    assert.deepEqual(await readFile(join(output, path)), content, path);
    assert.equal(initLock.files[path], undefined, `${path} must remain user-owned`);
  }

  await rm(join(output, "README.md"));
  const updated = runCli(project, ["update"]);
  const updateLock = JSON.parse(await readFile(join(output, ".design-consultant-lock.json"), "utf8"));

  assert.deepEqual(updated.created, ["README.md"]);
  assert.equal(updated.updated.includes("DESIGN.md"), false);
  assert.equal(updated.updated.includes("system.config.json"), false);
  assert.equal(updated.updated.includes("tokens/tokens.json"), false);
  assert.deepEqual(updateLock.workflowProvenance, initLock.workflowProvenance);
  for (const [path, content] of Object.entries(userFiles)) {
    assert.deepEqual(await readFile(join(output, path)), content, path);
    assert.equal(updateLock.files[path], undefined, `${path} must remain user-owned after update`);
  }
});

test("init 支持项目内显式输出目录", async () => {
  const project = await makeProject();
  const result = runCli(project, ["init", "--output", "ui/visual-system"]);

  assert.equal(result.outputRoot, join(project, "ui/visual-system"));
  assert.equal(await exists(join(project, "ui/visual-system/DESIGN.md")), true);
  assert.equal(await exists(join(project, "design-system")), false);
});

test("init 生成的 JSON 全部可解析且不残留内部占位符", async () => {
  const project = await makeProject("隐式前端项目");
  runCli(project, ["init", "--mode", "default"]);
  const output = join(project, "design-system");
  const files = await collectFiles(output);
  const placeholderPattern = /\{\{(?:PROJECT_NAME|MODE)\}\}|\[项目名称\]|\[project\] design tokens|__[A-Z0-9_]+_PLACEHOLDER__/;

  assert.ok(files.length >= 35, "应生成完整视觉系统目录");
  for (const file of files) {
    const content = await readFile(file, "utf8");
    const pathFromOutput = relative(output, file);
    assert.doesNotMatch(content, placeholderPattern, `${pathFromOutput} 不应残留内部占位符`);
    if (file.endsWith(".json")) {
      assert.doesNotThrow(() => JSON.parse(content), `${pathFromOutput} 应为有效 JSON`);
    }
  }
});

test("生成后的 CSS 变量与设计契约检查可直接用于项目源码", async (t) => {
  const shell = process.platform === "win32" ? "powershell.exe" : "pwsh";
  const probe = spawnSync(shell, ["-NoProfile", "-Command", "exit 0"], { encoding: "utf8" });
  if (probe.error?.code === "ENOENT") {
    t.skip("当前环境没有 PowerShell，跳过 PowerShell 守门 smoke test");
    return;
  }
  assert.equal(probe.status, 0, probe.stderr);

  const project = await makeProject();
  const sourceRoot = join(project, "src");
  await mkdir(sourceRoot, { recursive: true });
  await writeFile(
    join(sourceRoot, "App.css"),
    ".app { color: var(--text); background: var(--surface); border-color: var(--border); }\n",
    "utf8",
  );
  await writeFile(
    join(sourceRoot, "App.tsx"),
    'export function App() { return <button className="app">保存</button>; }\n',
    "utf8",
  );
  runCli(project, ["init"]);
  const checksRoot = join(project, "design-system/checks");

  const cssVarCheck = spawnSync(
    shell,
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      join(checksRoot, "check-css-vars.ps1"),
      "-Path",
      sourceRoot,
    ],
    { encoding: "utf8" },
  );
  assert.equal(cssVarCheck.status, 0, cssVarCheck.stdout || cssVarCheck.stderr);
  assert.equal(JSON.parse(cssVarCheck.stdout).undefined.length, 0);

  const contractCheck = spawnSync(
    shell,
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      join(checksRoot, "check-design-system-contract.ps1"),
      "-Path",
      sourceRoot,
    ],
    { encoding: "utf8" },
  );
  assert.equal(contractCheck.status, 0, contractCheck.stdout || contractCheck.stderr);
  assert.equal(JSON.parse(contractCheck.stdout).issues.length, 0);
});

test("token 同步器从 JSON 补入新变量并修复 CSS 漂移", async () => {
  const project = await makeProject();
  runCli(project, ["init"]);
  const output = join(project, "design-system");
  const jsonPath = join(output, "tokens/tokens.json");
  const cssPath = join(output, "tokens/tokens.css");
  const syncPath = join(output, "checks/sync-tokens.mjs");
  const tokenDocument = JSON.parse(await readFile(jsonPath, "utf8"));
  tokenDocument.tokens.color.bg.value = "{color.surface}";
  tokenDocument.tokens.test = {
    contractAccent: { value: "#123456", cssVariable: "--test-contract-accent" },
  };
  tokenDocument.taxonomy.semantic.push("test");
  await writeFile(jsonPath, `${JSON.stringify(tokenDocument, null, 2)}\n`, "utf8");

  const writeResult = spawnSync(process.execPath, [syncPath, "build"], { encoding: "utf8" });
  assert.equal(writeResult.status, 0, writeResult.stdout || writeResult.stderr);
  assert.equal(JSON.parse(writeResult.stdout).added, 1);
  assert.match(await readFile(cssPath, "utf8"), /--test-contract-accent:\s*#123456;/);

  await writeFile(
    cssPath,
    (await readFile(cssPath, "utf8")).replace("--test-contract-accent: #123456", "--test-contract-accent: #654321"),
    "utf8",
  );
  const driftCheck = spawnSync(process.execPath, [syncPath, "check"], { encoding: "utf8" });
  assert.notEqual(driftCheck.status, 0);
  const driftArtifact = JSON.parse(driftCheck.stdout).artifacts.find((artifact) => artifact.path === "tokens/tokens.css");
  assert.ok(driftArtifact.diff.some((line) => line.expected?.includes("#123456") && line.actual?.includes("#654321")));

  const repairResult = spawnSync(process.execPath, [syncPath, "build"], { encoding: "utf8" });
  assert.equal(repairResult.status, 0, repairResult.stdout || repairResult.stderr);
  const finalCheck = spawnSync(process.execPath, [syncPath, "check"], { encoding: "utf8" });
  assert.equal(finalCheck.status, 0, finalCheck.stdout || finalCheck.stderr);
  assert.ok(JSON.parse(finalCheck.stdout).contrast["text/bg"] >= 4.5);
});

test("可视化校验器拒绝任意远程脚本来源", async () => {
  const project = await makeProject();
  runCli(project, ["init"]);
  const output = join(project, "design-system");
  const galleryPath = join(output, "visualizations/lieflat/lupi-gallery.html");
  await appendFile(galleryPath, '\n<script src="https://unpkg.com/example.js"></script>\n', "utf8");

  const result = spawnSync(
    process.execPath,
    [join(output, "checks/check-visualization-module.mjs")],
    { encoding: "utf8" },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /must use local script sources/);
  assert.match(result.stdout, /https:\/\/unpkg\.com\/example\.js/);
});

test("update 更新受管理文件、补回缺失文件并保留用户修改", async () => {
  const project = await makeProject();
  runCli(project, ["init"]);
  const output = join(project, "design-system");
  const designPath = join(output, "DESIGN.md");
  const tokensCssPath = join(output, "tokens/tokens.css");
  const managedPath = join(output, "catalog/component-preview.css");
  const lockPath = join(output, ".design-consultant-lock.json");

  await appendFile(designPath, "\n用户维护的设计决策。\n", "utf8");
  await rm(tokensCssPath);
  const staleContent = "/* previous generated catalog CSS */\n";
  await writeFile(managedPath, staleContent, "utf8");
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  lock.files["catalog/component-preview.css"].generatedHash = digest(staleContent);
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
  const result = runCli(project, ["update"]);

  const designAction = result.actions.find((item) => item.path === "DESIGN.md");
  const tokenAction = result.actions.find((item) => item.path === "tokens/tokens.css");
  const managedAction = result.actions.find((item) => item.path === "catalog/component-preview.css");
  assert.equal(designAction.action, "preserve");
  assert.equal(designAction.userManaged, true);
  assert.equal(tokenAction.action, "create");
  assert.equal(managedAction.action, "update");
  assert.match(await readFile(designPath, "utf8"), /用户维护的设计决策/);
  assert.equal(await exists(tokensCssPath), true);
  assert.notEqual(await readFile(managedPath, "utf8"), staleContent);
});

test("extract 识别技术栈、CSS 变量和共享组件目录", async () => {
  const project = await makeProject();
  await writeFile(
    join(project, "package.json"),
    JSON.stringify({
      dependencies: { react: "19.0.0" },
      devDependencies: { vite: "7.0.0", tailwindcss: "4.0.0" },
    }),
    "utf8",
  );
  await mkdir(join(project, "src/components"), { recursive: true });
  await writeFile(join(project, "src/components/Button.tsx"), "export const Button = () => <button />;\n", "utf8");
  await writeFile(join(project, "src/theme.css"), ":root { --brand-primary: #2563eb; }\n", "utf8");

  const result = runCli(project, ["extract", "--mode", "customize"]);
  const report = JSON.parse(
    await readFile(join(project, "design-system/intake/extraction-report.json"), "utf8"),
  );

  assert.deepEqual(result.extraction.frameworks, ["React"]);
  assert.ok(report.detected.buildTools.includes("Vite"));
  assert.ok(report.detected.styling.includes("Tailwind CSS"));
  assert.ok(result.extraction.sharedComponentDirectories.includes("src/components"));
  assert.equal(result.extraction.cssCustomPropertyCount, 1);
  assert.equal(report.detected.cssCustomProperties.items[0].name, "--brand-primary");
});

test("拒绝把输出目录写到项目之外", async () => {
  const project = await makeProject();
  assert.throws(
    () => runCli(project, ["init", "--output", "../outside"]),
    /--output 必须位于目标项目目录内/,
  );
});

test("Windows UTF-8 BOM package.json 仍能识别 React 技术栈", async () => {
  const project = await makeProject("bom-react-project");
  await writeFile(join(project, "package.json"), `\uFEFF${JSON.stringify({ dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" } })}\n`, "utf8");
  const result = runCli(project, ["init"]);
  assert.equal(result.runtime.framework, "react");
  assert.equal(await exists(join(project, "design-system/runtime/react/src/index.ts")), true);
});
