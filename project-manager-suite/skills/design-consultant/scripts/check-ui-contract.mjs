#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import { link, lstat, mkdir, open, readFile, readdir, realpath, rename, rm, rmdir, stat } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { findUserFacingContentLeaks } from "./text-content.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SOURCE_EXTENSIONS = new Set([".css", ".scss", ".less", ".js", ".jsx", ".ts", ".tsx", ".vue", ".svelte", ".html"]);
const JSX_EXTENSIONS = new Set([".jsx", ".tsx"]);
const IGNORED_DIRECTORIES = new Set([".git", ".next", ".nuxt", ".svelte-kit", ".tmp", "build", "coverage", "dist", "node_modules", "out"]);
const EXTERNAL_TOKEN_PREFIXES = ["--radix-", "--toastify-", "--reach-"];
const UI_PACKAGES = /^(?:antd|@mui\/|@chakra-ui\/|@radix-ui\/|@headlessui\/|react-aria-components(?:\/|$)|react-bootstrap|semantic-ui-react|@blueprintjs\/|primereact|@fluentui\/|@mantine\/)/;
const LOCK_FILE = ".design-consultant-lock.json";
export const MANAGED_BASELINE_JOURNAL_FILE = ".design-consultant-ui-baseline-transaction.json";
export const MANAGED_BASELINE_LOCK_DIRECTORY = ".design-consultant-ui-baseline.lock";
export const MANAGED_BASELINE_TAKEOVER_GATE_DIRECTORY = ".design-consultant-ui-baseline.takeover-gate";
export const MANAGED_BASELINE_TAKEOVER_SUPPORT_DIRECTORY = ".design-consultant-ui-baseline.takeover-support";
const MANAGED_BASELINE_LOCK_OWNER = "owner.json";
const TAKEOVER_GATE_RECORD_KEYS = "nonce,pid,schemaVersion,startedAt,state,ticket";
const TAKEOVER_GATE_CHOOSING_PATTERN = /^([a-f0-9]{32})\.choosing\.json$/;
const TAKEOVER_GATE_TICKET_PATTERN = /^(\d{16})\.([a-f0-9]{32})\.ticket\.json$/;
const TAKEOVER_GATE_PENDING_PATTERN = /^([1-9]\d*)\.([a-f0-9]{32})\.(choosing|ticket)\.pending$/;
const TAKEOVER_GATE_WAIT_ATTEMPTS = 1000;
const TAKEOVER_GATE_WAIT_MILLISECONDS = 10;
const BASELINE_ENTRY_KEYS = "count,file,fingerprint,firstSeen,rule";
const JOURNAL_KEYS = [
  "baseline",
  "baselineTemp",
  "lockTemp",
  "newBaseline",
  "newBaselineHash",
  "newLock",
  "newLockHash",
  "oldBaseline",
  "oldBaselineHash",
  "oldLock",
  "oldLockHash",
  "operation",
  "schemaVersion",
  "status",
].sort().join(",");
const DESIGN_SYSTEM_MARKERS = [
  "adoption/adoption-plan.json",
  "adoption/compatibility-report.json",
  "intake/extraction-report.json",
];
const RESERVED_BASELINE_SEGMENTS = new Set([
  "adoption",
  "checker",
  "config",
  "manifest",
  "migration",
  "plan",
  "system",
  "system.config",
]);

export const UI_CONTRACT_BASELINE_SOURCE = "generated:legacy-ui-baseline";
export const UI_CONTRACT_BASELINE_PROVENANCE = Object.freeze({
  schemaVersion: 1,
  type: "ui-contract-baseline",
  mode: "ratchet",
});

function toPosix(path) {
  return path.split(sep).join("/");
}

function normalizeRelativePath(path) {
  return toPosix(path).replace(/^\.\/+/, "");
}

function normalizeMatchedSource(source) {
  return String(source ?? "").replace(/\s+/g, " ").trim();
}

function digest(content) {
  return createHash("sha256").update(content).digest("hex");
}

export function fingerprintIssue(issue) {
  const matchedHash = digest(normalizeMatchedSource(issue.matchedSource));
  return `${issue.rule}:${normalizeRelativePath(issue.file)}:${matchedHash}`;
}

function safeRelativePosixPath(path) {
  return typeof path === "string"
    && path.length > 0
    && !path.includes("\\")
    && !isAbsolute(path)
    && !/^[A-Za-z]:/.test(path)
    && path.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

export function isSafeLegacyBaselinePath(path) {
  if (!safeRelativePosixPath(path) || !/^checks\/(?:[A-Za-z0-9_@+$,-]+\/)*[A-Za-z0-9_@+$,-]+\.json$/.test(path)) return false;
  const segments = path.toLowerCase().split("/");
  const fileStem = segments.at(-1).slice(0, -".json".length);
  const containsReservedWord = (segment) => segment.split(/[._-]/).some((word) => RESERVED_BASELINE_SEGMENTS.has(word));
  return !segments.slice(1, -1).some(containsReservedWord)
    && !containsReservedWord(fileStem)
    && fileStem !== "check-ui-contract"
    && !fileStem.includes("checker")
    && !fileStem.startsWith(".design-consultant-");
}

function validDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateBaseline(baseline, { label = "UI contract baseline" } = {}) {
  if (!baseline || typeof baseline !== "object" || Array.isArray(baseline)
    || Object.keys(baseline).sort().join(",") !== "issues,schemaVersion"
    || baseline.schemaVersion !== 1 || !Array.isArray(baseline.issues)) {
    throw new Error(`${label} must use schemaVersion 1 with exact schemaVersion/issues keys`);
  }
  const fingerprints = new Set();
  for (const entry of baseline.issues) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)
      || Object.keys(entry).sort().join(",") !== BASELINE_ENTRY_KEYS
      || typeof entry.fingerprint !== "string"
      || typeof entry.rule !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(entry.rule)
      || !safeRelativePosixPath(entry.file)
      || !validDateOnly(entry.firstSeen)
      || !Number.isSafeInteger(entry.count) || entry.count < 1
      || !entry.fingerprint.startsWith(`${entry.rule}:${entry.file}:`)
      || !/^[a-f0-9]{64}$/.test(entry.fingerprint.slice(`${entry.rule}:${entry.file}:`.length))) {
      throw new Error(`${label} has an invalid issue entry`);
    }
    if (fingerprints.has(entry.fingerprint)) throw new Error(`${label} has duplicate fingerprint ${entry.fingerprint}`);
    fingerprints.add(entry.fingerprint);
  }
  return baseline;
}

export function createBaseline(issues, { now = () => new Date(), existing = null } = {}) {
  if (existing !== null) validateBaseline(existing);
  const existingEntries = new Map((existing?.issues ?? []).map((entry) => [entry.fingerprint, entry]));
  const firstSeen = now().toISOString().slice(0, 10);
  const counts = new Map();
  for (const issue of issues) {
    const fingerprint = fingerprintIssue(issue);
    const record = counts.get(fingerprint) ?? {
      fingerprint,
      rule: issue.rule,
      file: normalizeRelativePath(issue.file),
      count: 0,
    };
    record.count += 1;
    counts.set(fingerprint, record);
  }
  const baseline = {
    schemaVersion: 1,
    issues: [...counts.values()]
      .map((record) => {
        const prior = existingEntries.get(record.fingerprint);
        return {
          fingerprint: record.fingerprint,
          rule: record.rule,
          file: record.file,
          firstSeen: prior?.firstSeen ?? firstSeen,
          count: Math.max(record.count, prior?.count ?? 0),
        };
      })
      .concat([...existingEntries.entries()].filter(([fingerprint]) => !counts.has(fingerprint)).map(([, entry]) => ({ ...entry })))
      .sort((left, right) => left.fingerprint.localeCompare(right.fingerprint)),
  };
  return validateBaseline(baseline);
}

function observedFingerprintCounts(issues) {
  const counts = new Map();
  for (const issue of issues) {
    const fingerprint = issue.fingerprint ?? fingerprintIssue(issue);
    counts.set(fingerprint, (counts.get(fingerprint) ?? 0) + 1);
  }
  return counts;
}

export function classifyIssues(issues, baseline) {
  if (baseline !== null) validateBaseline(baseline);
  const remaining = new Map((baseline?.issues ?? []).map((entry) => [entry.fingerprint, entry.count]));
  const classifiedIssues = issues.map((issue) => {
    const fingerprint = fingerprintIssue(issue);
    const count = remaining.get(fingerprint) ?? 0;
    remaining.set(fingerprint, Math.max(0, count - 1));
    return { ...issue, fingerprint, baselineStatus: count > 0 ? "known" : "new" };
  });
  const observedCounts = observedFingerprintCounts(classifiedIssues);
  const staleBaseline = (baseline?.issues ?? []).flatMap((entry) => {
    const staleCount = Math.max(0, entry.count - (observedCounts.get(entry.fingerprint) ?? 0));
    return staleCount > 0 ? [{ ...entry, staleCount }] : [];
  });
  return { issues: classifiedIssues, staleBaseline };
}

export function pruneBaseline(baseline, issues) {
  validateBaseline(baseline);
  const observedCounts = observedFingerprintCounts(issues);
  const staleBaseline = baseline.issues.flatMap((entry) => {
    const staleCount = Math.max(0, entry.count - (observedCounts.get(entry.fingerprint) ?? 0));
    return staleCount > 0 ? [{ ...entry, staleCount }] : [];
  });
  const pruned = {
    schemaVersion: 1,
    issues: baseline.issues.flatMap((entry) => {
      const count = Math.min(entry.count, observedCounts.get(entry.fingerprint) ?? 0);
      return count > 0 ? [{ ...entry, count }] : [];
    }),
  };
  return { baseline: validateBaseline(pruned), staleBaseline, prunedBaseline: staleBaseline };
}

