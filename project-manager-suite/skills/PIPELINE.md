# 产品设计流水线（BRD → PRD）

本文件描述从项目画像到 PRD 的完整设计流水线，包含 6 个执行 Skill + 2 个调度 Skill 的职责、依赖和产物。

## 流水线总览

```
S0 阶段         S1 阶段                          S2 阶段
──────────    ────────    ────────────────────────────────────────────────────────────────────────

                                    page-chief 调度                     prd-chief 调度
                               ┌─────────────────────┐           ┌──────────────────────┐
ai-project-manager → brd-writer → page-designer → page-explainer → foundation-builder → prd-writer
        │                │         │                │                  │                 │
        ▼                ▼         ▼                ▼                  ▼                 ▼
  project-profile       BRD    页面代码       流程/交互语义/权限   术语表/Schema/API    功能列表/主PRD/子PRD
                               交付清单        差异(可选)            交付清单
```

### 调度层说明

| 调度 Skill | 管辖范围 | 职责 | 自身产物 |
|-----------|---------|------|---------|
| `page-chief` | page-designer → page-explainer | 观察产物文件状态，判断下一步子 skill；有 gap 时判定回环（上限 3 轮） | 无（纯调度，不产出文件） |
| `prd-chief` | foundation-builder → prd-writer | 校验上游产物链完整性，线性推进 foundation → PRD | 无（纯调度，不产出文件） |

调度层不向子 skill 传递指令，子 skill 不感知调度层存在。调度层只通过观察产物文件是否存在、内容是否合格来判断子 skill 是否完成。

---

## 1. brd-writer — 业务需求文档

**职责**：通过结构化访谈收敛需求，输出可执行的 BRD（Business Requirements Document）。

**slug 约定**：`project_slug` 由 brd-writer 在 Phase A 确定（英文短语、全小写、连字符分隔），写入台账头部。**流水线中所有下游 skill 的产物文件必须使用同一个 slug**，确保产物可通过文件名关联。

**依赖文件**：

| 文件 | 来源 |
|------|------|
| `project-profile.md` | ai-project-manager |

**产出文件**：

| 产物 | 文件名 | 说明 |
|------|--------|------|
| BRD 决策台账 | `brd-ledger-<slug>.md` | 过程产物：P0 字段确认状态、冲突记录、轮次变更日志、充分性快照 |
| BRD 文件 | `BRD-<slug>-<YYYYMMDD-HHMM>.md` | 最终交付物 |

---

## 2. page-designer — 页面设计

**职责**：基于 BRD 产出可交互的前端页面（技术栈从 tech-stack.md 读取，内置设计知识库）。C+B 项目先出 C 端再反推控制台，纯 B 项目直接出 B 端。

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

## 3. page-explainer — 页面交互解释

**职责**：以用户流程为骨架、逐页交互为血肉，产出结构化行为语义规格（含冻结门禁），主动识别交互盲区。B 端额外输出页面级权限矩阵。发现差异时按分类产出修改建议供 page-designer 回环。

**依赖文件**：

| 文件 | 来源 |
|------|------|
| `BRD-<slug>-*.md` | brd-writer |
| `page-delivery-<slug>.md` | page-designer |
| 页面代码文件（Vue 3 组件） | page-designer |

**产出文件**：

| 产物 | 文件名 | 说明 |
|------|--------|------|
| 用户流程图 | `explainer-flow-<slug>.md` | 按用户任务组织的流程描述 + 产物索引 |
| C 端交互描述 | `explainer-c-interaction-<slug>.md` | 结构化语义条目，含 locked/open 状态（仅 C+B） |
| B 端交互描述 | `explainer-b-interaction-<slug>.md` | 结构化语义条目，含 locked/open 状态 |
| B 端权限矩阵 | `explainer-b-permission-<slug>.md` | 角色 × 页面/菜单可见性 |
| C 端差异 | `explainer-c-gap-<slug>.md` | 分类差异条目（仅 C+B，有差异时） |
| B 端差异 | `explainer-b-gap-<slug>.md` | 分类差异条目（有差异时） |

