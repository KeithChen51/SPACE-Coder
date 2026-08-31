#!/usr/bin/env node

import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const GREENFIELD_INIT_PROVENANCE = Object.freeze({
  schemaVersion: 1,
  type: "greenfield-init",
  skillVersion: "0.10.0",
});
const ADOPTION_FOOTPRINT_PATHS = Object.freeze([
  "adoption",
  "intake",
  "tokens/external-map.json",
  "tokens/external-map.css",
  "tokens/external-bridge.css",
  "checks/adoption/inventory.mjs",
  "checks/adoption/token-contract.mjs",
  "checks/adoption/token-bridge.mjs",
  "checks/adoption/component-adapters.mjs",
  "checks/adoption/evidence-attestation.mjs",
]);
const COMMANDS = new Set(["build", "check", "diff"]);
const TAXONOMY_LAYERS = ["base", "semantic", "component", "data-viz"];
const REFERENCE_PATTERN = /^\{([^{}]+)\}$/;

function parseArguments(argv) {
  let command = argv.includes("--check") ? "check" : "build";
  let root = resolve(SCRIPT_DIR, "..");
  let positionalRoot;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") continue;
    if (argument === "--root") {
      if (!argv[index + 1]) throw new Error("--root requires a path");
      root = resolve(argv[index + 1]);
      index += 1;
      continue;
    }
    if (COMMANDS.has(argument)) {
      command = argument;
      continue;
    }
    if (argument.startsWith("-")) throw new Error(`Unknown option ${argument}`);
    if (positionalRoot) throw new Error(`Unexpected argument ${argument}`);
    positionalRoot = argument;
  }

  if (positionalRoot) root = resolve(positionalRoot);
  return { command, root };
}

