#!/usr/bin/env node

import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(SCRIPT_PATH);
const DEFAULT_ROOT = resolve(SCRIPT_DIR, "..");
const root = resolve(process.argv[2] || DEFAULT_ROOT);
const issues = [];

function publicPath(path, base = root) {
  const value = relative(base, path).split(sep).join("/");
  return value || ".";
}

function addIssue(component, rule, file, message, fix) {
  issues.push({ component, rule, file, message, fix });
}

function hasStaticExport(source, exportName) {
  if (typeof source !== "string" || typeof exportName !== "string" || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(exportName)) return false;
  const escaped = exportName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `(?:export\\s+(?:function|class|const|let|var|interface|type)\\s+${escaped}\\b)|(?:export\\s*\\{[^}]*\\b${escaped}\\b[^}]*\\})`,
    "m",
  ).test(source);
}

function componentExportNames(component) {
  const names = Array.isArray(component?.exportNames) ? component.exportNames : [component?.exportName];
  return [...new Set(names.filter((name) => typeof name === "string" && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)))];
}

const AVAILABILITY_KINDS = Object.freeze(["runtime-ready", "evidence-only", "contract-only", "external-required"]);
const RUNTIME_METADATA_FIELDS = Object.freeze(["implementationPath", "importPath", "exportName", "framework", "status"]);

export function validateManifestAvailability(manifest) {
  const availabilityIssues = [];
  const summary = Object.fromEntries(AVAILABILITY_KINDS.map((kind) => [kind, 0]));
  const families = Array.isArray(manifest?.families) ? manifest.families : [];
  const seen = new Set();
  for (const family of families) {
    const component = typeof family?.id === "string" && family.id ? family.id : "unknown";
    if (seen.has(component)) availabilityIssues.push({ component, rule: "duplicate-family", message: "Component family id is duplicated." });
    seen.add(component);
    if (!AVAILABILITY_KINDS.includes(family?.availability)) {
      availabilityIssues.push({ component, rule: "availability-kind", message: "Component family must declare one supported availability class." });
      continue;
    }
    summary[family.availability] += 1;
    if (family.availability === "runtime-ready") {
      const metadataValid = family.framework === "react"
        && ["generated", "mapped"].includes(family.status)
        && RUNTIME_METADATA_FIELDS.slice(0, 3).every((field) => typeof family[field] === "string" && family[field])
        && Number.isInteger(family.coverage?.runtime)
        && family.coverage.runtime > 0;
      if (!metadataValid) availabilityIssues.push({ component, rule: "runtime-metadata", message: "Runtime-ready component lacks an importable implementation contract." });
      continue;
    }
    const exposesRuntimeImport = ["implementationPath", "importPath"].some((field) => typeof family[field] === "string" && family[field])
      || ["generated", "mapped"].includes(family.status)
      || (Number.isInteger(family.coverage?.runtime) && family.coverage.runtime > 0);
    if (exposesRuntimeImport) {
      availabilityIssues.push({ component, rule: "non-runtime-import", message: "Non-runtime component must not expose import or implementation metadata." });
    }
    if (family.availability === "evidence-only" && (!family.implementation_evidence || typeof family.implementation_evidence !== "object")) {
      availabilityIssues.push({ component, rule: "evidence-metadata", message: "Evidence-only component must identify its historical implementation evidence." });
    }
    if (family.availability === "external-required") {
      const policy = family.implementation_policy;
      if (!policy || policy.custom_implementation !== "forbidden" || !Array.isArray(policy.approved_adapters) || policy.approved_adapters.length === 0) {
        availabilityIssues.push({ component, rule: "external-policy", message: "External-required component must forbid custom implementations and name approved adapters." });
      }
    }
  }
  return { issues: availabilityIssues, summary };
}

function isInsideOrEqual(parent, child) {
  const value = relative(parent, child);
  return value === "" || (!value.startsWith("..") && !isAbsolute(value));
}

