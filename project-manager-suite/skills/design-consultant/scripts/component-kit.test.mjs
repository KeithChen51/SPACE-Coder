import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = join(SCRIPT_DIR, "manage-visual-system.mjs");
const SKILL_ROOT = resolve(SCRIPT_DIR, "..");
const REPO_ROOT = resolve(SKILL_ROOT, "../..");
const TSC_PATH = join(REPO_ROOT, "node_modules/typescript/bin/tsc");
const VITEST_PATH = join(REPO_ROOT, "node_modules/vitest/vitest.mjs");
const workspaces = [];

async function makeReactProject(name) {
  const tempRoot = join(REPO_ROOT, ".tmp");
  await mkdir(tempRoot, { recursive: true });
  const workspace = await mkdtemp(join(tempRoot, "design-consultant-kit-"));
  workspaces.push(workspace);
  const project = join(workspace, name);
  await mkdir(join(project, "src"), { recursive: true });
  await writeFile(join(project, "package.json"), `${JSON.stringify({
    name,
    private: true,
    dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" },
  }, null, 2)}\n`, "utf8");
  return project;
}

function runCliProcess(project, args) {
  return spawnSync(process.execPath, [SCRIPT_PATH, ...args, "--target", project], {
    encoding: "utf8",
  });
}

function runCli(project, args) {
  const result = runCliProcess(project, args);
  assert.equal(result.status, 0, result.stdout || result.stderr);
  return JSON.parse(result.stdout);
}

