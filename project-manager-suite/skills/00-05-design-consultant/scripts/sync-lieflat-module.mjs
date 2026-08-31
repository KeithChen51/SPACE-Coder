#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  localizeGallerySource,
  localizePresetMetadata,
  localizedSystemLabel,
} from "./lieflat-localization.mjs";
import { normalizeTextContent, sameTextContent } from "./text-content.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = resolve(SCRIPT_DIR, "..");
const VENDOR_ROOT = join(SKILL_ROOT, "vendor/lieflat-charts");
const RUNTIME_ROOT = join(SKILL_ROOT, "vendor/runtime-libs");
const OUTPUT_ROOT = join(SKILL_ROOT, "templates/visualization-lieflat");
const MANIFEST_PATH = join(SKILL_ROOT, "templates/visualization-manifest.json");
const UPSTREAM_PATH = join(VENDOR_ROOT, "UPSTREAM.json");
const CHECK_MODE = process.argv.includes("--check");

const GALLERY_FILES = [
  "basics-gallery.html",
  "glance-gallery.html",
  "lupi-gallery.html",
  "big-circular.html",
  "big-force.html",
  "big-threads.html",
];

const GROUPS = {
  G: { id: "glance", label: "Glance", file: "glance-gallery.html", count: 18 },
  L: { id: "lupi", label: "Lupi Editorial", file: "lupi-gallery.html", count: 15 },
  F: { id: "basics", label: "Lupi Basics", file: "basics-gallery.html", count: 12 },
  B: { id: "interactive", label: "Interactive", file: null, count: 3 },
};

const BIG_NAMES = {
  B1: "Circular Network",
  B2: "Force Network",
  B3: "Flow Threads",
};

function digest(content) {
  return createHash("sha256").update(content).digest("hex");
}