function safeRelativePosix(path) {
  return typeof path === "string"
    && path.length > 0
    && !path.includes("\\")
    && !isAbsolute(path)
    && path.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function safeContainedPath(base, value, component, rule) {
  if (!safeRelativePosix(value)) {
    addIssue(component, rule, String(value), "Path must be safe relative POSIX.", "Regenerate or reconfirm the path without unsafe segments.");
    return null;
  }
  const path = resolve(base, ...value.split("/"));
  if (!isInsideOrEqual(base, path)) {
    addIssue(component, rule, value, "Path escapes its lexical boundary.", "Regenerate or reconfirm a contained path.");
    return null;
  }
  return path;
}

async function readJson(path, component, rule, label, boundary = null) {
  try {
    const source = boundary === null
      ? await readFile(path, "utf8")
      : (await ordinaryContainedFile(path, boundary, component, rule))?.source;
    if (source === undefined) return null;
    return JSON.parse(source.replace(/^\uFEFF/, ""));
  } catch (error) {
    addIssue(component, rule, publicPath(path), `${label} could not be read: ${error.message}`, `Restore a valid ${publicPath(path)} file.`);
    return null;
  }
}

async function ordinaryContainedFile(path, boundary, component, rule) {
  try {
    const canonicalBoundary = await realpath(boundary);
    const resolvedPath = resolve(path);
    if (!isInsideOrEqual(resolve(boundary), resolvedPath)) {
      addIssue(component, rule, publicPath(resolvedPath, boundary), "Path escapes its lexical boundary.", "Use a path contained by the expected root.");
      return null;
    }
    const info = await lstat(resolvedPath);
    if (!info.isFile() || info.isSymbolicLink()) {
      addIssue(component, rule, publicPath(resolvedPath, boundary), "Path must be an ordinary file.", "Replace the path with a contained ordinary file.");
      return null;
    }
    const canonical = await realpath(resolvedPath);
    if (!isInsideOrEqual(canonicalBoundary, canonical)) {
      addIssue(component, rule, publicPath(resolvedPath, boundary), "Path resolves outside its canonical boundary.", "Use a realpath-contained file under the expected root.");
      return null;
    }
    return { path: canonical, source: await readFile(canonical, "utf8") };
  } catch (error) {
    addIssue(component, rule, publicPath(path, boundary), `Path could not be read: ${error.message}`, "Restore the confirmed runtime file or reconfirm the adoption plan.");
    return null;
  }
}

async function resolveAdoptionProjectRoot(adapterMap) {
  const output = adapterMap?.projectOutput;
  if (typeof output !== "string" || output.length === 0 || output.includes("\\") || isAbsolute(output)) {
    addIssue("runtime", "project-output", "components/adapter-map.json", "projectOutput must be a safe relative POSIX path.", "Regenerate the component adapter map from a confirmed plan.");
    return null;
  }
  const segments = output.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    addIssue("runtime", "project-output", "components/adapter-map.json", "projectOutput contains unsafe segments.", "Regenerate the component adapter map from a confirmed plan.");
    return null;
  }
  try {
    const canonicalRoot = await realpath(root);
    const candidate = resolve(canonicalRoot, ...segments.map(() => ".."));
    const projectRoot = await realpath(candidate);
    const expectedRoot = await realpath(resolve(projectRoot, ...segments));
    if (expectedRoot !== canonicalRoot || !isInsideOrEqual(projectRoot, canonicalRoot)) throw new Error("output root mismatch");
    return projectRoot;
  } catch (error) {
    addIssue("runtime", "project-output", "components/adapter-map.json", `Project root could not be resolved: ${error.message}`, "Run the checker from the generated adoption root.");
    return null;
  }
}

