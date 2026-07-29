import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import test from "node:test";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = resolve(SCRIPT_DIR, "..");
const REPO_ROOT = resolve(SKILL_ROOT, "..", "..");
const EVAL_ROOT = join(REPO_ROOT, "evals", "design-consultant");
const MANAGE_SCRIPT = join(SCRIPT_DIR, "manage-visual-system.mjs");
const AUDIT_SCRIPT = join(SCRIPT_DIR, "build-adoption-instruction-audit.mjs");
const FIXTURES = join(EVAL_ROOT, "fixtures");
const AUDIT_ROOT = join(EVAL_ROOT, "v0.10-instruction-audit");
const AGENT_EVAL_ROOT = join(EVAL_ROOT, "v0.10-agent-eval", "iteration-1");
const WITH_SKILL_SOURCE_COMMIT = "5f31a647af3a4d40c67230cd7c058232b704a4fd";
const CONFIGURATIONS = ["with_skill", "old_skill"];
const EVAL_IDS = [
  "E21-mature-system-preserve",
  "E22-partial-system-augment",
  "E23-legacy-ratchet",
  "E24-non-react-preserve",
];

async function text(path) {
  return readFile(path, "utf8");
}

async function json(path) {
  return JSON.parse(await text(path));
}

function run(command, args, options = {}) {
  return spawnSync(command, args, { encoding: "utf8", ...options });
}