async function readOptional(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function pathExists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function readLock(root) {
  const lockText = await readOptional(resolve(root, ".design-consultant-lock.json"));
  if (lockText === null) return null;
  try {
    return JSON.parse(lockText.replace(/^\uFEFF/, ""));
  } catch {
    return "malformed";
  }
}

async function hasAdoptionConfig(root) {
  const configText = await readOptional(resolve(root, "system.config.json"));
  if (configText === null) return false;
  try {
    const config = JSON.parse(configText.replace(/^\uFEFF/, ""));
    return ["preserve", "augment", "migrate"].includes(config?.integration?.adoptionStrategy)
      || config?.sourceOfTruth?.tokens === "tokens/external-map.json"
      || config?.sourceOfTruth?.runtimeTokens === "tokens/external-bridge.css"
      || config?.integration?.tokenBridge === "tokens/external-map.json"
      || config?.checks?.adoptionContract === "checks/check-adoption-contract.mjs";
  } catch {
    return false;
  }
}

async function isAdoptionWorkspace(root, lock) {
  if (lock && lock !== "malformed" && lock.workflow === "existing-system-adoption") return true;
  for (const path of ADOPTION_FOOTPRINT_PATHS) {
    if (await pathExists(resolve(root, path))) return true;
  }
  return hasAdoptionConfig(root);
}

async function isTrustedSkillSourceRoot(root) {
  if (SCRIPT_DIR.split(/[\\/]/).at(-1) !== "scripts") return false;
  try {
    return await realpath(root) === await realpath(resolve(SCRIPT_DIR, ".."))
      && await pathExists(resolve(root, "templates/tokens.json"))
      && await pathExists(resolve(root, "templates/adoption-plan.schema.json"));
  } catch {
    return false;
  }
}

function hasTrustedGreenfieldProvenance(lock) {
  const provenance = lock?.workflowProvenance;
  const provenanceKeys = provenance && typeof provenance === "object" && !Array.isArray(provenance)
    ? Object.keys(provenance).sort()
    : [];
  return Boolean(
    lock
    && lock !== "malformed"
    && lock.schemaVersion === 1
    && lock.workflow === "greenfield"
    && lock.files && typeof lock.files === "object" && !Array.isArray(lock.files)
    && JSON.stringify(provenanceKeys) === JSON.stringify(Object.keys(GREENFIELD_INIT_PROVENANCE).sort())
    && provenance.schemaVersion === GREENFIELD_INIT_PROVENANCE.schemaVersion
    && provenance.type === GREENFIELD_INIT_PROVENANCE.type
    && provenance.skillVersion === GREENFIELD_INIT_PROVENANCE.skillVersion,
  );
}

async function resolveLayout(root) {
  const sourceTokenPath = resolve(root, "templates/tokens.json");
  if (await readOptional(sourceTokenPath)) {
    return {
      kind: "skill-source",
      root,
      source: sourceTokenPath,
      outputs: {
        css: resolve(root, "templates/tokens.css"),
        typescript: resolve(root, "templates/tokens.ts"),
        schema: resolve(root, "templates/tokens.schema.json"),
      },
      manifests: [
        { name: "component-manifest", path: resolve(root, "templates/component-manifest.json") },
        { name: "visualization-manifest", path: resolve(root, "templates/visualization-manifest.json") },
      ],
      preview: resolve(root, "templates/component-library.html"),
    };
  }

  return {
    kind: "generated-design-system",
    root,
    source: resolve(root, "tokens/tokens.json"),
    outputs: {
      css: resolve(root, "tokens/tokens.css"),
      typescript: resolve(root, "tokens/tokens.ts"),
      schema: resolve(root, "tokens/tokens.schema.json"),
    },
    manifests: [
      { name: "component-manifest", path: resolve(root, "components/manifest.json") },
      { name: "visualization-manifest", path: resolve(root, "visualizations/manifest.json") },
    ],
    preview: resolve(root, "components/index.html"),
  };
}

function toPosixPath(path) {
  return path.replaceAll("\\", "/");
}

function relativePath(layout, path) {
  return toPosixPath(relative(layout.root, path));
}

function collectTokens(tokenRoot) {
  const tokens = new Map();
  const cssVariables = new Map();

  function visit(value, path = []) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const tokenPath = path.join(".");
    const hasValue = Object.hasOwn(value, "value");
    const hasCssVariable = Object.hasOwn(value, "cssVariable");
    if (hasValue || hasCssVariable) {
      if (typeof value.value !== "string" || typeof value.cssVariable !== "string") {
        throw new Error(`Token ${tokenPath} must define string value and cssVariable fields`);
      }
      if (!/^--[a-z0-9-]+$/.test(value.cssVariable)) {
        throw new Error(`Invalid CSS variable ${value.cssVariable} at ${tokenPath}`);
      }
      const firstPath = cssVariables.get(value.cssVariable);
      if (firstPath) {
        throw new Error(`Duplicate CSS variable ${value.cssVariable} at ${firstPath} and ${tokenPath}`);
      }
      cssVariables.set(value.cssVariable, tokenPath);
      tokens.set(tokenPath, { ...value, path: tokenPath });
      return;
    }
    for (const [key, child] of Object.entries(value)) visit(child, [...path, key]);
  }

  visit(tokenRoot);
  if (tokens.size === 0) throw new Error("tokens.json does not contain any token definitions");
  return { tokens, cssVariables };
}

function classifyTokens(document, tokens) {
  if (!document.taxonomy || typeof document.taxonomy !== "object" || Array.isArray(document.taxonomy)) {
    throw new Error("tokens.json must define taxonomy with base, semantic, component and data-viz layers");
  }
  const keys = Object.keys(document.taxonomy);
  const missing = TAXONOMY_LAYERS.filter((layer) => !keys.includes(layer));
  const extra = keys.filter((layer) => !TAXONOMY_LAYERS.includes(layer));
  if (missing.length || extra.length) {
    throw new Error(`Invalid taxonomy layers; missing: ${missing.join(", ") || "none"}; extra: ${extra.join(", ") || "none"}`);
  }

  const prefixes = [];
  for (const layer of TAXONOMY_LAYERS) {
    const layerPrefixes = document.taxonomy[layer];
    if (!Array.isArray(layerPrefixes) || layerPrefixes.length === 0 || layerPrefixes.some((path) => typeof path !== "string" || !path)) {
      throw new Error(`taxonomy.${layer} must be a non-empty array of token path prefixes`);
    }
    for (const prefix of layerPrefixes) prefixes.push({ layer, prefix });
  }

  const tokenLayers = new Map();
  for (const path of tokens.keys()) {
    const matches = prefixes
      .filter(({ prefix }) => path === prefix || path.startsWith(`${prefix}.`))
      .sort((left, right) => right.prefix.length - left.prefix.length);
    if (matches.length === 0) throw new Error(`Token ${path} is not assigned to a taxonomy layer`);
    const strongest = matches.filter(({ prefix }) => prefix.length === matches[0].prefix.length);
    if (new Set(strongest.map(({ layer }) => layer)).size > 1) {
      throw new Error(`Token ${path} has conflicting taxonomy assignments: ${strongest.map(({ layer }) => layer).join(", ")}`);
    }
    tokenLayers.set(path, matches[0].layer);
  }
  return tokenLayers;
}

