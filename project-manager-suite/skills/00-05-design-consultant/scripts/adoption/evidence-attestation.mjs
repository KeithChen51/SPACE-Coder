// Portable Task 5 evidence verifier. It parses local source through esbuild but never executes target code or packages.
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";

const SOURCE_EXTENSIONS = new Set([".css", ".scss", ".sass", ".less", ".pcss", ".js", ".jsx", ".ts", ".tsx", ".vue", ".svelte"]);
const IGNORED_DIRECTORIES = new Set([".git", ".next", ".nuxt", ".svelte-kit", "build", "coverage", "dist", "node_modules", "out", "target"]);
const SOURCE_ROOTS = ["src", "app", "components", "styles", "packages"];
const ROOT_CONTEXT_FILES = ["package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb", "components.json", "DESIGN.md", "tokens.json", "tokens.css", "design-tokens.css"];
const MAX_FILES = 2520;
const DEPENDENCY_LOADERS = new Map([
  [".js", "js"], [".jsx", "jsx"], [".ts", "ts"], [".tsx", "tsx"], [".css", "css"], [".json", "json"],
  [".png", "dataurl"], [".jpg", "dataurl"], [".jpeg", "dataurl"], [".gif", "dataurl"], [".webp", "dataurl"],
  [".svg", "dataurl"], [".woff", "dataurl"], [".woff2", "dataurl"], [".ttf", "dataurl"], [".otf", "dataurl"],
]);
const RESOLUTION_EXTENSIONS = ["", ".js", ".jsx", ".ts", ".tsx", ".css", ".json", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".woff", ".woff2", ".ttf", ".otf"];

export const TYPE_EVIDENCE_ATTESTATION_PATH = "components/type-evidence-attestation.json";
export const TYPE_EVIDENCE_LOCK_SOURCE = "generated:component-type-evidence-attestation";
export const TYPE_EVIDENCE_LOCK_PROVENANCE = Object.freeze({
  schemaVersion: 1,
  type: "component-type-evidence-attestation",
  workflow: "existing-system-adoption",
});

const SOURCE_SCAN_CONTRACT = Object.freeze({
  schemaVersion: 1,
  sourceRoots: SOURCE_ROOTS,
  sourceExtensions: [...SOURCE_EXTENSIONS].sort(),
  rootContextFiles: ROOT_CONTEXT_FILES,
  ignoredDirectories: [...IGNORED_DIRECTORIES].sort(),
  maxFiles: MAX_FILES,
});

function compare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function posix(path) {
  return path.split(sep).join("/");
}

function insideOrEqual(parent, child) {
  const value = relative(parent, child);
  return value === "" || (!value.startsWith("..") && !isAbsolute(value));
}

