import { access, lstat, readFile, readdir, realpath } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { generate as generateCss, parse as parseCss, walk as walkCss } from "css-tree";

function requireInstalledTypeScript(subpath) {
  const candidates = [createRequire(import.meta.url), createRequire(resolve(process.cwd(), "package.json"))];
  for (const require of candidates) {
    try {
      return require(subpath);
    } catch (error) {
      if (!new Set(["MODULE_NOT_FOUND", "ERR_PACKAGE_PATH_NOT_EXPORTED"]).has(error.code)) throw error;
    }
  }
  throw new Error(`The installed TypeScript compiler API is required for component export evidence (${subpath}).`);
}

const { API, SymbolFlags } = requireInstalledTypeScript("typescript/unstable/sync");
const { SyntaxKind } = requireInstalledTypeScript("typescript/unstable/ast");
const {
  isClassDeclaration,
  isExportAssignment,
  isExportDeclaration,
  isFunctionDeclaration,
  isImportDeclaration,
  isJsxOpeningElement,
  isJsxSelfClosingElement,
  isNamedExports,
} = requireInstalledTypeScript("typescript/unstable/ast/is");

const SOURCE_EXTENSIONS = new Set([
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".pcss",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".vue",
  ".svelte",
]);
const CSS_EXTENSIONS = new Set([".css", ".scss", ".sass", ".less", ".pcss"]);
const CSS_PREPROCESSOR_EXTENSIONS = new Set([".scss", ".sass", ".less"]);
const COMPONENT_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".vue", ".svelte"]);
const SOURCE_DIRECTORY_CANDIDATES = ["src", "app", "components", "styles", "packages", "apps"];
const SHARED_COMPONENT_DIRECTORY_CANDIDATES = [
  "src/components/ui",
  "src/components",
  "src/ui",
  "app/components",
  "app/ui",
  "components/ui",
  "components",
  "ui",
];
const WORKSPACE_DIRECTORY_CANDIDATES = ["apps", "packages"];
const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".nuxt",
  ".svelte-kit",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target",
]);

function toPosixPath(value) {
  return value.split(sep).join("/");
}

