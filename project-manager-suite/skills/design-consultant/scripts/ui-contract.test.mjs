import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, open, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "../../..");
const CHECK_SCRIPT = join(SCRIPT_DIR, "check-ui-contract.mjs");
const workspaces = [];
const BASELINE_SOURCE = "generated:legacy-ui-baseline";
const BASELINE_PROVENANCE = Object.freeze({ schemaVersion: 1, type: "ui-contract-baseline", mode: "ratchet" });
const TAKEOVER_GATE_DIRECTORY = ".design-consultant-ui-baseline.takeover-gate";
const TAKEOVER_SUPPORT_DIRECTORY = ".design-consultant-ui-baseline.takeover-support";

async function fixture() {
  const base = join(REPO_ROOT, ".tmp");
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, "ui-contract-"));
  workspaces.push(root);
  await mkdir(join(root, "src"), { recursive: true });
  await mkdir(join(root, "design-system/tokens"), { recursive: true });
  await writeFile(join(root, "design-system/tokens/tokens.css"), ":root { --primary: #0f6cdd; --surface: #ffffff; }\n", "utf8");
  return root;
}

function runProcess(root, args = []) {
  return spawnSync(process.execPath, [CHECK_SCRIPT, "--root", root, ...args], { encoding: "utf8" });
}

function run(root, args = []) {
  const result = runProcess(root, args);
  return { ...result, json: JSON.parse(result.stdout) };
}

function hash(content) {
  return createHash("sha256").update(content).digest("hex");
}

function deferred() {
  let resolvePromise;
  const promise = new Promise((resolve) => { resolvePromise = resolve; });
  return { promise, resolve: resolvePromise };
}

async function withTimeout(promise, label, milliseconds = 5000) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function managedBaselineFixture(root, {
  source = `export function Managed() { return <div role="dialog" />; }\n`,
} = {}) {
  const outputRoot = join(root, "design-system");
  const baselinePath = join(outputRoot, "checks/ui-contract-baseline.json");
  const lockPath = join(outputRoot, ".design-consultant-lock.json");
  const configPath = join(outputRoot, "system.config.json");
  const sourcePath = join(root, "src/Managed.tsx");
  await writeFile(sourcePath, source, "utf8");
  const written = run(root, ["--baseline", baselinePath, "--write-baseline"]);
  assert.equal(written.status, 0, written.stderr || written.stdout);
  const baselineRaw = await readFile(baselinePath, "utf8");
  const lock = {
    schemaVersion: 1,
    skill: "design-consultant",
    skillVersion: "0.10.0",
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z",
    output: "design-system",
    workflow: "existing-system-adoption",
    adoption: { status: "confirmed", strategy: "preserve", inventoryDigest: "sha256:fixture" },
    files: {
      "checks/ui-contract-baseline.json": {
        source: BASELINE_SOURCE,
        generatedHash: hash(baselineRaw),
        templateHash: null,
        provenance: BASELINE_PROVENANCE,
      },
    },
  };
  await writeFile(configPath, `${JSON.stringify({
    schemaVersion: 1,
    integration: { legacyBaseline: "checks/ui-contract-baseline.json" },
  }, null, 2)}\n`, "utf8");
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
  return { outputRoot, baselinePath, lockPath, configPath, sourcePath };
}