function hash(content) {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function safeRelativePosix(path) {
  return typeof path === "string"
    && path.length > 0
    && !path.includes("\\")
    && !isAbsolute(path)
    && path.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

async function optionalLstat(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function assertNoLinkedSegments(root, path, label) {
  const relativePath = relative(root, path);
  if (!insideOrEqual(root, path)) throw new Error(`${label} escapes its boundary: ${path}`);
  let current = root;
  for (const segment of relativePath.split(sep).filter(Boolean)) {
    current = join(current, segment);
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw new Error(`${label} contains a symbolic link / junction: ${current}`);
  }
}

export async function collectAttestedSourceFiles({ projectRoot, outputRoot, additionalPaths = [], maxFiles = MAX_FILES }) {
  const canonicalProject = await realpath(resolve(projectRoot));
  const resolvedOutput = resolve(outputRoot);
  const outputInfo = await optionalLstat(resolvedOutput);
  const canonicalOutput = outputInfo && !outputInfo.isSymbolicLink() ? await realpath(resolvedOutput) : null;
  const files = new Map();
  const visited = new Set();
  let evidenceLimitReached = false;

  function isOutputPath(path, canonical = null) {
    return insideOrEqual(resolvedOutput, resolve(path)) || (canonicalOutput !== null && canonical !== null && insideOrEqual(canonicalOutput, canonical));
  }

  async function add(path) {
    if (files.size >= maxFiles) {
      evidenceLimitReached = true;
      return;
    }
    await assertNoLinkedSegments(canonicalProject, resolve(path), "attested source path");
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`attested source path must be an ordinary file: ${path}`);
    const canonical = await realpath(path);
    if (!insideOrEqual(canonicalProject, canonical) || isOutputPath(path, canonical)) {
      throw new Error(`attested source path escapes its ordinary project boundary: ${path}`);
    }
    const relativePath = posix(relative(canonicalProject, canonical));
    files.set(relativePath, hash(await readFile(canonical)));
  }

  async function walk(path) {
    if (evidenceLimitReached) return;
    const resolvedPath = resolve(path);
    if (isOutputPath(resolvedPath)) return;
    const info = await lstat(resolvedPath);
    if (info.isSymbolicLink()) throw new Error(`source evidence directory is a symbolic link / junction: ${resolvedPath}`);
    if (!info.isDirectory()) throw new Error(`source evidence path is not a directory: ${resolvedPath}`);
    const canonical = await realpath(path);
    if (visited.has(canonical) || isOutputPath(resolvedPath, canonical)) return;
    if (!insideOrEqual(canonicalProject, canonical)) throw new Error(`attestation directory escapes the project: ${path}`);
    visited.add(canonical);
    let entries;
    try {
      entries = await readdir(canonical, { withFileTypes: true });
    } catch (error) {
      throw new Error(`source evidence directory could not be read: ${canonical}: ${error.message}`);
    }
    entries.sort((left, right) => compare(left.name, right.name));
    for (const entry of entries) {
      if (evidenceLimitReached) break;
      const child = join(canonical, entry.name);
      if (isOutputPath(child)) continue;
      if (IGNORED_DIRECTORIES.has(entry.name) && (entry.isDirectory() || entry.isSymbolicLink())) continue;
      const childInfo = await lstat(child);
      if (entry.isSymbolicLink() || childInfo.isSymbolicLink()) {
        throw new Error(`source evidence contains a symbolic link / junction: ${child}`);
      }
      if (childInfo.isDirectory()) await walk(child);
      else if (childInfo.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase())) await add(child);
      else if (!childInfo.isFile()) throw new Error(`source evidence contains an unsupported filesystem node: ${child}`);
    }
  }

  for (const relativePath of ROOT_CONTEXT_FILES) {
    const path = join(canonicalProject, relativePath);
    try {
      const info = await lstat(path);
      if (info.isSymbolicLink()) throw new Error(`root source evidence is a symbolic link / junction: ${path}`);
      if (!info.isFile()) throw new Error(`root source evidence must be an ordinary file: ${path}`);
      await add(path);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  for (const relativePath of [...new Set(additionalPaths)].sort(compare)) {
    if (!safeRelativePosix(relativePath)) {
      throw new Error(`attested source path is not safe relative POSIX: ${relativePath}`);
    }
    const path = resolve(canonicalProject, ...relativePath.split("/"));
    if (!insideOrEqual(canonicalProject, path) || insideOrEqual(resolvedOutput, path)) {
      throw new Error(`attested source path escapes its project boundary: ${relativePath}`);
    }
    await add(path);
  }

  let foundSourceRoot = false;
  for (const sourceRoot of SOURCE_ROOTS) {
    const path = join(canonicalProject, sourceRoot);
    if (isOutputPath(path)) continue;
    const info = await optionalLstat(path);
    if (info?.isSymbolicLink()) throw new Error(`source evidence root is a symbolic link / junction: ${path}`);
    if (info?.isDirectory()) {
      foundSourceRoot = true;
      await walk(path);
    } else if (info !== null) {
      throw new Error(`source evidence root is not a directory: ${path}`);
    }
  }
  if (!foundSourceRoot) await walk(canonicalProject);
  const rootEntries = await readdir(canonicalProject, { withFileTypes: true });
  rootEntries.sort((left, right) => compare(left.name, right.name));
  for (const entry of rootEntries) {
    if (evidenceLimitReached) break;
    const path = join(canonicalProject, entry.name);
    if (isOutputPath(path)) continue;
    if (IGNORED_DIRECTORIES.has(entry.name) && (entry.isDirectory() || entry.isSymbolicLink())) continue;
    const info = await lstat(path);
    if (entry.isSymbolicLink() || info.isSymbolicLink()) throw new Error(`root source evidence contains a symbolic link / junction: ${path}`);
    if (info.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase())) await add(path);
  }
  return {
    evidenceLimitReached,
    files: [...files].sort(([left], [right]) => compare(left, right)).map(([path, sha256]) => ({ path, sha256 })),
  };
}

function candidateClosure(runtime) {
  return [...(runtime.candidates ?? [])].map((candidate) => ({
    component: candidate.component,
    source: { path: candidate.source.path, exportName: candidate.source.exportName },
  }));
}

function additionalEvidencePaths(inventory, plan, runtime) {
  return [
    ...(inventory.detected?.components ?? []).map((component) => component.path),
    ...(plan.tokenMappings ?? []).flatMap((mapping) => [mapping.source?.file, mapping.fallback?.file]),
    ...(runtime.manualComponents ?? []).map((mapping) => mapping.adapterPath),
  ].filter((path) => typeof path === "string");
}

function mappingClosure(plan) {
  return structuredClone(plan.componentMappings ?? []);
}

function dependencySpecifier(value) {
  const match = /^([^?#]*)([?#].*)?$/.exec(value);
  return { resource: match?.[1] ?? value, suffix: match?.[2] ?? "" };
}

let babelParserPromise;
let babelTraversePromise;

const GLOBAL_OBJECT_NAMES = new Set(["globalThis", "window", "self", "navigator"]);
const DIRECT_WORKER_GLOBALS = new Set(["Worker", "SharedWorker"]);
const DIRECT_CALL_GLOBALS = new Set(["require", "fetch"]);
const FORBIDDEN_GLOBALS = new Set(["eval", "Function", "XMLHttpRequest", "importScripts", "WebAssembly"]);
const SAFE_OBJECT_STATIC_METHODS = new Set(["assign", "entries", "freeze", "fromEntries", "hasOwn", "is", "isFrozen", "isSealed", "keys", "seal", "values"]);
const GLOBAL_OBJECT_FORBIDDEN_PROPERTIES = new Set([
  ...DIRECT_WORKER_GLOBALS,
  ...DIRECT_CALL_GLOBALS,
  ...FORBIDDEN_GLOBALS,
  "Reflect",
  "Object",
  "globalThis",
  "navigator",
  "self",
  "serviceWorker",
  "window",
]);

function unwrapExpression(node) {
  let current = node;
  while (["TSAsExpression", "TSTypeAssertion", "TSNonNullExpression", "TypeCastExpression", "ParenthesizedExpression", "ChainExpression"].includes(current?.type)) {
    current = current.expression;
  }
  return current;
}

function memberPropertyName(node, scope = null) {
  if (!["MemberExpression", "OptionalMemberExpression"].includes(node?.type)) return null;
  if (!node.computed && node.property?.type === "Identifier") return node.property.name;
  if (node.computed) return staticStringValue(node.property, scope);
  return null;
}

function staticStringValue(node, scope = null, seenBindings = new Set()) {
  const value = unwrapExpression(node);
  if (value?.type === "StringLiteral") return value.value;
  if (value?.type === "NumericLiteral" && Number.isFinite(value.value)) return String(value.value);
  if (value?.type === "TemplateLiteral" && value.expressions.length === 0 && value.quasis.length === 1) {
    return value.quasis[0].value.cooked ?? value.quasis[0].value.raw;
  }
  if (value?.type === "BinaryExpression" && value.operator === "+") {
    const left = staticStringValue(value.left, scope, seenBindings);
    const right = staticStringValue(value.right, scope, seenBindings);
    return left === null || right === null ? null : left + right;
  }
  if (value?.type === "Identifier" && scope) {
    const binding = scope.getBinding(value.name);
    if (!binding || binding.kind !== "const" || !binding.constant || binding.constantViolations.length > 0 || seenBindings.has(binding)) return null;
    let declaratorPath = binding.path;
    if (declaratorPath?.isIdentifier?.() && declaratorPath.parentPath?.isVariableDeclarator?.()) declaratorPath = declaratorPath.parentPath;
    if (!declaratorPath?.isVariableDeclarator?.()
      || declaratorPath.node.id?.type !== "Identifier"
      || declaratorPath.node.id.name !== value.name
      || !declaratorPath.node.init) return null;
    seenBindings.add(binding);
    const resolved = staticStringValue(declaratorPath.node.init, declaratorPath.scope, seenBindings);
    seenBindings.delete(binding);
    return resolved;
  }
  return null;
}

function propertyKeyName(node, scope) {
  if (!node?.computed && node.key?.type === "Identifier") return node.key.name;
  if (!node?.computed && node.key?.type === "StringLiteral") return node.key.value;
  return staticStringValue(node?.key, scope);
}

function directStaticStringValue(node) {
  if (node?.type === "StringLiteral") return node.value;
  if (node?.type === "TemplateLiteral" && node.expressions.length === 0 && node.quasis.length === 1) {
    return node.quasis[0].value.cooked ?? node.quasis[0].value.raw;
  }
  return null;
}

function isImportMetaUrl(node) {
  const value = unwrapExpression(node);
  return ["MemberExpression", "OptionalMemberExpression"].includes(value?.type)
    && value.computed === false
    && memberPropertyName(value) === "url"
    && value.object?.type === "MetaProperty"
    && value.object.meta?.name === "import"
    && value.object.property?.name === "meta";
}

function unboundIdentifierName(node, scope, names) {
  const value = unwrapExpression(node);
  return value?.type === "Identifier" && names.has(value.name) && !scope.getBinding(value.name) ? value.name : null;
}

function runtimeAuditError(path, pattern) {
  return new Error(`unsupported runtime dependency pattern in ${path}: ${pattern}`);
}

function staticRelativeDependency(node) {
  const value = directStaticStringValue(node);
  if (value === null) return null;
  const { resource } = dependencySpecifier(value);
  return resource.startsWith(".") && !isAbsolute(resource) && !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(resource) ? value : null;
}

function forbiddenGlobalProperty(objectName, property) {
  if (objectName === "navigator") return property === "serviceWorker";
  if (objectName === "Object" || objectName === "Reflect") return true;
  return GLOBAL_OBJECT_FORBIDDEN_PROPERTIES.has(property);
}

function directGlobalObjectPatternSource(path) {
  const parent = path.parentPath;
  return (parent?.isVariableDeclarator() && parent.node.init === path.node && parent.get("id").isObjectPattern())
    || (parent?.isAssignmentExpression() && parent.node.right === path.node && parent.get("left").isObjectPattern());
}

function inspectGlobalObjectPattern(pattern, objectName, sourcePath, scope) {
  for (const property of pattern.properties) {
    if (property.type === "RestElement") {
      throw runtimeAuditError(sourcePath, `${objectName} object rest destructuring cannot be statically attested`);
    }
    if (property.type !== "ObjectProperty") {
      throw runtimeAuditError(sourcePath, `${objectName} destructuring contains an unsupported property`);
    }
    const name = property.computed ? staticStringValue(property.key, scope) : property.key?.name ?? staticStringValue(property.key, scope);
    if (name === null) throw runtimeAuditError(sourcePath, `${objectName} uses a non-static computed destructuring property`);
    if (forbiddenGlobalProperty(objectName, name)) {
      throw runtimeAuditError(sourcePath, `${name} must not be introduced from the real global ${objectName} through destructuring or an alias`);
    }
    if (["ObjectPattern", "ArrayPattern", "RestElement"].includes(property.value?.type)) {
      throw runtimeAuditError(sourcePath, `${objectName}.${name} nested destructuring cannot be statically attested`);
    }
  }
}

export async function staticWorkerDependencies(content, path) {
  babelParserPromise ??= import("@babel/parser");
  babelTraversePromise ??= import("@babel/traverse");
  const [parser, traverseModule] = await Promise.all([babelParserPromise, babelTraversePromise]);
  const traverse = traverseModule.default?.default ?? traverseModule.default ?? traverseModule;
  const source = Buffer.isBuffer(content) ? content.toString("utf8") : String(content);
  let ast;
  try {
    ast = parser.parse(source, { sourceType: "module", plugins: ["jsx", "typescript"] });
  } catch (error) {
    throw runtimeAuditError(path, `source could not be parsed (${error.message})`);
  }
  const dependencies = new Set();
  const allowedWorkerUrls = new Set();
  const allowedImportMetaUrls = new Set();

  function auditCall(callPath) {
    const node = callPath.node;
    if (node.callee?.type === "Import") {
      if (node.type !== "CallExpression" || node.arguments?.length !== 1 || staticRelativeDependency(node.arguments[0]) === null) {
        throw runtimeAuditError(path, "import() must use one direct static relative string literal");
      }
      return;
    }
    const callee = unwrapExpression(node.callee);
    if (callee?.type === "Identifier" && !callPath.scope.getBinding(callee.name)) {
      if (callee.name === "require") {
        if (node.type !== "CallExpression" || node.arguments?.length !== 1 || staticRelativeDependency(node.arguments[0]) === null) {
          throw runtimeAuditError(path, "require() must use one direct static relative string literal");
        }
      } else if (["eval", "Function", "importScripts", "XMLHttpRequest", "WebAssembly"].includes(callee.name)) {
        throw runtimeAuditError(path, `${callee.name}() cannot be statically attested`);
      } else if (callee.name === "fetch") {
        const target = node.type === "CallExpression" && node.arguments?.length > 0 ? staticStringValue(node.arguments[0]) : null;
        if (target === null || !/^https:\/\/[A-Za-z0-9.-]+(?::\d+)?(?:[/?#]|$)/.test(target)) {
          throw runtimeAuditError(path, "fetch() may only target an explicit static HTTPS business API; local and dynamic resources are forbidden");
        }
      }
    }
  }

  function isSafeJsxStringPresentation(memberPath) {
    let valuePath = memberPath;
    while (valuePath.parentPath) {
      const parent = valuePath.parentPath;
      if (["TSAsExpression", "TSTypeAssertion", "TSNonNullExpression", "TypeCastExpression", "ParenthesizedExpression"].includes(parent.node.type)
        && parent.node.expression === valuePath.node) {
        valuePath = parent;
        continue;
      }
      if (parent.isLogicalExpression({ operator: "??" })
        && parent.node.left === valuePath.node && directStaticStringValue(parent.node.right) !== null) {
        valuePath = parent;
        continue;
      }
      break;
    }
    const templatePath = valuePath.parentPath;
    if (!templatePath?.isTemplateLiteral()
      || !templatePath.node.expressions.includes(valuePath.node)
      || templatePath.parentPath?.isTaggedTemplateExpression()) return false;

    let presentationPath = templatePath;
    while (presentationPath.parentPath) {
      const parent = presentationPath.parentPath;
      if (["TSAsExpression", "TSTypeAssertion", "TSNonNullExpression", "TypeCastExpression", "ParenthesizedExpression"].includes(parent.node.type)
        && parent.node.expression === presentationPath.node) {
        presentationPath = parent;
        continue;
      }
      if (parent.isConditionalExpression()
        && (parent.node.consequent === presentationPath.node || parent.node.alternate === presentationPath.node)) {
        presentationPath = parent;
        continue;
      }
      break;
    }

    const containerPath = presentationPath.parentPath;
    if (!containerPath?.isJSXExpressionContainer() || containerPath.node.expression !== presentationPath.node) return false;
    const jsxPath = containerPath.parentPath;
    if (jsxPath?.isJSXAttribute()) {
      return jsxPath.node.value === containerPath.node
        && jsxPath.node.name?.type === "JSXIdentifier"
        && jsxPath.node.name.name === "key";
    }
    const elementName = jsxPath?.isJSXElement() ? jsxPath.node.openingElement?.name : null;
    return elementName?.type === "JSXIdentifier"
      && /^[a-z]/.test(elementName.name)
      && jsxPath.node.children.includes(containerPath.node);
  }

  function auditMember(memberPath) {
    const node = memberPath.node;
    const property = memberPropertyName(node, memberPath.scope);
    const objectName = unboundIdentifierName(node.object, memberPath.scope, new Set([...GLOBAL_OBJECT_NAMES, "Object", "Reflect"]));
    if (objectName && node.computed && staticStringValue(node.property) === null) {
      throw runtimeAuditError(path, `${objectName} uses a non-static computed global property`);
    }
    if (node.computed && property === null && !isSafeJsxStringPresentation(memberPath)) {
      throw runtimeAuditError(path, "computed member access must use a statically known property that is not constructor");
    }
    if (property === "constructor") {
      throw runtimeAuditError(path, "constructor member access cannot be statically attested in v0.10");
    }
    if (node.object?.type === "MetaProperty" && node.object.meta?.name === "import" && node.object.property?.name === "meta") {
      if (["glob", "globEager"].includes(property)) throw runtimeAuditError(path, `import.meta.${property} is not supported`);
      if (!isImportMetaUrl(node) || !allowedImportMetaUrls.has(node)) {
        throw runtimeAuditError(path, "import.meta references are allowed only as direct .url input to an attested Worker or SharedWorker");
      }
      return;
    }
    if (!objectName) return;
    if (objectName === "Object") {
      const parent = memberPath.parentPath;
      const directCall = parent?.isCallExpression() && parent.node.callee === node && !node.optional;
      if (!directCall || !SAFE_OBJECT_STATIC_METHODS.has(property)) {
        throw runtimeAuditError(path, `Object.${property ?? "<dynamic>"} is not an allowed direct static method call`);
      }
      return;
    }
    if (objectName === "Reflect") {
      throw runtimeAuditError(path, "the real global Reflect API is forbidden in attested component source");
    }
    if (forbiddenGlobalProperty(objectName, property)) {
      throw runtimeAuditError(path, `${property} must not be accessed through the real global ${objectName}, an optional chain, or a computed property`);
    }
  }

  function auditGlobalDestructure(pattern, source, scope) {
    const objectName = unboundIdentifierName(source, scope, new Set([...GLOBAL_OBJECT_NAMES, "Object", "Reflect"]));
    if (objectName) inspectGlobalObjectPattern(pattern, objectName, path, scope);
  }

  function auditConstructorKey(propertyPath, context) {
    const property = propertyKeyName(propertyPath.node, propertyPath.scope);
    if (propertyPath.node.computed && property === null) {
      throw runtimeAuditError(path, `${context} computed key must be statically known and must not resolve to constructor`);
    }
    if (property === "constructor") {
      throw runtimeAuditError(path, `${context} constructor key cannot be statically attested in v0.10`);
    }
  }

  traverse(ast, {
    CallExpression: auditCall,
    OptionalCallExpression: auditCall,
    ImportExpression(importPath) {
      if (staticRelativeDependency(importPath.node.source) === null) {
        throw runtimeAuditError(path, "import() must use one direct static relative string literal");
      }
    },
    NewExpression(newPath) {
      const node = newPath.node;
      const callee = unwrapExpression(node.callee);
      if (callee?.type === "Identifier" && !newPath.scope.getBinding(callee.name) && DIRECT_WORKER_GLOBALS.has(callee.name)) {
        const argument = node.arguments?.[0];
        let specifier = staticRelativeDependency(argument);
        if (specifier === null && argument?.type === "NewExpression"
          && unboundIdentifierName(argument.callee, newPath.scope, new Set(["URL"])) === "URL"
          && argument.arguments?.length === 2 && isImportMetaUrl(argument.arguments[1])) {
          specifier = staticRelativeDependency(argument.arguments[0]);
          if (specifier !== null) {
            allowedWorkerUrls.add(argument);
            allowedImportMetaUrls.add(unwrapExpression(argument.arguments[1]));
          }
        }
        if (specifier === null) {
          throw runtimeAuditError(path, `${callee.name} must use a direct static relative string or direct new URL(relative, import.meta.url)`);
        }
        dependencies.add(specifier);
      }
      if (callee?.type === "Identifier" && !newPath.scope.getBinding(callee.name)
        && ["Function", "XMLHttpRequest", "eval", "importScripts", "WebAssembly"].includes(callee.name)) {
        throw runtimeAuditError(path, `${callee.name} construction cannot be statically attested`);
      }
      if (callee?.type === "Identifier" && callee.name === "URL" && !newPath.scope.getBinding("URL")
        && node.arguments?.length === 2 && isImportMetaUrl(node.arguments[1]) && !allowedWorkerUrls.has(node)) {
        throw runtimeAuditError(path, "new URL(..., import.meta.url) is allowed only as the direct argument of an attested Worker or SharedWorker");
      }
    },
    MemberExpression: auditMember,
    OptionalMemberExpression: auditMember,
    ObjectProperty(propertyPath) {
      if (propertyPath.parentPath?.isObjectPattern()) auditConstructorKey(propertyPath, "ObjectPattern");
    },
    ObjectMethod(methodPath) {
      auditConstructorKey(methodPath, "ObjectMethod");
    },
    ClassMethod(methodPath) {
      auditConstructorKey(methodPath, "Class");
    },
    ClassProperty(propertyPath) {
      auditConstructorKey(propertyPath, "Class");
    },
    VariableDeclarator(declaratorPath) {
      if (declaratorPath.get("id").isObjectPattern()) {
        auditGlobalDestructure(declaratorPath.node.id, declaratorPath.node.init, declaratorPath.scope);
      }
    },
    AssignmentExpression(assignmentPath) {
      if (assignmentPath.get("left").isObjectPattern()) {
        auditGlobalDestructure(assignmentPath.node.left, assignmentPath.node.right, assignmentPath.scope);
      }
    },
    MetaProperty(metaPath) {
      const node = metaPath.node;
      if (node.meta?.name !== "import" || node.property?.name !== "meta") return;
      const parent = metaPath.parentPath?.node;
      if (!allowedImportMetaUrls.has(parent) || !isImportMetaUrl(parent)) {
        throw runtimeAuditError(path, "import.meta references cannot be aliased or used outside a direct attested worker URL");
      }
    },
    Identifier(identifierPath) {
      if (!identifierPath.isReferencedIdentifier()) return;
      if (identifierPath.findParent((parent) => parent.isTSType?.())) return;
      const name = identifierPath.node.name;
      if (identifierPath.scope.getBinding(name)) return;
      if (FORBIDDEN_GLOBALS.has(name)) {
        throw runtimeAuditError(path, `${name} is a real global runtime loader and cannot be statically attested`);
      }
      const parent = identifierPath.parentPath;
      if (DIRECT_WORKER_GLOBALS.has(name)) {
        if (!(parent?.isNewExpression() && parent.node.callee === identifierPath.node)) {
          throw runtimeAuditError(path, `${name} alias or identifier reference is not a supported direct static form`);
        }
        return;
      }
      if (DIRECT_CALL_GLOBALS.has(name)) {
        if (!(parent?.isCallExpression() && parent.node.callee === identifierPath.node)) {
          throw runtimeAuditError(path, `${name} alias or identifier reference is not a supported direct static form`);
        }
        return;
      }
      if (GLOBAL_OBJECT_NAMES.has(name)) {
        const directMemberObject = parent && ["MemberExpression", "OptionalMemberExpression"].includes(parent.node.type) && parent.node.object === identifierPath.node;
        if (!directMemberObject && !directGlobalObjectPatternSource(identifierPath)) {
          throw runtimeAuditError(path, `${name} global object cannot be aliased or passed through an unprovable reference`);
        }
        return;
      }
      if (name === "Reflect") {
        throw runtimeAuditError(path, "the real global Reflect API is forbidden in attested component source");
      }
      if (name === "Object") {
        const directMemberObject = parent && ["MemberExpression", "OptionalMemberExpression"].includes(parent.node.type) && parent.node.object === identifierPath.node;
        if (!directMemberObject) throw runtimeAuditError(path, "the real global Object may only be used for an allowed direct static method call");
      }
    },
  });
  return [...dependencies].sort(compare);
}

async function firstExistingDependency(importer, resource) {
  const base = resolve(dirname(importer), resource);
  const candidates = [];
  for (const extension of RESOLUTION_EXTENSIONS) candidates.push(`${base}${extension}`);
  for (const extension of RESOLUTION_EXTENSIONS.slice(1)) candidates.push(join(base, `index${extension}`));
  for (const candidate of candidates) {
    const info = await optionalLstat(candidate);
    if (info?.isSymbolicLink() || info?.isFile()) return { candidate, info };
  }
  return null;
}

function closureEntryPoints({ projectRoot, outputRoot, plan, runtime }) {
  const entries = [];
  for (const mapping of runtime.directComponents ?? []) {
    entries.push({ path: resolve(projectRoot, ...mapping.source.path.split("/")), purpose: `component:${mapping.canonicalExport}` });
  }
  for (const mapping of runtime.adapters ?? []) {
    entries.push({ path: resolve(outputRoot, ...mapping.adapterPath.split("/")), purpose: `component:${mapping.canonicalExport}` });
  }
  for (const mapping of runtime.manualComponents ?? []) {
    entries.push({ path: resolve(projectRoot, ...mapping.adapterPath.split("/")), purpose: `component:${mapping.canonicalExport}` });
  }
  for (const mapping of runtime.generatedComponents ?? []) {
    entries.push({ path: resolve(outputRoot, ...mapping.generatedPath.split("/")), purpose: `component:${mapping.canonicalExport}` });
  }
  const styles = new Map();
  for (const mapping of plan.tokenMappings ?? []) {
    if (mapping.status !== "confirmed") continue;
    for (const source of [mapping.source, mapping.fallback]) {
      if (typeof source?.file !== "string") continue;
      const purposes = styles.get(source.file) ?? new Set();
      purposes.add(`style:${mapping.canonicalToken}`);
      styles.set(source.file, purposes);
    }
  }
  for (const [path, purposes] of styles) {
    entries.push({ path: resolve(projectRoot, ...path.split("/")), purpose: [...purposes].sort(compare).join("|") });
  }
  return entries;
}

function dependencyScope(path, projectRoot, outputRoot) {
  if (insideOrEqual(outputRoot, path)) return { scope: "managed", root: outputRoot, relativePath: posix(relative(outputRoot, path)) };
  if (insideOrEqual(projectRoot, path)) return { scope: "project", root: projectRoot, relativePath: posix(relative(projectRoot, path)) };
  return null;
}

async function collectDependencyFileClosure({ projectRoot, outputRoot, plan, runtime, generatedSources = {} }) {
  const { build } = await import("esbuild");
  const canonicalProject = await realpath(resolve(projectRoot));
  const canonicalOutput = await realpath(resolve(outputRoot));
  if (!insideOrEqual(canonicalProject, canonicalOutput)) throw new Error("managed dependency closure output escapes the project root");
  const virtualSources = new Map(Object.entries(generatedSources).map(([path, content]) => [
    resolve(canonicalOutput, ...path.split("/")),
    Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8"),
  ]));
  const closure = new Map();

  async function record(path, content, purpose) {
    const scope = dependencyScope(path, canonicalProject, canonicalOutput);
    if (!scope || !safeRelativePosix(scope.relativePath)) throw new Error(`dependency closure path escapes confirmed roots: ${path}`);
    const key = `${scope.scope}:${scope.relativePath}`;
    const digest = hash(content);
    const existing = closure.get(key);
    if (existing && existing.sha256 !== digest) throw new Error(`dependency closure observed inconsistent bytes: ${scope.relativePath}`);
    const purposes = existing?.purposes ?? new Set();
    purposes.add(purpose);
    closure.set(key, { scope: scope.scope, path: scope.relativePath, sha256: digest, purposes });
  }

  async function validateDiskDependency(path) {
    const scope = dependencyScope(path, canonicalProject, canonicalOutput);
    if (!scope) throw new Error(`local dependency escapes confirmed project and managed roots: ${path}`);
    await assertNoLinkedSegments(scope.root, path, "dependency closure path");
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`dependency closure path must be an ordinary file: ${path}`);
    const canonical = await realpath(path);
    if (canonical !== path || !insideOrEqual(scope.root, canonical)) throw new Error(`dependency closure path uses a linked or non-canonical alias: ${path}`);
    return readFile(canonical);
  }

  const pending = [];
  const queued = new Set();
  function enqueue(entry) {
    const key = `${entry.path}\u0000${entry.purpose}`;
    if (queued.has(key)) return;
    if (queued.size >= 1000) throw new Error("dependency closure exceeds the bounded worker entry limit");
    queued.add(key);
    pending.push(entry);
  }
  for (const entry of closureEntryPoints({ projectRoot: canonicalProject, outputRoot: canonicalOutput, plan, runtime })) enqueue(entry);

  while (pending.length > 0) {
    const entry = pending.shift();
    const discoveredWorkers = [];
    const plugin = {
      name: "design-consultant-attested-file-closure",
      setup(api) {
        api.onResolve({ filter: /.*/ }, async (args) => {
          if (args.kind === "entry-point") return { path: resolve(args.path) };
          const { resource, suffix } = dependencySpecifier(args.path);
          if (!resource || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(resource) || resource.startsWith("//") || isAbsolute(resource) || /^[A-Za-z]:/.test(resource)) {
            throw new Error(`dependency closure rejects absolute, protocol, URL, or empty dependency: ${args.path}`);
          }
          if (!resource.startsWith(".")) {
            if (["import-rule", "url-token"].includes(args.kind)) throw new Error(`dependency closure rejects non-local CSS dependency: ${args.path}`);
            return { path: args.path, external: true };
          }
          const resolved = await firstExistingDependency(args.importer, resource);
          if (!resolved) return null;
          const scope = dependencyScope(resolved.candidate, canonicalProject, canonicalOutput);
          if (!scope) throw new Error(`dependency closure import escapes confirmed roots: ${args.path}`);
          if (resolved.info.isSymbolicLink()) throw new Error(`dependency closure import traverses a symbolic link or junction: ${args.path}`);
          await assertNoLinkedSegments(scope.root, resolved.candidate, "dependency closure import");
          return { path: resolved.candidate, suffix };
        });
        api.onLoad({ filter: /.*/ }, async (args) => {
          const virtual = virtualSources.get(args.path);
          const content = virtual ?? await validateDiskDependency(args.path);
          const loader = DEPENDENCY_LOADERS.get(extname(args.path).toLowerCase());
          if (!loader) throw new Error(`dependency closure has no approved loader for ${args.path}`);
          await record(args.path, content, entry.purpose);
          if (["js", "jsx", "ts", "tsx"].includes(loader)) {
            for (const workerSpecifier of await staticWorkerDependencies(content, args.path)) {
              const { resource } = dependencySpecifier(workerSpecifier);
              if (!resource || !resource.startsWith(".") || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(resource)
                || resource.startsWith("//") || isAbsolute(resource) || /^[A-Za-z]:/.test(resource)) {
                throw new Error(`dependency closure rejects non-local worker dependency: ${workerSpecifier}`);
              }
              const resolved = await firstExistingDependency(args.path, resource);
              if (!resolved) throw new Error(`dependency closure worker dependency could not be resolved: ${workerSpecifier}`);
              const scope = dependencyScope(resolved.candidate, canonicalProject, canonicalOutput);
              if (!scope) throw new Error(`dependency closure worker escapes confirmed roots: ${workerSpecifier}`);
              if (resolved.info.isSymbolicLink()) throw new Error(`dependency closure worker traverses a symbolic link or junction: ${workerSpecifier}`);
              await assertNoLinkedSegments(scope.root, resolved.candidate, "dependency closure worker");
              discoveredWorkers.push({
                path: resolved.candidate,
                purpose: `${entry.purpose}|worker:${scope.scope}:${scope.relativePath}`,
              });
            }
          }
          return { contents: content, loader };
        });
      },
    };
    await build({
      absWorkingDir: canonicalProject,
      bundle: true,
      entryPoints: [entry.path],
      format: "esm",
      legalComments: "none",
      logLevel: "silent",
      metafile: true,
      outdir: join(canonicalOutput, ".dependency-closure-output"),
      packages: "external",
      platform: "browser",
      plugins: [plugin],
      write: false,
    });
    for (const worker of discoveredWorkers) enqueue(worker);
  }

  for (const [path, purpose] of [
    ["runtime/react/src/index.ts", "runtime:barrel"],
    ["runtime/react/src/generated-components.css", "runtime:styles"],
  ]) {
    const absolute = resolve(canonicalOutput, ...path.split("/"));
    const virtual = virtualSources.get(absolute);
    const info = virtual ? null : await optionalLstat(absolute);
    if (!virtual && info === null) continue;
    const content = virtual ?? await validateDiskDependency(absolute);
    await record(absolute, content, purpose);
  }

  return [...closure.values()]
    .map(({ purposes, ...entry }) => ({ ...entry, purpose: [...purposes].sort(compare).join("|") }))
    .sort((left, right) => compare(`${left.scope}:${left.path}`, `${right.scope}:${right.path}`));
}

async function validateAttestedFileClosure({ projectRoot, outputRoot, fileClosure }) {
  if (!Array.isArray(fileClosure) || fileClosure.length === 0) {
    throw new Error("type evidence file closure must be a non-empty array");
  }
  const canonicalProject = await realpath(resolve(projectRoot));
  const canonicalOutput = await realpath(resolve(outputRoot));
  if (!insideOrEqual(canonicalProject, canonicalOutput)) throw new Error("managed file closure output escapes the project root");
  const observedPaths = new Set();
  const normalized = [];
  for (const entry of fileClosure) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)
      || JSON.stringify(Object.keys(entry).sort(compare)) !== JSON.stringify(["path", "purpose", "scope", "sha256"])
      || !["project", "managed"].includes(entry.scope)
      || !safeRelativePosix(entry.path)
      || typeof entry.purpose !== "string" || entry.purpose.length === 0 || entry.purpose.length > 1024
      || !/^sha256:[a-f0-9]{64}$/.test(entry.sha256)) {
      throw new Error("type evidence file closure contains a malformed exact entry");
    }
    const root = entry.scope === "project" ? canonicalProject : canonicalOutput;
    const path = resolve(root, ...entry.path.split("/"));
    if (!insideOrEqual(root, path) || (entry.scope === "project" && insideOrEqual(canonicalOutput, path))) {
      throw new Error(`type evidence file closure scope is invalid: ${entry.scope}:${entry.path}`);
    }
    await assertNoLinkedSegments(root, path, "type evidence file closure path");
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`type evidence file closure path must be an ordinary file: ${entry.path}`);
    const canonical = await realpath(path);
    if (canonical !== path || !insideOrEqual(root, canonical) || observedPaths.has(canonical)) {
      throw new Error(`type evidence file closure path is linked, aliased, or duplicated: ${entry.path}`);
    }
    observedPaths.add(canonical);
    if (hash(await readFile(canonical)) !== entry.sha256) {
      throw new Error(`type evidence file closure source bytes drifted: ${entry.path}`);
    }
    normalized.push({ scope: entry.scope, path: entry.path, sha256: entry.sha256, purpose: entry.purpose });
  }
  normalized.sort((left, right) => compare(`${left.scope}:${left.path}`, `${right.scope}:${right.path}`));
  if (!isDeepStrictEqual(normalized, fileClosure)) {
    throw new Error("type evidence file closure is not in deterministic canonical order");
  }
  return normalized;
}

async function collectGeneratedFiles({ outputRoot, runtime }) {
  const files = [];
  const canonicalOutput = await realpath(resolve(outputRoot));
  for (const component of runtime.generatedComponents ?? []) {
    const path = component.generatedPath;
    if (!safeRelativePosix(path)) throw new Error(`generated evidence path is unsafe: ${path}`);
    const absolutePath = resolve(canonicalOutput, ...path.split("/"));
    if (!insideOrEqual(canonicalOutput, absolutePath)) throw new Error(`generated evidence path escapes output: ${path}`);
    const info = await lstat(absolutePath);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`generated evidence path must be an ordinary file: ${path}`);
    const canonicalPath = await realpath(absolutePath);
    if (!insideOrEqual(canonicalOutput, canonicalPath)) throw new Error(`generated evidence path resolves outside canonical output: ${path}`);
    files.push({ path, sha256: hash(await readFile(canonicalPath)) });
  }
  return files;
}

