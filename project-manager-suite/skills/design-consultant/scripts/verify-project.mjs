import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(SCRIPT_PATH);

const SYSTEM_SCRIPTS = Object.freeze({
  "design-consultant-system": [
    "tokens:check",
    "components:typecheck",
    "components:test",
    "adoption:check",
    "ui:check",
    "catalog:check",
    "visualization:check",
    "visual:test",
  ],
  "design-consultant-kit": [
    "tokens:check",
    "components:typecheck",
    "components:test",
    "adoption:check",
    "ui:check",
    "visualization:check",
  ],
  "design-consultant-adapted-system": [
    "adoption:check",
    "ui:check",
    "catalog:check",
    "visual:test",
  ],
});

export function verificationPlan(packageJson, profile = "final") {
  if (!["system", "product", "final"].includes(profile)) throw new Error(`未知验收 profile：${profile}`);
  const systemScripts = SYSTEM_SCRIPTS[packageJson?.name];
  if (!systemScripts) throw new Error(`不支持的设计系统 package：${packageJson?.name ?? "<missing>"}`);
  const ids = profile === "system"
    ? [...systemScripts]
    : profile === "product"
      ? ["product:acceptance"]
      : [...systemScripts, "product:acceptance"];
  for (const id of ids) {
    if (typeof packageJson.scripts?.[id] !== "string" || !packageJson.scripts[id].trim()) {
      throw new Error(`最终验收缺少必需 package script：${id}`);
    }
  }
  return ids.map((id) => ({ id, script: packageJson.scripts[id] }));
}

function runPackageScript(step, root) {
  const npmExecPath = process.env.npm_execpath;
  const command = npmExecPath ? process.execPath : (process.platform === "win32" ? "npm.cmd" : "npm");
  const args = npmExecPath
    ? [npmExecPath, "run", "--silent", step.id]
    : ["run", "--silent", step.id];
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  return { status: result.status ?? 1, signal: result.signal ?? null, error: result.error?.message ?? null };
}

export async function runVerification(packageJson, profile = "final", options = {}) {
  const root = resolve(options.root ?? join(SCRIPT_DIR, ".."));
  const runScript = options.runScript ?? ((step) => runPackageScript(step, root));
  const plan = verificationPlan(packageJson, profile);
  const completed = [];
  for (const step of plan) {
    options.onStep?.(step);
    const result = await runScript(step);
    completed.push({ id: step.id, status: result.status, signal: result.signal ?? null, error: result.error ?? null });
    if (result.status !== 0) return { ok: false, profile, failed: step.id, completed };
  }
  return { ok: true, profile, failed: null, completed };
}

async function main() {
  const profile = process.argv[2] || "final";
  if (process.argv.length > 3) throw new Error(`未知参数：${process.argv.slice(3).join(" ")}`);
  const root = resolve(SCRIPT_DIR, "..");
  const packageJson = JSON.parse((await readFile(join(root, "package.json"), "utf8")).replace(/^\uFEFF/, ""));
  const result = await runVerification(packageJson, profile, {
    root,
    onStep: (step) => process.stdout.write(`\n[design-consultant] ${step.id}\n`),
  });
  process.stdout.write(`\n${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