async function validateGenericRuntime(manifest, manifestPath, barrelPath, barrel, adoption) {
  const implementations = (manifest?.families ?? []).filter((component) =>
    component.framework === "react" && ["generated", "mapped"].includes(component.status),
  );
  for (const component of implementations) {
    const name = component.exportName || component.name || component.id;
    const exportNames = componentExportNames(component);
    if (!component.implementationPath) {
      addIssue(name, "implementation-path", publicPath(manifestPath), "Missing implementationPath.", "Record the live component implementation path.");
      continue;
    }
    const implementationPath = resolve(root, component.implementationPath);
    const file = await ordinaryContainedFile(implementationPath, adoption?.projectRoot ?? root, name, "implementation-path");
    if (!file) continue;
    if (!component.exportName || exportNames.length === 0 || !exportNames.includes(component.exportName)) {
      addIssue(name, "implementation-export", publicPath(file.path, adoption?.projectRoot ?? root), "Manifest exportNames does not contain a valid primary export.", "Keep exportName valid and include it in exportNames when the family exposes multiple APIs.");
    }
    for (const exportName of exportNames) {
      if (!hasStaticExport(file.source, exportName)) {
        addIssue(exportName, "implementation-export", publicPath(file.path, adoption?.projectRoot ?? root), `Source does not export ${exportName}.`, "Restore every named export declared by the manifest.");
      }
    }
    if (!component.importPath) addIssue(name, "import-path", publicPath(manifestPath), "Missing importPath.", "Record the canonical runtime barrel import path.");
    if (!Array.isArray(component.states) || component.states.length === 0) addIssue(name, "states", publicPath(manifestPath), "Missing states.", "Record verifiable component states.");
    if (!component.api?.props || Object.keys(component.api.props).length === 0) addIssue(name, "api-schema", publicPath(manifestPath), "Missing props API schema.", "Record the canonical public props contract.");
    for (const exportName of exportNames) {
      if (!new RegExp(`export\\s*\\{[^}]*\\b${exportName}\\b[^}]*\\}\\s*from`).test(barrel)) {
        addIssue(exportName, "barrel-export", publicPath(barrelPath), `Barrel does not export ${exportName}.`, "Export every confirmed family API from the canonical barrel.");
      }
    }
  }
  const declared = Number(manifest?.runtime?.generated) + Number(manifest?.runtime?.mapped);
  if (!adoption && manifest?.runtime?.framework === "react" && (!Number.isInteger(declared) || implementations.length !== declared)) {
    addIssue("runtime", "implementation-count", publicPath(manifestPath), `React runtime declares ${declared} implementations; found ${implementations.length}.`, "Align runtime counts with explicit runtime-ready manifest families.");
  }
  return implementations;
}

