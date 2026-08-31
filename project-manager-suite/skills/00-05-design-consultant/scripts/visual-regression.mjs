#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { link, lstat, mkdir, open, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import pixelmatch from "pixelmatch";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import { strictVisualBaseUrl, strictVisualRoutes } from "./adoption/visual-route-contract.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(SCRIPT_PATH);
const ROOT = resolve(SCRIPT_DIR, "..");
const SKILL_SOURCE = await exists(join(ROOT, "templates/component-library.html"));
const STATIC_ROOT = SKILL_SOURCE ? join(ROOT, "templates") : ROOT;
const CATALOG_PATH = SKILL_SOURCE ? "/component-library.html" : "/catalog/component-library.html";
const BASELINE_ROOT = join(SCRIPT_DIR, "visual-baselines");
const OUTPUT_ROOT = SKILL_SOURCE ? resolve(ROOT, "../../output/playwright/design-consultant-v0.10.0") : join(ROOT, "output/visual-regression");
const CATALOG_PROJECT_IDENTITY = "dc-project-v1:134fce78ef7c6f6b0adfa78ba7561bd400d4a1a4906aa8ed8ad6b5ab9edc4447";
const CONFIG_FIELDS = ["projectIdentity", "baseUrl", "routes", "baselineDir", "outputDir", "threshold", "startCommand"];
const START_COMMAND_FIELDS = ["args", "command", "cwd", "readyTimeoutMs"];
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PROJECT_IDENTITY_PATTERN = /^dc-project-v1:[a-f0-9]{64}$/;
const WINDOWS_RESERVED_BASENAMES = new Set([
  "CON", "PRN", "AUX", "NUL",
  ...Array.from({ length: 9 }, (_, index) => `COM${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `LPT${index + 1}`),
]);

const SCENARIOS = [
  { id: "desktop", viewport: { width: 1440, height: 1000 }, reducedMotion: "no-preference" },
  { id: "narrow", viewport: { width: 1024, height: 900 }, reducedMotion: "no-preference" },
  { id: "mobile", viewport: { width: 390, height: 844 }, reducedMotion: "no-preference" },
  { id: "reduced-motion", viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" },
];

const MIME = new Map([
  [".css", "text/css; charset=utf-8"], [".html", "text/html; charset=utf-8"], [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"], [".png", "image/png"], [".svg", "image/svg+xml"], [".woff2", "font/woff2"],
]);

async function exists(path) {
  try { return (await stat(path)).isFile(); } catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} config fields must be exactly: ${wanted.join(", ")}.`);
  }
}

function isInsideOrEqual(root, candidate) {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
}

function safeOutputPath(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.length > 240 || value.includes("\\") || isAbsolute(value) || /^[A-Za-z]:/.test(value)) {
    throw new Error(`${label} must be a safe relative POSIX path.`);
  }
  const segments = value.split("/");
  if (value !== value.normalize("NFC") || segments.some((segment) => {
    const basename = segment.split(".", 1)[0].toUpperCase();
    return !segment
      || segment === "."
      || segment === ".."
      || segment.endsWith(".")
      || segment.endsWith(" ")
      || WINDOWS_RESERVED_BASENAMES.has(basename)
      || /[<>:"|?*]/.test(segment)
      || !/^[A-Za-z0-9._-]+$/.test(segment);
  })) {
    throw new Error(`${label} must be a safe relative POSIX path.`);
  }
  return value;
}

function portablePathKey(value) {
  return value.normalize("NFC").toLowerCase();
}

function fileIdentity(info) {
  return `${info.dev.toString()}:${info.ino.toString()}`;
}

async function existingDirectoryBoundary(path, label) {
  let info;
  try { info = await lstat(path); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`${label} must be an ordinary directory without reparse links.`);
  const canonical = await realpath(path);
  if (canonical !== resolve(path)) throw new Error(`${label} uses a non-canonical path alias, casing, link, junction, or reparse point.`);
  const identity = fileIdentity(await stat(path, { bigint: true }));
  return { path: canonical, identity };
}

function nestedCanonicalPaths(left, right) {
  return isInsideOrEqual(left, right) || isInsideOrEqual(right, left);
}

async function assertDistinctDirectoryBoundaries(baselineRoot, outputRoot) {
  const [baseline, output] = await Promise.all([
    existingDirectoryBoundary(baselineRoot, "baselineDir"),
    existingDirectoryBoundary(outputRoot, "outputDir"),
  ]);
  if (!baseline || !output) return;
  if (baseline.identity === output.identity || nestedCanonicalPaths(baseline.path, output.path)) {
    throw new Error("baselineDir and outputDir resolve to the same or nested canonical directory identity.");
  }
}

function strictProjectIdentity(value) {
  if (typeof value !== "string" || value.length !== 78 || value !== value.normalize("NFC") || !PROJECT_IDENTITY_PATTERN.test(value)) {
    throw new Error("projectIdentity must be an exact NFC dc-project-v1 identity with 64 lowercase hexadecimal characters.");
  }
  return value;
}

async function strictStartCommand(value, configDir) {
  if (value === null) return null;
  exactKeys(value, START_COMMAND_FIELDS, "startCommand");
  if (typeof value.command !== "string" || !value.command.trim() || value.command !== value.command.trim()
    || value.command.length > 1024 || /[\u0000-\u001f\u007f]/.test(value.command)) {
    throw new Error("startCommand.command is invalid.");
  }
  if (!Array.isArray(value.args) || value.args.length > 100 || value.args.some((argument) => typeof argument !== "string" || argument.length > 4096 || /[\u0000\r\n]/.test(argument))) {
    throw new Error("startCommand.args must be a bounded string array.");
  }
  if (typeof value.cwd !== "string" || !value.cwd || value.cwd.includes("\\") || isAbsolute(value.cwd) || /^[A-Za-z]:/.test(value.cwd)
    || value.cwd.split("/").some((segment) => !segment || (segment !== ".." && segment !== "." && !/^[A-Za-z0-9._ -]+$/.test(segment)))) {
    throw new Error("startCommand.cwd must be a safe relative POSIX path.");
  }
  const projectRoot = resolve(configDir, "../..");
  const cwd = resolve(configDir, ...value.cwd.split("/"));
  if (!isInsideOrEqual(projectRoot, cwd)) throw new Error("startCommand.cwd escapes the inferred project root.");
  if (!Number.isInteger(value.readyTimeoutMs) || value.readyTimeoutMs < 100 || value.readyTimeoutMs > 120000) {
    throw new Error("startCommand.readyTimeoutMs must be an integer from 100 to 120000.");
  }
  let cwdInfo;
  try { cwdInfo = await lstat(cwd); } catch (error) { throw new Error(`startCommand.cwd could not be read: ${error.message}`); }
  if (!cwdInfo.isDirectory() || cwdInfo.isSymbolicLink()) throw new Error("startCommand.cwd must be an ordinary directory.");
  const [canonicalProjectRoot, canonicalCwd] = await Promise.all([realpath(projectRoot), realpath(cwd)]);
  if (canonicalProjectRoot !== projectRoot || canonicalCwd !== cwd) {
    throw new Error("startCommand.cwd must use canonical casing and must not traverse a path alias or link.");
  }
  if (!isInsideOrEqual(canonicalProjectRoot, canonicalCwd)) throw new Error("startCommand.cwd resolves outside the inferred project root.");
  return { command: value.command, args: [...value.args], cwd: canonicalCwd, readyTimeoutMs: value.readyTimeoutMs };
}

async function assertExistingDirectorySegments(configDir, relativePath, label) {
  const canonicalRoot = await realpath(configDir);
  let current = canonicalRoot;
  for (const segment of relativePath.split("/")) {
    const intended = join(current, segment);
    current = intended;
    let info;
    try { info = await lstat(current); } catch (error) { if (error.code === "ENOENT") return; throw error; }
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`${label} contains a non-directory or linked segment.`);
    const canonical = await realpath(current);
    if (!isInsideOrEqual(canonicalRoot, canonical)) throw new Error(`${label} resolves outside the config directory.`);
    if (canonical !== intended) throw new Error(`${label} contains a non-canonical path alias or casing.`);
    current = canonical;
  }
}

