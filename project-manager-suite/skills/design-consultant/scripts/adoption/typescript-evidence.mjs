import { resolve, relative, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { API, SignatureKind, SymbolFlags, TypeFlags } from "typescript/unstable/sync";
import { isExportDeclaration, isNamedExports } from "typescript/unstable/ast/is";
import {
  CANONICAL_COMPONENTS,
  renderReactAdapter,
  renderRuntimeBarrel,
} from "./component-adapters.mjs";

const VALUE_FLAGS = SymbolFlags.Function
  | SymbolFlags.Class
  | SymbolFlags.Variable
  | SymbolFlags.ValueModule
  | SymbolFlags.Enum;
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const REACT_TYPES_PATH = resolve(REPOSITORY_ROOT, "node_modules/@types/react/index.d.ts");
const REACT_JSX_RUNTIME_TYPES_PATH = resolve(REPOSITORY_ROOT, "node_modules/@types/react/jsx-runtime.d.ts");

function fail(message) {
  throw new Error(`Component runtime type evidence ${message}`);
}

function absolute(projectRoot, path) {
  return resolve(projectRoot, ...path.replaceAll("\\", "/").split("/"));
}

function normalize(path) {
  return resolve(path).replaceAll("\\", "/").toLowerCase();
}

function relativeImport(fromFile, targetFile) {
  const path = relative(dirname(fromFile), targetFile).replaceAll(sep, "/").replace(/\.(?:[cm]?[jt]sx?)$/i, "");
  return path.startsWith(".") ? path : `./${path}`;
}

function renderCanonicalContracts() {
  return `import type { ReactNode } from "react";\n\n${CANONICAL_COMPONENTS.map((component) => `export interface ${component.exportName}Props {\n${component.props
    .map((prop) => `  ${prop.name}${prop.required ? "" : "?"}: ${prop.type};`)
    .join("\n")}\n}`).join("\n\n")}\n`;
}

function renderComponentConformance(entries) {
  const exports = entries.map((entry) => entry.canonicalExport);
  return `import type { ComponentType } from "react";
import { ${exports.join(", ")} } from "./runtime/react/src/index";
import type { ${exports.map((name) => `${name}Props`).join(", ")} } from "./.design-consultant-canonical-contracts";

${exports.map((name) => `const ${name}Contract: ComponentType<${name}Props> = ${name};`).join("\n")}
`;
}

function makeVirtualFileSystem(files) {
  const content = new Map(Object.entries(files).map(([path, value]) => [normalize(path), value]));
  const originalPaths = new Map(Object.keys(files).map((path) => [normalize(path), resolve(path)]));
  const directories = new Set();
  for (const path of originalPaths.values()) {
    let current = dirname(path);
    while (current !== dirname(current)) {
      directories.add(normalize(current));
      current = dirname(current);
    }
  }
  return {
    readFile(path) {
      return content.has(normalize(path)) ? content.get(normalize(path)) : undefined;
    },
    fileExists(path) {
      return content.has(normalize(path)) ? true : undefined;
    },
    directoryExists(path) {
      return directories.has(normalize(path)) ? true : undefined;
    },
    realpath(path) {
      const key = normalize(path);
      return originalPaths.has(key) ? originalPaths.get(key) : undefined;
    },
  };
}

function isTypeOnlyExport(sourceFile, exportName) {
  for (const statement of sourceFile.statements) {
    if (!isExportDeclaration(statement) || !statement.exportClause || !isNamedExports(statement.exportClause)) continue;
    for (const specifier of statement.exportClause.elements) {
      if (specifier.name.text === exportName && (statement.isTypeOnly || specifier.isTypeOnly)) return true;
    }
  }
  return false;
}

function moduleExport(project, filePath, exportName, label, { value = false, allowTypeOnly = false } = {}) {
  const sourceFile = project.program.getSourceFile(filePath);
  if (!sourceFile) fail(`${label} source file is not in the TypeScript program: ${filePath}.`);
  const moduleSymbol = project.checker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) fail(`${label} is not an external module.`);
  const exported = project.checker.getExportsOfModule(moduleSymbol).find((symbol) => symbol.name === exportName);
  if (!exported || (!allowTypeOnly && isTypeOnlyExport(sourceFile, exportName))) {
    fail(`${label} must provide an actual ${exportName} value export.`);
  }
  const target = (exported.flags & SymbolFlags.Alias) ? project.checker.getAliasedSymbol(exported) : exported;
  if (value && (!(target.flags & VALUE_FLAGS) || !target.valueDeclaration)) {
    fail(`${label} must provide an actual ${exportName} value export.`);
  }
  return target;
}