async function exists(path) {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

test.after(async () => {
  await Promise.all(workspaces.map((workspace) => rm(workspace, { recursive: true, force: true })));
});

test("core 档位只把本项目需要的组件写入 Kit，完整 Library 仍留在 Skill", async () => {
  const project = await makeReactProject("core-kit");
  const result = runCli(project, ["init", "--kit-profile", "core"]);
  const output = join(project, "design-system");
  const kit = JSON.parse(await readFile(join(output, "components/kit.json"), "utf8"));
  const manifest = JSON.parse(await readFile(join(output, "components/manifest.json"), "utf8"));
  const decisions = JSON.parse(await readFile(join(output, "components/decisions.json"), "utf8"));
  const config = JSON.parse(await readFile(join(output, "system.config.json"), "utf8"));
  const packageJson = JSON.parse(await readFile(join(output, "package.json"), "utf8"));
  const barrel = await readFile(join(output, "runtime/react/src/index.ts"), "utf8");
  const styles = await readFile(join(output, "runtime/react/src/styles.css"), "utf8");
  const skillManifest = JSON.parse(await readFile(join(SKILL_ROOT, "templates/component-manifest.json"), "utf8"));

  assert.equal(result.kit.profile, "core");
  assert.equal(result.kit.selectionSource, "profile");
  assert.equal(kit.profile, "core");
  assert.equal(kit.selectionSource, "profile");
  assert.deepEqual(kit.componentIds, [
    "app-frame",
    "brand-attribution",
    "button",
    "icon-button",
    "field",
    "text-field",
    "choice-field",
    "form-selection",
    "overlay",
    "action-overlay",
    "dialog",
    "feedback",
    "resource-state",
    "status",
  ]);
  assert.deepEqual(manifest.families.map((family) => family.id), kit.componentIds);
  assert.equal(decisions.choices.Button, "keep");
  assert.equal(Object.hasOwn(decisions.choices, "DataTable"), false);
  assert.equal(skillManifest.families.length, 27);
  assert.equal(result.runtime.generated, 13);
  assert.equal(await exists(join(output, "runtime/react/src/DataTable.tsx")), false);
  assert.equal(await exists(join(output, "runtime/react/src/SearchableSelect.tsx")), false);
  assert.doesNotMatch(barrel, /DataTable|SearchableSelect/);
  assert.match(styles, /\.dc-button/);
  assert.match(styles, /\.dc-brand-attribution/);
  assert.doesNotMatch(styles, /\.dc-data-table|\.dc-searchable-select/);
  assert.equal(config.sourceOfTruth.componentKit, "components/kit.json");
  assert.deepEqual(config.componentKit.componentIds, kit.componentIds);
  assert.equal(config.sourceOfTruth.catalog, null);
  assert.equal(config.checks.catalogBuild, null);
  assert.equal(await exists(join(output, "catalog/component-library.html")), false);
  assert.equal(packageJson.name, "design-consultant-kit");
  assert.equal(packageJson.dependencies["lucide-react"], "1.27.0");
  const runtimeCheck = spawnSync(process.execPath, [join(output, "checks/check-component-runtime.mjs"), output], { encoding: "utf8" });
  assert.equal(runtimeCheck.status, 0, runtimeCheck.stdout || runtimeCheck.stderr);
  assert.equal(JSON.parse(runtimeCheck.stdout).summary.implemented, 13);
  const typecheck = spawnSync(process.execPath, [TSC_PATH, "-p", "runtime/react/tsconfig.json"], { cwd: output, encoding: "utf8" });
  assert.equal(typecheck.status, 0, typecheck.stdout || typecheck.stderr);
  const componentTests = spawnSync(process.execPath, [VITEST_PATH, "run", "--config", "runtime/react/vitest.config.mjs"], { cwd: output, encoding: "utf8" });
  assert.equal(componentTests.status, 0, componentTests.stdout || componentTests.stderr);
});

test("显式组件选择会校验 ID、补齐依赖并只导出闭包内运行时", async () => {
  const project = await makeReactProject("explicit-kit");
  runCli(project, ["init", "--components", "searchable-select,status"]);
  const output = join(project, "design-system");
  const kit = JSON.parse(await readFile(join(output, "components/kit.json"), "utf8"));
  const packageJson = JSON.parse(await readFile(join(output, "package.json"), "utf8"));
  const barrel = await readFile(join(output, "runtime/react/src/index.ts"), "utf8");
  const styles = await readFile(join(output, "runtime/react/src/styles.css"), "utf8");

  assert.equal(kit.profile, "custom");
  assert.equal(kit.selectionSource, "explicit");
  assert.deepEqual(kit.requestedComponentIds, ["searchable-select", "status"]);
  assert.deepEqual(kit.dependencyAddedComponentIds, ["field"]);
  assert.deepEqual(kit.componentIds, ["field", "searchable-select", "status"]);
  assert.match(barrel, /FieldShell/);
  assert.match(barrel, /SearchableSelect/);
  assert.match(barrel, /StatusBadge/);
  assert.doesNotMatch(barrel, /Button|DataTable|Dialog/);
  assert.equal(await exists(join(output, "runtime/react/src/Button.tsx")), false);
  assert.equal(await exists(join(output, "runtime/react/src/SearchableSelect.tsx")), true);
  assert.equal(await exists(join(output, "runtime/react/src/ethnocentric-regular.otf")), false);
  assert.match(styles, /\.dc-field-shell/);
  assert.match(styles, /\.dc-searchable-select/);
  assert.match(styles, /\.dc-status-badge/);
  assert.doesNotMatch(styles, /\.dc-button|\.dc-data-table|\.dc-brand-attribution/);
  assert.equal(packageJson.dependencies["react-aria-components"], "1.19.0");
  assert.equal(packageJson.dependencies["lucide-react"], "1.27.0");

  const invalidProject = await makeReactProject("invalid-kit");
  const invalid = runCliProcess(invalidProject, ["init", "--components", "button,not-a-component"]);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /未知组件 ID.*not-a-component/);
});