function attestationBody({ inventory, plan, runtime, sourceFiles, generatedFiles, fileClosure }) {
  return {
    schemaVersion: 3,
    kind: "design-consultant-component-type-evidence",
    inventoryComplete: inventory.evidenceLimitReached !== true,
    inventoryDigest: plan.inventoryDigest,
    projectOutput: inventory.project.output,
    sourceScanContract: SOURCE_SCAN_CONTRACT,
    candidateClosure: candidateClosure(runtime),
    mappingClosure: mappingClosure(plan),
    sourceFiles,
    generatedFiles,
    fileClosure,
  };
}

export async function buildTypeEvidenceAttestation({ projectRoot, outputRoot, inventory, plan, runtime, generatedSources = {} }) {
  if (inventory.evidenceLimitReached === true) throw new Error("cannot attest incomplete inventory evidence");
  const collected = await collectAttestedSourceFiles({
    projectRoot,
    outputRoot,
    additionalPaths: additionalEvidencePaths(inventory, plan, runtime),
  });
  if (collected.evidenceLimitReached) throw new Error("cannot attest source evidence because maxFiles was reached");
  const generatedFiles = (runtime.generatedComponents ?? []).map((component) => {
    const content = generatedSources[component.generatedPath];
    if (typeof content !== "string") throw new Error(`approved generated evidence source is missing: ${component.generatedPath}`);
    return { path: component.generatedPath, sha256: hash(content) };
  });
  const fileClosure = await collectDependencyFileClosure({ projectRoot, outputRoot, plan, runtime, generatedSources });
  const body = attestationBody({ inventory, plan, runtime, sourceFiles: collected.files, generatedFiles, fileClosure });
  return { ...body, evidenceDigest: hash(JSON.stringify(body)) };
}