function runGeneratedChecker(outputRoot, args = []) {
  return spawnSync(process.execPath, [join(outputRoot, "checks/check-ui-contract.mjs"), ...args], {
    cwd: outputRoot,
    encoding: "utf8",
  });
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

test.afterEach(async () => {
  while (workspaces.length > 0) await rm(workspaces.pop(), { recursive: true, force: true });
});

test("UI 合约守门逐项识别 token、外部依赖、原生组件与无障碍违规", async () => {
  const root = await fixture();
  await writeFile(join(root, "src/Violations.tsx"), `
import { Button } from "antd";
export function Violations() {
  return <main style={{ color: "#123456" }}>
    <div style={{ background: "var(--missing-token)" }} onClick={() => undefined}>click</div>
    <select><option>one</option></select>
    <input role="combobox" aria-controls="fake-options" />
    <table><tbody><tr><td>cell</td></tr></tbody></table>
    <div role="dialog" aria-modal="true">dialog</div>
    <button><svg aria-hidden="true" /></button>
    <Button>external</Button>
  </main>;
}
`, "utf8");

  const result = run(root);
  assert.equal(result.status, 1);
  assert.equal(result.json.ok, false);
  const rules = new Set(result.json.issues.map((issue) => issue.rule));
  for (const rule of ["undefined-token", "literal-color", "external-ui-import", "non-interactive-click", "raw-select", "raw-combobox", "raw-table", "raw-dialog", "icon-button-name"]) {
    assert.equal(rules.has(rule), true, `missing rule ${rule}`);
  }
  for (const issue of result.json.issues) {
    assert.equal(typeof issue.line, "number");
    assert.ok(issue.file.startsWith("src/"));
    assert.ok(issue.message.length > 0);
    assert.ok(issue.fix.length > 0);
  }
});

test("UI 合约守门接受只消费 token 与共享组件的业务实现", async () => {
  const root = await fixture();
  await writeFile(join(root, "src/Good.tsx"), `
import { Button, DataTable, Dialog, SelectField } from "../design-system/runtime/react/src";
export function Good() {
  return <section style={{ color: "var(--primary)", background: "var(--surface)" }}>
    <Button>保存</Button><SelectField label="区域" options={[]} />
    <DataTable columns={[]} rows={[]} rowKey={() => "id"} />
    <Dialog open={false} title="确认" onClose={() => undefined}>内容</Dialog>
  </section>;
}
`, "utf8");

  const result = run(root);
  assert.equal(result.status, 0, result.stdout || result.stderr);
  assert.equal(result.json.ok, true);
  assert.deepEqual(result.json.issues, []);
});

test("Manifest 映射的现有组件可作为外部 UI 库 adapter", async () => {
  const root = await fixture();
  await mkdir(join(root, "design-system/components"), { recursive: true });
  await writeFile(join(root, "design-system/components/manifest.json"), `${JSON.stringify({
    families: [{ id: "choice-field", framework: "react", status: "mapped", implementationPath: "../src/MappedSelect.tsx" }],
  })}\n`, "utf8");
  await writeFile(join(root, "src/MappedSelect.tsx"), `
import { Select } from "antd";
export function SelectField() { return <select aria-label="区域"><option>华东</option></select>; }
`, "utf8");
  const result = run(root);
  assert.equal(result.status, 1, result.stdout || result.stderr);
  assert.equal(result.json.issues.some((issue) => issue.rule === "external-ui-import"), false);
  assert.equal(result.json.issues.some((issue) => issue.rule === "raw-select"), true);
});

test("known legacy violations pass while new violations fail", async () => {
  const root = await fixture();
  const baseline = join(root, "checks/ui-contract-baseline.json");
  const source = join(root, "src/Legacy.tsx");
  await writeFile(source, `export function Legacy() { return <div role="dialog">legacy</div>; }\n`, "utf8");

  const written = run(root, ["--baseline", baseline, "--write-baseline"]);
  assert.equal(written.status, 0, written.stderr || written.stdout);
  assert.equal((await readFile(baseline, "utf8")).includes("firstSeen"), true);

  const known = run(root, ["--baseline", baseline]);
  assert.equal(known.status, 0, known.stderr || known.stdout);
  assert.equal(known.json.issues[0].baselineStatus, "known");

  await writeFile(source, `export function Legacy() { return <><div role="dialog">legacy</div><div aria-modal="true">new</div></>; }\n`, "utf8");
  const result = run(root, ["--baseline", baseline]);
  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.ok(result.json.issues.some((issue) => issue.baselineStatus === "new"));
});

test("line movement does not change a legacy fingerprint", async () => {
  const { fingerprintIssue } = await import(`${pathToFileURL(CHECK_SCRIPT).href}?fingerprint=${Date.now()}`);
  const issueAtLine10 = { rule: "raw-dialog", file: "src/Dialog.tsx", line: 10, matchedSource: '<div role="dialog">' };
  const issueAtLine30 = { ...issueAtLine10, line: 30 };
  assert.equal(fingerprintIssue(issueAtLine10), fingerprintIssue(issueAtLine30));
});

test("baseline first-seen dates use the injected clock", async () => {
  const { createBaseline } = await import(`${pathToFileURL(CHECK_SCRIPT).href}?baseline=${Date.now()}`);
  const baseline = createBaseline(
    [{ rule: "raw-dialog", file: "src/Dialog.tsx", matchedSource: '<div role="dialog">' }],
    { now: () => new Date("2026-07-27T12:00:00.000Z") },
  );
  assert.equal(baseline.issues[0].firstSeen, "2026-07-27");
});

test("prune-baseline removes stale entries and never removes observed legacy entries", async () => {
  const root = await fixture();
  const baseline = join(root, "checks/ui-contract-baseline.json");
  const source = join(root, "src/Legacy.tsx");
  await writeFile(source, `export function Legacy() { return <div role="dialog">legacy</div>; }\n`, "utf8");
  run(root, ["--baseline", baseline, "--write-baseline"]);
  await writeFile(source, `export function Legacy() { return null; }\n`, "utf8");

  const stale = run(root, ["--baseline", baseline]);
  assert.equal(stale.status, 0, stale.stderr || stale.stdout);
  assert.equal(stale.json.staleBaseline.length, 1);

  const pruned = run(root, ["--baseline", baseline, "--prune-baseline"]);
  assert.equal(pruned.status, 0, pruned.stderr || pruned.stdout);
  assert.equal(pruned.json.staleBaseline.length, 1);
  assert.equal(pruned.json.prunedBaseline.length, 1);
  assert.deepEqual(JSON.parse(await readFile(baseline, "utf8")).issues, []);
});

test("baseline classifies repeated identical violations as a multiset and preserves stale counts until prune", async () => {
  const root = await fixture();
  const baseline = join(root, "checks/ui-contract-baseline.json");
  const source = join(root, "src/Repeated.tsx");
  await writeFile(source, `export function Repeated() { return <><div role="dialog" /><div role="dialog" /></>; }\n`, "utf8");
  run(root, ["--baseline", baseline, "--write-baseline"]);
  assert.equal(JSON.parse(await readFile(baseline, "utf8")).issues[0].count, 2);
  await writeFile(source, `export function Repeated() { return <div role="dialog" />; }\n`, "utf8");
  const stale = run(root, ["--baseline", baseline]);
  assert.equal(stale.json.issues[0].baselineStatus, "known");
  assert.equal(stale.json.staleBaseline[0].staleCount, 1);
  run(root, ["--baseline", baseline, "--write-baseline"]);
  assert.equal(JSON.parse(await readFile(baseline, "utf8")).issues[0].count, 2);
  run(root, ["--baseline", baseline, "--prune-baseline"]);
  assert.equal(JSON.parse(await readFile(baseline, "utf8")).issues[0].count, 1);
});

test("a newly added identical occurrence is new after the baseline count is exhausted", async () => {
  const root = await fixture();
  const baseline = join(root, "checks/ui-contract-baseline.json");
  const source = join(root, "src/Repeated.tsx");
  await writeFile(source, `export function Repeated() { return <div role="dialog" />; }\n`, "utf8");
  run(root, ["--baseline", baseline, "--write-baseline"]);
  await writeFile(source, `export function Repeated() { return <><div role="dialog" /><div role="dialog" /></>; }\n`, "utf8");

  const result = run(root, ["--baseline", baseline]);

  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.deepEqual(result.json.issues.map((issue) => issue.baselineStatus), ["known", "new"]);
});

test("baseline validation rejects duplicate fingerprints, invalid counts, and non-exact entries", async () => {
  const root = await fixture();
  const baselinePath = join(root, "checks/ui-contract-baseline.json");
  await writeFile(join(root, "src/Legacy.tsx"), `export function Legacy() { return <div role="dialog" />; }\n`, "utf8");
  run(root, ["--baseline", baselinePath, "--write-baseline"]);
  const valid = JSON.parse(await readFile(baselinePath, "utf8"));
  const entry = valid.issues[0];
  const invalidBaselines = [
    { ...valid, issues: [entry, { ...entry }] },
    { ...valid, issues: [{ ...entry, count: 0 }] },
    { ...valid, issues: [{ ...entry, count: 1.5 }] },
    { ...valid, issues: [{ ...entry, count: "1" }] },
    { ...valid, issues: [{ ...entry, firstSeen: "2026-99-99" }] },
    { ...valid, issues: [{ ...entry, extra: true }] },
    { ...valid, issues: [{ fingerprint: entry.fingerprint, rule: entry.rule, file: entry.file, firstSeen: entry.firstSeen }] },
  ];

  for (const invalid of invalidBaselines) {
    await writeFile(baselinePath, `${JSON.stringify(invalid, null, 2)}\n`, "utf8");
    const result = runProcess(root, ["--baseline", baselinePath]);
    assert.equal(result.status, 2, result.stderr || result.stdout);
    assert.match(result.stderr, /baseline|fingerprint|count|entry/i);
  }
});

test("baseline writes preserve the original firstSeen date", async () => {
  const { createBaseline } = await import(`${pathToFileURL(CHECK_SCRIPT).href}?firstSeen=${Date.now()}`);
  const issue = { rule: "raw-dialog", file: "src/Dialog.tsx", matchedSource: '<div role="dialog">' };
  const initial = createBaseline([issue], { now: () => new Date("2026-07-01T00:00:00.000Z") });
  const updated = createBaseline([issue, issue], {
    existing: initial,
    now: () => new Date("2026-07-27T00:00:00.000Z"),
  });

  assert.equal(updated.issues[0].firstSeen, "2026-07-01");
  assert.equal(updated.issues[0].count, 2);
});

test("prune requires an existing baseline", async () => {
  const root = await fixture();
  const result = runProcess(root, ["--baseline", join(root, "checks/missing.json"), "--prune-baseline"]);
  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stderr, /requires an existing baseline/i);
});

test("baseline read, write, and prune reject a junction ancestor without touching the external target", async (t) => {
  const root = await fixture();
  const external = await mkdtemp(join(REPO_ROOT, ".tmp/ui-contract-external-"));
  workspaces.push(external);
  const linked = join(root, "linked-checks");
  if (!await createDirectoryLinkOrSkip(t, external, linked)) return;
  const externalBaseline = join(external, "baseline.json");
  const raw = `${JSON.stringify({ schemaVersion: 1, issues: [] }, null, 2)}\n`;
  await writeFile(externalBaseline, raw, "utf8");

  for (const args of [[], ["--write-baseline"], ["--prune-baseline"]]) {
    const result = runProcess(root, ["--baseline", join(linked, "baseline.json"), ...args]);
    assert.equal(result.status, 2, result.stderr || result.stdout);
    assert.match(result.stderr, /symbolic link|junction|reparse|ordinary|realpath/i);
    assert.equal(await readFile(externalBaseline, "utf8"), raw);
  }
});

test("baseline target must be an ordinary file", async () => {
  const root = await fixture();
  const baselinePath = join(root, "checks/ui-contract-baseline.json");
  await mkdir(baselinePath, { recursive: true });
  const result = runProcess(root, ["--baseline", baselinePath, "--write-baseline"]);
  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stderr, /ordinary file|directory/i);
});

test("managed baseline write and prune update the exact lock entry", async () => {
  const root = await fixture();
  const { baselinePath, lockPath, sourcePath } = await managedBaselineFixture(root);
  await writeFile(sourcePath, `export function Managed() { return <><div role="dialog" /><div role="dialog" /></>; }\n`, "utf8");

  const written = run(root, ["--baseline", baselinePath, "--write-baseline"]);
  assert.equal(written.status, 0, written.stderr || written.stdout);
  let baselineRaw = await readFile(baselinePath, "utf8");
  let lock = JSON.parse(await readFile(lockPath, "utf8"));
  assert.equal(JSON.parse(baselineRaw).issues[0].count, 2);
  assert.deepEqual(lock.files["checks/ui-contract-baseline.json"], {
    source: BASELINE_SOURCE,
    generatedHash: hash(baselineRaw),
    templateHash: null,
    provenance: BASELINE_PROVENANCE,
  });

  await writeFile(sourcePath, `export function Managed() { return <div role="dialog" />; }\n`, "utf8");
  const pruned = run(root, ["--baseline", baselinePath, "--prune-baseline"]);
  assert.equal(pruned.status, 0, pruned.stderr || pruned.stdout);
  baselineRaw = await readFile(baselinePath, "utf8");
  lock = JSON.parse(await readFile(lockPath, "utf8"));
  assert.equal(JSON.parse(baselineRaw).issues[0].count, 1);
  assert.equal(lock.files["checks/ui-contract-baseline.json"].generatedHash, hash(baselineRaw));
});