function parseArguments(argv) {
  const options = { root: null, baseline: null, writeBaseline: false, pruneBaseline: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--root") {
      if (!argv[index + 1]) throw new Error("--root requires a directory path");
      options.root = resolve(argv[index + 1]);
      index += 1;
      continue;
    }
    if (argument === "--baseline") {
      if (!argv[index + 1]) throw new Error("--baseline requires a file path");
      options.baseline = argv[index + 1];
      index += 1;
      continue;
    }
    if (argument === "--write-baseline") {
      options.writeBaseline = true;
      continue;
    }
    if (argument === "--prune-baseline") {
      options.pruneBaseline = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") return { help: true };
    throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

async function pathKind(path) {
  try {
    const info = await stat(path);
    return info.isDirectory() ? "directory" : info.isFile() ? "file" : "other";
  } catch (error) {
    if (error.code === "ENOENT") return "missing";
    throw error;
  }
}

async function inferRoot() {
  const candidate = resolve(SCRIPT_DIR, "..");
  if ((await pathKind(resolve(candidate, "templates"))) === "directory") return candidate;
  return resolve(SCRIPT_DIR, "../..");
}

function isDesignSystemSource(relativePath, skillSource) {
  const path = `/${relativePath}/`;
  if (path.includes("/vendor/") || path.includes("/visualizations/")) return true;
  if (skillSource && path.includes("/templates/visualization-lieflat/")) return true;
  if (skillSource && path.includes("/templates/react-runtime/")) return true;
  if (skillSource && relativePath === "templates/adoption-catalog-foundation.css") return true;
  if (skillSource && /^templates\/tokens\.(?:css|ts)$/.test(relativePath)) return true;
  if (!skillSource && path.includes("/design-system/")) return true;
  return false;
}

function isAdapterPath(relativePath) {
  const path = `/${relativePath.toLowerCase()}/`;
  return path.includes("/adapter/") || path.includes("/adapters/") || path.includes("/component-adapter/");
}

async function walk(directory, root, skillSource, output = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(absolute, root, skillSource, output);
      continue;
    }
    if (!entry.isFile() || !SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;
    const relativePath = toPosix(relative(root, absolute));
    if (!isDesignSystemSource(relativePath, skillSource)) output.push({ absolute, relativePath });
  }
  return output;
}

async function tokenFiles(root, skillSource) {
  const candidates = skillSource
    ? [resolve(root, "templates/tokens.css")]
    : [resolve(root, "design-system/tokens/tokens.css"), resolve(root, "tokens/tokens.css")];
  const files = [];
  for (const path of candidates) if ((await pathKind(path)) === "file") files.push(path);
  return files;
}

function lineAt(text, index) {
  return text.slice(0, index).split("\n").length;
}

function addIssue(issues, file, text, match, rule, message, fix) {
  issues.push({ file, line: lineAt(text, match.index), rule, message, fix, matchedSource: match[0] });
}

function matches(text, pattern) {
  return [...text.matchAll(pattern)];
}

function userFacingLiteralFragments(source) {
  const fragments = [];
  for (const match of matches(source, /<([A-Za-z][A-Za-z0-9.-]*)\b[^<>]*>([^<>{}]+)<\/\1\s*>/g)) {
    fragments.push({ text: match[2], index: match.index + match[0].indexOf(match[2]) });
  }
  for (const match of matches(source, /\b(?:aria-label|alt|label|placeholder|title)\s*=\s*["']([^"']+)["']/g)) {
    fragments.push({ text: match[1], index: match.index + match[0].indexOf(match[1]) });
  }
  return fragments;
}

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "))
    .replace(/(^|\s)\/\/[^\n]*/g, (comment) => comment.replace(/[^\n]/g, " "));
}