async function ordinaryConfigPath(configPath) {
  const absolute = resolve(configPath);
  let info;
  try { info = await lstat(absolute); } catch (error) { throw new Error(`Visual config could not be read: ${error.message}`); }
  if (!info.isFile() || info.isSymbolicLink()) throw new Error("Visual config must be an ordinary file.");
  const canonical = await realpath(absolute);
  if (canonical !== absolute) throw new Error("Visual config path must be canonical and must not traverse links.");
  return canonical;
}

async function loadVisualConfig(configPath) {
  const canonicalConfig = await ordinaryConfigPath(configPath);
  let value;
  try { value = JSON.parse((await readFile(canonicalConfig, "utf8")).replace(/^\uFEFF/, "")); }
  catch (error) { throw new Error(`Visual config is invalid JSON: ${error.message}`); }
  exactKeys(value, CONFIG_FIELDS, "Visual config");
  const configDir = dirname(canonicalConfig);
  const projectIdentity = strictProjectIdentity(value.projectIdentity);
  const routes = strictVisualRoutes(value.routes);
  const baseUrl = strictVisualBaseUrl(value.baseUrl, routes.length > 0);
  const baselineDir = safeOutputPath(value.baselineDir, "baselineDir");
  const outputDir = safeOutputPath(value.outputDir, "outputDir");
  const normalizedBaseline = portablePathKey(baselineDir);
  const normalizedOutput = portablePathKey(outputDir);
  if (normalizedBaseline === normalizedOutput
    || normalizedBaseline.startsWith(`${normalizedOutput}/`)
    || normalizedOutput.startsWith(`${normalizedBaseline}/`)) {
    throw new Error("baselineDir and outputDir must be distinct, non-nested destinations.");
  }
  if (!/(^|[/-])v\d+($|[/-])/.test(normalizedBaseline)) throw new Error("baselineDir must contain an explicit version segment such as v1.");
  if (typeof value.threshold !== "number" || !Number.isFinite(value.threshold) || value.threshold < 0 || value.threshold > 0.2) {
    throw new Error("threshold must be a finite number from 0 to 0.2.");
  }
  await Promise.all([
    assertExistingDirectorySegments(configDir, baselineDir, "baselineDir"),
    assertExistingDirectorySegments(configDir, outputDir, "outputDir"),
  ]);
  const baselineRoot = resolve(configDir, ...baselineDir.split("/"));
  const outputRoot = resolve(configDir, ...outputDir.split("/"));
  await assertDistinctDirectoryBoundaries(baselineRoot, outputRoot);
  return {
    configPath: canonicalConfig,
    configDir,
    projectIdentity,
    baseUrl,
    routes,
    baselineDir,
    baselineRoot,
    outputDir,
    outputRoot,
    threshold: value.threshold,
    startCommand: await strictStartCommand(value.startCommand, configDir),
  };
}

async function ordinaryFileExists(path, root, label) {
  let info;
  try { info = await lstat(path); } catch (error) { if (error.code === "ENOENT") return false; throw error; }
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`${label} must be an ordinary file.`);
  const canonicalRoot = await realpath(root);
  const canonical = await realpath(path);
  if (!isInsideOrEqual(canonicalRoot, canonical)) throw new Error(`${label} resolves outside its configured directory.`);
  if (canonical !== resolve(path)) throw new Error(`${label} uses a non-canonical path alias or link.`);
  return true;
}

async function ensureSafeDirectory(configDir, relativePath, label) {
  const canonicalRoot = await realpath(configDir);
  let current = canonicalRoot;
  for (const segment of relativePath.split("/")) {
    current = join(current, segment);
    try {
      const info = await lstat(current);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`${label} contains a non-directory or linked segment.`);
      const canonical = await realpath(current);
      if (!isInsideOrEqual(canonicalRoot, canonical)) throw new Error(`${label} resolves outside the config directory.`);
      if (canonical !== current) throw new Error(`${label} contains a non-canonical path alias, casing, junction, or reparse point.`);
      current = canonical;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await mkdir(current);
      const created = await lstat(current);
      if (!created.isDirectory() || created.isSymbolicLink() || await realpath(current) !== current) {
        throw new Error(`${label} creation produced a linked or non-canonical directory.`);
      }
    }
  }
  return current;
}

async function ordinaryFileIdentity(path, root, label) {
  if (!await ordinaryFileExists(path, root, label)) return null;
  const info = await stat(path, { bigint: true });
  return { canonical: await realpath(path), identity: fileIdentity(info) };
}

async function assertScenarioFilesDistinct(scenario, baselineRoot, outputRoot) {
  if (portablePathKey(resolve(scenario.baseline)) === portablePathKey(resolve(scenario.output))) {
    throw new Error(`${scenario.id} baseline and screenshot output use the same path alias.`);
  }
  const [baseline, output] = await Promise.all([
    ordinaryFileIdentity(scenario.baseline, baselineRoot, `Baseline ${scenario.id}`),
    ordinaryFileIdentity(scenario.output, outputRoot, `Screenshot output ${scenario.id}`),
  ]);
  if (baseline && output && (baseline.canonical === output.canonical || baseline.identity === output.identity)) {
    throw new Error(`${scenario.id} baseline and screenshot output resolve to the same file identity or hard link.`);
  }
}

async function writeAtomic(path, content) {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, content, { flag: "wx" });
  try { await rename(temporary, path); } finally { await rm(temporary, { force: true }); }
}

function contentDigest(content) {
  return createHash("sha256").update(content).digest("hex");
}

function prefixedContentDigest(content) {
  return `sha256:${contentDigest(content)}`;
}

const GENERATION_ID_PATTERN = /^[a-f0-9]{32}$/;
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const POINTER_FIELDS = ["generationId", "kind", "manifestSha256", "projectIdentity", "schemaVersion"];
const MANIFEST_FIELDS = ["configIdentity", "generationId", "kind", "projectIdentity", "scenarios", "schemaVersion"];
const MANIFEST_SCENARIO_FIELDS = ["file", "id", "sha256", "size", "viewport"];

function exactObjectFields(value, fields) {
  return value && typeof value === "object" && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...fields].sort());
}

function scenarioRecords(scenarios) {
  if (!Array.isArray(scenarios) || scenarios.length === 0 || scenarios.length > 1000) {
    throw new Error("Baseline generation requires a bounded non-empty scenario set.");
  }
  const ids = new Set();
  return scenarios.map((scenario) => {
    const viewport = scenario?.viewport;
    if (!scenario || !ID_PATTERN.test(scenario.id) || ids.has(scenario.id)
      || !viewport || !Number.isInteger(viewport.width) || !Number.isInteger(viewport.height)
      || viewport.width < 1 || viewport.height < 1) {
      throw new Error("Baseline generation contains a malformed or duplicate scenario.");
    }
    ids.add(scenario.id);
    return { id: scenario.id, viewport: { width: viewport.width, height: viewport.height } };
  });
}

export function visualBaselineConfigIdentity({ projectIdentity, kind, scenarios, threshold }) {
  strictProjectIdentity(projectIdentity);
  if (!ID_PATTERN.test(kind) || typeof threshold !== "number" || !Number.isFinite(threshold)) {
    throw new Error("Visual baseline config identity input is invalid.");
  }
  const records = scenarios.map((scenario) => ({
    id: scenario.id,
    routePath: scenario.routePath ?? null,
    viewport: { width: scenario.viewport.width, height: scenario.viewport.height },
    reducedMotion: scenario.reducedMotion ?? null,
  }));
  return prefixedContentDigest(JSON.stringify({ schemaVersion: 1, projectIdentity, kind, threshold, scenarios: records }));
}

async function syncDirectory(path) {
  const handle = await open(path, "r");
  try {
    await handle.sync();
  } catch (error) {
    if (process.platform !== "win32" || !["EPERM", "EINVAL", "ENOTSUP"].includes(error.code)) throw error;
    // Node does not expose a Windows directory handle with FILE_FLAG_BACKUP_SEMANTICS.
    // File contents are still fsynced before every atomic rename.
  } finally {
    await handle.close();
  }
}

async function writeExclusiveSynced(path, content) {
  const handle = await open(path, "wx");
  try {
    await handle.writeFile(content);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function immutableFile(path, root, label) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`${label} must be an ordinary immutable file.`);
  const canonicalRoot = await realpath(root);
  const canonical = await realpath(path);
  if (!isInsideOrEqual(canonicalRoot, canonical) || canonical !== resolve(path)) throw new Error(`${label} uses an unsafe path alias, link, or reparse point.`);
  const identityInfo = await stat(path, { bigint: true });
  if (identityInfo.nlink !== 1n) throw new Error(`${label} must not be a hard link or aliased file identity.`);
  return { content: await readFile(path), identity: fileIdentity(identityInfo), path: canonical };
}

