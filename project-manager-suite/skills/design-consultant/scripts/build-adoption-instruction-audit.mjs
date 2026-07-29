#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = resolve(SCRIPT_DIR, "..", "..", "..");
const AUDIT_RELATIVE_PATH = "evals/design-consultant/v0.10-instruction-audit";
const AUDIT_DIRECTORY = "v0.10-instruction-audit";
const TEMP_PREFIX = ".v0.10-instruction-audit.tmp-";
const BACKUP_PREFIX = ".v0.10-instruction-audit.backup-";
const EVAL_IDS = [
  "E21-mature-system-preserve",
  "E22-partial-system-augment",
  "E23-legacy-ratchet",
  "E24-non-react-preserve",
];
const CURRENT_CORPUS = [
  "SKILL.md",
  "README.md",
  "references/existing-system-adoption.md",
  "references/project-visual-system-workflow.md",
  "references/design-system-enforcement.md",
];
const SNAPSHOT_FIXED = new Set([
  "skills/design-consultant/SKILL.md",
  "skills/design-consultant/README.md",
  "skills/design-consultant/templates/design-system-README.md",
  "skills/design-consultant/templates/design-system-package.json",
  "skills/design-consultant/templates/project-design-agent-rules.md",
  "skills/design-consultant/templates/system.config.json",
]);
const ASSERTIONS = [
  {
    id: "E21-existing-preserve-route",
    evalId: EVAL_IDS[0],
    safety: false,
    description: "成熟系统先进入 existing-design-system、extract、draft plan 与 preserve。",
    allOf: ["existing-design-system", "extract", "draft plan", "preserve"],
  },
  {
    id: "E21-no-parallel-system",
    evalId: EVAL_IDS[0],
    safety: true,
    description: "不得生成默认 Button 或自动迁移。",
    allOf: ["不得生成默认 Button", "绝不自动迁移"],
  },
  {
    id: "E22-confirmed-augment-only",
    evalId: EVAL_IDS[1],
    safety: true,
    description: "augment 保留现有能力，仅补明确批准的缺口。",
    allOf: ["augment", "用户确认", "保留已存在", "不得因为语义名称不同就重复生成"],
  },
  {
    id: "E23-legacy-ratchet",
    evalId: EVAL_IDS[2],
    safety: true,
    description: "baseline 允许历史违规、拒绝新增违规并支持显式 prune。",
    allOf: ["Legacy ratchet", "已登记违规不阻断", "新违规返回非零退出码", "--prune-baseline"],
  },
  {
    id: "E23-no-automatic-codemod",
    evalId: EVAL_IDS[2],
    safety: true,
    description: "不得自动改写业务 import 或页面。",
    allOf: ["绝不自动改写业务 import", "业务页面仍由维护者分批修改"],
  },
  {
    id: "E24-non-react-boundary",
    evalId: EVAL_IDS[3],
    safety: true,
    description: "非 React 项目只产出事实和守门计划，不生成 React adapter。",
    allOf: ["Vue/Svelte", "事实报告", "守门计划", "不得声称或生成 React adapter"],
  },
];

function parseArguments(argv) {
  const args = [...argv];
  const command = args[0]?.startsWith("--") ? "build" : (args.shift() ?? "build");
  const options = { command, repoRoot: DEFAULT_REPO_ROOT, sourceManifest: null, outputRoot: null, baseRef: null };
  while (args.length > 0) {
    const flag = args.shift();
    if (!["--repo-root", "--source-manifest", "--output-root", "--base-ref"].includes(flag)) {
      throw new Error(`Unknown option ${flag}`);
    }
    const value = args.shift();
    if (!value) throw new Error(`${flag} requires a value`);
    if (flag === "--repo-root") options.repoRoot = resolve(value);
    if (flag === "--source-manifest") options.sourceManifest = value;
    if (flag === "--output-root") options.outputRoot = value;
    if (flag === "--base-ref") options.baseRef = value;
  }
  if (options.command !== "build") throw new Error(`Unknown command ${options.command}; expected build`);
  return options;
}

function resolveFromRepo(repoRoot, path) {
  return isAbsolute(path) ? resolve(path) : resolve(repoRoot, ...path.replaceAll("\\", "/").split("/"));
}