function compareStable(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isInside(parent, child) {
  const pathFromParent = relative(parent, child);
  return pathFromParent !== "" && !pathFromParent.startsWith(`..${sep}`) && pathFromParent !== ".." && !isAbsolute(pathFromParent);
}

function isInsideOrEqual(parent, child) {
  return relative(parent, child) === "" || isInside(parent, child);
}

async function optionalLstat(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function fileExists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function lineAt(content, offset) {
  return content.slice(0, offset).split("\n").length;
}

function selectorThemeMode(rule) {
  let explicit = null;
  walkCss(rule.prelude, (node) => {
    if (explicit || node.type !== "AttributeSelector") return;
    const name = node.name?.name?.toLowerCase();
    const value = node.value?.value?.toLowerCase() ?? node.value?.name?.toLowerCase();
    if ((name === "data-theme" || name === "data-mode") && (value === "light" || value === "dark")) explicit = value;
  });
  if (explicit) return explicit;
  walkCss(rule.prelude, (node) => {
    if (!explicit && node.type === "ClassSelector" && node.name.toLowerCase() === "dark") explicit = "dark";
  });
  return explicit;
}

function declarationThemeMode(rule) {
  let explicit = null;
  rule.block.children.forEach((node) => {
    if (node.type !== "Declaration" || node.property.toLowerCase() !== "color-scheme") return;
    const value = generateCss(node.value).trim().toLowerCase();
    if (value === "light" || value === "dark") explicit = value;
  });
  return explicit;
}

function mediaThemeMode(atrule) {
  if (atrule.name.toLowerCase() !== "media" || !atrule.prelude) return null;
  let explicit = null;
  walkCss(atrule.prelude, (node) => {
    if (explicit || node.type !== "Feature" || node.name.toLowerCase() !== "prefers-color-scheme") return;
    const value = node.value?.name?.toLowerCase();
    if (value === "light" || value === "dark") explicit = value;
  });
  return explicit;
}

function observedThemeMode(ruleStack, mediaStack) {
  const declarationMode = declarationThemeMode(ruleStack.at(-1));
  if (declarationMode) return declarationMode;
  for (let index = ruleStack.length - 1; index >= 0; index -= 1) {
    const selectorMode = selectorThemeMode(ruleStack[index]);
    if (selectorMode) return selectorMode;
  }
  for (let index = mediaStack.length - 1; index >= 0; index -= 1) {
    if (mediaStack[index]) return mediaStack[index];
  }
  return generateCss(ruleStack.at(-1).prelude).trim() === ":root" ? "light" : null;
}

function stripComments(content, { lineComments, templateLiterals, htmlComments = false }) {
  let result = "";
  const contexts = [{ type: "code" }];
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    const next = content[index + 1];
    const context = contexts.at(-1);
    if (context.type === "block-comment") {
      if (character === "*" && next === "/") {
        result += "  ";
        index += 1;
        contexts.pop();
      } else {
        result += /[\r\n]/.test(character) ? character : " ";
      }
      continue;
    }
    if (context.type === "html-comment") {
      if (character === "-" && content.slice(index, index + 3) === "-->") {
        result += "   ";
        index += 2;
        contexts.pop();
      } else {
        result += /[\r\n]/.test(character) ? character : " ";
      }
      continue;
    }
    if (context.type === "line-comment") {
      result += /[\r\n]/.test(character) ? character : " ";
      if (character === "\n" || character === "\r") contexts.pop();
      continue;
    }
    if (context.type === "single-quote" || context.type === "double-quote") {
      result += character;
      if (character === "\\" && next !== undefined) {
        result += next;
        index += 1;
      } else if ((context.type === "single-quote" && character === "'") || (context.type === "double-quote" && character === '"')) {
        contexts.pop();
      }
      continue;
    }
    if (context.type === "template") {
      result += character;
      if (character === "\\" && next !== undefined) {
        result += next;
        index += 1;
      } else if (character === "`") {
        contexts.pop();
      } else if (character === "$" && next === "{") {
        result += next;
        index += 1;
        contexts.push({ type: "template-expression", braceDepth: 1 });
      }
      continue;
    }
    if (character === "/" && next === "*") {
      result += "  ";
      index += 1;
      contexts.push({ type: "block-comment" });
    } else if (lineComments && character === "/" && next === "/") {
      result += "  ";
      index += 1;
      contexts.push({ type: "line-comment" });
    } else if (htmlComments && content.slice(index, index + 4) === "<!--") {
      result += "    ";
      index += 3;
      contexts.push({ type: "html-comment" });
    } else {
      result += character;
      if (character === "'") contexts.push({ type: "single-quote" });
      else if (character === '"') contexts.push({ type: "double-quote" });
      else if (templateLiterals && character === "`") contexts.push({ type: "template" });
      else if (context.type === "template-expression" && character === "{") context.braceDepth += 1;
      else if (context.type === "template-expression" && character === "}" && --context.braceDepth === 0) contexts.pop();
    }
  }
  return result;
}

function stripCssComments(content) {
  return stripComments(content, { lineComments: false, templateLiterals: false });
}

function stripComponentComments(content, file) {
  const extension = extname(file).toLowerCase();
  return stripComments(content, {
    lineComments: true,
    templateLiterals: true,
    htmlComments: extension === ".vue" || extension === ".svelte",
  });
}

function uniqueSorted(values) {
  return [...new Set(values)].sort(compareStable);
}

const TYPESCRIPT_VALUE_FLAGS = SymbolFlags.Function
  | SymbolFlags.Class
  | SymbolFlags.Variable
  | SymbolFlags.ValueModule
  | SymbolFlags.Enum;

function normalizedAbsolute(path) {
  return resolve(path).replaceAll("\\", "/").toLowerCase();
}

function makeTypeScriptEvidenceFileSystem(files) {
  const content = new Map(Object.entries(files).map(([path, value]) => [normalizedAbsolute(path), value]));
  const originalPaths = new Map(Object.keys(files).map((path) => [normalizedAbsolute(path), resolve(path)]));
  const directories = new Set();
  for (const path of originalPaths.values()) {
    let current = dirname(path);
    while (current !== dirname(current)) {
      directories.add(normalizedAbsolute(current));
      current = dirname(current);
    }
  }
  return {
    readFile(path) {
      return content.has(normalizedAbsolute(path)) ? content.get(normalizedAbsolute(path)) : undefined;
    },
    fileExists(path) {
      return content.has(normalizedAbsolute(path)) ? true : undefined;
    },
    directoryExists(path) {
      return directories.has(normalizedAbsolute(path)) ? true : undefined;
    },
    realpath(path) {
      return originalPaths.get(normalizedAbsolute(path));
    },
  };
}

function semanticInput({ file, relativePath, content }, index) {
  const extension = extname(file).toLowerCase();
  const isSingleFileComponent = extension === ".vue" || extension === ".svelte";
  const source = isSingleFileComponent
    ? componentScriptSource(stripComponentComments(content, file), file)
    : content;
  const absoluteFile = isAbsolute(file) ? resolve(file) : resolve(process.cwd(), ".design-consultant-inventory", `${index}-${basename(file)}`);
  const semanticPath = isSingleFileComponent ? `${absoluteFile}.tsx` : absoluteFile;
  return { file, relativePath, content, source, semanticPath };
}

function explicitTypeOnlyExports(sourceFile) {
  const names = new Set();
  for (const statement of sourceFile.statements) {
    if (!isExportDeclaration(statement) || !statement.exportClause || !isNamedExports(statement.exportClause)) continue;
    for (const specifier of statement.exportClause.elements) {
      if (statement.isTypeOnly || specifier.isTypeOnly) names.add(specifier.name.text);
    }
  }
  return names;
}

function staticModuleSyntax(sourceFile) {
  const externalImports = [];
  const reExports = [];
  let defaultExportLocalName = null;
  for (const statement of sourceFile.statements) {
    if ((isClassDeclaration(statement) || isFunctionDeclaration(statement))
      && statement.modifiers?.some((modifier) => modifier.kind === SyntaxKind.DefaultKeyword)) {
      defaultExportLocalName = statement.name?.text ?? null;
    } else if (isExportAssignment(statement) && !statement.isExportEquals) {
      defaultExportLocalName = statement.expression?.text ?? null;
    }
    if (isImportDeclaration(statement)) {
      const specifier = statement.moduleSpecifier?.text;
      if (typeof specifier === "string" && !specifier.startsWith(".") && !specifier.startsWith("/")) externalImports.push(specifier);
    } else if (isExportDeclaration(statement) && statement.moduleSpecifier) {
      const specifier = statement.moduleSpecifier.text;
      if (typeof specifier === "string" && !specifier.startsWith(".") && !specifier.startsWith("/")) externalImports.push(specifier);
      if (statement.exportClause && isNamedExports(statement.exportClause)) {
        reExports.push(...statement.exportClause.elements.map((entry) => entry.name.text));
        const defaultSpecifier = statement.exportClause.elements.find((entry) => entry.name.text === "default");
        if (defaultSpecifier) defaultExportLocalName = defaultSpecifier.propertyName?.text ?? null;
      } else {
        reExports.push(statement.exportClause?.name?.text ?? "*");
      }
    }
  }
  return { externalImports: uniqueSorted(externalImports), reExports: uniqueSorted(reExports), defaultExportLocalName };
}

function displayDefaultExport(target) {
  const declarationName = target.valueDeclaration?.name?.text;
  if (declarationName) return declarationName;
  return target.name && target.name !== "default" ? target.name : "default";
}

function semanticJsxRoles(sourceFile) {
  const roles = [];
  const visit = (node) => {
    if (isJsxOpeningElement(node) || isJsxSelfClosingElement(node)) {
      const name = node.tagName?.text ?? node.tagName?.name?.text;
      if (name) roles.push(name);
    }
    node.forEachChild(visit);
  };
  sourceFile.forEachChild(visit);
  return uniqueSorted(roles);
}

function collectSemanticModuleEvidence(inputs) {
  if (inputs.length === 0) return [];
  const prepared = inputs.map(semanticInput);
  const cwd = isAbsolute(prepared[0].file) ? dirname(prepared[0].semanticPath) : process.cwd();
  const configPath = resolve(cwd, ".design-consultant-inventory-tsconfig.json");
  const virtualFiles = Object.fromEntries(prepared.map((input) => [input.semanticPath, input.source]));
  virtualFiles[configPath] = `${JSON.stringify({
    compilerOptions: {
      allowJs: true,
      checkJs: false,
      jsx: "preserve",
      module: "esnext",
      moduleResolution: "bundler",
      target: "es2022",
    },
    files: prepared.map((input) => input.semanticPath),
  }, null, 2)}\n`;
  const api = new API({ cwd, fs: makeTypeScriptEvidenceFileSystem(virtualFiles) });
  let snapshot;
  try {
    snapshot = api.updateSnapshot({
      openProjects: [configPath],
      openFiles: prepared.map((input) => input.semanticPath),
      fileChanges: { created: Object.keys(virtualFiles) },
    });
    const project = snapshot.getProject(configPath) ?? snapshot.getDefaultProjectForFile(prepared[0].semanticPath);
    if (!project) throw new Error("TypeScript inventory evidence project could not be created.");
    const syntacticallyInvalid = new Set(project.program.getSyntacticDiagnostics()
      .filter((diagnostic) => diagnostic.fileName)
      .map((diagnostic) => normalizedAbsolute(diagnostic.fileName)));
    return prepared.map((input) => {
      const sourceFile = project.program.getSourceFile(input.semanticPath);
      if (!sourceFile) throw new Error(`TypeScript inventory evidence source is unavailable: ${input.relativePath ?? input.file}`);
      const syntax = staticModuleSyntax(sourceFile);
      const typeOnly = explicitTypeOnlyExports(sourceFile);
      const namedExports = [];
      const typeExports = [];
      let defaultExport = null;
      let defaultExportLocalName = null;
      const moduleSymbol = syntacticallyInvalid.has(normalizedAbsolute(input.semanticPath))
        ? null
        : project.checker.getSymbolAtLocation(sourceFile);
      for (const exported of moduleSymbol ? project.checker.getExportsOfModule(moduleSymbol) : []) {
        if (exported.name === "export=") continue;
        const target = exported.flags & SymbolFlags.Alias ? project.checker.getAliasedSymbol(exported) : exported;
        const isValue = !typeOnly.has(exported.name)
          && Boolean(target.flags & TYPESCRIPT_VALUE_FLAGS)
          && Boolean(target.valueDeclaration);
        if (exported.name === "default") {
          if (isValue) {
            defaultExport = "default";
            const localName = syntax.defaultExportLocalName ?? displayDefaultExport(target);
            defaultExportLocalName = localName === "default" ? null : localName;
          }
          else typeExports.push("default");
        } else if (isValue) {
          namedExports.push(exported.name);
        } else {
          typeExports.push(exported.name);
        }
      }
      return {
        input,
        namedExports: uniqueSorted(namedExports),
        typeExports: uniqueSorted(typeExports),
        defaultExport,
        defaultExportLocalName,
        externalImports: syntax.externalImports,
        reExports: syntax.reExports,
        jsxRoles: semanticJsxRoles(sourceFile),
      };
    });
  } finally {
    snapshot?.dispose();
    api.close();
  }
}

function componentScriptSource(content, file) {
  const extension = extname(file).toLowerCase();
  if (extension !== ".vue" && extension !== ".svelte") return content;
  const lower = content.toLowerCase();
  const scripts = [];
  let cursor = 0;
  while (cursor < content.length) {
    const open = lower.indexOf("<script", cursor);
    if (open < 0) break;
    const boundary = lower[open + 7];
    if (boundary && !/[\s>/]/.test(boundary)) {
      cursor = open + 7;
      continue;
    }
    const bodyStart = lower.indexOf(">", open + 7);
    if (bodyStart < 0) break;
    const close = lower.indexOf("</script", bodyStart + 1);
    if (close < 0) break;
    scripts.push(content.slice(bodyStart + 1, close));
    const closeEnd = lower.indexOf(">", close + 8);
    cursor = closeEnd < 0 ? content.length : closeEnd + 1;
  }
  return scripts.join("\n");
}

function countTokenReferences(content, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...content.matchAll(new RegExp(`\\bvar\\(\\s*${escaped}(?=\\s*(?:,|\\)))`, "g"))].length;
}