async function optionalPointerBytes(baselineRoot) {
  try { return (await immutableFile(join(baselineRoot, "current.json"), baselineRoot, "Baseline current pointer")).content; }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

function parsePointer(source) {
  let pointer;
  try { pointer = JSON.parse(source.toString("utf8")); }
  catch (error) { throw new Error(`Baseline current pointer is invalid JSON: ${error.message}`); }
  if (!exactObjectFields(pointer, POINTER_FIELDS)
    || pointer.schemaVersion !== 1
    || pointer.kind !== "design-consultant-visual-baseline-pointer"
    || !PROJECT_IDENTITY_PATTERN.test(pointer.projectIdentity)
    || !GENERATION_ID_PATTERN.test(pointer.generationId)
    || !SHA256_PATTERN.test(pointer.manifestSha256)) {
    throw new Error("Baseline current pointer has an invalid exact schema.");
  }
  return pointer;
}

async function canonicalGenerationDirectory(baselineRoot, generationId) {
  const generationsRoot = join(baselineRoot, "generations");
  const generations = await existingDirectoryBoundary(generationsRoot, "Baseline generations directory");
  if (!generations) throw new Error("Baseline generations directory is missing.");
  const generationRoot = join(generations.path, generationId);
  const generation = await existingDirectoryBoundary(generationRoot, "Baseline generation directory");
  if (!generation || generation.path !== generationRoot) throw new Error("Baseline generation directory is missing or non-canonical.");
  return generationRoot;
}

function validateGenerationManifest(value, pointer, projectIdentity, configIdentity, scenarios) {
  if (!exactObjectFields(value, MANIFEST_FIELDS)
    || value.schemaVersion !== 1
    || value.kind !== "design-consultant-visual-baseline-generation"
    || value.generationId !== pointer.generationId
    || value.projectIdentity !== pointer.projectIdentity
    || value.projectIdentity !== projectIdentity
    || !SHA256_PATTERN.test(value.configIdentity)
    || (configIdentity !== null && value.configIdentity !== configIdentity)
    || !Array.isArray(value.scenarios)
    || value.scenarios.length === 0
    || value.scenarios.length > 1000) {
    throw new Error("Baseline generation manifest has an invalid exact schema or config identity.");
  }
  const expected = scenarios === null ? null : scenarioRecords(scenarios);
  const ids = new Set();
  for (const [index, record] of value.scenarios.entries()) {
    if (!exactObjectFields(record, MANIFEST_SCENARIO_FIELDS)
      || !ID_PATTERN.test(record.id) || ids.has(record.id)
      || record.file !== `${record.id}.png`
      || !SHA256_PATTERN.test(record.sha256)
      || !Number.isSafeInteger(record.size) || record.size < 1
      || !exactObjectFields(record.viewport, ["height", "width"])
      || !Number.isInteger(record.viewport.width) || !Number.isInteger(record.viewport.height)
      || (expected && (expected[index]?.id !== record.id
        || expected[index].viewport.width !== record.viewport.width
        || expected[index].viewport.height !== record.viewport.height))) {
      throw new Error("Baseline generation manifest contains a malformed, duplicate, or unexpected scenario record.");
    }
    ids.add(record.id);
  }
  if (expected && expected.length !== value.scenarios.length) throw new Error("Baseline generation scenario set differs from the configured scenarios.");
  return value;
}

export async function readBaselineGeneration({ baselineRoot, projectIdentity, configIdentity = null, scenarios = null, hooks = {}, allowMissing = false }) {
  strictProjectIdentity(projectIdentity);
  let canonicalRoot;
  try { canonicalRoot = await realpath(baselineRoot); }
  catch (error) {
    if (error.code === "ENOENT") {
      if (allowMissing) return null;
      throw new Error("Missing baseline current pointer. Run visual-regression.mjs update first.");
    }
    throw error;
  }
  if (canonicalRoot !== resolve(baselineRoot)) throw new Error("Baseline root must be canonical and link-free.");
  const firstPointerBytes = await optionalPointerBytes(canonicalRoot);
  if (firstPointerBytes === null) {
    if (allowMissing) return null;
    throw new Error("Missing baseline current pointer. Run visual-regression.mjs update after reviewing legacy direct baselines.");
  }
  const pointer = parsePointer(firstPointerBytes);
  if (pointer.projectIdentity !== projectIdentity) throw new Error("Baseline current pointer belongs to a different project identity.");
  await hooks.afterPointerRead?.({ pointer: structuredClone(pointer), pointerBytes: Buffer.from(firstPointerBytes) });
  const generationRoot = await canonicalGenerationDirectory(canonicalRoot, pointer.generationId);
  const manifestFile = await immutableFile(join(generationRoot, "manifest.json"), generationRoot, "Baseline generation manifest");
  if (prefixedContentDigest(manifestFile.content) !== pointer.manifestSha256) throw new Error("Baseline generation manifest hash disagrees with the current pointer.");
  let manifest;
  try { manifest = JSON.parse(manifestFile.content.toString("utf8")); }
  catch (error) { throw new Error(`Baseline generation manifest is invalid JSON: ${error.message}`); }
  validateGenerationManifest(manifest, pointer, projectIdentity, configIdentity, scenarios);
  const expectedNames = ["manifest.json", ...manifest.scenarios.map((record) => record.file)].sort();
  const actualNames = (await readdir(generationRoot)).sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) throw new Error("Baseline generation file set differs from its exact manifest.");
  const identities = new Set([manifestFile.identity]);
  const baselines = new Map();
  for (const record of manifest.scenarios) {
    const file = await immutableFile(join(generationRoot, record.file), generationRoot, `Baseline ${record.id}`);
    if (identities.has(file.identity)) throw new Error("Baseline generation files contain a duplicate or hard-linked file identity.");
    identities.add(file.identity);
    if (file.content.length !== record.size || prefixedContentDigest(file.content) !== record.sha256) {
      throw new Error(`Baseline ${record.id} bytes disagree with the immutable generation manifest.`);
    }
    baselines.set(record.id, { content: file.content, path: file.path, identity: file.identity });
  }
  const secondPointerBytes = await optionalPointerBytes(canonicalRoot);
  if (secondPointerBytes === null || !secondPointerBytes.equals(firstPointerBytes)) {
    throw new Error("Baseline current pointer changed concurrently while the immutable generation was being read.");
  }
  return { baselineRoot: canonicalRoot, baselines, generationRoot, manifest, pointer, pointerBytes: firstPointerBytes };
}

async function assertBaselineSnapshotCurrent(snapshot) {
  if (!snapshot) return;
  const current = await optionalPointerBytes(snapshot.baselineRoot);
  if (current === null || !current.equals(snapshot.pointerBytes)) {
    throw new Error("Baseline current pointer changed while visual verification was in progress.");
  }
}

async function preflightImmutableUpdateNamespace(baselineRoot, label) {
  const absoluteRoot = resolve(baselineRoot);
  const boundary = await existingDirectoryBoundary(absoluteRoot, label);
  if (!boundary) {
    let ancestor = dirname(absoluteRoot);
    while (true) {
      const existing = await existingDirectoryBoundary(ancestor, `${label} ancestor`);
      if (existing) break;
      const parent = dirname(ancestor);
      if (parent === ancestor) throw new Error(`${label} has no canonical existing ancestor.`);
      ancestor = parent;
    }
    return { baselineRoot: absoluteRoot, exists: false };
  }
  const entries = (await readdir(boundary.path)).sort();
  if (entries.includes("current.json")) {
    throw new Error(`${label} is already published and immutable. Configure a new versioned baselineDir before updating visual baselines.`);
  }
  if (entries.length > 0) {
    throw new Error(`${label} is not an empty unpublished namespace (${entries.join(", ")}). Inspect it manually and use a new versioned baselineDir.`);
  }
  return { baselineRoot: boundary.path, exists: true };
}

