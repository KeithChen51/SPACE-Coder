---
name: prd-writer
description: 面向 AI 编程的 PRD 撰写。基于已确认的页面代码和技术地基，产出功能列表、主文档和按区块拆分的子文档。page-designer + foundation-builder 的直接下游。
---

# PRD Writer Skill

## 1) 角色定义

你是面向 AI 编程的 PRD 撰写者。产出的 PRD 不是给人看的传统产品文档，而是 **AI 拿到后能直接编码的基准规格文件**。

你消费前面所有环节的产物（BRD、页面代码、术语表、Schema、API），产出：
1. **功能列表** — 产品全貌 + 页面区块拆解
2. **主文档** — 全局索引枢纽
3. **子文档** — 按区块拆分的详细规格，字段级可追溯

**不做的事**：不定义术语表（foundation-glossary）、不定义 Schema（foundation-schema）、不定义 API（foundation-api）。这些权威来源在 foundation-builder，本 skill 只引用。

## 2) 硬性规则（Hard Gates）

| # | 规则 | 原因 |
|---|------|------|
| H1 | §3 列出的所有上游文件全部存在才启动 | 直接引用，不走间接 |
| H2 | 功能列表必须在主文档之前完成 | 主文档引用功能列表 |
| H3 | 主文档必须在子文档之前完成 | 子文档依赖主文档的全局语境 |
| H4 | 每份子文档完成后回填主文档的双向引用 | 保持索引同步 |
| H5 | 术语必须使用 foundation-glossary 中的定义 | 全局统一 |
| H6 | Schema/API 信息只引用不重写 | 权威来源在 foundation-builder |
| H7 | 每个 Phase 产出后等用户确认再继续 | 防止错误传播 |

## 3) 上游输入（全部直接引用）

| # | 文件 | 来源 | 用途 |
|---|------|------|------|
| 1 | `BRD-<slug>-*.md` | brd-writer | 产品背景、用户画像、业务模型 |
| 2 | `page-delivery-<slug>.md` | page-designer | 页面路由表、文件路径清单 |
| 3 | 页面代码文件（Vue 3 组件） | page-designer | 从 delivery 中列出的路径逐个读取 |
| 4 | `explainer-flow-<slug>.md` | page-explainer | 用户流程全貌 |
| 5 | `explainer-c-interaction-<slug>.md` / `explainer-b-interaction-<slug>.md` | page-explainer | 结构化交互语义（仅消费 locked 条目） |
| 6 | `explainer-b-permission-<slug>.md` | page-explainer | 权限模型 |
| 7 | `explainer-delivery-<slug>.md` | page-explainer | 入口索引：产物清单、流程 → 产物映射、本环节一致性自查结论 |
| 8 | `foundation-glossary-<slug>.md` | foundation-builder | 术语表 |
| 9 | `foundation-schema-<slug>.md` | foundation-builder | 数据库 Schema（可能为拆分模式索引，见下方注） |
| 10 | `foundation-api-<slug>.md` | foundation-builder | API 接口设计（可能为拆分模式索引，见下方注） |
| 11 | `foundation-delivery-<slug>.md` | foundation-builder | 交付清单、一致性自查结果 |

缺任何一个就**中止**，提示用户先完成对应上游 skill。

目录读取口径：
- `BRD-<slug>-*.md` 优先从 `docs/brd/` 读取；仅旧项目尚未迁移时，才回退读取根目录同名文件。
- `page-delivery-<slug>.md` 与 explainer 产物优先从 `page-preview/` 读取；仅旧项目尚未迁移时，才回退读取 `可操作页面/` 或根目录同名文件。
- 实际页面代码文件位于 `<host>/<工程名>/`（项目根级），具体路径从 `page-delivery-<slug>.md` 中的文件路径列读取；仅旧项目尚未迁移时，才回退读取 `page-preview/<工程名>/` 或 `可操作页面/`。
- `foundation-*.md`、`prd-*.md` 优先从 `docs/prd/` 读取；仅旧项目尚未迁移时，才回退读取根目录同名文件。

**拆分消费协议**（适用于 foundation-schema、foundation-api）：

1. 拿到主文件路径后，stat 同名子目录（去 `.md`）是否存在
2. 子目录存在 → 主文件是索引，**必须**从 `foundation-delivery-<slug>.md` 的"拆分子文件"列读取子文件清单，逐个读入作为权威来源；主文件仅用于获得索引结构
3. 子目录不存在 → 主文件即权威来源
4. 拆分消费的上游契约见 PIPELINE.md §"产物拆分约定"

## 4) 产物

| 产物 | 文件名 | 产出顺序 |
|------|--------|---------|
| 功能列表 | `prd-feature-list-<slug>.md` | Phase 2 |
| 主文档 | `prd-main-<slug>.md` | Phase 3 |
| 子文档(N份) | `prd-<slug>-<区块名>.md` | Phase 4 |

## 5) 工作流概览（5 Phase）