function referenceFrom(value) {
  return typeof value === "string" ? value.match(REFERENCE_PATTERN)?.[1] : undefined;
}

function validateTokenReferences(tokens) {
  function resolveLiteral(path, stack = []) {
    if (stack.includes(path)) {
      throw new Error(`Circular token reference: ${[...stack, path].join(" -> ")}`);
    }
    const token = tokens.get(path);
    if (!token) {
      const source = stack.at(-1) || path;
      throw new Error(`Unknown token reference {${path}} at ${source}`);
    }
    const reference = referenceFrom(token.value);
    if (!reference) return token.value;
    return resolveLiteral(reference, [...stack, path]);
  }

  for (const path of tokens.keys()) resolveLiteral(path);
  return resolveLiteral;
}

function cssValue(rawValue, tokens, atPath) {
  const reference = referenceFrom(rawValue);
  if (!reference) return rawValue;
  const target = tokens.get(reference);
  if (!target) throw new Error(`Unknown token reference {${reference}} at ${atPath}`);
  return `var(${target.cssVariable})`;
}

function validateThemes(document, tokens, tokenLayers) {
  const invalidBoundaries = [];
  const variants = [];
  const seenSelectors = new Map();
  const defaultTheme = document.themes?.default;
  if (!defaultTheme || !["light", "dark"].includes(defaultTheme.mode) || typeof defaultTheme.palette !== "string") {
    throw new Error("themes.default must define palette and mode (light or dark)");
  }

  for (const [id, variant] of Object.entries(document.themes?.variants || {})) {
    if (typeof variant.selector !== "string" || !variant.selector || !["light", "dark"].includes(variant.mode) || typeof variant.palette !== "string") {
      throw new Error(`Theme variant ${id} must define selector, palette and mode (light or dark)`);
    }
    if (!variant.tokens || typeof variant.tokens !== "object" || Array.isArray(variant.tokens)) {
      throw new Error(`Theme variant ${id} must define a tokens object`);
    }
    if (seenSelectors.has(variant.selector)) {
      throw new Error(`Duplicate theme selector ${variant.selector} at ${seenSelectors.get(variant.selector)} and ${id}`);
    }
    seenSelectors.set(variant.selector, id);

    const declarations = [];
    for (const [path, value] of Object.entries(variant.tokens)) {
      const target = tokens.get(path);
      if (!target) throw new Error(`Theme variant ${id} references unknown token ${path}`);
      if (typeof value !== "string") throw new Error(`Theme variant ${id} token ${path} must be a string`);
      if (tokenLayers.get(path) === "base") invalidBoundaries.push({ theme: id, token: path, layer: "base" });
      declarations.push([target.cssVariable, cssValue(value, tokens, `${id}.${path}`)]);
    }
    variants.push({ id, ...variant, declarations });
  }

  return { defaultTheme, variants, invalidBoundaries };
}

function collectExactCssVariableStrings(value, path = [], output = []) {
  if (typeof value === "string") {
    if (/^--[a-z0-9-]+$/.test(value) && path.at(-1) !== "tokenPrefix") {
      output.push({ path: path.join("."), token: value });
    }
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectExactCssVariableStrings(item, [...path, String(index)], output));
    return output;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) collectExactCssVariableStrings(child, [...path, key], output);
  }
  return output;
}

