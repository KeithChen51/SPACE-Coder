import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { collectSystemInventory } from "./adoption/inventory.mjs";

async function makeProject(t, prefix) {
  const projectRoot = await mkdtemp(join(tmpdir(), prefix));
  t.after(() => rm(projectRoot, { recursive: true, force: true }));
  return projectRoot;
}

test("inventory traverses a discovered root ui directory alongside src", async (t) => {
  const projectRoot = await makeProject(t, "inventory-src-ui-");
  const outputRoot = join(projectRoot, "design-system");
  await mkdir(join(projectRoot, "src"), { recursive: true });
  await mkdir(join(projectRoot, "ui"), { recursive: true });
  await mkdir(join(outputRoot, "generated"), { recursive: true });
  await writeFile(join(projectRoot, "src/App.tsx"), "export function App() { return <main />; }\n", "utf8");
  await writeFile(join(projectRoot, "ui/Button.tsx"), "export function Button() { return <button />; }\n", "utf8");
  await writeFile(join(projectRoot, "ui/tokens.css"), ":root { --ui-accent: #2457d6; }\n", "utf8");
  await writeFile(join(outputRoot, "generated/Noise.tsx"), "export const Noise = true;\n", "utf8");

  const inventory = await collectSystemInventory({ projectRoot, outputRoot });

  assert.equal(inventory.detected.scannedSourceFiles, 3);
  assert.deepEqual(inventory.detected.components.map((item) => item.path), ["src/App.tsx", "ui/Button.tsx"]);
  assert.deepEqual(
    inventory.detected.sharedComponentDirectories.find((item) => item.path === "ui"),
    { path: "ui", sourceFileCount: 1 },
  );
  assert.ok(inventory.detected.tokens.items.some((item) => item.name === "--ui-accent" && item.file === "ui/tokens.css"));
});

test("inventory traverses app and shared package directories in a small workspace", async (t) => {
  const projectRoot = await makeProject(t, "inventory-workspace-");
  const outputRoot = join(projectRoot, "design-system");
  await mkdir(join(projectRoot, "apps/site/src"), { recursive: true });
  await mkdir(join(projectRoot, "apps/site/dist"), { recursive: true });
  await mkdir(join(projectRoot, "packages/system/ui"), { recursive: true });
  await writeFile(join(projectRoot, "package.json"), `${JSON.stringify({ workspaces: ["apps/*", "packages/*"] })}\n`, "utf8");
  await writeFile(join(projectRoot, "apps/site/src/App.tsx"), "export function App() { return <main />; }\n", "utf8");
  await writeFile(join(projectRoot, "apps/site/dist/Generated.tsx"), "export const Generated = true;\n", "utf8");
  await writeFile(join(projectRoot, "packages/system/ui/Button.tsx"), "export function Button() { return <button />; }\n", "utf8");
  await writeFile(join(projectRoot, "packages/system/ui/theme.css"), ":root { --workspace-accent: teal; }\n", "utf8");

  const inventory = await collectSystemInventory({ projectRoot, outputRoot });

  assert.equal(inventory.detected.scannedSourceFiles, 3);
  assert.deepEqual(inventory.detected.components.map((item) => item.path), [
    "apps/site/src/App.tsx",
    "packages/system/ui/Button.tsx",
  ]);
  assert.deepEqual(
    inventory.detected.sharedComponentDirectories.find((item) => item.path === "packages/system/ui"),
    { path: "packages/system/ui", sourceFileCount: 1 },
  );
  assert.ok(inventory.detected.tokens.items.some((item) => item.name === "--workspace-accent"));
});

test("CSS AST inventory preserves selector context and classifies mixed theme declarations", async (t) => {
  const projectRoot = await makeProject(t, "inventory-css-context-");
  await mkdir(join(projectRoot, "src"), { recursive: true });
  await writeFile(join(projectRoot, "src/theme.css"), [
    ":root { --surface: white; --light-only: #fff; }",
    "@media (prefers-color-scheme: dark) {",
    "  :root { --surface: black; }",
    "  .panel {",
    "    & .title { --nested-ink: white; }",
    "  }",
    "}",
    '[data-theme="dark"] { --explicit-dark: #111; }',
    '[data-theme="light"] { --explicit-light: #eee; }',
    ".dark { color-scheme: dark; --class-dark: #000; }",
    "",
  ].join("\n"), "utf8");

  const inventory = await collectSystemInventory({ projectRoot, outputRoot: join(projectRoot, "design-system") });
  const tokens = inventory.detected.tokens.items;
  const surfaces = tokens.filter((item) => item.name === "--surface");

  assert.deepEqual(surfaces.map(({ value, selector, theme }) => ({ value, selector, theme })), [
    { value: "white", selector: ":root", theme: "light" },
    { value: "black", selector: ":root", theme: "dark" },
  ]);
  assert.deepEqual(
    tokens.find((item) => item.name === "--nested-ink"),
    {
      name: "--nested-ink",
      value: "white",
      selector: "& .title",
      file: "src/theme.css",
      line: 5,
      usageCount: 0,
      status: "observed",
      theme: "dark",
    },
  );
  assert.equal(tokens.find((item) => item.name === "--explicit-dark").theme, "dark");
  assert.equal(tokens.find((item) => item.name === "--explicit-light").theme, "light");
  assert.equal(tokens.find((item) => item.name === "--class-dark").theme, "dark");
  assert.ok(inventory.detected.themeDeclarations.some((item) => item.selector === ":root" && item.theme === "dark" && item.line === 3));
});

test("unsupported preprocessor syntax does not fabricate custom-property evidence", async (t) => {
  const projectRoot = await makeProject(t, "inventory-preprocessor-");
  await mkdir(join(projectRoot, "src"), { recursive: true });
  await writeFile(join(projectRoot, "src/theme.scss"), [
    "@mixin themed($name) {",
    "  :root.#{$name} { --fabricated: $name; }",
    "}",
    "",
  ].join("\n"), "utf8");

  const inventory = await collectSystemInventory({ projectRoot, outputRoot: join(projectRoot, "design-system") });

  assert.equal(inventory.detected.tokens.items.some((item) => item.name === "--fabricated"), false);
});
