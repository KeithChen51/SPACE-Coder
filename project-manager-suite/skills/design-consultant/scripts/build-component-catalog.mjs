#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { deriveProjectIdentity } from "./adoption/compatibility.mjs";
import { exactAdoptionPlanBinding } from "./adoption/plan-contract.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, "..");
const IS_SKILL_SOURCE = SCRIPT_DIR.endsWith(`${join("design-consultant", "scripts")}`);
const BASE_ENTRY = IS_SKILL_SOURCE ? join(ROOT, "templates/catalog-react.tsx") : join(ROOT, "catalog/src/catalog.tsx");
const DEFAULT_RUNTIME_ENTRY = IS_SKILL_SOURCE ? join(ROOT, "templates/react-runtime/src/index.ts") : join(ROOT, "runtime/react/src/index.ts");
const DEFAULT_MANIFEST = IS_SKILL_SOURCE ? join(ROOT, "templates/component-manifest.json") : join(ROOT, "components/manifest.json");
const ADOPTION_ENTRY = join(ROOT, "catalog/src/adoption-entry.tsx");
const DEFAULT_OUTPUT = IS_SKILL_SOURCE ? join(ROOT, "templates/component-library.js") : join(ROOT, "catalog/component-library.js");
const ADOPTION_STRATEGIES = new Set(["preserve", "augment", "migrate"]);
const PROJECT_IDENTITY_PATTERN = /^dc-project-v1:[a-f0-9]{64}$/;
const COMPONENT_ORIGINS = new Set(["existing", "adapter", "design-consultant"]);
const AVAILABILITY_KINDS = new Set(["runtime-ready", "evidence-only", "contract-only", "external-required"]);
const CANONICAL_COMPONENTS = Object.freeze([
  ["button", "Button"],
  ["icon-button", "IconButton"],
  ["field", "FieldShell"],
  ["choice-field", "SelectField"],
  ["dialog", "Dialog"],
  ["resource-state", "ResourcePanel"],
  ["status", "StatusBadge"],
  ["data-table", "DataTable"],
]);

function catalogAvailability(manifest) {
  if (!Array.isArray(manifest?.families)) throw new Error("Component manifest must contain a families array for the Catalog.");
  return manifest.families.map((family) => {
    if (typeof family?.id !== "string" || typeof family?.name !== "string" || !AVAILABILITY_KINDS.has(family.availability)) {
      throw new Error("Every Catalog component family must declare id, name, and explicit availability.");
    }
    return { id: family.id, name: family.name, availability: family.availability };
  });
}
const ACTIVE_COMPONENT_STRATEGIES = new Set(["direct", "wrapper", "manual", "generate"]);
const CSS_ASSET_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".woff", ".woff2", ".ttf", ".otf"]);
const LOCAL_LOADERS = new Map([
  [".js", "js"], [".jsx", "jsx"], [".ts", "ts"], [".tsx", "tsx"], [".css", "css"], [".json", "json"],
  ...[...CSS_ASSET_EXTENSIONS].map((extension) => [extension, "dataurl"]),
]);
const LOCAL_RESOLUTION_EXTENSIONS = ["", ...LOCAL_LOADERS.keys()];
const MANAGED_SOURCES = Object.freeze({
  "system.config.json": "generated:adoption-system-config",
  "intake/extraction-report.json": "generated:project-extraction",
  "adoption/adoption-plan.json": "generated:draft-adoption-plan",
  "tokens/external-map.json": "generated:confirmed-token-map",
  "tokens/external-bridge.css": "generated:confirmed-token-bridge",
  "components/adapter-map.json": "generated:component-adapter-map",
  "components/manifest.json": "generated:adoption-component-manifest",
  "components/type-evidence-attestation.json": "generated:component-type-evidence-attestation",
  "runtime/react/src/index.ts": "generated:adoption-react-runtime-barrel",
  "runtime/react/src/generated-components.css": "generated:approved-component-styles",
  "catalog/src/catalog.tsx": "templates/adoption-catalog-react.tsx",
});
const TYPE_EVIDENCE_BODY_FIELDS = Object.freeze([
  "schemaVersion", "kind", "inventoryComplete", "inventoryDigest", "projectOutput", "sourceScanContract",
  "candidateClosure", "mappingClosure", "sourceFiles", "generatedFiles", "fileClosure",
]);
const TYPE_EVIDENCE_FIELDS = Object.freeze([...TYPE_EVIDENCE_BODY_FIELDS, "evidenceDigest"]);
const TYPE_EVIDENCE_PROVENANCE = Object.freeze({
  schemaVersion: 1,
  type: "component-type-evidence-attestation",
  workflow: "existing-system-adoption",
});
const require = createRequire(import.meta.url);

function dependencyRoot() {
  let current = dirname(require.resolve("react"));
  while (basename(current) !== "node_modules" && dirname(current) !== current) current = dirname(current);
  return basename(current) === "node_modules" ? dirname(current) : process.cwd();
}

function digest(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function prefixedDigest(buffer) {
  return `sha256:${digest(buffer)}`;
}

function exactFieldSet(value, fields) {
  return value && typeof value === "object" && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...fields].sort());
}

function outputArgument(argv) {
  const index = argv.indexOf("--output");
  if (index === -1) return DEFAULT_OUTPUT;
  if (!argv[index + 1]) throw new Error("--output requires a file path");
  return resolve(argv[index + 1]);
}

function isInsideOrEqual(root, candidate) {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
}