**下游消费规则**：只有 `status: locked` 的语义条目，foundation-builder 和 prd-writer 才能当权威依据。

---

## 4. foundation-builder — 技术地基设计

**职责**：消费已确认的前端页面代码，反推并设计术语表、数据库 Schema 和 API 接口。不写代码，不生成 DDL。

**依赖文件**：

| 文件 | 来源 |
|------|------|
| `BRD-<slug>-*.md` | brd-writer |
| `page-delivery-<slug>.md` | page-designer |
| 页面代码文件（Vue 3 组件） | page-designer |
| `explainer-flow-<slug>.md` | page-explainer |
| `explainer-c-interaction-<slug>.md` / `explainer-b-interaction-<slug>.md` | page-explainer |
| `explainer-b-permission-<slug>.md` | page-explainer |
| 已有数据库/接口文件（可选） | 用户提供 |

**产出文件**：

| 产物 | 文件名 | 说明 |
|------|--------|------|
| 术语表 | `foundation-glossary-<slug>.md` | 按业务域分组的统一术语定义 |
| 数据库 Schema | `foundation-schema-<slug>.md` | 表结构设计，超 400 行自动拆分 |
| API 接口设计 | `foundation-api-<slug>.md` | 接口定义，超 400 行自动拆分 |
| 交付清单 | `foundation-delivery-<slug>.md` | 产物索引 + 一致性自查结果 |

---

## 5. prd-writer — PRD 撰写

**职责**：基于页面代码和技术地基，产出面向 AI 编程的 PRD 规格文件。PRD 不是给人看的，是 AI 拿到后能直接编码的基准规格。

**依赖文件**：

| 文件 | 来源 |
|------|------|
| `BRD-<slug>-*.md` | brd-writer |
| `page-delivery-<slug>.md` | page-designer |
| 页面代码文件（Vue 3 组件） | page-designer |
| `explainer-flow-<slug>.md` | page-explainer |
| `explainer-c-interaction-<slug>.md` / `explainer-b-interaction-<slug>.md` | page-explainer |
| `explainer-b-permission-<slug>.md` | page-explainer |
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

下表展示每个 Skill 消费了哪些上游产物（✓ = 直接依赖，👁 = 观察但不修改）：

| 产物 | ai-project-manager | brd-writer | page-chief | page-designer | page-explainer | prd-chief | foundation-builder | prd-writer |
|------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| project-profile | 产出 | ✓（硬依赖） | | | | | | |
| BRD | | 产出 | 👁 | ✓ | ✓ | 👁 | ✓ | ✓ |
| 页面代码 | | | 👁 | 产出 | ✓ | 👁 | ✓ | ✓ |
| page-delivery | | | 👁 | 产出 | ✓ | 👁 | ✓ | ✓ |
| page-spec-entities | | | | 产出 | | | | |
| explainer-flow | | | 👁 | | 产出 | 👁 | ✓ | ✓ |
| explainer-interaction | | | 👁 | | 产出 | 👁 | ✓（仅 locked） | ✓（仅 locked） |
| explainer-b-permission | | | 👁 | | 产出 | 👁 | ✓ | ✓ |
| explainer-gap | | | 👁 | | 产出（可选） | 👁 | | |
| foundation-glossary | | | | | | 👁 | 产出 | ✓ |
| foundation-schema | | | | | | 👁 | 产出 | ✓ |
| foundation-api | | | | | | 👁 | 产出 | ✓ |
| foundation-delivery | | | | | | 👁 | 产出 | ✓ |
| prd-feature-list | | | | | | 👁 | | 产出 |
| prd-main | | | | | | 👁 | | 产出 |
| prd-子文档 | | | | | | 👁 | | 产出 |