export async function validateTypeEvidenceAttestation({ projectRoot, outputRoot, inventory, plan, runtime, attestation }) {
  const issues = [];
  if (!attestation || typeof attestation !== "object" || Array.isArray(attestation)) return ["type evidence attestation must be an object"];
  const collected = await collectAttestedSourceFiles({
    projectRoot,
    outputRoot,
    additionalPaths: additionalEvidencePaths(inventory, plan, runtime),
  });
  if (collected.evidenceLimitReached) issues.push("live source evidence reached maxFiles and is incomplete");
  let generatedFiles = [];
  let fileClosure = [];
  try {
    generatedFiles = await collectGeneratedFiles({ outputRoot, runtime });
  } catch (error) {
    issues.push(error.message);
  }
  try {
    // The generated checker stays portable: it validates every attested byte and
    // path here. Catalog build/check separately proves the actual esbuild graph
    // is a bidirectional match for this same closure.
    fileClosure = await validateAttestedFileClosure({ projectRoot, outputRoot, fileClosure: attestation.fileClosure });
  } catch (error) {
    issues.push(error.message);
  }
  const expectedBody = attestationBody({ inventory, plan, runtime, sourceFiles: collected.files, generatedFiles, fileClosure });
  const actualBody = Object.fromEntries(Object.keys(expectedBody).map((key) => [key, attestation[key]]));
  const expectedKeys = [...Object.keys(expectedBody), "evidenceDigest"].sort(compare);
  if (JSON.stringify(Object.keys(attestation).sort(compare)) !== JSON.stringify(expectedKeys)) {
    issues.push("type evidence attestation fields differ from the deterministic schema");
  }
  if (JSON.stringify(actualBody) !== JSON.stringify(expectedBody)) issues.push("type evidence attestation candidate, mapping, inventory, or source bytes drifted");
  if (attestation.evidenceDigest !== hash(JSON.stringify(expectedBody))) issues.push("type evidence attestation digest is invalid");
  if (attestation.inventoryComplete !== true || inventory.evidenceLimitReached === true) issues.push("type evidence attestation is based on incomplete inventory evidence");
  return issues;
}