function safeRelativePosix(value) {
  return typeof value === "string"
    && value.length > 0
    && !value.includes("\\")
    && !/[\u0000-\u001f\u007f]/.test(value)
    && !isAbsolute(value)
    && !/^[A-Za-z]:/.test(value)
    && value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

async function configuredProjectRoot(lock) {
  if (!safeRelativePosix(lock?.output)) throw new Error("Design consultant lock has an invalid output path.");
  const segments = lock.output.split("/");
  const projectRoot = resolve(ROOT, ...segments.map(() => ".."));
  if (resolve(projectRoot, ...segments) !== resolve(ROOT)) {
    throw new Error("Design consultant lock output does not match the current generated output root.");
  }
  const canonicalProjectRoot = await realpath(projectRoot);
  const canonicalOutputRoot = await realpath(ROOT);
  if (resolve(canonicalProjectRoot, ...segments) !== canonicalOutputRoot) {
    throw new Error("Design consultant lock output resolves to a different generated output root.");
  }
  return canonicalProjectRoot;
}

async function ordinaryContainedFile(root, relativePath, label, extensions = null) {
  if (!safeRelativePosix(relativePath)) throw new Error(`${label} must be a safe relative POSIX path: ${relativePath}`);
  if (extensions && !extensions.has(extname(relativePath).toLowerCase())) {
    throw new Error(`${label} has an unsupported extension: ${relativePath}`);
  }
  const canonicalRoot = await realpath(root);
  const candidate = resolve(canonicalRoot, ...relativePath.split("/"));
  if (!isInsideOrEqual(canonicalRoot, candidate)) throw new Error(`${label} escapes its root: ${relativePath}`);
  let info;
  try {
    info = await lstat(candidate);
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`${label} is missing: ${relativePath}`);
    throw error;
  }
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`${label} must be an ordinary file: ${relativePath}`);
  const canonical = await realpath(candidate);
  if (!isInsideOrEqual(canonicalRoot, canonical) || canonical !== candidate) {
    throw new Error(`${label} resolves through a linked or non-canonical path: ${relativePath}`);
  }
  return canonical;
}

async function readJsonFile(path, label) {
  let source;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    throw new Error(`${label} could not be read: ${error.message}`);
  }
  try {
    return JSON.parse(source.replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new Error(`${label} is invalid JSON: ${error.message}`);
  }
}

async function readManagedArtifact(lock, relativePath, label, expectedSource, extensions = null) {
  const path = await ordinaryContainedFile(ROOT, relativePath, label, extensions);
  const content = await readFile(path);
  const entry = lock?.files?.[relativePath];
  if (!entry || entry.source !== expectedSource || entry.generatedHash !== digest(content)) {
    throw new Error(`${label} does not match its managed lock provenance.`);
  }
  return { path, content };
}

async function readManagedJson(lock, relativePath, label, expectedSource) {
  const artifact = await readManagedArtifact(lock, relativePath, label, expectedSource, new Set([".json"]));
  return { ...artifact, value: await readJsonFile(artifact.path, label) };
}

async function readLockOwnedJson(lock, relativePath, label, expectedSource) {
  const path = await ordinaryContainedFile(ROOT, relativePath, label, new Set([".json"]));
  if (lock?.files?.[relativePath]?.source !== expectedSource) throw new Error(`${label} does not match its lock ownership.`);
  return { path, content: await readFile(path), value: await readJsonFile(path, label) };
}

function importSpecifier(fromFile, targetFile) {
  const value = relative(dirname(fromFile), targetFile).split(sep).join("/");
  return value.startsWith(".") ? value : `./${value}`;
}

function operationalTokenSource(source) {
  if (source?.kind === "css-variable") return { kind: source.kind, name: source.name };
  if (source?.kind === "literal") return { kind: source.kind, value: source.value };
  if (source?.kind === "design-consultant") {
    return { kind: source.kind, token: source.token, cssVariable: source.cssVariable, value: source.value };
  }
  throw new Error("Confirmed token mapping has an unsupported source kind.");
}

function tokenMappingKey(mapping) {
  return JSON.stringify({
    canonicalToken: mapping.canonicalToken,
    canonicalCssVariable: mapping.canonicalCssVariable,
    source: operationalTokenSource(mapping.source),
    theme: mapping.theme,
    selector: mapping.selector,
    status: "confirmed",
    evidence: [...(mapping.evidence ?? [])].sort(),
    ...(mapping.fallback ? { fallback: operationalTokenSource(mapping.fallback) } : {}),
  });
}

function configuredTokenFiles(map, plan) {
  if (!map || typeof map !== "object" || Array.isArray(map) || !Array.isArray(map.mappings)) {
    throw new Error("Configured token bridge map must contain a mappings array.");
  }
  if (!plan || plan.status !== "confirmed" || !Array.isArray(plan.tokenMappings)) {
    throw new Error("Confirmed adoption plan must contain tokenMappings.");
  }
  const confirmed = plan.tokenMappings.filter((mapping) => mapping?.status === "confirmed");
  const byKey = new Map();
  for (const mapping of confirmed) {
    const key = tokenMappingKey(mapping);
    if (byKey.has(key)) throw new Error("Confirmed adoption plan contains a duplicate token mapping.");
    byKey.set(key, mapping);
  }
  const files = [];
  const seen = new Set();
  for (const [index, mapping] of map.mappings.entries()) {
    if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) throw new Error(`Token bridge mapping ${index} must be an object.`);
    const key = JSON.stringify(mapping);
    const planned = byKey.get(key);
    if (!planned || seen.has(key)) throw new Error(`Token bridge mapping ${index} does not match a unique confirmed plan mapping.`);
    seen.add(key);
    for (const source of [planned.source, planned.fallback]) {
      if (source?.kind === "css-variable") {
        if (typeof source.file !== "string") throw new Error(`Confirmed token mapping ${index} lacks its declared style file.`);
        files.push(source.file);
      }
    }
  }
  if (seen.size !== confirmed.length) throw new Error("Token bridge map omits a confirmed plan mapping.");
  return [...new Set(files)];
}

function withoutSourceExtension(path) {
  const extension = extname(path);
  return extension ? path.slice(0, -extension.length) : path;
}