function componentPropsTypes(project, symbol, label) {
  const componentType = project.checker.getTypeOfSymbol(symbol);
  if (!componentType || componentType.isErrorType()) fail(`${label} component type cannot be resolved.`);
  const signatures = [
    ...project.checker.getSignaturesOfType(componentType, SignatureKind.Call),
    ...project.checker.getSignaturesOfType(componentType, SignatureKind.Construct),
  ];
  if (signatures.length === 0) fail(`${label} must be a callable or constructable React component.`);
  return signatures.map((signature, index) => {
    const propsType = project.checker.getParameterType(signature, 0);
    if (!propsType || propsType.isErrorType()) fail(`${label} signature ${index + 1} consumed props type cannot be resolved.`);
    return propsType;
  });
}

function propsOf(project, type) {
  return new Map(project.checker.getPropertiesOfType(type).map((symbol) => [symbol.name, {
    symbol,
    type: project.checker.getTypeOfSymbol(symbol),
    required: !(symbol.flags & SymbolFlags.Optional),
  }]));
}

function indexContractsOf(project, type) {
  return project.checker.getIndexInfosOfType(type)
    .map((index) => ({
      keyType: index.keyType,
      valueType: index.type,
      readonly: index.isReadonly === true,
      display: project.checker.typeToString(index.keyType),
    }))
    .sort((left, right) => left.display.localeCompare(right.display));
}

function typeName(project, type) {
  return type ? project.checker.typeToString(type) : "unresolved";
}

function assertNoAny(project, type, label, seen = new Set()) {
  if (!type || type.isErrorType()) fail(`${label} type cannot be resolved.`);
  if (type.flags & TypeFlags.Any) fail(`${label} contains any and cannot provide static component evidence.`);
  const identity = type.id ?? type;
  if (seen.has(identity)) return;
  seen.add(identity);

  const arrayLike = project.checker.isArrayLikeType(type);
  const resolvedTypeArguments = arrayLike ? project.checker.getTypeArguments(type) : [];
  for (const nested of [
    ...(type.types ?? []),
    ...(type.typeArguments ?? []),
    ...(type.aliasTypeArguments ?? []),
    ...resolvedTypeArguments,
  ]) assertNoAny(project, nested, label, seen);

  if (type.flags & TypeFlags.TypeParameter) {
    const constraint = project.checker.getBaseConstraintOfType(type);
    if (constraint) assertNoAny(project, constraint, label, seen);
  }
  if (type.flags & TypeFlags.Object && !arrayLike) {
    for (const property of project.checker.getPropertiesOfType(type)) {
      const resolvedProperty = project.checker.getPropertyOfType(type, property.name);
      if (!resolvedProperty) fail(`${label}.${property.name} type cannot be resolved.`);
      assertNoAny(project, project.checker.getTypeOfSymbol(resolvedProperty), `${label}.${property.name}`, seen);
    }
    for (const kind of [SignatureKind.Call, SignatureKind.Construct]) {
      for (const signature of project.checker.getSignaturesOfType(type, kind)) {
        for (let index = 0; index < signature.parameters.length; index += 1) {
          assertNoAny(project, project.checker.getParameterType(signature, index), `${label} callback parameter ${index + 1}`, seen);
        }
        assertNoAny(project, project.checker.getReturnTypeOfSignature(signature), `${label} callback return`, seen);
      }
    }
    for (const indexInfo of project.checker.getIndexInfosOfType(type)) {
      assertNoAny(project, indexInfo.type, `${label} index value`, seen);
    }
  }
}

