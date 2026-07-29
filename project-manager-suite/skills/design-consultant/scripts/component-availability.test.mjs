import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { validateManifestAvailability } from "./check-component-runtime.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(SCRIPT_DIR, "../templates/component-manifest.json");

async function readManifest() {
  return JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
}

test("component manifest assigns one explicit availability class to every family", async () => {
  const manifest = await readManifest();
  const result = validateManifestAvailability(manifest);

  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.summary, {
    "runtime-ready": 23,
    "evidence-only": 0,
    "contract-only": 3,
    "external-required": 1,
  });
});

test("component availability validation fails closed for ambiguous metadata", async () => {
  const manifest = await readManifest();

  const missingKind = structuredClone(manifest);
  delete missingKind.families[0].availability;
  assert.ok(validateManifestAvailability(missingKind).issues.some((issue) => issue.rule === "availability-kind"));

  const evidenceWithImport = structuredClone(manifest);
  const evidence = evidenceWithImport.families.find((family) => family.id === "multi-select-field");
  evidence.availability = "evidence-only";
  assert.ok(validateManifestAvailability(evidenceWithImport).issues.some((issue) => issue.rule === "non-runtime-import"));

  const runtimeWithoutPath = structuredClone(manifest);
  const runtime = runtimeWithoutPath.families.find((family) => family.availability === "runtime-ready");
  delete runtime.implementationPath;
  assert.ok(validateManifestAvailability(runtimeWithoutPath).issues.some((issue) => issue.rule === "runtime-metadata"));

  const externalWithoutPolicy = structuredClone(manifest);
  const external = externalWithoutPolicy.families.find((family) => family.availability === "external-required");
  delete external.implementation_policy;
  assert.ok(validateManifestAvailability(externalWithoutPolicy).issues.some((issue) => issue.rule === "external-policy"));
});