export function validateTypeEvidenceLock({ lock, attestationSource }) {
  const issues = [];
  if (!lock || typeof lock !== "object" || Array.isArray(lock)) return ["adoption lock must be an object"];
  if (lock.schemaVersion !== 1) issues.push("adoption lock schemaVersion must equal 1");
  if (lock.workflow !== "existing-system-adoption") issues.push("adoption lock workflow must equal existing-system-adoption");
  if (!lock.files || typeof lock.files !== "object" || Array.isArray(lock.files)) {
    issues.push("adoption lock files must be an object");
    return issues;
  }
  const entry = lock.files[TYPE_EVIDENCE_ATTESTATION_PATH];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    issues.push(`adoption lock is missing ${TYPE_EVIDENCE_ATTESTATION_PATH}`);
    return issues;
  }
  const expectedEntryKeys = ["generatedHash", "provenance", "source", "templateHash"];
  if (JSON.stringify(Object.keys(entry).sort(compare)) !== JSON.stringify(expectedEntryKeys)) {
    issues.push("type evidence lock entry fields are invalid");
  }
  if (entry.source !== TYPE_EVIDENCE_LOCK_SOURCE) issues.push("type evidence lock source provenance is invalid");
  if (entry.templateHash !== null) issues.push("type evidence lock templateHash must be null");
  if (!isDeepStrictEqual(entry.provenance, TYPE_EVIDENCE_LOCK_PROVENANCE)) {
    issues.push("type evidence lock provenance is invalid");
  }
  const expectedHash = typeof attestationSource === "string"
    ? createHash("sha256").update(attestationSource).digest("hex")
    : null;
  if (!/^[a-f0-9]{64}$/.test(entry.generatedHash ?? "") || entry.generatedHash !== expectedHash) {
    issues.push("type evidence attestation bytes do not match the lock generatedHash");
  }
  return issues;
}
