import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = resolve(SCRIPT_DIR, "..");
const SCRIPT_PATH = join(SCRIPT_DIR, "sync-tokens.mjs");
const TEMPLATE_DIR = join(SKILL_ROOT, "templates");
const workspaces = [];

async function makeFixture() {
  const root = await mkdtemp(join(tmpdir(), "design-token-compiler-"));
  workspaces.push(root);
  const templates = join(root, "templates");
  await mkdir(templates, { recursive: true });
  for (const name of [
    "tokens.json",
    "component-manifest.json",
    "visualization-manifest.json",
    "component-library.html",
  ]) {
    await copyFile(join(TEMPLATE_DIR, name), join(templates, name));
  }
  await writeFile(join(root, ".design-consultant-lock.json"), `${JSON.stringify({
    schemaVersion: 1,
    skillVersion: "0.10.0",
    workflow: "greenfield",
    workflowProvenance: { schemaVersion: 1, type: "greenfield-init", skillVersion: "0.10.0" },
    files: {},
  }, null, 2)}\n`, "utf8");
  return root;
}

function runCompiler(root, command) {
  return spawnSync(process.execPath, [SCRIPT_PATH, command, "--root", root], { encoding: "utf8" });
}

function parseResult(result) {
  assert.ok(result.stdout.trim(), result.stderr || "Token compiler should emit JSON output");
  return JSON.parse(result.stdout);
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function mutateTokens(root, mutate) {
  const path = join(root, "templates/tokens.json");
  const document = JSON.parse(await readFile(path, "utf8"));
  mutate(document);
  await writeFile(path, `${JSON.stringify(document, null, 2)}\n`, "utf8");
}

test.afterEach(async () => {
  while (workspaces.length > 0) await rm(workspaces.pop(), { recursive: true, force: true });
});

test("build 从唯一 JSON 源确定性生成 CSS、TypeScript 与 JSON Schema", async () => {
  const root = await makeFixture();
  const tokenDocument = JSON.parse(await readFile(join(root, "templates/tokens.json"), "utf8"));
  assert.deepEqual(Object.keys(tokenDocument.taxonomy), ["base", "semantic", "component", "data-viz"]);

  const first = runCompiler(root, "build");
  assert.equal(first.status, 0, first.stderr || first.stdout);
  const firstResult = parseResult(first);
  assert.equal(firstResult.command, "build");
  assert.equal(firstResult.source, "templates/tokens.json");

  const outputPaths = [
    join(root, "templates/tokens.css"),
    join(root, "templates/tokens.ts"),
    join(root, "templates/tokens.schema.json"),
  ];
  const firstOutputs = await Promise.all(outputPaths.map((path) => readFile(path, "utf8")));
  assert.match(firstOutputs[0], /Generated from tokens\.json/);
  assert.match(firstOutputs[1], /export type TokenPath/);
  assert.match(firstOutputs[1], /export const tokenCssVariables/);
  const schema = JSON.parse(firstOutputs[2]);
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.deepEqual(schema.properties.taxonomy.required, ["base", "semantic", "component", "data-viz"]);

  const second = runCompiler(root, "build");
  assert.equal(second.status, 0, second.stderr || second.stdout);
  const secondOutputs = await Promise.all(outputPaths.map((path) => readFile(path, "utf8")));
  assert.deepEqual(secondOutputs.map(digest), firstOutputs.map(digest));
});

test("check 和 diff 对缺失及过期产物返回逐行差异", async () => {
  const root = await makeFixture();
  assert.equal(runCompiler(root, "build").status, 0);
  const cssPath = join(root, "templates/tokens.css");
  const tsPath = join(root, "templates/tokens.ts");
  await writeFile(cssPath, `${await readFile(cssPath, "utf8")}/* stale output */\n`, "utf8");
  await unlink(tsPath);

  const check = runCompiler(root, "check");
  assert.equal(check.status, 1);
  const checkResult = parseResult(check);
  const byPath = Object.fromEntries(checkResult.artifacts.map((artifact) => [artifact.path, artifact]));
  assert.equal(byPath["templates/tokens.css"].status, "stale");
  assert.deepEqual(byPath["templates/tokens.css"].diff.at(-1), {
    line: byPath["templates/tokens.css"].diff.at(-1).line,
    expected: null,
    actual: "/* stale output */",
  });
  assert.equal(byPath["templates/tokens.ts"].status, "missing");

  const diff = runCompiler(root, "diff");
  assert.equal(diff.status, 1);
  assert.deepEqual(parseResult(diff).artifacts, checkResult.artifacts);
});

test("未知引用、循环引用和 CSS 变量冲突给出带路径的错误", async () => {
  const cases = [
    {
      mutate(document) {
        document.tokens.color.bg.value = "{color.doesNotExist}";
      },
      expected: /Unknown token reference \{color\.doesNotExist\} at color\.bg/,
    },
    {
      mutate(document) {
        document.tokens.color.bg.value = "{color.surface}";
        document.tokens.color.surface.value = "{color.bg}";
      },
      expected: /Circular token reference: color\.bg -> color\.surface -> color\.bg/,
    },
    {
      mutate(document) {
        document.tokens.color.surface.cssVariable = document.tokens.color.bg.cssVariable;
      },
      expected: /Duplicate CSS variable --bg at color\.bg and color\.surface/,
    },
  ];

  for (const fixture of cases) {
    const root = await makeFixture();
    await mutateTokens(root, fixture.mutate);
    const result = runCompiler(root, "check");
    assert.equal(result.status, 1);
    assert.match(parseResult(result).errors.join("\n"), fixture.expected);
  }
});

test("主题边界与两个 Manifest 中声明的 Token 引用全部可解析", async () => {
  const root = await makeFixture();
  const build = runCompiler(root, "build");
  assert.equal(build.status, 0, build.stderr || build.stdout);
  const check = runCompiler(root, "check");
  assert.equal(check.status, 0, check.stderr || check.stdout);
  const result = parseResult(check);
  assert.equal(result.validation.manifestReferences.unresolved.length, 0);
  assert.equal(result.validation.themes.invalidBoundaries.length, 0);
  assert.ok(result.validation.manifestReferences.checked > 0);
});

test("组件预览不内置 Token 色值副本", async () => {
  const html = await readFile(join(TEMPLATE_DIR, "component-library.html"), "utf8");
  assert.doesNotMatch(html, /data-token-value="--[^"]+">\s*#[0-9a-f]{3,8}/i);
  assert.doesNotMatch(html, /<dd><i class="contract-swatch[^>]+><\/i>\s*#[0-9a-f]{3,8}/i);
  assert.doesNotMatch(html, /id="visualizationThemeStatus"[^>]*>[^<]*#[0-9a-f]{3,8}/i);
});