function assertExactIndexContracts(project, actualType, expectedType, label) {
  const actual = indexContractsOf(project, actualType);
  const expected = indexContractsOf(project, expectedType);
  if (actual.length !== expected.length) {
    fail(`${label} index signatures do not exactly match the canonical contract; expected ${expected.length}, found ${actual.length}.`);
  }
  const used = new Set();
  for (const expectedIndex of expected) {
    const actualIndex = actual.find((candidate, index) => !used.has(index)
      && project.checker.isTypeAssignableTo(candidate.keyType, expectedIndex.keyType)
      && project.checker.isTypeAssignableTo(expectedIndex.keyType, candidate.keyType));
    if (!actualIndex) fail(`${label} index key ${expectedIndex.display} is missing or incompatible.`);
    const actualIndexPosition = actual.indexOf(actualIndex);
    used.add(actualIndexPosition);
    assertNoAny(project, actualIndex.keyType, `${label} index key`);
    assertNoAny(project, actualIndex.valueType, `${label} index value`);
    if (actualIndex.readonly !== expectedIndex.readonly) {
      fail(`${label} ${expectedIndex.display} index readonly contract does not match the canonical contract.`);
    }
    if (!project.checker.isTypeAssignableTo(actualIndex.valueType, expectedIndex.valueType)
      || !project.checker.isTypeAssignableTo(expectedIndex.valueType, actualIndex.valueType)) {
      fail(`${label} ${expectedIndex.display} index value ${typeName(project, actualIndex.valueType)} does not exactly match ${typeName(project, expectedIndex.valueType)}.`);
    }
  }
}

function assertExactProps(project, actualType, expectedType, label) {
  assertNoAny(project, actualType, label);
  assertExactIndexContracts(project, actualType, expectedType, label);
  const actual = propsOf(project, actualType);
  const expected = propsOf(project, expectedType);
  const actualNames = [...actual.keys()].sort();
  const expectedNames = [...expected.keys()].sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    const extra = actualNames.filter((name) => !expected.has(name));
    const missing = expectedNames.filter((name) => !actual.has(name));
    fail(`${label} must have the exact structural contract; extra props: ${extra.join(", ") || "none"}; missing props: ${missing.join(", ") || "none"}.`);
  }
  for (const name of expectedNames) {
    const actualProp = actual.get(name);
    const expectedProp = expected.get(name);
    if (actualProp.required !== expectedProp.required) {
      fail(`${label}.${name} optionality does not match the canonical contract.`);
    }
    if (!actualProp.type || !expectedProp.type
      || !project.checker.isTypeAssignableTo(actualProp.type, expectedProp.type)
      || !project.checker.isTypeAssignableTo(expectedProp.type, actualProp.type)) {
      fail(`${label}.${name} type ${typeName(project, actualProp.type)} does not exactly match ${typeName(project, expectedProp.type)}.`);
    }
  }
}

function assertUnambiguousComponentProps(project, propsTypes, label) {
  const first = propsTypes[0];
  assertNoAny(project, first, `${label} consumed props`);
  for (let index = 1; index < propsTypes.length; index += 1) {
    assertExactProps(project, propsTypes[index], first, `${label} signature ${index + 1} consumed props`);
  }
  return first;
}

function isExactlyBoolean(project, type) {
  const booleanType = project.checker.getBooleanType();
  return project.checker.isTypeAssignableTo(type, booleanType)
    && project.checker.isTypeAssignableTo(booleanType, type);
}

function callbackFirstParameter(project, type) {
  const signatures = project.checker.getSignaturesOfType(type, SignatureKind.Call);
  if (signatures.length !== 1) return null;
  const signature = signatures[0];
  return signature && project.checker.getParameterType(signature, 0);
}

function assertEventTargetValue(project, canonicalProp, sourceProp, label) {
  const canonicalParameter = callbackFirstParameter(project, canonicalProp.type);
  const stringType = project.checker.getStringType();
  if (!canonicalParameter
    || !project.checker.isTypeAssignableTo(stringType, canonicalParameter)
    || !project.checker.isTypeAssignableTo(canonicalParameter, stringType)) {
    fail(`${label} event-target-value canonical prop must be a callback accepting a string value.`);
  }
  const sourceParameter = callbackFirstParameter(project, sourceProp.type);
  const target = sourceParameter && project.checker.getPropertyOfType(sourceParameter, "target");
  const targetType = target && project.checker.getTypeOfSymbol(target);
  const value = targetType && project.checker.getPropertyOfType(targetType, "value");
  const valueType = value && project.checker.getTypeOfSymbol(value);
  if (!sourceParameter || !valueType
    || !project.checker.isTypeAssignableTo(stringType, valueType)
    || !project.checker.isTypeAssignableTo(valueType, stringType)) {
    fail(`${label} event-target-value source prop must expect an event with a string target.value.`);
  }
}