async function acquireGenerationWriterLock(baselineRoot) {
  const lockPath = join(baselineRoot, ".visual-update.lock");
  const owner = Buffer.from(`${JSON.stringify({ schemaVersion: 1, pid: process.pid, nonce: randomUUID().replaceAll("-", "") })}\n`);
  try { await writeExclusiveSynced(lockPath, owner); }
  catch (error) {
    if (error.code === "EEXIST") throw new Error("Baseline writer lock exists. Automatic stale takeover is forbidden; inspect and clear it manually only after proving no writer is active.");
    throw error;
  }
  await syncDirectory(baselineRoot);
  return { lockPath, owner };
}

async function releaseGenerationWriterLock(baselineRoot, lock) {
  const current = await immutableFile(lock.lockPath, baselineRoot, "Baseline writer lock");
  if (!current.content.equals(lock.owner)) throw new Error("Baseline writer lock bytes changed before release.");
  await rm(lock.lockPath);
  await syncDirectory(baselineRoot);
}

function preparedGeneration({ generationId, projectIdentity, configIdentity, scenarios, entries }) {
  strictProjectIdentity(projectIdentity);
  if (!SHA256_PATTERN.test(configIdentity)) throw new Error("Baseline generation config identity must be a SHA-256 value.");
  const records = scenarioRecords(scenarios);
  if (!Array.isArray(entries) || entries.length !== records.length) throw new Error("Baseline generation entries must exactly match the configured scenarios.");
  const byId = new Map();
  for (const entry of entries) {
    if (!entry || !ID_PATTERN.test(entry.id) || byId.has(entry.id) || !Buffer.isBuffer(entry.content)) {
      throw new Error("Baseline generation entry is malformed or duplicated.");
    }
    byId.set(entry.id, entry.content);
  }
  const manifestScenarios = records.map((scenario) => {
    const content = byId.get(scenario.id);
    if (!content) throw new Error("Baseline generation entries differ from the configured scenario set.");
    return {
      id: scenario.id,
      viewport: scenario.viewport,
      file: `${scenario.id}.png`,
      sha256: prefixedContentDigest(content),
      size: content.length,
    };
  });
  return {
    manifest: {
      schemaVersion: 1,
      kind: "design-consultant-visual-baseline-generation",
      generationId,
      projectIdentity,
      configIdentity,
      scenarios: manifestScenarios,
    },
    byId,
  };
}

async function verifyPreparedGeneration({ generationRoot, prepared, manifestBytes, ownerBytes = null }) {
  const boundary = await existingDirectoryBoundary(generationRoot, "Prepared baseline generation directory");
  if (!boundary || boundary.path !== generationRoot) throw new Error("Prepared baseline generation directory is missing or unsafe.");
  const expectedNames = [
    ...(ownerBytes === null ? [] : [".owner.json"]),
    "manifest.json",
    ...prepared.manifest.scenarios.map((record) => record.file),
  ].sort();
  const actualNames = (await readdir(generationRoot)).sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error("Prepared baseline generation file set differs from its exact manifest and owner state.");
  }
  const identities = new Set();
  let owner = null;
  if (ownerBytes !== null) {
    owner = await immutableFile(join(generationRoot, ".owner.json"), generationRoot, "Baseline generation owner marker");
    if (!owner.content.equals(ownerBytes)) throw new Error("Baseline generation owner marker bytes changed before publication.");
    identities.add(owner.identity);
  }
  const manifestFile = await immutableFile(join(generationRoot, "manifest.json"), generationRoot, "Prepared baseline generation manifest");
  if (!manifestFile.content.equals(manifestBytes)) throw new Error("Prepared baseline generation manifest bytes changed before publication.");
  if (identities.has(manifestFile.identity)) throw new Error("Prepared baseline generation contains an aliased manifest identity.");
  identities.add(manifestFile.identity);
  let manifest;
  try { manifest = JSON.parse(manifestFile.content.toString("utf8")); }
  catch (error) { throw new Error(`Prepared baseline generation manifest is invalid JSON: ${error.message}`); }
  validateGenerationManifest(
    manifest,
    { generationId: prepared.manifest.generationId, projectIdentity: prepared.manifest.projectIdentity },
    prepared.manifest.projectIdentity,
    prepared.manifest.configIdentity,
    prepared.manifest.scenarios,
  );
  if (JSON.stringify(manifest) !== JSON.stringify(prepared.manifest)) {
    throw new Error("Prepared baseline generation manifest differs from the exact staged project, config, or scenario identity.");
  }
  for (const record of prepared.manifest.scenarios) {
    const file = await immutableFile(join(generationRoot, record.file), generationRoot, `Prepared baseline ${record.id}`);
    if (identities.has(file.identity)) throw new Error("Prepared baseline generation files contain a duplicate or hard-linked file identity.");
    identities.add(file.identity);
    if (file.content.length !== record.size || prefixedContentDigest(file.content) !== record.sha256) {
      throw new Error(`Prepared baseline ${record.id} bytes disagree with the exact staged manifest.`);
    }
  }
  return { owner };
}

export async function publishBaselineGeneration({ baselineRoot, projectIdentity, configIdentity, scenarios, entries, hooks = {} }) {
  const canonicalRoot = await realpath(baselineRoot);
  if (canonicalRoot !== resolve(baselineRoot)) throw new Error("Baseline generation root must be canonical and link-free.");
  const observedPointerBytes = await optionalPointerBytes(canonicalRoot);
  if (observedPointerBytes !== null) throw new Error("This versioned baselineDir is already published and immutable. Configure a new versioned baselineDir before updating visual baselines.");
  const legacy = (await readdir(canonicalRoot)).filter((name) => name.endsWith(".png"));
  if (legacy.length > 0) throw new Error("Legacy direct baselines require explicit manual migration; immutable update will not overwrite them.");
  const preexistingEntries = (await readdir(canonicalRoot)).filter((name) => name !== ".visual-update.lock");
  if (preexistingEntries.length > 0) {
    throw new Error(`Unpublished baseline namespace contains an unknown generation, pointer temporary, file, or directory: ${preexistingEntries.sort().join(", ")}. Use a new versioned baselineDir.`);
  }
  const generationId = hooks.generationId ? await hooks.generationId() : randomUUID().replaceAll("-", "");
  if (!GENERATION_ID_PATTERN.test(generationId)) throw new Error("Baseline generation nonce is invalid.");
  const prepared = preparedGeneration({ generationId, projectIdentity, configIdentity, scenarios, entries });
  const lock = await acquireGenerationWriterLock(canonicalRoot);
  const generationsRoot = join(canonicalRoot, "generations");
  const generationRoot = join(generationsRoot, generationId);
  const ownerPath = join(generationRoot, ".owner.json");
  const ownerBytes = Buffer.from(JSON.stringify({
    schemaVersion: 1,
    kind: "design-consultant-visual-baseline-generation-owner",
    generationId,
    projectIdentity,
  }));
  const pointerTemp = join(canonicalRoot, `.current-${generationId}.tmp`);
  let simulatedCrash = false;
  let pointerTempOwned = false;
  try {
    await hooks.afterLockAcquired?.({ lockPath: lock.lockPath });
    const lockedPointerBytes = await optionalPointerBytes(canonicalRoot);
    if (lockedPointerBytes !== null) throw new Error("This versioned baselineDir was published before the writer lock was established. Use a new versioned baselineDir.");
    const lockedEntries = (await readdir(canonicalRoot)).sort();
    if (JSON.stringify(lockedEntries) !== JSON.stringify([".visual-update.lock"])) {
      throw new Error(`Unpublished baseline namespace changed before generation reservation: ${lockedEntries.join(", ")}. Use a new versioned baselineDir.`);
    }
    try { await mkdir(generationsRoot); } catch (error) { if (error.code !== "EEXIST") throw error; }
    const generationsBoundary = await existingDirectoryBoundary(generationsRoot, "Baseline generations directory");
    if (!generationsBoundary || generationsBoundary.path !== generationsRoot) throw new Error("Baseline generations directory is unsafe.");
    try {
      await mkdir(generationRoot);
    } catch (error) {
      if (error.code === "EEXIST") throw new Error("Baseline generation id collides with an existing directory, file, or link. Existing bytes were not modified.");
      throw error;
    }
    await writeExclusiveSynced(ownerPath, ownerBytes);
    await syncDirectory(generationRoot);
    await syncDirectory(generationsRoot);
    await hooks.afterGenerationReserved?.({ generationRoot, ownerPath, ownerBytes: Buffer.from(ownerBytes) });
    for (const record of prepared.manifest.scenarios) {
      await writeExclusiveSynced(join(generationRoot, record.file), prepared.byId.get(record.id));
    }
    await hooks.afterFilesWritten?.({ generationRoot });
    const manifestBytes = Buffer.from(JSON.stringify(prepared.manifest));
    await writeExclusiveSynced(join(generationRoot, "manifest.json"), manifestBytes);
    await syncDirectory(generationRoot);
    await hooks.afterManifestWritten?.({ generationRoot, manifestPath: join(generationRoot, "manifest.json") });
    const verifiedWithOwner = await verifyPreparedGeneration({ generationRoot, prepared, manifestBytes, ownerBytes });
    const owner = await immutableFile(ownerPath, generationRoot, "Baseline generation owner marker");
    if (!owner.content.equals(ownerBytes) || owner.identity !== verifiedWithOwner.owner.identity) {
      throw new Error("Baseline generation owner marker changed before generation finalization.");
    }
    await rm(ownerPath);
    await syncDirectory(generationRoot);
    await syncDirectory(generationsRoot);
    await verifyPreparedGeneration({ generationRoot, prepared, manifestBytes });
    await hooks.afterGenerationInstalled?.({ generationRoot });
    const pointerBytes = Buffer.from(JSON.stringify({
      schemaVersion: 1,
      kind: "design-consultant-visual-baseline-pointer",
      generationId,
      projectIdentity,
      manifestSha256: prefixedContentDigest(manifestBytes),
    }));
    await writeExclusiveSynced(pointerTemp, pointerBytes);
    pointerTempOwned = true;
    await hooks.beforePointerPublish?.({ generationRoot, pointerPath: join(canonicalRoot, "current.json") });
    await verifyPreparedGeneration({ generationRoot, prepared, manifestBytes });
    try {
      await link(pointerTemp, join(canonicalRoot, "current.json"));
    } catch (error) {
      if (error.code === "EEXIST") throw new Error("This versioned baselineDir was published concurrently. Use a new versioned baselineDir.");
      throw error;
    }
    await syncDirectory(canonicalRoot);
    await rm(pointerTemp);
    pointerTempOwned = false;
    await syncDirectory(canonicalRoot);
    await hooks.afterPointerPublished?.({ generationRoot, pointerPath: join(canonicalRoot, "current.json") });
    return readBaselineGeneration({ baselineRoot: canonicalRoot, projectIdentity, configIdentity, scenarios });
  } catch (error) {
    simulatedCrash = error?.simulateCrash === true;
    if (!simulatedCrash) {
      if (pointerTempOwned) await rm(pointerTemp, { force: true });
    }
    throw error;
  } finally {
    if (!simulatedCrash) await releaseGenerationWriterLock(canonicalRoot, lock);
  }
}