export function collectCssEvidence({ file, relativePath, content }) {
  const source = stripCssComments(content);
  const parseErrors = [];
  let ast;
  try {
    ast = parseCss(source, {
      positions: true,
      parseCustomProperty: true,
      onParseError(error) {
        parseErrors.push(error);
      },
    });
  } catch {
    return [];
  }
  if (parseErrors.length > 0 && CSS_PREPROCESSOR_EXTENSIONS.has(extname(file).toLowerCase())) return [];

  const items = [];
  const ruleStack = [];
  const mediaStack = [];
  walkCss(ast, {
    enter(node) {
      if (node.type === "Atrule") mediaStack.push(mediaThemeMode(node));
      if (node.type === "Rule") ruleStack.push(node);
      if (node.type !== "Declaration" || !node.property.startsWith("--") || ruleStack.length === 0) return;
      const rule = ruleStack.at(-1);
      const selector = generateCss(rule.prelude).trim().replace(/\s+/g, " ");
      const theme = observedThemeMode(ruleStack, mediaStack);
      const value = node.value.loc
        ? source.slice(node.value.loc.start.offset, node.value.loc.end.offset).trim()
        : generateCss(node.value).trim();
      items.push({
        name: node.property,
        value,
        selector,
        file: relativePath || toPosixPath(file),
        line: node.loc?.start.line ?? 1,
        usageCount: countTokenReferences(source, node.property),
        status: "observed",
        ...(theme ? { theme } : {}),
      });
    },
    leave(node) {
      if (node.type === "Rule") ruleStack.pop();
      if (node.type === "Atrule") mediaStack.pop();
    },
  });
  return items;
}