test("managed baseline rejects missing or drifted lock approval without changing either file", async () => {
  for (const mutate of [
    (lock) => { delete lock.files["checks/ui-contract-baseline.json"]; },
    (lock) => { lock.files["checks/ui-contract-baseline.json"].generatedHash = "0".repeat(64); },
    (lock) => { lock.files["checks/ui-contract-baseline.json"].provenance = { ...BASELINE_PROVENANCE, mode: "forged" }; },
  ]) {
    const root = await fixture();
    const { baselinePath, lockPath, sourcePath } = await managedBaselineFixture(root);
    const lock = JSON.parse(await readFile(lockPath, "utf8"));
    mutate(lock);
    await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
    await writeFile(sourcePath, `export function Managed() { return <><div role="dialog" /><div role="dialog" /></>; }\n`, "utf8");
    const baselineBefore = await readFile(baselinePath, "utf8");
    const lockBefore = await readFile(lockPath, "utf8");

    const result = runProcess(root, ["--baseline", baselinePath, "--write-baseline"]);

    assert.equal(result.status, 2, result.stderr || result.stdout);
    assert.match(result.stderr, /lock|provenance|hash|managed/i);
    assert.equal(await readFile(baselinePath, "utf8"), baselineBefore);
    assert.equal(await readFile(lockPath, "utf8"), lockBefore);
  }
});

test("managed output anchoring rejects missing, misplaced, wrong-workflow, and wrong-output locks for write and prune", async () => {
  const cases = [
    {
      name: "missing output lock",
      async mutate({ lockPath }) { await rm(lockPath); },
    },
    {
      name: "greenfield output lock",
      async mutate({ lockPath }) {
        const lock = JSON.parse(await readFile(lockPath, "utf8"));
        lock.workflow = "greenfield";
        await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
      },
    },
    {
      name: "wrong lock output",
      async mutate({ lockPath }) {
        const lock = JSON.parse(await readFile(lockPath, "utf8"));
        lock.output = "other-design-system";
        await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
      },
    },
    {
      name: "nested fake lock",
      async mutate({ outputRoot }) {
        await writeFile(join(outputRoot, "checks/.design-consultant-lock.json"), `${JSON.stringify({
          schemaVersion: 1,
          workflow: "existing-system-adoption",
          output: "design-system/checks",
          files: {},
        }, null, 2)}\n`, "utf8");
      },
    },
  ];

  for (const operation of ["--write-baseline", "--prune-baseline"]) {
    for (const item of cases) {
      const root = await fixture();
      const managed = await managedBaselineFixture(root);
      await writeFile(
        managed.sourcePath,
        operation === "--write-baseline"
          ? `export function Managed() { return <><div role="dialog" /><div role="dialog" /></>; }\n`
          : "export function Managed() { return null; }\n",
        "utf8",
      );
      await item.mutate(managed);
      const baselineBefore = await readFile(managed.baselinePath);

      const result = runProcess(root, ["--baseline", managed.baselinePath, operation]);

      assert.equal(result.status, 2, `${item.name} ${operation}: ${result.stderr || result.stdout}`);
      assert.match(result.stderr, /managed|lock|workflow|output|marker|pointer|location/i);
      assert.deepEqual(await readFile(managed.baselinePath), baselineBefore, `${item.name} ${operation}`);
    }
  }
});