function applicationScenarios(config) {
  return config.routes.flatMap((route) => route.viewports.map((viewport) => ({
    id: `${route.id}-${viewport.id}`,
    routeId: route.id,
    routePath: route.path,
    viewport,
    url: `${config.baseUrl}${route.path}`,
    output: join(config.outputRoot, `${route.id}-${viewport.id}.png`),
  })));
}

export async function inspectVisualConfig(configPath) {
  const config = await loadVisualConfig(configPath);
  const scenarios = applicationScenarios(config);
  const configIdentity = scenarios.length === 0 ? null : visualBaselineConfigIdentity({ projectIdentity: config.projectIdentity, kind: "application", scenarios, threshold: config.threshold });
  let snapshot = null;
  if (scenarios.length > 0 && await existingDirectoryBoundary(config.baselineRoot, "baselineDir")) {
    snapshot = await readBaselineGeneration({
      baselineRoot: config.baselineRoot,
      projectIdentity: config.projectIdentity,
      configIdentity,
      scenarios,
      allowMissing: true,
    });
  }
  const routes = [];
  for (const scenario of scenarios) {
    const baseline = snapshot?.baselines.get(scenario.id) ?? null;
    routes.push({
      id: scenario.id,
      routeId: scenario.routeId,
      path: scenario.routePath,
      viewport: scenario.viewport,
      baseline: baseline?.path ?? null,
      baselineExists: baseline !== null,
    });
  }
  return {
    applicationVisualVerification: routes.length === 0 ? "not-configured" : routes.every((route) => route.baselineExists) ? "configured" : "missing-baseline",
    projectIdentity: config.projectIdentity,
    baseUrl: config.baseUrl,
    routes,
    baselineDir: config.baselineDir,
    outputDir: config.outputDir,
    threshold: config.threshold,
    startCommandConfigured: Boolean(config.startCommand),
    startCommandExecutable: false,
    startCommandPolicy: "manual-external-service-only",
  };
}

function safeFile(requestUrl) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(requestUrl || "/", "http://localhost").pathname); } catch { return null; }
  const candidate = resolve(STATIC_ROOT, `.${normalize(pathname)}`);
  const relativePath = relative(STATIC_ROOT, candidate);
  if (relativePath.startsWith(`..${sep}`) || relativePath === "..") return null;
  return candidate;
}

async function startCatalogServer() {
  const server = createServer(async (request, response) => {
    const file = safeFile(request.url);
    if (!file) { response.writeHead(403).end("Forbidden"); return; }
    try {
      const body = await readFile(file);
      response.writeHead(200, { "Content-Type": MIME.get(extname(file).toLowerCase()) || "application/octet-stream", "Cache-Control": "no-store" });
      response.end(body);
    } catch (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500).end(error.code === "ENOENT" ? "Not found" : "Server error");
    }
  });
  await new Promise((accept, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", accept);
  });
  const address = server.address();
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

export function analyzePixels(buffer) {
  const image = PNG.sync.read(buffer);
  const colors = new Map();
  let sampled = 0;
  let dominant = 0;
  for (let y = 0; y < image.height; y += 3) {
    for (let x = 0; x < image.width; x += 3) {
      const offset = (image.width * y + x) * 4;
      const key = `${image.data[offset]},${image.data[offset + 1]},${image.data[offset + 2]},${image.data[offset + 3]}`;
      const count = (colors.get(key) || 0) + 1;
      colors.set(key, count);
      if (count > dominant) dominant = count;
      sampled += 1;
    }
  }
  return { uniqueColors: colors.size, nonBlankRatio: 1 - dominant / sampled };
}

function comparePixels(actualBuffer, baselineBuffer) {
  const actual = PNG.sync.read(actualBuffer);
  const baseline = PNG.sync.read(baselineBuffer);
  if (actual.width !== baseline.width || actual.height !== baseline.height) {
    return { mismatchRatio: 1, reason: `size ${actual.width}x${actual.height} != ${baseline.width}x${baseline.height}` };
  }
  const diff = new PNG({ width: actual.width, height: actual.height });
  const mismatched = pixelmatch(actual.data, baseline.data, diff.data, actual.width, actual.height, { threshold: 0.18, includeAA: false });
  return { mismatchRatio: mismatched / (actual.width * actual.height), diff: PNG.sync.write(diff) };
}

async function assertCatalogLayout(page, scenario) {
  const result = await page.evaluate(({ mobile }) => {
    const html = document.documentElement;
    const topbar = document.querySelector(".catalog-topbar")?.getBoundingClientRect();
    const sidebar = document.querySelector(".catalog-sidebar")?.getBoundingClientRect();
    const main = document.querySelector(".catalog-main")?.getBoundingClientRect();
    const cards = [...document.querySelectorAll("[data-catalog-item]:not([hidden])")].map((element) => element.getBoundingClientRect());
    const controls = [...document.querySelectorAll(".catalog-segments button")].filter((element) => element.getClientRects().length > 0);
    const signatures = [...document.querySelectorAll(".dc-brand-attribution")].filter((element) => element.getClientRects().length > 0);
    return {
      horizontalOverflow: html.scrollWidth - html.clientWidth,
      topbarInViewport: Boolean(topbar && topbar.left >= -1 && topbar.right <= innerWidth + 1 && topbar.height > 0),
      cardsInViewport: cards.every((card) => card.left >= -1 && card.right <= innerWidth + 1 && card.width > 0),
      controlsFit: controls.every((control) => control.scrollWidth <= control.clientWidth + 1),
      signaturesFit: signatures.every((signature) => signature.scrollWidth <= signature.clientWidth + 1),
      shellSeparated: mobile ? Boolean(sidebar && sidebar.right <= 1) : Boolean(sidebar && main && sidebar.right <= main.left + 1),
    };
  }, { mobile: scenario.id === "mobile" });
  const failures = Object.entries(result).filter(([key, value]) => key === "horizontalOverflow" ? value > 1 : value !== true);
  if (failures.length > 0) throw new Error(`${scenario.id} layout check failed: ${JSON.stringify(result)}`);
}

