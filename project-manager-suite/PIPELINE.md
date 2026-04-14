# 产品设计流水线（project-profile → PRD）

本文件描述从项目画像到 PRD 的完整设计流水线，包含 6 个执行 Skill + 2 个调度 Skill 的职责、依赖、产物，以及**产物在宿主项目中的物理存放位置**。所有下游 skill 都依据此文件中的路径约定去读取上游产物。

相关协议：
- 主入口阶段路由、骨架补齐与阶段触发目录：[`skills/ai-project-manager/references/core/routing.md`](skills/ai-project-manager/references/core/routing.md)
- 主入口执行顺序与阶段判断：[`skills/ai-project-manager/references/core/runtime.md`](skills/ai-project-manager/references/core/runtime.md)

## 流水线总览

```
S0 阶段                S1 阶段                               S2 阶段
──────────────      ────────         ──────────────────────────────────────────────────────────────
                                       page-chief 调度                       prd-chief 调度
                                  ┌─────────────────────┐             ┌──────────────────────┐
ai-project-manager → brd-writer → page-designer → page-explainer → foundation-builder → prd-writer
        │                │            │                │                    │                 │
        ▼                ▼            ▼                ▼                    ▼                 ▼
  project-profile      BRD       页面代码         流程/交互语义/权限      术语表/Schema/API   功能列表/主PRD/子PRD
                       台账      交付清单         差异（可选）            交付清单
```

### 调度层说明

| 调度 Skill | 管辖范围 | 职责 | 自身产物 |
|-----------|---------|------|---------|
| `page-chief` | page-designer → page-explainer | 观察产物文件状态，判断下一步子 skill；有 gap 时判定回环（上限 3 轮） | 无（纯调度，不产出文件） |
| `prd-chief` | foundation-builder → prd-writer | 校验上游产物链完整性，线性推进 foundation → PRD | 无（纯调度，不产出文件） |

调度层不向子 skill 传递指令，子 skill 不感知调度层存在。调度层只通过观察产物文件是否存在、内容是否合格来判断子 skill 是否完成。

---

## 宿主项目目录约定

所有产物文件都写入**宿主项目**（被服务的目标项目，记作 `<host>/`）。下游 skill 通过以下固定路径去上游产物所在目录查找：

```
<host>/                                       # 宿主项目根目录
├── project-profile.md                        # ai-project-manager 产出；全局画像与状态入口
├── docs/
│   ├── brd/                                  # 业务需求层
│   │   ├── brd-ledger-<slug>.md              # brd-writer 过程台账
│   │   └── BRD-<slug>-<YYYYMMDD-HHMM>.md     # brd-writer 最终交付 BRD
│   └── prd/                                  # 技术地基 + PRD 层
│       ├── foundation-glossary-<slug>.md     # foundation-builder 术语表
│       ├── foundation-schema-<slug>.md       # foundation-builder 数据库 Schema（单文件或索引）
│       ├── foundation-schema-<slug>/         # 可选：Schema 超 400 行时拆分，内含 <table>.md
│       ├── foundation-api-<slug>.md          # foundation-builder API 接口（单文件或索引）
│       ├── foundation-api-<slug>/            # 可选：API 超 400 行时拆分，内含 <module>.md
│       ├── foundation-delivery-<slug>.md     # foundation-builder 交付清单
│       ├── prd-feature-list-<slug>.md        # prd-writer 功能列表
│       ├── prd-main-<slug>.md                # prd-writer 主 PRD（索引枢纽）
│       └── prd-<slug>-<区块名>.md            # prd-writer 子 PRD（N 份，按区块拆分）
├── page-preview/                             # 前端页面与页面语义描述层
│   ├── <Vue 3 前端工程>/                     # page-designer 产出的可运行代码（src/、package.json 等）
│   ├── page-delivery-<slug>.md               # page-designer 交付清单（页面索引入口）
│   ├── page-spec-entities-<slug>.md          # page-designer C 端实体中间文件（仅 C+B 项目）
│   ├── explainer-flow-<slug>.md              # page-explainer 用户流程图
│   ├── explainer-c-interaction-<slug>.md     # page-explainer C 端交互语义（仅 C+B）
│   ├── explainer-b-interaction-<slug>.md     # page-explainer B 端交互语义
│   ├── explainer-b-permission-<slug>.md      # page-explainer B 端权限矩阵
│   ├── explainer-c-gap-<slug>.md             # page-explainer C 端差异（可选，有差异时产出）
│   ├── explainer-b-gap-<slug>.md             # page-explainer B 端差异（可选，有差异时产出）
│   └── explainer-delivery-<slug>.md          # page-explainer 交付清单（入口索引 + 一致性自查）
```