test("generated checker automatically uses its output baseline with no baseline argument", async () => {
  const root = await fixture();
  const { outputRoot, baselinePath, lockPath, sourcePath } = await managedBaselineFixture(root);
  const generatedScript = join(outputRoot, "checks/check-ui-contract.mjs");
  await copyFile(CHECK_SCRIPT, generatedScript);

  let result = runGeneratedChecker(outputRoot);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  let payload = JSON.parse(result.stdout);
  assert.equal(payload.baseline.path, "design-system/checks/ui-contract-baseline.json");
  assert.equal(payload.issues.find((issue) => issue.file === "src/Managed.tsx").baselineStatus, "known");

  await writeFile(sourcePath, `export function Managed() { return <><div role="dialog" /><div role="dialog" /></>; }\n`, "utf8");
  result = runGeneratedChecker(outputRoot);
  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.ok(JSON.parse(result.stdout).issues.some((issue) => issue.baselineStatus === "new"));

  result = runGeneratedChecker(outputRoot, ["--write-baseline"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  let baselineRaw = await readFile(baselinePath, "utf8");
  let lock = JSON.parse(await readFile(lockPath, "utf8"));
  assert.equal(JSON.parse(baselineRaw).issues[0].count, 2);
  assert.equal(lock.files["checks/ui-contract-baseline.json"].generatedHash, hash(baselineRaw));

  await writeFile(sourcePath, `export function Managed() { return <div role="dialog" />; }\n`, "utf8");
  result = runGeneratedChecker(outputRoot, ["--prune-baseline"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  baselineRaw = await readFile(baselinePath, "utf8");
  lock = JSON.parse(await readFile(lockPath, "utf8"));
  assert.equal(JSON.parse(baselineRaw).issues[0].count, 1);
  assert.equal(lock.files["checks/ui-contract-baseline.json"].generatedHash, hash(baselineRaw));
});

test("generated adoption checker cannot disable managed identity by nulling its baseline pointer", async () => {
  const root = await fixture();
  const { outputRoot, configPath, lockPath, sourcePath } = await managedBaselineFixture(root);
  await copyFile(CHECK_SCRIPT, join(outputRoot, "checks/check-ui-contract.mjs"));
  await mkdir(join(outputRoot, "adoption"), { recursive: true });
  await writeFile(join(outputRoot, "adoption/adoption-plan.json"), '{"schemaVersion":1}\n', "utf8");
  await writeFile(sourcePath, `export function Managed() { return <><div role="dialog" /><div role="dialog" /></>; }\n`, "utf8");
  const sourceBefore = await readFile(sourcePath);
  const config = JSON.parse(await readFile(configPath, "utf8"));
  config.integration.adoptionStrategy = "preserve";
  config.integration.legacyBaseline = null;
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  await rm(lockPath);

  const result = runGeneratedChecker(outputRoot);

  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stderr, /managed|adoption|baseline|lock|pointer/i);
  assert.equal(result.stdout, "");
  assert.deepEqual(await readFile(sourcePath), sourceBefore);
});

test("managed baseline transaction rolls back ordinary failures and recovers an orphan journal", async () => {
  const root = await fixture();
  const { baselinePath, lockPath, sourcePath } = await managedBaselineFixture(root);
  const baselineBefore = await readFile(baselinePath, "utf8");
  const lockBefore = await readFile(lockPath, "utf8");
  await writeFile(sourcePath, `export function Managed() { return <><div role="dialog" /><div role="dialog" /></>; }\n`, "utf8");
  const { runUiContractCheck } = await import(`${pathToFileURL(CHECK_SCRIPT).href}?transaction=${Date.now()}`);
  const options = { root, baseline: baselinePath, writeBaseline: true, pruneBaseline: false };

  await assert.rejects(
    runUiContractCheck(options, { beforeManagedInstall: ({ target }) => { if (target === "lock") throw new Error("forced lock install failure"); } }),
    /forced lock install failure/,
  );
  assert.equal(await readFile(baselinePath, "utf8"), baselineBefore);
  assert.equal(await readFile(lockPath, "utf8"), lockBefore);

  await assert.rejects(
    runUiContractCheck(options, { crashAtManagedPhase: ({ target, phase }) => { if (target === "baseline" && phase === "installed") throw new Error("simulated crash"); } }),
    /simulated crash/,
  );
  assert.notEqual(await readFile(baselinePath, "utf8"), baselineBefore);
  assert.equal(await readFile(lockPath, "utf8"), lockBefore);

  const baselineAfterCrash = await readFile(baselinePath, "utf8");
  await runUiContractCheck({ root, baseline: baselinePath, writeBaseline: false, pruneBaseline: false });
  assert.equal(await readFile(baselinePath, "utf8"), baselineAfterCrash);
  const recoveredLock = JSON.parse(await readFile(lockPath, "utf8"));
  assert.equal(recoveredLock.files["checks/ui-contract-baseline.json"].generatedHash, hash(baselineAfterCrash));
  assert.notEqual(await readFile(lockPath, "utf8"), lockBefore);
});

test("an active managed baseline transaction is never recovered by a second checker", async () => {
  const root = await fixture();
  const { outputRoot, baselinePath, lockPath, sourcePath } = await managedBaselineFixture(root);
  await writeFile(sourcePath, `export function Managed() { return <><div role="dialog" /><div role="dialog" /></>; }\n`, "utf8");
  const { runUiContractCheck } = await import(`${pathToFileURL(CHECK_SCRIPT).href}?exclusive=${Date.now()}`);
  const options = { root, baseline: baselinePath, writeBaseline: true, pruneBaseline: false };
  let signalPaused;
  let releasePaused;
  const paused = new Promise((resolvePaused) => { signalPaused = resolvePaused; });
  const release = new Promise((resolveRelease) => { releasePaused = resolveRelease; });
  const first = runUiContractCheck(options, {
    async crashAtManagedPhase({ target, phase }) {
      if (target === "baseline" && phase === "installed") {
        signalPaused();
        await release;
      }
    },
  });
  await paused;
  const baselineWhilePaused = await readFile(baselinePath);
  const lockWhilePaused = await readFile(lockPath);
  let secondError = null;
  try {
    await runUiContractCheck({ root, baseline: baselinePath, writeBaseline: false, pruneBaseline: false });
  } catch (error) {
    secondError = error;
  } finally {
    releasePaused();
  }
  const firstResult = await first.then((value) => ({ value }), (error) => ({ error }));

  assert.match(secondError?.message ?? "", /active|exclusive|owner|transaction.*lock/i);
  assert.deepEqual(baselineWhilePaused, await readFile(baselinePath));
  assert.notDeepEqual(lockWhilePaused, await readFile(lockPath));
  assert.equal(firstResult.error, undefined, firstResult.error?.stack);
  const finalBaseline = await readFile(baselinePath);
  const finalLock = JSON.parse(await readFile(lockPath, "utf8"));
  assert.equal(finalLock.files["checks/ui-contract-baseline.json"].generatedHash, hash(finalBaseline));
  await assert.rejects(readFile(join(outputRoot, ".design-consultant-ui-baseline.lock/owner.json")), /ENOENT/);
  await assert.rejects(readFile(join(outputRoot, ".design-consultant-ui-baseline-transaction.json")), /ENOENT/);
});

test("a dead owner lock is atomically claimed before recovering a valid journal", async () => {
  const root = await fixture();
  const { outputRoot, baselinePath, lockPath, sourcePath } = await managedBaselineFixture(root);
  await writeFile(sourcePath, `export function Managed() { return <><div role="dialog" /><div role="dialog" /></>; }\n`, "utf8");
  const { runUiContractCheck } = await import(`${pathToFileURL(CHECK_SCRIPT).href}?stale=${Date.now()}`);
  await assert.rejects(
    runUiContractCheck(
      { root, baseline: baselinePath, writeBaseline: true, pruneBaseline: false },
      { crashAtManagedPhase: ({ target, phase }) => { if (target === "baseline" && phase === "installed") throw new Error("simulated dead owner"); } },
    ),
    /simulated dead owner/,
  );
  const installedBaseline = await readFile(baselinePath);
  const deadProcess = spawnSync(process.execPath, ["-e", "process.exit(0)"]);
  assert.ok(Number.isInteger(deadProcess.pid));
  const ownerDirectory = join(outputRoot, ".design-consultant-ui-baseline.lock");
  await mkdir(ownerDirectory);
  await writeFile(join(ownerDirectory, "owner.json"), `${JSON.stringify({
    schemaVersion: 1,
    pid: deadProcess.pid,
    nonce: "deadbeefdeadbeefdeadbeefdeadbeef",
    startedAt: "2026-07-27T00:00:00.000Z",
  }, null, 2)}\n`, "utf8");

  await runUiContractCheck({ root, baseline: baselinePath, writeBaseline: false, pruneBaseline: false });

  assert.deepEqual(await readFile(baselinePath), installedBaseline);
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  assert.equal(lock.files["checks/ui-contract-baseline.json"].generatedHash, hash(installedBaseline));
  await assert.rejects(readFile(join(ownerDirectory, "owner.json")), /ENOENT/);
  await assert.rejects(readFile(join(outputRoot, ".design-consultant-ui-baseline-transaction.json")), /ENOENT/);
});

test("a stable takeover gate serializes three stale contenders without losing another owner", async () => {
  const root = await fixture();
  const { outputRoot, baselinePath, lockPath, sourcePath } = await managedBaselineFixture(root);
  await writeFile(sourcePath, `export function Managed() { return <><div role="dialog" /><div role="dialog" /></>; }\n`, "utf8");
  const { runUiContractCheck } = await import(`${pathToFileURL(CHECK_SCRIPT).href}?three-way-stale-race=${Date.now()}`);
  const deadProcess = spawnSync(process.execPath, ["-e", "process.exit(0)"]);
  assert.ok(Number.isInteger(deadProcess.pid));
  const ownerDirectory = join(outputRoot, ".design-consultant-ui-baseline.lock");
  const ownerPath = join(ownerDirectory, "owner.json");
  const deadOwner = {
    schemaVersion: 1,
    pid: deadProcess.pid,
    nonce: "deadbeefdeadbeefdeadbeefdeadbeef",
    startedAt: "2026-07-27T00:00:00.000Z",
  };
  await mkdir(ownerDirectory);
  await writeFile(ownerPath, `${JSON.stringify(deadOwner, null, 2)}\n`, "utf8");

  const gateDirectory = join(outputRoot, TAKEOVER_GATE_DIRECTORY);
  const staleGateNonce = "feedfacefeedfacefeedfacefeedface";
  const staleGateRecord = {
    schemaVersion: 1,
    pid: deadProcess.pid,
    nonce: staleGateNonce,
    startedAt: "2026-07-27T00:00:00.000Z",
    state: "ticket",
    ticket: 1,
  };
  const staleGatePath = join(gateDirectory, `0000000000000001.${staleGateNonce}.ticket.json`);
  await mkdir(gateDirectory);
  await writeFile(staleGatePath, `${JSON.stringify(staleGateRecord, null, 2)}\n`, "utf8");

  const aHasGate = deferred();
  const allowA = deferred();
  const bQueued = deferred();
  const cQueued = deferred();
  const aInstalledBaseline = deferred();
  const resumeA = deferred();
  const observedDeadOwners = [];
  const acquiredBusinessOwners = [];
  let aGatePaused = false;
  const readOptions = { root, baseline: baselinePath, writeBaseline: false, pruneBaseline: false };
  const writeOptions = { root, baseline: baselinePath, writeBaseline: true, pruneBaseline: false };
  const contenderA = runUiContractCheck(writeOptions, {
    async afterTakeoverGateAcquired({ purpose }) {
      if (purpose === "acquire-business-mutex" && !aGatePaused) {
        aGatePaused = true;
        aHasGate.resolve();
        await allowA.promise;
      }
    },
    afterStaleOwnerObserved({ owner }) {
      assert.deepEqual(owner, deadOwner);
      observedDeadOwners.push("A");
    },
    afterManagedMutexAcquired({ owner }) {
      acquiredBusinessOwners.push({ contender: "A", owner });
    },
    async crashAtManagedPhase({ target, phase }) {
      if (target === "baseline" && phase === "installed") {
        aInstalledBaseline.resolve();
        await resumeA.promise;
      }
    },
  }).then((value) => ({ value }), (error) => ({ error }));
  await withTimeout(aHasGate.promise, "contender A to hold the takeover gate");

  const contenderB = runUiContractCheck(readOptions, {
    afterTakeoverGateTicketCreated({ purpose }) {
      if (purpose === "acquire-business-mutex") bQueued.resolve();
    },
    afterStaleOwnerObserved() { observedDeadOwners.push("B"); },
    afterManagedMutexAcquired({ owner }) { acquiredBusinessOwners.push({ contender: "B", owner }); },
  }).then((value) => ({ value }), (error) => ({ error }));
  const contenderC = runUiContractCheck(readOptions, {
    afterTakeoverGateTicketCreated({ purpose }) {
      if (purpose === "acquire-business-mutex") cQueued.resolve();
    },
    afterStaleOwnerObserved() { observedDeadOwners.push("C"); },
    afterManagedMutexAcquired({ owner }) { acquiredBusinessOwners.push({ contender: "C", owner }); },
  }).then((value) => ({ value }), (error) => ({ error }));

  let bOutcome;
  let cOutcome;
  try {
    await withTimeout(Promise.all([bQueued.promise, cQueued.promise]), "contenders B and C to queue at the takeover gate");
    allowA.resolve();
    await withTimeout(aInstalledBaseline.promise, "contender A to install the baseline as the sole business owner");
    [bOutcome, cOutcome] = await withTimeout(
      Promise.all([contenderB, contenderC]),
      "contenders B and C to reject A's live business mutex",
    );

    assert.match(bOutcome.error?.message ?? "", /active|owner|transaction.*lock/i);
    assert.match(cOutcome.error?.message ?? "", /active|owner|transaction.*lock/i);
    assert.deepEqual(observedDeadOwners, ["A"]);
    assert.equal(acquiredBusinessOwners.length, 1);
    assert.equal(acquiredBusinessOwners[0].contender, "A");
    assert.deepEqual(JSON.parse((await readFile(ownerPath)).toString("utf8")), acquiredBusinessOwners[0].owner);
    assert.deepEqual(await readdir(gateDirectory), []);
    const activeEntries = await readdir(outputRoot);
    assert.deepEqual(
      activeEntries.filter((name) => name.includes("design-consultant-ui-baseline.lock") && name !== ".design-consultant-ui-baseline.lock"),
      [],
    );
    await assert.rejects(readFile(staleGatePath), /ENOENT/);
  } finally {
    allowA.resolve();
    resumeA.resolve();
  }
  const aOutcome = await withTimeout(contenderA, "contender A to complete");

  assert.equal(aOutcome.error, undefined, aOutcome.error?.stack);
  const finalBaseline = await readFile(baselinePath);
  const finalLock = JSON.parse(await readFile(lockPath, "utf8"));
  assert.equal(finalLock.files["checks/ui-contract-baseline.json"].generatedHash, hash(finalBaseline));
  await assert.rejects(readFile(ownerPath), /ENOENT/);
  await assert.rejects(readFile(join(outputRoot, ".design-consultant-ui-baseline-transaction.json")), /ENOENT/);
  assert.deepEqual(await readdir(gateDirectory), []);
});

test("choosing and ticket records are published only after their pending bytes are complete", async () => {
  const root = await fixture();
  const { outputRoot, baselinePath } = await managedBaselineFixture(root);
  const { runUiContractCheck } = await import(`${pathToFileURL(CHECK_SCRIPT).href}?atomic-gate-publish=${Date.now()}`);
  const reached = { choosing: deferred(), ticket: deferred() };
  const resume = { choosing: deferred(), ticket: deferred() };
  const options = { root, baseline: baselinePath, writeBaseline: false, pruneBaseline: false };
  const check = runUiContractCheck(options, {
    async afterTakeoverGatePendingSynced(event) {
      if (!(event.state in reached)) return;
      reached[event.state].resolve(event);
      await resume[event.state].promise;
    },
  }).then((value) => ({ value }), (error) => ({ error }));

  try {
    for (const state of ["choosing", "ticket"]) {
      const event = await withTimeout(reached[state].promise, `${state} pending record to be synced`);
      await assert.rejects(readFile(event.destinationPath), /ENOENT/, `${state} must not be visible before atomic publication`);
      assert.deepEqual(JSON.parse(await readFile(event.pendingPath, "utf8")), event.record);
      resume[state].resolve();
    }
  } finally {
    resume.choosing.resolve();
    resume.ticket.resolve();
  }

  const outcome = await withTimeout(check, "the atomically published gate acquisition to complete");
  assert.equal(outcome.error, undefined, outcome.error?.stack);
  assert.deepEqual(await readdir(join(outputRoot, TAKEOVER_GATE_DIRECTORY)), []);
  assert.deepEqual(await readdir(join(outputRoot, TAKEOVER_SUPPORT_DIRECTORY, "pending")), []);
});

test("dead choosing and ticket pending files are cleaned without deleting a live publisher file", async () => {
  const root = await fixture();
  const { outputRoot, baselinePath, lockPath } = await managedBaselineFixture(root);
  const baselineBefore = await readFile(baselinePath);
  const lockBefore = await readFile(lockPath);
  const pendingDirectory = join(outputRoot, TAKEOVER_SUPPORT_DIRECTORY, "pending");
  await mkdir(pendingDirectory, { recursive: true });
  const deadPublisher = spawnSync(process.execPath, ["-e", String.raw`
    const { join } = require("node:path");
    const { openSync } = require("node:fs");
    const directory = process.argv[1];
    const names = [
      process.pid + ".11111111111111111111111111111111.choosing.pending",
      process.pid + ".22222222222222222222222222222222.ticket.pending",
    ];
    for (const name of names) openSync(join(directory, name), "wx");
    process.stdout.write(JSON.stringify(names));
  `, pendingDirectory], { encoding: "utf8" });
  assert.equal(deadPublisher.status, 0, deadPublisher.stderr);
  const deadNames = JSON.parse(deadPublisher.stdout);
  const liveName = `${process.pid}.33333333333333333333333333333333.choosing.pending`;
  await writeFile(join(pendingDirectory, liveName), "");

  const result = runProcess(root, ["--baseline", baselinePath]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  for (const name of deadNames) await assert.rejects(readFile(join(pendingDirectory, name)), /ENOENT/, name);
  assert.equal((await readFile(join(pendingDirectory, liveName))).length, 0);
  assert.deepEqual(await readFile(baselinePath), baselineBefore);
  assert.deepEqual(await readFile(lockPath), lockBefore);
});

test("malformed formal choosing and ticket records fail closed without recovery side effects", async () => {
  const variants = [
    { name: "44444444444444444444444444444444.choosing.json", raw: Buffer.alloc(0) },
    {
      name: "0000000000000001.55555555555555555555555555555555.ticket.json",
      raw: Buffer.from('{"schemaVersion":1,"pid":'),
    },
  ];

  for (const variant of variants) {
    const root = await fixture();
    const { outputRoot, baselinePath, lockPath } = await managedBaselineFixture(root);
    const baselineBefore = await readFile(baselinePath);
    const lockBefore = await readFile(lockPath);
    const gateDirectory = join(outputRoot, TAKEOVER_GATE_DIRECTORY);
    const formalPath = join(gateDirectory, variant.name);
    await mkdir(gateDirectory);
    const livePublisher = await open(formalPath, "wx");
    try {
      await livePublisher.writeFile(variant.raw);
      await livePublisher.sync();

      const result = runProcess(root, ["--baseline", baselinePath]);

      assert.equal(result.status, 2, `${variant.name}: ${result.stderr || result.stdout}`);
      assert.match(result.stderr, /takeover|gate|invalid JSON/i);
      assert.deepEqual(await readFile(formalPath), variant.raw);
      assert.deepEqual(await readdir(gateDirectory), [variant.name]);
      assert.deepEqual(await readdir(join(outputRoot, TAKEOVER_SUPPORT_DIRECTORY)), ["pending"]);
      assert.deepEqual(await readdir(join(outputRoot, TAKEOVER_SUPPORT_DIRECTORY, "pending")), []);
      await assert.rejects(
        readdir(join(outputRoot, TAKEOVER_SUPPORT_DIRECTORY, "quarantine")),
        (error) => error.code === "ENOENT",
      );
      assert.deepEqual(await readFile(baselinePath), baselineBefore);
      assert.deepEqual(await readFile(lockPath), lockBefore);
    } finally {
      await livePublisher.close();
    }
  }
});

test("atomic gate publication never overwrites a concurrently installed owner record", async () => {
  const root = await fixture();
  const { outputRoot, baselinePath, lockPath } = await managedBaselineFixture(root);
  const baselineBefore = await readFile(baselinePath);
  const lockBefore = await readFile(lockPath);
  let foreignRaw;
  let destinationPath;
  const { runUiContractCheck } = await import(`${pathToFileURL(CHECK_SCRIPT).href}?gate-no-overwrite=${Date.now()}`);

  await assert.rejects(
    runUiContractCheck(
      { root, baseline: baselinePath, writeBaseline: false, pruneBaseline: false },
      {
        async afterTakeoverGatePendingSynced(event) {
          if (event.state !== "choosing" || foreignRaw) return;
          destinationPath = event.destinationPath;
          foreignRaw = `${JSON.stringify({
            ...event.record,
            pid: process.pid,
            startedAt: "2026-07-27T00:00:00.000Z",
          }, null, 2)}\n`;
          await writeFile(destinationPath, foreignRaw, { encoding: "utf8", flag: "wx" });
        },
      },
    ),
    /publish|exist|ownership|cleanup|gate/i,
  );

  assert.equal(await readFile(destinationPath, "utf8"), foreignRaw);
  assert.deepEqual(await readFile(baselinePath), baselineBefore);
  assert.deepEqual(await readFile(lockPath), lockBefore);
  assert.deepEqual(await readdir(join(outputRoot, TAKEOVER_SUPPORT_DIRECTORY, "pending")), []);
});

test("business mutex release keeps its move-before-verify window inside the takeover gate", async () => {
  const root = await fixture();
  const { outputRoot, baselinePath } = await managedBaselineFixture(root);
  const { runUiContractCheck } = await import(`${pathToFileURL(CHECK_SCRIPT).href}?release-gate=${Date.now()}`);
  const releaseMoved = deferred();
  const resumeRelease = deferred();
  const secondQueued = deferred();
  const secondWaiting = deferred();
  let secondAcquired = false;
  const options = { root, baseline: baselinePath, writeBaseline: false, pruneBaseline: false };
  const first = runUiContractCheck(options, {
    async afterManagedMutexReleaseMoved() {
      releaseMoved.resolve();
      await resumeRelease.promise;
    },
  });
  await withTimeout(releaseMoved.promise, "the first checker to move its mutex for release");

  const second = runUiContractCheck(options, {
    afterTakeoverGateTicketCreated({ purpose }) {
      if (purpose === "acquire-business-mutex") secondQueued.resolve();
    },
    afterTakeoverGateWaiting({ purpose }) {
      if (purpose === "acquire-business-mutex") secondWaiting.resolve();
    },
    afterManagedMutexAcquired() { secondAcquired = true; },
  });
  try {
    await withTimeout(Promise.all([secondQueued.promise, secondWaiting.promise]), "the second checker to wait behind release");
    assert.equal(secondAcquired, false);
    await assert.rejects(readFile(join(outputRoot, ".design-consultant-ui-baseline.lock/owner.json")), /ENOENT/);
    assert.equal((await readdir(outputRoot)).filter((name) => name.endsWith(".release")).length, 1);
  } finally {
    resumeRelease.resolve();
  }

  const [firstOutcome, secondOutcome] = await withTimeout(Promise.all([
    first.then((value) => ({ value }), (error) => ({ error })),
    second.then((value) => ({ value }), (error) => ({ error })),
  ]), "both serialized checkers to complete");
  assert.equal(firstOutcome.error, undefined, firstOutcome.error?.stack);
  assert.equal(secondOutcome.error, undefined, secondOutcome.error?.stack);
  assert.equal(secondAcquired, true);
  assert.deepEqual(await readdir(join(outputRoot, TAKEOVER_GATE_DIRECTORY)), []);
  assert.equal((await readdir(outputRoot)).filter((name) => name.includes("design-consultant-ui-baseline.lock")).length, 0);
});

test("an unprovable takeover gate ticket fails closed without touching managed bytes", async () => {
  const root = await fixture();
  const { outputRoot, baselinePath, lockPath } = await managedBaselineFixture(root);
  const baselineBefore = await readFile(baselinePath);
  const lockBefore = await readFile(lockPath);
  const gateDirectory = join(outputRoot, TAKEOVER_GATE_DIRECTORY);
  const forgedPath = join(gateDirectory, "badbadbadbadbadbadbadbadbadbadba.choosing.json");
  const forgedRaw = '{"schemaVersion":1,"pid":"unknown","nonce":"forged"}\n';
  await mkdir(gateDirectory);
  await writeFile(forgedPath, forgedRaw, "utf8");

  const result = runProcess(root, ["--baseline", baselinePath]);

  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stderr, /takeover|gate|ticket|owner|contract/i);
  assert.deepEqual(await readFile(baselinePath), baselineBefore);
  assert.deepEqual(await readFile(lockPath), lockBefore);
  assert.equal(await readFile(forgedPath, "utf8"), forgedRaw);
});

test("an unprovable managed lock owner fails closed without changing managed bytes", async () => {
  const root = await fixture();
  const { outputRoot, baselinePath, lockPath } = await managedBaselineFixture(root);
  const baselineBefore = await readFile(baselinePath);
  const lockBefore = await readFile(lockPath);
  const ownerDirectory = join(outputRoot, ".design-consultant-ui-baseline.lock");
  await mkdir(ownerDirectory);
  const ownerRaw = '{"schemaVersion":1,"pid":"unknown","nonce":"forged","startedAt":"never"}\n';
  await writeFile(join(ownerDirectory, "owner.json"), ownerRaw, "utf8");

  const result = runProcess(root, ["--baseline", baselinePath]);

  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stderr, /owner|lock|stale|contract/i);
  assert.deepEqual(await readFile(baselinePath), baselineBefore);
  assert.deepEqual(await readFile(lockPath), lockBefore);
  assert.equal(await readFile(join(ownerDirectory, "owner.json"), "utf8"), ownerRaw);
});

test("managed recovery rejects forged payloads, invalid schemas, locks, and transitions without mutation", async () => {
  const cases = [
    {
      name: "extra journal key",
      mutate(journal) { journal.forged = true; },
    },
    {
      name: "invalid old baseline schema",
      mutate(journal) {
        const raw = Buffer.from('{"schemaVersion":1,"issues":[{"forged":true}]}\n');
        journal.oldBaseline = raw.toString("base64");
        journal.oldBaselineHash = hash(raw);
      },
    },
    {
      name: "invalid new baseline schema",
      mutate(journal) {
        const raw = Buffer.from('{"schemaVersion":1,"issues":[{"forged":true}]}\n');
        journal.newBaseline = raw.toString("base64");
        journal.newBaselineHash = hash(raw);
      },
    },
    {
      name: "invalid old lock provenance",
      mutate(journal) {
        const lock = JSON.parse(Buffer.from(journal.oldLock, "base64").toString("utf8"));
        lock.files["checks/ui-contract-baseline.json"].source = "generated:forged-baseline";
        const raw = Buffer.from(`${JSON.stringify(lock, null, 2)}\n`);
        journal.oldLock = raw.toString("base64");
        journal.oldLockHash = hash(raw);
      },
    },
    {
      name: "invalid new lock workflow",
      mutate(journal) {
        const lock = JSON.parse(Buffer.from(journal.newLock, "base64").toString("utf8"));
        lock.workflow = "greenfield";
        const raw = Buffer.from(`${JSON.stringify(lock, null, 2)}\n`);
        journal.newLock = raw.toString("base64");
        journal.newLockHash = hash(raw);
      },
    },
    {
      name: "arbitrary new lock payload",
      mutate(journal) {
        const lock = JSON.parse(Buffer.from(journal.newLock, "base64").toString("utf8"));
        lock.files["forged/arbitrary.txt"] = { generatedHash: "0".repeat(64) };
        const raw = Buffer.from(`${JSON.stringify(lock, null, 2)}\n`);
        journal.newLock = raw.toString("base64");
        journal.newLockHash = hash(raw);
      },
    },
    {
      name: "invalid prune transition",
      mutate(journal) { journal.operation = "prune"; },
    },
  ];

  for (const item of cases) {
    const root = await fixture();
    const { outputRoot, baselinePath, lockPath, sourcePath } = await managedBaselineFixture(root);
    await writeFile(sourcePath, `export function Managed() { return <><div role="dialog" /><div role="dialog" /></>; }\n`, "utf8");
    const { runUiContractCheck } = await import(`${pathToFileURL(CHECK_SCRIPT).href}?forged=${Date.now()}-${item.name}`);
    await assert.rejects(
      runUiContractCheck(
        { root, baseline: baselinePath, writeBaseline: true, pruneBaseline: false },
        { crashAtManagedPhase: ({ target, phase }) => { if (target === "baseline" && phase === "installed") throw new Error("leave journal"); } },
      ),
      /leave journal/,
    );
    const journalPath = join(outputRoot, ".design-consultant-ui-baseline-transaction.json");
    const journal = JSON.parse(await readFile(journalPath, "utf8"));
    item.mutate(journal);
    const journalRaw = `${JSON.stringify(journal, null, 2)}\n`;
    await writeFile(journalPath, journalRaw, "utf8");
    const baselineBefore = await readFile(baselinePath);
    const lockBefore = await readFile(lockPath);

    const result = runProcess(root, ["--baseline", baselinePath]);

    assert.equal(result.status, 2, `${item.name}: ${result.stderr || result.stdout}`);
    assert.match(result.stderr, /journal|transition|baseline|lock|schema|provenance/i);
    assert.deepEqual(await readFile(baselinePath), baselineBefore, item.name);
    assert.deepEqual(await readFile(lockPath), lockBefore, item.name);
    assert.equal(await readFile(journalPath, "utf8"), journalRaw, item.name);
  }
});

test("managed recovery rejects empty baseline and semantic lock transitions without cleanup", async () => {
  for (const [index, variant] of [
    { name: "byte-identical old and new lock", reencodeLock: false },
    { name: "semantically identical lock with distinct raw bytes", reencodeLock: true },
  ].entries()) {
    const root = await fixture();
    const { outputRoot, baselinePath, lockPath, sourcePath } = await managedBaselineFixture(root);
    await writeFile(sourcePath, `export function Managed() { return <><div role="dialog" /><div role="dialog" /></>; }\n`, "utf8");
    const { runUiContractCheck } = await import(`${pathToFileURL(CHECK_SCRIPT).href}?empty-transition=${Date.now()}-${index}`);
    await assert.rejects(
      runUiContractCheck(
        { root, baseline: baselinePath, writeBaseline: true, pruneBaseline: false },
        { crashAtManagedPhase: ({ target, phase }) => { if (target === "baseline" && phase === "installed") throw new Error("leave journal"); } },
      ),
      /leave journal/,
    );
    const journalPath = join(outputRoot, ".design-consultant-ui-baseline-transaction.json");
    const journal = JSON.parse(await readFile(journalPath, "utf8"));
    const oldBaselineRaw = Buffer.from(journal.oldBaseline, "base64");
    const oldLockRaw = Buffer.from(journal.oldLock, "base64");
    const noOpLockRaw = variant.reencodeLock
      ? Buffer.from(JSON.stringify(JSON.parse(oldLockRaw.toString("utf8"))))
      : oldLockRaw;
    if (variant.reencodeLock) assert.notEqual(hash(noOpLockRaw), hash(oldLockRaw));
    journal.newBaseline = journal.oldBaseline;
    journal.newBaselineHash = journal.oldBaselineHash;
    journal.newLock = noOpLockRaw.toString("base64");
    journal.newLockHash = hash(noOpLockRaw);
    await rm(resolve(outputRoot, ...journal.baselineTemp.split("/")), { force: true });
    await rm(resolve(outputRoot, ...journal.lockTemp.split("/")), { force: true });
    await writeFile(baselinePath, oldBaselineRaw);
    await writeFile(lockPath, oldLockRaw);
    const journalRaw = `${JSON.stringify(journal, null, 2)}\n`;
    await writeFile(journalPath, journalRaw, "utf8");

    const result = runProcess(root, ["--baseline", baselinePath]);

    assert.equal(result.status, 2, `${variant.name}: ${result.stderr || result.stdout}`);
    assert.match(result.stderr, /empty|no-op|distinct|journal/i);
    assert.deepEqual(await readFile(baselinePath), oldBaselineRaw, variant.name);
    assert.deepEqual(await readFile(lockPath), oldLockRaw, variant.name);
    assert.equal(await readFile(journalPath, "utf8"), journalRaw, variant.name);
  }
});

test("managed recovery rejects a raw-only rewrite of a semantically identical baseline", async () => {
  const root = await fixture();
  const { outputRoot, baselinePath, lockPath, sourcePath } = await managedBaselineFixture(root, {
    source: `export function Managed() { return <div role="dialog" style={{ color: "#123456" }} />; }\n`,
  });
  await writeFile(sourcePath, `export function Managed() { return <><div role="dialog" style={{ color: "#123456" }} /><div role="dialog" /></>; }\n`, "utf8");
  const { runUiContractCheck } = await import(`${pathToFileURL(CHECK_SCRIPT).href}?semantic-baseline=${Date.now()}`);
  await assert.rejects(
    runUiContractCheck(
      { root, baseline: baselinePath, writeBaseline: true, pruneBaseline: false },
      { crashAtManagedPhase: ({ target, phase }) => { if (target === "baseline" && phase === "installed") throw new Error("leave journal"); } },
    ),
    /leave journal/,
  );
  const journalPath = join(outputRoot, ".design-consultant-ui-baseline-transaction.json");
  const journal = JSON.parse(await readFile(journalPath, "utf8"));
  const oldBaselineRaw = Buffer.from(journal.oldBaseline, "base64");
  const oldBaseline = JSON.parse(oldBaselineRaw.toString("utf8"));
  assert.equal(oldBaseline.issues.length, 2);
  const semanticNoOpBaselineRaw = Buffer.from(JSON.stringify({
    issues: [...oldBaseline.issues].reverse(),
    schemaVersion: oldBaseline.schemaVersion,
  }));
  assert.notEqual(hash(semanticNoOpBaselineRaw), hash(oldBaselineRaw));
  const oldLockRaw = Buffer.from(journal.oldLock, "base64");
  const newLock = JSON.parse(oldLockRaw.toString("utf8"));
  newLock.files["checks/ui-contract-baseline.json"].generatedHash = hash(semanticNoOpBaselineRaw);
  const newLockRaw = Buffer.from(JSON.stringify(newLock));
  assert.notEqual(hash(newLockRaw), hash(oldLockRaw));
  journal.newBaseline = semanticNoOpBaselineRaw.toString("base64");
  journal.newBaselineHash = hash(semanticNoOpBaselineRaw);
  journal.newLock = newLockRaw.toString("base64");
  journal.newLockHash = hash(newLockRaw);
  await rm(resolve(outputRoot, ...journal.baselineTemp.split("/")), { force: true });
  await rm(resolve(outputRoot, ...journal.lockTemp.split("/")), { force: true });
  await writeFile(baselinePath, oldBaselineRaw);
  await writeFile(lockPath, oldLockRaw);
  const journalRaw = `${JSON.stringify(journal, null, 2)}\n`;
  await writeFile(journalPath, journalRaw, "utf8");

  const result = runProcess(root, ["--baseline", baselinePath]);

  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stderr, /semantic.*baseline|baseline.*no-op/i);
  assert.deepEqual(await readFile(baselinePath), oldBaselineRaw);
  assert.deepEqual(await readFile(lockPath), oldLockRaw);
  assert.equal(await readFile(journalPath, "utf8"), journalRaw);
});

test("managed recovery compares canonically equivalent Unicode fingerprints by exact Map identity", async () => {
  const root = await fixture();
  const { outputRoot, baselinePath, lockPath, sourcePath } = await managedBaselineFixture(root);
  await writeFile(sourcePath, `export function Managed() { return <><div role="dialog" /><div role="dialog" /></>; }\n`, "utf8");
  const { runUiContractCheck } = await import(`${pathToFileURL(CHECK_SCRIPT).href}?unicode-semantic-baseline=${Date.now()}`);
  await assert.rejects(
    runUiContractCheck(
      { root, baseline: baselinePath, writeBaseline: true, pruneBaseline: false },
      { crashAtManagedPhase: ({ target, phase }) => { if (target === "baseline" && phase === "installed") throw new Error("leave Unicode journal"); } },
    ),
    /leave Unicode journal/,
  );
  const journalPath = join(outputRoot, ".design-consultant-ui-baseline-transaction.json");
  const journal = JSON.parse(await readFile(journalPath, "utf8"));
  const matchedHash = "a".repeat(64);
  const nfcFile = "src/caf\u00e9.tsx";
  const nfdFile = "src/cafe\u0301.tsx";
  const entry = (file) => ({
    fingerprint: `literal-color:${file}:${matchedHash}`,
    rule: "literal-color",
    file,
    firstSeen: "2026-07-27",
    count: 1,
  });
  const nfcEntry = entry(nfcFile);
  const nfdEntry = entry(nfdFile);
  assert.notEqual(nfcEntry.fingerprint, nfdEntry.fingerprint);
  assert.equal(nfcEntry.fingerprint.localeCompare(nfdEntry.fingerprint), 0);
  const oldBaselineRaw = Buffer.from(`${JSON.stringify({ schemaVersion: 1, issues: [nfcEntry, nfdEntry] }, null, 2)}\n`);
  const newBaselineRaw = Buffer.from(JSON.stringify({ issues: [nfdEntry, nfcEntry], schemaVersion: 1 }));
  assert.notEqual(hash(oldBaselineRaw), hash(newBaselineRaw));
  const oldLock = JSON.parse(Buffer.from(journal.oldLock, "base64").toString("utf8"));
  oldLock.files["checks/ui-contract-baseline.json"].generatedHash = hash(oldBaselineRaw);
  const oldLockRaw = Buffer.from(`${JSON.stringify(oldLock, null, 2)}\n`);
  const newLock = structuredClone(oldLock);
  newLock.files["checks/ui-contract-baseline.json"].generatedHash = hash(newBaselineRaw);
  const newLockRaw = Buffer.from(JSON.stringify(newLock));
  journal.oldBaseline = oldBaselineRaw.toString("base64");
  journal.oldBaselineHash = hash(oldBaselineRaw);
  journal.newBaseline = newBaselineRaw.toString("base64");
  journal.newBaselineHash = hash(newBaselineRaw);
  journal.oldLock = oldLockRaw.toString("base64");
  journal.oldLockHash = hash(oldLockRaw);
  journal.newLock = newLockRaw.toString("base64");
  journal.newLockHash = hash(newLockRaw);
  await rm(resolve(outputRoot, ...journal.baselineTemp.split("/")), { force: true });
  await rm(resolve(outputRoot, ...journal.lockTemp.split("/")), { force: true });
  await writeFile(baselinePath, oldBaselineRaw);
  await writeFile(lockPath, oldLockRaw);
  const journalRaw = `${JSON.stringify(journal, null, 2)}\n`;
  await writeFile(journalPath, journalRaw, "utf8");

  const result = runProcess(root, ["--baseline", baselinePath]);

  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stderr, /semantic.*baseline|baseline.*no-op/i);
  assert.deepEqual(await readFile(baselinePath), oldBaselineRaw);
  assert.deepEqual(await readFile(lockPath), oldLockRaw);
  assert.equal(await readFile(journalPath, "utf8"), journalRaw);
});