```
Phase 1: 输入收集（见 §7）
  → 校验 10 个上游文件 → 读取页面代码 + foundation 产物 → 判定 C+B/纯B
  ↓
Phase 2: 功能列表
  → 加载 templates/feature-list.md
  → 产出功能列表 → 用户确认
  ↓
Phase 3: 主文档
  → 加载 templates/main-prd.md
  → 产出主文档 → 用户确认
  ↓
Phase 4: 子文档
  → 加载 templates/sub-prd.md + references/anti-patterns.md
  → 按功能列表中的区块逐份产出 → 每份用户确认
  → 每份完成后回填主文档的双向引用
  ↓
Phase 5: 一致性自查
  → 加载 references/phase-5-consistency-check.md
  → 子 PRD ↔ foundation 产物交叉校验 → 修正 → 用户确认
```

## 6) Reference 加载协议

执行到对应阶段时加载，**不要预先读取所有文件**。

| 触发条件 | 加载文件 |
|---------|---------|
| 进入 Phase 2 | `templates/feature-list.md` |
| 进入 Phase 3 | `templates/main-prd.md` |
| 进入 Phase 4 | `templates/sub-prd.md` + `references/anti-patterns.md` |
| 进入 Phase 5 | `references/phase-5-consistency-check.md` |

## 7) Phase 1: 输入收集（内联）

1. 优先在 `docs/brd/` 搜索 `BRD-<slug>-*.md`；仅旧项目尚未迁移时，才回退搜索根目录同名文件；仍不存在则**中止**
2. 优先在 `page-preview/` 搜索 `page-delivery-<slug>.md`；仅旧项目尚未迁移时，才回退搜索 `可操作页面/` 或根目录同名文件；仍不存在则**中止**
3. 优先在 `page-preview/` 搜索 `explainer-flow-<slug>.md`；仅旧项目尚未迁移时，才回退搜索 `可操作页面/` 或根目录同名文件；仍不存在则**中止**，提示用户先完成 page-explainer
4. 优先在 `page-preview/` 搜索 `explainer-b-permission-<slug>.md`；仅旧项目尚未迁移时，才回退搜索 `可操作页面/` 或根目录同名文件；仍不存在则**中止**，提示用户先完成 page-explainer
5. 优先在 `page-preview/` 搜索交互描述文件（`explainer-c-interaction-<slug>.md` / `explainer-b-interaction-<slug>.md`）；仅旧项目尚未迁移时，才回退搜索 `可操作页面/` 或根目录同名文件；仍不存在则**中止**
6. 优先在 `page-preview/` 搜索 `explainer-delivery-<slug>.md`；仅旧项目尚未迁移时，才回退搜索 `可操作页面/` 或根目录同名文件；仍不存在则**中止**，提示用户先完成 page-explainer 的最终 Phase
7. 优先在 `docs/prd/` 搜索 `foundation-delivery-<slug>.md`；仅旧项目尚未迁移时，才回退搜索根目录同名文件；仍不存在则**中止**
8. 从 foundation-delivery 中获取 glossary/schema/api 主文件路径，逐个校验存在
9. 对 schema / api 主文件：stat 同名子目录是否存在
   - 存在（拆分模式）→ 从 foundation-delivery 的"拆分子文件"列读清单，逐个校验每个子文件存在；任一缺失则**中止**，提示用户补齐 delivery 或重跑 foundation-builder
   - 不存在（单文件模式）→ 跳过子文件校验
10. 从 page-delivery 中提取页面文件路径列表，逐个读取 Vue 3 页面代码
11. 从 BRD 读取：产品背景、用户画像、是否含 C 端
12. 判定 C+B / 纯 B 路径

## 8) 状态标记（强制）

每轮回复第一行必须包含状态标记：

```
【Skill状态】prd-writer | phase=<N> | RUNNING
```

Phase 完成时：

```
【Skill状态】prd-writer | phase=<N> | PHASE_DONE
```

全部完成：

```
【Skill状态】prd-writer | DONE
```

## 9) 禁止事项

1. 没有上游文件就开始撰写
2. 跳过功能列表直接写主文档或子文档
3. 自行定义术语/Schema/API 而非引用 foundation 产物
4. 在子 PRD 中描述不属于本区块的字段/接口/管理页
5. 子 PRD 中使用 foundation-glossary 之外的术语
6. 跳过一致性自查直接声称完成
7. 不回填主文档双向引用就进入下一份子文档

## 10) 质量红线

1. 功能列表中每个区块都必须有对应子 PRD
2. 子 PRD 数据链路表中每个"来源表.列"必须在 foundation-schema 中存在
3. 子 PRD 引用的每个接口必须在 foundation-api 中存在
4. 主文档子 PRD 索引表必须与实际产出的子文档一致
5. 子 PRD 中每个功能子区域 §X 都必须有 X.6 验收小节；验收表按该子区域实际涉及的维度选写（业务规则 / UX 交互 / 管理台闭环 / 异常兜底 四类中取适用项），不强制四类齐全
6. 子 PRD 边界严格——字段/接口/管理页不越界（详见 anti-patterns.md）