### 目录语义

| 目录 | 归属 | 语义 | 谁写 | 谁读 |
|------|------|------|------|------|
| `<host>/`（根） | 全局 | 项目身份与全局画像 | ai-project-manager | 所有下游 skill |
| `<host>/docs/brd/` | 业务层 | 业务需求最终态与过程台账 | brd-writer | page-designer、page-explainer、foundation-builder、prd-writer |
| `<host>/page-preview/` | 页面层 | 可运行的前端页面 + 页面交互/权限语义 | page-designer、page-explainer | foundation-builder、prd-writer |
| `<host>/docs/prd/` | 规格层 | 技术地基 + AI 可直接编码的 PRD 规格 | foundation-builder、prd-writer | 下游研发/编码环节 |

### Skill → 文件夹 权威映射（单一来源）

**所有 skill 产出文件落地位置以此表为准。**后续新增、重命名、拆分产物时，只要产出该 skill 的文件，一律落入下表声明的目标文件夹；各 skill SKILL.md 和下方 §1-§5 per-skill 产物表的"存放位置"列都是此表的派生信息，不是独立契约。

| Skill | 产出目标文件夹 | 覆盖产物（模式） |
|-------|--------------|----------------|
| ai-project-manager | `<host>/` | `project-profile.md` 及其他全局画像/长期记忆类文件 |
| brd-writer | `<host>/docs/brd/` | `BRD-<slug>-*.md`、`brd-ledger-<slug>.md` 及后续该 skill 新增的业务层文件 |
| page-designer | `<host>/page-preview/` | Vue 3 前端工程目录、`page-delivery-<slug>.md`、`page-spec-entities-<slug>.md` 及后续该 skill 新增的页面层文件 |
| page-explainer | `<host>/page-preview/` | `explainer-*-<slug>.md` 全族（flow / interaction / permission / gap / delivery）及后续新增 |
| foundation-builder | `<host>/docs/prd/` | `foundation-*-<slug>.md` 全族（glossary / schema / api / delivery）及后续新增 |
| prd-writer | `<host>/docs/prd/` | `prd-feature-list-<slug>.md`、`prd-main-<slug>.md`、`prd-<slug>-<区块名>.md` 及后续新增 |

**不变式（写 skill 时的硬约束）：**

1. 一个 skill 的**所有**产出文件必须落在上表声明的同一个文件夹，不允许跨目录分布（如 page-explainer 不允许一部分写 `page-preview/` 另一部分写 `prd/`）。
2. 新增 skill 前必须在本表登记目标文件夹；若现有三类目录不能覆盖，需先与 PIPELINE.md 维护者讨论扩表，再实施 skill。
3. 重命名/拆分产物时，只改文件名，不改落地文件夹（落地文件夹由 skill 决定，与文件名无关）。
4. 下游 skill 在依赖表中看到某上游文件名，对应查找目录 = 上表中该上游 skill 的"产出目标文件夹"；不需要每个依赖表项单独标注目录。
5. 允许 skill 在其目标文件夹下建**同名子目录**存放拆分子文件（见下文"产物拆分约定"），子目录仍视作同一 skill 的归属，不破坏单一映射。