function componentEvidenceFromSemantic(semantic) {
  const { input, namedExports, typeExports, reExports, defaultExport, defaultExportLocalName, externalImports, jsxRoles } = semantic;
  const exports = [...namedExports, ...(defaultExport ? [defaultExport] : [])];

  return {
    path: input.relativePath || toPosixPath(input.file),
    exports: uniqueSorted(exports),
    namedExports,
    typeExports,
    reExports,
    defaultExport,
    defaultExportLocalName,
    externalImports,
    jsxRoles,
    roles: jsxRoles,
    status: "observed",
  };
}

export function collectComponentEvidence(input) {
  return componentEvidenceFromSemantic(collectSemanticModuleEvidence([input])[0]);
}

export function collectThemeEvidence(cssEvidence) {
  const themes = new Map();
  for (const item of cssEvidence) {
    if (item.theme) {
      const key = `${item.selector}\u0000${item.theme}\u0000${item.file}`;
      if (!themes.has(key)) {
        themes.set(key, {
          selector: item.selector,
          theme: item.theme,
          file: item.file,
          line: item.line,
          status: "observed",
        });
      }
    }
  }
  return [...themes.values()].sort((left, right) => compareStable(`${left.file}:${left.line}`, `${right.file}:${right.line}`));
}

export async function readPackageContext(projectRoot, warnings = [], { readFile: packageReadFile = readFile } = {}) {
  const packagePath = join(projectRoot, "package.json");
  const packageInfo = await optionalLstat(packagePath);
  if (packageInfo === null) {
    return { packageManager: null, frameworks: [], buildTools: [], styling: [], componentLibraries: [], dependencies: [] };
  }
  if (!packageInfo.isFile() || packageInfo.isSymbolicLink()) {
    throw new Error(`package.json source evidence must be an ordinary file and not a symbolic link / junction: ${packagePath}`);
  }

  let packageSource;
  try {
    packageSource = await packageReadFile(packagePath, "utf8");
  } catch (error) {
    throw new Error(`package.json could not be read (${error.code ?? "I/O"}): ${error.message}`);
  }

  let packageJson;
  try {
    packageJson = JSON.parse(packageSource.replace(/^\uFEFF/, ""));
  } catch (error) {
    warnings.push(`package.json 无法解析：${error.message}`);
    return { packageManager: null, frameworks: [], buildTools: [], styling: [], componentLibraries: [], dependencies: [] };
  }

  const dependencyMap = { ...packageJson.dependencies, ...packageJson.devDependencies, ...packageJson.peerDependencies };
  const dependencies = Object.keys(dependencyMap).sort();
  const has = (name) => Object.hasOwn(dependencyMap, name);
  const hasPrefix = (prefix) => dependencies.some((name) => name.startsWith(prefix));
  const frameworks = [];
  if (has("next")) frameworks.push("Next.js");
  if (has("react")) frameworks.push("React");
  if (has("nuxt")) frameworks.push("Nuxt");
  if (has("vue")) frameworks.push("Vue");
  if (has("@sveltejs/kit")) frameworks.push("SvelteKit");
  else if (has("svelte")) frameworks.push("Svelte");
  if (has("@angular/core")) frameworks.push("Angular");
  if (has("solid-js")) frameworks.push("SolidJS");
  const buildTools = [has("vite") && "Vite", has("webpack") && "Webpack", has("parcel") && "Parcel", has("esbuild") && "esbuild"].filter(Boolean);
  const styling = [has("tailwindcss") && "Tailwind CSS", has("sass") && "Sass", has("less") && "Less", has("styled-components") && "styled-components", has("@emotion/react") && "Emotion"].filter(Boolean);
  const componentLibraries = [has("antd") && "Ant Design", has("@mui/material") && "Material UI", has("@chakra-ui/react") && "Chakra UI", has("@fluentui/react-components") && "Fluent UI", has("@carbon/react") && "Carbon", hasPrefix("@radix-ui/") && "Radix UI", hasPrefix("@headlessui/") && "Headless UI", (await fileExists(join(projectRoot, "components.json"))) && "shadcn/ui"].filter(Boolean);
  const packageManager = (await fileExists(join(projectRoot, "pnpm-lock.yaml"))) ? "pnpm" : (await fileExists(join(projectRoot, "yarn.lock"))) ? "yarn" : (await fileExists(join(projectRoot, "bun.lockb")) || await fileExists(join(projectRoot, "bun.lock"))) ? "bun" : (await fileExists(join(projectRoot, "package-lock.json"))) ? "npm" : null;

  return { packageManager, frameworks, buildTools, styling, componentLibraries, dependencies };
}