function runManage(project, args) {
  const result = run(process.execPath, [MANAGE_SCRIPT, ...args, "--target", project]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function runNpmScript(cwd, script) {
  return process.platform === "win32"
    ? run(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `npm run ${script}`], { cwd })
    : run("npm", ["run", script], { cwd });
}

function assertNpmScript(cwd, script) {
  const result = runNpmScript(cwd, script);
  assert.equal(result.status, 0, `${script}:\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
}

function installGeneratedPackage(cwd) {
  const result = process.platform === "win32"
    ? run(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "npm install --ignore-scripts --no-audit --no-fund --no-package-lock"], { cwd, timeout: 150000 })
    : run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--no-package-lock"], { cwd, timeout: 150000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function runGit(cwd, args, expectedStatus = 0) {
  const result = run("git", args, { cwd });
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  return result.stdout.trim();
}

async function makeWorkspace(t, prefix) {
  const root = await mkdtemp(join(tmpdir(), prefix));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function write(path, content) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

async function fileSha256(path) {
  return sha256(await readFile(path));
}

function parseOfficialViewer(html) {
  const prefix = "const EMBEDDED_DATA = ";
  const start = html.indexOf(prefix);
  const stateMarker = html.indexOf("// ---- State ----", start);
  const end = html.lastIndexOf(";", stateMarker);
  assert.ok(start >= 0 && stateMarker > start && end > start, "official viewer embedded data markers");
  return JSON.parse(html.slice(start + prefix.length, end));
}

function rounded(value, digits = 4) {
  return Number(value.toFixed(digits));
}

function aggregate(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.length > 1
    ? values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (values.length - 1)
    : 0;
  return {
    mean: rounded(mean),
    stddev: rounded(Math.sqrt(variance)),
    min: Math.min(...values),
    max: Math.max(...values),
    samples: values.length,
  };
}

async function createAuditRepository(t, prefix) {
  const repository = await makeWorkspace(t, prefix);
  runGit(repository, ["init", "-b", "audit-fixture"]);
  runGit(repository, ["config", "user.name", "Task 8 Test"]);
  runGit(repository, ["config", "user.email", "task8@example.invalid"]);

  await write(join(repository, "skills/design-consultant/SKILL.md"), "# v0.9 instruction surface\n");
  await write(join(repository, "skills/design-consultant/README.md"), "# v0.9\n");
  await write(join(repository, "skills/design-consultant/references/legacy.md"), "greenfield only\n");
  runGit(repository, ["add", "."]);
  runGit(repository, ["commit", "-m", "v0.9 source"]);
  const sourceCommit = runGit(repository, ["rev-parse", "HEAD"]);

  for (const relativePath of [
    "SKILL.md",
    "README.md",
    "references/existing-system-adoption.md",
    "references/project-visual-system-workflow.md",
    "references/design-system-enforcement.md",
  ]) {
    const destination = join(repository, "skills/design-consultant", ...relativePath.split("/"));
    await mkdir(dirname(destination), { recursive: true });
    await cp(join(SKILL_ROOT, ...relativePath.split("/")), destination);
  }
  await mkdir(join(repository, "evals/design-consultant"), { recursive: true });
  await cp(join(EVAL_ROOT, "evals.json"), join(repository, "evals/design-consultant/evals.json"));
  await write(join(repository, "evals/design-consultant/v0.10-source-manifest.json"), `${JSON.stringify({
    schemaVersion: 1,
    sourceCommit,
    sourcePath: "skills/design-consultant",
    release: "v0.9",
  }, null, 2)}\n`);
  runGit(repository, ["add", "."]);
  runGit(repository, ["commit", "-m", "v0.10 instruction surface"]);
  return { repository, sourceCommit };
}

test("Task 8 appends E21-E24 without changing historical E15-E20", async () => {
  const evaluation = await json(join(EVAL_ROOT, "evals.json"));
  const ids = evaluation.evals.map((item) => item.id);
  assert.deepEqual(ids.slice(14, 20), [
    "E15-dashboard-visualization-kit",
    "E16-truthful-flow-interaction",
    "E17-negative-exact-lookup",
    "E18-editorial-utility-fusion",
    "E19-offline-responsive-runtime",
    "E20-implicit-ui-bootstrap",
  ]);
  assert.deepEqual(ids.slice(20, 24), EVAL_IDS);
});

test("Skill routing sends coherent tokens or shared components through existing-system review", async () => {
  const skill = await text(join(SKILL_ROOT, "SKILL.md"));
  const reference = await text(join(SKILL_ROOT, "references", "existing-system-adoption.md"));
  for (const route of ["greenfield", "existing-ui-without-system", "existing-design-system"]) {
    assert.match(skill, new RegExp(`\\b${route}\\b`));
  }
  assert.match(skill, /coherent tokens|成体系的 token/i);
  assert.match(skill, /shared components|共享组件/i);
  assert.match(skill, /existing-system-adoption\.md/);
  assert.match(reference, /preserve/);
  assert.match(reference, /augment/);
  assert.match(reference, /migrate/);
  assert.match(reference, /draft plan/);
  assert.match(reference, /不得自动迁移|绝不自动迁移/);
  assert.match(reference, /canonical runtime/);
  assert.match(reference, /generation\/current/);
  assert.match(reference, /projectIdentity/);
  assert.match(reference, /fileClosure v3/);
  assert.match(reference, /startCommand/);
  assert.match(reference, /external baseUrl/);
});

test("greenfield generated package executes adoption check and explicit UI ratchet", async (t) => {
  const project = await makeWorkspace(t, "design-consultant-task8-greenfield-");
  await write(join(project, "package.json"), `${JSON.stringify({
    name: "task-8-greenfield",
    private: true,
    dependencies: { react: "19.2.8", "react-dom": "19.2.8" },
  }, null, 2)}\n`);
  const appPath = join(project, "src/App.tsx");
  await write(appPath, "export function App() { return <select aria-label=\"Known\" />; }\n");
  runManage(project, ["init"]);
  const output = join(project, "design-system");

  assertNpmScript(output, "adoption:check");
  assertNpmScript(output, "ui:baseline");
  assertNpmScript(output, "ui:check");

  const baseline = await json(join(output, "checks", "ui-contract-baseline.json"));
  assert.equal(baseline.schemaVersion, 1);
  assert.ok(baseline.issues.length > 0, "baseline must include project source issues");

  await writeFile(appPath, "export function App() { return <><select aria-label=\"Known\" /><select aria-label=\"New\" /></>; }\n", "utf8");
  const ratchet = runNpmScript(output, "ui:check");
  assert.notEqual(ratchet.status, 0, ratchet.stdout || ratchet.stderr);
  assert.match(ratchet.stdout, /"baselineStatus":\s*"new"/);
});

test("confirmed adoption package retains and executes adoption and UI ratchet scripts", async (t) => {
  const workspace = await makeWorkspace(t, "design-consultant-task8-adoption-");
  const project = join(workspace, "existing-mature-react");
  await cp(join(FIXTURES, "existing-mature-react"), project, { recursive: true });
  runManage(project, ["extract"]);

  const output = join(project, "design-system");
  const planPath = join(output, "adoption", "adoption-plan.json");
  const plan = await json(planPath);
  plan.status = "confirmed";
  plan.strategy = "augment";
  for (const mapping of plan.tokenMappings) mapping.status = "rejected";
  for (const mapping of plan.componentMappings) {
    mapping.status = "rejected";
    mapping.strategy = "reject";
  }
  plan.componentMappings.push({
    component: "status",
    strategy: "generate",
    approved: true,
    status: "confirmed",
  });
  await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  runManage(project, ["adopt"]);

  const packageJson = await json(join(output, "package.json"));
  installGeneratedPackage(output);
  for (const script of ["adoption:check", "ui:baseline", "ui:check"]) {
    assert.equal(typeof packageJson.scripts[script], "string", script);
    assertNpmScript(output, script);
  }
});

test("v0.10 CI targets browser-free contracts on three OSes and full Ubuntu release gates", async () => {
  const workflow = await text(join(REPO_ROOT, ".github", "workflows", "design-consultant-v0.10.yml"));
  const [contracts, visual] = workflow.split(/^  visual-regression:/m);
  assert.ok(visual, "visual-regression job must exist");
  for (const os of ["ubuntu-latest", "windows-latest", "macos-latest"]) assert.match(contracts, new RegExp(os));
  assert.match(contracts, /existing-system-adoption\.test\.mjs/);
  assert.match(contracts, /task-8-integration\.test\.mjs/);
  assert.doesNotMatch(contracts, /npm run test:node|npm run test:components|npm run visual:test/);
  for (const capability of ["inventory", "compatibility", "bridge", "adapter", "ratchet"]) {
    assert.match(contracts, new RegExp(capability, "i"));
  }
  assert.match(workflow, /fetch-depth:\s*0/);
  assert.match(visual, /playwright install --with-deps chromium/);
  assert.match(visual, /fonts-noto-cjk/);
  for (const command of ["npm run test:node", "npm run catalog:check", "npm run visual:test"]) {
    assert.match(visual, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(visual, /build-adoption-instruction-audit\.mjs build/);
  assert.match(visual, /git diff --exit-code/);
  assert.doesNotMatch(workflow, /if:\s*runner\.os|continue-on-error/);
});

test("instruction audit uses a pinned v0.9 commit without main and emits no agent artifacts", async (t) => {
  const { repository, sourceCommit } = await createAuditRepository(t, "design-consultant-task8-audit-");
  const localMain = run("git", ["show-ref", "--verify", "refs/heads/main"], { cwd: repository });
  assert.notEqual(localMain.status, 0, localMain.stdout);

  const built = run(process.execPath, [AUDIT_SCRIPT, "build", "--repo-root", repository]);
  assert.equal(built.status, 0, built.stderr || built.stdout);
  const output = join(repository, "evals/design-consultant/v0.10-instruction-audit");
  const audit = await json(join(output, "static-audit.json"));
  const snapshot = await json(join(output, "old-skill-snapshot/snapshot-manifest.json"));
  assert.equal(audit.kind, "instruction-static-audit");
  assert.equal(audit.source.commit, sourceCommit);
  assert.equal(snapshot.source.commit, sourceCommit);
  assert.deepEqual(audit.evalIds, EVAL_IDS);
  for (const forbidden of ["with-skill", "old-skill", "timing.json", "benchmark.json", "viewer"]) {
    await assert.rejects(access(join(output, forbidden)), { code: "ENOENT" });
  }
});

test("instruction audit rejects every non-allowlisted output path without deleting it", async (t) => {
  const cases = [
    { name: "repository root", output: ({ repository }) => repository },
    { name: "repository parent", output: ({ container }) => container },
    { name: "external absolute directory", output: ({ container }) => join(container, "external-audit") },
    { name: "other repository directory", output: ({ repository }) => join(repository, "evals/design-consultant/not-the-audit") },
  ];

  for (const item of cases) {
    await t.test(item.name, async (caseTest) => {
      const container = await makeWorkspace(caseTest, "design-consultant-task8-output-boundary-");
      const repository = join(container, "repository");
      await mkdir(repository, { recursive: true });
      const fixture = await createAuditRepository(caseTest, "design-consultant-task8-output-fixture-");
      await cp(fixture.repository, repository, { recursive: true });
      const outputRoot = item.output({ container, repository });
      const sentinel = join(outputRoot, "do-not-delete.txt");
      await write(sentinel, item.name);

      const result = run(process.execPath, [
        AUDIT_SCRIPT,
        "build",
        "--repo-root",
        repository,
        "--output-root",
        outputRoot,
      ]);
      assert.notEqual(result.status, 0, `${item.name} unexpectedly succeeded`);
      assert.match(result.stderr, /output root must equal evals\/design-consultant\/v0\.10-instruction-audit/i);
      assert.equal(await text(sentinel), item.name);
    });
  }
});

test("instruction audit validates eval inputs before replacing the existing output", async (t) => {
  const { repository } = await createAuditRepository(t, "design-consultant-task8-input-validation-");
  const outputRoot = join(repository, "evals/design-consultant/v0.10-instruction-audit");
  const sentinel = join(outputRoot, "do-not-delete.txt");
  await write(sentinel, "preserve-existing-output");
  const evaluation = await json(join(repository, "evals/design-consultant/evals.json"));
  evaluation.evals = evaluation.evals.filter((item) => item.id !== "E24-non-react-preserve");
  await writeFile(join(repository, "evals/design-consultant/evals.json"), `${JSON.stringify(evaluation, null, 2)}\n`, "utf8");

  const result = run(process.execPath, [AUDIT_SCRIPT, "build", "--repo-root", repository]);
  assert.notEqual(result.status, 0, "invalid eval input unexpectedly succeeded");
  assert.match(result.stderr, /Missing eval E24-non-react-preserve/);
  assert.equal(await text(sentinel), "preserve-existing-output");
});

test("acceptance cites official evidence with honest model and replayability limits", async () => {
  const acceptance = await text(join(EVAL_ROOT, "v0.10-acceptance.md"));
  const report = await text(join(EVAL_ROOT, "evaluation-report.md"));
  for (const content of [acceptance, report]) {
    assert.match(content, /instruction\/static audit|指令静态审计/i);
    assert.match(content, /v0\.10-agent-eval\/iteration-1/);
    assert.match(content, /16\/16/);
    assert.match(content, /4\/16/);
    assert.match(content, /每个配置每题(?:只有|仅)一次/);
    assert.match(content, /(?:token.{0,20}(?:不可用|缺失|未暴露)|(?:不可用|缺失|未暴露).{0,20}token)/i);
    assert.match(content, /没有真实项目路径|不含真实项目路径/);
    assert.match(content, /gpt-5\.6-terra.{0,80}控制器配置|控制器配置.{0,80}gpt-5\.6-terra/is);
    assert.match(content, /GPT-5.{0,80}(?:generic|通用|泛化|家族标签)/is);
    assert.match(content, /(?:task.?id|任务 ID).{0,40}(?:unavailable|不可用|未提供)/is);
    assert.match(content, /(?:transcript|执行转录).{0,40}(?:unavailable|不可用|未提供|缺失)/is);
    assert.match(content, /不可独立重放|not independently replayable/i);
    assert.doesNotMatch(content, /pending-controller|待控制器执行/i);
  }
});

test("official agent evaluation links every configuration and run to immutable source provenance", async () => {
  const provenance = await json(join(AGENT_EVAL_ROOT, "provenance.json"));
  const sourceManifestPath = join(EVAL_ROOT, "v0.10-source-manifest.json");
  const sourceManifest = await json(sourceManifestPath);
  const snapshotManifestPath = join(AUDIT_ROOT, "old-skill-snapshot", "snapshot-manifest.json");
  const snapshotManifest = await json(snapshotManifestPath);
  const withSkillTree = runGit(REPO_ROOT, ["rev-parse", `${WITH_SKILL_SOURCE_COMMIT}:skills/design-consultant`]);
  const oldSkillTree = runGit(REPO_ROOT, ["rev-parse", `${sourceManifest.sourceCommit}:skills/design-consultant`]);
  const eolAttributes = runGit(REPO_ROOT, [
    "check-attr",
    "eol",
    "--",
    "evals/design-consultant/v0.10-source-manifest.json",
    "evals/design-consultant/v0.10-instruction-audit/old-skill-snapshot/snapshot-manifest.json",
    "evals/design-consultant/v0.10-agent-eval/iteration-1/provenance.json",
    "evals/design-consultant/v0.10-agent-eval/iteration-1/benchmark.json",
    "evals/design-consultant/v0.10-agent-eval/iteration-1/review.html",
  ]).split("\n");
  assert.equal(eolAttributes.length, 5);
  for (const attribute of eolAttributes) assert.match(attribute, /: eol: lf$/);

  assert.equal(provenance.schemaVersion, 1);
  assert.equal(provenance.kind, "controller-owned-agent-eval-provenance");
  assert.deepEqual(provenance.attestation, {
    owner: "controller",
    taskId: null,
    transcript: null,
    independentlyReplayable: false,
  });
  assert.deepEqual(provenance.modelEvidence, {
    controllerConfiguredModel: "gpt-5.6-terra",
    configurationAuthority: "controller-owned-attestation",
    runExecutionLabel: "GPT-5",
    runLabelGranularity: "generic-family-label",
    exactModelProvenPerRun: false,
  });
  assert.deepEqual(provenance.sources.with_skill, {
    commit: WITH_SKILL_SOURCE_COMMIT,
    path: "skills/design-consultant",
    tree: withSkillTree,
    attestation: "controller-owned-input-selection",
  });
  assert.equal(provenance.sources.old_skill.commit, sourceManifest.sourceCommit);
  assert.equal(provenance.sources.old_skill.path, sourceManifest.sourcePath);
  assert.equal(provenance.sources.old_skill.tree, oldSkillTree);
  assert.deepEqual(provenance.sources.old_skill.sourceManifest, {
    path: "evals/design-consultant/v0.10-source-manifest.json",
    sha256: await fileSha256(sourceManifestPath),
  });
  assert.deepEqual(provenance.sources.old_skill.snapshotManifest, {
    path: "evals/design-consultant/v0.10-instruction-audit/old-skill-snapshot/snapshot-manifest.json",
    sha256: await fileSha256(snapshotManifestPath),
    sourceCommit: snapshotManifest.source.commit,
  });
  assert.equal(provenance.runs.length, EVAL_IDS.length * CONFIGURATIONS.length);

  for (const evalId of EVAL_IDS) {
    for (const variant of CONFIGURATIONS) {
      const source = provenance.sources[variant];
      const configurationRoot = join(AGENT_EVAL_ROOT, `eval-${evalId}`, variant);
      const configuration = await json(join(configurationRoot, "provenance.json"));
      assert.equal(configuration.evalId, evalId);
      assert.equal(configuration.variant, variant);
      assert.equal(configuration.rootProvenance, "../../provenance.json");
      assert.equal(configuration.sourceRef, `#/sources/${variant}`);
      assert.equal(configuration.sourceCommit, source.commit);
      assert.equal(configuration.sourceTree, source.tree);
      assert.deepEqual(configuration.runs, [{ runNumber: 1, provenance: "run-1/provenance.json" }]);

      const run = await json(join(configurationRoot, "run-1", "provenance.json"));
      assert.equal(run.evalId, evalId);
      assert.equal(run.variant, variant);
      assert.equal(run.runNumber, 1);
      assert.equal(run.rootProvenance, "../../../provenance.json");
      assert.equal(run.configurationProvenance, "../provenance.json");
      assert.equal(run.sourceRef, `#/sources/${variant}`);
      assert.equal(run.sourceCommit, source.commit);
      assert.equal(run.sourceTree, source.tree);
      assert.deepEqual(run.attestation, {
        owner: "controller",
        taskId: null,
        transcript: null,
        independentlyReplayable: false,
      });
      assert.equal(run.modelEvidence.controllerConfiguredModel, "gpt-5.6-terra");
      assert.equal(run.modelEvidence.runExecutionLabel, "GPT-5");
      assert.equal(run.modelEvidence.exactModelProvenPerRun, false);
      assert.deepEqual(run.artifacts, {
        execution: "outputs/execution.json",
        response: "outputs/response.md",
        timing: "timing.json",
        grading: "grading.json",
      });
    }
  }
});

