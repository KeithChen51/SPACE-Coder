#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { computeInventoryDigest, deriveProjectIdentity } from "./adoption/compatibility.mjs";
import { buildTokenBridge } from "./adoption/token-bridge.mjs";
import {
  ADOPTION_STRATEGIES,
  adoptionConfigPointers,
  adoptionTokenOwnership,
} from "./adoption/token-contract.mjs";
import {
  isSafeLegacyBaselinePath,
  validateBaseline,
  validateManagedBaselineLockEntry,
} from "./check-ui-contract.mjs";
import {
  ADOPTION_PLAN_SCHEMA_DIGEST,
  adoptionPlanValidationErrors,
  exactAdoptionPlanBinding,
} from "./adoption/plan-contract.mjs";

const INTEGRATION_TYPES = Object.freeze({
  adoptionStrategy: { type: "enum", values: ADOPTION_STRATEGIES },
  tokenOwnership: { type: "enum", values: ["existing", "mixed"] },
  tokenBridge: { type: "nullable-string" },
  componentAdapterMap: { type: "nullable-string" },
  legacyBaseline: { type: "nullable-string" },
  framework: { type: "nullable-string" },
  runtimeTokenImport: { type: "nullable-string" },
  sharedComponentRoot: { type: "nullable-string" },
  sharedComponentExport: { type: "nullable-string" },
  iconEntry: { type: "nullable-string" },
});

const ADOPTION_PACKAGE_SOURCE = "templates/adoption-design-system-package.json";
const ADOPTION_CORE_PACKAGE_SOURCE = "templates/adoption-core-package.json";
const ADOPTION_VISUAL_CONFIG_SOURCE = "templates/adoption-visual.config.json";
const PROJECT_IDENTITY_PATTERN = /^dc-project-v1:[a-f0-9]{64}$/;
const ADOPTION_PACKAGE = Object.freeze({
  name: "design-consultant-adapted-system",
  version: "0.10.0",
  private: true,
  type: "module",
  scripts: {
    "adoption:check": "node checks/check-adoption-contract.mjs --root .",
    "ui:baseline": "node checks/check-ui-contract.mjs --write-baseline",
    "ui:check": "node checks/check-ui-contract.mjs",
    "catalog:build": "node checks/build-component-catalog.mjs build",
    "catalog:check": "node checks/build-component-catalog.mjs check",
    "guard:ui": "node checks/check-ui-contract.mjs",
    "visual:inspect": "node checks/visual-regression.mjs inspect --config checks/adoption-visual.config.json",
    "visual:test": "node checks/visual-regression.mjs test --config checks/adoption-visual.config.json",
    "product:acceptance": "node checks/product-acceptance.mjs test --config checks/product-acceptance.config.mjs --project-root ..",
    "verify:system": "node checks/verify-project.mjs system",
    "verify:product": "node checks/verify-project.mjs product",
    "verify": "node checks/verify-project.mjs final",
  },
  dependencies: {
    ajv: "8.17.1",
    "css-tree": "3.2.1",
    react: "19.2.8",
    "react-dom": "19.2.8",
    typescript: "7.0.2",
  },
  devDependencies: {
    "@babel/parser": "7.28.5",
    "@babel/traverse": "7.28.5",
    esbuild: "0.28.1",
    pixelmatch: "7.2.0",
    playwright: "1.62.0",
    pngjs: "7.0.0",
  },
});
const ADOPTION_PACKAGE_RAW = `${JSON.stringify(ADOPTION_PACKAGE, null, 2)}\n`;
const ADOPTION_CORE_PACKAGE = Object.freeze({
  name: "design-consultant-adapted-system-core",
  version: "0.10.0",
  private: true,
  type: "module",
  scripts: {
    "adoption:check": "node checks/check-adoption-contract.mjs --root .",
    "ui:baseline": "node checks/check-ui-contract.mjs --write-baseline",
    "ui:check": "node checks/check-ui-contract.mjs",
    "guard:ui": "node checks/check-ui-contract.mjs",
  },
  dependencies: {
    ajv: "8.17.1",
    "css-tree": "3.2.1",
    typescript: "7.0.2",
  },
});
const ADOPTION_CORE_PACKAGE_RAW = `${JSON.stringify(ADOPTION_CORE_PACKAGE, null, 2)}\n`;
const ADOPTION_SCRIPT_TARGETS = Object.freeze([
  "checks/check-adoption-contract.mjs",
  "checks/build-component-catalog.mjs",
  "checks/check-ui-contract.mjs",
  "checks/visual-regression.mjs",
  "checks/product-acceptance.mjs",
  "checks/verify-project.mjs",
]);

