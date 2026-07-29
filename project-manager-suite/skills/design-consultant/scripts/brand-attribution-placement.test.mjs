import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = resolve(SCRIPT_DIR, "..");
const REPO_ROOT = resolve(SKILL_ROOT, "../..");
const MASK_BUILD_SCRIPT = join(SCRIPT_DIR, "build-brand-attribution-masks.mjs");

test("品牌署名落位规范被 Skill、HTML Catalog、项目模板与 eval 共同约束", async () => {
  const [skill, reference, catalogSource, catalogStyles, runtimeSource, runtimeStyles, runtimeMasks, designTemplate, agentRules, evalsSource] = await Promise.all([
    readFile(join(SKILL_ROOT, "SKILL.md"), "utf8"),
    readFile(join(SKILL_ROOT, "references/brand-attribution-placement.md"), "utf8"),
    readFile(join(SKILL_ROOT, "templates/catalog-react.tsx"), "utf8"),
    readFile(join(SKILL_ROOT, "templates/component-library.css"), "utf8"),
    readFile(join(SKILL_ROOT, "templates/react-runtime/src/BrandAttribution.tsx"), "utf8"),
    readFile(join(SKILL_ROOT, "templates/react-runtime/src/styles.css"), "utf8"),
    readFile(join(SKILL_ROOT, "templates/react-runtime/src/brand-attribution-masks.ts"), "utf8"),
    readFile(join(SKILL_ROOT, "templates/DESIGN.md"), "utf8"),
    readFile(join(SKILL_ROOT, "templates/project-design-agent-rules.md"), "utf8"),
    readFile(join(REPO_ROOT, "evals/design-consultant/evals.json"), "utf8"),
  ]);

  assert.match(skill, /references\/brand-attribution-placement\.md/);
  for (const placement of [
    "rail-footer",
    "account-surface-footer",
    "auth-panel-footer",
    "authorization-panel-footer",
    "home-footer",
    "page-footer",
  ]) {
    assert.match(reference, new RegExp(`\\b${placement}\\b`));
  }
  assert.match(reference, /一个视口只保留一个可见实例/);
  assert.match(reference, /顶部栏/);
  assert.match(reference, /移动端底部一级导航/);
  assert.match(reference, /业务 Dialog \/ Drawer 正文/);
  assert.match(reference, /不得重新描摹、内联仿制、裁切、拉伸、CSS filter 变色/);
  assert.match(reference, /component-library\.html#brand-attribution/);
  assert.match(reference, /来源实现事实/);
  assert.match(reference, /fixed-brand/);
  assert.match(reference, /#FE5205/);
  assert.match(reference, /通用组件决策/);
  assert.match(reference, /#4F46E5/);
  assert.match(reference, /focus-and-orbit/);
  assert.match(reference, /orbit-only/);
  assert.match(reference, /品牌原生版/);
  assert.match(reference, /克制融入版/);
  assert.match(reference, /成熟品牌或视觉系统/);
  assert.match(reference, /standard-stacked/);
  assert.match(reference, /compact-horizontal/);
  assert.match(reference, /不要求每个页面/);
  assert.match(reference, /0\.5 × SPACE 字标高度/);
  assert.match(reference, /`160px`/);
  assert.match(reference, /`108px`/);

  assert.match(catalogSource, /id="brand-attribution"/);
  assert.match(catalogSource, /Canonical lockups \/ 主次版本/);
  assert.match(catalogSource, /Stable placement \/ 稳定落位/);
  assert.match(catalogSource, /Color modes \/ 颜色模式/);
  assert.match(catalogSource, /type="color"/);
  assert.match(catalogSource, /<BrandAttribution variant="standard-stacked"/);
  assert.match(catalogSource, /<BrandAttribution variant="compact-horizontal"/);
  assert.match(catalogSource, /accentScope="focus-and-orbit"/);
  assert.match(catalogSource, /accentScope="orbit-only"/);
  assert.match(catalogSource, /品牌原生版/);
  assert.match(catalogSource, /克制融入版/);
  assert.match(catalogStyles, /\.brand-attribution-showcase/);
  assert.match(catalogStyles, /\.brand-attribution-scope-grid/);
  assert.match(catalogStyles, /\.brand-attribution-placement-grid/);
  assert.match(catalogStyles, /--brand-attribution-accent/);
  assert.match(runtimeSource, /aria-label="Powered by SPACE AI Native"/);
  assert.match(runtimeSource, /"standard-stacked" \| "compact-horizontal"/);
  assert.match(runtimeSource, /"focus-and-orbit" \| "orbit-only"/);
  assert.doesNotMatch(runtimeSource, /\| "mark"/);
  assert.match(runtimeStyles, /font: 600 12px\/1\.2 var\(--font-sans\)/);
  assert.match(runtimeStyles, /"DC Ethnocentric"/);
  assert.match(runtimeStyles, /width: 160px/);
  assert.match(runtimeStyles, /width: 108px/);
  assert.match(runtimeSource, /SPACE_WORDMARK_MASK/);
  assert.match(runtimeSource, /SPACE_FOCUS_MASK/);
  assert.match(runtimeSource, /SPACE_ORBIT_BACK_MASK/);
  assert.match(runtimeSource, /SPACE_ORBIT_FRONT_MASK/);
  assert.match(runtimeSource, /orbit-back[\s\S]*neutral[\s\S]*focus[\s\S]*orbit-front/);
  assert.match(runtimeStyles, /accent-orbit-only/);
  assert.match(runtimeMasks, /data:image\/svg\+xml;base64,/);

  assert.match(designTemplate, /## 品牌资产与产品级署名/);
  assert.match(designTemplate, /响应式迁移/);
  assert.match(designTemplate, /同一视口只有一个可见实例/);
  assert.match(designTemplate, /重点色范围/);
  assert.match(agentRules, /主品牌 Logo 与 `Powered by` \/ 技术署名不得混用/);
  assert.match(agentRules, /同一视口最多一个可见实例/);
  assert.match(agentRules, /orbit-only/);

  const evaluation = JSON.parse(evalsSource);
  const scenario = evaluation.evals.find(
    (item) => item.id === "E25-brand-attribution-placement",
  );
  assert.ok(scenario, "应包含品牌署名落位 eval");
  assert.match(scenario.expected_output, /Rail 底部/);
  assert.match(scenario.expected_output, /账户\/更多\/关于表面/);
  assert.match(scenario.expected_output, /home-footer/);
  assert.match(scenario.expected_output, /默认靛蓝/);
  assert.match(scenario.expected_output, /standard-stacked/);
  assert.match(scenario.expected_output, /compact-horizontal/);
  assert.match(scenario.expected_output, /同一视口仅一个可见实例/);
  assert.match(scenario.expected_output, /--brand-attribution-accent/);
  assert.match(scenario.expected_output, /focus-and-orbit/);
  assert.match(scenario.expected_output, /orbit-only/);
  assert.match(scenario.expected_output, /低频品牌表面/);
  assert.match(scenario.expected_output, /长期常驻位置/);
});

test("品牌署名蒙版按批准 SVG 的前后关系拆分为四个绘制层", async () => {
  const checked = spawnSync(process.execPath, [MASK_BUILD_SCRIPT, "check"], { encoding: "utf8" });
  assert.equal(checked.status, 0, checked.stdout || checked.stderr);
  const result = JSON.parse(checked.stdout);
  assert.equal(result.results.length, 7);
  assert.deepEqual(result.results.map((item) => item.status), Array(7).fill("current"));
  const [neutral, accent, focus, orbit, orbitBack, orbitFront, runtimeMasks] = await Promise.all([
    readFile(join(SKILL_ROOT, "templates/brand-attribution/space-mark-parametric-wordmark-mask.svg"), "utf8"),
    readFile(join(SKILL_ROOT, "templates/brand-attribution/space-mark-parametric-accent-mask.svg"), "utf8"),
    readFile(join(SKILL_ROOT, "templates/brand-attribution/space-mark-parametric-focus-mask.svg"), "utf8"),
    readFile(join(SKILL_ROOT, "templates/brand-attribution/space-mark-parametric-orbit-mask.svg"), "utf8"),
    readFile(join(SKILL_ROOT, "templates/brand-attribution/space-mark-parametric-orbit-back-mask.svg"), "utf8"),
    readFile(join(SKILL_ROOT, "templates/brand-attribution/space-mark-parametric-orbit-front-mask.svg"), "utf8"),
    readFile(join(SKILL_ROOT, "templates/react-runtime/src/brand-attribution-masks.ts"), "utf8"),
  ]);
  for (const mask of [neutral, accent, focus, orbit, orbitBack, orbitFront]) {
    assert.doesNotMatch(mask, /[ \t]+$/m);
  }
  assert.doesNotMatch(neutral, /M 632\.8 17\.2/);
  assert.match(accent, /M 632\.8 17\.2/);
  assert.match(focus, /M 632\.8 17\.2/);
  assert.doesNotMatch(focus, /M 565\.71407 78\.16338/);
  assert.doesNotMatch(orbit, /M 632\.8 17\.2/);
  assert.match(orbit, /M 565\.71407 78\.16338/);
  assert.match(orbitBack, /M 565\.71407 78\.16338/);
  assert.doesNotMatch(orbitBack, /M 780\.61792 78\.45996/);
  assert.match(orbitFront, /M 780\.61792 78\.45996/);
  assert.doesNotMatch(orbitFront, /M 565\.71407 78\.16338/);
  assert.ok(runtimeMasks.includes(Buffer.from(neutral).toString("base64")));
  assert.ok(runtimeMasks.includes(Buffer.from(focus).toString("base64")));
  assert.ok(runtimeMasks.includes(Buffer.from(orbit).toString("base64")));
  assert.ok(runtimeMasks.includes(Buffer.from(orbitBack).toString("base64")));
  assert.ok(runtimeMasks.includes(Buffer.from(orbitFront).toString("base64")));
});