### 产物拆分约定

部分产物（当前已声明：foundation-schema、foundation-api；未来可扩展）支持行数超阈值时自动拆分。拆分规则统一遵循：

**命名规则：**

| 元素 | 命名 | 示例 |
|------|------|------|
| 主文件（索引） | `<产物名>-<slug>.md` | `foundation-schema-xxx.md` |
| 子目录 | 与主文件同名去 `.md` | `foundation-schema-xxx/` |
| 子文件 | `<子目录>/<条目名>.md` | `foundation-schema-xxx/users.md` |

**主文件职责（拆分模式下）：**
- 不含字段级细节，只含总览表 + 每个子文件一行摘要 + 指向子文件的相对链接
- 子文件引用格式示例：`[users.md](foundation-schema-xxx/users.md)`

**下游消费协议（硬契约）：**

1. 下游 skill 拿到主文件路径时，**必须**检查同级是否存在同名子目录：
   - 存在 → 视为拆分模式；主文件仅为索引，**必须**读入子目录下所有 `*.md` 作为权威来源
   - 不存在 → 视为单文件模式，主文件即权威来源
2. 上游 skill 的 delivery 清单必须在主文件一行下方枚举所有子文件真实路径（若拆分），不允许下游自行 glob 兜底
3. 新增支持拆分的产物时，必须：
   - 更新本节"命名规则"表（登记产物名）
   - 在对应上游 skill 的 delivery 模板里加"拆分子文件清单"列
   - 在下游 skill 的依赖表加注拆分检测协议

### slug 约定

`<slug>` 由 brd-writer 在 Phase A 确定（英文短语、全小写、连字符分隔），写入 `brd-ledger-<slug>.md` 头部。**流水线中所有下游 skill 的产物文件必须使用同一个 slug**，确保跨目录产物可通过文件名关联。

---

## 0. ai-project-manager — 项目画像与调度入口

**职责**：S0 阶段负责宿主项目初始化、全局画像收集、流水线总调度。不自己执行 BRD/PRD 业务，通过向用户访谈收敛画像后，按路由规则移交给下游执行 skill。

**依赖文件**：

| 文件 | 来源 | 位置 |
|------|------|------|
| （首轮访谈输入） | 用户对话 | — |
| 既有宿主项目文件（如有） | 宿主项目 | `<host>/` 已有文件 |

**产出文件**：

| 产物 | 文件名 | 存放位置 | 说明 |
|------|--------|---------|------|
| 项目画像 | `project-profile.md` | `<host>/project-profile.md` | 项目快照 + 当前阶段 + 主计划入口；长期记忆载体 |

---

## 1. brd-writer — 业务需求文档

**职责**：通过结构化访谈收敛需求，输出可执行的 BRD（Business Requirements Document）。Phase A 固化 `project_slug`，后续所有下游 skill 共用此 slug 命名产物。

**依赖文件**：

| 文件 | 来源 | 位置 |
|------|------|------|
| `project-profile.md` | ai-project-manager | `<host>/project-profile.md` |

**产出文件**：

| 产物 | 文件名 | 存放位置 | 说明 |
|------|--------|---------|------|
| BRD 决策台账 | `brd-ledger-<slug>.md` | `<host>/docs/brd/` | 过程产物：P0 字段确认状态、冲突记录、轮次变更日志、充分性快照 |
| BRD 文件 | `BRD-<slug>-<YYYYMMDD-HHMM>.md` | `<host>/docs/brd/` | 最终交付物 |

---

## 2. page-designer — 页面设计

**职责**：基于 BRD 产出可交互的前端页面（技术栈从 tech-stack.md 读取，内置设计知识库）。C+B 项目先出 C 端再反推控制台，纯 B 项目直接出 B 端。

**依赖文件**：

| 文件 | 来源 | 位置 |
|------|------|------|
| `BRD-<slug>-*.md` | brd-writer | `<host>/docs/brd/` |