async function discoverInventoryDirectories(projectRoot, outputRoot) {
  const resolvedProjectRoot = resolve(projectRoot);
  const resolvedOutputRoot = resolve(outputRoot);
  const sourceDirectories = [];
  for (const candidate of SOURCE_DIRECTORY_CANDIDATES) {
    const path = join(resolvedProjectRoot, candidate);
    if (isInsideOrEqual(resolvedOutputRoot, path)) continue;
    const info = await optionalLstat(path);
    if (info?.isSymbolicLink()) throw new Error(`source evidence root is a symbolic link / junction: ${path}`);
    if (info?.isDirectory()) sourceDirectories.push({ path, relativePath: candidate });
    else if (info !== null) throw new Error(`source evidence root is not a directory: ${path}`);
  }

  const workspaceDirectories = [];
  for (const candidate of WORKSPACE_DIRECTORY_CANDIDATES) {
    const container = sourceDirectories.find((directory) => directory.relativePath === candidate);
    if (!container) continue;
    const entries = await readdir(container.path, { withFileTypes: true });
    entries.sort((left, right) => compareStable(left.name, right.name));
    for (const entry of entries) {
      if (IGNORED_DIRECTORIES.has(entry.name) || (!entry.isDirectory() && !entry.isSymbolicLink())) continue;
      const path = join(container.path, entry.name);
      if (isInsideOrEqual(resolvedOutputRoot, path)) continue;
      const info = await lstat(path);
      if (entry.isSymbolicLink() || info.isSymbolicLink()) throw new Error(`source evidence contains a symbolic link / junction: ${path}`);
      if (info.isDirectory()) {
        workspaceDirectories.push({ path, relativePath: toPosixPath(relative(resolvedProjectRoot, path)) });
      }
    }
  }

  const sharedDirectories = [];
  for (const base of [{ path: resolvedProjectRoot, relativePath: "" }, ...workspaceDirectories]) {
    for (const candidate of SHARED_COMPONENT_DIRECTORY_CANDIDATES) {
      const path = join(base.path, candidate);
      if (isInsideOrEqual(resolvedOutputRoot, path)) continue;
      const info = await optionalLstat(path);
      if (info?.isSymbolicLink()) throw new Error(`shared component directory is a symbolic link / junction: ${path}`);
      if (!info?.isDirectory()) continue;
      sharedDirectories.push({
        path,
        relativePath: toPosixPath(join(base.relativePath, candidate)),
      });
    }
  }

  const traversalRoots = [...new Map(
    [...sourceDirectories, ...sharedDirectories].map((directory) => [resolve(directory.path), directory]),
  ).values()];
  return { traversalRoots, sharedDirectories };
}