function normalizeColor(value) {
  const color = value.replace(/^#/, "").toUpperCase();
  const expanded = color.length === 3
    ? color.split("").map((channel) => channel.repeat(2)).join("")
    : color;

  // Upstream uses #000 only on fully transparent interaction hit areas.
  // Route it through the editorial ink token instead of adding a visual color.
  return expanded === "000000" ? "1C1C1A" : expanded;
}

function extractColors(sources) {
  const colors = new Set();
  for (const source of sources) {
    for (const match of source.matchAll(/#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
      colors.add(normalizeColor(match[0]));
    }
  }
  return [...colors].sort();
}

function themeVar(color) {
  return `--viz-editorial-c-${normalizeColor(color).toLowerCase()}`;
}

function replaceCssColors(source) {
  return source.replace(/#((?:[0-9a-f]{6}|[0-9a-f]{3}))\b/gi, (_, color) => `var(${themeVar(color)})`);
}

function replaceCssFonts(source) {
  return source.replace(/['"]Inter['"]\s*,\s*sans-serif/gi, "var(--font-sans)");
}

function replaceScriptColors(source) {
  return source.replace(
    /(['"`])#((?:[0-9a-f]{6}|[0-9a-f]{3}))\1/gi,
    (_, _quote, color) => `C["${normalizeColor(color)}"]`,
  );
}

function replaceScriptFonts(source) {
  return source
    .replace(/(['"])([^'"\r\n]*\s)Inter\1/g, (_, _quote, prefix) => `\`${prefix}\${FONT_FAMILY}\``)
    .replace(/(['"])Inter\1/g, "FONT_FAMILY");
}

function adaptVisualizationSemantics(source) {
  return source
    .replace(/const\s+L\s*=\s*\[[^;\r\n]+\];?/g, "const L=[...window.DC_LIEFLAT_THEME.ladder];")
    .replace(/const\s+LAD\s*=\s*\[[^;\r\n]+\];?/g, "const LAD=[...window.DC_LIEFLAT_THEME.ladderCompact];");
}

function replaceRemoteRuntimes(source) {
  return source
    .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/chart\.js@[^"'\s<]+/gi, "../../vendor/runtime-libs/chart.umd.min.js")
    .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/echarts@[^"'\s<]+/gi, "../../vendor/runtime-libs/echarts.min.js");
}

function transformGallery(source, file) {
  const localizedSource = localizeGallerySource(source, file);
  const dependencies = [
    '<link rel="icon" href="data:,">',
    '<link rel="stylesheet" href="../tokens.css" data-design-consultant-tokens>',
    '<script src="lieflat-theme.js" data-design-consultant-theme></script>',
  ].join("\n");
  const responsivePatch = `<style data-design-consultant-lieflat>
  html{background:var(--bg) !important}
  body{background:var(--bg) !important;color:var(--text) !important;font-family:var(--font-sans) !important}
  h1,h2,h3,.pagehead h1{font-family:var(--font-display) !important;letter-spacing:0 !important}
  svg text{font-family:var(--font-sans) !important}
  .sub,.src{color:var(--text-muted) !important}
  .card{border-radius:var(--radius-lg) !important;background:var(--bg) !important;color:var(--text) !important}
  .card.dark{background:var(--surface-inverse) !important;color:var(--text-inverse) !important}
  .card.dark .sub,.card.dark .src{color:color-mix(in srgb,var(--text-inverse) 62%,transparent) !important}
  .badge{border-radius:var(--radius-xs) !important}
  html[data-embedded="true"] .pagehead{display:none !important}
  .hit:focus{outline:none !important;stroke:var(--primary) !important;stroke-width:2 !important;stroke-opacity:1 !important}
  button:focus-visible,a:focus-visible,[tabindex]:focus-visible{outline:2px solid var(--primary) !important;outline-offset:2px !important}
  @media (max-width:900px){
    body{padding:20px !important}
    .grid2{grid-template-columns:minmax(0,1fr) !important;gap:18px !important;width:100% !important;min-width:0 !important}
    .card.wide{grid-column:auto !important}
    .card{padding:24px 20px 18px !important;min-width:0 !important;overflow-x:auto !important;overscroll-behavior-inline:contain;touch-action:pan-x pan-y pinch-zoom}
    .split{grid-template-columns:minmax(0,1fr) !important;gap:18px !important;min-width:0 !important}
    .card>svg{width:720px !important;max-width:none !important}
    .ch,.wrap{width:720px !important;max-width:none !important;height:420px !important}
    #ch{width:1140px !important;max-width:none !important;height:640px !important;min-height:640px !important}
    canvas{max-width:none !important}
    .pagehead{margin-bottom:18px !important}
  }
  @media (prefers-reduced-motion:reduce){
    *,*::before,*::after{animation-duration:.01ms !important;animation-delay:0ms !important;transition-duration:.01ms !important}
  }
</style>`;
  const interactionPatch = file === "big-threads.html" ? `<script data-design-consultant-keyboard>
(function enhanceThreadsKeyboardAccess() {
  const chart = document.getElementById("ch");
  const status = document.getElementById("status");
  const targets = [...chart.querySelectorAll(".hit")];
  chart.setAttribute("role", "group");
  chart.setAttribute("aria-label", "数据流向关系图。使用 Tab 浏览路径或节点，Enter 或空格固定，Escape 释放。");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  function labelFor(target) {
    if (target.dataset.route != null) {
      const route = routes[Number(target.dataset.route)];
      return SRC[route.s] + " 到 " + DST[route.d] + "，经 " + MID[route.m] + "，" + fmt(route.v);
    }
    const node = target.closest(".nodelab");
    const kind = node.dataset.kind;
    const index = Number(node.dataset.idx);
    const [selected] = nodeSel(kind, index);
    const name = kind === "s" ? SRC[index] : kind === "m" ? MID[index] : DST[index];
    const total = selected.reduce((sum, route) => sum + route.v, 0);
    return name + "，" + selected.length + " 条路径，" + fmt(total);
  }

  function release() {
    pinned = null;
    clear();
    spin.textContent = "";
    targets.forEach((target) => target.setAttribute("aria-pressed", "false"));
  }

  function pin(target) {
    const focus = apply(target);
    if (!focus) return;
    pinned = focus;
    focus();
    spin.textContent = "已固定 · 按 Escape 或单击空白处释放";
    targets.forEach((item) => item.setAttribute("aria-pressed", String(item === target)));
  }

  targets.forEach((target) => {
    target.setAttribute("tabindex", "0");
    target.setAttribute("role", "button");
    target.setAttribute("aria-label", labelFor(target));
    target.setAttribute("aria-pressed", "false");
    target.addEventListener("focus", () => {
      if (!pinned) apply(target)?.();
    });
    target.addEventListener("blur", () => {
      if (!pinned) clear();
    });
    target.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        pin(target);
      }
      if (event.key === "Escape") {
        event.preventDefault();
        release();
      }
    });
  });

  chart.addEventListener("keydown", (event) => {
    if (event.key === "Escape") release();
  });
  chart.addEventListener("click", (event) => {
    if (!apply(event.target)) release();
  });
})();
</script>` : "";

  let transformed = replaceRemoteRuntimes(localizedSource)
    .replace(/\s*<link[^>]+fonts\.googleapis\.com[^>]*>/gi, "")
    .replace(/(<title>[\s\S]*?<\/title>)/i, `$1\n${dependencies}`);
  transformed = transformed.replace(
    /<style>([\s\S]*?)<\/style>/gi,
    (_, css) => `<style>${replaceCssFonts(replaceCssColors(css))}</style>`,
  );
  transformed = transformed.replace(
    /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi,
    (_, attributes, script) => {
      const adapted = adaptVisualizationSemantics(replaceScriptFonts(replaceScriptColors(script)));
      return `<script${attributes}>\nwindow.DC_LIEFLAT_THEME.installAdapters();const C=window.DC_LIEFLAT_COLORS;const FONT_FAMILY=getComputedStyle(document.documentElement).getPropertyValue("--font-sans").trim()||"sans-serif";const ACCENT=window.DC_LIEFLAT_THEME.accent;const ACCENT_ON_DARK=window.DC_LIEFLAT_THEME.accentOnDark;const formatWan=(value,unit="")=>{const amount=Number(value)/10;const text=Number.isInteger(amount)?String(amount):amount.toFixed(1);return text+"万"+unit;};${adapted}\n</script>`;
    },
  );
  transformed = transformed.replace(/<\/head>/i, `${responsivePatch}\n</head>`);
  return interactionPatch ? transformed.replace(/<\/body>/i, `${interactionPatch}\n</body>`) : transformed;
}

function transformMonoTokens(source) {
  let withTheme = source.replace(
    /(['"]use strict['"];?)/,
    `$1\n\n  const C = global.DC_LIEFLAT_COLORS || {};\n  const FONT_FAMILY = typeof document === "undefined" ? "sans-serif" : getComputedStyle(document.documentElement).getPropertyValue("--font-sans").trim() || "sans-serif";\n  const ACCENT = global.DC_LIEFLAT_THEME?.accent || C["1C1C1A"];\n  const ACCENT_ON_DARK = global.DC_LIEFLAT_THEME?.accentOnDark || C["F0EFEB"];`,
  );
  withTheme = withTheme
    .replace(/link:\s*['"]https:\/\/fonts\.googleapis\.com[^'"]*['"],?/, "link: '',")
    .replaceAll("font-family:'Inter',sans-serif", "font-family:var(--font-sans)")
    .replace("global.MONO = { INK", "global.MONO = { ACCENT, ACCENT_ON_DARK, INK");
  return adaptVisualizationSemantics(replaceScriptFonts(replaceScriptColors(withTheme)))
    .replace(/ladder:\s*\[C\["F0EFEB"\]/, "ladder: [ACCENT_ON_DARK");
}

function buildThemeScript(colors) {
  return `(function initializeDesignConsultantLieflatTheme(global) {
  "use strict";

  const COLOR_KEYS = ${JSON.stringify(colors, null, 2)};
  const root = document.documentElement;
  const params = new URLSearchParams(global.location?.search || "");
  const palette = params.get("palette") === "coral" ? "coral" : "harbor";
  const mode = params.get("theme") === "dark" ? "dark" : "light";
  root.dataset.palette = palette;
  root.dataset.theme = mode;
  root.dataset.embedded = String(global.self !== global.top);
  const computed = getComputedStyle(root);
  const token = (name, fallback) => computed.getPropertyValue(name).trim() || fallback;
  const semantic = Object.freeze({
    bg: token("--bg", "#F3F6F9"),
    surface: token("--surface", "#FFFFFF"),
    surfaceMuted: token("--surface-muted", "#EDF2F7"),
    surfaceRaised: token("--surface-raised", "#FFFFFF"),
    surfaceInverse: token("--surface-inverse", "#0B1F33"),
    surfaceInverseMuted: token("--surface-inverse-muted", "#1E2D45"),
    text: token("--text", "#14213D"),
    textMuted: token("--text-muted", "#526273"),
    textSoft: token("--text-soft", "#5C6B7A"),
    textInverse: token("--text-inverse", "#F5F9FF"),
    border: token("--border", "#D4DEE8"),
    borderStrong: token("--border-strong", "#AAB8C6"),
    reference: token("--viz-reference", token("--text-muted", "#526273")),
    grid: token("--viz-grid", token("--border", "#D4DEE8")),
    accentStrong: token("--viz-accent-strong", "#0958D9"),
    primary: token("--viz-accent", token("--primary", "#0F6CDD")),
    accentMid: token("--viz-accent-mid", "#5A9BE6"),
    accentSoft: token("--viz-accent-soft", "#A8CDF3"),
    accentSubtle: token("--viz-accent-subtle", "#D6E8FA"),
    accentArea: token("--viz-accent-area", "#E8F2FC"),
    accentOnDarkStrong: token("--viz-accent-on-dark-strong", "#D4E9FF"),
    accentOnDark: token("--viz-accent-on-dark", "#69B1FF"),
    accentOnDarkMid: token("--viz-accent-on-dark-mid", "#438CD5"),
    accentOnDarkSoft: token("--viz-accent-on-dark-soft", "#2A6299"),
    accentOnDarkSubtle: token("--viz-accent-on-dark-subtle", "#1C4269"),
    accentOnDarkArea: token("--viz-accent-on-dark-area", "#14334F"),
  });
  const colors = {};
  const sourcePositions = Object.create(null);

  function mixHex(from, to, amount) {
    const parse = (value) => [1, 3, 5].map((index) => Number.parseInt(value.slice(index, index + 2), 16));
    if (!/^#[0-9a-f]{6}$/i.test(from) || !/^#[0-9a-f]{6}$/i.test(to)) return from;
    const left = parse(from);
    const right = parse(to);
    const channels = left.map((value, index) => Math.round(value + (right[index] - value) * amount));
    return \`#\${channels.map((value) => value.toString(16).padStart(2, "0")).join("")}\`;
  }

  function normalizeColor(value) {
    if (typeof value !== "string") return value;
    const normalized = value.trim().toLowerCase();
    const rgb = normalized.match(/^rgba?\\(\\s*(\\d+)[,\\s]+(\\d+)[,\\s]+(\\d+)/);
    if (!rgb) return normalized;
    return "#" + rgb.slice(1, 4)
      .map((channel) => Number(channel).toString(16).padStart(2, "0"))
      .join("");
  }

  for (const key of COLOR_KEYS) {
    const sourceTone = [0, 2, 4].reduce((total, index) => total + Number.parseInt(key.slice(index, index + 2), 16), 0) / 3;
    const position = Math.max(0, Math.min(1, (sourceTone - 28) / (242 - 28)));
    sourcePositions[key] = position;
    colors[key] = mixHex(semantic.text, mode === "dark" ? semantic.surface : semantic.bg, position);
  }

  colors["1C1C1A"] = semantic.text;
  colors["8F8E88"] = semantic.textMuted;
  colors.C6C5BF = mode === "dark" ? semantic.textSoft : semantic.borderStrong;
  colors.DEDDD6 = semantic.grid;
  colors.F0EFEB = mode === "dark" ? semantic.textInverse : semantic.bg;
  colors.F2F1ED = semantic.surface;

  const sourcePositionByValue = new Map();
  for (const key of COLOR_KEYS) {
    const normalized = normalizeColor(colors[key]);
    const existing = sourcePositionByValue.get(normalized) || [];
    existing.push(sourcePositions[key]);
    sourcePositionByValue.set(normalized, existing);
  }

  root.style.setProperty("--bg", semantic.bg);
  root.style.setProperty("--paper", colors.F0EFEB);
  root.style.setProperty("--dark", semantic.surfaceInverse);
  root.style.setProperty("--ink", semantic.text);
  root.style.setProperty("--muted", semantic.textMuted);
  root.style.setProperty("--faint", semantic.textSoft);
  root.style.setProperty("--grid", semantic.grid);
  root.style.setProperty("--reference", semantic.reference);

  const normalDataRamp = Object.freeze([
    semantic.accentStrong,
    semantic.primary,
    mixHex(semantic.primary, semantic.accentMid, 0.5),
    semantic.accentMid,
    semantic.accentSoft,
    semantic.accentSubtle,
  ]);
  const inverseDataRamp = Object.freeze([
    semantic.accentOnDarkStrong,
    semantic.accentOnDark,
    mixHex(semantic.accentOnDark, semantic.accentOnDarkMid, 0.5),
    semantic.accentOnDarkMid,
    semantic.accentOnDarkSoft,
    semantic.accentOnDarkSubtle,
  ]);
  const lightSourceRamp = normalDataRamp;
  const inverseSourceRamp = Object.freeze([...inverseDataRamp].reverse());
  const ladder = Object.freeze([...(mode === "dark" ? inverseDataRamp : normalDataRamp)]);
  const ladderCompact = Object.freeze([ladder[0], ladder[1], ladder[3], ladder[4], ladder[5]]);

  const matchesInk = (value, darkContext) => {
    const normalized = normalizeColor(value);
    return normalized === normalizeColor(semantic.text)
      || (darkContext && normalized === normalizeColor(colors.F0EFEB));
  };

  function sourcePosition(value) {
    if (typeof value !== "string") return null;
    const variable = value.match(/--viz-editorial-c-([0-9a-f]{6})/i);
    if (variable) return sourcePositions[variable[1].toUpperCase()] ?? null;
    const positions = sourcePositionByValue.get(normalizeColor(value));
    if (!positions?.length) return null;
    return positions.reduce((total, position) => total + position, 0) / positions.length;
  }

  function rampIndex(value, ramp) {
    const normalized = normalizeColor(value);
    return ramp.findIndex((candidate) => normalizeColor(candidate) === normalized);
  }

  function sampleRamp(ramp, position) {
    const scaled = Math.max(0, Math.min(1, position)) * (ramp.length - 1);
    const left = Math.floor(scaled);
    const right = Math.min(ramp.length - 1, left + 1);
    return mixHex(ramp[left], ramp[right], scaled - left);
  }

  function mapMarkColor(value, darkContext) {
    if (Array.isArray(value)) return value.map((item) => mapMarkColor(item, darkContext));
    if (typeof value !== "string" || value === "transparent" || value === "none") return value;

    const normalIndex = rampIndex(value, normalDataRamp);
    if (darkContext && normalIndex >= 0) return inverseDataRamp[normalIndex];
    const inverseIndex = rampIndex(value, inverseDataRamp);
    if (!darkContext && inverseIndex >= 0) return normalDataRamp[inverseIndex];

    const position = sourcePosition(value);
    if (position != null) {
      return sampleRamp(darkContext ? inverseSourceRamp : lightSourceRamp, position);
    }
    if (matchesInk(value, darkContext)) return darkContext ? semantic.accentOnDark : semantic.primary;
    return value;
  }

  function mapLineColor(value, darkContext) {
    if (Array.isArray(value)) return value.map((item) => mapLineColor(item, darkContext));
    if (typeof value !== "string" || value === "transparent" || value === "none") return value;

    const normalIndex = rampIndex(value, normalDataRamp);
    if (darkContext && normalIndex >= 0) return inverseDataRamp[normalIndex];
    const inverseIndex = rampIndex(value, inverseDataRamp);
    if (!darkContext && inverseIndex >= 0) return normalDataRamp[inverseIndex];

    const position = sourcePosition(value);
    if (position != null) {
      return sampleRamp(darkContext ? inverseDataRamp : normalDataRamp, position);
    }
    if (matchesInk(value, darkContext)) return darkContext ? semantic.accentOnDark : semantic.primary;
    return value;
  }

  function mapSvgDataColor(value, darkContext) {
    if (Array.isArray(value)) return value.map((item) => mapSvgDataColor(item, darkContext));
    if (typeof value !== "string" || value === "transparent" || value === "none") return value;

    const normalIndex = rampIndex(value, normalDataRamp);
    if (darkContext && normalIndex >= 0) return inverseDataRamp[normalIndex];
    const inverseIndex = rampIndex(value, inverseDataRamp);
    if (!darkContext && inverseIndex >= 0) return normalDataRamp[inverseIndex];
    return matchesInk(value, darkContext)
      ? darkContext ? semantic.accentOnDark : semantic.primary
      : value;
  }

  const areaColor = (darkContext) => darkContext ? semantic.accentOnDarkArea : semantic.accentArea;
  const keylineColor = (darkContext) => darkContext ? semantic.surfaceInverse : semantic.accentStrong;

  function accentEChartsOption(option, darkContext) {
    if (!option || typeof option !== "object") return option;
    const palette = darkContext ? inverseDataRamp : normalDataRamp;
    option.color = Array.isArray(option.color)
      ? option.color.map((_, index) => palette[index % palette.length])
      : [...palette];
    const blockedKeys = new Set(["label", "endLabel", "axisLabel", "textStyle", "title", "tooltip"]);
    const styleKeys = new Set(["itemStyle", "lineStyle", "areaStyle"]);

    function visit(value, styleContext = null, blocked = false) {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) {
        value.forEach((item) => visit(item, styleContext, blocked));
        return;
      }
      for (const [key, child] of Object.entries(value)) {
        const nextBlocked = blocked || blockedKeys.has(key);
        const nextStyleContext = styleKeys.has(key) ? key : styleContext;
        if (!nextBlocked && nextStyleContext && key === "color") {
          value[key] = nextStyleContext === "areaStyle"
            ? areaColor(darkContext)
            : nextStyleContext === "lineStyle"
              ? mapLineColor(child, darkContext)
              : mapMarkColor(child, darkContext);
        } else if (!nextBlocked && nextStyleContext && key === "borderColor") {
          value[key] = nextStyleContext === "itemStyle"
            ? keylineColor(darkContext)
            : mapMarkColor(child, darkContext);
        } else {
          visit(child, nextStyleContext, nextBlocked);
        }
      }
    }

    const series = Array.isArray(option.series) ? option.series : option.series ? [option.series] : [];
    series.forEach((item) => visit(item));
    return option;
  }

  function accentChartConfig(config, darkContext) {
    const datasets = config?.data?.datasets;
    if (!Array.isArray(datasets)) return config;
    for (const dataset of datasets) {
      const chartType = dataset.type || config.type;
      const isFilledLine = chartType === "line" && dataset.fill !== false;
      if ("backgroundColor" in dataset) {
        dataset.backgroundColor = isFilledLine
          ? areaColor(darkContext)
          : mapMarkColor(dataset.backgroundColor, darkContext);
      }
      if ("borderColor" in dataset) dataset.borderColor = mapLineColor(dataset.borderColor, darkContext);
      if ("pointBackgroundColor" in dataset) dataset.pointBackgroundColor = mapMarkColor(dataset.pointBackgroundColor, darkContext);
      if ("pointBorderColor" in dataset) dataset.pointBorderColor = mapLineColor(dataset.pointBorderColor, darkContext);
    }
    return config;
  }

  function accentSvgShape(shape) {
    if (!(shape instanceof Element) || !["circle", "ellipse", "line", "path", "polygon", "polyline", "rect"].includes(shape.localName)) return;
    if (shape.matches(".hit,[data-no-accent]") || shape.closest("defs,clipPath,mask")) return;
    const darkContext = mode === "dark" || Boolean(shape.closest(".card.dark"));
    const opacity = Number.parseFloat(shape.getAttribute("opacity") || "1");
    const fillOpacity = Number.parseFloat(shape.getAttribute("fill-opacity") || "1");
    const strokeOpacity = Number.parseFloat(shape.getAttribute("stroke-opacity") || "1");
    const computedStyle = getComputedStyle(shape);
    const fill = shape.getAttribute("fill") || computedStyle.fill;
    const stroke = shape.getAttribute("stroke") || computedStyle.stroke;
    const mappedFill = mapSvgDataColor(fill, darkContext);
    const mappedStroke = mapSvgDataColor(stroke, darkContext);
    const hasVisibleFill = fill && !["none", "transparent"].includes(fill) && fillOpacity > 0.05;
    if (opacity > 0.05 && hasVisibleFill && mappedFill !== fill) shape.setAttribute("fill", mappedFill);
    if (opacity > 0.05 && strokeOpacity > 0.05 && mappedStroke !== stroke) {
      shape.setAttribute("stroke", mappedFill !== fill ? keylineColor(darkContext) : mappedStroke);
    }
  }

  function scanSvg(rootNode) {
    if (!(rootNode instanceof Element || rootNode instanceof Document)) return;
    if (rootNode instanceof Element) accentSvgShape(rootNode);
    rootNode.querySelectorAll?.("svg circle,svg ellipse,svg line,svg path,svg polygon,svg polyline,svg rect").forEach(accentSvgShape);
  }

  let svgAdapterInstalled = false;
  function installSvgAdapter() {
    if (svgAdapterInstalled || !document.body) return;
    svgAdapterInstalled = true;
    scanSvg(document);
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "attributes") accentSvgShape(record.target);
        record.addedNodes.forEach(scanSvg);
      }
    }).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["fill", "stroke", "opacity", "fill-opacity", "stroke-opacity"],
    });
  }

  function installAdapters() {
    installSvgAdapter();

    if (global.echarts && !global.echarts.__dcSemanticAccent) {
      const originalInit = global.echarts.init.bind(global.echarts);
      global.echarts.init = function initializeWithSemanticAccent(dom, ...args) {
        const chart = originalInit(dom, ...args);
        if (!chart.__dcSemanticAccent) {
          const originalSetOption = chart.setOption.bind(chart);
          const darkContext = mode === "dark" || Boolean(dom?.closest?.(".card.dark"));
          chart.setOption = (option, ...setOptionArgs) => originalSetOption(
            accentEChartsOption(option, darkContext),
            ...setOptionArgs
          );
          chart.__dcSemanticAccent = true;
        }
        return chart;
      };
      global.echarts.__dcSemanticAccent = true;
    }

    if (global.Chart && !global.Chart.__dcSemanticAccent) {
      const NativeChart = global.Chart;
      const WrappedChart = new Proxy(NativeChart, {
        construct(Target, args) {
          const canvas = args[0]?.canvas || args[0];
          const darkContext = mode === "dark" || Boolean(canvas?.closest?.(".card.dark"));
          if (args[1]) accentChartConfig(args[1], darkContext);
          return Reflect.construct(Target, args);
        },
      });
      WrappedChart.__dcSemanticAccent = true;
      global.Chart = WrappedChart;
    }
  }

  global.DC_LIEFLAT_COLORS = Object.freeze(colors);
  global.DC_LIEFLAT_THEME = Object.freeze({
    name: "design-consultant-editorial-utility",
    palette,
    mode,
    accent: semantic.primary,
    accentStrong: semantic.accentStrong,
    accentMid: semantic.accentMid,
    accentSoft: semantic.accentSoft,
    accentSubtle: semantic.accentSubtle,
    accentArea: semantic.accentArea,
    accentOnDark: semantic.accentOnDark,
    accentOnDarkStrong: semantic.accentOnDarkStrong,
    accentOnDarkMid: semantic.accentOnDarkMid,
    accentOnDarkSoft: semantic.accentOnDarkSoft,
    accentOnDarkSubtle: semantic.accentOnDarkSubtle,
    accentOnDarkArea: semantic.accentOnDarkArea,
    accentRamp: normalDataRamp,
    accentRampOnDark: inverseDataRamp,
    ink: colors["1C1C1A"],
    paper: colors.F0EFEB,
    muted: colors["8F8E88"],
    faint: colors.C6C5BF,
    grid: colors.DEDDD6,
    ladder,
    ladderCompact,
    installAdapters,
  });
})(typeof window !== "undefined" ? window : globalThis);
`;
}

function cleanCell(value) {
  return value.trim().replaceAll("`", "").replace(/\*\*/g, "");
}

function parseCatalog(markdown) {
  const presets = [];
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^\|\s*([GLFB]\d+)\s*\|/);
    if (!match) continue;
    const cells = line.split("|").slice(1, -1).map(cleanCell);
    const id = cells[0];
    const group = GROUPS[id[0]];
    if (id.startsWith("B")) {
      const file = cells[1];
      presets.push({
        id,
        name: BIG_NAMES[id],
        system: group.id,
        systemLabel: group.label,
        sourceTemplate: file,
        cardTitle: null,
        dataShape: cells[2],
        interaction: cells[3],
        useWhen: cells[4],
        occasion: "full-page interactive",
        readerTime: "interactive",
        engine: file === "templates/big-threads.html" ? "SVG" : "ECharts",
        sister: null,
      });
      continue;
    }
    presets.push({
      id,
      name: cells[1],
      system: group.id,
      systemLabel: group.label,
      sourceTemplate: `templates/${group.file}`,
      cardTitle: cells[2],
      dataShape: cells[3],
      occasion: cells[4],
      readerTime: cells[5],
      engine: cells[6],
      sister: cells[7] === "—" ? null : cells[7],
    });
  }
  return presets;
}

function buildManifest(upstream, presets, colors, runtime) {
  const galleries = Object.values(GROUPS).map((group) => ({
    id: group.id,
    label: localizedSystemLabel(group.id),
    sourceLabel: group.label,
    presetCount: group.count,
    file: group.file ? `visualization-lieflat/${group.file}` : null,
  }));
  return {
    schemaVersion: 2,
    module: "data-visualization",
    version: "0.7.0",
    implementation: "authorized-vendored",
    purpose: "从真实模板实现选图并生成可追溯的数据可视化，保留上游几何、交互和动效，让容器、字体、中性色阶与数据重点色共同遵守 Editorial Utility token。",
    provenance: {
      repository: upstream.repository,
      commit: upstream.commit,
      importedAt: upstream.importedAt,
      integrationAuthorization: upstream.integrationAuthorization,
      vendorRoot: "vendor/lieflat-charts",
      derivativeGenerator: "scripts/sync-lieflat-module.mjs",
      rule: "上游文件保持字节一致。项目交付只使用派生文件，并保留 preset id、gallery 文件与原始卡片标题用于谱系追溯。",
    },
    runtimeContract: {
      mode: "pinned-local",
      root: "visualization-lieflat/runtime",
      dependencies: runtime.dependencies,
      rule: "生成的图库不得依赖远程 CDN 脚本。",
    },
    selectionContract: {
      primaryKey: "数据形状",
      defaultOrder: ["lupi", "basics", "glance"],
      candidateAudit: "优先比较 Lupi 叙事图表与 Lupi 基础图表中至少 3 个能诚实承载数据的候选。只有仪表盘、监控、周报或明确要求快速阅读时，才优先使用快速图表。",
      requiredInputs: [
        "分析问题",
        "一句话结论",
        "数据粒度",
        "维度与指标",
        "单位与分母",
        "交付表面",
        "读者检查时间"
      ],
      lineageRequired: ["preset id", "system", "source template", "source card title"],
    },
    paletteContract: {
      mode: "design-consultant-editorial-utility",
      tokenPrefix: "--viz-editorial-c-",
      colorCount: colors.length,
      bridge: "visualization-lieflat/lieflat-theme.js",
      supportedPalettes: ["harbor-blue", "coral-office"],
      supportedModes: ["light", "dark"],
      compatibilityRule: "Upstream color identifiers preserve source lineage. Data marks map to the active single-root accent ramp without changing upstream geometry, interaction or motion; text and structural scaffolding remain neutral.",
      accentRule: "Use the --viz-accent-* tonal ramp for data marks and --viz-accent-on-dark-* inside inverse cards. Do not recolor chart scaffolding with the accent ramp.",
      runtimeInjectionRule: "Inject the active six-step data-mark ramp into ECharts option.color even when a preset omits its own palette; never allow the engine default palette to become a visible fallback.",
      areaFillRule: "Use a flat --viz-accent-area or --viz-accent-on-dark-area fill below focal lines. Replace upstream neutral gradients instead of tinting them.",
      structureRule: "Keep grids, axes, calendar hairlines, helper connectors and benchmarks neutral through --viz-grid and --viz-reference.",
      rolePolicy: {
        dataMarks: {
          strategy: "single-root-tonal-ramp",
          lightTokens: ["--viz-accent-strong", "--viz-accent", "--viz-accent-mid", "--viz-accent-soft", "--viz-accent-subtle"],
          inverseTokens: ["--viz-accent-on-dark-strong", "--viz-accent-on-dark", "--viz-accent-on-dark-mid", "--viz-accent-on-dark-soft", "--viz-accent-on-dark-subtle"],
        },
        areaFill: {
          strategy: "flat-tonal-fill",
          tokens: ["--viz-accent-area", "--viz-accent-on-dark-area"],
        },
        structure: {
          strategy: "neutral-only",
          tokens: ["--viz-grid", "--viz-reference"],
          includes: ["grid", "axis", "calendar-hairline", "helper-connector", "benchmark"],
        },
      },
      aliases: {
        accentStrong: "--viz-accent-strong",
        accent: "--viz-accent",
        accentMid: "--viz-accent-mid",
        accentSoft: "--viz-accent-soft",
        accentSubtle: "--viz-accent-subtle",
        accentArea: "--viz-accent-area",
        accentOnDarkStrong: "--viz-accent-on-dark-strong",
        accentOnDark: "--viz-accent-on-dark",
        accentOnDarkMid: "--viz-accent-on-dark-mid",
        accentOnDarkSoft: "--viz-accent-on-dark-soft",
        accentOnDarkSubtle: "--viz-accent-on-dark-subtle",
        accentOnDarkArea: "--viz-accent-on-dark-area",
        reference: "--viz-reference",
        structuralGrid: "--viz-grid",
        ink: "--viz-editorial-ink",
        paper: "--viz-editorial-paper",
        muted: "--viz-editorial-muted",
        faint: "--viz-editorial-faint",
        grid: "--viz-editorial-grid"
      }
    },
    motionContract: {
      preserveUpstreamTiming: true,
      reveal: "IntersectionObserver",
      replay: "click chart",
      timerCleanup: true,
      reducedMotion: "CSS reduction patch plus upstream SVG fallback"
    },
    galleries,
    presets,
  };
}

async function collectVendorHashes() {
  const files = ["README.md", "SKILL.md", "catalog.md", "mono-tokens.js", "LICENSE", "THIRD_PARTY_NOTICES.md"];
  for (const directory of ["templates", "examples"]) {
    for (const entry of await readdir(join(VENDOR_ROOT, directory), { withFileTypes: true })) {
      if (entry.isFile()) files.push(`${directory}/${entry.name}`);
    }
  }
  const hashes = {};
  for (const file of files.sort()) {
    const content = await readFile(join(VENDOR_ROOT, file), "utf8");
    hashes[file] = digest(normalizeTextContent(content));
  }
  return hashes;
}

async function writeOrCheck(path, content, mismatches) {
  const normalizedContent = normalizeTextContent(content);
  if (CHECK_MODE) {
    try {
      const current = await readFile(path, "utf8");
      if (!sameTextContent(current, normalizedContent)) {
        mismatches.push(relative(SKILL_ROOT, path).replaceAll("\\", "/"));
      }
    } catch {
      mismatches.push(relative(SKILL_ROOT, path).replaceAll("\\", "/"));
    }
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, normalizedContent, "utf8");
}

const upstream = JSON.parse(await readFile(UPSTREAM_PATH, "utf8"));
const gallerySources = await Promise.all(
  GALLERY_FILES.map(async (file) => normalizeTextContent(
    await readFile(join(VENDOR_ROOT, "templates", file), "utf8"),
  )),
);
const monoSource = normalizeTextContent(await readFile(join(VENDOR_ROOT, "mono-tokens.js"), "utf8"));
const catalogSource = normalizeTextContent(await readFile(join(VENDOR_ROOT, "catalog.md"), "utf8"));
const runtime = JSON.parse(await readFile(join(RUNTIME_ROOT, "RUNTIME.json"), "utf8"));
const colors = extractColors([...gallerySources, monoSource]);
const presets = parseCatalog(catalogSource).map(localizePresetMetadata);

if (presets.length !== 48) throw new Error(`上游 catalog 应解析出 48 个模板，当前为 ${presets.length}`);
for (const [prefix, group] of Object.entries(GROUPS)) {
  const actual = presets.filter((preset) => preset.id.startsWith(prefix)).length;
  if (actual !== group.count) throw new Error(`${group.label} 应有 ${group.count} 个模板，当前为 ${actual}`);
}

const mismatches = [];
for (let index = 0; index < GALLERY_FILES.length; index += 1) {
  await writeOrCheck(join(OUTPUT_ROOT, GALLERY_FILES[index]), transformGallery(gallerySources[index], GALLERY_FILES[index]), mismatches);
}
await writeOrCheck(join(OUTPUT_ROOT, "mono-tokens.js"), transformMonoTokens(monoSource), mismatches);
await writeOrCheck(join(OUTPUT_ROOT, "lieflat-theme.js"), buildThemeScript(colors), mismatches);
await writeOrCheck(MANIFEST_PATH, `${JSON.stringify(buildManifest(upstream, presets, colors, runtime), null, 2)}\n`, mismatches);
const updatedUpstream = { ...upstream, files: await collectVendorHashes() };
await writeOrCheck(UPSTREAM_PATH, `${JSON.stringify(updatedUpstream, null, 2)}\n`, mismatches);

const result = {
  ok: mismatches.length === 0,
  mode: CHECK_MODE ? "check" : "write",
  upstreamCommit: upstream.commit,
  paletteColors: colors.length,
  presets: presets.length,
  galleries: GALLERY_FILES.length,
  mismatches,
};
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