test("多选字段与指标卡可按需生成，并只携带各自需要的底座", async () => {
  const project = await makeReactProject("selection-metrics-kit");
  const result = runCli(project, ["init", "--components", "multi-select-field,metric-card"]);
  const output = join(project, "design-system");
  const kit = JSON.parse(await readFile(join(output, "components/kit.json"), "utf8"));
  const barrel = await readFile(join(output, "runtime/react/src/index.ts"), "utf8");
  const styles = await readFile(join(output, "runtime/react/src/styles.css"), "utf8");

  assert.deepEqual(kit.requestedComponentIds, ["multi-select-field", "metric-card"]);
  assert.deepEqual(kit.dependencyAddedComponentIds, ["field", "overlay"]);
  assert.deepEqual(kit.componentIds, ["field", "multi-select-field", "metric-card", "overlay"]);
  assert.equal(result.runtime.generated, 4);
  assert.equal(await exists(join(output, "runtime/react/src/MultiSelectField.tsx")), true);
  assert.equal(await exists(join(output, "runtime/react/src/MetricCard.tsx")), true);
  assert.match(barrel, /MultiSelectField/);
  assert.match(barrel, /MetricCard/);
  assert.match(barrel, /Tooltip/);
  assert.match(styles, /\.dc-multi-select/);
  assert.match(styles, /\.dc-metric-card/);
  assert.doesNotMatch(styles, /\.dc-searchable-select|\.dc-data-table/);
  const typecheck = spawnSync(process.execPath, [TSC_PATH, "-p", "runtime/react/tsconfig.json"], { cwd: output, encoding: "utf8" });
  assert.equal(typecheck.status, 0, typecheck.stdout || typecheck.stderr);
});

test("四个新增家族按需生成多组件导出，并自动补齐共享底座", async () => {
  const project = await makeReactProject("new-families-kit");
  const result = runCli(project, ["init", "--components", "form-selection,overlay,action-overlay,feedback"]);
  const output = join(project, "design-system");
  const kit = JSON.parse(await readFile(join(output, "components/kit.json"), "utf8"));
  const barrel = await readFile(join(output, "runtime/react/src/index.ts"), "utf8");
  const styles = await readFile(join(output, "runtime/react/src/styles.css"), "utf8");

  assert.deepEqual(kit.requestedComponentIds, ["form-selection", "overlay", "action-overlay", "feedback"]);
  assert.deepEqual(kit.dependencyAddedComponentIds, ["icon-button", "field"]);
  assert.deepEqual(kit.componentIds, ["icon-button", "field", "form-selection", "overlay", "action-overlay", "feedback"]);
  assert.equal(result.runtime.generated, 6);
  for (const file of ["CheckboxField.tsx", "Tooltip.tsx", "ActionMenu.tsx", "InlineNotice.tsx"]) {
    assert.equal(await exists(join(output, "runtime/react/src", file)), true, `缺少 ${file}`);
  }
  for (const exportName of [
    "CheckboxField",
    "CheckboxGroupField",
    "RadioGroupField",
    "SwitchField",
    "Tooltip",
    "PopoverCard",
    "ActionMenu",
    "InlineNotice",
    "ToastViewport",
    "FeedbackQueue",
    "feedbackQueue",
  ]) assert.match(barrel, new RegExp(`\\b${exportName}\\b`));
  assert.match(styles, /\.dc-selection-control/);
  assert.match(styles, /\.dc-tooltip/);
  assert.match(styles, /\.dc-action-menu/);
  assert.match(styles, /\.dc-inline-notice/);

  const runtimeCheck = spawnSync(process.execPath, [join(output, "checks/check-component-runtime.mjs"), output], { encoding: "utf8" });
  assert.equal(runtimeCheck.status, 0, runtimeCheck.stdout || runtimeCheck.stderr);
  assert.equal(JSON.parse(runtimeCheck.stdout).summary.implemented, 6);
});