**产出文件**：

| 产物 | 文件名 | 存放位置 | 说明 |
|------|--------|---------|------|
| C 端页面代码 | Vue 3 工程 | `<host>/page-preview/<工程名>/` | 可交互，mock 数据（仅 C+B） |
| B 端控制台页面代码 | Vue 3 工程 | `<host>/page-preview/<工程名>/` | 可交互，mock 数据 |
| 实体中间文件 | `page-spec-entities-<slug>.md` | `<host>/page-preview/` | C 端实体规格（仅 C+B） |
| 交付清单 | `page-delivery-<slug>.md` | `<host>/page-preview/` | 页面路由表、文件路径、下游索引 |

---

## 3. page-explainer — 页面交互解释

**职责**：以用户流程为骨架、逐页交互为血肉，产出结构化行为语义规格（含冻结门禁），主动识别交互盲区。B 端额外输出页面级权限矩阵。发现差异时按分类产出修改建议供 page-designer 回环。

**依赖文件**：

| 文件 | 来源 | 位置 |
|------|------|------|
| `BRD-<slug>-*.md` | brd-writer | `<host>/docs/brd/` |
| `page-delivery-<slug>.md` | page-designer | `<host>/page-preview/` |
| 页面代码文件（Vue 3 组件） | page-designer | `<host>/page-preview/<工程名>/` |

**产出文件**：

| 产物 | 文件名 | 存放位置 | 说明 |
|------|--------|---------|------|
| 用户流程图 | `explainer-flow-<slug>.md` | `<host>/page-preview/` | 按用户任务组织的流程描述（只含流程语义，不含索引） |
| C 端交互描述 | `explainer-c-interaction-<slug>.md` | `<host>/page-preview/` | 结构化语义条目，含 locked/open 状态（仅 C+B） |
| B 端交互描述 | `explainer-b-interaction-<slug>.md` | `<host>/page-preview/` | 结构化语义条目，含 locked/open 状态 |
| B 端权限矩阵 | `explainer-b-permission-<slug>.md` | `<host>/page-preview/` | 角色 × 页面/菜单可见性 |
| C 端差异 | `explainer-c-gap-<slug>.md` | `<host>/page-preview/` | 分类差异条目（仅 C+B，有差异时） |
| B 端差异 | `explainer-b-gap-<slug>.md` | `<host>/page-preview/` | 分类差异条目（有差异时） |
| 交付清单 | `explainer-delivery-<slug>.md` | `<host>/page-preview/` | 产物索引 + 冻结统计 + 差异摘要 + 流程映射 + 一致性自查；本环节收官与下游入口 |

**下游消费规则**：只有 `status: locked` 的语义条目，foundation-builder 和 prd-writer 才能当权威依据。

---

## 4. foundation-builder — 技术地基设计

**职责**：消费已确认的前端页面代码，反推并设计术语表、数据库 Schema 和 API 接口。不写代码，不生成 DDL。

**依赖文件**：

| 文件 | 来源 | 位置 |
|------|------|------|
| `BRD-<slug>-*.md` | brd-writer | `<host>/docs/brd/` |
| `page-delivery-<slug>.md` | page-designer | `<host>/page-preview/` |
| 页面代码文件（Vue 3 组件） | page-designer | `<host>/page-preview/<工程名>/` |
| `explainer-flow-<slug>.md` | page-explainer | `<host>/page-preview/` |
| `explainer-c-interaction-<slug>.md` / `explainer-b-interaction-<slug>.md` | page-explainer | `<host>/page-preview/` |
| `explainer-b-permission-<slug>.md` | page-explainer | `<host>/page-preview/` |
| `explainer-delivery-<slug>.md` | page-explainer | `<host>/page-preview/` |
| 已有数据库/接口文件（可选） | 用户提供 | 用户指定路径 |

**产出文件**：

