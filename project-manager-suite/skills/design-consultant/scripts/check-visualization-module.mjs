#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeTextContent } from "./text-content.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const MODULE_ROOT = resolve(process.argv[2] || resolve(SCRIPT_DIR, ".."));
const issues = [];

const GALLERY_FILES = [
  "lupi-gallery.html",
  "basics-gallery.html",
  "glance-gallery.html",
  "big-circular.html",
  "big-force.html",
  "big-threads.html",
];

const EXPECTED_COUNTS = { lupi: 15, basics: 12, glance: 18, interactive: 3 };
const EXPECTED_PALETTE_MODE = "design-consultant-editorial-utility";
const REQUIRED_VISUALIZATION_TOKENS = [
  "--viz-accent-strong",
  "--viz-accent",
  "--viz-accent-mid",
  "--viz-accent-soft",
  "--viz-accent-subtle",
  "--viz-accent-area",
  "--viz-accent-on-dark-strong",
  "--viz-accent-on-dark",
  "--viz-accent-on-dark-mid",
  "--viz-accent-on-dark-soft",
  "--viz-accent-on-dark-subtle",
  "--viz-accent-on-dark-area",
  "--viz-grid",
  "--viz-reference",
];

async function readOptional(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function resolveLayout() {
  const sourceManifest = resolve(MODULE_ROOT, "templates/visualization-manifest.json");
  if (await readOptional(sourceManifest)) {
    return {
      kind: "skill-source",
      manifest: sourceManifest,
      preview: resolve(MODULE_ROOT, "templates/component-library.html"),
      catalogSource: resolve(MODULE_ROOT, "templates/catalog-react.tsx"),
      catalogBundle: resolve(MODULE_ROOT, "templates/component-library.js"),
      tokens: resolve(MODULE_ROOT, "templates/tokens.css"),
      galleryRoot: resolve(MODULE_ROOT, "templates/visualization-lieflat"),
      upstream: resolve(MODULE_ROOT, "vendor/lieflat-charts/UPSTREAM.json"),
      vendorRoot: resolve(MODULE_ROOT, "vendor/lieflat-charts"),
    };
  }
  return {
    kind: "generated-design-system",
    manifest: resolve(MODULE_ROOT, "visualizations/manifest.json"),
    preview: resolve(MODULE_ROOT, "catalog/component-library.html"),
    catalogSource: resolve(MODULE_ROOT, "catalog/src/catalog.tsx"),
    catalogBundle: resolve(MODULE_ROOT, "catalog/component-library.js"),
    tokens: resolve(MODULE_ROOT, "tokens/tokens.css"),
    galleryRoot: resolve(MODULE_ROOT, "visualizations/lieflat"),
    upstream: resolve(MODULE_ROOT, "visualizations/lieflat/UPSTREAM.json"),
    vendorRoot: null,
  };
}

function addIssue(condition, message) {
  if (!condition) issues.push(message);
}

function digest(content) {
  return createHash("sha256").update(normalizeTextContent(content)).digest("hex");
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function executableSurface(html) {
  const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]);
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
  return stripComments([...styles, ...scripts].join("\n"));
}

function externalScriptSources(html) {
  return [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)]
    .map((match) => match[1])
    .filter((source) => /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(source));
}

function publicPath(path) {
  return relative(MODULE_ROOT, path).replaceAll("\\", "/");
}

const layout = await resolveLayout();
const [manifestText, preview, catalogSource, catalogBundle, tokens, theme, upstreamText, runtimeText] = await Promise.all([
  readOptional(layout.manifest),
  readOptional(layout.preview),
  readOptional(layout.catalogSource),
  readOptional(layout.catalogBundle),
  readOptional(layout.tokens),
  readOptional(resolve(layout.galleryRoot, "lieflat-theme.js")),
  readOptional(layout.upstream),
  readOptional(resolve(layout.galleryRoot, "runtime/RUNTIME.json")),
]);

if (!manifestText) issues.push(`manifest 缺失：${publicPath(layout.manifest)}`);
if (!preview) issues.push(`统一 Catalog 缺失：${publicPath(layout.preview)}`);
if (!catalogSource && !catalogBundle) issues.push(`Catalog React 实现缺失：${publicPath(layout.catalogSource)}`);
if (!tokens) issues.push(`tokens.css 缺失：${publicPath(layout.tokens)}`);
if (!theme) issues.push(`Lieflat 主题桥缺失：${publicPath(resolve(layout.galleryRoot, "lieflat-theme.js"))}`);
if (!upstreamText) issues.push(`UPSTREAM.json 缺失：${publicPath(layout.upstream)}`);
if (!runtimeText) issues.push(`本地运行时清单缺失：${publicPath(resolve(layout.galleryRoot, "runtime/RUNTIME.json"))}`);