async function validateAdoptionRuntime(manifest, manifestPath, barrelPath, barrel) {
  const canonicalOutputRoot = await realpath(root);
  const {
    CANONICAL_COMPONENTS,
    buildAdoptionManifestTask5Fields,
    buildRuntimePlan,
    renderGeneratedComponentStyles,
    renderReactAdapter,
    renderRuntimeBarrel,
  } = await import("./adoption/component-adapters.mjs");
  const {
    TYPE_EVIDENCE_ATTESTATION_PATH,
    validateTypeEvidenceAttestation,
    validateTypeEvidenceLock,
  } = await import("./adoption/evidence-attestation.mjs");
  const adapterMapPath = resolve(root, "components/adapter-map.json");
  const planPath = resolve(root, "adoption/adoption-plan.json");
  const inventoryPath = resolve(root, "intake/extraction-report.json");
  const adapterMap = await readJson(adapterMapPath, "runtime", "adapter-map", "component adapter map", canonicalOutputRoot);
  const plan = await readJson(planPath, "runtime", "adoption-plan", "adoption plan", canonicalOutputRoot);
  const inventory = await readJson(inventoryPath, "runtime", "inventory", "extraction report", canonicalOutputRoot);
  if (!adapterMap || !plan || !inventory) return { projectRoot: root, implementations: [] };
  const projectRoot = await resolveAdoptionProjectRoot(adapterMap);
  if (!projectRoot) return { projectRoot: root, implementations: [] };

  let runtime;
  try {
    runtime = buildRuntimePlan({ strategy: plan.strategy, mappings: plan.componentMappings, inventory });
  } catch (error) {
    addIssue("runtime", "runtime-plan", publicPath(planPath), error.message, "Reconfirm every component candidate with the finite ComponentMappingV1 contract.");
    return { projectRoot, implementations: [] };
  }
  if (!runtime.enabled) addIssue("runtime", "runtime-plan", publicPath(planPath), "Manifest declares an adoption runtime but the confirmed plan has no active runtime.", "Remove dangling runtime artifacts or reconfirm an active mapping.");
  const configPath = resolve(root, "system.config.json");
  const config = await readJson(configPath, "runtime", "component-config", "system config", canonicalOutputRoot);
  const expectedStylesPointer = runtime.generatedComponents.length > 0 ? "runtime/react/src/generated-components.css" : null;
  if (config?.sourceOfTruth?.componentRuntimeStyles !== expectedStylesPointer) {
    addIssue("runtime", "component-config", publicPath(configPath), `sourceOfTruth.componentRuntimeStyles must equal ${expectedStylesPointer ?? "null"}.`, "Regenerate the conditional component runtime config pointers.");
  }

  const order = new Map(CANONICAL_COMPONENTS.map((component, index) => [component.id, index]));
  const activeByComponent = new Map(runtime.entries.map((entry) => [entry.component, entry]));
  const expectedMap = [...plan.componentMappings]
    .sort((left, right) => (
      (order.get(left.component) ?? 999) - (order.get(right.component) ?? 999)
      || `${left.status}:${left.source?.path ?? left.adapterPath ?? ""}:${left.source?.exportName ?? ""}`
        .localeCompare(`${right.status}:${right.source?.path ?? right.adapterPath ?? ""}:${right.source?.exportName ?? ""}`)
    ))
    .map((mapping) => {
      const definition = CANONICAL_COMPONENTS.find((component) => component.id === mapping.component);
      const active = activeByComponent.get(mapping.component);
      return {
        component: mapping.component,
        canonicalExport: definition.exportName,
        strategy: mapping.strategy,
        status: mapping.status,
        sourceImplementationPath: mapping.source?.path ?? null,
        sourceExport: mapping.source?.exportName ?? null,
        sourcePropsExport: mapping.source?.propsExport ?? null,
        adapterPath: mapping.strategy === "wrapper" ? active?.adapterPath ?? null : (mapping.strategy === "manual" ? mapping.adapterPath : null),
        generatedPath: mapping.strategy === "generate" ? active?.generatedPath ?? null : null,
        ...(mapping.api ? { api: mapping.api } : {}),
        ...(mapping.propMap ? { propMap: mapping.propMap } : {}),
      };
    });
  const expectedAdapterMap = {
    schemaVersion: 1,
    framework: "react",
    projectOutput: inventory.project.output,
    mappings: expectedMap,
  };
  if (JSON.stringify(adapterMap) !== JSON.stringify(expectedAdapterMap)) {
    addIssue("runtime", "adapter-map-drift", publicPath(adapterMapPath), "Confirmed adapter map entries differ from the adoption plan.", "Regenerate components/adapter-map.json from the confirmed plan.");
  }
  const expectedBarrel = renderRuntimeBarrel(runtime.entries);
  if (barrel !== expectedBarrel) {
    addIssue("runtime", "barrel-drift", publicPath(barrelPath), "Canonical barrel differs from the confirmed runtime plan.", "Regenerate the deterministic runtime barrel; do not add fallback exports.");
  }

  for (const mapping of runtime.directComponents) {
    const sourcePath = safeContainedPath(projectRoot, mapping.source.path, mapping.canonicalExport, "source-path");
    if (sourcePath) await ordinaryContainedFile(sourcePath, projectRoot, mapping.canonicalExport, "source-path");
  }
  for (const mapping of runtime.adapters) {
    const sourcePath = safeContainedPath(projectRoot, mapping.source.path, mapping.canonicalExport, "source-path");
    if (sourcePath) await ordinaryContainedFile(sourcePath, projectRoot, mapping.canonicalExport, "source-path");
    const adapterPath = safeContainedPath(canonicalOutputRoot, mapping.adapterPath, mapping.canonicalExport, "adapter-path");
    const adapter = adapterPath
      ? await ordinaryContainedFile(adapterPath, canonicalOutputRoot, mapping.canonicalExport, "adapter-path")
      : null;
    if (adapter && adapter.source !== renderReactAdapter(mapping)) {
      addIssue(mapping.canonicalExport, "adapter-drift", publicPath(adapter.path), "Generated wrapper differs from the confirmed finite prop map.", "Regenerate the wrapper from the confirmed mapping.");
    }
  }
  for (const mapping of runtime.manualComponents) {
    const manualPath = safeContainedPath(projectRoot, mapping.adapterPath, mapping.canonicalExport, "manual-adapter-path");
    if (manualPath) await ordinaryContainedFile(manualPath, projectRoot, mapping.canonicalExport, "manual-adapter-path");
  }
  const generatedSources = {};
  for (const mapping of runtime.generatedComponents) {
    const generatedPath = safeContainedPath(canonicalOutputRoot, mapping.generatedPath, mapping.canonicalExport, "generated-path");
    const generated = generatedPath
      ? await ordinaryContainedFile(generatedPath, canonicalOutputRoot, mapping.canonicalExport, "generated-path")
      : null;
    if (generated) generatedSources[mapping.generatedPath] = generated.source;
  }
  const lockPath = resolve(root, ".design-consultant-lock.json");
  const attestationPath = resolve(root, TYPE_EVIDENCE_ATTESTATION_PATH);
  const lockFile = await ordinaryContainedFile(lockPath, canonicalOutputRoot, "runtime", "runtime-type-evidence-lock");
  const attestationFile = await ordinaryContainedFile(attestationPath, canonicalOutputRoot, "runtime", "runtime-type-evidence");
  let lock = null;
  if (lockFile) {
    try {
      lock = JSON.parse(lockFile.source.replace(/^\uFEFF/, ""));
    } catch (error) {
      addIssue("runtime", "runtime-type-evidence-lock", publicPath(lockPath), `Adoption lock is invalid JSON: ${error.message}`, "Restore the generated adoption lock.");
    }
  }
  if (attestationFile) {
    const lockIssues = validateTypeEvidenceLock({ lock, attestationSource: attestationFile.source });
    for (const message of lockIssues) {
      addIssue("runtime", "runtime-type-evidence-lock", publicPath(lockPath), message, "Restore the lock-bound component type evidence attestation.");
    }
    if (lockIssues.length === 0) {
      try {
        const attestation = JSON.parse(attestationFile.source.replace(/^\uFEFF/, ""));
        for (const message of await validateTypeEvidenceAttestation({ projectRoot, outputRoot: root, inventory, plan, runtime, attestation })) {
          addIssue("runtime", "runtime-type-evidence", publicPath(attestationPath), message, "Re-run extract, reconfirm the mapping, and regenerate the type evidence attestation.");
        }
      } catch (error) {
        addIssue("runtime", "runtime-type-evidence", publicPath(attestationPath), error.message, "Restore contained ordinary source files and regenerate the confirmed runtime.");
      }
    }
  }

  const stylesPath = resolve(root, "runtime/react/src/generated-components.css");
  if (runtime.generatedComponents.length > 0) {
    const styles = await ordinaryContainedFile(stylesPath, canonicalOutputRoot, "runtime", "generated-styles");
    if (styles && styles.source !== renderGeneratedComponentStyles(runtime.generatedComponents)) {
      addIssue("runtime", "generated-styles-drift", publicPath(styles.path), "Generated component styles differ from the approved family set.", "Regenerate family-scoped component styles.");
    }
  } else {
    try {
      await lstat(stylesPath);
      addIssue("runtime", "generated-styles-unapproved", publicPath(stylesPath), "Mapped-only adoption must not contain generated component styles.", "Remove the unapproved generated stylesheet.");
    } catch (error) {
      if (error.code !== "ENOENT") addIssue("runtime", "generated-styles-unapproved", publicPath(stylesPath), error.message, "Restore a safe runtime layout.");
    }
  }

  const expectedRuntime = {
    framework: "react",
    language: "typescript",
    entry: "runtime/react/src/index.ts",
    adoption: true,
    active: runtime.entries.length,
    generated: runtime.generatedComponents.length,
    mapped: runtime.directComponents.length + runtime.adapters.length + runtime.manualComponents.length,
  };
  if (manifest?.schema_version !== "0.4" || JSON.stringify(manifest?.runtime) !== JSON.stringify(expectedRuntime)) {
    addIssue("runtime", "manifest-integrity", publicPath(manifestPath), "Task 5 manifest schema/runtime fields differ from the confirmed runtime.", "Regenerate the adoption-safe manifest.");
  }
  const expectedFamilies = buildAdoptionManifestTask5Fields({ runtime, projectRoot, outputRoot: root });
  const task5Fields = ["availability", "status", "framework", "exportName", "implementationPath", "importPath", "api", "states", "origin", "mappingStatus", "sourceImplementationPath", "adapterPath", "coverage"];
  const expectedFamilyIds = expectedFamilies.map((entry) => entry.id);
  const actualFamilyIds = Array.isArray(manifest?.families) ? manifest.families.map((entry) => entry?.id) : null;
  const exactFamilySetAndOrder = actualFamilyIds !== null
    && actualFamilyIds.length === expectedFamilyIds.length
    && new Set(actualFamilyIds).size === expectedFamilyIds.length
    && JSON.stringify(actualFamilyIds) === JSON.stringify(expectedFamilyIds);
  if (!exactFamilySetAndOrder) {
    addIssue("runtime", "manifest-integrity", publicPath(manifestPath), "Adoption manifest families must be the exact ordered set of eight canonical family IDs with no duplicates.", "Regenerate the adoption-safe manifest in canonical family order.");
  }
  for (const [index, expected] of expectedFamilies.entries()) {
    const family = exactFamilySetAndOrder ? manifest.families[index] : null;
    if (!family) {
      continue;
    }
    const actualFields = Object.fromEntries(task5Fields.map((field) => [
      field,
      Object.hasOwn(family, field) ? family[field] : "__missing_task5_field__",
    ]));
    if (JSON.stringify(actualFields) !== JSON.stringify(expected.fields)) {
      addIssue(expected.fields.exportName, "manifest-integrity", publicPath(manifestPath), "Task 5 manifest fields differ from reconstructed confirmed evidence.", "Regenerate every Task 5-owned manifest field from the confirmed plan.");
    }
  }
  const implementations = expectedFamilies.filter((entry) => entry.fields.implementationPath).map((entry) => entry.fields);
  return { projectRoot, implementations };
}