function checkFile(file, text, definitions, issues, implementationFiles) {
  const source = stripComments(text);
  const extension = extname(file.relativePath).toLowerCase();
  const adapter = isAdapterPath(file.relativePath) || implementationFiles.has(file.relativePath);

  for (const match of matches(source, /var\(\s*(--[A-Za-z0-9_-]+)/g)) {
    const token = match[1];
    if (!definitions.has(token) && !EXTERNAL_TOKEN_PREFIXES.some((prefix) => token.startsWith(prefix))) {
      addIssue(issues, file.relativePath, source, match, "undefined-token", `Token ${token} is not defined by the visual system.`, "Add the semantic token to tokens/tokens.json and rebuild generated token files, or use an existing token.");
    }
  }

  for (const match of matches(source, /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|oklch\([^)]*\)/g)) {
    addIssue(issues, file.relativePath, source, match, "literal-color", "A color literal bypasses the project token contract.", "Replace the literal with a semantic CSS variable such as var(--primary), var(--surface), or var(--text).");
  }
  if (!adapter) {
    for (const match of matches(source, /(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g)) {
      if (UI_PACKAGES.test(match[1])) {
        addIssue(issues, file.relativePath, source, match, "external-ui-import", `Direct UI package import from ${match[1]} bypasses the project adapter.`, "Map the dependency behind the shared runtime or a dedicated adapter, then import it from the project component entry.");
      }
    }
  }

  if (!JSX_EXTENSIONS.has(extension)) return;
  for (const fragment of userFacingLiteralFragments(source)) {
    for (const leak of findUserFacingContentLeaks(fragment.text)) {
      const match = { 0: leak.matched, index: fragment.index + leak.index };
      if (leak.rule === "engineering-copy") {
        addIssue(issues, file.relativePath, source, match, leak.rule, "Engineering or diagnostic copy is rendered in a user-facing surface.", "Replace it with task-oriented product copy that explains the user outcome and recovery action.");
      } else {
        addIssue(issues, file.relativePath, source, match, leak.rule, "An internal field name, enum, identifier, or raw value is rendered to users.", "Map internal values through a presentation model, business label dictionary, formatter, and safe unknown fallback.");
      }
    }
  }
  for (const match of matches(source, /\{\s*(?:JSON\.stringify\s*\([^{}]+\)|(?:[A-Za-z_$][\w$]*\.)+(?:(?:internal|debug|raw)[A-Za-z0-9_$]*|[A-Za-z0-9_$]+_[A-Za-z0-9_$]+))\s*\}/g)) {
    addIssue(issues, file.relativePath, source, match, "internal-data-exposure", "A raw object or internal property is rendered directly in JSX.", "Create a presentation mapping and render only approved business labels, formatted values, and a safe unknown fallback.");
  }
  for (const match of matches(source, /<(?:div|span)\b[^>]*\bonClick\s*=/g)) {
    addIssue(issues, file.relativePath, source, match, "non-interactive-click", "A div or span is being used as an interactive control.", "Use Button, IconButton, or a semantic link so keyboard and focus behavior are preserved.");
  }
  for (const match of matches(source, /<select\b/g)) {
    addIssue(issues, file.relativePath, source, match, "raw-select", "Raw select markup bypasses the shared field contract.", "Use SelectField from the project component runtime.");
  }
  for (const match of matches(source, /<[a-z][a-z0-9-]*\b[^>]*\brole\s*=\s*["']combobox["']/g)) {
    addIssue(issues, file.relativePath, source, match, "raw-combobox", "Hand-authored combobox semantics do not prove keyboard, focus, and active-option behavior.", "Use SearchableSelect from the project component runtime or an approved adapter backed by a mature interaction primitive.");
  }
  for (const match of matches(source, /<table\b/g)) {
    addIssue(issues, file.relativePath, source, match, "raw-table", "Raw table markup bypasses shared data states and accessibility behavior.", "Use DataTable from the project component runtime.");
  }
  for (const match of matches(source, /<(?:div|section|aside)\b[^>]*(?:role\s*=\s*["']dialog["']|aria-modal\s*=\s*["']true["'])/g)) {
    addIssue(issues, file.relativePath, source, match, "raw-dialog", "Hand-authored dialog semantics bypass focus and dismissal behavior.", "Use Dialog from the project component runtime.");
  }
  for (const match of matches(source, /<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    const attributes = match[1];
    const body = match[2];
    if (/aria-label(?:ledby)?\s*=/.test(attributes)) continue;
    const accessibleBody = body.replace(/<([A-Za-z][A-Za-z0-9]*)\b[^>]*aria-hidden\s*=\s*["']true["'][^>]*>[\s\S]*?<\/\1>/g, "");
    const readableBody = accessibleBody
      .replace(/<[^>]+>/g, "")
      .replace(/\{[^{}]*\}/g, "")
      .replace(/&(?:nbsp|#160);/g, " ")
      .trim();
    const symbolOnly = /^[+\-×✎•…⋯⌕☰↻←→]+$/.test(readableBody);
    const looksIconOnly = (/<svg\b|<[A-Z][A-Za-z0-9]*(?:Icon|Glyph)\b|aria-hidden\s*=/.test(body) && readableBody.length === 0) || symbolOnly;
    if (looksIconOnly) {
      addIssue(issues, file.relativePath, source, match, "icon-button-name", "An icon-only button has no accessible name.", "Use IconButton with its required label prop, or add aria-label to the semantic button.");
    }
  }
}

function isInsideOrEqual(root, path) {
  const pathFromRoot = relative(root, path);
  return pathFromRoot === "" || (pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot));
}

async function canonicalizeRoot(path) {
  const requested = resolve(path);
  const info = await stat(requested);
  if (!info.isDirectory()) throw new Error(`Scan root is not a directory: ${requested}`);
  return realpath(requested);
}

async function inspectContainedPath(canonicalRoot, path, label, { allowMissing = true } = {}) {
  const resolvedPath = resolve(path);
  if (resolvedPath === canonicalRoot || !isInsideOrEqual(canonicalRoot, resolvedPath)) {
    throw new Error(`${label} must be lexically contained by the canonical scan root`);
  }
  const segments = relative(canonicalRoot, resolvedPath).split(sep).filter(Boolean);
  let current = canonicalRoot;
  for (const [index, segment] of segments.entries()) {
    current = join(current, segment);
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if (error.code === "ENOENT" && allowMissing) return { kind: "missing", path: resolvedPath, realPath: null };
      throw error;
    }
    if (info.isSymbolicLink()) {
      throw new Error(`${label} rejects a symbolic link, junction, or reparse path: ${current}`);
    }
    const final = index === segments.length - 1;
    if (!final && !info.isDirectory()) throw new Error(`${label} has a non-directory ancestor: ${current}`);
    if (final && !info.isFile()) throw new Error(`${label} must be an ordinary file: ${current}`);
    const canonicalPath = await realpath(current);
    if (!isInsideOrEqual(canonicalRoot, canonicalPath)) {
      if (allowMissing) {
        try {
          await lstat(current);
        } catch (error) {
          if (error.code === "ENOENT") return { kind: "missing", path: resolvedPath, realPath: null };
          throw error;
        }
      }
      throw new Error(`${label} realpath escapes the canonical scan root: ${canonicalPath}`);
    }
    if (final) return { kind: "file", path: resolvedPath, realPath: canonicalPath };
  }
  throw new Error(`${label} has no file path segments`);
}

async function ensureSafeParent(canonicalRoot, filePath, label) {
  const resolvedPath = resolve(filePath);
  if (resolvedPath === canonicalRoot || !isInsideOrEqual(canonicalRoot, resolvedPath)) {
    throw new Error(`${label} must be lexically contained by the canonical scan root`);
  }
  const segments = relative(canonicalRoot, dirname(resolvedPath)).split(sep).filter(Boolean);
  let current = canonicalRoot;
  for (const segment of segments) {
    current = join(current, segment);
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      try {
        await mkdir(current);
      } catch (mkdirError) {
        if (mkdirError.code !== "EEXIST") throw mkdirError;
      }
      info = await lstat(current);
    }
    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw new Error(`${label} rejects a symbolic link, junction, reparse point, or non-directory ancestor: ${current}`);
    }
    const canonicalPath = await realpath(current);
    if (!isInsideOrEqual(canonicalRoot, canonicalPath)) {
      throw new Error(`${label} parent realpath escapes the canonical scan root: ${canonicalPath}`);
    }
  }
}

async function readContainedRaw(canonicalRoot, path, label, { allowMissing = true } = {}) {
  const inspected = await inspectContainedPath(canonicalRoot, path, label, { allowMissing });
  if (inspected.kind === "missing") return null;
  return readFile(inspected.realPath);
}

let temporarySequence = 0;

async function writeSyncedFile(path, content) {
  let handle;
  try {
    handle = await open(path, "wx");
    await handle.writeFile(content, typeof content === "string" ? "utf8" : undefined);
    await handle.sync();
  } finally {
    await handle?.close();
  }
}

async function assertExpectedRaw(canonicalRoot, path, expectedRaw, label) {
  const current = await readContainedRaw(canonicalRoot, path, label, { allowMissing: true });
  if (expectedRaw === null && current === null) return;
  if (expectedRaw !== null && current !== null && digest(current) === digest(expectedRaw)) return;
  throw new Error(`${label} changed before atomic install`);
}

async function nextTemporaryPath(canonicalRoot, destination, label) {
  await ensureSafeParent(canonicalRoot, destination, label);
  for (;;) {
    const candidate = join(dirname(destination), `.${basename(destination)}.${process.pid}.${temporarySequence += 1}.tmp`);
    const inspected = await inspectContainedPath(canonicalRoot, candidate, `${label} temporary file`, { allowMissing: true });
    if (inspected.kind === "missing") return candidate;
  }
}

async function installAtomicContained(canonicalRoot, destination, content, expectedRaw, label) {
  const temporaryPath = await nextTemporaryPath(canonicalRoot, destination, label);
  try {
    await writeSyncedFile(temporaryPath, content);
    await assertExpectedRaw(canonicalRoot, destination, expectedRaw, label);
    await inspectContainedPath(canonicalRoot, temporaryPath, `${label} temporary file`, { allowMissing: false });
    await rename(temporaryPath, destination);
    const installed = await readContainedRaw(canonicalRoot, destination, label, { allowMissing: false });
    if (digest(installed) !== digest(content)) throw new Error(`${label} failed post-install hash verification`);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

async function writeAtomicJournal(canonicalRoot, journalPath, journal, previousRaw) {
  const content = `${JSON.stringify(journal, null, 2)}\n`;
  await installAtomicContained(canonicalRoot, journalPath, content, previousRaw, "managed baseline transaction journal");
  return Buffer.from(content);
}

async function readBaseline(path, canonicalRoot) {
  const raw = await readContainedRaw(canonicalRoot, path, "UI contract baseline", { allowMissing: true });
  if (raw === null) return { baseline: null, raw: null };
  let baseline;
  try {
    baseline = JSON.parse(raw.toString("utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new Error(`Cannot parse UI contract baseline ${path}: ${error.message}`);
  }
  return { baseline: validateBaseline(baseline, { label: `UI contract baseline ${path}` }), raw };
}

function parseAdoptionLock(raw, path) {
  let lock;
  try {
    lock = JSON.parse(raw.toString("utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new Error(`Cannot parse adoption lock ${path}: ${error.message}`);
  }
  if (!lock || typeof lock !== "object" || Array.isArray(lock) || lock.schemaVersion !== 1
    || !lock.files || typeof lock.files !== "object" || Array.isArray(lock.files)) {
    throw new Error(`Adoption lock has an invalid schema: ${path}`);
  }
  return lock;
}

function exactProvenance(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === Object.keys(expected).sort().join(",")
    && Object.entries(expected).every(([key, expectedValue]) => value[key] === expectedValue);
}

function isExpectedTemporaryPath(lockRoot, relativePath, destination) {
  if (!safeRelativePosixPath(relativePath)) return false;
  const path = resolve(lockRoot, ...relativePath.split("/"));
  const escapedName = basename(destination).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return dirname(path) === dirname(destination)
    && new RegExp(`^\\.${escapedName}\\.\\d+\\.\\d+\\.tmp$`).test(basename(path));
}

export function validateManagedBaselineLockEntry({ lock, relativePath, baselineRaw }) {
  if (!safeRelativePosixPath(relativePath)) throw new Error("Managed baseline lock path must be a relative POSIX path");
  const entry = lock?.files?.[relativePath];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)
    || Object.keys(entry).sort().join(",") !== "generatedHash,provenance,source,templateHash"
    || entry.source !== UI_CONTRACT_BASELINE_SOURCE
    || entry.templateHash !== null
    || !exactProvenance(entry.provenance, UI_CONTRACT_BASELINE_PROVENANCE)
    || !/^[a-f0-9]{64}$/.test(entry.generatedHash ?? "")
    || baselineRaw === null || digest(baselineRaw) !== entry.generatedHash) {
    throw new Error(`Managed baseline lock entry is missing, drifted, or has invalid provenance: ${relativePath}`);
  }
  return entry;
}

function parseManagedSystemConfig(raw, path) {
  let config;
  try {
    config = JSON.parse(raw.toString("utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new Error(`Cannot parse managed system config ${path}: ${error.message}`);
  }
  const pointer = config?.integration?.legacyBaseline;
  if (!config || typeof config !== "object" || Array.isArray(config)
    || !config.integration || typeof config.integration !== "object" || Array.isArray(config.integration)
    || !Object.hasOwn(config.integration, "legacyBaseline")
    || (pointer !== null && !isSafeLegacyBaselinePath(pointer))) {
    throw new Error(`Managed system config has an invalid integration.legacyBaseline pointer: ${path}`);
  }
  return config;
}

function expectedOutputValue(canonicalRoot, outputRoot) {
  return normalizeRelativePath(relative(canonicalRoot, outputRoot));
}

function validateManagedLockIdentity({ canonicalRoot, outputRoot, lock, lockPath }) {
  const expectedOutput = expectedOutputValue(canonicalRoot, outputRoot);
  if (lock.workflow !== "existing-system-adoption") {
    throw new Error(`Managed baseline requires workflow=existing-system-adoption in ${lockPath}`);
  }
  if (lock.output !== expectedOutput) {
    throw new Error(`Managed baseline lock.output must equal ${expectedOutput}: ${lockPath}`);
  }
}

async function readManagedOutputAnchor({ canonicalRoot, outputRoot, baselinePath }) {
  const configPath = join(outputRoot, "system.config.json");
  const configRaw = await readContainedRaw(canonicalRoot, configPath, "managed system config", { allowMissing: false });
  const config = parseManagedSystemConfig(configRaw, configPath);
  const relativePath = normalizeRelativePath(relative(outputRoot, baselinePath));
  if (!isSafeLegacyBaselinePath(relativePath) || config.integration.legacyBaseline !== relativePath) {
    throw new Error(`Managed system config integration.legacyBaseline must point exactly to ${relativePath}`);
  }
  const lockPath = join(outputRoot, LOCK_FILE);
  const lockRaw = await readContainedRaw(canonicalRoot, lockPath, "managed adoption lock", { allowMissing: false });
  const lock = parseAdoptionLock(lockRaw, lockPath);
  validateManagedLockIdentity({ canonicalRoot, outputRoot, lock, lockPath });
  return { root: outputRoot, path: lockPath, raw: lockRaw, lock, relativePath, configPath, configRaw };
}

async function hasDesignSystemMarker(canonicalRoot, candidate) {
  const configRaw = await readContainedRaw(canonicalRoot, join(candidate, "system.config.json"), "design-system marker", { allowMissing: true });
  if (configRaw !== null) return true;
  const journalRaw = await readContainedRaw(canonicalRoot, join(candidate, MANAGED_BASELINE_JOURNAL_FILE), "managed baseline journal marker", { allowMissing: true });
  if (journalRaw !== null) return true;
  for (const marker of DESIGN_SYSTEM_MARKERS) {
    const raw = await readContainedRaw(canonicalRoot, resolve(candidate, ...marker.split("/")), `design-system marker ${marker}`, { allowMissing: true });
    if (raw !== null) return true;
  }
  return false;
}

function lockDeclaresManagedBaseline(lock, lockRoot, baselinePath) {
  const relativePath = normalizeRelativePath(relative(lockRoot, baselinePath));
  const entry = lock?.files?.[relativePath];
  return safeRelativePosixPath(relativePath)
    && entry?.source === UI_CONTRACT_BASELINE_SOURCE
    && entry?.templateHash === null
    && exactProvenance(entry?.provenance, UI_CONTRACT_BASELINE_PROVENANCE);
}

async function resolveExplicitManagedAnchor(canonicalRoot, baselinePath) {
  const encounteredLocks = [];
  let current = dirname(resolve(baselinePath));
  while (isInsideOrEqual(canonicalRoot, current)) {
    const lockPath = join(current, LOCK_FILE);
    const lockRaw = await readContainedRaw(canonicalRoot, lockPath, "candidate adoption lock", { allowMissing: true });
    if (lockRaw !== null) {
      const lock = parseAdoptionLock(lockRaw, lockPath);
      if (lock.workflow !== "existing-system-adoption") {
        throw new Error(`Managed baseline search stopped at a non-adoption workflow lock: ${lockPath}`);
      }
      encounteredLocks.push({ root: current, path: lockPath, raw: lockRaw, lock });
    }
    if (await hasDesignSystemMarker(canonicalRoot, current)) {
      const misplaced = encounteredLocks.find((candidate) => candidate.root !== current);
      if (misplaced) throw new Error(`Managed adoption lock is in the wrong location: ${misplaced.path}`);
      return readManagedOutputAnchor({ canonicalRoot, outputRoot: current, baselinePath });
    }
    if (current === canonicalRoot) break;
    current = dirname(current);
  }

  const provenanceLocks = encounteredLocks.filter((candidate) => lockDeclaresManagedBaseline(candidate.lock, candidate.root, baselinePath));
  if (encounteredLocks.length > 1 || (encounteredLocks.length > 0 && provenanceLocks.length !== 1)) {
    throw new Error("Managed baseline lock placement or provenance is ambiguous; refusing unmanaged fallback");
  }
  if (provenanceLocks.length === 1) {
    return readManagedOutputAnchor({ canonicalRoot, outputRoot: provenanceLocks[0].root, baselinePath });
  }
  return null;
}

async function assertNoMisplacedBaselineLocks(canonicalRoot, outputRoot, baselinePath) {
  let current = dirname(baselinePath);
  while (current !== outputRoot) {
    if (!isInsideOrEqual(outputRoot, current)) throw new Error("Managed baseline is outside its anchored output");
    const misplacedPath = join(current, LOCK_FILE);
    const raw = await readContainedRaw(canonicalRoot, misplacedPath, "misplaced adoption lock", { allowMissing: true });
    if (raw !== null) throw new Error(`Managed adoption lock is in the wrong location: ${misplacedPath}`);
    current = dirname(current);
  }
}

async function deriveProjectRootFromLockOutput(outputRoot, lock, lockPath) {
  if (!safeRelativePosixPath(lock.output)) throw new Error(`Managed adoption lock.output is not a safe relative path: ${lockPath}`);
  const segments = lock.output.split("/");
  let candidate = outputRoot;
  for (const _segment of segments) candidate = dirname(candidate);
  const canonicalRoot = await canonicalizeRoot(candidate);
  if (resolve(canonicalRoot, ...segments) !== outputRoot) {
    throw new Error(`Managed adoption lock.output does not resolve to the generated checker output: ${lockPath}`);
  }
  return canonicalRoot;
}

async function resolveGeneratedCheckerContext(options) {
  if (basename(SCRIPT_DIR) !== "checks") return null;
  const outputRoot = await canonicalizeRoot(resolve(SCRIPT_DIR, ".."));
  const configPath = join(outputRoot, "system.config.json");
  const configRaw = await readContainedRaw(outputRoot, configPath, "generated checker system config", { allowMissing: false });
  const config = parseManagedSystemConfig(configRaw, configPath);
  const pointer = config.integration.legacyBaseline;
  const adoptionConfigured = typeof config.integration.adoptionStrategy === "string"
    && config.integration.adoptionStrategy.trim().length > 0;
  let adoptionMarkerPresent = false;
  for (const marker of DESIGN_SYSTEM_MARKERS) {
    const raw = await readContainedRaw(outputRoot, resolve(outputRoot, ...marker.split("/")), `generated adoption marker ${marker}`, { allowMissing: true });
    if (raw !== null) {
      adoptionMarkerPresent = true;
      break;
    }
  }
  const localAdoptionIdentity = adoptionConfigured || adoptionMarkerPresent;
  const lockPath = join(outputRoot, LOCK_FILE);
  const lockRaw = await readContainedRaw(outputRoot, lockPath, "generated checker adoption lock", {
    allowMissing: pointer === null && !localAdoptionIdentity,
  });
  const lock = lockRaw === null ? null : parseAdoptionLock(lockRaw, lockPath);
  const managedAdoptionIdentity = pointer !== null
    || localAdoptionIdentity
    || lock?.workflow === "existing-system-adoption";
  if (pointer === null && managedAdoptionIdentity) {
    throw new Error("Generated adoption checker requires system.config.integration.legacyBaseline and its exact managed lock");
  }
  if (pointer === null) {
    const canonicalRoot = options.root ? await canonicalizeRoot(options.root) : outputRoot;
    const baselinePath = options.baseline || options.writeBaseline || options.pruneBaseline
      ? options.baseline && isAbsolute(options.baseline)
        ? resolve(options.baseline)
        : resolve(outputRoot, options.baseline || "checks/ui-contract-baseline.json")
      : null;
    return { canonicalRoot, baselinePath, lockInfo: null };
  }
  const canonicalRoot = options.root
    ? await canonicalizeRoot(options.root)
    : lock
      ? await deriveProjectRootFromLockOutput(outputRoot, lock, lockPath)
      : outputRoot;
  const baselinePath = resolve(outputRoot, ...pointer.split("/"));
  if (options.baseline) {
    const requested = isAbsolute(options.baseline) ? resolve(options.baseline) : resolve(outputRoot, options.baseline);
    if (requested !== baselinePath) throw new Error("Generated checker --baseline must equal system.config.integration.legacyBaseline");
  }
  if (!isInsideOrEqual(canonicalRoot, outputRoot)) throw new Error("Generated checker output is outside the scan root");
  await inspectContainedPath(canonicalRoot, baselinePath, "UI contract baseline", { allowMissing: true });
  await assertNoMisplacedBaselineLocks(canonicalRoot, outputRoot, baselinePath);
  const lockInfo = await readManagedOutputAnchor({ canonicalRoot, outputRoot, baselinePath });
  return { canonicalRoot, baselinePath, lockInfo };
}

async function inspectManagedMutexDirectory(outputRoot, lockDirectory) {
  const info = await lstat(lockDirectory);
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new Error(`Managed baseline transaction lock is not an ordinary directory: ${lockDirectory}`);
  }
  const canonical = await realpath(lockDirectory);
  if (!isInsideOrEqual(outputRoot, canonical) || canonical !== lockDirectory) {
    throw new Error(`Managed baseline transaction lock escapes its output: ${lockDirectory}`);
  }
  const entries = await readdir(lockDirectory);
  if (entries.length !== 1 || entries[0] !== MANAGED_BASELINE_LOCK_OWNER) {
    throw new Error("Managed baseline transaction lock owner state is not provably stale");
  }
}

function parseMutexOwner(raw) {
  let owner;
  try {
    owner = JSON.parse(raw.toString("utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new Error(`Managed baseline transaction lock owner is invalid JSON: ${error.message}`);
  }
  if (!owner || typeof owner !== "object" || Array.isArray(owner)
    || Object.keys(owner).sort().join(",") !== "nonce,pid,schemaVersion,startedAt"
    || owner.schemaVersion !== 1 || !Number.isSafeInteger(owner.pid) || owner.pid < 1
    || !/^[a-f0-9]{32}$/.test(owner.nonce ?? "")
    || typeof owner.startedAt !== "string" || Number.isNaN(Date.parse(owner.startedAt))) {
    throw new Error("Managed baseline transaction lock owner has an invalid contract");
  }
  return owner;
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    return null;
  }
}

function waitForTakeoverGate() {
  return new Promise((resolveWait) => setTimeout(resolveWait, TAKEOVER_GATE_WAIT_MILLISECONDS));
}

async function ensureOrdinaryCoordinationDirectory(outputRoot, path, label) {
  try {
    await mkdir(path);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  const info = await lstat(path);
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new Error(`${label} is not an ordinary directory: ${path}`);
  }
  const canonical = await realpath(path);
  if (!isInsideOrEqual(outputRoot, canonical) || canonical !== path) {
    throw new Error(`${label} escapes its output: ${path}`);
  }
  return path;
}

async function ensureTakeoverGateDirectories(outputRoot) {
  const gateDirectory = await ensureOrdinaryCoordinationDirectory(
    outputRoot,
    join(outputRoot, MANAGED_BASELINE_TAKEOVER_GATE_DIRECTORY),
    "Managed baseline takeover gate",
  );
  const supportDirectory = await ensureOrdinaryCoordinationDirectory(
    outputRoot,
    join(outputRoot, MANAGED_BASELINE_TAKEOVER_SUPPORT_DIRECTORY),
    "Managed baseline takeover support directory",
  );
  const pendingDirectory = await ensureOrdinaryCoordinationDirectory(
    outputRoot,
    join(supportDirectory, "pending"),
    "Managed baseline takeover pending directory",
  );
  return { gateDirectory, pendingDirectory };
}

function parseTakeoverGateRecord(raw, label) {
  let record;
  try {
    record = JSON.parse(raw.toString("utf8").replace(/^\uFEFF/, ""));
  } catch (cause) {
    const error = new Error(`${label} is invalid JSON: ${cause.message}`);
    error.code = "ERR_TAKEOVER_GATE_INVALID_JSON";
    throw error;
  }
  if (!record || typeof record !== "object" || Array.isArray(record)
    || Object.keys(record).sort().join(",") !== TAKEOVER_GATE_RECORD_KEYS
    || record.schemaVersion !== 1 || !Number.isSafeInteger(record.pid) || record.pid < 1
    || !/^[a-f0-9]{32}$/.test(record.nonce ?? "")
    || typeof record.startedAt !== "string" || Number.isNaN(Date.parse(record.startedAt))
    || !["choosing", "ticket"].includes(record.state)
    || (record.state === "choosing" && record.ticket !== null)
    || (record.state === "ticket" && (!Number.isSafeInteger(record.ticket) || record.ticket < 1))) {
    throw new Error(`${label} has an invalid exact contract`);
  }
  return record;
}

function parseTakeoverGateEntryName(name) {
  const choosing = TAKEOVER_GATE_CHOOSING_PATTERN.exec(name);
  if (choosing) return { state: "choosing", nonce: choosing[1], ticket: null };
  const ticket = TAKEOVER_GATE_TICKET_PATTERN.exec(name);
  if (!ticket) return null;
  const ticketNumber = Number(ticket[1]);
  if (!Number.isSafeInteger(ticketNumber) || ticketNumber < 1 || String(ticketNumber).padStart(16, "0") !== ticket[1]) return null;
  return { state: "ticket", nonce: ticket[2], ticket: ticketNumber };
}

function parseTakeoverPendingEntryName(name) {
  const match = TAKEOVER_GATE_PENDING_PATTERN.exec(name);
  if (!match) return null;
  const pid = Number(match[1]);
  if (!Number.isSafeInteger(pid) || pid < 1 || String(pid) !== match[1]) return null;
  return { pid, nonce: match[2], state: match[3] };
}

function sameTakeoverGateParticipant(left, right) {
  return left.schemaVersion === right.schemaVersion
    && left.pid === right.pid
    && left.nonce === right.nonce
    && left.startedAt === right.startedAt;
}

async function readTakeoverGateEntryRaw(outputRoot, path, label) {
  try {
    return await readContainedRaw(outputRoot, path, label, { allowMissing: true });
  } catch (error) {
    if (["ENOENT", "EPERM"].includes(error.code)) {
      try {
        await lstat(path);
      } catch (currentError) {
        if (currentError.code === "ENOENT") return null;
        throw currentError;
      }
    }
    throw error;
  }
}

async function removeExactRawCoordinationFile(outputRoot, path, expectedRaw, label, { allowMissing = false } = {}) {
  const current = await readTakeoverGateEntryRaw(outputRoot, path, label);
  if (current === null) {
    if (allowMissing) return false;
    throw new Error(`${label} disappeared before cleanup`);
  }
  if (!current.equals(expectedRaw)) throw new Error(`${label} changed; refusing cleanup`);
  try {
    await rm(path);
    return true;
  } catch (error) {
    if (allowMissing && error.code === "ENOENT") return false;
    throw error;
  }
}

function validatePendingRecord(raw, descriptor, label) {
  const record = parseTakeoverGateRecord(raw, label);
  if (record.pid !== descriptor.pid || record.nonce !== descriptor.nonce || record.state !== descriptor.state) {
    throw new Error(`${label} filename does not match its gate owner`);
  }
}

async function cleanupTakeoverPendingFiles(outputRoot, pendingDirectory) {
  for (const name of (await readdir(pendingDirectory)).sort()) {
    const descriptor = parseTakeoverPendingEntryName(name);
    if (!descriptor) throw new Error(`Managed baseline takeover pending directory contains an unrecognized entry: ${name}`);
    const path = join(pendingDirectory, name);
    const raw = await readTakeoverGateEntryRaw(outputRoot, path, `managed baseline takeover pending entry ${name}`);
    if (raw === null) continue;
    const alive = processIsAlive(descriptor.pid);
    if (alive !== false) continue;
    try {
      validatePendingRecord(raw, descriptor, `Managed baseline takeover pending entry ${name}`);
    } catch (error) {
      if (error.code !== "ERR_TAKEOVER_GATE_INVALID_JSON") throw error;
    }
    await removeExactRawCoordinationFile(
      outputRoot,
      path,
      raw,
      `Managed baseline stale pending entry ${name}`,
      { allowMissing: true },
    );
  }
}

async function removeOwnedPendingFile(outputRoot, pendingDirectory, path, descriptor) {
  if (dirname(path) !== pendingDirectory || parseTakeoverPendingEntryName(basename(path))?.pid !== descriptor.pid
    || parseTakeoverPendingEntryName(basename(path))?.nonce !== descriptor.nonce
    || parseTakeoverPendingEntryName(basename(path))?.state !== descriptor.state) {
    throw new Error("Managed baseline takeover pending cleanup path is not owned by this publisher");
  }
  const raw = await readTakeoverGateEntryRaw(outputRoot, path, "managed baseline owned pending cleanup");
  if (raw !== null) {
    await removeExactRawCoordinationFile(outputRoot, path, raw, "Managed baseline owned pending cleanup", { allowMissing: true });
  }
}

// A hard-link insertion makes only fully synced pending bytes visible under the formal gate name.
async function publishTakeoverRecord({
  outputRoot,
  pendingDirectory,
  destinationPath,
  record,
  state,
  hooks,
}) {
  const descriptor = { pid: record.pid, nonce: record.nonce, state };
  const pendingPath = join(pendingDirectory, `${record.pid}.${record.nonce}.${state}.pending`);
  const raw = Buffer.from(`${JSON.stringify(record, null, 2)}\n`);
  let handle;
  let created = false;
  let writeError = null;
  try {
    handle = await open(pendingPath, "wx");
    created = true;
    await handle.writeFile(raw);
    await handle.sync();
  } catch (error) {
    writeError = error;
  } finally {
    await handle?.close();
  }
  if (writeError) {
    if (created) await removeOwnedPendingFile(outputRoot, pendingDirectory, pendingPath, descriptor);
    throw writeError;
  }

  try {
    const pendingRaw = await readTakeoverGateEntryRaw(outputRoot, pendingPath, "managed baseline synced takeover pending record");
    if (pendingRaw === null || !pendingRaw.equals(raw)) {
      throw new Error("Managed baseline takeover pending record changed before publication");
    }
    await hooks.afterTakeoverGatePendingSynced?.({
      state,
      pendingPath,
      destinationPath,
      record: structuredClone(record),
    });
    try {
      await link(pendingPath, destinationPath);
    } catch (error) {
      if (error.code === "EEXIST") throw new Error(`Managed baseline takeover ${state} publication refuses to overwrite an existing record`);
      throw error;
    }
    const publishedRaw = await readTakeoverGateEntryRaw(outputRoot, destinationPath, `managed baseline published ${state} record`);
    if (publishedRaw === null || !publishedRaw.equals(raw)) {
      throw new Error(`Managed baseline takeover ${state} publication ownership could not be proven`);
    }
    return true;
  } finally {
    await removeOwnedPendingFile(outputRoot, pendingDirectory, pendingPath, descriptor);
  }
}

async function removeTakeoverGateEntry(outputRoot, path, expectedRecord, { allowMissing = false } = {}) {
  const raw = await readTakeoverGateEntryRaw(outputRoot, path, "managed baseline takeover gate cleanup target");
  if (raw === null) {
    if (allowMissing) return false;
    throw new Error("Managed baseline takeover gate ownership disappeared before cleanup");
  }
  const current = parseTakeoverGateRecord(raw, "Managed baseline takeover gate cleanup target");
  if (!isDeepStrictEqual(current, expectedRecord)) {
    throw new Error("Managed baseline takeover gate ownership changed; refusing cleanup");
  }
  try {
    await rm(path);
    return true;
  } catch (error) {
    if (allowMissing && error.code === "ENOENT") return false;
    throw error;
  }
}

async function readTakeoverGateEntries(outputRoot, directories) {
  await cleanupTakeoverPendingFiles(outputRoot, directories.pendingDirectory);
  const names = (await readdir(directories.gateDirectory)).sort();
  const entries = [];
  for (const name of names) {
    const descriptor = parseTakeoverGateEntryName(name);
    if (!descriptor) throw new Error(`Managed baseline takeover gate contains an unrecognized entry: ${name}`);
    const path = join(directories.gateDirectory, name);
    const raw = await readTakeoverGateEntryRaw(outputRoot, path, `managed baseline takeover gate entry ${name}`);
    if (raw === null) return null;
    const record = parseTakeoverGateRecord(raw, `Managed baseline takeover gate entry ${name}`);
    if (record.nonce !== descriptor.nonce || record.state !== descriptor.state || record.ticket !== descriptor.ticket) {
      throw new Error(`Managed baseline takeover gate entry filename does not match its owner contract: ${name}`);
    }
    entries.push({ name, path, record });
  }

  const participants = new Map();
  for (const entry of entries) {
    const existing = participants.get(entry.record.nonce) ?? { choosing: null, ticket: null };
    if (existing[entry.record.state] !== null) {
      throw new Error(`Managed baseline takeover gate has duplicate ${entry.record.state} entries for nonce ${entry.record.nonce}`);
    }
    const counterpart = existing.choosing ?? existing.ticket;
    if (counterpart && !sameTakeoverGateParticipant(counterpart.record, entry.record)) {
      throw new Error(`Managed baseline takeover gate has contradictory entries for nonce ${entry.record.nonce}`);
    }
    existing[entry.record.state] = entry;
    participants.set(entry.record.nonce, existing);
  }
  return entries;
}

async function cleanupStaleTakeoverGateEntries(outputRoot, entries, ownNonce) {
  let removed = false;
  for (const entry of entries) {
    if (entry.record.nonce === ownNonce) continue;
    const alive = processIsAlive(entry.record.pid);
    if (alive === null) {
      throw new Error(`Managed baseline takeover gate owner cannot be proven stale (pid ${entry.record.pid})`);
    }
    if (alive === false) {
      removed = await removeTakeoverGateEntry(outputRoot, entry.path, entry.record, { allowMissing: true }) || removed;
    }
  }
  return removed;
}

async function cleanupOwnTakeoverGateEntries(outputRoot, records) {
  const errors = [];
  for (const item of records) {
    if (!item) continue;
    try {
      await removeTakeoverGateEntry(outputRoot, item.path, item.record, { allowMissing: true });
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) throw new AggregateError(errors, "Managed baseline takeover gate cleanup could not be proven");
}

async function acquireManagedBaselineTakeoverGate(outputRoot, hooks, purpose) {
  const directories = await ensureTakeoverGateDirectories(outputRoot);
  const { gateDirectory, pendingDirectory } = directories;
  const owner = {
    schemaVersion: 1,
    pid: process.pid,
    nonce: randomBytes(16).toString("hex"),
    startedAt: new Date().toISOString(),
  };
  const choosing = {
    path: join(gateDirectory, `${owner.nonce}.choosing.json`),
    record: { ...owner, state: "choosing", ticket: null },
  };
  let ticketEntry = null;
  try {
    await publishTakeoverRecord({
      outputRoot,
      pendingDirectory,
      destinationPath: choosing.path,
      record: choosing.record,
      state: "choosing",
      hooks,
    });
    for (let attempt = 0; attempt < TAKEOVER_GATE_WAIT_ATTEMPTS; attempt += 1) {
      const entries = await readTakeoverGateEntries(outputRoot, directories);
      if (entries === null || await cleanupStaleTakeoverGateEntries(outputRoot, entries, owner.nonce)) {
        await waitForTakeoverGate();
        continue;
      }
      const maximumTicket = entries.reduce((maximum, entry) => (
        entry.record.state === "ticket" ? Math.max(maximum, entry.record.ticket) : maximum
      ), 0);
      if (maximumTicket >= Number.MAX_SAFE_INTEGER) throw new Error("Managed baseline takeover gate ticket space is exhausted");
      const ticket = maximumTicket + 1;
      const ticketName = `${String(ticket).padStart(16, "0")}.${owner.nonce}.ticket.json`;
      ticketEntry = {
        path: join(gateDirectory, ticketName),
        record: { ...owner, state: "ticket", ticket },
      };
      await publishTakeoverRecord({
        outputRoot,
        pendingDirectory,
        destinationPath: ticketEntry.path,
        record: ticketEntry.record,
        state: "ticket",
        hooks,
      });
      await removeTakeoverGateEntry(outputRoot, choosing.path, choosing.record);
      await hooks.afterTakeoverGateTicketCreated?.({ purpose, owner: structuredClone(owner), ticket, gateDirectory });
      break;
    }
    if (ticketEntry === null) throw new Error("Managed baseline takeover gate could not allocate a ticket");

    for (let attempt = 0; attempt < TAKEOVER_GATE_WAIT_ATTEMPTS; attempt += 1) {
      const entries = await readTakeoverGateEntries(outputRoot, directories);
      if (entries === null || await cleanupStaleTakeoverGateEntries(outputRoot, entries, owner.nonce)) {
        await waitForTakeoverGate();
        continue;
      }
      const ownTicket = entries.find((entry) => entry.record.state === "ticket" && entry.record.nonce === owner.nonce);
      if (!ownTicket || !isDeepStrictEqual(ownTicket.record, ticketEntry.record)) {
        throw new Error("Managed baseline takeover gate ticket ownership changed while waiting");
      }
      const choosingExists = entries.some((entry) => entry.record.state === "choosing" && entry.record.nonce !== owner.nonce);
      const orderedTickets = entries
        .filter((entry) => entry.record.state === "ticket")
        .sort((left, right) => left.record.ticket - right.record.ticket || left.record.nonce.localeCompare(right.record.nonce));
      if (!choosingExists && orderedTickets[0]?.record.nonce === owner.nonce) {
        const handle = { outputRoot, gateDirectory, path: ticketEntry.path, record: ticketEntry.record, purpose };
        await hooks.afterTakeoverGateAcquired?.({ purpose, owner: structuredClone(owner), ticket: ticketEntry.record.ticket, gateDirectory });
        return handle;
      }
      await hooks.afterTakeoverGateWaiting?.({ purpose, owner: structuredClone(owner), ticket: ticketEntry.record.ticket, gateDirectory });
      await waitForTakeoverGate();
    }
    throw new Error("Managed baseline takeover gate remained active or could not be proven available");
  } catch (error) {
    try {
      await cleanupOwnTakeoverGateEntries(outputRoot, [ticketEntry, choosing]);
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], `Managed baseline takeover gate failed and cleanup could not be proven: ${error.message}`);
    }
    throw error;
  }
}

async function releaseManagedBaselineTakeoverGate(handle) {
  await removeTakeoverGateEntry(handle.outputRoot, handle.path, handle.record);
}

async function readMutexOwner(outputRoot, lockDirectory) {
  await inspectManagedMutexDirectory(outputRoot, lockDirectory);
  const ownerPath = join(lockDirectory, MANAGED_BASELINE_LOCK_OWNER);
  const ownerRaw = await readContainedRaw(outputRoot, ownerPath, "managed baseline transaction lock owner", { allowMissing: false });
  return { owner: parseMutexOwner(ownerRaw), ownerPath };
}

async function removeClaimedMutexDirectory(outputRoot, claimDirectory, expectedOwner) {
  if (!isInsideOrEqual(outputRoot, claimDirectory) || dirname(claimDirectory) !== outputRoot) {
    throw new Error("Refusing to remove an untrusted managed baseline lock claim");
  }
  const { owner, ownerPath } = await readMutexOwner(outputRoot, claimDirectory);
  if (!isDeepStrictEqual(owner, expectedOwner)) {
    throw new Error("Managed baseline lock claim ownership changed; refusing cleanup");
  }
  await rm(ownerPath);
  await rmdir(claimDirectory);
}

async function restoreClaimedMutexDirectory(outputRoot, lockDirectory, claimDirectory, claimedOwner) {
  const { owner } = await readMutexOwner(outputRoot, claimDirectory);
  if (!isDeepStrictEqual(owner, claimedOwner)) {
    throw new Error("Managed baseline lock claim changed before it could be restored");
  }
  try {
    await rename(claimDirectory, lockDirectory);
  } catch (error) {
    if (error.code === "EEXIST") return false;
    throw error;
  }
  const restored = await readMutexOwner(outputRoot, lockDirectory);
  if (!isDeepStrictEqual(restored.owner, claimedOwner)) {
    throw new Error("Managed baseline lock owner changed while restoring a raced claim");
  }
  return true;
}

async function writeMutexOwner(lockDirectory, owner) {
  const ownerPath = join(lockDirectory, MANAGED_BASELINE_LOCK_OWNER);
  await writeSyncedFile(ownerPath, `${JSON.stringify(owner, null, 2)}\n`);
}

async function acquireManagedBaselineMutexUnderGate(outputRoot, hooks = {}) {
  const lockDirectory = join(outputRoot, MANAGED_BASELINE_LOCK_DIRECTORY);
  const nonce = randomBytes(16).toString("hex");
  const owner = { schemaVersion: 1, pid: process.pid, nonce, startedAt: new Date().toISOString() };
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await mkdir(lockDirectory);
      try {
        await writeMutexOwner(lockDirectory, owner);
      } catch (error) {
        await rmdir(lockDirectory).catch(() => {});
        throw error;
      }
      return { outputRoot, lockDirectory, owner };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }

    const existing = await readMutexOwner(outputRoot, lockDirectory);
    const alive = processIsAlive(existing.owner.pid);
    if (alive !== false) {
      throw new Error(`Managed baseline transaction lock is active or cannot be proven stale (pid ${existing.owner.pid})`);
    }
    await hooks.afterStaleOwnerObserved?.({
      outputRoot,
      lockDirectory,
      owner: structuredClone(existing.owner),
      attempt,
    });

    const claimDirectory = join(outputRoot, `.${MANAGED_BASELINE_LOCK_DIRECTORY}.${process.pid}.${randomBytes(8).toString("hex")}.stale`);
    try {
      await rename(lockDirectory, claimDirectory);
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "EEXIST") continue;
      throw error;
    }
    let claimed;
    try {
      claimed = await readMutexOwner(outputRoot, claimDirectory);
    } catch (error) {
      throw new Error(`Managed baseline stale claim cannot be proven after rename: ${error.message}`);
    }
    if (!isDeepStrictEqual(claimed.owner, existing.owner)) {
      let restored = false;
      try {
        restored = await restoreClaimedMutexDirectory(outputRoot, lockDirectory, claimDirectory, claimed.owner);
      } catch (error) {
        throw new Error(`Managed baseline stale-owner race left the changed claim untouched: ${error.message}`);
      }
      throw new Error(`Managed baseline stale-owner race detected after claim; changed owner lock ${restored ? "restored" : "preserved"}`);
    }

    try {
      await mkdir(lockDirectory);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      await removeClaimedMutexDirectory(outputRoot, claimDirectory, existing.owner);
      continue;
    }
    try {
      await writeMutexOwner(lockDirectory, owner);
    } catch (error) {
      await rmdir(lockDirectory).catch(() => {});
      throw error;
    }
    try {
      await removeClaimedMutexDirectory(outputRoot, claimDirectory, existing.owner);
    } catch (error) {
      try {
        await releaseManagedBaselineMutexUnderGate({ outputRoot, lockDirectory, owner });
      } catch (releaseError) {
        throw new AggregateError([error, releaseError], "Managed baseline stale claim cleanup failed and the new mutex could not be released safely");
      }
      throw error;
    }
    return { outputRoot, lockDirectory, owner };
  }
  throw new Error("Managed baseline transaction lock acquisition lost repeated stale-owner races");
}

async function releaseManagedBaselineMutexUnderGate(handle, hooks = {}) {
  const releaseDirectory = join(
    handle.outputRoot,
    `.${MANAGED_BASELINE_LOCK_DIRECTORY}.${process.pid}.${handle.owner.nonce}.release`,
  );
  await rename(handle.lockDirectory, releaseDirectory);
  await hooks.afterManagedMutexReleaseMoved?.({
    outputRoot: handle.outputRoot,
    lockDirectory: handle.lockDirectory,
    releaseDirectory,
    owner: structuredClone(handle.owner),
  });
  let claimed;
  try {
    claimed = await readMutexOwner(handle.outputRoot, releaseDirectory);
  } catch (error) {
    throw new Error(`Managed baseline release claim cannot be proven; claim retained: ${error.message}`);
  }
  if (!isDeepStrictEqual(claimed.owner, handle.owner)) {
    let restored = false;
    try {
      restored = await restoreClaimedMutexDirectory(handle.outputRoot, handle.lockDirectory, releaseDirectory, claimed.owner);
    } catch (error) {
      throw new Error(`Managed baseline release raced with another owner and left its claim untouched: ${error.message}`);
    }
    throw new Error(`Managed baseline transaction lock ownership changed; other owner lock ${restored ? "restored" : "preserved"}`);
  }
  await removeClaimedMutexDirectory(handle.outputRoot, releaseDirectory, handle.owner);
}

async function acquireManagedBaselineMutex(outputRoot, hooks = {}) {
  const gate = await acquireManagedBaselineTakeoverGate(outputRoot, hooks, "acquire-business-mutex");
  let handle = null;
  try {
    handle = await acquireManagedBaselineMutexUnderGate(outputRoot, hooks);
    await hooks.afterManagedMutexAcquired?.({
      outputRoot,
      lockDirectory: handle.lockDirectory,
      owner: structuredClone(handle.owner),
    });
    return handle;
  } catch (error) {
    if (handle) {
      try {
        await releaseManagedBaselineMutexUnderGate(handle);
      } catch (releaseError) {
        throw new AggregateError([error, releaseError], `Managed baseline mutex acquisition hook failed and ownership cleanup could not be proven: ${error.message}`);
      }
    }
    throw error;
  } finally {
    await releaseManagedBaselineTakeoverGate(gate);
  }
}

async function releaseManagedBaselineMutex(handle, hooks = {}) {
  const gate = await acquireManagedBaselineTakeoverGate(handle.outputRoot, hooks, "release-business-mutex");
  try {
    await releaseManagedBaselineMutexUnderGate(handle, hooks);
  } finally {
    await releaseManagedBaselineTakeoverGate(gate);
  }
}

function decodeJournalPayload(value, label) {
  if (typeof value !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error(`Managed baseline transaction journal ${label} is not canonical base64`);
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value) throw new Error(`Managed baseline transaction journal ${label} is not canonical base64`);
  return decoded;
}

function parseBaselinePayload(raw, label) {
  try {
    return validateBaseline(JSON.parse(raw.toString("utf8").replace(/^\uFEFF/, "")), { label });
  } catch (error) {
    throw new Error(`${label} is invalid: ${error.message}`);
  }
}

function sameBaselineMetadata(left, right) {
  return left.fingerprint === right.fingerprint
    && left.rule === right.rule
    && left.file === right.file
    && left.firstSeen === right.firstSeen;
}

function baselinesSemanticallyEqual(left, right) {
  if (left.schemaVersion !== right.schemaVersion || left.issues.length !== right.issues.length) return false;
  const leftEntries = new Map(left.issues.map((entry) => [entry.fingerprint, entry]));
  const rightEntries = new Map(right.issues.map((entry) => [entry.fingerprint, entry]));
  if (leftEntries.size !== rightEntries.size) return false;
  return [...leftEntries].every(([fingerprint, entry]) => {
    const counterpart = rightEntries.get(fingerprint);
    return counterpart !== undefined && isDeepStrictEqual(entry, counterpart);
  });
}

function validateBaselineTransition(operation, oldBaseline, newBaseline) {
  const oldEntries = new Map(oldBaseline.issues.map((entry) => [entry.fingerprint, entry]));
  const newEntries = new Map(newBaseline.issues.map((entry) => [entry.fingerprint, entry]));
  if (operation === "write") {
    for (const [fingerprint, oldEntry] of oldEntries) {
      const next = newEntries.get(fingerprint);
      if (!next || !sameBaselineMetadata(oldEntry, next) || next.count < oldEntry.count) {
        throw new Error("Managed baseline write journal contains a decreasing or metadata-changing transition");
      }
    }
    return;
  }
  for (const [fingerprint, next] of newEntries) {
    const oldEntry = oldEntries.get(fingerprint);
    if (!oldEntry || !sameBaselineMetadata(oldEntry, next) || next.count > oldEntry.count) {
      throw new Error("Managed baseline prune journal contains an adding, increasing, or metadata-changing transition");
    }
  }
}

function parseManagedJournal(raw, canonicalRoot, lockRoot, baselinePath) {
  let journal;
  try {
    journal = JSON.parse(raw.toString("utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new Error(`Managed baseline transaction journal is invalid JSON: ${error.message}`);
  }
  const expectedRelative = normalizeRelativePath(relative(lockRoot, baselinePath));
  if (!journal || typeof journal !== "object" || Array.isArray(journal)
    || Object.keys(journal).sort().join(",") !== JOURNAL_KEYS
    || journal.schemaVersion !== 1
    || journal.baseline !== expectedRelative
    || !isExpectedTemporaryPath(lockRoot, journal.baselineTemp, baselinePath)
    || !isExpectedTemporaryPath(lockRoot, journal.lockTemp, join(lockRoot, LOCK_FILE))
    || !["write", "prune"].includes(journal.operation)
    || !["prepared", "installing-baseline", "baseline-installed", "installing-lock", "committed"].includes(journal.status)
    || !/^[a-f0-9]{64}$/.test(journal.oldBaselineHash ?? "")
    || !/^[a-f0-9]{64}$/.test(journal.newBaselineHash ?? "")
    || !/^[a-f0-9]{64}$/.test(journal.oldLockHash ?? "")
    || !/^[a-f0-9]{64}$/.test(journal.newLockHash ?? "")
    || journal.oldBaselineHash === journal.newBaselineHash
    || journal.oldLockHash === journal.newLockHash
    || typeof journal.oldBaseline !== "string" || typeof journal.newBaseline !== "string"
    || typeof journal.oldLock !== "string" || typeof journal.newLock !== "string") {
    throw new Error("Managed baseline transaction journal contract is invalid");
  }
  const decoded = {
    oldBaseline: decodeJournalPayload(journal.oldBaseline, "oldBaseline"),
    newBaseline: decodeJournalPayload(journal.newBaseline, "newBaseline"),
    oldLock: decodeJournalPayload(journal.oldLock, "oldLock"),
    newLock: decodeJournalPayload(journal.newLock, "newLock"),
  };
  if (digest(decoded.oldBaseline) !== journal.oldBaselineHash
    || digest(decoded.newBaseline) !== journal.newBaselineHash
    || digest(decoded.oldLock) !== journal.oldLockHash
    || digest(decoded.newLock) !== journal.newLockHash) {
    throw new Error("Managed baseline transaction journal payload hash is invalid");
  }
  const oldBaseline = parseBaselinePayload(decoded.oldBaseline, "Managed journal old baseline");
  const newBaseline = parseBaselinePayload(decoded.newBaseline, "Managed journal new baseline");
  if (baselinesSemanticallyEqual(oldBaseline, newBaseline)) {
    throw new Error("Managed baseline transaction journal contains a semantic no-op baseline transition");
  }
  validateBaselineTransition(journal.operation, oldBaseline, newBaseline);
  const lockPath = join(lockRoot, LOCK_FILE);
  const oldLock = parseAdoptionLock(decoded.oldLock, `${lockPath} (journal oldLock)`);
  const newLock = parseAdoptionLock(decoded.newLock, `${lockPath} (journal newLock)`);
  if (isDeepStrictEqual(oldLock, newLock)) {
    throw new Error("Managed baseline transaction journal contains a semantic no-op lock transition");
  }
  validateManagedLockIdentity({ canonicalRoot, outputRoot: lockRoot, lock: oldLock, lockPath });
  validateManagedLockIdentity({ canonicalRoot, outputRoot: lockRoot, lock: newLock, lockPath });
  validateManagedBaselineLockEntry({ lock: oldLock, relativePath: expectedRelative, baselineRaw: decoded.oldBaseline });
  const expectedNewLock = structuredClone(oldLock);
  expectedNewLock.files[expectedRelative] = {
    ...expectedNewLock.files[expectedRelative],
    generatedHash: digest(decoded.newBaseline),
  };
  if (!isDeepStrictEqual(newLock, expectedNewLock)) {
    throw new Error("Managed baseline transaction journal newLock is not the exact legal generatedHash update");
  }
  validateManagedBaselineLockEntry({ lock: newLock, relativePath: expectedRelative, baselineRaw: decoded.newBaseline });
  return { journal, decoded, oldBaseline, newBaseline, oldLock, newLock };
}

async function removeContainedFileIfPresent(canonicalRoot, path, label) {
  const inspected = await inspectContainedPath(canonicalRoot, path, label, { allowMissing: true });
  if (inspected.kind === "file") await rm(inspected.realPath);
}

async function cleanupManagedJournal(canonicalRoot, lockInfo, journal) {
  for (const [path, label] of [
    [resolve(lockInfo.root, ...journal.baselineTemp.split("/")), "managed baseline staged file"],
    [resolve(lockInfo.root, ...journal.lockTemp.split("/")), "managed lock staged file"],
    [join(lockInfo.root, MANAGED_BASELINE_JOURNAL_FILE), "managed baseline transaction journal"],
  ]) {
    await removeContainedFileIfPresent(canonicalRoot, path, label);
  }
}

async function validateManagedStagingFiles(canonicalRoot, lockInfo, journal) {
  for (const [relativePath, expectedHash, label] of [
    [journal.baselineTemp, journal.newBaselineHash, "managed baseline staged file"],
    [journal.lockTemp, journal.newLockHash, "managed lock staged file"],
  ]) {
    const path = resolve(lockInfo.root, ...relativePath.split("/"));
    const raw = await readContainedRaw(canonicalRoot, path, label, { allowMissing: true });
    if (raw !== null && digest(raw) !== expectedHash) {
      throw new Error(`${label} contains bytes not proven by the managed transaction journal`);
    }
  }
}

async function recoverManagedBaselineTransaction(canonicalRoot, baselinePath, lockInfo, { rollback = false } = {}) {
  const journalPath = join(lockInfo.root, MANAGED_BASELINE_JOURNAL_FILE);
  const journalRaw = await readContainedRaw(canonicalRoot, journalPath, "managed baseline transaction journal", { allowMissing: true });
  if (journalRaw === null) return false;
  const { journal, decoded } = parseManagedJournal(journalRaw, canonicalRoot, lockInfo.root, baselinePath);
  await validateManagedStagingFiles(canonicalRoot, lockInfo, journal);
  const baselineRaw = await readContainedRaw(canonicalRoot, baselinePath, "managed UI contract baseline", { allowMissing: false });
  const lockRaw = await readContainedRaw(canonicalRoot, lockInfo.path, "managed adoption lock", { allowMissing: false });
  const baselineHash = digest(baselineRaw);
  const lockHash = digest(lockRaw);
  if (![journal.oldBaselineHash, journal.newBaselineHash].includes(baselineHash)
    || ![journal.oldLockHash, journal.newLockHash].includes(lockHash)) {
    throw new Error("Managed baseline recovery found concurrent bytes; journal retained for diagnosis");
  }

  const state = `${baselineHash === journal.oldBaselineHash ? "old" : "new"}/${lockHash === journal.oldLockHash ? "old" : "new"}`;
  if (rollback) {
    if (state === "new/new" || state === "old/new") {
      await installAtomicContained(canonicalRoot, lockInfo.path, decoded.oldLock, lockRaw, "managed adoption lock rollback");
    }
    if (state === "new/new" || state === "new/old") {
      const currentBaseline = await readContainedRaw(canonicalRoot, baselinePath, "managed UI contract baseline", { allowMissing: false });
      await installAtomicContained(canonicalRoot, baselinePath, decoded.oldBaseline, currentBaseline, "managed baseline rollback");
    }
  } else if (state === "new/old") {
    await installAtomicContained(canonicalRoot, lockInfo.path, decoded.newLock, lockRaw, "managed adoption lock recovery");
  } else if (state === "old/new") {
    await installAtomicContained(canonicalRoot, lockInfo.path, decoded.oldLock, lockRaw, "managed adoption lock recovery rollback");
  }
  await cleanupManagedJournal(canonicalRoot, lockInfo, journal);
  return true;
}

async function writeManagedBaseline({ canonicalRoot, baselinePath, baselineRaw, nextBaselineRaw, lockInfo, operation, hooks = {} }) {
  const relativePath = normalizeRelativePath(relative(lockInfo.root, baselinePath));
  validateManagedBaselineLockEntry({ lock: lockInfo.lock, relativePath, baselineRaw });
  const currentBaseline = parseBaselinePayload(baselineRaw, "Current managed baseline");
  const nextBaseline = parseBaselinePayload(nextBaselineRaw, "Next managed baseline");
  validateBaselineTransition(operation, currentBaseline, nextBaseline);
  if (baselinesSemanticallyEqual(currentBaseline, nextBaseline)) return;
  if (digest(nextBaselineRaw) === digest(baselineRaw)) return;
  const nextLock = JSON.parse(JSON.stringify(lockInfo.lock));
  nextLock.files[relativePath] = {
    ...nextLock.files[relativePath],
    generatedHash: digest(nextBaselineRaw),
  };
  const nextLockRaw = Buffer.from(`${JSON.stringify(nextLock, null, 2)}\n`);

  const baselineTemp = await nextTemporaryPath(canonicalRoot, baselinePath, "managed baseline staging");
  const lockTemp = await nextTemporaryPath(canonicalRoot, lockInfo.path, "managed lock staging");
  const journalPath = join(lockInfo.root, MANAGED_BASELINE_JOURNAL_FILE);
  const journal = {
    schemaVersion: 1,
    operation,
    status: "prepared",
    baseline: relativePath,
    baselineTemp: normalizeRelativePath(relative(lockInfo.root, baselineTemp)),
    lockTemp: normalizeRelativePath(relative(lockInfo.root, lockTemp)),
    oldBaselineHash: digest(baselineRaw),
    newBaselineHash: digest(nextBaselineRaw),
    oldLockHash: digest(lockInfo.raw),
    newLockHash: digest(nextLockRaw),
    oldBaseline: Buffer.from(baselineRaw).toString("base64"),
    newBaseline: Buffer.from(nextBaselineRaw).toString("base64"),
    oldLock: Buffer.from(lockInfo.raw).toString("base64"),
    newLock: Buffer.from(nextLockRaw).toString("base64"),
  };
  let journalRaw = null;
  let preserveForRecovery = false;
  async function updateJournal(status) {
    journal.status = status;
    journalRaw = await writeAtomicJournal(canonicalRoot, journalPath, journal, journalRaw);
  }
  async function crashAtPhase(event) {
    if (!hooks.crashAtManagedPhase) return;
    try {
      await hooks.crashAtManagedPhase(event);
    } catch (error) {
      preserveForRecovery = true;
      throw error;
    }
  }
  try {
    await updateJournal("prepared");
    await writeSyncedFile(baselineTemp, nextBaselineRaw);
    await writeSyncedFile(lockTemp, nextLockRaw);
    await updateJournal("installing-baseline");
    await hooks.beforeManagedInstall?.({ target: "baseline", path: baselinePath });
    await assertExpectedRaw(canonicalRoot, baselinePath, baselineRaw, "managed UI contract baseline");
    await rename(baselineTemp, baselinePath);
    const installedBaseline = await readContainedRaw(canonicalRoot, baselinePath, "managed UI contract baseline", { allowMissing: false });
    if (digest(installedBaseline) !== digest(nextBaselineRaw)) throw new Error("Managed baseline install hash verification failed");
    await updateJournal("baseline-installed");
    await crashAtPhase({ target: "baseline", phase: "installed" });
    await updateJournal("installing-lock");
    await hooks.beforeManagedInstall?.({ target: "lock", path: lockInfo.path });
    await assertExpectedRaw(canonicalRoot, lockInfo.path, lockInfo.raw, "managed adoption lock");
    await rename(lockTemp, lockInfo.path);
    const installedLock = await readContainedRaw(canonicalRoot, lockInfo.path, "managed adoption lock", { allowMissing: false });
    if (digest(installedLock) !== digest(nextLockRaw)) throw new Error("Managed adoption lock install hash verification failed");
    await updateJournal("committed");
    await crashAtPhase({ target: "lock", phase: "installed" });
    await cleanupManagedJournal(canonicalRoot, lockInfo, journal);
  } catch (error) {
    if (preserveForRecovery) throw error;
    try {
      await recoverManagedBaselineTransaction(canonicalRoot, baselinePath, lockInfo, { rollback: true });
    } catch (recoveryError) {
      throw new AggregateError([error, recoveryError], `Managed baseline transaction failed and rollback could not be proven: ${error.message}`);
    }
    throw error;
  }
}

export async function collectUiContractIssues(root) {
  if ((await pathKind(root)) !== "directory") throw new Error(`Scan root is not a directory: ${root}`);
  const skillSource = (await pathKind(resolve(root, "templates"))) === "directory" && (await pathKind(resolve(root, "scripts"))) === "directory";
  const definitions = new Set();
  for (const file of await tokenFiles(root, skillSource)) {
    const text = await readFile(file, "utf8");
    for (const match of text.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)) definitions.add(match[1]);
  }
  const implementationFiles = new Set();
  if (!skillSource) {
    const manifestPath = resolve(root, "design-system/components/manifest.json");
    if ((await pathKind(manifestPath)) === "file") {
      try {
        const manifest = JSON.parse((await readFile(manifestPath, "utf8")).replace(/^\uFEFF/, ""));
        const designSystemRoot = dirname(dirname(manifestPath));
        for (const family of manifest.families || []) {
          if (!family.implementationPath || !["generated", "mapped"].includes(family.status)) continue;
          implementationFiles.add(toPosix(relative(root, resolve(designSystemRoot, family.implementationPath))));
        }
      } catch (error) {
        throw new Error(`Cannot parse component manifest: ${error.message}`);
      }
    }
  }
  const files = await walk(root, root, skillSource);
  const issues = [];
  for (const file of files) checkFile(file, await readFile(file.absolute, "utf8"), definitions, issues, implementationFiles);
  issues.sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line || left.rule.localeCompare(right.rule));
  return { root, filesScanned: files.length, tokenDefinitions: definitions.size, issues };
}

export async function runUiContractCheck(options, hooks = {}) {
  if (options.writeBaseline && options.pruneBaseline) throw new Error("--write-baseline and --prune-baseline cannot be used together");
  const generated = await resolveGeneratedCheckerContext(options);
  const root = generated?.canonicalRoot ?? await canonicalizeRoot(options.root || await inferRoot());
  const baselinePath = generated
    ? generated.baselinePath
    : options.baseline || options.writeBaseline || options.pruneBaseline
      ? resolve(root, options.baseline || "checks/ui-contract-baseline.json")
      : null;
  if (baselinePath) await inspectContainedPath(root, baselinePath, "UI contract baseline", { allowMissing: true });
  let lockInfo = generated ? generated.lockInfo : (baselinePath ? await resolveExplicitManagedAnchor(root, baselinePath) : null);
  const mutex = lockInfo ? await acquireManagedBaselineMutex(lockInfo.root, hooks) : null;
  try {
    if (lockInfo) {
      lockInfo = await readManagedOutputAnchor({ canonicalRoot: root, outputRoot: lockInfo.root, baselinePath });
      await recoverManagedBaselineTransaction(root, baselinePath, lockInfo);
      lockInfo = await readManagedOutputAnchor({ canonicalRoot: root, outputRoot: lockInfo.root, baselinePath });
    }
    const scan = await collectUiContractIssues(root);
    const { filesScanned, tokenDefinitions, issues } = scan;
    let { baseline, raw: baselineRaw } = baselinePath
      ? await readBaseline(baselinePath, root)
      : { baseline: null, raw: null };
    if (lockInfo) {
      validateManagedBaselineLockEntry({ lock: lockInfo.lock, relativePath: lockInfo.relativePath, baselineRaw });
    }
    if (options.pruneBaseline && !baseline) throw new Error("--prune-baseline requires an existing baseline");
    let staleBaseline;
    let prunedBaseline = [];
    if (options.writeBaseline) {
      const nextBaseline = createBaseline(issues, { existing: baseline });
      const nextRaw = Buffer.from(`${JSON.stringify(nextBaseline, null, 2)}\n`);
      if (lockInfo) {
        await writeManagedBaseline({
          canonicalRoot: root,
          baselinePath,
          baselineRaw,
          nextBaselineRaw: nextRaw,
          lockInfo,
          operation: "write",
          hooks,
        });
      } else {
        await installAtomicContained(root, baselinePath, nextRaw, baselineRaw, "UI contract baseline");
      }
      baseline = nextBaseline;
      baselineRaw = nextRaw;
    } else if (options.pruneBaseline) {
      const pruned = pruneBaseline(baseline, issues);
      const nextRaw = Buffer.from(`${JSON.stringify(pruned.baseline, null, 2)}\n`);
      if (lockInfo) {
        await writeManagedBaseline({
          canonicalRoot: root,
          baselinePath,
          baselineRaw,
          nextBaselineRaw: nextRaw,
          lockInfo,
          operation: "prune",
          hooks,
        });
      } else {
        await installAtomicContained(root, baselinePath, nextRaw, baselineRaw, "UI contract baseline");
      }
      baseline = pruned.baseline;
      baselineRaw = nextRaw;
      staleBaseline = pruned.staleBaseline;
      prunedBaseline = pruned.prunedBaseline;
    }
    const classified = classifyIssues(issues, baseline);
    const classifiedIssues = classified.issues;
    staleBaseline ??= classified.staleBaseline;
    const newViolations = classifiedIssues.filter((issue) => issue.baselineStatus === "new");
    return {
      ok: newViolations.length === 0,
      root,
      filesScanned,
      tokenDefinitions,
      issues: classifiedIssues,
      ...(baselinePath ? { baseline: { path: normalizeRelativePath(relative(root, baselinePath)), mode: options.writeBaseline ? "written" : options.pruneBaseline ? "pruned" : "checked" } } : {}),
      staleBaseline,
      prunedBaseline,
    };
  } finally {
    if (mutex) await releaseManagedBaselineMutex(mutex, hooks);
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write("Usage: node check-ui-contract.mjs [--root <project>] [--baseline <path>] [--write-baseline | --prune-baseline]\n");
    return;
  }
  const result = await runUiContractCheck(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  });
}
