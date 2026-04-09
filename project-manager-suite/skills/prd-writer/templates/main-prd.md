# {项目名称} — PRD 主文档

<!--
  本文件是主文档模板。{} 中的内容为占位符，需替换为实际内容。

  ═══════════════════════════════════════════════════════════════
  核心定位
  ═══════════════════════════════════════════════════════════════

  主文档是纯索引枢纽，自身不产出实质内容。
  - 产品背景和功能全貌 → 在功能列表中
  - 术语/Schema/API → 在 foundation-builder 产物中
  - 详细规格 → 在各子 PRD 中

  主文档的价值是：一个入口找到所有东西。
-->

> 生成时间: {YYYY-MM-DD HH:MM}
> 来源: prd-writer Phase 3
> 技术栈: Vue 3

---

## 上游引用

<!--
  所有外部产物的文件路径集中在此。
  子 PRD 通过引用主文档来获取这些路径。
  路径必须是真实存在的文件路径。
-->

| 产物 | 文件 | 来源 Skill |
|------|------|-----------|
| 功能列表 | [prd-feature-list-{slug}.md](...) | prd-writer |
| 用户流程 | [explainer-flow-{slug}.md](...) | page-explainer |
| 交互语义 | [explainer-c-interaction-{slug}.md](...) / [explainer-b-interaction-{slug}.md](...) | page-explainer |
| B 端权限矩阵 | [explainer-b-permission-{slug}.md](...) | page-explainer |
| 术语表 | [foundation-glossary-{slug}.md](...) | foundation-builder |
| 数据库 Schema | [foundation-schema-{slug}.md](...) | foundation-builder |
| API 接口 | [foundation-api-{slug}.md](...) | foundation-builder |
| BRD | [BRD-{slug}-*.md](...) | brd-writer |
| 页面交付清单 | [page-delivery-{slug}.md](...) | page-designer |

---

## 子 PRD 索引

<!--
  双向引用的锚点。每份子 PRD 完成后回填此表。
  状态：✅ 已确认 / 🔄 撰写中 / ⏳ 待开始
-->

| # | 区块 | 所属页面 | 子 PRD 文件 | 状态 |
|---|------|---------|-----------|------|
| 1 | {区块名} | {页面名} | [prd-{slug}-{区块名}.md](...) | {状态} |

---

## 全局设计规则

<!--
  唯一保留的实质内容区域。
  只放跨区块通用的规则，如统一的空状态处理、加载态、错误提示规范。
  区块内部的设计规则放在对应子 PRD 中。
-->

| 规则 | 说明 |
|------|------|
| 空状态 | {统一的空状态展示方式} |
| 加载态 | {统一的加载态展示方式} |
| 错误提示 | {统一的错误提示规范} |