function runtimeImportSpecifier(runtimeEntry, implementationPath) {
  const value = relative(dirname(runtimeEntry), withoutSourceExtension(implementationPath)).split(sep).join("/");
  return value.startsWith(".") ? value : `./${value}`;
}

async function ordinaryImplementationFile(root, path, label) {
  const canonicalRoot = await realpath(root);
  const absolute = resolve(path);
  if (!isInsideOrEqual(canonicalRoot, absolute)) throw new Error(`${label} escapes its allowed implementation root.`);
  let info;
  try { info = await lstat(absolute); } catch (error) { throw new Error(`${label} could not be read: ${error.message}`); }
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`${label} must be an ordinary implementation file.`);
  const canonical = await realpath(absolute);
  if (!isInsideOrEqual(canonicalRoot, canonical) || canonical !== absolute) throw new Error(`${label} uses a linked or non-canonical implementation path.`);
  return canonical;
}

async function typeEvidenceVerifier({ artifact, lock, plan, projectRoot }) {
  const entry = lock.files?.["components/type-evidence-attestation.json"];
  if (!exactFieldSet(entry, ["generatedHash", "provenance", "source", "templateHash"])
    || entry.source !== MANAGED_SOURCES["components/type-evidence-attestation.json"]
    || entry.templateHash !== null
    || !exactFieldSet(entry.provenance, Object.keys(TYPE_EVIDENCE_PROVENANCE))
    || Object.entries(TYPE_EVIDENCE_PROVENANCE).some(([key, value]) => entry.provenance[key] !== value)) {
    throw new Error("Component type evidence attestation has invalid managed lock provenance.");
  }
  const value = artifact.value;
  if (!exactFieldSet(value, TYPE_EVIDENCE_FIELDS)
    || value.schemaVersion !== 3
    || value.kind !== "design-consultant-component-type-evidence"
    || value.inventoryComplete !== true
    || value.inventoryDigest !== lock.adoption.inventoryDigest
    || value.projectOutput !== lock.output
    || JSON.stringify(value.mappingClosure) !== JSON.stringify(plan.componentMappings)) {
    throw new Error("Component type evidence attestation does not match the confirmed adoption facts.");
  }
  const body = Object.fromEntries(TYPE_EVIDENCE_BODY_FIELDS.map((field) => [field, value[field]]));
  if (value.evidenceDigest !== prefixedDigest(JSON.stringify(body))) {
    throw new Error("Component type evidence attestation digest is invalid.");
  }
  const sourceHashes = new Map();
  for (const file of value.sourceFiles ?? []) {
    if (!exactFieldSet(file, ["path", "sha256"]) || !safeRelativePosix(file.path)
      || !/^sha256:[a-f0-9]{64}$/.test(file.sha256) || sourceHashes.has(file.path)) {
      throw new Error("Component type evidence attestation contains malformed or duplicate source files.");
    }
    sourceHashes.set(file.path, file.sha256);
  }
  const closure = new Map();
  for (const file of value.fileClosure ?? []) {
    if (!exactFieldSet(file, ["path", "purpose", "scope", "sha256"])
      || !["project", "managed"].includes(file.scope)
      || !safeRelativePosix(file.path)
      || !/^sha256:[a-f0-9]{64}$/.test(file.sha256)
      || typeof file.purpose !== "string" || file.purpose.length === 0 || file.purpose.length > 1024) {
      throw new Error("Component type evidence attestation contains a malformed file closure entry.");
    }
    const root = file.scope === "project" ? projectRoot : ROOT;
    const absolute = await ordinaryImplementationFile(root, resolve(root, ...file.path.split("/")), `Attested ${file.scope} dependency ${file.path}`);
    if (closure.has(absolute)) throw new Error("Component type evidence attestation contains duplicate file closure paths or identities.");
    if (prefixedDigest(await readFile(absolute)) !== file.sha256) {
      throw new Error(`Attested dependency ${file.path} source bytes drifted from the managed Task 5 file closure.`);
    }
    closure.set(absolute, file);
  }
  if (closure.size === 0) throw new Error("Component type evidence attestation file closure is empty.");
  const verifyAttestedSource = async (relativePath, absolutePath, label) => {
    const expected = sourceHashes.get(relativePath);
    if (!expected || prefixedDigest(await readFile(absolutePath)) !== expected) {
      throw new Error(`${label} source bytes drifted from the managed Task 5 type evidence attestation.`);
    }
    if (!closure.has(absolutePath)) throw new Error(`${label} is missing from the managed Task 5 file closure.`);
  };
  return { closure, verifyAttestedSource };
}