async function validateManifestReferences(layout, cssVariables) {
  const references = [];
  const unresolved = [];
  for (const manifest of layout.manifests) {
    const text = await readOptional(manifest.path);
    if (!text) throw new Error(`Missing ${manifest.name}: ${relativePath(layout, manifest.path)}`);
    let document;
    try {
      document = JSON.parse(text);
    } catch (error) {
      throw new Error(`Invalid JSON in ${manifest.name}: ${error.message}`);
    }
    const manifestReferences = collectExactCssVariableStrings(document);
    for (const reference of manifestReferences) {
      const item = { manifest: manifest.name, ...reference };
      references.push(item);
      if (!cssVariables.has(reference.token)) unresolved.push(item);
    }
  }
  return { checked: references.length, unresolved };
}

async function validatePreview(layout) {
  const text = await readOptional(layout.preview);
  if (!text) return [];
  const violations = [];
  const patterns = [
    { name: "data-token-value fallback", pattern: /data-token-value="--[^"]+">\s*#[0-9a-f]{3,8}/gi },
    { name: "palette contract fallback", pattern: /<dd><i class="contract-swatch[^>]+><\/i>\s*#[0-9a-f]{3,8}/gi },
    { name: "theme status fallback", pattern: /id="visualizationThemeStatus"[^>]*>[^<]*#[0-9a-f]{3,8}/gi },
  ];
  for (const { name, pattern } of patterns) {
    const count = [...text.matchAll(pattern)].length;
    if (count > 0) violations.push(`${relativePath(layout, layout.preview)} contains ${count} ${name} value(s)`);
  }
  return violations;
}

function generateCss(tokens, tokenLayers, themes) {
  const lines = [
    "/*",
    " * Generated from tokens.json by sync-tokens.mjs.",
    " * Do not edit this file directly.",
    " */",
    "",
    ":root {",
    `  color-scheme: ${themes.defaultTheme.mode};`,
    "",
  ];

  for (const layer of TAXONOMY_LAYERS) {
    lines.push(`  /* ${layer} */`);
    for (const [path, token] of tokens) {
      if (tokenLayers.get(path) === layer) lines.push(`  ${token.cssVariable}: ${cssValue(token.value, tokens, path)};`);
    }
    lines.push("");
  }
  if (lines.at(-1) === "") lines.pop();
  lines.push("}");

  for (const variant of themes.variants) {
    lines.push("", `${variant.selector} {`, `  /* ${variant.id}: ${variant.palette} / ${variant.mode} */`, `  color-scheme: ${variant.mode};`);
    for (const [name, value] of variant.declarations) lines.push(`  ${name}: ${value};`);
    lines.push("}");
  }
  return `${lines.join("\n")}\n`;
}

function generateTypescript(document, tokens, tokenLayers) {
  const values = {};
  const cssVariables = {};
  const layers = {};
  for (const [path, token] of tokens) {
    values[path] = token.value;
    cssVariables[path] = token.cssVariable;
    layers[path] = tokenLayers.get(path);
  }
  const themeOverrides = Object.fromEntries(
    Object.entries(document.themes.variants || {}).map(([id, variant]) => [id, {
      selector: variant.selector,
      palette: variant.palette,
      mode: variant.mode,
      tokens: variant.tokens,
    }]),
  );
  const serialize = (value) => JSON.stringify(value, null, 2);

  return `/*\n * Generated from tokens.json by sync-tokens.mjs.\n * Do not edit this file directly.\n */\n\nexport const tokenValues = ${serialize(values)} as const;\n\nexport const tokenCssVariables = ${serialize(cssVariables)} as const;\n\nexport const tokenLayers = ${serialize(layers)} as const;\n\nexport const themeOverrides = ${serialize(themeOverrides)} as const;\n\nexport type TokenPath = keyof typeof tokenValues;\nexport type TokenLayer = ${TAXONOMY_LAYERS.map((layer) => JSON.stringify(layer)).join(" | ")};\nexport type ThemeId = keyof typeof themeOverrides;\nexport type ThemeMode = "light" | "dark";\n\nexport function tokenVar(path: TokenPath): string {\n  return \`var(\${tokenCssVariables[path]})\`;\n}\n`;
}

function generateSchema() {
  const taxonomyProperties = Object.fromEntries(TAXONOMY_LAYERS.map((layer) => [layer, {
    type: "array",
    minItems: 1,
    uniqueItems: true,
    items: { type: "string", minLength: 1 },
  }]));
  const schema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://design-consultant.local/schemas/tokens.schema.json",
    title: "Design Consultant Token Source",
    description: "The only editable source for generated CSS and TypeScript design tokens.",
    type: "object",
    required: ["$schema", "meta", "taxonomy", "themes", "tokens"],
    properties: {
      $schema: { const: "./tokens.schema.json" },
      meta: {
        type: "object",
        required: ["name", "version", "sourceOfTruth", "colorMode"],
        properties: {
          name: { type: "string", minLength: 1 },
          version: { type: "string", pattern: "^[0-9]+\\.[0-9]+\\.[0-9]+$" },
          sourceOfTruth: { const: "tokens.json" },
          colorMode: { const: "light-dark" },
        },
        additionalProperties: true,
      },
      taxonomy: {
        type: "object",
        required: TAXONOMY_LAYERS,
        properties: taxonomyProperties,
        additionalProperties: false,
      },
      themes: {
        type: "object",
        required: ["default", "variants"],
        properties: {
          default: { $ref: "#/$defs/themeIdentity" },
          variants: {
            type: "object",
            additionalProperties: { $ref: "#/$defs/themeVariant" },
          },
        },
        additionalProperties: false,
      },
      tokens: {
        type: "object",
        minProperties: 1,
        additionalProperties: { $ref: "#/$defs/tokenNode" },
      },
      principles: {},
      components: {},
      enforcement: {},
    },
    additionalProperties: false,
    $defs: {
      tokenLeaf: {
        type: "object",
        required: ["value", "cssVariable"],
        properties: {
          value: { type: "string" },
          cssVariable: { type: "string", pattern: "^--[a-z0-9-]+$" },
          role: { type: "string" },
        },
        additionalProperties: true,
      },
      tokenNode: {
        oneOf: [
          { $ref: "#/$defs/tokenLeaf" },
          {
            type: "object",
            minProperties: 1,
            properties: {
              description: { type: "string" },
            },
            additionalProperties: { $ref: "#/$defs/tokenNode" },
          },
        ],
      },
      themeIdentity: {
        type: "object",
        required: ["palette", "mode"],
        properties: {
          palette: { type: "string", minLength: 1 },
          mode: { enum: ["light", "dark"] },
        },
        additionalProperties: false,
      },
      themeVariant: {
        type: "object",
        required: ["selector", "palette", "mode", "tokens"],
        properties: {
          selector: { type: "string", minLength: 1 },
          palette: { type: "string", minLength: 1 },
          mode: { enum: ["light", "dark"] },
          tokens: { type: "object", additionalProperties: { type: "string" } },
        },
        additionalProperties: false,
      },
    },
  };
  return `${JSON.stringify(schema, null, 2)}\n`;
}

function normalizedLines(value) {
  const withoutFinalNewline = value.endsWith("\n") ? value.slice(0, -1) : value;
  return withoutFinalNewline ? withoutFinalNewline.split("\n") : [];
}

function lineDiff(actual, expected) {
  const actualLines = normalizedLines(actual);
  const expectedLines = normalizedLines(expected);
  const result = [];
  const length = Math.max(actualLines.length, expectedLines.length);
  for (let index = 0; index < length; index += 1) {
    const actualLine = index < actualLines.length ? actualLines[index] : null;
    const expectedLine = index < expectedLines.length ? expectedLines[index] : null;
    if (actualLine !== expectedLine) result.push({ line: index + 1, expected: expectedLine, actual: actualLine });
  }
  return result;
}

async function inspectArtifact(layout, path, expected) {
  const actual = await readOptional(path);
  if (actual === null) return { path: relativePath(layout, path), status: "missing", diff: [] };
  const diff = lineDiff(actual, expected);
  return { path: relativePath(layout, path), status: diff.length === 0 ? "current" : "stale", diff };
}

function normalizeHexColor(input) {
  const match = input.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) throw new Error(`Contrast checks require a hex color, found ${input}`);
  return match[1].length === 3
    ? `#${[...match[1]].map((channel) => channel.repeat(2)).join("")}`
    : `#${match[1]}`;
}

