import { readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const nonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

const addIssue = (issues, path, message) => {
  issues.push(`${path}: ${message}`);
};

const isHttpUrl = (value) => {
  if (!nonEmptyString(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

const pathStaysWithin = (parent, child) => {
  const relation = relative(parent, child);
  return relation === "" || (!relation.startsWith("..") && !isAbsolute(relation));
};

const fileExists = async (path) => {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return false;
    throw error;
  }
};

const directoryExists = async (path) => {
  try {
    return (await stat(path)).isDirectory();
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return false;
    throw error;
  }
};

const validateBaseShape = (manifest, issues) => {
  if (!isObject(manifest)) {
    addIssue(issues, "$", "manifest must be an object");
    return;
  }

  if (manifest.schemaVersion !== "1.0.0") addIssue(issues, "schemaVersion", "must equal 1.0.0");
  if (!new Set(["draft", "confirmed"]).has(manifest.status)) addIssue(issues, "status", "must be draft or confirmed");
  if (!nonEmptyString(manifest.projectSlug)) addIssue(issues, "projectSlug", "must be a non-empty string");
  if (!isObject(manifest.source) || !nonEmptyString(manifest.source.type) || !nonEmptyString(manifest.source.path)) {
    addIssue(issues, "source", "must provide non-empty type and path");
  }
  if (!nonEmptyString(manifest.designSystemPath)) addIssue(issues, "designSystemPath", "must be a non-empty string");
  if (!nonEmptyString(manifest.projectRoot)) addIssue(issues, "projectRoot", "must be a non-empty string");
  if (!Array.isArray(manifest.pages)) addIssue(issues, "pages", "must be an array");
  if (!isObject(manifest.preview)) addIssue(issues, "preview", "must be an object");
  if (!Object.hasOwn(manifest, "mockScope") || !Array.isArray(manifest.mockScope)) addIssue(issues, "mockScope", "must be an explicit array");
  if (!nonEmptyString(manifest.compositionKitId)) addIssue(issues, "compositionKitId", "must be a non-empty string");
  if (!Array.isArray(manifest.commitmentIds)) addIssue(issues, "commitmentIds", "must be an array");

  if (isObject(manifest.preview)) {
    if (![null, "user", "host-runner"].includes(manifest.preview.startedBy)) addIssue(issues, "preview.startedBy", "must be user, host-runner or null");
    if (!["not-run", "passed", "failed"].includes(manifest.preview.verification)) addIssue(issues, "preview.verification", "must be not-run, passed or failed");
    if (!Array.isArray(manifest.preview.evidence)) addIssue(issues, "preview.evidence", "must be an array");
  }
};

const validatePageIdentities = (pages, issues) => {
  const ids = new Set();
  const routes = new Set();

  for (const [index, page] of pages.entries()) {
    const base = `pages[${index}]`;
    if (!isObject(page)) {
      addIssue(issues, base, "must be an object");
      continue;
    }
    for (const field of ["id", "title", "route", "file"]) {
      if (!nonEmptyString(page[field])) addIssue(issues, `${base}.${field}`, "must be a non-empty string");
    }
    if (nonEmptyString(page.id)) {
      if (ids.has(page.id)) addIssue(issues, `${base}.id`, `duplicate page id ${page.id}`);
      ids.add(page.id);
    }
    if (nonEmptyString(page.route)) {
      if (routes.has(page.route)) addIssue(issues, `${base}.route`, `duplicate route ${page.route}`);
      routes.add(page.route);
    }
  }
};

export async function validatePageDeliveryManifest(manifest, { hostRoot = process.cwd() } = {}) {
  const issues = [];
  const resolvedFiles = [];
  validateBaseShape(manifest, issues);
  if (!isObject(manifest)) return { ok: false, issues, resolvedFiles };

  const pages = Array.isArray(manifest.pages) ? manifest.pages : [];
  validatePageIdentities(pages, issues);

  if (manifest.status !== "confirmed") return { ok: issues.length === 0, issues, resolvedFiles };

  if (pages.length === 0) addIssue(issues, "pages", "confirmed delivery requires at least one page");
  if (!Array.isArray(manifest.commitmentIds) || manifest.commitmentIds.length === 0 || manifest.commitmentIds.some((id) => !nonEmptyString(id))) {
    addIssue(issues, "commitmentIds", "confirmed delivery requires at least one valid commitment ID");
  }

  const root = resolve(hostRoot);
  const projectRoot = nonEmptyString(manifest.projectRoot)
    ? (isAbsolute(manifest.projectRoot) ? resolve(manifest.projectRoot) : resolve(root, manifest.projectRoot))
    : root;

  if (!(await directoryExists(projectRoot))) addIssue(issues, "projectRoot", `directory does not exist: ${projectRoot}`);

  for (const [index, page] of pages.entries()) {
    if (!isObject(page) || !nonEmptyString(page.file)) continue;
    const pagePath = isAbsolute(page.file) ? resolve(page.file) : resolve(projectRoot, page.file);
    if (!isAbsolute(page.file) && !pathStaysWithin(projectRoot, pagePath)) {
      addIssue(issues, `pages[${index}].file`, "relative page file escapes projectRoot");
      continue;
    }
    if (!(await fileExists(pagePath))) {
      addIssue(issues, `pages[${index}].file`, `file does not exist: ${pagePath}`);
      continue;
    }
    resolvedFiles.push(pagePath);
  }

  if (!isObject(manifest.preview) || !isHttpUrl(manifest.preview.baseUrl)) {
    addIssue(issues, "preview.baseUrl", "confirmed delivery requires an external http(s) baseUrl");
  }
  if (!isObject(manifest.preview) || !["user", "host-runner"].includes(manifest.preview.startedBy)) {
    addIssue(issues, "preview.startedBy", "confirmed delivery must name user or host-runner");
  }
  if (!isObject(manifest.preview) || manifest.preview.verification !== "passed") {
    addIssue(issues, "preview.verification", "confirmed delivery requires passed verification");
  }
  const evidence = isObject(manifest.preview) && Array.isArray(manifest.preview.evidence) ? manifest.preview.evidence : [];
  if (!evidence.some((item) => isObject(item) && item.type === "browser" && item.result === "passed" && isHttpUrl(item.url))) {
    addIssue(issues, "preview.evidence", "confirmed delivery requires passed browser evidence with a URL");
  }
  if (!Object.hasOwn(manifest, "mockScope") || !Array.isArray(manifest.mockScope)) {
    addIssue(issues, "mockScope", "confirmed delivery requires an explicit mock scope array");
  }

  return { ok: issues.length === 0, issues, resolvedFiles };
}

export async function loadPageDeliveryManifest(filePath) {
  return JSON.parse(await readFile(resolve(filePath), "utf8"));
}

const readOption = (args, name) => {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1] ?? null;
};

async function runCli() {
  const args = process.argv.slice(2);
  if (args[0] !== "check") {
    process.stderr.write("Usage: node page-delivery-contract.mjs check --manifest <path> --host-root <path>\n");
    process.exitCode = 2;
    return;
  }

  const manifestPath = readOption(args, "--manifest");
  const hostRoot = readOption(args, "--host-root") ?? process.cwd();
  if (!manifestPath) {
    process.stderr.write("Missing --manifest\n");
    process.exitCode = 2;
    return;
  }

  try {
    const manifest = await loadPageDeliveryManifest(manifestPath);
    const result = await validatePageDeliveryManifest(manifest, { hostRoot });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runCli();
}