test("managed recovery retains a valid journal when current bytes match no proven state", async () => {
  const root = await fixture();
  const { outputRoot, baselinePath, lockPath, sourcePath } = await managedBaselineFixture(root);
  await writeFile(sourcePath, `export function Managed() { return <><div role="dialog" /><div role="dialog" /></>; }\n`, "utf8");
  const { runUiContractCheck } = await import(`${pathToFileURL(CHECK_SCRIPT).href}?concurrent=${Date.now()}`);
  await assert.rejects(
    runUiContractCheck(
      { root, baseline: baselinePath, writeBaseline: true, pruneBaseline: false },
      { crashAtManagedPhase: ({ target, phase }) => { if (target === "baseline" && phase === "installed") throw new Error("leave valid journal"); } },
    ),
    /leave valid journal/,
  );
  const concurrent = JSON.parse(await readFile(baselinePath, "utf8"));
  concurrent.issues[0].count = 3;
  await writeFile(baselinePath, `${JSON.stringify(concurrent, null, 2)}\n`, "utf8");
  const journalPath = join(outputRoot, ".design-consultant-ui-baseline-transaction.json");
  const baselineBefore = await readFile(baselinePath);
  const lockBefore = await readFile(lockPath);
  const journalBefore = await readFile(journalPath);

  const result = runProcess(root, ["--baseline", baselinePath]);

  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stderr, /concurrent bytes|journal retained/i);
  assert.deepEqual(await readFile(baselinePath), baselineBefore);
  assert.deepEqual(await readFile(lockPath), lockBefore);
  assert.deepEqual(await readFile(journalPath), journalBefore);
});