let manifest = null;
let upstream = null;
let runtime = null;
try {
  if (manifestText) manifest = JSON.parse(manifestText);
} catch (error) {
  issues.push(`manifest JSON 无法解析：${error.message}`);
}
try {
  if (upstreamText) upstream = JSON.parse(upstreamText);
} catch (error) {
  issues.push(`UPSTREAM.json 无法解析：${error.message}`);
}
try {
  if (runtimeText) runtime = JSON.parse(runtimeText);
} catch (error) {
  issues.push(`RUNTIME.json 无法解析：${error.message}`);
}

if (manifest) {
  addIssue(manifest.schemaVersion === 2, "manifest.schemaVersion 必须为 2");
  addIssue(manifest.module === "data-visualization", "manifest.module 必须为 data-visualization");
  addIssue(manifest.implementation === "authorized-vendored", "manifest 必须记录 authorized-vendored 实现模式");
  addIssue(manifest.runtimeContract?.mode === "pinned-local", "manifest 必须声明 pinned-local 图表运行时");
  addIssue(
    manifest.paletteContract?.mode === EXPECTED_PALETTE_MODE,
    `manifest.paletteContract.mode must be ${EXPECTED_PALETTE_MODE}`,
  );
  addIssue(
    manifest.paletteContract?.rolePolicy?.dataMarks?.strategy === "single-root-tonal-ramp",
    "manifest 必须声明单色根数据色阶策略",
  );
  addIssue(
    manifest.paletteContract?.rolePolicy?.areaFill?.strategy === "flat-tonal-fill",
    "manifest 必须声明平面同源面积填充策略",
  );
  addIssue(
    manifest.paletteContract?.rolePolicy?.structure?.strategy === "neutral-only",
    "manifest 必须声明中性结构线策略",
  );
  for (const token of ["--viz-grid", "--viz-reference"]) {
    addIssue(
      manifest.paletteContract?.rolePolicy?.structure?.tokens?.includes(token),
      `manifest 中性结构策略缺少 ${token}`,
    );
  }
  addIssue(manifest.provenance?.commit === upstream?.commit, "manifest 与 UPSTREAM.json 的 commit 不一致");
  addIssue(Array.isArray(manifest.presets) && manifest.presets.length === 48, `preset 总数必须为 48，当前为 ${manifest.presets?.length || 0}`);

  const ids = new Set();
  for (const preset of manifest.presets || []) {
    addIssue(Boolean(preset.id && preset.name && preset.system && preset.sourceTemplate), `preset 缺少必要字段：${preset.id || "<missing-id>"}`);
    addIssue(!ids.has(preset.id), `preset id 重复：${preset.id}`);
    ids.add(preset.id);
  }
  for (const [system, expected] of Object.entries(EXPECTED_COUNTS)) {
    const actual = (manifest.presets || []).filter((preset) => preset.system === system).length;
    addIssue(actual === expected, `${system} 应有 ${expected} 个 preset，当前为 ${actual}`);
  }
}

const paletteTokens = tokens
  ? new Set([...tokens.matchAll(/--viz-editorial-c-([0-9a-f]{6})\s*:/gi)].map((match) => match[1].toUpperCase()))
  : new Set();
if (manifest) {
  addIssue(paletteTokens.size === manifest.paletteContract?.colorCount, `editorial token 数量应为 ${manifest.paletteContract?.colorCount}，当前为 ${paletteTokens.size}`);
}
for (const alias of ["ink", "paper", "muted", "faint", "grid"]) {
  addIssue(tokens?.includes(`--viz-editorial-${alias}:`), `缺少 editorial alias：--viz-editorial-${alias}`);
}
for (const token of REQUIRED_VISUALIZATION_TOKENS) {
  addIssue(tokens?.includes(`${token}:`), `缺少可视化语义 token：${token}`);
}
for (const color of paletteTokens) {
  addIssue(theme?.includes(`"${color}"`), `主题桥缺少色值映射：${color}`);
}
for (const token of REQUIRED_VISUALIZATION_TOKENS) {
  addIssue(theme?.includes(token), `主题桥没有读取语义 token：${token}`);
}
for (const adapter of ["normalDataRamp", "inverseDataRamp", "mapMarkColor", "mapLineColor", "mapSvgDataColor", "areaColor"]) {
  addIssue(theme?.includes(adapter), `主题桥缺少角色化颜色适配：${adapter}`);
}
addIssue(theme?.includes("accentEChartsOption") && theme?.includes("accentChartConfig"), "主题桥缺少 ECharts 或 Chart.js 重点色适配器");
addIssue(theme?.includes("accentSvgShape"), "主题桥缺少 SVG 重点色适配器");

