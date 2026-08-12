#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROVENANCE = Object.freeze({ schemaVersion: 1, type: "greenfield-init", skillVersion: "0.10.0" });
const MANAGED_PATH = "checks/check-adoption-contract.mjs";
const MANAGED_SOURCE = "scripts/check-greenfield-adoption.mjs";

function digest(content) {
  return createHash("sha256").update(content).digest("hex");
}

function exact(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === Object.keys(expected).sort().join(",")
    && Object.entries(expected).every(([key, expectedValue]) => value[key] === expectedValue);
}

function parseRoot(argv) {
  let root = process.cwd();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--root") {
      if (!argv[index + 1]) throw new Error("--root requires a path");
      root = argv[index + 1];
      index += 1;
    } else if (argument.startsWith("-")) throw new Error(`Unknown option ${argument}`);
    else root = argument;
  }
  return resolve(root);
}

async function validate(root) {
  const canonicalRoot = await realpath(root);
  const lockPath = join(canonicalRoot, ".design-consultant-lock.json");
  const checkerPath = join(canonicalRoot, MANAGED_PATH);
  if (!(await lstat(lockPath)).isFile() || !(await lstat(checkerPath)).isFile()) throw new Error("greenfield lock and checker must be ordinary files");
  const [lockRaw, checkerRaw] = await Promise.all([readFile(lockPath, "utf8"), readFile(checkerPath)]);
  const lock = JSON.parse(lockRaw.replace(/^\uFEFF/, ""));
  const entry = lock?.files?.[MANAGED_PATH];
  if (lock.schemaVersion !== 1 || lock.workflow !== "greenfield" || !exact(lock.workflowProvenance, PROVENANCE)) {
    throw new Error("greenfield adoption applicability requires exact trusted init provenance");
  }
  if (!entry || entry.source !== MANAGED_SOURCE || entry.generatedHash !== digest(checkerRaw)) {
    throw new Error("greenfield adoption checker does not match its managed lock entry");
  }
  return { ok: true, mode: "generated-system", status: "not-applicable", workflow: "greenfield", issues: [], root: canonicalRoot };
}

export async function validateAdoptionContract(root) {
  try {
    return await validate(resolve(root));
  } catch (error) {
    return { ok: false, mode: "generated-system", issues: [{ rule: "invalid-greenfield-adoption-context", message: error.message }] };
  }
}

async function main() {
  const result = await validateAdoptionContract(parseRoot(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