function validateWrapper(project, mapping, canonicalType, sourceType) {
  assertNoAny(project, sourceType, `${mapping.canonicalExport} source props`);
  assertExactIndexContracts(project, sourceType, canonicalType, `${mapping.canonicalExport} source props`);
  const canonicalProps = propsOf(project, canonicalType);
  const sourceProps = propsOf(project, sourceType);
  const mappedSource = new Set();
  for (const entry of mapping.propMap) {
    const label = `${mapping.canonicalExport}.${entry.canonicalProp} -> ${entry.sourceProp}`;
    const canonicalProp = canonicalProps.get(entry.canonicalProp);
    const sourceProp = sourceProps.get(entry.sourceProp);
    if (!canonicalProp || !sourceProp) fail(`${label} references an unresolved prop signature.`);
    assertNoAny(project, canonicalProp.type, `${label} canonical prop`);
    assertNoAny(project, sourceProp.type, `${label} source prop`);
    if (!canonicalProp.required && sourceProp.required) {
      fail(`${label} requiredness is incompatible because an optional canonical prop cannot satisfy a required source prop.`);
    }
    if (entry.transform === "identity") {
      if (!canonicalProp.type || !sourceProp.type || !project.checker.isTypeAssignableTo(canonicalProp.type, sourceProp.type)) {
        fail(`${label} identity transform requires compatible types; ${typeName(project, canonicalProp.type)} is not assignable to ${typeName(project, sourceProp.type)}.`);
      }
    } else if (entry.transform === "boolean-inverse") {
      if (!isExactlyBoolean(project, canonicalProp.type) || !isExactlyBoolean(project, sourceProp.type)) {
        fail(`${label} boolean-inverse requires boolean canonical and source props.`);
      }
    } else if (entry.transform === "event-target-value") {
      assertEventTargetValue(project, canonicalProp, sourceProp, label);
    }
    mappedSource.add(entry.sourceProp);
  }
  const unmappedRequired = [...sourceProps]
    .filter(([name, prop]) => prop.required && !mappedSource.has(name))
    .map(([name]) => name);
  if (unmappedRequired.length > 0) {
    fail(`${mapping.canonicalExport} has unmapped required source prop(s): ${unmappedRequired.join(", ")}.`);
  }
}

function formatDiagnostics(diagnostics) {
  return diagnostics.map((diagnostic) => `${diagnostic.fileName ? `${diagnostic.fileName}: ` : ""}TS${diagnostic.code}: ${diagnostic.text}`).join("\n");
}