async function readBrandAttributionColors(page, accentScope = "focus-and-orbit") {
  return page.evaluate((scope) => {
    const signature = document.querySelector(`.dc-brand-attribution--brand[data-accent-scope="${scope}"]`);
    const accentBack = signature?.querySelector(".dc-brand-attribution__mark-layer--orbit-back");
    const accent = signature?.querySelector(".dc-brand-attribution__mark-layer--orbit-front");
    const focus = signature?.querySelector(".dc-brand-attribution__mark-layer--focus");
    const neutral = signature?.querySelector(".dc-brand-attribution__mark-layer--neutral");
    const ai = signature?.querySelector(".dc-brand-attribution__ai .dc-brand-attribution__glyph");
    if (!signature || !accentBack || !accent || !focus || !neutral || !ai) throw new Error(`Brand attribution ${scope} color layers were not rendered.`);
    const resolvePaint = (value) => {
      const probe = document.createElement("span");
      probe.style.position = "absolute";
      probe.style.background = value;
      document.body.append(probe);
      const style = getComputedStyle(probe);
      const result = style.backgroundImage !== "none" ? style.backgroundImage : style.backgroundColor;
      probe.remove();
      return result;
    };
    const readPaint = (style) => style.backgroundImage !== "none" ? style.backgroundImage : style.backgroundColor;
    const accentBackStyle = getComputedStyle(accentBack);
    const accentStyle = getComputedStyle(accent);
    const focusStyle = getComputedStyle(focus);
    const neutralStyle = getComputedStyle(neutral);
    const aiStyle = getComputedStyle(ai);
    const signatureStyle = getComputedStyle(signature);
    return {
      accentBack: readPaint(accentBackStyle),
      accent: readPaint(accentStyle),
      expectedAccent: resolvePaint(signatureStyle.getPropertyValue("--dc-brand-attribution-accent-paint")),
      focus: readPaint(focusStyle),
      neutral: readPaint(neutralStyle),
      expectedNeutral: resolvePaint(signatureStyle.getPropertyValue("--dc-brand-attribution-neutral-paint")),
      ai: readPaint(aiStyle),
      expectedAi: resolvePaint(signatureStyle.getPropertyValue("--dc-brand-attribution-ai-paint")),
      accentBackMask: accentBackStyle.maskImage || accentBackStyle.webkitMaskImage,
      accentMask: accentStyle.maskImage || accentStyle.webkitMaskImage,
      focusMask: focusStyle.maskImage || focusStyle.webkitMaskImage,
      neutralMask: neutralStyle.maskImage || neutralStyle.webkitMaskImage,
    };
  }, accentScope);
}

async function assertInteractions(page) {
  const adoptionCatalog = await page.locator(".catalog-shell").getAttribute("data-catalog-workflow") === "existing-system-adoption";
  const search = page.getByRole("searchbox", { name: "搜索组件" });
  await search.fill("DataTable");
  if (await page.locator("[data-catalog-item]:visible").count() !== 1) throw new Error("Catalog search did not isolate DataTable.");
  await search.fill("");
  await page.getByRole("button", { name: "紧凑" }).click();
  if (await page.locator(".catalog-shell").getAttribute("data-catalog-density") !== "compact") throw new Error("Density control did not update the Catalog.");
  const selectCard = page.locator('[data-catalog-title="SelectField"]').first();
  const dataRegion = adoptionCatalog
    ? selectCard.locator("select").first()
    : selectCard.locator(".dc-select-trigger").first();
  if (adoptionCatalog) {
    await dataRegion.selectOption("south");
    if (await dataRegion.inputValue() !== "south") throw new Error("SelectField did not update.");
  } else {
    await dataRegion.click();
    await page.getByRole("option", { name: /华南/ }).click();
    if (!(await dataRegion.textContent())?.includes("华南")) throw new Error("SelectField did not update.");
  }
  await dataRegion.focus();
  if (!adoptionCatalog) {
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Escape");
  }
  const focusStyle = await dataRegion.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      boxShadow: style.boxShadow,
      focusVisible: element.matches(":focus-visible"),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    };
  });
  const visibleShadow = Boolean(focusStyle.boxShadow && focusStyle.boxShadow !== "none");
  const visibleOutline = focusStyle.outlineStyle !== "none" && Number.parseFloat(focusStyle.outlineWidth) > 0;
  if (!focusStyle.focusVisible || (adoptionCatalog ? !visibleShadow && !visibleOutline : !visibleShadow)) {
    throw new Error(`SelectField focus ring is not visible in computed styles: ${JSON.stringify(focusStyle)}`);
  }
  await page.getByRole("button", { name: adoptionCatalog ? "打开复核对话框" : "提交复核", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  if (adoptionCatalog) return;
  const harborLight = await readBrandAttributionColors(page);
  if (harborLight.accentBack !== harborLight.expectedAccent || harborLight.accent !== harborLight.expectedAccent || harborLight.focus !== harborLight.expectedAccent || harborLight.neutral !== harborLight.expectedNeutral || harborLight.ai !== harborLight.expectedAi) throw new Error(`Brand attribution did not resolve default semantic colors: ${JSON.stringify(harborLight)}`);
  if (![harborLight.accentBackMask, harborLight.accentMask, harborLight.focusMask, harborLight.neutralMask].every((mask) => mask.includes("data:image/svg+xml;base64,"))) throw new Error(`Brand attribution embedded masks were not applied: ${JSON.stringify(harborLight)}`);
  const orbitOnly = await readBrandAttributionColors(page, "orbit-only");
  if (orbitOnly.accentBack !== orbitOnly.expectedAccent || orbitOnly.accent !== orbitOnly.expectedAccent || orbitOnly.focus !== orbitOnly.expectedNeutral || orbitOnly.neutral !== orbitOnly.expectedNeutral) throw new Error(`Brand attribution orbit-only scope did not keep A neutral: ${JSON.stringify(orbitOnly)}`);
  await page.getByRole("button", { name: "珊瑚红" }).click();
  const coralLight = await readBrandAttributionColors(page);
  if (coralLight.accent !== coralLight.expectedAccent || coralLight.accent !== harborLight.accent || coralLight.neutral !== coralLight.expectedNeutral || coralLight.neutral !== harborLight.neutral) throw new Error(`Brand attribution default accent and formal metallic paint should remain canonical across light palettes: ${JSON.stringify({ harborLight, coralLight })}`);
  await page.getByLabel("自定义 SPACE 重点色").fill("#C24135");
  const customLight = await readBrandAttributionColors(page);
  if (customLight.accent !== customLight.expectedAccent || customLight.accent === coralLight.accent || customLight.ai !== coralLight.ai) throw new Error(`Brand attribution custom accent did not override only the SPACE token: ${JSON.stringify({ coralLight, customLight })}`);
  await page.getByLabel("自定义 AI 色").fill("#C24135");
  const customAiLight = await readBrandAttributionColors(page);
  if (customAiLight.ai !== customAiLight.expectedAi || customAiLight.ai === customLight.ai || customAiLight.accent !== customLight.accent) throw new Error(`Brand attribution custom AI color did not remain independent: ${JSON.stringify({ customLight, customAiLight })}`);
  await page.locator(".brand-attribution-color-control").nth(1).getByRole("button", { name: "恢复默认" }).click();
  const restoredAiLight = await readBrandAttributionColors(page);
  if (restoredAiLight.ai !== coralLight.ai || restoredAiLight.accent !== customLight.accent) throw new Error(`Brand attribution default AI core blue was not restored independently: ${JSON.stringify({ coralLight, customLight, restoredAiLight })}`);
  await page.locator(".brand-attribution-color-control").first().getByRole("button", { name: "恢复默认" }).click();
  const restoredLight = await readBrandAttributionColors(page);
  if (restoredLight.accent !== coralLight.accent || restoredLight.ai !== coralLight.ai) throw new Error(`Brand attribution default color tokens were not restored: ${JSON.stringify({ coralLight, restoredLight })}`);
  await page.getByRole("button", { name: "深色" }).click();
  if (await page.locator("html").getAttribute("data-palette") !== "coral" || await page.locator("html").getAttribute("data-theme") !== "dark") throw new Error("Appearance controls did not update root tokens.");
  const coralDark = await readBrandAttributionColors(page);
  if (coralDark.accent !== coralDark.expectedAccent || coralDark.neutral !== coralDark.expectedNeutral || coralDark.ai !== coralDark.expectedAi || coralDark.neutral !== coralLight.neutral || coralDark.accent === coralLight.accent) throw new Error(`Brand attribution did not preserve formal metallic paint while resolving dark accent colors: ${JSON.stringify({ coralLight, coralDark })}`);
  await page.getByRole("link", { name: /可视化组件/ }).click();
  await page.getByRole("link", { name: /基础图表/ }).click();
  const frame = page.locator("iframe.catalog-visualization");
  await frame.waitFor();
  await page.waitForFunction(() => document.querySelector("iframe.catalog-visualization")?.getAttribute("src")?.includes("basics-gallery.html"));
  if (!(await frame.getAttribute("src"))?.includes("basics-gallery.html")) throw new Error("Visualization submenu did not switch the iframe.");
  await page.frameLocator("iframe.catalog-visualization").locator("body").waitFor({ state: "visible" });
}

function collectBrowserErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("requestfailed", (request) => errors.push(`request failed ${request.url()}: ${request.failure()?.errorText ?? "unknown"}`));
  page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  return errors;
}

