import assert from "node:assert/strict";
import { lstat, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(SCRIPT_PATH);
const DEFAULT_CONFIG = join(SCRIPT_DIR, "product-acceptance.config.mjs");
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const IMPLEMENTATION_STATUSES = new Set(["planned", "in-progress", "implemented", "waived"]);

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} 必须是对象。`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.join("\0") !== wanted.join("\0")) {
    throw new Error(`${label} 字段必须严格为：${wanted.join(", ")}。`);
  }
}

function nonEmptyText(value, label, maximum = 300) {
  if (typeof value !== "string" || value !== value.trim() || !value || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`${label} 必须是非空、无控制字符的短文本。`);
  }
  return value;
}

function strictId(value, label) {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) throw new Error(`${label} 必须使用小写 kebab-case。`);
  return value;
}

function strictProjectPath(value, label) {
  nonEmptyText(value, label, 1024);
  if (isAbsolute(value) || value.includes("\\") || value.startsWith("/") || value.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`${label} 必须是项目根目录内的安全 POSIX 相对路径。`);
  }
  return value;
}

function strictBaseUrl(value, required) {
  if (value === null && !required) return null;
  if (typeof value !== "string") throw new Error("baseUrl 必须在执行产品验收前配置为 http(s) 地址。");
  let url;
  try { url = new URL(value); } catch { throw new Error("baseUrl 不是有效 URL。"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("baseUrl 必须是无凭据、无路径、无 query/hash 的 http(s) origin。");
  }
  return url.origin;
}

function strictRoute(value, label) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[?#\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`${label} 必须是同源绝对路径，且不能包含 query、hash 或反斜杠。`);
  }
  let decoded = value;
  for (let index = 0; index < 3; index += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      throw new Error(`${label} 包含无效 URL 编码。`);
    }
  }
  if (decoded.split("/").some((segment) => segment === "." || segment === "..") || decoded.includes("\\") || /[\u0000-\u001f\u007f]/.test(decoded)) {
    throw new Error(`${label} 不能包含编码后的穿越或控制字符。`);
  }
  return value;
}

function strictViewport(value, label) {
  exactKeys(value, ["height", "width"], label);
  if (!Number.isInteger(value.width) || value.width < 320 || value.width > 3840
    || !Number.isInteger(value.height) || value.height < 480 || value.height > 2160) {
    throw new Error(`${label} 必须使用 320-3840 宽、480-2160 高的整数像素。`);
  }
  return { width: value.width, height: value.height };
}

function strictStartCommand(value) {
  if (value === null) return null;
  exactKeys(value, ["args", "command", "cwd"], "startCommand");
  nonEmptyText(value.command, "startCommand.command", 1024);
  nonEmptyText(value.cwd, "startCommand.cwd", 1024);
  if (!Array.isArray(value.args) || value.args.some((entry) => typeof entry !== "string" || /[\u0000\r\n]/.test(entry))) {
    throw new Error("startCommand.args 必须是无换行的字符串数组。");
  }
  return { command: value.command, args: [...value.args], cwd: value.cwd };
}

export function validateAcceptanceDefinition(value, { requireExecutable = false } = {}) {
  exactKeys(value, ["baseUrl", "commitmentContract", "project", "scenarios", "schemaVersion", "startCommand"], "产品验收配置");
  if (value.schemaVersion !== 2) throw new Error("产品验收配置 schemaVersion 必须为 2。");
  const project = nonEmptyText(value.project, "project", 200);
  exactKeys(value.commitmentContract, ["commitments", "schemaVersion"], "commitmentContract");
  if (value.commitmentContract.schemaVersion !== 2) throw new Error("产品承诺契约 schemaVersion 必须为 2。");
  if (!Array.isArray(value.commitmentContract.commitments) || !Array.isArray(value.scenarios)) throw new Error("commitments 和 scenarios 必须是数组。");
  if (requireExecutable && value.commitmentContract.commitments.length === 0) throw new Error("最终验收至少需要一条来自 Composition Kit 的可执行承诺。");
  if (requireExecutable && value.scenarios.length === 0) throw new Error("最终验收至少需要一个产品场景。");
  const baseUrl = strictBaseUrl(value.baseUrl, requireExecutable || value.scenarios.length > 0);
  const startCommand = strictStartCommand(value.startCommand);

  const scenarioIds = new Set();
  const scenarios = value.scenarios.map((scenario, index) => {
    exactKeys(scenario, ["id", "route", "run", "title", "viewport"], `scenarios[${index}]`);
    const id = strictId(scenario.id, `scenarios[${index}].id`);
    if (scenarioIds.has(id)) throw new Error(`场景 id 重复：${id}。`);
    scenarioIds.add(id);
    if (typeof scenario.run !== "function") throw new Error(`场景 ${id} 的 run 必须是 async function。`);
    return {
      id,
      title: nonEmptyText(scenario.title, `场景 ${id} title`, 200),
      route: strictRoute(scenario.route, `场景 ${id} route`),
      viewport: strictViewport(scenario.viewport, `场景 ${id} viewport`),
      run: scenario.run,
    };
  });

  const commitmentIds = new Set();
  const referencedScenarios = new Set();
  const commitments = value.commitmentContract.commitments.map((commitment, index) => {
    exactKeys(commitment, ["codeRefs", "id", "implementationStatus", "required", "requirement", "scenarioIds", "source", "waiver"], `commitments[${index}]`);
    const id = strictId(commitment.id, `commitments[${index}].id`);
    if (commitmentIds.has(id)) throw new Error(`承诺 id 重复：${id}。`);
    commitmentIds.add(id);
    if (typeof commitment.required !== "boolean") throw new Error(`承诺 ${id} required 必须是布尔值。`);
    if (!IMPLEMENTATION_STATUSES.has(commitment.implementationStatus)) throw new Error(`承诺 ${id} implementationStatus 无效。`);
    if (!Array.isArray(commitment.codeRefs)) throw new Error(`承诺 ${id} codeRefs 必须是数组。`);
    const codeRefs = commitment.codeRefs.map((reference, referenceIndex) => {
      exactKeys(reference, ["anchor", "path"], `承诺 ${id} codeRefs[${referenceIndex}]`);
      return {
        path: strictProjectPath(reference.path, `承诺 ${id} codeRefs[${referenceIndex}].path`),
        anchor: nonEmptyText(reference.anchor, `承诺 ${id} codeRefs[${referenceIndex}].anchor`, 200),
      };
    });
    if (commitment.implementationStatus === "implemented" && codeRefs.length === 0) throw new Error(`承诺 ${id} 已标记 implemented，但没有代码位置。`);
    if (commitment.implementationStatus === "waived") {
      exactKeys(commitment.waiver, ["approvedBy", "reason"], `承诺 ${id} waiver`);
      nonEmptyText(commitment.waiver.reason, `承诺 ${id} waiver.reason`, 500);
      nonEmptyText(commitment.waiver.approvedBy, `承诺 ${id} waiver.approvedBy`, 200);
    } else if (commitment.waiver !== null) {
      throw new Error(`承诺 ${id} 只有 waived 状态可以填写 waiver。`);
    }
    if (requireExecutable && commitment.required && !["implemented", "waived"].includes(commitment.implementationStatus)) {
      throw new Error(`承诺 ${id} 仍处于 ${commitment.implementationStatus}，最终验收被阻断。`);
    }
    if (!Array.isArray(commitment.scenarioIds) || (commitment.implementationStatus !== "waived" && commitment.scenarioIds.length === 0)) throw new Error(`承诺 ${id} 至少要绑定一个场景。`);
    const linked = commitment.scenarioIds.map((scenarioId) => strictId(scenarioId, `承诺 ${id} scenarioIds`));
    if (new Set(linked).size !== linked.length) throw new Error(`承诺 ${id} 不能重复绑定同一场景。`);
    for (const scenarioId of linked) {
      if (!scenarioIds.has(scenarioId)) throw new Error(`承诺 ${id} 引用了不存在的场景 ${scenarioId}。`);
      referencedScenarios.add(scenarioId);
    }
    return {
      id,
      source: nonEmptyText(commitment.source, `承诺 ${id} source`, 200),
      requirement: nonEmptyText(commitment.requirement, `承诺 ${id} requirement`, 500),
      required: commitment.required,
      implementationStatus: commitment.implementationStatus,
      codeRefs,
      scenarioIds: linked,
      waiver: commitment.waiver,
    };
  });
  const unreferenced = [...scenarioIds].filter((id) => !referencedScenarios.has(id));
  if (unreferenced.length > 0) throw new Error(`存在未关联 Composition Kit 承诺的场景：${unreferenced.join(", ")}。`);

  return {
    status: commitments.length > 0 && scenarios.length > 0 ? "configured" : "not-configured",
    schemaVersion: 2,
    project,
    baseUrl,
    startCommand,
    commitments,
    scenarios,
    startCommandExecutable: false,
    startCommandPolicy: "manual-external-service-only",
  };
}

function isInsideOrEqual(path, root) {
  const value = relative(root, path);
  return value === "" || (!value.startsWith("..") && !isAbsolute(value));
}

export async function validateCommitmentCodeReferences(commitments, { projectRoot = process.cwd() } = {}) {
  const canonicalRoot = await realpath(resolve(projectRoot));
  for (const commitment of commitments) {
    if (commitment.implementationStatus !== "implemented") continue;
    for (const reference of commitment.codeRefs) {
      const candidate = resolve(canonicalRoot, ...reference.path.split("/"));
      if (!isInsideOrEqual(candidate, canonicalRoot)) throw new Error(`承诺 ${commitment.id} 的代码路径越出项目根目录：${reference.path}`);
      let info;
      try {
        info = await lstat(candidate);
      } catch (error) {
        throw new Error(`承诺 ${commitment.id} 的代码文件不存在：${reference.path} (${error.message})`);
      }
      if (!info.isFile() || info.isSymbolicLink()) throw new Error(`承诺 ${commitment.id} 的代码位置不是普通文件：${reference.path}`);
      const canonical = await realpath(candidate);
      if (canonical !== candidate || !isInsideOrEqual(canonical, canonicalRoot)) throw new Error(`承诺 ${commitment.id} 的代码位置不是项目内规范路径：${reference.path}`);
      const source = await readFile(canonical, "utf8");
      if (!source.includes(reference.anchor)) throw new Error(`承诺 ${commitment.id} 的代码文件缺少定位锚点 ${reference.anchor}：${reference.path}`);
    }
  }
  return true;
}

export async function loadAcceptanceDefinition(configPath = DEFAULT_CONFIG, options = {}) {
  const absolute = resolve(configPath);
  const info = await stat(absolute);
  if (!info.isFile()) throw new Error(`产品验收配置不是普通文件：${absolute}`);
  const module = await import(`${pathToFileURL(absolute).href}?mtime=${info.mtimeMs}`);
  if (!("default" in module)) throw new Error("产品验收配置必须 default export 一个配置对象。");
  const validated = validateAcceptanceDefinition(module.default, options);
  if (options.requireExecutable) await validateCommitmentCodeReferences(validated.commitments, options);
  return {
    definition: module.default,
    validated,
  };
}

function collectBrowserErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  page.on("requestfailed", (request) => errors.push(`request failed: ${request.url()} (${request.failure()?.errorText ?? "unknown"})`));
  page.on("response", (response) => { if (response.status() >= 500) errors.push(`${response.status()} ${response.url()}`); });
  return errors;
}

export async function runProductAcceptance(definition, options = {}) {
  const config = validateAcceptanceDefinition(definition, { requireExecutable: true });
  await validateCommitmentCodeReferences(config.commitments, options);
  const { chromium } = options.playwright ?? await import("playwright");
  const outputRoot = resolve(options.outputRoot ?? join(SCRIPT_DIR, "../output/product-acceptance"));
  await mkdir(outputRoot, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const report = [];
  try {
    for (const scenario of config.scenarios) {
      const context = await browser.newContext({ viewport: scenario.viewport, colorScheme: "light", reducedMotion: "reduce" });
      try {
        const page = await context.newPage();
        page.setDefaultTimeout(10000);
        const browserErrors = collectBrowserErrors(page);
        const target = new URL(scenario.route, config.baseUrl);
        await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: 15000 });
        await page.evaluate(() => document.fonts?.ready);
        const initial = new URL(page.url());
        if (initial.origin !== target.origin || initial.pathname !== target.pathname) {
          throw new Error(`场景 ${scenario.id} 未进入声明路由：${page.url()}`);
        }
        await scenario.run({ page, context, assert });
        if (page.isClosed()) throw new Error(`场景 ${scenario.id} 在验收结束前关闭了页面。`);
        const finalUrl = new URL(page.url());
        if (finalUrl.origin !== target.origin) throw new Error(`场景 ${scenario.id} 离开了配置 origin：${page.url()}`);
        const horizontalOverflow = await page.evaluate(() => (
          Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0) - document.documentElement.clientWidth
        ));
        if (horizontalOverflow > 1) throw new Error(`场景 ${scenario.id} 出现 ${horizontalOverflow}px 页面级横向溢出。`);
        if (browserErrors.length > 0) throw new Error(`场景 ${scenario.id} 出现浏览器错误：${browserErrors.join(" | ")}`);
        const screenshot = join(outputRoot, `${scenario.id}.png`);
        await page.screenshot({ path: screenshot, animations: "disabled", fullPage: true });
        report.push({ id: scenario.id, title: scenario.title, route: scenario.route, viewport: scenario.viewport, screenshot });
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  const result = {
    ok: true,
    project: config.project,
    commitments: config.commitments.map(({ id, source, requirement, required, implementationStatus, codeRefs, scenarioIds, waiver }) => ({
      id,
      source,
      requirement,
      required,
      implementationStatus,
      codeRefs,
      scenarioIds,
      waiver,
      verificationStatus: implementationStatus === "waived" ? "waived" : "verified",
    })),
    report,
    startCommandExecuted: false,
  };
  await writeFile(join(outputRoot, "report.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return result;
}

function parseCli(argv) {
  const command = argv[0] || "test";
  if (!["inspect", "test"].includes(command)) throw new Error(`未知产品验收命令：${command}`);
  let configPath = DEFAULT_CONFIG;
  let projectRoot = process.cwd();
  for (let index = 1; index < argv.length; index += 1) {
    if (argv[index] === "--config" && argv[index + 1]) {
      configPath = resolve(argv[index + 1]);
      index += 1;
      continue;
    }
    if (argv[index] === "--project-root" && argv[index + 1]) {
      projectRoot = resolve(argv[index + 1]);
      index += 1;
      continue;
    }
    throw new Error(`未知参数：${argv[index]}`);
  }
  return { command, configPath, projectRoot };
}

async function main() {
  const { command, configPath, projectRoot } = parseCli(process.argv.slice(2));
  const { definition, validated } = await loadAcceptanceDefinition(configPath, { requireExecutable: command === "test", projectRoot });
  const result = command === "inspect"
    ? {
        status: validated.status,
        project: validated.project,
        commitments: validated.commitments.length,
        scenarios: validated.scenarios.map(({ id, title, route, viewport }) => ({ id, title, route, viewport })),
        startCommandExecutable: false,
      }
    : await runProductAcceptance(definition, { projectRoot });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