function git(repoRoot, args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  }).replace(/\r\n/g, "\n");
}

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function hash(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

async function write(path, content) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

function comparablePath(path) {
  const normalized = resolve(path);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function requireAllowedOutputRoot(options, repoRoot, evalRoot) {
  const allowed = join(evalRoot, AUDIT_DIRECTORY);
  const requested = resolveFromRepo(repoRoot, options.outputRoot ?? AUDIT_RELATIVE_PATH);
  if (comparablePath(requested) !== comparablePath(allowed)) {
    throw new Error(`Output root must equal ${AUDIT_RELATIVE_PATH} within repoRoot`);
  }
  return allowed;
}

async function lstatOrNull(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function assertControlledSibling(path, parent, prefix) {
  if (comparablePath(dirname(path)) !== comparablePath(parent) || !basename(path).startsWith(prefix)) {
    throw new Error(`Refusing recursive cleanup outside controlled ${prefix} sibling`);
  }
}

async function removeControlledSibling(path, parent, prefix) {
  assertControlledSibling(path, parent, prefix);
  await rm(path, { recursive: true, force: true });
}

async function resolveSource(options, repoRoot) {
  const manifestPath = resolveFromRepo(
    repoRoot,
    options.sourceManifest ?? "evals/design-consultant/v0.10-source-manifest.json",
  );
  let manifest = null;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    if (!options.baseRef || error.code !== "ENOENT") throw error;
  }
  const sourceRef = options.baseRef ?? manifest?.sourceCommit;
  if (!sourceRef) throw new Error("A pinned sourceCommit manifest or explicit --base-ref is required");
  if (!options.baseRef && !/^[a-f0-9]{40}$/.test(sourceRef)) {
    throw new Error("Pinned sourceCommit must be a full lowercase Git SHA");
  }
  const commit = git(repoRoot, ["rev-parse", "--verify", `${sourceRef}^{commit}`]).trim();
  if (!options.baseRef && commit !== sourceRef) throw new Error("Pinned sourceCommit did not resolve byte-for-byte");
  const sourcePath = manifest?.sourcePath ?? "skills/design-consultant";
  if (sourcePath !== "skills/design-consultant") throw new Error("sourcePath must be skills/design-consultant");
  const manifestRelative = relative(repoRoot, manifestPath).replaceAll("\\", "/");
  return {
    commit,
    path: sourcePath,
    release: manifest?.release ?? "explicit-base-ref",
    resolution: options.baseRef ? "explicit --base-ref" : "pinned sourceCommit manifest",
    manifest: manifestRelative,
  };
}

function snapshotPaths(repoRoot, source) {
  const listing = git(repoRoot, ["ls-tree", "-r", source.commit, "--", source.path]).trim();
  if (!listing) throw new Error(`Pinned source contains no files at ${source.path}`);
  return listing
    .split("\n")
    .map((line) => {
      const match = /^(\d+)\s+(\w+)\s+([a-f0-9]+)\t(.+)$/.exec(line);
      if (!match) throw new Error(`Cannot parse git ls-tree entry: ${line}`);
      return { mode: match[1], type: match[2], blob: match[3], path: match[4] };
    })
    .filter((entry) => SNAPSHOT_FIXED.has(entry.path) || /^skills\/design-consultant\/references\/[^/]+\.md$/.test(entry.path));
}

function prepareSnapshot(repoRoot, source) {
  const prepared = [];
  for (const entry of snapshotPaths(repoRoot, source)) {
    const sourceContent = git(repoRoot, ["show", `${source.commit}:${entry.path}`]);
    const content = sourceContent.replace(/\n+$/, "\n");
    const snapshotPath = entry.path.replace(/^skills\/design-consultant\//, "");
    prepared.push({
      path: entry.path,
      snapshotPath,
      blob: entry.blob,
      sourceSha256: hash(sourceContent),
      snapshotSha256: hash(content),
      normalized: sourceContent !== content,
      bytes: Buffer.byteLength(content),
      content,
    });
  }
  return prepared;
}

async function buildSnapshot(outputRoot, source, prepared) {
  for (const file of prepared) {
    await write(join(outputRoot, "old-skill-snapshot", ...file.snapshotPath.split("/")), file.content);
  }
  const files = prepared.map(({ content: _content, ...file }) => file);
  const manifest = {
    schemaVersion: 1,
    kind: "immutable-instruction-snapshot",
    source,
    selection: {
      policy: "instruction-surface-only",
      includes: ["SKILL.md", "README.md", "references/*.md", "selected text configuration templates"],
      excludes: ["runtime libraries", "screenshots", "minified assets", "vendor binaries", "node_modules"],
      normalization: "LF line endings and exactly one terminal newline; original bytes remain auditable through Git blob and sourceSha256",
    },
    files,
  };
  await write(join(outputRoot, "old-skill-snapshot", "snapshot-manifest.json"), serialize(manifest));
  const corpus = prepared.map((file) => file.content).join("\n");
  return { manifest, corpus };
}

async function loadEvaluation(evalRoot) {
  const path = join(evalRoot, "evals.json");
  const evaluation = JSON.parse(await readFile(path, "utf8"));
  if (!evaluation || typeof evaluation !== "object" || !Array.isArray(evaluation.evals)) {
    throw new Error("evals/design-consultant/evals.json must contain an evals array");
  }
  for (const id of EVAL_IDS) {
    if (!evaluation.evals.some((item) => item?.id === id)) throw new Error(`Missing eval ${id}`);
  }
  return evaluation;
}

async function loadCurrentCorpus(skillRoot) {
  return (await Promise.all(CURRENT_CORPUS.map(async (path) => {
    const content = await readFile(join(skillRoot, ...path.split("/")), "utf8");
    if (content.length === 0) throw new Error(`Current instruction input is empty: ${path}`);
    return content;
  }))).join("\n");
}

async function replaceAuditDirectory(evalRoot, outputRoot, temporaryRoot) {
  const current = await lstatOrNull(outputRoot);
  if (current && (!current.isDirectory() || current.isSymbolicLink())) {
    throw new Error(`${AUDIT_RELATIVE_PATH} must be an ordinary directory`);
  }
  const backupRoot = join(evalRoot, `${BACKUP_PREFIX}${process.pid}-${randomUUID()}`);
  assertControlledSibling(backupRoot, evalRoot, BACKUP_PREFIX);
  let movedCurrent = false;
  if (current) {
    await rename(outputRoot, backupRoot);
    movedCurrent = true;
  }
  try {
    await rename(temporaryRoot, outputRoot);
  } catch (error) {
    if (movedCurrent) await rename(backupRoot, outputRoot);
    throw error;
  }
  if (movedCurrent) await removeControlledSibling(backupRoot, evalRoot, BACKUP_PREFIX);
}

function gradeVariant(variant, corpus) {
  return ASSERTIONS.map((assertion) => {
    const checks = assertion.allOf.map((needle) => ({ needle, passed: corpus.includes(needle) }));
    return { ...assertion, variant, checks, passed: checks.every((check) => check.passed) };
  });
}

function summary(results) {
  const safety = results.filter((result) => result.safety);
  return {
    assertions: { passed: results.filter((result) => result.passed).length, total: results.length },
    safety: { passed: safety.filter((result) => result.passed).length, total: safety.length },
  };
}

function renderMarkdown(audit, snapshot) {
  const rows = Object.entries(audit.variants).map(([variant, result]) =>
    `| ${variant} | ${result.assertions.passed}/${result.assertions.total} | ${result.safety.passed}/${result.safety.total} |`,
  );
  const bytes = snapshot.files.reduce((total, file) => total + file.bytes, 0);
  return `# v0.10 既有系统接入指令静态审计\n\n` +
    `本目录仅是 instruction/static audit，不是 Skill Creator agent evaluation，也不包含代理输出、耗时或 viewer。\n\n` +
    `v0.9 指令来源固定为 \`${audit.source.commit}\`，通过 \`${audit.source.manifest}\` 解析；不读取本地 \`main\`。snapshot 包含 ${snapshot.files.length} 个文本文件，共 ${bytes} bytes。\n\n` +
    `审计方法只检查选定指令语料是否逐字包含公开的安全要求，不能证明模型会遵循这些要求，也不能替代控制器执行的 8 次真实 LLM 运行。\n\n` +
    `| 语料 | 全部断言 | 安全断言 |\n| --- | ---: | ---: |\n${rows.join("\n")}\n`;
}

async function build(options) {
  const repoRoot = await realpath(resolve(options.repoRoot));
  const skillRoot = join(repoRoot, "skills", "design-consultant");
  const evalRoot = join(repoRoot, "evals", "design-consultant");
  const outputRoot = requireAllowedOutputRoot(options, repoRoot, evalRoot);
  const canonicalEvalRoot = await realpath(evalRoot);
  if (comparablePath(canonicalEvalRoot) !== comparablePath(evalRoot)) {
    throw new Error("evals/design-consultant must not traverse a symbolic link or junction");
  }
  const source = await resolveSource(options, repoRoot);
  await loadEvaluation(evalRoot);
  const preparedSnapshot = prepareSnapshot(repoRoot, source);
  const currentCorpus = await loadCurrentCorpus(skillRoot);
  const temporaryRoot = await mkdtemp(join(evalRoot, TEMP_PREFIX));
  assertControlledSibling(temporaryRoot, evalRoot, TEMP_PREFIX);
  let promoted = false;
  try {
    const snapshot = await buildSnapshot(temporaryRoot, source, preparedSnapshot);
    const currentResults = gradeVariant("v0.10-instructions", currentCorpus);
    const oldResults = gradeVariant("v0.9-instructions", snapshot.corpus);
    const results = [...currentResults, ...oldResults];
    const audit = {
      schemaVersion: 1,
      kind: "instruction-static-audit",
      evalIds: EVAL_IDS,
      source,
      method: "literal-required-evidence checks over selected instruction text",
      limitation: "This is not an agent benchmark and contains no LLM output, timing, grading, or official viewer.",
      variants: {
        "v0.10-instructions": summary(currentResults),
        "v0.9-instructions": summary(oldResults),
      },
    };
    await write(join(temporaryRoot, "static-audit-results.json"), serialize({ schemaVersion: 1, kind: audit.kind, assertions: ASSERTIONS, results }));
    await write(join(temporaryRoot, "static-audit.json"), serialize(audit));
    await write(join(temporaryRoot, "static-audit.md"), renderMarkdown(audit, snapshot.manifest));
    await replaceAuditDirectory(evalRoot, outputRoot, temporaryRoot);
    promoted = true;
    process.stdout.write(`${serialize({
      ok: true,
      kind: audit.kind,
      output: relative(repoRoot, outputRoot).replaceAll("\\", "/"),
      sourceCommit: source.commit,
      files: snapshot.manifest.files.length,
    })}`);
  } finally {
    if (!promoted) await removeControlledSibling(temporaryRoot, evalRoot, TEMP_PREFIX);
  }
}

const options = parseArguments(process.argv.slice(2));
await build(options);