test("official agent evaluation execution timing grading and benchmark are fully cross-validated", async () => {
  const benchmark = await json(join(AGENT_EVAL_ROOT, "benchmark.json"));
  assert.equal(benchmark.metadata.runs_per_configuration, 1);
  assert.deepEqual(benchmark.metadata.evals_run, EVAL_IDS);
  assert.equal(benchmark.runs.length, EVAL_IDS.length * CONFIGURATIONS.length);
  const observed = Object.fromEntries(CONFIGURATIONS.map((configuration) => [configuration, { passRates: [], times: [] }]));

  for (const benchmarkRun of benchmark.runs) {
    const { eval_id: evalId, configuration: variant, run_number: runNumber } = benchmarkRun;
    assert.ok(EVAL_IDS.includes(evalId), evalId);
    assert.ok(CONFIGURATIONS.includes(variant), variant);
    assert.equal(runNumber, 1);
    const runRoot = join(AGENT_EVAL_ROOT, `eval-${evalId}`, variant, `run-${runNumber}`);
    const execution = await json(join(runRoot, "outputs", "execution.json"));
    const timing = await json(join(runRoot, "timing.json"));
    const grading = await json(join(runRoot, "grading.json"));

    assert.equal(execution.evalId, evalId);
    assert.equal(execution.variant, variant);
    assert.equal(execution.status, "completed");
    assert.equal(execution.model, "GPT-5");
    assert.equal(execution.totalTokens, null);
    assert.deepEqual(Object.keys(timing).sort(), [
      "duration_ms",
      "executor_end",
      "executor_start",
      "note",
      "total_duration_seconds",
      "total_tokens",
    ]);
    assert.equal(timing.total_tokens, null);
    assert.ok(Number.isInteger(timing.duration_ms) && timing.duration_ms >= 0);
    assert.equal(timing.total_duration_seconds, timing.duration_ms / 1000);
    assert.equal(timing.executor_start, execution.startedAt);
    assert.equal(timing.executor_end, execution.finishedAt);
    assert.ok(!Number.isNaN(Date.parse(timing.executor_start)), timing.executor_start);
    assert.ok(!Number.isNaN(Date.parse(timing.executor_end)), timing.executor_end);
    if (timing.executor_start === timing.executor_end) {
      assert.equal(timing.duration_ms, 0);
      assert.equal(benchmarkRun.result.time_seconds, null);
    } else {
      assert.ok(timing.duration_ms > 0);
      assert.ok(Number.isFinite(benchmarkRun.result.time_seconds) && benchmarkRun.result.time_seconds > 0);
    }

    for (const expectation of grading.expectations) {
      assert.deepEqual(Object.keys(expectation).sort(), ["evidence", "passed", "text"]);
      assert.equal(typeof expectation.text, "string");
      assert.equal(typeof expectation.passed, "boolean");
      assert.equal(typeof expectation.evidence, "string");
    }
    const passed = grading.expectations.filter((item) => item.passed).length;
    const failed = grading.expectations.length - passed;
    const expectedSummary = {
      passed,
      failed,
      total: grading.expectations.length,
      pass_rate: passed / grading.expectations.length,
    };
    assert.deepEqual(grading.summary, expectedSummary);
    assert.deepEqual(benchmarkRun.expectations, grading.expectations);
    assert.deepEqual({
      passed: benchmarkRun.result.passed,
      failed: benchmarkRun.result.failed,
      total: benchmarkRun.result.total,
      pass_rate: benchmarkRun.result.pass_rate,
    }, expectedSummary);
    assert.equal(benchmarkRun.result.tokens, timing.total_tokens);
    assert.equal(benchmarkRun.result.tool_calls, grading.execution_metrics.total_tool_calls ?? null);
    assert.equal(benchmarkRun.result.errors, grading.execution_metrics.errors_encountered);
    const gradingTotal = grading.timing.total_duration_seconds;
    const expectedTime = timing.executor_start === timing.executor_end
      ? null
      : Number.isFinite(gradingTotal) && gradingTotal > 0
        ? gradingTotal
        : timing.total_duration_seconds;
    assert.equal(benchmarkRun.result.time_seconds, expectedTime);
    observed[variant].passRates.push(expectedSummary.pass_rate);
    if (expectedTime !== null) observed[variant].times.push(expectedTime);
  }

  for (const variant of CONFIGURATIONS) {
    assert.deepEqual(benchmark.run_summary[variant].pass_rate, aggregate(observed[variant].passRates));
    assert.deepEqual(benchmark.run_summary[variant].time_seconds, aggregate(observed[variant].times));
  }
  const passDelta = benchmark.run_summary.with_skill.pass_rate.mean - benchmark.run_summary.old_skill.pass_rate.mean;
  const timeDelta = benchmark.run_summary.with_skill.time_seconds.mean - benchmark.run_summary.old_skill.time_seconds.mean;
  assert.equal(benchmark.run_summary.delta.pass_rate, `${passDelta >= 0 ? "+" : ""}${passDelta.toFixed(2)}`);
  assert.equal(benchmark.run_summary.delta.time_seconds, `${timeDelta >= 0 ? "+" : ""}${timeDelta.toFixed(1)}`);
  assert.equal(benchmark.run_summary.delta.tokens, null);
});