async function collectSourceFiles(projectRoot, outputRoot, maxFiles) {
  const files = new Set();
  const visited = new Set();
  let evidenceLimitReached = false;
  const resolvedProjectRoot = resolve(projectRoot);
  const resolvedOutputRoot = resolve(outputRoot);
  const { traversalRoots, sharedDirectories } = await discoverInventoryDirectories(resolvedProjectRoot, resolvedOutputRoot);
  const outputInfo = await optionalLstat(resolvedOutputRoot);
  const canonicalOutputRoot = outputInfo && !outputInfo.isSymbolicLink() ? await realpath(resolvedOutputRoot) : null;

  function isOutputPath(path, canonical = null) {
    return isInsideOrEqual(resolvedOutputRoot, resolve(path))
      || (canonicalOutputRoot !== null && canonical !== null && isInsideOrEqual(canonicalOutputRoot, canonical));
  }

  function addEligibleFile(path) {
    const resolvedPath = resolve(path);
    if (files.has(resolvedPath)) return false;
    if (files.size >= maxFiles) {
      evidenceLimitReached = true;
      return true;
    }
    files.add(resolvedPath);
    return false;
  }

  async function walk(directory) {
    if (evidenceLimitReached) return;
    const resolvedDirectory = resolve(directory);
    if (isOutputPath(resolvedDirectory)) return;
    const directoryInfo = await lstat(resolvedDirectory);
    if (directoryInfo.isSymbolicLink()) throw new Error(`source evidence directory is a symbolic link / junction: ${resolvedDirectory}`);
    if (!directoryInfo.isDirectory()) throw new Error(`source evidence path is not a directory: ${resolvedDirectory}`);
    const canonicalDirectory = await realpath(resolvedDirectory);
    if (!isInsideOrEqual(resolvedProjectRoot, canonicalDirectory)) throw new Error(`source evidence directory escapes the project: ${resolvedDirectory}`);
    if (isOutputPath(resolvedDirectory, canonicalDirectory) || visited.has(canonicalDirectory)) return;
    visited.add(canonicalDirectory);
    let entries;
    try {
      entries = await readdir(canonicalDirectory, { withFileTypes: true });
    } catch (error) {
      throw new Error(`source evidence directory could not be read: ${canonicalDirectory}: ${error.message}`);
    }
    entries.sort((left, right) => compareStable(left.name, right.name));
    for (const entry of entries) {
      if (evidenceLimitReached) return;
      const path = join(canonicalDirectory, entry.name);
      if (isOutputPath(path)) continue;
      if (IGNORED_DIRECTORIES.has(entry.name) && (entry.isDirectory() || entry.isSymbolicLink())) continue;
      const info = await lstat(path);
      if (entry.isSymbolicLink() || info.isSymbolicLink()) throw new Error(`source evidence contains a symbolic link / junction: ${path}`);
      if (info.isDirectory()) {
        await walk(path);
      } else if (info.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        if (addEligibleFile(path)) return;
      } else if (!info.isFile()) throw new Error(`source evidence contains an unsupported filesystem node: ${path}`);
    }
  }

  for (const directory of traversalRoots) await walk(directory.path);
  if (traversalRoots.length === 0) await walk(projectRoot);
  const rootEntries = await readdir(projectRoot, { withFileTypes: true });
  rootEntries.sort((left, right) => compareStable(left.name, right.name));
  for (const entry of rootEntries) {
    if (evidenceLimitReached) break;
    const path = join(projectRoot, entry.name);
    if (isOutputPath(path)) continue;
    if (IGNORED_DIRECTORIES.has(entry.name) && (entry.isDirectory() || entry.isSymbolicLink())) continue;
    const info = await lstat(path);
    if (entry.isSymbolicLink() || info.isSymbolicLink()) throw new Error(`root source evidence contains a symbolic link / junction: ${path}`);
    if (info.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase()) && addEligibleFile(path)) break;
  }
  return {
    files: [...files].sort((left, right) => compareStable(toPosixPath(left), toPosixPath(right))),
    evidenceLimitReached,
    sharedDirectories,
  };
}

