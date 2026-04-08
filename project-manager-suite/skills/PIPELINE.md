# 产品设计流水线（BRD → PRD）

本文件描述从需求到 PRD 的完整设计流水线，包含 4 个 Skill 的职责、依赖和产物。

## 流水线总览

```
S1 阶段                S2 阶段
────────    ──────────────────────────────────────────────

brd-writer → page-designer → foundation-builder → prd-writer
   │              │                  │                 │
   ▼              ▼                  ▼                 ▼
  BRD        页面代码         术语表/Schema/API    功能列表/主PRD/子PRD
            交付清单            交付清单
```

---

## 1. brd-writer — 业务需求文档

**职责**：通过结构化访谈收敛需求，输出可执行的 BRD（Business Requirements Document）。

**依赖文件**：无（流水线起点，由用户输入驱动）

**产出文件**：

| 产物 | 文件名 |
|------|--------|
| BRD 文件 | `BRD-<slug>-<YYYYMMDD-HHMM>.md` |

---

## 2. page-designer — 页面设计编排

**职责**：基于 BRD 编排 ui-ux-pro-max 生成可交互的 Vue 3 前端页面。C+B 项目先出 C 端再反推控制台，纯 B 项目直接出 B 端。

**依赖文件**：

| 文件 | 来源 |
|------|------|
| `BRD-<slug>-*.md` | brd-writer |

**产出文件**：

| 产物 | 文件名 | 说明 |
|------|--------|------|
| C 端页面 | Vue 3 项目代码 | 可交互，mock 数据（仅 C+B） |
| B 端控制台页面 | Vue 3 项目代码 | 可交互，mock 数据 |
| 实体中间文件 | `page-spec-entities-<slug>.md` | C 端实体规格（仅 C+B） |
| 交付清单 | `page-delivery-<slug>.md` | 页面路由表、文件路径、下游索引 |

---

## 3. foundation-builder — 技术地基设计

**职责**：消费已确认的前端页面代码，反推并设计术语表、数据库 Schema 和 API 接口。不写代码，不生成 DDL。

**依赖文件**：

| 文件 | 来源 |
|------|------|
| `BRD-<slug>-*.md` | brd-writer |
| `page-delivery-<slug>.md` | page-designer |
| 页面代码文件（Vue 3 组件） | page-designer |
| 已有数据库/接口文件（可选） | 用户提供 |

**产出文件**：

| 产物 | 文件名 | 说明 |
|------|--------|------|
| 术语表 | `foundation-glossary-<slug>.md` | 按业务域分组的统一术语定义 |
| 数据库 Schema | `foundation-schema-<slug>.md` | 表结构设计，超 400 行自动拆分 |
| API 接口设计 | `foundation-api-<slug>.md` | 接口定义，超 400 行自动拆分 |
| 交付清单 | `foundation-delivery-<slug>.md` | 产物索引 + 一致性自查结果 |

---

## 4. prd-writer — PRD 撰写

**职责**：基于页面代码和技术地基，产出面向 AI 编程的 PRD 规格文件。PRD 不是给人看的，是 AI 拿到后能直接编码的基准规格。

**依赖文件**：

| 文件 | 来源 |
|------|------|
| `BRD-<slug>-*.md` | brd-writer |
| `page-delivery-<slug>.md` | page-designer |
| 页面代码文件（Vue 3 组件） | page-designer |
| `foundation-glossary-<slug>.md` | foundation-builder |
| `foundation-schema-<slug>.md` | foundation-builder |
| `foundation-api-<slug>.md` | foundation-builder |
| `foundation-delivery-<slug>.md` | foundation-builder |

**产出文件**：

| 产物 | 文件名 | 说明 |
|------|--------|------|
| 功能列表 | `prd-feature-list-<slug>.md` | 产品背景 + 页面全景 + 区块业务逻辑 |
| 主文档 | `prd-main-<slug>.md` | 全局索引枢纽，引用所有上游产物 |
| 子文档(N份) | `prd-<slug>-<区块名>.md` | 按区块拆分，字段级可追溯 |

---

## 依赖关系矩阵

下表展示每个 Skill 消费了哪些上游产物（✓ = 直接依赖）：

| 产物 | brd-writer | page-designer | foundation-builder | prd-writer |
|------|:---:|:---:|:---:|:---:|
| BRD | 产出 | ✓ | ✓ | ✓ |
| 页面代码 | | 产出 | ✓ | ✓ |
| page-delivery | | 产出 | ✓ | ✓ |
| page-spec-entities | | 产出 | | |
| foundation-glossary | | | 产出 | ✓ |
| foundation-schema | | | 产出 | ✓ |
| foundation-api | | | 产出 | ✓ |
| foundation-delivery | | | 产出 | ✓ |
| prd-feature-list | | | | 产出 |
| prd-main | | | | 产出 |
| prd-子文档 | | | | 产出 |