| 产物 | 文件名 | 存放位置 | 说明 |
|------|--------|---------|------|
| 术语表 | `foundation-glossary-<slug>.md` | `<host>/docs/prd/` | 按业务域分组的统一术语定义 |
| 数据库 Schema | `foundation-schema-<slug>.md` | `<host>/docs/prd/` | 表结构设计，超 400 行自动拆分 |
| API 接口设计 | `foundation-api-<slug>.md` | `<host>/docs/prd/` | 接口定义，超 400 行自动拆分 |
| 交付清单 | `foundation-delivery-<slug>.md` | `<host>/docs/prd/` | 产物索引 + 一致性自查结果 |

---

## 5. prd-writer — PRD 撰写

**职责**：基于页面代码和技术地基，产出面向 AI 编程的 PRD 规格文件。PRD 不是给人看的，是 AI 拿到后能直接编码的基准规格。

**依赖文件**：

| 文件 | 来源 | 位置 |
|------|------|------|
| `BRD-<slug>-*.md` | brd-writer | `<host>/docs/brd/` |
| `page-delivery-<slug>.md` | page-designer | `<host>/page-preview/` |
| 页面代码文件（Vue 3 组件） | page-designer | `<host>/page-preview/<工程名>/` |
| `explainer-flow-<slug>.md` | page-explainer | `<host>/page-preview/` |
| `explainer-c-interaction-<slug>.md` / `explainer-b-interaction-<slug>.md` | page-explainer | `<host>/page-preview/` |
| `explainer-b-permission-<slug>.md` | page-explainer | `<host>/page-preview/` |
| `explainer-delivery-<slug>.md` | page-explainer | `<host>/page-preview/` |
| `foundation-glossary-<slug>.md` | foundation-builder | `<host>/docs/prd/` |
| `foundation-schema-<slug>.md` | foundation-builder | `<host>/docs/prd/` |
| `foundation-api-<slug>.md` | foundation-builder | `<host>/docs/prd/` |
| `foundation-delivery-<slug>.md` | foundation-builder | `<host>/docs/prd/` |

**产出文件**：

| 产物 | 文件名 | 存放位置 | 说明 |
|------|--------|---------|------|
| 功能列表 | `prd-feature-list-<slug>.md` | `<host>/docs/prd/` | 产品背景 + 页面全景 + 区块业务逻辑 |
| 主文档 | `prd-main-<slug>.md` | `<host>/docs/prd/` | 全局索引枢纽，引用所有上游产物 |
| 子文档（N 份） | `prd-<slug>-<区块名>.md` | `<host>/docs/prd/` | 按区块拆分，字段级可追溯 |

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
| explainer-delivery | | | 👁 | | 产出 | 👁 | ✓ | ✓ |
| foundation-glossary | | | | | | 👁 | 产出 | ✓ |
| foundation-schema | | | | | | 👁 | 产出 | ✓ |
| foundation-api | | | | | | 👁 | 产出 | ✓ |
| foundation-delivery | | | | | | 👁 | 产出 | ✓ |
| prd-feature-list | | | | | | 👁 | | 产出 |
| prd-main | | | | | | 👁 | | 产出 |
| prd-子文档 | | | | | | 👁 | | 产出 |

---

## 路径约定变更须知

截至 2026-04-14，三大目录结构统一为 `docs/brd/` / `page-preview/` / `docs/prd/`。其中页面层目录已从 2026-04-13 版的 `可操作页面/` 改名为 `page-preview/`。历史宿主项目若文件仍停留在旧目录或根目录：

- 调度层（page-chief / prd-chief）扫描产物时，应**优先检查新目录**，再兼容旧 `可操作页面/`，最后兜底扫根目录。
- 子 skill 写入新产物时，**一律按本文件约定的目录**写入，不再回写根目录。
- 迁移既有文件时，按 slug 归属关系移动到对应目录即可，内容无需改动；若原先位于 `可操作页面/`，应整体迁移到 `page-preview/`。