export async function walkSourceFiles(projectRoot, outputRoot, maxFiles = 2500) {
  return (await collectSourceFiles(projectRoot, outputRoot, maxFiles)).files;
}

function collectStyleCategories(cssEvidence) {
  const typography = cssEvidence.filter((item) => /(?:font|type|text)/i.test(item.name)).map((item) => ({ ...item }));
  const spacingAndRadius = cssEvidence.filter((item) => /(?:space|spacing|gap|radius|round)/i.test(item.name)).map((item) => ({ ...item }));
  return { typography, spacingAndRadius };
}

function observedEvidence(kind, relativePath, source, match) {
  return {
    kind,
    file: relativePath,
    line: lineAt(source, match.index),
    evidence: match[0].trim().replace(/\s+/g, " "),
    status: "observed",
  };
}

function collectStaticBehaviorEvidence(relativePath, source, extension) {
  const interactionStates = [];
  const accessibility = [];
  if (CSS_EXTENSIONS.has(extension)) {
    const selectors = [...source.matchAll(/([^{}]+)\{/g)];
    const interactionPatterns = [
      ["hover", /:hover\b/i],
      ["focus", /:focus(?:-visible|-within)?\b/i],
      ["active", /:active\b/i],
      ["disabled", /:disabled\b|\[disabled(?:\s*[=\]])/i],
      ["loading", /\[(?:data-loading|aria-busy)(?:\s*[=\]])|\.loading\b/i],
    ];
    for (const match of selectors) {
      for (const [kind, pattern] of interactionPatterns) {
        if (pattern.test(match[1])) interactionStates.push(observedEvidence(kind, relativePath, source, match));
      }
      if (/:focus-visible\b/i.test(match[1])) accessibility.push(observedEvidence("focus-visible", relativePath, source, match));
    }
  } else {
    const interactionPatterns = [
      ["disabled", /\bdisabled\s*=/gi],
      ["loading", /\b(?:aria-busy|data-loading)\s*=/gi],
    ];
    const accessibilityPatterns = [
      ["keyboard", /\bonKey(?:Down|Up|Press)\s*=|\baddEventListener\s*\(\s*["']key(?:down|up|press)["']/gi],
      ["semantic-aria", /\b(?:aria-[A-Za-z0-9_-]+|role|htmlFor)\s*=|<label\b/gi],
    ];
    for (const [kind, pattern] of interactionPatterns) {
      for (const match of source.matchAll(pattern)) interactionStates.push(observedEvidence(kind, relativePath, source, match));
    }
    for (const [kind, pattern] of accessibilityPatterns) {
      for (const match of source.matchAll(pattern)) accessibility.push(observedEvidence(kind, relativePath, source, match));
    }
  }
  return { interactionStates, accessibility };
}

function uniqueEvidence(items) {
  return [...new Map(items.map((item) => [`${item.kind}\u0000${item.file}\u0000${item.line}\u0000${item.evidence}`, item])).values()]
    .sort((left, right) => compareStable(
      `${left.kind}\u0000${left.file}\u0000${left.line}\u0000${left.evidence}`,
      `${right.kind}\u0000${right.file}\u0000${right.line}\u0000${right.evidence}`,
    ));
}

function collectDarkModeRuntimeEvidence(relativePath, source) {
  const usage = [];
  const config = [];
  const usagePatterns = [
    /(?:data-theme|data-mode|dataset\.theme)\s*(?:=|:)\s*["'`]dark["'`]/gi,
    /\b(?:className|class)\s*=\s*["'`][^"'`]*\bdark\b[^"'`]*["'`]/gi,
  ];
  for (const pattern of usagePatterns) {
    for (const match of source.matchAll(pattern)) {
      usage.push({ file: relativePath, line: lineAt(source, match.index), evidence: match[0], status: "observed" });
    }
  }
  for (const match of source.matchAll(/\bdarkMode\s*:\s*(?:["'`]([^"'`]+)["'`]|\[([^\]]+)\])/gi)) {
    config.push({ file: relativePath, line: lineAt(source, match.index), evidence: match[0], status: "observed" });
  }
  return { usage, config };
}

export async function collectSystemInventory({ projectRoot, outputRoot, maxFiles = 2500, packageReadFile = readFile }) {
  const resolvedProjectRoot = resolve(projectRoot);
  const resolvedOutputRoot = resolve(outputRoot);
  const warnings = [];
  const { files, evidenceLimitReached, sharedDirectories } = await collectSourceFiles(resolvedProjectRoot, resolvedOutputRoot, maxFiles);
  const packageContext = await readPackageContext(resolvedProjectRoot, warnings, { readFile: packageReadFile });
  const cssEvidence = [];
  const components = [];
  const themeUsage = [];
  const themeConfig = [];
  const interactionStates = [];
  const accessibility = [];
  const sources = [];
  const componentInputs = [];
  for (const file of files) {
    let content;
    try {
      content = await readFile(file, "utf8");
    } catch (error) {
      throw new Error(`source evidence file could not be read: ${file}: ${error.message}`);
    }
    const extension = extname(file).toLowerCase();
    const source = CSS_EXTENSIONS.has(extension) ? stripCssComments(content) : stripComponentComments(content, file);
    const relativePath = toPosixPath(relative(resolvedProjectRoot, file));
    sources.push(source);
    const behaviorEvidence = collectStaticBehaviorEvidence(relativePath, source, extension);
    interactionStates.push(...behaviorEvidence.interactionStates);
    accessibility.push(...behaviorEvidence.accessibility);
    if (CSS_EXTENSIONS.has(extension)) cssEvidence.push(...collectCssEvidence({ file, relativePath, content }));
    if (COMPONENT_EXTENSIONS.has(extension)) {
      const darkModeEvidence = collectDarkModeRuntimeEvidence(relativePath, source);
      themeUsage.push(...darkModeEvidence.usage);
      themeConfig.push(...darkModeEvidence.config);
      componentInputs.push({ file, relativePath, content });
    }
  }
  components.push(...collectSemanticModuleEvidence(componentInputs).map(componentEvidenceFromSemantic));

  const usageCounts = new Map();
  for (const item of cssEvidence) {
    if (!usageCounts.has(item.name)) usageCounts.set(item.name, sources.reduce((count, source) => count + countTokenReferences(source, item.name), 0));
  }
  for (const item of cssEvidence) item.usageCount = usageCounts.get(item.name);
  cssEvidence.sort((left, right) => compareStable(`${left.name}:${left.file}:${left.line}`, `${right.name}:${right.file}:${right.line}`));
  components.sort((left, right) => compareStable(left.path, right.path));

  const sharedComponentDirectories = [];
  for (const directory of sharedDirectories) {
    const sourceFileCount = files.filter((file) => isInsideOrEqual(directory.path, file) && COMPONENT_EXTENSIONS.has(extname(file).toLowerCase())).length;
    sharedComponentDirectories.push({ path: directory.relativePath, sourceFileCount });
  }
  const existingDesignArtifacts = [];
  for (const candidate of ["DESIGN.md", "tokens.json", "tokens.css", "design-tokens.css", "components.json"]) {
    const path = resolve(resolvedProjectRoot, candidate);
    if (path !== resolvedOutputRoot && !isInside(resolvedOutputRoot, path) && await fileExists(path)) {
      existingDesignArtifacts.push(candidate);
    }
  }
  const cssCustomProperties = [...new Map(cssEvidence.map((item) => [item.name, item])).keys()].sort().map((name) => ({ name, files: uniqueSorted(cssEvidence.filter((item) => item.name === name).map((item) => item.file)) }));
  const categories = collectStyleCategories(cssEvidence);
  const themes = collectThemeEvidence(cssEvidence);

  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    project: { name: basename(resolvedProjectRoot), root: ".", output: toPosixPath(relative(resolvedProjectRoot, resolvedOutputRoot)) },
    detected: {
      packageManager: packageContext.packageManager,
      frameworks: packageContext.frameworks,
      buildTools: packageContext.buildTools,
      styling: packageContext.styling,
      componentLibraries: packageContext.componentLibraries,
      sharedComponentDirectories,
      cssCustomProperties: { count: cssCustomProperties.length, items: cssCustomProperties },
      existingDesignArtifacts,
      scannedSourceFiles: files.length,
      tokens: { count: cssEvidence.length, items: cssEvidence },
      components,
      themes,
      themeDeclarations: themes,
      themeUsage: uniqueEvidence(themeUsage.map((item) => ({ kind: "theme-usage", ...item }))).map(({ kind, ...item }) => item),
      themeConfig: uniqueEvidence(themeConfig.map((item) => ({ kind: "theme-config", ...item }))).map(({ kind, ...item }) => item),
      interactionStates: uniqueEvidence(interactionStates),
      accessibility: uniqueEvidence(accessibility),
      typography: categories.typography,
      spacingAndRadius: categories.spacingAndRadius,
      reactRuntimeCandidates: packageContext.frameworks.includes("React") ? components : [],
    },
    evidenceLimitReached,
    warnings,
  };
}
