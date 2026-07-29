import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { SOURCE_CARD_TITLES } from "./lieflat-localization.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = join(SCRIPT_DIR, "..");
const GALLERY_ROOT = join(SKILL_ROOT, "templates/visualization-lieflat");
const FILES = [
  "lupi-gallery.html",
  "basics-gallery.html",
  "glance-gallery.html",
  "big-circular.html",
  "big-force.html",
  "big-threads.html",
];

const EXPECTED_COPY = Object.freeze({
  "lupi-gallery.html": ["十二项功能的发布轨迹", "峰值前三日", "员工最担心的问题"],
  "basics-gallery.html": ["各套餐月度经常性收入", "流量来源构成", "改版前后的上手用时"],
  "glance-gallery.html": ["版本发布后的团队感受", "同一组产品的三种观察方式", "2026 年上半年 · ARR"],
  "big-circular.html": ["六十个代码仓库的协作关系", "位共同贡献者"],
  "big-force.html": ["一百八十项服务的调用网络", "次调用/日"],
  "big-threads.html": ["数据从哪里来，又流向哪里", "① 数据来源", "已固定 · 单击空白处释放"],
});

const BANNED_RUNTIME_COPY = [
  "launched W",
  "+' incidents'",
  "+' accounts'",
  "core contributor #",
  "competitor ${",
  "week ${c+1} × lane",
  "+' tickets'",
  "deploy #",
  "'shipped':'reworked'",
  " owns ${",
  "'GET THROUGH'",
  "one of ${v} in 100",
  "DO MORE WITH THE SAME PAY",
  "picked this — they could pick several",
  "ONE TICK = ONE RESPONDENT",
  "'Happiness'",
  "'P0 CRITICAL'",
  "h to resolve",
  "HOURS TO RESOLVE",
  "k syncs/mo",
  "k calls/day",
  "text:'LIVE'",
  "['JAN','FEB'",
  "ARR · H1 2026",
  "PINNED ·",
  "① SOURCE",
  "② PROCESSOR",
  "③ DESTINATION",
];

function visibleMetadata(html) {
  return [...html.matchAll(/<(?:title|h1|h2|p|div class="(?:sub|src|note|legend)")[^>]*>([\s\S]*?)<\/(?:title|h1|h2|p|div)>/gi)]
    .map((match) => match[1].replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim())
    .join("\n");
}

function withoutAcceptedTerms(text) {
  return text.replace(/\b(?:Lupi|MAU|MRR|ARR|API|SLA|CRM|CDN|DNS|OOM|Git|GitHub|Slack|iOS|IoT|Webhook)\b/g, "");
}

test("可视化派生页面默认使用自然中文文案", async () => {
  const pages = new Map(await Promise.all(FILES.map(async (file) => [
    file,
    await readFile(join(GALLERY_ROOT, file), "utf8"),
  ])));
  const combined = [...pages.values()].join("\n");

  for (const [file, html] of pages) {
    assert.match(html, /<html lang="zh-CN">/, `${file} 必须声明简体中文`);
    for (const expected of EXPECTED_COPY[file]) {
      assert.ok(html.includes(expected), `${file} 缺少中文文案：${expected}`);
    }
    const metadata = withoutAcceptedTerms(visibleMetadata(html));
    assert.doesNotMatch(metadata, /\b[A-Za-z]{3,}\b/, `${file} 的可见标题或说明仍有未批准英文：\n${metadata}`);
  }

  for (const sourceTitle of SOURCE_CARD_TITLES) {
    assert.ok(!combined.includes(sourceTitle), `派生页面仍显示上游英文文案：${sourceTitle}`);
  }
  for (const phrase of BANNED_RUNTIME_COPY) {
    assert.ok(!combined.includes(phrase), `运行时图表文案仍有英文残留：${phrase}`);
  }
});

test("可视化 manifest 使用中文展示字段并保留上游谱系", async () => {
  const manifest = JSON.parse(await readFile(join(SKILL_ROOT, "templates/visualization-manifest.json"), "utf8"));
  assert.equal(manifest.presets.length, 48);
  for (const preset of manifest.presets) {
    assert.match(preset.name, /[\u3400-\u9fff]/, `${preset.id}.name 必须是中文展示名称`);
    assert.match(preset.systemLabel, /[\u3400-\u9fff]/, `${preset.id}.systemLabel 必须是中文展示名称`);
    if (preset.cardTitle) assert.match(preset.cardTitle, /[\u3400-\u9fff]/, `${preset.id}.cardTitle 必须是中文标题`);
    assert.ok(Object.hasOwn(preset, "sourceName"), `${preset.id} 缺少 sourceName`);
    assert.ok(Object.hasOwn(preset, "sourceSystemLabel"), `${preset.id} 缺少 sourceSystemLabel`);
    assert.ok(Object.hasOwn(preset, "sourceCardTitle"), `${preset.id} 缺少 sourceCardTitle`);
  }
});