test("managed baseline recovery rejects staged paths that alias protected artifacts", async () => {
  const root = await fixture();
  const { baselinePath, lockPath } = await managedBaselineFixture(root);
  const baselineRaw = await readFile(baselinePath);
  const lockRaw = await readFile(lockPath);
  const outputRoot = dirname(lockPath);
  const journalPath = join(outputRoot, ".design-consultant-ui-baseline-transaction.json");
  const journal = {
    schemaVersion: 1,
    operation: "write",
    status: "prepared",
    baseline: "checks/ui-contract-baseline.json",
    baselineTemp: "checks/ui-contract-baseline.json",
    lockTemp: ".design-consultant-lock.json",
    oldBaselineHash: hash(baselineRaw),
    newBaselineHash: hash(baselineRaw),
    oldLockHash: hash(lockRaw),
    newLockHash: hash(lockRaw),
    oldBaseline: baselineRaw.toString("base64"),
    newBaseline: baselineRaw.toString("base64"),
    oldLock: lockRaw.toString("base64"),
    newLock: lockRaw.toString("base64"),
  };
  await writeFile(journalPath, `${JSON.stringify(journal, null, 2)}\n`, "utf8");

  const result = runProcess(root, ["--baseline", baselinePath]);

  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stderr, /journal contract|staged|temporary/i);
  assert.deepEqual(await readFile(baselinePath), baselineRaw);
  assert.deepEqual(await readFile(lockPath), lockRaw);
});