async function main() {
  let canonicalRoot;
  try {
    const rootInfo = await lstat(root);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error("runtime root must be an ordinary directory");
    canonicalRoot = await realpath(root);
  } catch (error) {
    addIssue("runtime", "runtime-root", publicPath(root), error.message, "Run the checker against the canonical generated output directory.");
    canonicalRoot = root;
  }
  const generatedLayout = await (async () => {
    try { return (await lstat(resolve(root, "components/manifest.json"))).isFile(); } catch { return false; }
  })();
  const manifestPath = generatedLayout ? resolve(root, "components/manifest.json") : resolve(root, "templates/component-manifest.json");
  const barrelPath = generatedLayout ? resolve(root, "runtime/react/src/index.ts") : resolve(root, "templates/react-runtime/src/index.ts");
  const manifest = await readJson(manifestPath, "runtime", "manifest", "component manifest", canonicalRoot);
  const availability = validateManifestAvailability(manifest);
  for (const issue of availability.issues) {
    addIssue(issue.component, issue.rule, publicPath(manifestPath), issue.message, "Declare the component as runtime-ready, evidence-only, contract-only, or external-required with the required metadata.");
  }
  let barrel = "";
  const barrelFile = await ordinaryContainedFile(barrelPath, canonicalRoot, "runtime", "barrel-entry");
  if (barrelFile) barrel = barrelFile.source;
  const adoptionMarker = await (async () => {
    try { return (await lstat(resolve(root, "components/adapter-map.json"))).isFile(); } catch { return false; }
  })();
  const adoption = adoptionMarker || manifest?.runtime?.adoption === true;
  const validation = adoption
    ? await validateAdoptionRuntime(manifest, manifestPath, barrelPath, barrel)
    : { implementations: await validateGenericRuntime(manifest, manifestPath, barrelPath, barrel, null) };
  issues.sort((left, right) => `${left.component}:${left.rule}:${left.file}`.localeCompare(`${right.component}:${right.rule}:${right.file}`));
  const implementations = validation.implementations;
  const result = {
    ok: issues.length === 0,
    layout: generatedLayout ? "generated-design-system" : "skill-source",
    root,
    summary: {
      implemented: implementations.length,
      generated: implementations.filter((item) => item.status === "generated").length,
      mapped: implementations.filter((item) => item.status === "mapped").length,
      availability: availability.summary,
    },
    issues,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) await main();