function requiredAdoptionConfigFileFields(pointers) {
  return new Set(Object.entries(pointers).flatMap(([section, values]) => (
    Object.entries(values)
      .filter(([, destination]) => destination !== null)
      .map(([field]) => `${section}.${field}`)
  )));
}

function toPosixPath(path) {
  return path.replaceAll("\\", "/");
}

function issue(rule, message, path = null, details = {}) {
  return { rule, message, ...(path ? { path } : {}), ...details };
}

function isInside(root, path) {
  const rel = relative(root, path);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function safeRelativePosix(path) {
  return typeof path === "string"
    && path.length > 0
    && !path.includes("\\")
    && !isAbsolute(path)
    && path.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

async function readText(path, issues, rule, label) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    issues.push(issue(rule, `${label} could not be read: ${error.message}`, path));
    return null;
  }
}

async function readJson(path, issues, rule, label) {
  const text = await readText(path, issues, rule, label);
  if (text === null) return null;
  try {
    return JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch (error) {
    issues.push(issue(rule, `${label} is invalid JSON: ${error.message}`, path));
    return null;
  }
}

function parseJsonText(text, path, issues, rule, label) {
  if (text === null) return null;
  try {
    return JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch (error) {
    issues.push(issue(rule, `${label} is invalid JSON: ${error.message}`, path));
    return null;
  }
}

async function readOrdinaryContainedText(canonicalRoot, relativePath, issues, rule, label) {
  if (!safeRelativePosix(relativePath)) {
    issues.push(issue(rule, `${label} path is not safe relative POSIX`, relativePath));
    return null;
  }
  const path = resolve(canonicalRoot, ...relativePath.split("/"));
  if (!isInside(canonicalRoot, path)) {
    issues.push(issue(rule, `${label} path escapes the canonical adoption output`, relativePath));
    return null;
  }
  try {
    const segments = relative(canonicalRoot, path).split(sep).filter(Boolean);
    let current = canonicalRoot;
    for (const [index, segment] of segments.entries()) {
      current = join(current, segment);
      const info = await lstat(current);
      if (info.isSymbolicLink()) throw new Error(`path contains a symbolic link, junction, or reparse point: ${current}`);
      if (index < segments.length - 1 && !info.isDirectory()) throw new Error(`path has a non-directory ancestor: ${current}`);
      if (index === segments.length - 1 && !info.isFile()) throw new Error("path must be an ordinary file");
      const canonicalSegment = await realpath(current);
      if (!isInside(canonicalRoot, canonicalSegment)) throw new Error("real path escapes the canonical adoption output");
    }
    const canonicalPath = await realpath(path);
    if (!isInside(canonicalRoot, canonicalPath)) throw new Error("real path escapes the canonical adoption output");
    return await readFile(canonicalPath, "utf8");
  } catch (error) {
    issues.push(issue(rule, `${label} could not be read as an ordinary contained file: ${error.message}`, relativePath));
    return null;
  }
}

async function containedExistingPath(canonicalRoot, candidateRoot, value, field, issues, { allowMissing = false, requireFile = false } = {}) {
  if (typeof value !== "string" || value.length === 0 || isAbsolute(value)) {
    issues.push(issue("invalid-config-path", `${field} must be a non-empty relative path`, null, { field }));
    return null;
  }
  const path = resolve(candidateRoot, value);
  if (!isInside(candidateRoot, path)) {
    issues.push(issue("config-path-outside-root", `${field} escapes the adoption root`, value, { field }));
    return null;
  }
  try {
    const info = await lstat(path);
    const canonicalPath = await realpath(path);
    if (!isInside(canonicalRoot, canonicalPath)) {
      issues.push(issue("config-path-outside-root", `${field} resolves outside the adoption root`, value, { field }));
      return null;
    }
    if (requireFile && !info.isFile()) {
      issues.push(issue("config-path-not-file", `${field} must point to a regular file`, value, { field }));
      return null;
    }
    if (!info.isFile() && !info.isDirectory()) {
      issues.push(issue("invalid-config-path-kind", `${field} must point to a file or directory`, value, { field }));
      return null;
    }
    return canonicalPath;
  } catch (error) {
    if (allowMissing && error.code === "ENOENT") return null;
    issues.push(issue("missing-config-path", `${field} points to a missing path: ${value}`, value, { field }));
    return null;
  }
}

function validFieldType(value, contract) {
  if (contract.type === "null") return value === null;
  if (contract.type === "string") return typeof value === "string" && value.length > 0;
  if (contract.type === "nullable-string") return value === null || (typeof value === "string" && value.length > 0);
  return typeof value === "string" && contract.values.includes(value);
}

function validateConfigContract(config, plan, pointers, componentRuntimeActive, issues) {
  if (!config || typeof config !== "object" || Array.isArray(config)) return;
  const integration = config.integration;
  if (!integration || typeof integration !== "object" || Array.isArray(integration)) {
    issues.push(issue("invalid-integration-field-type", "integration must be an object", null, { field: "integration" }));
    return;
  }
  for (const [field, contract] of Object.entries(INTEGRATION_TYPES)) {
    if (!Object.hasOwn(integration, field)) {
      issues.push(issue("missing-integration-field", `integration.${field} is required`, null, { field }));
    } else if (!validFieldType(integration[field], contract)) {
      issues.push(issue("invalid-integration-field-type", `integration.${field} has an invalid type or value`, null, { field }));
    }
  }
  for (const [section, expectedPointers] of Object.entries(pointers)) {
    const configured = config[section];
    for (const [field, expected] of Object.entries(expectedPointers)) {
      const qualifiedField = `${section}.${field}`;
      if (!configured || typeof configured !== "object" || Array.isArray(configured) || !Object.hasOwn(configured, field)) {
        issues.push(issue("missing-config-pointer", `${qualifiedField} is required by the Task 4 adoption contract`, null, { field: qualifiedField }));
      } else if (configured[field] !== expected) {
        issues.push(issue("config-pointer-contract-mismatch", `${qualifiedField} must equal ${expected === null ? "null" : expected}`, null, { field: qualifiedField, expected }));
      }
    }
  }
  if (typeof integration.adoptionStrategy === "string" && integration.adoptionStrategy !== plan?.strategy) {
    issues.push(issue("adoption-strategy-mismatch", "system.config.json strategy does not match the confirmed plan"));
  }
  const expectedOwnership = adoptionTokenOwnership(plan?.strategy);
  if (typeof integration.tokenOwnership === "string" && integration.tokenOwnership !== expectedOwnership) {
    issues.push(issue("token-ownership-mismatch", `tokenOwnership must be ${expectedOwnership}`));
  }
  const expectedRoot = componentRuntimeActive ? "runtime/react/src" : null;
  const expectedExport = componentRuntimeActive ? "runtime/react/src/index.ts" : null;
  if (componentRuntimeActive && integration.framework !== "React") {
    issues.push(issue("component-runtime-config-mismatch", "integration.framework must equal React", null, { field: "integration.framework", expected: "React" }));
  }
  for (const [field, expected] of [["sharedComponentRoot", expectedRoot], ["sharedComponentExport", expectedExport]]) {
    if (integration[field] !== expected) {
      issues.push(issue("component-runtime-config-mismatch", `integration.${field} must equal ${expected ?? "null"}`, null, { field: `integration.${field}`, expected }));
    }
  }
}

function configuredPaths(config, issues) {
  const values = [];
  for (const section of ["sourceOfTruth", "checks"]) {
    const object = config?.[section];
    if (!object || typeof object !== "object" || Array.isArray(object)) {
      issues.push(issue("invalid-config-pointer-type", `${section} must be an object`, null, { field: section }));
      continue;
    }
    for (const [key, value] of Object.entries(object)) {
      if (value === null) continue;
      if (typeof value !== "string" || value.length === 0) {
        issues.push(issue("invalid-config-pointer-type", `${section}.${key} must be a string or null`, null, { field: `${section}.${key}` }));
      } else values.push({ field: `${section}.${key}`, value });
    }
  }
  for (const field of ["tokenBridge", "componentAdapterMap", "legacyBaseline", "runtimeTokenImport", "sharedComponentRoot", "sharedComponentExport", "iconEntry"]) {
    const value = config?.integration?.[field];
    if (typeof value === "string" && value.length > 0) values.push({ field: `integration.${field}`, value });
  }
  return values;
}

async function validateConfigPaths(root, config, requiredFileFields, issues) {
  let canonicalRoot;
  try {
    canonicalRoot = await realpath(root);
  } catch (error) {
    issues.push(issue("invalid-adoption-root", `Adoption root could not be resolved: ${error.message}`, root));
    return new Map();
  }
  const paths = new Map();
  for (const entry of configuredPaths(config, issues)) {
    let filesystemValue = entry.value;
    if (entry.field === "sourceOfTruth.visualizationCatalog") {
      const match = /^([^?#]+)(?:#(visualization\/[a-z0-9-]+))?$/.exec(entry.value);
      if (!match) {
        issues.push(issue("invalid-config-path", `${entry.field} must be a relative Catalog path with an optional visualization fragment`, entry.value, { field: entry.field }));
        continue;
      }
      filesystemValue = match[1];
    } else if (/[?#]/.test(entry.value)) {
      issues.push(issue("invalid-config-path", `${entry.field} must not contain a query or fragment`, entry.value, { field: entry.field }));
      continue;
    }
    const derivedCatalogBundle = entry.field === "sourceOfTruth.catalogBundle"
      && entry.value === "catalog/component-library.js"
      && config?.sourceOfTruth?.catalogSource === "catalog/src/catalog.tsx"
      && config?.checks?.catalogBuild === "checks/build-component-catalog.mjs";
    const path = await containedExistingPath(canonicalRoot, root, filesystemValue, entry.field, issues, {
      allowMissing: derivedCatalogBundle,
      requireFile: requiredFileFields.has(entry.field) || entry.field === "integration.sharedComponentExport",
    });
    if (path) paths.set(entry.field, path);
  }
  return paths;
}

async function resolveProjectRoot(root, inventory, issues) {
  const output = inventory?.project?.output;
  if (typeof output !== "string" || output.length === 0 || isAbsolute(output)) {
    issues.push(issue("invalid-inventory-output", "extraction report must declare a relative project output path"));
    return null;
  }
  const segments = output.replaceAll("\\", "/").split("/").filter(Boolean);
  if (segments.length === 0 || segments.includes("..")) {
    issues.push(issue("invalid-inventory-output", "extraction report output path is unsafe"));
    return null;
  }
  const candidate = resolve(root, ...segments.map(() => ".."));
  try {
    const canonicalProject = await realpath(candidate);
    const canonicalOutput = await realpath(root);
    const expectedOutput = await realpath(resolve(canonicalProject, ...segments));
    if (canonicalOutput !== expectedOutput || !isInside(canonicalProject, canonicalOutput)) {
      issues.push(issue("inventory-output-mismatch", "validator root does not match the extraction output path"));
      return null;
    }
    return canonicalProject;
  } catch (error) {
    issues.push(issue("invalid-project-root", `Project root could not be resolved: ${error.message}`));
    return null;
  }
}

async function validateEvidencePaths(projectRoot, mappings, issues) {
  if (!projectRoot) return;
  for (const mapping of mappings) {
    for (const [label, source] of [["source", mapping?.source], ["fallback", mapping?.fallback]]) {
      if (source?.kind !== "css-variable" || typeof source.file !== "string") continue;
      await containedExistingPath(projectRoot, projectRoot, source.file, `${mapping.canonicalToken}.${label}`, issues);
    }
  }
}

function validateCanonicalResolution(css, map, issues) {
  for (const mapping of map?.mappings ?? []) {
    const sameName = mapping.source?.kind === "css-variable" && mapping.source.name === mapping.canonicalCssVariable;
    const escaped = mapping.canonicalCssVariable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!sameName && !new RegExp(`${escaped}\\s*:`).test(css)) {
      issues.push(issue("unresolved-canonical-token", `${mapping.canonicalCssVariable} is not declared by the bridge`, null, { canonicalToken: mapping.canonicalToken }));
    }
  }
}

function digest(content) {
  return createHash("sha256").update(content).digest("hex");
}

function exactProvenance(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === Object.keys(expected).sort().join(",")
    && Object.entries(expected).every(([key, expectedValue]) => value[key] === expectedValue);
}

function validateMigrationPlanLockEntry(lock, raw, issues) {
  const path = "migration/plan.md";
  const expectedProvenance = { schemaVersion: 1, type: "existing-system-migration-plan", mode: "planning-only" };
  const entry = lock?.files?.[path];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)
    || Object.keys(entry).sort().join(",") !== "generatedHash,provenance,source,templateHash"
    || entry.source !== "generated:adoption-migration-plan" || entry.templateHash !== null
    || !exactProvenance(entry.provenance, expectedProvenance)
    || !/^[a-f0-9]{64}$/.test(entry.generatedHash ?? "")
    || digest(raw) !== entry.generatedHash) {
    issues.push(issue("managed-adoption-artifact-drift", "migration plan lock entry, raw hash, or provenance is invalid", path));
  }
}

async function isSkillSourceRoot(root) {
  try {
    const [skill, packageTemplate, checker] = await Promise.all([
      lstat(join(root, "SKILL.md")),
      lstat(join(root, "templates", "adoption-design-system-package.json")),
      lstat(join(root, "scripts", "check-adoption-contract.mjs")),
    ]);
    return skill.isFile() && packageTemplate.isFile() && checker.isFile();
  } catch {
    return false;
  }
}

async function validateSkillSourcePackage(canonicalRoot) {
  const issues = [];
  const required = [
    "templates/adoption-core-package.json",
    "templates/adoption-design-system-package.json",
    "templates/adoption-plan.schema.json",
    "templates/adoption-visual.config.json",
    "scripts/check-adoption-contract.mjs",
    "scripts/check-greenfield-adoption.mjs",
    "scripts/check-ui-contract.mjs",
    "scripts/adoption/compatibility.mjs",
    "scripts/adoption/plan-contract.mjs",
    "scripts/adoption/inventory.mjs",
    "scripts/adoption/token-contract.mjs",
    "scripts/adoption/token-bridge.mjs",
    "scripts/adoption/visual-route-contract.mjs",
    "scripts/adoption/component-adapters.mjs",
    "scripts/adoption/evidence-attestation.mjs",
  ];
  for (const path of required) {
    await readOrdinaryContainedText(canonicalRoot, path, issues, "missing-portable-adoption-source", `portable adoption source ${path}`);
  }
  const packageRaw = await readOrdinaryContainedText(
    canonicalRoot,
    "templates/adoption-design-system-package.json",
    issues,
    "invalid-adoption-package-template",
    "adoption package template",
  );
  if (packageRaw !== null && packageRaw !== ADOPTION_PACKAGE_RAW) {
    issues.push(issue("package-script-contract", "adoption package template differs from the checker contract", "templates/adoption-design-system-package.json"));
  }
  const corePackageRaw = await readOrdinaryContainedText(
    canonicalRoot,
    "templates/adoption-core-package.json",
    issues,
    "invalid-adoption-package-template",
    "core adoption package template",
  );
  if (corePackageRaw !== null && corePackageRaw !== ADOPTION_CORE_PACKAGE_RAW) {
    issues.push(issue("package-script-contract", "core adoption package template differs from the checker contract", "templates/adoption-core-package.json"));
  }
  const schemaRaw = await readOrdinaryContainedText(
    canonicalRoot,
    "templates/adoption-plan.schema.json",
    issues,
    "invalid-adoption-plan-schema-template",
    "adoption plan schema template",
  );
  if (schemaRaw !== null && digest(schemaRaw) !== ADOPTION_PLAN_SCHEMA_DIGEST) {
    issues.push(issue("adoption-plan-schema-lock-drift", "adoption plan schema template differs from the pinned v0.10 contract", "templates/adoption-plan.schema.json"));
  }
  issues.sort((left, right) => `${left.rule}:${left.path ?? ""}:${left.message}`.localeCompare(`${right.rule}:${right.path ?? ""}:${right.message}`));
  return { ok: issues.length === 0, mode: "skill-source", issues };
}

async function validateManagedAdoptionPackage(canonicalRoot, lock, issues, componentRuntimeActive) {
  const packagePath = "package.json";
  const expectedRaw = componentRuntimeActive ? ADOPTION_PACKAGE_RAW : ADOPTION_CORE_PACKAGE_RAW;
  const expectedSource = componentRuntimeActive ? ADOPTION_PACKAGE_SOURCE : ADOPTION_CORE_PACKAGE_SOURCE;
  const raw = await readOrdinaryContainedText(
    canonicalRoot,
    packagePath,
    issues,
    "managed-adoption-package",
    "existing adoption package manifest",
  );
  if (raw !== null && raw !== expectedRaw) {
    issues.push(issue(
      "package-script-contract",
      "existing adoption package manifest differs from the exact installed script and dependency contract",
      packagePath,
    ));
  }

  const expectedHash = digest(expectedRaw);
  const entry = lock?.files?.[packagePath];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)
    || Object.keys(entry).sort().join(",") !== "generatedHash,source,templateHash"
    || entry.source !== expectedSource
    || entry.generatedHash !== expectedHash
    || entry.templateHash !== expectedHash) {
    issues.push(issue(
      "package-lock-provenance",
      "existing adoption package requires the exact managed template source and hashes",
      packagePath,
    ));
  }

  const scriptTargets = componentRuntimeActive
    ? ADOPTION_SCRIPT_TARGETS
    : ["checks/check-adoption-contract.mjs", "checks/check-ui-contract.mjs"];
  for (const target of scriptTargets) {
    await readOrdinaryContainedText(
      canonicalRoot,
      target,
      issues,
      "package-script-target",
      `existing adoption package script target ${target}`,
    );
  }
}