test("official viewer embeds all runs and benchmark and has hash-linked generator provenance", async () => {
  const benchmarkPath = join(AGENT_EVAL_ROOT, "benchmark.json");
  const reviewPath = join(AGENT_EVAL_ROOT, "review.html");
  const provenancePath = join(AGENT_EVAL_ROOT, "provenance.json");
  const benchmark = await json(benchmarkPath);
  const viewer = await text(reviewPath);
  assert.match(viewer, /Embedded data \(injected by generate_review\.py\)/);
  assert.match(viewer, /id="panel-outputs"/);
  assert.match(viewer, /id="panel-benchmark"/);
  assert.match(viewer, /function renderBenchmark\(\)/);
  const embedded = parseOfficialViewer(viewer);
  assert.equal(embedded.skill_name, "design-consultant v0.10 existing-system adoption");
  assert.equal(embedded.runs.length, EVAL_IDS.length * CONFIGURATIONS.length);
  assert.deepEqual(embedded.benchmark, benchmark);

  const expectedRunIds = [];
  for (const evalId of EVAL_IDS) {
    for (const variant of CONFIGURATIONS) {
      const id = `eval-${evalId}-${variant}-run-1`;
      expectedRunIds.push(id);
      const viewerRun = embedded.runs.find((run) => run.id === id);
      assert.ok(viewerRun, id);
      assert.equal(viewerRun.eval_id, evalId);
      const runRoot = join(AGENT_EVAL_ROOT, `eval-${evalId}`, variant, "run-1");
      const executionOutput = viewerRun.outputs.find((output) => output.name === "execution.json");
      const responseOutput = viewerRun.outputs.find((output) => output.name === "response.md");
      assert.ok(executionOutput && responseOutput, id);
      assert.deepEqual(JSON.parse(executionOutput.content), await json(join(runRoot, "outputs", "execution.json")));
      assert.equal(sha256(Buffer.from(responseOutput.content, "utf8")), await fileSha256(join(runRoot, "outputs", "response.md")));
      assert.deepEqual(viewerRun.grading, await json(join(runRoot, "grading.json")));
    }
  }
  assert.deepEqual(embedded.runs.map((run) => run.id).sort(), expectedRunIds.sort());

  const reviewProvenance = await json(join(AGENT_EVAL_ROOT, "review-provenance.json"));
  assert.equal(reviewProvenance.schemaVersion, 1);
  assert.equal(reviewProvenance.kind, "official-skill-creator-viewer-provenance");
  assert.deepEqual(reviewProvenance.generator, {
    id: "skill-creator/eval-viewer/generate_review.py",
    sha256: "sha256:44d97a35be977331b13b04932927b3beb285862a173f0f15dd052d4f31de5c76",
    templateSha256: "sha256:46abd4e19e482b4aeebea24b135c2d88fb122a63346dbeab7fcecd83828a826d",
  });
  assert.deepEqual(reviewProvenance.inputs, {
    benchmark: "benchmark.json",
    benchmarkSha256: await fileSha256(benchmarkPath),
    evaluationProvenance: "provenance.json",
    evaluationProvenanceSha256: await fileSha256(provenancePath),
  });
  assert.deepEqual(reviewProvenance.output, {
    review: "review.html",
    rawGeneratedSha256: "sha256:4b23ba6bfc88eb228d1f8ed5c5ff941bb554905e11584dd1648b3266e27ef8dc",
    canonicalization: "CRLF/CR to LF after official generation",
    reviewSha256: await fileSha256(reviewPath),
  });
  assert.notEqual(reviewProvenance.output.rawGeneratedSha256, reviewProvenance.output.reviewSha256);
  const committedReview = run("git", ["show", "HEAD:evals/design-consultant/v0.10-agent-eval/iteration-1/review.html"], { cwd: REPO_ROOT });
  assert.equal(committedReview.status, 0, committedReview.stderr || committedReview.stdout);
  assert.equal(sha256(Buffer.from(committedReview.stdout, "utf8")), reviewProvenance.output.reviewSha256);
  assert.match(reviewProvenance.command, /^python <skill-creator-root>\/eval-viewer\/generate_review\.py /);
  assert.match(reviewProvenance.command, /--benchmark evals\/design-consultant\/v0\.10-agent-eval\/iteration-1\/benchmark\.json/);
  assert.match(reviewProvenance.command, /--static evals\/design-consultant\/v0\.10-agent-eval\/iteration-1\/review\.html$/);
  assert.doesNotMatch(reviewProvenance.command, /[A-Za-z]:[\\/]/);

  await access(join(AUDIT_ROOT, "static-audit.json"));
});