async function componentProvenance({ manifest, adapterMap, runtimeEntry, runtimeSource, projectRoot, lock, verifyAttestedSource }) {
  if (!Array.isArray(manifest?.families) || manifest.families.length !== CANONICAL_COMPONENTS.length) {
    throw new Error("Component manifest must contain exactly the eight canonical families.");
  }
  if (adapterMap?.schemaVersion !== 1 || adapterMap.framework !== "react" || adapterMap.projectOutput !== lock.output || !Array.isArray(adapterMap.mappings)) {
    throw new Error("Component adapter map does not match the managed React adoption output.");
  }
  const active = adapterMap.mappings.filter((mapping) => mapping?.status === "confirmed");
  if (active.length !== CANONICAL_COMPONENTS.length) throw new Error("Component adapter map must contain exactly eight confirmed canonical mappings.");
  const generatedCount = active.filter((mapping) => mapping.strategy === "generate").length;
  if (manifest?.runtime?.framework !== "react"
    || manifest.runtime.language !== "typescript"
    || manifest.runtime.entry !== "runtime/react/src/index.ts"
    || manifest.runtime.adoption !== true
    || manifest.runtime.active !== CANONICAL_COMPONENTS.length
    || manifest.runtime.generated !== generatedCount
    || manifest.runtime.mapped !== CANONICAL_COMPONENTS.length - generatedCount) {
    throw new Error("Component manifest runtime facts do not match the managed React adoption runtime.");
  }
  const activeByFamily = new Map();
  for (const mapping of active) {
    if (!CANONICAL_COMPONENTS.some(([id]) => id === mapping.component) || activeByFamily.has(mapping.component) || !ACTIVE_COMPONENT_STRATEGIES.has(mapping.strategy)) {
      throw new Error("Component adapter map contains an unknown, duplicate, or invalid confirmed mapping.");
    }
    activeByFamily.set(mapping.component, mapping);
  }

  const provenance = {};
  const implementations = new Set();
  const implementationIdentities = new Set();
  const expectedBarrel = [];
  for (const [index, [id, exportName]] of CANONICAL_COMPONENTS.entries()) {
    const family = manifest.families[index];
    const mapping = activeByFamily.get(id);
    if (!family || family.id !== id || family.exportName !== exportName || !mapping || mapping.canonicalExport !== exportName) {
      throw new Error(`Component manifest family ${id} does not match its canonical export and adapter mapping.`);
    }
    const expectedStatus = mapping.strategy === "generate" ? "generated" : "mapped";
    const expectedAdapterPath = mapping.strategy === "wrapper"
      ? `${adapterMap.projectOutput}/${mapping.adapterPath}`
      : mapping.strategy === "manual" ? mapping.adapterPath : null;
    if (family.framework !== "react"
      || family.status !== expectedStatus
      || family.importPath !== "./runtime/react/src"
      || family.mappingStatus !== "confirmed"
      || family.sourceImplementationPath !== mapping.sourceImplementationPath
      || family.adapterPath !== expectedAdapterPath) {
      throw new Error(`Component ${exportName} manifest facts disagree with its confirmed runtime mapping.`);
    }
    const expectedOrigin = mapping.strategy === "generate"
      ? "design-consultant"
      : ["wrapper", "manual"].includes(mapping.strategy) ? "adapter" : "existing";
    if (!COMPONENT_ORIGINS.has(family.origin) || family.origin !== expectedOrigin) {
      throw new Error(`Component ${exportName} origin disagrees with its confirmed implementation strategy.`);
    }

    let implementationRelative;
    let implementationRoot;
    if (mapping.strategy === "direct") {
      if (typeof mapping.sourceImplementationPath !== "string" || !mapping.sourcePropsExport || mapping.adapterPath !== null || mapping.generatedPath !== null) {
        throw new Error(`Component ${exportName} has malformed direct implementation facts.`);
      }
      implementationRelative = relative(ROOT, resolve(projectRoot, ...mapping.sourceImplementationPath.split("/"))).split(sep).join("/");
      implementationRoot = projectRoot;
    } else if (mapping.strategy === "wrapper") {
      if (typeof mapping.sourceImplementationPath !== "string" || typeof mapping.adapterPath !== "string" || mapping.generatedPath !== null) {
        throw new Error(`Component ${exportName} has malformed wrapper implementation facts.`);
      }
      implementationRelative = mapping.adapterPath;
      implementationRoot = ROOT;
    } else if (mapping.strategy === "manual") {
      if (mapping.sourceImplementationPath !== null || typeof mapping.adapterPath !== "string" || mapping.generatedPath !== null) {
        throw new Error(`Component ${exportName} has malformed manual implementation facts.`);
      }
      implementationRelative = relative(ROOT, resolve(projectRoot, ...mapping.adapterPath.split("/"))).split(sep).join("/");
      implementationRoot = projectRoot;
    } else {
      if (mapping.sourceImplementationPath !== null || mapping.adapterPath !== null || typeof mapping.generatedPath !== "string") {
        throw new Error(`Component ${exportName} has malformed generated implementation facts.`);
      }
      implementationRelative = mapping.generatedPath;
      implementationRoot = ROOT;
    }
    if (family.implementationPath !== implementationRelative) throw new Error(`Component ${exportName} implementation path disagrees with the adapter map.`);
    const implementationAbsolute = resolve(ROOT, ...implementationRelative.split("/"));
    const canonicalImplementation = await ordinaryImplementationFile(implementationRoot, implementationAbsolute, `Component ${exportName}`);
    const implementationKey = canonicalImplementation.normalize("NFC").toLowerCase();
    const implementationInfo = await stat(canonicalImplementation, { bigint: true });
    const implementationIdentity = `${implementationInfo.dev.toString()}:${implementationInfo.ino.toString()}`;
    if (implementations.has(implementationKey) || implementationIdentities.has(implementationIdentity)) {
      throw new Error(`Component ${exportName} duplicates another implementation path or file identity.`);
    }
    implementations.add(implementationKey);
    implementationIdentities.add(implementationIdentity);
    const attestedRelative = mapping.strategy === "manual" ? mapping.adapterPath : mapping.sourceImplementationPath;
    if (attestedRelative) {
      const attestedAbsolute = mapping.strategy === "wrapper"
        ? await ordinaryImplementationFile(
          projectRoot,
          resolve(projectRoot, ...attestedRelative.split("/")),
          `Component ${exportName} wrapped source`,
        )
        : canonicalImplementation;
      await verifyAttestedSource(attestedRelative, attestedAbsolute, `Component ${exportName}`);
    }

    if (isInsideOrEqual(ROOT, canonicalImplementation)) {
      const relativeImplementation = relative(ROOT, canonicalImplementation).split(sep).join("/");
      const expectedManagedSource = mapping.strategy === "wrapper"
        ? `generated:component-wrapper:${exportName}`
        : mapping.strategy === "generate" ? `templates/react-runtime/src/${exportName}.tsx` : null;
      if (expectedManagedSource) {
        const entry = lock.files?.[relativeImplementation];
        if (!entry || entry.source !== expectedManagedSource || entry.generatedHash !== digest(await readFile(canonicalImplementation))) {
          throw new Error(`Component ${exportName} implementation does not match its managed lock provenance.`);
        }
      }
    }

    const specifier = runtimeImportSpecifier(runtimeEntry, canonicalImplementation);
    const runtimeExport = mapping.strategy === "direct" && mapping.sourceExport === "default"
      ? `default as ${exportName}`
      : exportName;
    expectedBarrel.push(`export { ${runtimeExport} } from ${JSON.stringify(specifier)};`);
    if (mapping.strategy !== "manual") expectedBarrel.push(`export type { ${exportName}Props } from ${JSON.stringify(specifier)};`);
    provenance[exportName] = family.origin;
  }
  const expectedRuntime = `${expectedBarrel.join("\n")}\n`;
  if (runtimeSource !== expectedRuntime) throw new Error("Canonical runtime barrel does not match the exact eight confirmed component implementations.");
  return provenance;
}