async function validateManagedVisualIdentity(canonicalRoot, plan, lock, issues) {
  const path = "checks/adoption-visual.config.json";
  const raw = await readOrdinaryContainedText(canonicalRoot, path, issues, "managed-adoption-visual-config", "adoption visual config");
  if (raw === null) return;
  const config = parseJsonText(raw, path, issues, "managed-adoption-visual-config", "adoption visual config");
  const entry = lock?.files?.[path];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)
    || Object.keys(entry).sort().join(",") !== "generatedHash,source,templateHash"
    || entry.source !== ADOPTION_VISUAL_CONFIG_SOURCE
    || !/^[a-f0-9]{64}$/.test(entry.generatedHash ?? "")
    || !/^[a-f0-9]{64}$/.test(entry.templateHash ?? "")
    || digest(raw) !== entry.generatedHash) {
    issues.push(issue("managed-adoption-visual-config", "adoption visual config requires its exact managed lock source and raw hash", path));
  }
  if (!config || config.projectIdentity !== lock?.adoption?.projectIdentity) {
    issues.push(issue("project-identity-mismatch", "adoption visual config projectIdentity must equal the confirmed adoption lock identity", path));
  }
  if (config && (config.baseUrl !== plan?.visualVerification?.baseUrl
    || JSON.stringify(config.routes) !== JSON.stringify(plan?.visualVerification?.routes))) {
    issues.push(issue("adoption-visual-route-drift", "adoption visual config must preserve the confirmed plan baseUrl and routes exactly", path));
  }
}