test("复核工作台 P0 家族可按需生成，并只携带真实依赖和家族样式", async () => {
  const project = await makeReactProject("review-workbench-kit");
  const result = runCli(project, ["init", "--components", "tertiary-nav,text-field,filter-bar,definition-list,mobile-record-card,pagination,approval-panel"]);
  const output = join(project, "design-system");
  const kit = JSON.parse(await readFile(join(output, "components/kit.json"), "utf8"));
  const barrel = await readFile(join(output, "runtime/react/src/index.ts"), "utf8");
  const styles = await readFile(join(output, "runtime/react/src/styles.css"), "utf8");

  assert.deepEqual(kit.requestedComponentIds, ["tertiary-nav", "text-field", "filter-bar", "definition-list", "mobile-record-card", "pagination", "approval-panel"]);
  assert.deepEqual(kit.dependencyAddedComponentIds, ["button", "field", "status"]);
  assert.deepEqual(kit.componentIds, ["tertiary-nav", "button", "field", "text-field", "filter-bar", "definition-list", "mobile-record-card", "pagination", "status", "approval-panel"]);
  assert.equal(result.runtime.generated, 10);
  for (const file of ["TertiaryNav.tsx", "TextField.tsx", "FilterBar.tsx", "DefinitionList.tsx", "MobileRecordCard.tsx", "TablePagination.tsx", "ApprovalPanel.tsx"]) {
    assert.equal(await exists(join(output, "runtime/react/src", file)), true, `缺少 ${file}`);
  }
  for (const exportName of ["TertiaryNav", "TextField", "TextAreaField", "NumberField", "FilterBar", "DefinitionList", "MobileRecordCard", "TablePagination", "ApprovalPanel"]) {
    assert.match(barrel, new RegExp(`\\b${exportName}\\b`));
  }
  for (const selector of ["dc-tertiary-nav", "dc-field-affix", "dc-filter-bar", "dc-definition-list", "dc-mobile-record-card", "dc-pagination", "dc-approval-panel"]) {
    assert.match(styles, new RegExp(`\\.${selector}`));
  }
  assert.doesNotMatch(styles, /\.dc-data-table|\.dc-searchable-select|\.dc-dialog/);
  const runtimeCheck = spawnSync(process.execPath, [join(output, "checks/check-component-runtime.mjs"), output], { encoding: "utf8" });
  assert.equal(runtimeCheck.status, 0, runtimeCheck.stdout || runtimeCheck.stderr);
  assert.equal(JSON.parse(runtimeCheck.stdout).summary.implemented, 10);
});

test("未声明 Kit 选择的旧调用继续按全量兼容，不在升级时隐式删组件", async () => {
  const project = await makeReactProject("legacy-full-kit");
  const result = runCli(project, ["init"]);
  const output = join(project, "design-system");
  const kit = JSON.parse(await readFile(join(output, "components/kit.json"), "utf8"));
  const manifest = JSON.parse(await readFile(join(output, "components/manifest.json"), "utf8"));

  assert.equal(result.kit.profile, "full");
  assert.equal(result.kit.selectionSource, "legacy-full");
  assert.equal(kit.componentIds.length, 27);
  assert.equal(manifest.families.length, 27);
  assert.equal(await exists(join(output, "runtime/react/src/DataTable.tsx")), true);
  assert.equal(await exists(join(output, "catalog/component-library.html")), true);

  const updated = runCli(project, ["update"]);
  assert.equal(updated.kit.profile, "full");
  assert.equal(await exists(join(output, "runtime/react/src/DataTable.tsx")), true);
});

test("数据工作台与 Agent 工作台档位都能在 dry-run 中解析为合法组件子集", async () => {
  const cases = [
    ["data-workspace", ["data-table", "filter-bar", "pagination"]],
    ["agent-workspace", ["command-palette", "agent-event-row", "approval-panel", "file-artifact-row"]],
  ];
  for (const [profile, expectedIds] of cases) {
    const project = await makeReactProject(`${profile}-kit`);
    const result = runCli(project, ["init", "--kit-profile", profile, "--dry-run"]);
    assert.equal(result.kit.profile, profile);
    for (const id of expectedIds) assert.ok(result.kit.componentIds.includes(id), `${profile} 缺少 ${id}`);
    assert.equal(await exists(join(project, "design-system/components/kit.json")), false);
  }
});