async function adoptionCatalogContext() {
  const lockPath = await ordinaryContainedFile(ROOT, ".design-consultant-lock.json", "design consultant lock", new Set([".json"]));
  const lock = await readJsonFile(lockPath, "design consultant lock");
  if (lock?.schemaVersion !== 1 || lock?.skill !== "design-consultant" || !lock.files || typeof lock.files !== "object" || Array.isArray(lock.files)) {
    throw new Error("Design consultant lock is not a managed schemaVersion 1 lock.");
  }
  const configPath = join(ROOT, "system.config.json");
  let configInfo;
  try { configInfo = await lstat(configPath); } catch (error) { throw new Error(`Managed system.config.json is missing: ${error.message}`); }
  if (!configInfo.isFile() || configInfo.isSymbolicLink()) throw new Error("system.config.json must be an ordinary file.");
  const config = await readJsonFile(configPath, "system.config.json");
  if (lock?.workflow === "greenfield") {
    if (config?.integration?.adoptionStrategy !== null) throw new Error("Greenfield lock conflicts with adoption system config.");
    return null;
  }
  if (lock?.workflow !== "existing-system-adoption") throw new Error("Design consultant lock has an unsupported or missing workflow.");
  if (!exactFieldSet(lock?.adoption, ["inventoryDigest", "plan", "projectIdentity", "status", "strategy"])
    || lock.adoption.status !== "confirmed"
    || !ADOPTION_STRATEGIES.has(lock.adoption.strategy)
    || !/^sha256:[a-f0-9]{64}$/.test(lock.adoption.inventoryDigest ?? "")
    || !PROJECT_IDENTITY_PATTERN.test(lock.adoption.projectIdentity ?? "")) {
    throw new Error("Adoption lock must contain the exact confirmed strategy, inventory, and project identity contract.");
  }
  const configArtifact = await readManagedArtifact(lock, "system.config.json", "system.config.json", MANAGED_SOURCES["system.config.json"], new Set([".json"]));
  if (configArtifact.path !== await realpath(configPath)) throw new Error("Managed system config path mismatch.");
  if (!ADOPTION_STRATEGIES.has(config?.integration?.adoptionStrategy) || config.integration.adoptionStrategy !== lock.adoption.strategy) {
    throw new Error("Adoption strategy differs between the managed lock and system config.");
  }
  if (config.integration.framework !== "React") {
    throw new Error("Adopted Catalog requires the managed system config to identify the React component runtime explicitly.");
  }

  const projectRoot = await configuredProjectRoot(lock);
  const tokenMapRelative = config.integration.tokenBridge;
  const bridgeRelative = config.sourceOfTruth?.runtimeTokens;
  const runtimeRelative = config.integration.sharedComponentExport;
  const manifestRelative = config.sourceOfTruth?.componentManifest;
  const adapterMapRelative = config.integration.componentAdapterMap;
  for (const [value, label] of [
    [tokenMapRelative, "integration.tokenBridge"],
    [bridgeRelative, "sourceOfTruth.runtimeTokens"],
    [runtimeRelative, "integration.sharedComponentExport"],
    [manifestRelative, "sourceOfTruth.componentManifest"],
    [adapterMapRelative, "integration.componentAdapterMap"],
  ]) {
    if (typeof value !== "string" || !value) throw new Error(`Adapted Catalog requires ${label}.`);
  }

  for (const [actual, expected, label] of [
    [tokenMapRelative, "tokens/external-map.json", "token bridge map"],
    [bridgeRelative, "tokens/external-bridge.css", "external token bridge"],
    [runtimeRelative, "runtime/react/src/index.ts", "canonical component runtime"],
    [manifestRelative, "components/manifest.json", "component manifest"],
    [adapterMapRelative, "components/adapter-map.json", "component adapter map"],
  ]) if (actual !== expected) throw new Error(`${label} must use its canonical managed path.`);

  const planArtifact = await readLockOwnedJson(lock, "adoption/adoption-plan.json", "adoption plan", MANAGED_SOURCES["adoption/adoption-plan.json"]);
  if (!exactAdoptionPlanBinding(lock.adoption.plan, planArtifact.content)
    || lock.files?.["adoption/adoption-plan.json"]?.generatedHash !== digest(planArtifact.content)
    || planArtifact.value.status !== "confirmed"
    || planArtifact.value.strategy !== lock.adoption.strategy
    || planArtifact.value.inventoryDigest !== lock.adoption.inventoryDigest) {
    throw new Error("Confirmed adoption plan strategy differs from the managed lock.");
  }
  const inventoryArtifact = await readLockOwnedJson(
    lock,
    "intake/extraction-report.json",
    "extraction report",
    MANAGED_SOURCES["intake/extraction-report.json"],
  );
  if (deriveProjectIdentity(inventoryArtifact.value) !== lock.adoption.projectIdentity) {
    throw new Error("Adoption project identity differs from the exact confirmed inventory facts.");
  }
  const typeEvidenceArtifact = await readManagedJson(
    lock,
    "components/type-evidence-attestation.json",
    "component type evidence attestation",
    MANAGED_SOURCES["components/type-evidence-attestation.json"],
  );
  const typeEvidence = await typeEvidenceVerifier({ artifact: typeEvidenceArtifact, lock, plan: planArtifact.value, projectRoot });
  const tokenMapArtifact = await readManagedJson(lock, tokenMapRelative, "token bridge map", MANAGED_SOURCES[tokenMapRelative]);
  const bridgeArtifact = await readManagedArtifact(lock, bridgeRelative, "external token bridge", MANAGED_SOURCES[bridgeRelative], new Set([".css"]));
  const runtimeArtifact = await readManagedArtifact(lock, runtimeRelative, "canonical component runtime", MANAGED_SOURCES[runtimeRelative], new Set([".js", ".jsx", ".ts", ".tsx"]));
  const manifestArtifact = await readManagedJson(lock, manifestRelative, "component manifest", MANAGED_SOURCES[manifestRelative]);
  const adapterMapArtifact = await readManagedJson(lock, adapterMapRelative, "component adapter map", MANAGED_SOURCES[adapterMapRelative]);
  const catalogArtifact = await readManagedArtifact(lock, "catalog/src/catalog.tsx", "Catalog source", MANAGED_SOURCES["catalog/src/catalog.tsx"], new Set([".tsx"]));
  const styleEntries = [];
  for (const styleRelative of configuredTokenFiles(tokenMapArtifact.value, planArtifact.value)) {
    const stylePath = await ordinaryContainedFile(projectRoot, styleRelative, "declared existing style", new Set([".css"]));
    await typeEvidence.verifyAttestedSource(styleRelative, stylePath, "Declared existing style");
    styleEntries.push(stylePath);
  }

  const runtimeStyles = config.sourceOfTruth?.componentRuntimeStyles == null
    ? null
    : (await readManagedArtifact(
      lock,
      config.sourceOfTruth.componentRuntimeStyles,
      "component runtime styles",
      MANAGED_SOURCES[config.sourceOfTruth.componentRuntimeStyles],
      new Set([".css"]),
    )).path;
  const source = renderAdoptionEntry({ styleEntries, bridgePath: bridgeArtifact.path, runtimeStyles });
  return {
    runtimeEntry: runtimeArtifact.path,
    styleRoots: [...styleEntries.map((path) => dirname(path)), dirname(bridgeArtifact.path), dirname(runtimeArtifact.path), dirname(BASE_ENTRY)],
    projectRoot,
    attestedClosure: typeEvidence.closure,
    infrastructure: new Map([
      [bridgeArtifact.path, bridgeArtifact.content],
      [catalogArtifact.path, catalogArtifact.content],
      [ADOPTION_ENTRY, Buffer.from(source, "utf8")],
    ]),
    provenance: await componentProvenance({
      manifest: manifestArtifact.value,
      adapterMap: adapterMapArtifact.value,
      runtimeEntry: runtimeArtifact.path,
      runtimeSource: runtimeArtifact.content.toString("utf8"),
      projectRoot,
      lock,
      verifyAttestedSource: typeEvidence.verifyAttestedSource,
    }),
    availability: catalogAvailability(manifestArtifact.value),
    source,
  };
}