export function validateRuntimeTypeEvidence({ projectRoot, outputRoot, runtime, generatedSources = {} }) {
  if (!runtime?.enabled) return;
  const canonicalPath = resolve(outputRoot, ".design-consultant-canonical-contracts.ts");
  const barrelPath = resolve(outputRoot, "runtime/react/src/index.ts");
  const conformancePath = resolve(outputRoot, ".design-consultant-component-conformance.ts");
  const configPath = resolve(outputRoot, ".design-consultant-component-runtime-tsconfig.json");
  const virtualFiles = {
    [canonicalPath]: renderCanonicalContracts(),
    [barrelPath]: renderRuntimeBarrel(runtime.entries),
    [conformancePath]: renderComponentConformance(runtime.entries),
  };
  for (const adapter of runtime.adapters) {
    virtualFiles[absolute(projectRoot, adapter.projectAdapterPath)] = renderReactAdapter(adapter);
  }
  for (const generated of runtime.generatedComponents) {
    const source = generatedSources[generated.projectGeneratedPath ?? generated.generatedPath]
      ?? generatedSources[generated.generatedPath];
    if (typeof source !== "string") fail(`${generated.canonicalExport} approved generated source is missing.`);
    virtualFiles[absolute(outputRoot, generated.generatedPath)] = source;
  }
  const roots = [canonicalPath, barrelPath, conformancePath, ...Object.keys(virtualFiles).filter((path) => !new Set([canonicalPath, barrelPath, conformancePath]).has(path))];
  virtualFiles[configPath] = `${JSON.stringify({
    compilerOptions: {
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      allowJs: true,
      checkJs: true,
      jsx: "react-jsx",
      module: "esnext",
      moduleResolution: "bundler",
      target: "es2022",
      baseUrl: projectRoot,
      paths: {
        react: [REACT_TYPES_PATH],
        "react/jsx-runtime": [REACT_JSX_RUNTIME_TYPES_PATH],
      },
    },
    files: roots,
  }, null, 2)}\n`;

  const api = new API({ cwd: projectRoot, fs: makeVirtualFileSystem(virtualFiles) });
  let snapshot;
  try {
    snapshot = api.updateSnapshot({
      openProjects: [configPath],
      openFiles: roots,
      fileChanges: { created: Object.keys(virtualFiles) },
    });
    const project = snapshot.getProject(configPath) ?? snapshot.getDefaultProjectForFile(barrelPath);
    if (!project) fail("TypeScript validation project could not be created.");
    const canonicalFile = project.program.getSourceFile(canonicalPath);
    const canonicalModule = canonicalFile && project.checker.getSymbolAtLocation(canonicalFile);
    if (!canonicalModule) fail("canonical contract module could not be resolved.");

    for (const mapping of [...runtime.directComponents, ...runtime.adapters, ...runtime.manualComponents]) {
      const sourcePath = mapping.strategy === "manual"
        ? absolute(projectRoot, mapping.adapterPath)
        : absolute(projectRoot, mapping.source.path);
      const sourceSymbol = moduleExport(project, sourcePath, mapping.source?.exportName ?? mapping.canonicalExport, mapping.canonicalExport, { value: true });
      const canonicalPropsSymbol = project.checker.getExportsOfModule(canonicalModule)
        .find((symbol) => symbol.name === `${mapping.canonicalExport}Props`);
      if (!canonicalPropsSymbol) fail(`${mapping.canonicalExport} canonical props contract could not be resolved.`);
      const canonicalType = project.checker.getDeclaredTypeOfSymbol(canonicalPropsSymbol);
      const sourceType = assertUnambiguousComponentProps(project, componentPropsTypes(project, sourceSymbol, mapping.canonicalExport), mapping.canonicalExport);
      if (mapping.strategy === "direct" || mapping.strategy === "manual") {
        if (mapping.strategy === "manual") {
          assertExactProps(project, sourceType, canonicalType, `${mapping.canonicalExport} consumed props`);
          continue;
        }
        const propsSymbol = moduleExport(project, sourcePath, mapping.source.propsExport, `${mapping.canonicalExport} props`, { allowTypeOnly: true });
        const declaredProps = project.checker.getDeclaredTypeOfSymbol(propsSymbol);
        assertExactProps(project, declaredProps, canonicalType, `${mapping.canonicalExport} exported props`);
        assertExactProps(project, sourceType, canonicalType, `${mapping.canonicalExport} consumed props`);
      } else {
        validateWrapper(project, mapping, canonicalType, sourceType);
      }
    }

    const relevant = new Set([
      ...roots,
      ...runtime.directComponents.map((mapping) => absolute(projectRoot, mapping.source.path)),
      ...runtime.adapters.map((mapping) => absolute(projectRoot, mapping.source.path)),
      ...runtime.manualComponents.map((mapping) => absolute(projectRoot, mapping.adapterPath)),
    ].map(normalize));
    const diagnostics = [
      ...project.program.getConfigFileParsingDiagnostics(),
      ...project.program.getProgramDiagnostics(),
      ...project.program.getGlobalDiagnostics(),
      ...project.program.getSyntacticDiagnostics(),
      ...project.program.getBindDiagnostics(),
      ...project.program.getSemanticDiagnostics(),
    ].filter((diagnostic) => !diagnostic.fileName || relevant.has(normalize(diagnostic.fileName)));
    if (diagnostics.length > 0) fail(`planned wrapper/barrel compilation failed:\n${formatDiagnostics(diagnostics)}`);
  } finally {
    snapshot?.dispose();
    api.close();
  }
}