function assertFinalRoute(page, scenario, baseUrl) {
  const expected = new URL(scenario.routePath, baseUrl);
  const actual = new URL(page.url());
  if (actual.origin !== expected.origin
    || actual.pathname !== expected.pathname
    || actual.search !== ""
    || actual.hash !== "") {
    throw new Error(`${scenario.id} final URL crossed its configured origin or route boundary: expected ${expected.href}, received ${actual.href}.`);
  }
}

async function inspectCatalog() {
  const configIdentity = visualBaselineConfigIdentity({ projectIdentity: CATALOG_PROJECT_IDENTITY, kind: "catalog", scenarios: SCENARIOS, threshold: 0.08 });
  const snapshot = await readBaselineGeneration({ baselineRoot: BASELINE_ROOT, projectIdentity: CATALOG_PROJECT_IDENTITY, configIdentity, scenarios: SCENARIOS, allowMissing: true });
  const scenarios = [];
  for (const scenario of SCENARIOS) {
    const baseline = snapshot?.baselines.get(scenario.id) ?? null;
    scenarios.push({ ...scenario, baseline: baseline?.path ?? null, baselineExists: baseline !== null });
  }
  return { scenarios, checks: { pixelDiff: true, nonBlankPixels: true, layoutOverflow: true, interactions: true, computedFocusRing: true } };
}

export async function runCatalogVisuals(mode, options = {}) {
  const baselineRoot = resolve(options.baselineRoot ?? BASELINE_ROOT);
  const outputRoot = resolve(options.outputRoot ?? OUTPUT_ROOT);
  const configIdentity = visualBaselineConfigIdentity({ projectIdentity: CATALOG_PROJECT_IDENTITY, kind: "catalog", scenarios: SCENARIOS, threshold: 0.08 });
  if (mode === "update") await preflightImmutableUpdateNamespace(baselineRoot, "Catalog baseline directory");
  const baselineSnapshot = await readBaselineGeneration({
    baselineRoot,
    projectIdentity: CATALOG_PROJECT_IDENTITY,
    configIdentity,
    scenarios: SCENARIOS,
    hooks: options.baselineReadHooks,
    allowMissing: mode === "update",
  });
  if (mode === "update" && baselineSnapshot !== null) {
    throw new Error("This versioned baselineDir is already published and immutable. Configure a new versioned baselineDir before updating visual baselines.");
  }
  await mkdir(outputRoot, { recursive: true });
  if (mode === "update") await mkdir(baselineRoot, { recursive: true });
  const outputBoundary = await existingDirectoryBoundary(outputRoot, "Catalog output directory");
  if (!outputBoundary) throw new Error("Catalog output directory could not be created safely.");
  if (mode === "update") {
    const baselineBoundary = await existingDirectoryBoundary(baselineRoot, "Catalog baseline directory");
    if (!baselineBoundary) throw new Error("Catalog baseline directory could not be created safely.");
  }
  await assertDistinctDirectoryBoundaries(baselineRoot, outputRoot);
  const { server, origin } = await startCatalogServer();
  let browser = null;
  const report = [];
  const stagedBaselines = [];
  let failure = null;
  try {
    browser = await (options.browserType ?? chromium).launch({ headless: true });
    for (const [index, scenario] of SCENARIOS.entries()) {
      await options.beforeScenario?.({ index, scenario });
      const output = join(outputRoot, `${scenario.id}.png`);
      const baseline = baselineSnapshot?.baselines.get(scenario.id) ?? null;
      const fileScenario = { ...scenario, baseline: baseline?.path, output };
      if (baseline) await assertScenarioFilesDistinct(fileScenario, baselineRoot, outputRoot);
      const context = await browser.newContext({ viewport: scenario.viewport, reducedMotion: scenario.reducedMotion, colorScheme: "light" });
      try {
        const page = await context.newPage();
        const runtimeErrors = collectBrowserErrors(page);
        await page.goto(`${origin}${CATALOG_PATH}#foundation`, { waitUntil: "networkidle" });
        await page.locator("[data-catalog-item]").first().waitFor();
        await page.evaluate(() => document.fonts.ready);
        await assertCatalogLayout(page, scenario);
        const screenshot = await page.screenshot({ animations: "disabled" });
        await writeAtomic(output, screenshot);
        if (baseline) await assertScenarioFilesDistinct(fileScenario, baselineRoot, outputRoot);
        const pixels = analyzePixels(screenshot);
        if (pixels.uniqueColors < 40 || pixels.nonBlankRatio < 0.015) throw new Error(`${scenario.id} appears blank: ${JSON.stringify(pixels)}`);
        let mismatchRatio = 0;
        if (mode === "update") {
          stagedBaselines.push({ id: scenario.id, content: screenshot });
        } else {
          if (!baseline) throw new Error(`Missing immutable baseline for ${scenario.id}. Run visual-regression.mjs update.`);
          const comparison = comparePixels(screenshot, baseline.content);
          mismatchRatio = comparison.mismatchRatio;
          if (comparison.diff) await writeAtomic(join(outputRoot, `${scenario.id}.diff.png`), comparison.diff);
          if (mismatchRatio > 0.08) throw new Error(`${scenario.id} visual mismatch ${(mismatchRatio * 100).toFixed(2)}%${comparison.reason ? ` (${comparison.reason})` : ""}.`);
        }
        if (scenario.id === "desktop") await assertInteractions(page);
        if (runtimeErrors.length > 0) throw new Error(`${scenario.id} browser errors: ${runtimeErrors.join(" | ")}`);
        report.push({ id: scenario.id, output, baseline: baseline?.path ?? null, mismatchRatio, ...pixels });
      } finally {
        await context.close();
      }
    }
  } catch (error) {
    failure = error;
  }
  try {
    if (browser) await browser.close();
  } catch (error) {
    failure = failure ? new AggregateError([failure, error], "Catalog verification and browser cleanup both failed.") : error;
  }
  try {
    await new Promise((accept, reject) => server.close((error) => error ? reject(error) : accept()));
  } catch (error) {
    failure = failure ? new AggregateError([failure, error], "Catalog verification and server cleanup both failed.") : error;
  }
  if (failure) throw failure;
  if (mode === "test") await assertBaselineSnapshotCurrent(baselineSnapshot);
  if (mode === "update") {
    const published = await publishBaselineGeneration({
      baselineRoot,
      projectIdentity: CATALOG_PROJECT_IDENTITY,
      configIdentity,
      scenarios: SCENARIOS,
      entries: stagedBaselines,
      hooks: options.transactionHooks,
    });
    for (const entry of report) entry.baseline = published.baselines.get(entry.id).path;
  }
  return report;
}

