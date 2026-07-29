import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = resolve(SCRIPT_DIR, "..");

async function readSkillFile(path) {
  return readFile(join(SKILL_ROOT, path), "utf8");
}

test("component craft tokens separate surfaces, disabled states, and elevation roles", async () => {
  const document = JSON.parse(await readSkillFile("templates/tokens.json"));
  const { color, shadow } = document.tokens;

  for (const [name, variable] of Object.entries({
    surfaceSubtle: "--surface-subtle",
    surfaceHover: "--surface-hover",
    surfaceTableHead: "--surface-table-head",
    disabledBackground: "--disabled-bg",
    disabledText: "--disabled-text",
  })) {
    assert.equal(color[name]?.cssVariable, variable, `missing semantic color role ${name}`);
  }

  for (const [name, variable] of Object.entries({
    card: "--shadow-card",
    popover: "--shadow-popover",
    dialog: "--shadow-dialog",
  })) {
    assert.equal(shadow[name]?.cssVariable, variable, `missing elevation role ${name}`);
  }

  const themeRolePaths = [
    "color.surfaceSubtle",
    "color.surfaceHover",
    "color.surfaceTableHead",
    "color.disabledBackground",
    "color.disabledText",
    "shadow.card",
    "shadow.popover",
    "shadow.dialog",
  ];
  for (const [themeId, theme] of Object.entries(document.themes.variants)) {
    for (const path of themeRolePaths) {
      assert.equal(typeof theme.tokens[path], "string", `${themeId} must override ${path}`);
    }
  }
});

test("runtime components consume the dedicated craft roles", async () => {
  const styles = await readSkillFile("templates/react-runtime/src/styles.css");

  assert.match(styles, /\.dc-button:disabled[^{]*\{[^}]*var\(--disabled-bg\)[^}]*var\(--disabled-text\)/s);
  assert.match(styles, /\.dc-field-shell :is\(input, select, textarea\):disabled[^{]*\{[^}]*var\(--disabled-bg\)[^}]*var\(--disabled-text\)/s);
  assert.match(styles, /\.dc-metric-card\s*\{[^}]*box-shadow:\s*var\(--shadow-card\)/s);
  assert.match(styles, /\.dc-filter-bar\s*\{[^}]*border-radius:\s*var\(--radius-lg\)[^}]*box-shadow:\s*var\(--shadow-card\)/s);
  assert.match(styles, /\.dc-data-table th\s*\{[^}]*background:\s*var\(--surface-table-head\)/s);
  assert.match(styles, /\.dc-selection-popover\s*\{[^}]*box-shadow:\s*var\(--shadow-popover\)/s);
  assert.match(styles, /@media \(max-width: 720px\)[^{]*\{[^}]*\.dc-selection-option\s*\{[^}]*var\(--control-height-touch\)/s);
  assert.match(styles, /\.dc-dialog\s*\{[^}]*box-shadow:\s*var\(--shadow-dialog\)/s);
  assert.match(styles, /\.dc-inline-notice--info\s*\{[^}]*border-left-color:\s*var\(--info\)/s);
});

test("selection controls share the dy-data control shell and use real icons", async () => {
  const styles = await readSkillFile("templates/react-runtime/src/styles.css");
  const tokens = JSON.parse(await readSkillFile("templates/tokens.json"));
  const selectSource = await readSkillFile("templates/react-runtime/src/SelectField.tsx");
  const searchableSource = await readSkillFile("templates/react-runtime/src/SearchableSelect.tsx");
  const multiSource = await readSkillFile("templates/react-runtime/src/MultiSelectField.tsx");

  assert.equal(tokens.tokens.control.heightDesktop.value, "38px");
  assert.equal(tokens.tokens.control.radius.value, "6px");
  assert.doesNotMatch(styles, /\.dc-select-chevron::before/);
  assert.doesNotMatch(styles, /\.dc-select-clear-icon::(?:before|after)/);
  assert.match(styles, /\.dc-select-trigger\s*\{[^}]*min-height:\s*var\(--control-height\)[^}]*border-radius:\s*var\(--control-radius\)/s);
  assert.match(styles, /\.dc-selection-popover\s*\{[^}]*box-shadow:\s*var\(--shadow-popover\)/s);
  assert.match(selectSource, /from "lucide-react"/);
  assert.match(searchableSource, /from "lucide-react"/);
  assert.match(multiSource, /from "lucide-react"/);
});

test("catalog presentation uses raised cards and denser adaptive demo stages", async () => {
  const styles = await readSkillFile("templates/component-library.css");
  const adoptionFoundation = await readSkillFile("templates/adoption-catalog-foundation.css");

  assert.match(styles, /\.catalog-demo-card\s*\{[^}]*box-shadow:\s*var\(--shadow-card\)/s);
  assert.match(styles, /\.catalog-demo-body\s*\{[^}]*background:\s*var\(--surface-subtle\)/s);
  assert.match(adoptionFoundation, /--dc-catalog-surface-subtle\s*:/);
  assert.match(adoptionFoundation, /--dc-catalog-shadow-card\s*:/);

  const minHeight = styles.match(/\.catalog-demo-body\s*\{[^}]*min-height:\s*(\d+)px/s);
  assert.ok(minHeight, "catalog demo body must define a stable minimum height");
  assert.ok(Number(minHeight[1]) <= 132, "simple component demos should not create excessive empty space");
});