function renderAdoptionEntry({ styleEntries, bridgePath, runtimeStyles }) {
  const lines = [
    "/* Generated by Design Consultant. Rebuild through catalog:build. */",
    ...styleEntries.map((path) => `import ${JSON.stringify(importSpecifier(ADOPTION_ENTRY, path))};`),
    `import ${JSON.stringify(importSpecifier(ADOPTION_ENTRY, bridgePath))};`,
    ...(runtimeStyles ? [`import ${JSON.stringify(importSpecifier(ADOPTION_ENTRY, runtimeStyles))};`] : []),
    'import * as DesignConsultantRuntime from "@design-consultant/runtime";',
    "void DesignConsultantRuntime;",
    'import "./catalog.tsx";',
    "",
  ];
  return lines.join("\n");
}

function cssInjection(source) {
  if (!source) return "";
  return `(()=>{const style=document.createElement("style");style.setAttribute("data-design-consultant-adoption","");style.textContent=${JSON.stringify(source)};document.head.append(style)})();`;
}

function splitResourceSpecifier(value) {
  const match = /^([^?#]*)([?#].*)?$/.exec(value);
  return { resource: match?.[1] ?? value, suffix: match?.[2] ?? "" };
}

async function containedCssResource(path, allowedRoots, label) {
  const absolute = resolve(path);
  const roots = allowedRoots
    .filter((root) => isInsideOrEqual(root, absolute))
    .sort((left, right) => right.length - left.length);
  if (roots.length === 0) throw new Error(`${label} is outside the allowed CSS dependency roots.`);
  const root = roots[0];
  let current = root;
  const segments = relative(root, absolute).split(sep).filter(Boolean);
  for (const [index, segment] of segments.entries()) {
    current = join(current, segment);
    let info;
    try { info = await lstat(current); } catch (error) { throw new Error(`${label} could not be read: ${error.message}`); }
    if (info.isSymbolicLink()) throw new Error(`${label} traverses a symbolic link, junction, or reparse point.`);
    if (index < segments.length - 1 && !info.isDirectory()) throw new Error(`${label} traverses a non-directory path segment.`);
    if (index === segments.length - 1 && !info.isFile()) throw new Error(`${label} must resolve to an ordinary file.`);
    const canonical = await realpath(current);
    if (!isInsideOrEqual(root, canonical) || canonical !== current) throw new Error(`${label} uses a linked or non-canonical path alias.`);
  }
  return absolute;
}

async function firstExistingLocalDependency(importer, resource) {
  const base = resolve(dirname(importer), resource);
  const candidates = [
    ...LOCAL_RESOLUTION_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...LOCAL_RESOLUTION_EXTENSIONS.slice(1).map((extension) => join(base, `index${extension}`)),
  ];
  for (const candidate of candidates) {
    try {
      const info = await lstat(candidate);
      if (info.isFile() || info.isSymbolicLink()) return candidate;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return null;
}

async function workerDependencies(content, path) {
  const module = await import("./adoption/evidence-attestation.mjs");
  return module.staticWorkerDependencies(content, path);
}

async function dependencyClosurePlugin(context, runtimeEntry) {
  const allowedRoots = [...new Set(await Promise.all((context?.styleRoots ?? []).map((root) => realpath(root))))];
  const observed = new Set();
  const workerQueue = [];
  const queuedWorkers = new Set();
  const queueWorker = (path) => {
    if (queuedWorkers.has(path)) return;
    if (queuedWorkers.size >= 1000) throw new Error("Catalog worker dependency graph exceeds the bounded entry limit.");
    queuedWorkers.add(path);
    workerQueue.push(path);
  };
  const plugin = {
    name: "design-consultant-dependency-closure",
    setup(api) {
      api.onResolve({ filter: /.*/ }, async (args) => {
        if (args.path === "@design-consultant/runtime") return { path: runtimeEntry };
        const { resource, suffix } = splitResourceSpecifier(args.path);
        const extension = extname(resource).toLowerCase();
        const cssDependency = args.kind === "import-rule" || extension === ".css";
        const assetDependency = args.kind === "url-token" || CSS_ASSET_EXTENSIONS.has(extension);
        if (!cssDependency && !assetDependency) {
          if (args.kind !== "entry-point" && (isAbsolute(resource) || /^[A-Za-z]:/.test(resource)
            || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(resource) || resource.startsWith("//"))) {
            throw new Error(`Local source dependency uses a forbidden absolute path, URL, or protocol: ${args.path}`);
          }
          return null;
        }
        if (!resource
          || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(resource)
          || resource.startsWith("//")
          || isAbsolute(resource)
          || /^[A-Za-z]:/.test(resource)) {
          throw new Error(`CSS ${args.kind} dependency uses a forbidden absolute path, URL, data value, or protocol: ${args.path}`);
        }
        if (cssDependency && extension !== ".css") throw new Error(`CSS import must resolve to a .css file: ${args.path}`);
        if (assetDependency && !cssDependency && !CSS_ASSET_EXTENSIONS.has(extension)) {
          throw new Error(`CSS url() asset type is not allowed: ${args.path}`);
        }
        const candidate = resolve(args.resolveDir || dirname(args.importer), resource);
        const attested = context?.attestedClosure?.get(candidate);
        if (attested) {
          const root = attested.scope === "project" ? context.projectRoot : ROOT;
          return { path: await ordinaryImplementationFile(root, candidate, `Attested CSS dependency ${args.path}`), suffix };
        }
        const canonical = await containedCssResource(candidate, allowedRoots, `CSS dependency ${args.path}`);
        return { path: canonical, suffix };
      });
      api.onLoad({ filter: /.*/ }, async (args) => {
        if (!context || args.path.split(sep).includes("node_modules")) return null;
        const absolute = resolve(args.path);
        const expected = context.attestedClosure.get(absolute);
        const infrastructure = context.infrastructure.get(absolute);
        if (!expected && infrastructure === undefined) {
          throw new Error(`Catalog dependency graph contains an unconfirmed local file outside the Task 5 file closure: ${absolute}`);
        }
        const canonical = expected
          ? await ordinaryImplementationFile(expected.scope === "project" ? context.projectRoot : ROOT, absolute, `Catalog dependency ${absolute}`)
          : absolute;
        const content = expected ? await readFile(canonical) : Buffer.from(infrastructure);
        if (expected && prefixedDigest(content) !== expected.sha256) {
          throw new Error(`Catalog dependency ${expected.path} bytes drifted from the Task 5 file closure.`);
        }
        const loader = LOCAL_LOADERS.get(extname(canonical).toLowerCase());
        if (!loader) throw new Error(`Catalog dependency has no approved loader: ${canonical}`);
        if (["js", "jsx", "ts", "tsx"].includes(loader)) {
          for (const workerSpecifier of await workerDependencies(content, canonical)) {
            const { resource } = splitResourceSpecifier(workerSpecifier);
            if (!resource || !resource.startsWith(".") || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(resource)
              || resource.startsWith("//") || isAbsolute(resource) || /^[A-Za-z]:/.test(resource)) {
              throw new Error(`Catalog rejects non-local worker dependency: ${workerSpecifier}`);
            }
            const candidate = await firstExistingLocalDependency(canonical, resource);
            if (!candidate) throw new Error(`Catalog worker dependency could not be resolved: ${workerSpecifier}`);
            const workerEvidence = context.attestedClosure.get(candidate);
            if (!workerEvidence) throw new Error(`Catalog worker dependency is outside the Task 5 file closure: ${candidate}`);
            const workerRoot = workerEvidence.scope === "project" ? context.projectRoot : ROOT;
            queueWorker(await ordinaryImplementationFile(workerRoot, candidate, `Catalog worker dependency ${workerSpecifier}`));
          }
        }
        if (expected) observed.add(canonical);
        return { contents: content, loader };
      });
    },
  };
  return {
    plugin,
    async verifyWorkers() {
      if (!context) return;
      while (workerQueue.length > 0) {
        const entry = workerQueue.shift();
        await build({
          absWorkingDir: dependencyRoot(),
          bundle: true,
          entryPoints: [entry],
          format: "esm",
          legalComments: "none",
          loader: { ".png": "dataurl", ".jpg": "dataurl", ".jpeg": "dataurl", ".gif": "dataurl", ".webp": "dataurl", ".svg": "dataurl", ".woff": "dataurl", ".woff2": "dataurl", ".ttf": "dataurl", ".otf": "dataurl" },
          logLevel: "silent",
          outdir: join(ROOT, ".catalog-worker-proof"),
          packages: "external",
          platform: "browser",
          plugins: [plugin],
          write: false,
        });
      }
    },
    assertComplete() {
      if (!context) return;
      const expected = [...context.attestedClosure.keys()].sort();
      const actual = [...observed].sort();
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        const missing = expected.filter((path) => !observed.has(path));
        const extra = actual.filter((path) => !context.attestedClosure.has(path));
        throw new Error(`Catalog dependency graph and Task 5 file closure differ (missing: ${missing.join(", ") || "none"}; extra: ${extra.join(", ") || "none"}).`);
      }
    },
  };
}

async function bundle(outfile, context, entrySource = null) {
  const runtimeEntry = context?.runtimeEntry ?? DEFAULT_RUNTIME_ENTRY;
  const availability = context?.availability ?? catalogAvailability(JSON.parse(await readFile(DEFAULT_MANIFEST, "utf8")));
  const closure = await dependencyClosurePlugin(context, runtimeEntry);
  const options = {
    absWorkingDir: dependencyRoot(),
    outfile,
    bundle: true,
    charset: "utf8",
    define: {
      "process.env.NODE_ENV": '"production"',
      __DC_COMPONENT_PROVENANCE__: JSON.stringify(context?.provenance ?? {}),
      __DC_COMPONENT_AVAILABILITY__: JSON.stringify(availability),
    },
    format: "iife",
    jsx: "automatic",
    legalComments: "none",
    logLevel: "silent",
    loader: { ".png": "dataurl", ".jpg": "dataurl", ".jpeg": "dataurl", ".gif": "dataurl", ".webp": "dataurl", ".woff": "dataurl", ".woff2": "dataurl", ".ttf": "dataurl", ".otf": "dataurl" },
    minifyIdentifiers: false,
    minifySyntax: true,
    minifyWhitespace: true,
    platform: "browser",
    sourcemap: false,
    target: ["es2020"],
    write: false,
    plugins: [closure.plugin],
  };
  if (entrySource === null) options.entryPoints = [context ? ADOPTION_ENTRY : BASE_ENTRY];
  else options.stdin = { contents: entrySource, resolveDir: dirname(ADOPTION_ENTRY), sourcefile: ADOPTION_ENTRY, loader: "tsx" };
  const result = await build(options);
  await closure.verifyWorkers();
  closure.assertComplete();
  const js = result.outputFiles.find((file) => extname(file.path) === ".js");
  const css = result.outputFiles.find((file) => extname(file.path) === ".css");
  if (!js) throw new Error("Catalog bundler did not emit JavaScript.");
  await mkdir(dirname(outfile), { recursive: true });
  await writeFile(outfile, Buffer.concat([Buffer.from(cssInjection(css?.text ?? ""), "utf8"), js.contents]));
}

async function writeGeneratedAdoptionEntry(source) {
  const parent = dirname(ADOPTION_ENTRY);
  const parentInfo = await lstat(parent);
  const canonicalParent = await realpath(parent);
  if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink() || canonicalParent !== parent || !isInsideOrEqual(ROOT, parent)) {
    throw new Error("Generated adoption entry directory is missing, linked, or outside the managed Catalog root.");
  }
  try {
    const info = await lstat(ADOPTION_ENTRY);
    const identity = await stat(ADOPTION_ENTRY, { bigint: true });
    if (!info.isFile() || info.isSymbolicLink() || identity.nlink !== 1n || await realpath(ADOPTION_ENTRY) !== ADOPTION_ENTRY) {
      throw new Error("Generated adoption entry must be an ordinary non-linked file identity.");
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const temporary = join(parent, `.adoption-entry-${randomUUID().replaceAll("-", "")}.tmp`);
  await writeFile(temporary, source, { encoding: "utf8", flag: "wx" });
  try {
    await rename(temporary, ADOPTION_ENTRY);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function prepareContext({ writeEntry }) {
  if (IS_SKILL_SOURCE) return null;
  const context = await adoptionCatalogContext();
  if (!context) return null;
  if (writeEntry) {
    await mkdir(dirname(ADOPTION_ENTRY), { recursive: true });
    await writeGeneratedAdoptionEntry(context.source);
  }
  return context;
}

async function runCheck() {
  const workspace = await mkdtemp(join(tmpdir(), "design-consultant-catalog-"));
  const candidate = join(workspace, "component-library.js");
  try {
    const context = await prepareContext({ writeEntry: false });
    await bundle(candidate, context, context?.source ?? null);
    let expected;
    let actual;
    try {
      [expected, actual] = await Promise.all([readFile(candidate), readFile(DEFAULT_OUTPUT)]);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      process.stdout.write(`${JSON.stringify({ status: "stale", output: DEFAULT_OUTPUT, reason: "missing-output" })}\n`);
      process.exitCode = 2;
      return;
    }
    let sourceCurrent = true;
    if (context) {
      try { sourceCurrent = (await readFile(ADOPTION_ENTRY, "utf8")) === context.source; } catch (error) { if (error.code === "ENOENT") sourceCurrent = false; else throw error; }
    }
    const status = expected.equals(actual) && sourceCurrent ? "current" : "stale";
    process.stdout.write(`${JSON.stringify({ status, output: DEFAULT_OUTPUT, digest: digest(actual), sourceCurrent })}\n`);
    if (status === "stale") process.exitCode = 2;
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

async function main() {
  const [command = "build", ...argv] = process.argv.slice(2);
  if (command === "build") {
    const output = outputArgument(argv);
    const context = await prepareContext({ writeEntry: true });
    await bundle(output, context);
    const content = await readFile(output);
    process.stdout.write(`${JSON.stringify({ status: "built", output, digest: digest(content), adoption: Boolean(context) })}\n`);
    return;
  }
  if (command === "check") {
    await runCheck();
    return;
  }
  throw new Error(`Unknown command: ${command}. Use build or check.`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