function relativeLuminance(input) {
  const hex = normalizeHexColor(input);
  const channels = [1, 3, 5]
    .map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground, background) {
  const values = [relativeLuminance(foreground), relativeLuminance(background)].sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function calculateContrast(document, tokens, resolveLiteral) {
  const pairs = [
    ["text", "bg"],
    ["textMuted", "surfaceMuted"],
    ["textSoft", "bg"],
    ["textInverse", "surfaceInverse"],
    ["textInverse", "primary"],
    ["secondary", "secondarySoft"],
    ["success", "successSoft"],
    ["warning", "warningSoft"],
    ["danger", "dangerSoft"],
    ["info", "infoSoft"],
  ];

  function literalValue(path, override) {
    const value = override?.tokens?.[path] ?? tokens.get(path)?.value;
    if (value === undefined) throw new Error(`Missing contrast token ${path}`);
    const reference = referenceFrom(value);
    return reference ? resolveLiteral(reference) : value;
  }

  function forTheme(variant) {
    return Object.fromEntries(pairs.map(([foreground, background]) => {
      const ratio = contrastRatio(
        literalValue(`color.${foreground}`, variant),
        literalValue(`color.${background}`, variant),
      );
      return [`${foreground}/${background}`, Number(ratio.toFixed(2))];
    }));
  }

  return {
    contrast: forTheme(null),
    themeContrast: Object.fromEntries(
      Object.entries(document.themes.variants || {}).map(([id, variant]) => [id, forTheme(variant)]),
    ),
  };
}

function countAddedCssVariables(actualCss, tokens) {
  if (!actualCss) return tokens.size;
  const existing = new Set([...actualCss.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)].map((match) => match[1]));
  return [...tokens.values()].filter((token) => !existing.has(token.cssVariable)).length;
}