async function validateManagedAdoptionArtifacts(canonicalRoot, plan, lock, issues) {
  const baselinePath = plan?.legacyBaseline?.path;
  if (!isSafeLegacyBaselinePath(baselinePath)) {
    issues.push(issue("invalid-legacy-baseline-path", "legacy baseline path must be a non-reserved JSON destination below checks/", baselinePath));
    return;
  }
  const baselineSource = await readOrdinaryContainedText(
    canonicalRoot,
    baselinePath,
    issues,
    "missing-managed-adoption-artifact",
    "legacy UI baseline",
  );
  if (baselineSource !== null) {
    try {
      validateBaseline(JSON.parse(baselineSource.replace(/^\uFEFF/, "")), { label: "legacy UI baseline" });
      validateManagedBaselineLockEntry({ lock, relativePath: baselinePath, baselineRaw: baselineSource });
    } catch (error) {
      issues.push(issue("managed-adoption-artifact-drift", error.message, baselinePath));
    }
  }
  const migrationSource = await readOrdinaryContainedText(
    canonicalRoot,
    "migration/plan.md",
    issues,
    "missing-managed-adoption-artifact",
    "adoption migration plan",
  );
  if (migrationSource !== null) validateMigrationPlanLockEntry(lock, migrationSource, issues);
}