const galleryResults = [];
for (const file of GALLERY_FILES) {
  const path = resolve(layout.galleryRoot, file);
  const html = await readOptional(path);
  if (!html) {
    issues.push(`gallery 缺失：${publicPath(path)}`);
    continue;
  }
  addIssue(html.includes("data-design-consultant-tokens"), `${file} 未接入 tokens.css`);
  addIssue(html.includes('src="lieflat-theme.js"'), `${file} 未接入 lieflat-theme.js`);
  addIssue(html.includes("font-family:var(--font-sans)"), `${file} must use the shared Editorial Utility font tokens`);
  addIssue(html.includes(".card.dark{background:var(--surface-inverse)"), `${file} must use the shared inverse surface`);
  addIssue(html.includes(".sub,.src{color:var(--text-muted)"), `${file} must use shared semantic metadata colors`);
  addIssue(html.includes("data-embedded"), `${file} must support the shared embedded Catalog shell`);
  const remoteScripts = externalScriptSources(html);
  addIssue(remoteScripts.length === 0, `${file} must use local script sources; found ${remoteScripts.join(", ")}`);
  addIssue(html.includes("const C=window.DC_LIEFLAT_COLORS"), `${file} 的绘图代码未使用主题桥`);
  addIssue(html.includes("DC_LIEFLAT_THEME.installAdapters"), `${file} 未安装语义重点色适配器`);
  addIssue(!/#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/i.test(executableSurface(html)), `${file} 的可执行样式或脚本仍有未桥接色值`);
  if (file.endsWith("gallery.html")) {
    addIssue(html.includes("IntersectionObserver"), `${file} 缺少滚动 reveal`);
    addIssue(/addEventListener\(['"]click['"]/.test(html), `${file} 缺少点击重播`);
  }
  if (file === "big-threads.html") {
    addIssue(html.includes("pinned"), "big-threads.html 缺少点击固定状态");
    addIssue(html.includes("hit"), "big-threads.html 缺少路径命中层");
    addIssue(html.includes("data-design-consultant-keyboard"), "big-threads.html 缺少键盘等价操作增强");
    addIssue(html.includes('target.setAttribute("tabindex", "0")'), "big-threads.html 路径与节点不可聚焦");
    addIssue(html.includes('event.key === "Escape"'), "big-threads.html 缺少 Escape 释放操作");
  }
  galleryResults.push({ file, bytes: Buffer.byteLength(html), tokenBridged: true });
}

if (runtime?.dependencies) {
  for (const dependency of runtime.dependencies) {
    const path = resolve(layout.galleryRoot, "runtime", dependency.file);
    const content = await readOptional(path);
    addIssue(Boolean(content), `本地运行时缺失：${publicPath(path)}`);
    if (content) addIssue(digest(content) === dependency.sha256, `本地运行时哈希漂移：${dependency.file}`);
  }
}

if (preview) {
  addIssue(preview.includes("catalog-foundation.css"), "Catalog must load the shared foundation stylesheet");
  addIssue(preview.includes("tokens.css"), "Catalog must load the shared token source");
  addIssue(preview.includes('id="catalogRoot"') && preview.includes("component-library.js"), "Catalog HTML must remain a React mount shell");
}

const catalogImplementation = catalogSource || catalogBundle;
if (catalogImplementation) {
  for (const file of GALLERY_FILES) addIssue(catalogImplementation.includes(file), `统一 Catalog 没有入口：${file}`);
  addIssue(catalogImplementation.includes("visualizationSubmenu"), "统一 Catalog 缺少可视化二级菜单");
  addIssue(catalogImplementation.includes("catalog-nav-section") && catalogImplementation.includes("visualizationViews.map"), "统一 Catalog 缺少可视化分组导航");
  addIssue(catalogImplementation.includes("catalog-visualization") && catalogImplementation.includes("data-catalog-item"), "可视化预览没有整合进组件 Catalog");
  addIssue(catalogImplementation.includes("48 个模板"), "统一 Catalog 没有标明 48 个可视化模板");
  addIssue(catalogImplementation.includes("Visualization Tone / Structure"), "Catalog 缺少数据色阶与中性结构角色说明");
  addIssue(catalogImplementation.includes("data-token-value") && catalogImplementation.includes("--viz-grid"), "Catalog 缺少中性结构线 token 样本");
}

if (layout.vendorRoot && upstream?.files) {
  for (const [file, expectedHash] of Object.entries(upstream.files)) {
    const content = await readFile(resolve(layout.vendorRoot, file), "utf8");
    addIssue(digest(content) === expectedHash, `vendored 上游文件已漂移：${file}`);
  }
}

const result = {
  ok: issues.length === 0,
  layout: layout.kind,
  root: MODULE_ROOT,
  upstreamCommit: upstream?.commit || null,
  summary: manifest
    ? {
        presets: manifest.presets?.length || 0,
        galleries: galleryResults.length,
        editorialColors: paletteTokens.size,
        runtimeDependencies: runtime?.dependencies?.length || 0,
      }
    : null,
  files: {
    manifest: publicPath(layout.manifest),
    preview: publicPath(layout.preview),
    catalogSource: publicPath(layout.catalogSource),
    catalogBundle: publicPath(layout.catalogBundle),
    galleryRoot: publicPath(layout.galleryRoot),
  },
  issues,
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