function outputFailure(command, layout, error, extra = {}) {
  const errors = Array.isArray(error) ? error : [error instanceof Error ? error.message : String(error)];
  console.log(JSON.stringify({
    ok: false,
    command,
    mode: command === "build" ? "write" : command,
    layout: layout?.kind,
    source: layout ? relativePath(layout, layout.source) : undefined,
    errors,
    issues: errors,
    ...extra,
  }, null, 2));
  process.exitCode = 1;
}

async function main() {
  let parsed;
  let layout;
  try {
    parsed = parseArguments(process.argv.slice(2));
    const trustedSkillSource = await isTrustedSkillSourceRoot(parsed.root);
    const lock = trustedSkillSource ? null : await readLock(parsed.root);
    if (!trustedSkillSource && await isAdoptionWorkspace(parsed.root, lock)) {
      layout = { kind: "adoption-token-bridge", root: parsed.root, source: resolve(parsed.root, "adoption/adoption-plan.json") };
      const { validateAdoptionContract } = await import("./check-adoption-contract.mjs");
      const validation = await validateAdoptionContract(parsed.root);
      console.log(JSON.stringify({
        ok: validation.ok,
        command: parsed.command,
        mode: "check",
        layout: "adoption-token-bridge",
        source: "adoption/adoption-plan.json",
        updated: false,
        artifacts: ["tokens/external-map.json", "tokens/external-bridge.css"],
        errors: validation.issues.map((item) => item.message),
        issues: validation.issues,
      }, null, 2));
      if (!validation.ok) process.exitCode = 1;
      return;
    }
    if (!trustedSkillSource && !hasTrustedGreenfieldProvenance(lock)) {
      layout = { kind: "untrusted-generated-design-system", root: parsed.root, source: resolve(parsed.root, "tokens/tokens.json") };
      outputFailure(parsed.command, layout, "Native token sync requires trusted greenfield init workflow provenance");
      return;
    }
    layout = await resolveLayout(parsed.root);
    const sourceText = await readOptional(layout.source);
    if (!sourceText) throw new Error(`Missing token source: ${relativePath(layout, layout.source)}`);
    const document = JSON.parse(sourceText);
    if (document.$schema !== "./tokens.schema.json") {
      throw new Error('tokens.json must declare "$schema": "./tokens.schema.json"');
    }
    if (document.meta?.sourceOfTruth !== "tokens.json") throw new Error('meta.sourceOfTruth must be "tokens.json"');

    const { tokens, cssVariables } = collectTokens(document.tokens);
    const tokenLayers = classifyTokens(document, tokens);
    const resolveLiteral = validateTokenReferences(tokens);
    const themes = validateThemes(document, tokens, tokenLayers);
    const manifestReferences = await validateManifestReferences(layout, cssVariables);
    const previewViolations = await validatePreview(layout);
    const validation = {
      taxonomy: {
        layers: Object.fromEntries(TAXONOMY_LAYERS.map((layer) => [layer, [...tokenLayers.values()].filter((value) => value === layer).length])),
        unassigned: [],
      },
      themes: { invalidBoundaries: themes.invalidBoundaries },
      manifestReferences,
      preview: { violations: previewViolations },
    };
    const validationErrors = [
      ...themes.invalidBoundaries.map(({ theme, token }) => `Theme ${theme} cannot override base token ${token}`),
      ...manifestReferences.unresolved.map(({ manifest, path, token }) => `${manifest} ${path} references unknown token ${token}`),
      ...previewViolations,
    ];
    if (validationErrors.length > 0) {
      outputFailure(parsed.command, layout, validationErrors, { validation });
      return;
    }

    const expected = {
      css: generateCss(tokens, tokenLayers, themes),
      typescript: generateTypescript(document, tokens, tokenLayers),
      schema: generateSchema(),
    };
    const artifacts = [];
    for (const [kind, path] of Object.entries(layout.outputs)) {
      artifacts.push(await inspectArtifact(layout, path, expected[kind]));
    }
    const { contrast, themeContrast } = calculateContrast(document, tokens, resolveLiteral);
    const contrastErrors = [
      ...Object.entries(contrast).filter(([, ratio]) => ratio < 4.5).map(([pair, ratio]) => `${pair} contrast ${ratio.toFixed(2)} is below 4.5:1`),
      ...Object.entries(themeContrast).flatMap(([theme, pairs]) => Object.entries(pairs)
        .filter(([, ratio]) => ratio < 4.5)
        .map(([pair, ratio]) => `${theme} ${pair} contrast ${ratio.toFixed(2)} is below 4.5:1`)),
    ];
    if (contrastErrors.length > 0) {
      outputFailure(parsed.command, layout, contrastErrors, { validation, contrast, themeContrast, artifacts });
      return;
    }

    const changedArtifacts = artifacts.filter(({ status }) => status !== "current");
    const mismatchCount = changedArtifacts.reduce((total, artifact) => total + artifact.diff.length, 0);
    const oldCss = await readOptional(layout.outputs.css);
    const added = countAddedCssVariables(oldCss, tokens);
    if (parsed.command === "build") {
      for (const [kind, path] of Object.entries(layout.outputs)) {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, expected[kind], "utf8");
      }
      for (const artifact of artifacts) {
        artifact.changedLines = artifact.diff.length;
        artifact.previousStatus = artifact.status;
        artifact.status = artifact.status === "missing" ? "created" : artifact.status === "stale" ? "updated" : "current";
        artifact.diff = [];
      }
    }

    const ok = parsed.command === "build" || changedArtifacts.length === 0;
    const errors = ok ? [] : changedArtifacts.map(({ path, status }) => `${path} is ${status}`);
    console.log(JSON.stringify({
      ok,
      command: parsed.command,
      mode: parsed.command === "build" ? "write" : parsed.command,
      layout: layout.kind,
      source: relativePath(layout, layout.source),
      variables: tokens.size,
      updated: parsed.command === "build" && changedArtifacts.length > 0,
      added: parsed.command === "build" ? added : 0,
      mismatches: mismatchCount,
      artifacts,
      validation,
      contrast,
      themeContrast,
      errors,
      issues: errors,
    }, null, 2));
    if (!ok) process.exitCode = 1;
  } catch (error) {
    outputFailure(parsed?.command || "build", layout, error);
  }
}

await main();