export async function validateAdoptionContract(root) {
  const resolvedRoot = resolve(root);
  const issues = [];
  let canonicalRoot;
  try {
    const rootInfo = await lstat(resolvedRoot);
    if (!rootInfo.isDirectory()) throw new Error("root is not a directory");
    canonicalRoot = await realpath(resolvedRoot);
  } catch (error) {
    return { ok: false, issues: [issue("invalid-adoption-root", error.message, resolvedRoot)] };
  }

  if (await isSkillSourceRoot(canonicalRoot)) return validateSkillSourcePackage(canonicalRoot);

  const lockRelativePath = ".design-consultant-lock.json";
  const lockSource = await readOrdinaryContainedText(canonicalRoot, lockRelativePath, issues, "missing-adoption-lock", "adoption lock");
  const lock = parseJsonText(lockSource, lockRelativePath, issues, "missing-adoption-lock", "adoption lock");
  if (lock?.workflow !== "existing-system-adoption") issues.push(issue("invalid-adoption-workflow", "lock workflow must be existing-system-adoption"));
  if (!lock?.adoption || typeof lock.adoption !== "object" || Array.isArray(lock.adoption)
    || Object.keys(lock.adoption).sort().join(",") !== "inventoryDigest,plan,projectIdentity,status,strategy"
    || lock.adoption.status !== "confirmed"
    || !PROJECT_IDENTITY_PATTERN.test(lock.adoption.projectIdentity ?? "")) {
    issues.push(issue("invalid-project-identity", "confirmed adoption lock must contain the exact stable projectIdentity contract"));
  }
  const config = await readJson(resolve(canonicalRoot, "system.config.json"), issues, "missing-adoption-config", "system.config.json");
  const planRelativePath = "adoption/adoption-plan.json";
  const schemaRelativePath = "adoption/adoption-plan.schema.json";
  const planSource = await readOrdinaryContainedText(canonicalRoot, planRelativePath, issues, "missing-adoption-plan", "adoption plan");
  const plan = parseJsonText(planSource, planRelativePath, issues, "missing-adoption-plan", "adoption plan");
  const schemaSource = await readOrdinaryContainedText(canonicalRoot, schemaRelativePath, issues, "missing-adoption-plan-schema", "adoption plan schema");
  const schema = parseJsonText(schemaSource, schemaRelativePath, issues, "missing-adoption-plan-schema", "adoption plan schema");
  if (planSource !== null) {
    const planEntry = lock?.files?.[planRelativePath];
    if (!exactAdoptionPlanBinding(lock?.adoption?.plan, planSource)
      || planEntry?.source !== "generated:draft-adoption-plan"
      || planEntry?.generatedHash !== digest(planSource)
      || planEntry?.templateHash !== null) {
      issues.push(issue("adoption-plan-lock-drift", "confirmed adoption plan raw bytes, digest, byte length, or managed lock entry drifted", planRelativePath));
    }
  }
  let trustedSchema = false;
  if (schemaSource !== null) {
    const schemaEntry = lock?.files?.[schemaRelativePath];
    const schemaHash = digest(schemaSource);
    trustedSchema = schemaHash === ADOPTION_PLAN_SCHEMA_DIGEST
      && schemaEntry?.source === "templates/adoption-plan.schema.json"
      && schemaEntry?.generatedHash === schemaHash
      && schemaEntry?.templateHash === schemaHash;
    if (!trustedSchema) {
      issues.push(issue("adoption-plan-schema-lock-drift", "adoption plan schema bytes or managed lock entry drifted", schemaRelativePath));
    }
  }
  if (plan && schema && trustedSchema) {
    const schemaErrors = adoptionPlanValidationErrors(plan, schema);
    for (const message of schemaErrors) issues.push(issue("adoption-plan-schema", message, planRelativePath));
  }
  const storedInventory = await readJson(resolve(canonicalRoot, "intake/extraction-report.json"), issues, "missing-adoption-inventory", "extraction report");
  if (!plan || !storedInventory) return { ok: false, issues };
  try {
    if (lock?.adoption?.projectIdentity !== deriveProjectIdentity(storedInventory)) {
      issues.push(issue("project-identity-mismatch", "adoption projectIdentity must be derived from the exact confirmed inventory facts"));
    }
  } catch (error) {
    issues.push(issue("invalid-project-identity-facts", error.message));
  }
  if (lock?.output !== storedInventory.project?.output) {
    issues.push(issue("managed-output-mismatch", "lock.output must equal the exact extraction output root", null, { expected: storedInventory.project?.output }));
  }
  if (storedInventory.evidenceLimitReached === true) {
    issues.push(issue("incomplete-inventory-evidence", "Extraction evidence reached maxFiles and is incomplete; rerun a complete extract before trusting adoption artifacts."));
  }
  await validateManagedAdoptionArtifacts(canonicalRoot, plan, lock, issues);

  if (plan.status !== "confirmed") issues.push(issue("unconfirmed-adoption-plan", "adoption plan must be confirmed"));
  if (!Array.isArray(plan.tokenMappings)) issues.push(issue("invalid-token-mappings", "tokenMappings must be an array"));
  const mappings = Array.isArray(plan.tokenMappings) ? plan.tokenMappings : [];
  if (mappings.some((mapping) => mapping?.status === "proposed" || mapping?.status === "manual")) {
    issues.push(issue("unconfirmed-token-mapping", "Proposed or manual token mappings block adoption validation"));
  }
  const componentMappings = Array.isArray(plan.componentMappings) ? plan.componentMappings : [];
  if (!Array.isArray(plan.componentMappings)) issues.push(issue("invalid-component-mappings", "componentMappings must be an array"));
  if (componentMappings.some((mapping) => mapping?.status === "proposed")) {
    issues.push(issue("unconfirmed-component-mapping", "Every component candidate must be confirmed or rejected"));
  }
  let componentRuntime = { enabled: false };
  const componentRuntimeIntent = (storedInventory.detected?.frameworks ?? []).includes("React")
    && componentMappings.some((mapping) => mapping?.status === "confirmed" && ["direct", "wrapper", "generate", "manual"].includes(mapping?.strategy));
  await validateManagedAdoptionPackage(canonicalRoot, lock, issues, componentRuntimeIntent);
  if (componentRuntimeIntent) await validateManagedVisualIdentity(canonicalRoot, plan, lock, issues);
  if (componentRuntimeIntent) {
    try {
      const { buildRuntimePlan } = await import("./adoption/component-adapters.mjs");
      componentRuntime = buildRuntimePlan({ strategy: plan.strategy, mappings: componentMappings, inventory: storedInventory });
    } catch (error) {
      issues.push(issue("invalid-component-runtime-plan", error.message));
    }
  }
  const pointers = adoptionConfigPointers({
    tokenBridgeActive: mappings.some((mapping) => mapping?.status === "confirmed"),
    componentRuntimeActive: componentRuntime.enabled,
    generatedStylesActive: (componentRuntime.generatedComponents?.length ?? 0) > 0,
    legacyBaseline: plan.legacyBaseline?.path ?? null,
  });
  const requiredFileFields = requiredAdoptionConfigFileFields(pointers);

  if (config) validateConfigContract(config, plan, pointers, componentRuntime.enabled, issues);
  const configPaths = config ? await validateConfigPaths(canonicalRoot, config, requiredFileFields, issues) : new Map();
  const projectRoot = await resolveProjectRoot(canonicalRoot, storedInventory, issues);
  let liveInventory = null;
  if (projectRoot) {
    if (componentRuntime.enabled) {
      const {
        TYPE_EVIDENCE_ATTESTATION_PATH,
        validateTypeEvidenceAttestation,
        validateTypeEvidenceLock,
      } = await import("./adoption/evidence-attestation.mjs");
      const attestationSource = await readOrdinaryContainedText(
        canonicalRoot,
        TYPE_EVIDENCE_ATTESTATION_PATH,
        issues,
        "missing-type-evidence-attestation",
        "component type evidence attestation",
      );
      let trustedAttestation = false;
      if (attestationSource !== null) {
        const lockIssues = validateTypeEvidenceLock({ lock, attestationSource });
        for (const message of lockIssues) {
          issues.push(issue("type-evidence-lock-drift", message, TYPE_EVIDENCE_ATTESTATION_PATH));
        }
        if (lockIssues.length === 0) {
          try {
            const attestation = JSON.parse(attestationSource.replace(/^\uFEFF/, ""));
            const attestationIssues = await validateTypeEvidenceAttestation({
              projectRoot,
              outputRoot: canonicalRoot,
              inventory: storedInventory,
              plan,
              runtime: componentRuntime,
              attestation,
            });
            for (const message of attestationIssues) {
              issues.push(issue("type-evidence-attestation-drift", message, TYPE_EVIDENCE_ATTESTATION_PATH));
            }
            trustedAttestation = attestationIssues.length === 0;
          } catch (error) {
            issues.push(issue("type-evidence-attestation-drift", error.message, TYPE_EVIDENCE_ATTESTATION_PATH));
          }
        }
      }
      if (trustedAttestation) liveInventory = storedInventory;
    } else {
      const { collectSystemInventory } = await import("./adoption/inventory.mjs");
      liveInventory = await collectSystemInventory({ projectRoot, outputRoot: canonicalRoot });
      if (liveInventory.evidenceLimitReached === true) {
        issues.push(issue("incomplete-live-inventory-evidence", "Live inventory reached maxFiles and cannot validate the confirmed adoption contract."));
      }
      const liveDigest = computeInventoryDigest(liveInventory);
      if (liveDigest !== plan.inventoryDigest || liveDigest !== storedInventory.inventoryDigest) {
        issues.push(issue("live-inventory-digest-mismatch", "Live source inventory differs from the confirmed extraction and plan"));
      }
    }
    if (computeInventoryDigest(storedInventory) !== storedInventory.inventoryDigest) {
      issues.push(issue("stored-inventory-digest-mismatch", "Stored extraction evidence does not match its digest"));
    }
    await validateEvidencePaths(projectRoot, mappings, issues);
  }

  const bridge = buildTokenBridge({ mappings, inventory: liveInventory ?? { detected: {} }, strategy: plan.strategy });
  issues.push(...bridge.issues);
  const mapPath = configPaths.get("integration.tokenBridge");
  const cssPath = configPaths.get("sourceOfTruth.runtimeTokens");
  const map = mapPath ? await readJson(mapPath, issues, "missing-token-bridge-map", "external token map") : null;
  const css = cssPath ? await readText(cssPath, issues, "missing-token-bridge-css", "external token bridge CSS") : null;
  if (map && JSON.stringify(map) !== JSON.stringify(bridge.map)) {
    issues.push(issue("token-bridge-map-drift", "external-map.json does not match the confirmed plan", toPosixPath(relative(canonicalRoot, mapPath))));
  }
  if (css !== null && css !== bridge.css) {
    issues.push(issue("token-bridge-css-drift", "external-bridge.css does not match the confirmed plan", toPosixPath(relative(canonicalRoot, cssPath))));
  }
  if (map && css !== null) validateCanonicalResolution(css, map, issues);
  issues.sort((left, right) => `${left.rule}:${left.path ?? ""}:${left.message}`.localeCompare(`${right.rule}:${right.path ?? ""}:${right.message}`));
  return { ok: issues.length === 0, issues };
}

function parseArguments(argv) {
  let root = process.cwd();
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--root") {
      if (!argv[index + 1]) throw new Error("--root requires a path");
      root = argv[index + 1];
      index += 1;
    } else if (argv[index].startsWith("-")) throw new Error(`Unknown option ${argv[index]}`);
    else root = argv[index];
  }
  return resolve(root);
}

async function main() {
  try {
    const root = parseArguments(process.argv.slice(2));
    const result = await validateAdoptionContract(root);
    process.stdout.write(`${JSON.stringify({ ...result, root }, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ ok: false, issues: [issue("adoption-contract-error", error.message)] }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