test("adapter paths exempt only direct UI imports", async () => {
  const root = await fixture();
  await mkdir(join(root, "src/adapters"), { recursive: true });
  await writeFile(join(root, "src/adapters/Bad.tsx"), `
import { Select } from "antd";
export function Bad() {
  return <div style={{ color: "#123456", background: "var(--missing-token)" }} onClick={() => undefined}>
    <select /><table /><section role="dialog" /><button><svg aria-hidden="true" /></button><Select />
  </div>;
}
`, "utf8");
  const result = run(root);
  const rules = new Set(result.json.issues.map((issue) => issue.rule));
  assert.equal(rules.has("external-ui-import"), false);
  for (const rule of ["undefined-token", "literal-color", "non-interactive-click", "raw-select", "raw-table", "raw-dialog", "icon-button-name"]) {
    assert.equal(rules.has(rule), true, `missing adapter rule ${rule}`);
  }
});

test("manifest-mapped implementation files exempt only direct UI imports", async () => {
  const root = await fixture();
  await mkdir(join(root, "design-system/components"), { recursive: true });
  await writeFile(join(root, "design-system/components/manifest.json"), `${JSON.stringify({
    families: [{ id: "choice-field", framework: "react", status: "mapped", implementationPath: "../src/Mapped.tsx" }],
  })}\n`, "utf8");
  await writeFile(join(root, "src/Mapped.tsx"), `
import { Select } from "antd";
export function Mapped() {
  return <div style={{ color: "#123456", background: "var(--missing-token)" }} onClick={() => undefined}>
    <select /><table /><aside aria-modal="true" /><button><svg aria-hidden="true" /></button><Select />
  </div>;
}
`, "utf8");
  const result = run(root);
  const rules = new Set(result.json.issues.map((issue) => issue.rule));
  assert.equal(rules.has("external-ui-import"), false);
  for (const rule of ["undefined-token", "literal-color", "non-interactive-click", "raw-select", "raw-table", "raw-dialog", "icon-button-name"]) {
    assert.equal(rules.has(rule), true, `missing mapped implementation rule ${rule}`);
  }
});