export async function runApplicationVisuals(mode, configPath, options = {}) {
  if (Object.hasOwn(options, "allowStartCommand")) throw new Error("Unknown visual API option: allowStartCommand.");
  if (mode !== "test" && mode !== "update") throw new Error("Application visual mode must be test or update.");
  const config = await loadVisualConfig(configPath);
  const scenarios = applicationScenarios(config);
  if (scenarios.length === 0) return { applicationVisualVerification: "not-configured", report: [], startCommandExecuted: false };
  const requestedBaselineRoot = resolve(config.configDir, ...config.baselineDir.split("/"));
  if (mode === "update") await preflightImmutableUpdateNamespace(requestedBaselineRoot, "Application baseline directory");
  const baselineRoot = mode === "update"
    ? await ensureSafeDirectory(config.configDir, config.baselineDir, "baselineDir")
    : requestedBaselineRoot;
  const outputRoot = await ensureSafeDirectory(config.configDir, config.outputDir, "outputDir");
  await assertDistinctDirectoryBoundaries(baselineRoot, outputRoot);
  config.baselineRoot = baselineRoot;
  config.outputRoot = outputRoot;
  for (const scenario of scenarios) {
    scenario.output = join(outputRoot, `${scenario.routeId}-${scenario.viewport.id}.png`);
  }
  const configIdentity = visualBaselineConfigIdentity({ projectIdentity: config.projectIdentity, kind: "application", scenarios, threshold: config.threshold });
  const baselineSnapshot = await readBaselineGeneration({
    baselineRoot,
    projectIdentity: config.projectIdentity,
    configIdentity,
    scenarios,
    hooks: options.baselineReadHooks,
    allowMissing: mode === "update",
  });
  if (mode === "update" && baselineSnapshot !== null) {
    throw new Error("This versioned baselineDir is already published and immutable. Configure a new versioned baselineDir before updating visual baselines.");
  }

  let browser = null;
  const report = [];
  const stagedBaselines = [];
  let failure = null;
  try {
    browser = await (options.browserType ?? chromium).launch({ headless: true });
    for (const scenario of scenarios) {
      const baseline = baselineSnapshot?.baselines.get(scenario.id) ?? null;
      const fileScenario = { ...scenario, baseline: baseline?.path };
      if (baseline) await assertScenarioFilesDistinct(fileScenario, baselineRoot, outputRoot);
      const context = await browser.newContext({ viewport: { width: scenario.viewport.width, height: scenario.viewport.height }, colorScheme: "light", reducedMotion: "reduce" });
      try {
        const page = await context.newPage();
        const runtimeErrors = collectBrowserErrors(page);
        await page.goto(scenario.url, { waitUntil: "networkidle", timeout: 15000 });
        assertFinalRoute(page, scenario, config.baseUrl);
        await page.evaluate(() => document.fonts.ready);
        const horizontalOverflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0) - document.documentElement.clientWidth);
        if (horizontalOverflow > 1) throw new Error(`${scenario.id} horizontal overflow: ${horizontalOverflow}px.`);
        const screenshot = await page.screenshot({ animations: "disabled" });
        const pixels = analyzePixels(screenshot);
        if (pixels.uniqueColors < 4 || pixels.nonBlankRatio < 0.015) throw new Error(`${scenario.id} appears blank: ${JSON.stringify(pixels)}`);
        await new Promise((accept) => setTimeout(accept, 25));
        if (runtimeErrors.length > 0) throw new Error(`${scenario.id} browser errors: ${runtimeErrors.join(" | ")}`);
        await writeAtomic(scenario.output, screenshot);
        if (baseline) await assertScenarioFilesDistinct(fileScenario, baselineRoot, outputRoot);
        let mismatchRatio = 0;
        if (mode === "update") {
          stagedBaselines.push({ id: scenario.id, content: screenshot });
        } else {
          if (!baseline) throw new Error(`Missing immutable baseline for ${scenario.id}. Run visual-regression.mjs update --config first.`);
          const comparison = comparePixels(screenshot, baseline.content);
          mismatchRatio = comparison.mismatchRatio;
          if (comparison.diff) await writeFile(join(outputRoot, `${scenario.id}.diff.png`), comparison.diff);
          if (mismatchRatio > config.threshold) {
            throw new Error(`${scenario.id} visual mismatch ${(mismatchRatio * 100).toFixed(2)}% exceeds threshold ${(config.threshold * 100).toFixed(2)}%${comparison.reason ? ` (${comparison.reason})` : ""}.`);
          }
        }
        report.push({ id: scenario.id, routeId: scenario.routeId, path: scenario.routePath, viewport: scenario.viewport, output: scenario.output, baseline: baseline?.path ?? null, mismatchRatio, horizontalOverflow, ...pixels });
      } finally {
        await context.close();
      }
    }
  } catch (error) {
    failure = error;
  }
  try {
    if (browser) await browser.close();
  } catch (error) {
    failure = failure ? new AggregateError([failure, error], "Visual verification and browser cleanup both failed.") : error;
  }
  if (failure) throw failure;
  if (mode === "test") await assertBaselineSnapshotCurrent(baselineSnapshot);
  if (mode === "update") {
    for (const scenario of scenarios) {
      const baseline = baselineSnapshot?.baselines.get(scenario.id);
      if (baseline) await assertScenarioFilesDistinct({ ...scenario, baseline: baseline.path }, baselineRoot, outputRoot);
    }
    const published = await publishBaselineGeneration({
      baselineRoot,
      projectIdentity: config.projectIdentity,
      configIdentity,
      scenarios,
      entries: stagedBaselines,
      hooks: options.transactionHooks,
    });
    for (const entry of report) entry.baseline = published.baselines.get(entry.id).path;
  }
  return {
    applicationVisualVerification: mode === "update" ? "baseline-updated" : "passed",
    report,
    startCommandExecuted: false,
  };
}

function parseCli(argv) {
  const command = argv[0] || "test";
  if (!["inspect", "test", "update"].includes(command)) throw new Error(`Unknown command: ${command}. Use inspect, test, or update.`);
  let configPath = null;
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--config") {
      if (!argv[index + 1] || argv[index + 1].startsWith("--")) throw new Error("--config requires a file path.");
      configPath = resolve(argv[index + 1]);
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${argument}.`);
  }
  return { command, configPath };
}

export async function runVisualCommand(command, options = {}) {
  if (Object.hasOwn(options, "allowStartCommand")) throw new Error("Unknown visual API option: allowStartCommand.");
  const {
    configPath = null,
    catalogOptions = {},
    applicationOptions = {},
    catalogRunner = runCatalogVisuals,
    applicationRunner = runApplicationVisuals,
  } = options;
  if (command === "update") {
    if (configPath) {
      const config = await loadVisualConfig(configPath);
      const catalogBaselineRoot = resolve(catalogOptions.baselineRoot ?? BASELINE_ROOT);
      const catalogConfigIdentity = visualBaselineConfigIdentity({
        projectIdentity: CATALOG_PROJECT_IDENTITY,
        kind: "catalog",
        scenarios: SCENARIOS,
        threshold: 0.08,
      });
      await readBaselineGeneration({
        baselineRoot: catalogBaselineRoot,
        projectIdentity: CATALOG_PROJECT_IDENTITY,
        configIdentity: catalogConfigIdentity,
        scenarios: SCENARIOS,
      });
      if (applicationScenarios(config).length > 0) {
        await preflightImmutableUpdateNamespace(config.baselineRoot, "Application baseline directory");
      }
    } else {
      await preflightImmutableUpdateNamespace(resolve(catalogOptions.baselineRoot ?? BASELINE_ROOT), "Catalog baseline directory");
    }
  }
  const catalogReport = await catalogRunner(configPath ? "test" : command, catalogOptions);
  const application = configPath
    ? await applicationRunner(command, configPath, applicationOptions)
    : { applicationVisualVerification: "not-configured", report: [], startCommandExecuted: false };
  return { ok: true, mode: command, catalogReport, ...application };
}

async function main() {
  const { command, configPath } = parseCli(process.argv.slice(2));
  if (command === "inspect") {
    const catalog = await inspectCatalog();
    const application = configPath ? await inspectVisualConfig(configPath) : { applicationVisualVerification: "not-configured", routes: [] };
    process.stdout.write(`${JSON.stringify({ ...catalog, ...application }, null, 2)}\n`);
    return;
  }
  const report = await runVisualCommand(command, { configPath });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(SCRIPT_PATH)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
