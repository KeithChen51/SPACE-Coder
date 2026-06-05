# 产品设计与开发计划流水线（project-profile → PRD → 开发计划 → 代码实装）

本文件描述从项目画像到 PRD、开发执行计划到代码实装的完整流水线，同时包含既有代码接入时的基线诊断旁路。所有下游 skill 都依据此文件中的路径约定去读取上游产物。

相关协议：
- 主入口阶段路由、骨架补齐与阶段触发目录：[`skills/ai-project-manager/references/core/routing.md`](skills/ai-project-manager/references/core/routing.md)
- 主入口执行顺序与阶段判断：[`skills/ai-project-manager/references/core/runtime.md`](skills/ai-project-manager/references/core/runtime.md)

## 流水线总览

```
S0 ─────────────────────────────────────────────
   ai-project-manager
       │
       ▼  project-profile

S0.5 ───────────────────────────────────────────
   project-baseline-auditor
       │
       ▼  project-profile + baseline-audit

S1 ─────────────────────────────────────────────
   brd-writer
       │
       ▼  BRD + 决策台账

S2 ──────── page-chief 调度 ────────────────────
   page-designer
       │
       ▼  Vue 3 页面工程 + 页面交付清单
   page-explainer
       │
       ▼  流程图 / 交互语义 / 差异(可选) / 交付清单

S2 ──────── prd-chief 调度 ─────────────────────
   foundation-builder
       │
       ▼  术语表 / Schema / API + 交付清单
   prd-writer
       │
       ▼  功能列表 / mainprd / subprd

S3 ─────────────────────────────────────────────
   delivery-planner
       │
       ▼  开发执行计划

S4 ─────────────────────────────────────────────
   coding-standards
       │
       ▼  实装代码文件 + Task 状态回写

S5 ──────── test-case-chief 调度 ────────────────
   prd-acceptance-reviewer
       │
       ▼  验收文档（主索引 + 区块子文件） + PRD 验收回链
   test-case-writer
       │
       ▼  TC 主索引 + 域 TC 文件 + SQL 数据准备
   test-case-reviewer
       │
       ▼  待裁定 TC 问题清单 + TC 修正
```

### 调度层说明

| 调度 Skill | 管辖范围 | 职责 | 自身产物 |
|-----------|---------|------|---------|
| `page-chief` | page-designer → page-explainer | 观察产物文件状态，判断下一步子 skill；有 gap 时判定回环（上限 3 轮） | 无（纯调度，不产出文件） |
| `prd-chief` | foundation-builder → prd-writer | 校验上游产物链完整性，线性推进 foundation → PRD | 无（纯调度，不产出文件） |
| `test-case-chief` | prd-acceptance-reviewer → test-case-writer → test-case-reviewer | 观察三子 skill 产物状态，线性推进；reviewer 发现 TC 错误时回 writer 重做（上限 3 轮） | 无（纯调度，不产出文件） |

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
│   ├── baseline/                             # 既有项目基线诊断层
│   │   ├── baseline-audit-<slug>.json        # project-baseline-auditor 给主路由读取的结构化清单
│   │   └── baseline-audit-<slug>.md          # project-baseline-auditor 给人 review 的诊断清单
│   ├── index/                                # 文件级引用索引层
│   │   ├── project-link-graph.json           # project-link-indexer 编译出的机器关系图
│   │   ├── project-link-graph.md             # project-link-indexer 编译出的人读 wiki 索引
│   │   └── project-wiki-schema.json          # project-link-indexer 的节点/边/诊断 schema
│   ├── prd/                                  # 技术地基 + PRD 层
│   │   ├── foundation/                       # foundation-builder 产物
│   │   │   ├── foundation-glossary-<slug>.md # 术语表
│   │   │   ├── foundation-schema-<slug>.md   # 数据库 Schema（单文件或索引）
│   │   │   ├── foundation-schema-<slug>/     # 可选：Schema 超 400 行时拆分，内含 <table>.md
│   │   │   ├── foundation-api-<slug>.md      # API 接口（单文件或索引）
│   │   │   ├── foundation-api-<slug>/        # 可选：API 超 400 行时拆分，内含 <module>.md
│   │   │   └── foundation-delivery-<slug>.md # 交付清单
│   │   ├── prd-feature-list-<slug>.md        # prd-writer 功能列表
│   │   ├── mainprd-<slug>.md                 # prd-writer mainprd（索引枢纽）
│   │   └── subprd/                           # prd-writer subprd
│   │       └── 0X-subprd-<区块英文短名>.md    # N 份，按区块拆分
│   └── plans/                                # 开发执行计划层
│       └── delivery-plans/                   # delivery-planner 产出的正式开发计划文件组
│           ├── main-delivery-plan-<slug>.md  # 主开发计划入口
│           ├── task-kanban-<slug>.md         # 独立任务看板
│           └── sub-delivery-plan-<slug>-T0.1-<short-name>.md # 子开发计划，每个 Task 一份
├── src/
│   ├── ...                                   # 代码实装层（S4），coding-standards 按 Task 核心文件字段产出的实装代码
│   └── frontend/
│       └── page-preview/                     # 页面元数据与页面语义描述层
│           ├── page-ledger-<slug>.json       # page-designer 台账（phase、回环轮次）
│           ├── page-delivery-<slug>.md       # page-designer 交付清单（页面索引入口）
│           ├── explainer-flow-<slug>.md      # page-explainer 用户流程图
│           ├── explainer-b-interaction-<slug>.md     # page-explainer 交互语义
│           ├── explainer-b-gap-<slug>.md     # page-explainer 差异（可选，有差异时产出）
│           └── explainer-delivery-<slug>.md  # page-explainer 交付清单（入口索引 + 一致性自查）
├── <Vue 3 前端工程>/                             # page-designer 产出的可运行代码（src/、package.json 等）
└── docs/test-case/                            # 测试用例层（S5 产物）
    ├── acceptance-<slug>.md                  # prd-acceptance-reviewer 验收文档主索引
    ├── acceptance-<slug>/                    # 按 PRD 区块拆的子验收文档
    │   └── <区块名>.md                        # 每个区块一份，对应一个 subprd
    ├── tc-main-<slug>.md                     # test-case-writer 测试用例主索引
    ├── <业务域>/                              # test-case-writer 按业务域组织的 TC 文件夹
    │   ├── tc-<业务域>.md                     # 域内测试用例文件
    │   └── sql/                              # 本域测试数据 SQL
    │       └── <编号>-<场景>.sql
    └── tc-reviews/                           # test-case-reviewer 待裁定 TC 问题清单
        └── <日期>-issues.md
```

### 目录语义

| 目录 | 归属 | 语义 | 谁写 | 谁读 |
|------|------|------|------|------|
| `<host>/`（根） | 全局 | 项目身份与全局画像 | ai-project-manager | 所有下游 skill |
| `<host>/docs/baseline/` | 既有项目接入层 | 关键维护文件缺口清单，只覆盖画像 / BRD / 页面说明 / foundation / PRD | project-baseline-auditor | ai-project-manager |
| `<host>/docs/index/` | 文件级引用索引层 | 可重建的文件关系图、坏链诊断和 LLM wiki 导航入口 | project-link-indexer | ai-project-manager、所有下游 skill |
| `<host>/docs/brd/` | 业务层 | 业务需求最终态与过程台账 | brd-writer | page-designer、page-explainer、foundation-builder、prd-writer、delivery-planner |
| `<host>/<工程名>/` | 代码层 | page-designer 产出的可运行前端工程 | page-designer | page-explainer、foundation-builder、prd-writer |
| `<host>/src/frontend/page-preview/` | 页面元数据层 | 页面台账、交付清单、交互语义 | page-designer、page-explainer | foundation-builder、prd-writer |
| `<host>/docs/prd/` | 规格层 | 技术地基 + AI 可直接编码的 PRD 规格 | foundation-builder、prd-writer | delivery-planner、coding-standards |
| `<host>/docs/plans/` | 计划层 | 面向 AI 执行的开发执行计划 | delivery-planner | coding-standards |
| `<host>/src/`（或项目约定代码根目录） | 实装层（S4） | 按 delivery-plan Phase/Task 产出的实际代码文件 | coding-standards | test-and-acceptance |
| `<host>/docs/test-case/` | 测试用例层（S5） | 验收文档 + 测试用例 + TC 核查报告 | prd-acceptance-reviewer、test-case-writer、test-case-reviewer | test-case-runner |

### Skill → 文件夹 权威映射（单一来源）

**所有 skill 产出文件落地位置以此表为准。**后续新增、重命名、拆分产物时，只要产出该 skill 的文件，一律落入下表声明的目标文件夹；各 skill SKILL.md 和下方 §1-§7 per-skill 产物表的"存放位置"列都是此表的派生信息，不是独立契约。

| Skill | 产出目标文件夹 | 覆盖产物（模式） |
|-------|--------------|----------------|
| ai-project-manager | `<host>/` | `project-profile.md` 及其他全局画像/长期记忆类文件 |
| project-baseline-auditor | `<host>/` + `<host>/docs/baseline/` | 受控生成或更新 `project-profile.md`；`baseline-audit-<slug>.json`、`baseline-audit-<slug>.md` 写入 `docs/baseline/` |
| project-link-indexer | `<host>/docs/index/` | `project-link-graph.json`、`project-link-graph.md`、`project-wiki-schema.json`；均为可重建索引，不替代原始业务文件 |
| brd-writer | `<host>/docs/brd/` | `BRD-<slug>-*.md`、`brd-ledger-<slug>.md` 及后续该 skill 新增的业务层文件 |
| page-designer | `<host>/<工程名>/`（代码）+ `<host>/src/frontend/page-preview/`（元数据） | Vue 3 前端工程目录写入 `<host>/<工程名>/`；`page-ledger-<slug>.json`、`page-delivery-<slug>.md` 等元数据文件写入 `<host>/src/frontend/page-preview/` |
| page-explainer | `<host>/src/frontend/page-preview/` | `explainer-*-<slug>.md` 全族（flow / interaction / gap / delivery）及后续新增 |
| foundation-builder | `<host>/docs/prd/foundation/` | `foundation-*-<slug>.md` 全族（glossary / schema / api / delivery）及后续新增 |
| prd-writer | `<host>/docs/prd/` + `<host>/docs/prd/subprd/` | `prd-feature-list-<slug>.md`、`mainprd-<slug>.md`、`subprd/0X-subprd-<区块英文短名>.md` 及后续新增 |
| delivery-planner | `<host>/docs/plans/delivery-plans/` | `main-delivery-plan-<slug>.md`、`task-kanban-<slug>.md`、`sub-delivery-plan-<slug>-<TaskID>-<short-name>.md` |
| coding-standards | `<host>/src/`（或项目约定代码根目录） | 按 Task `核心文件` 字段产出的实装代码文件；同时回写对应子开发计划和任务看板状态 |
| prd-acceptance-reviewer | `<host>/docs/test-case/` | `acceptance-<slug>.md` 主索引 + `acceptance-<slug>/<区块名>.md` 子文件；另可对 `<host>/docs/prd/subprd/` 下 subprd 的 §X.6 验收小节做条目修订与回链追加（原地回写），不做 baseline / changelog / baseline.md 维护 |
| test-case-writer | `<host>/docs/test-case/` | `tc-main-<slug>.md`、`<业务域>/tc-<业务域>.md`、`<业务域>/sql/*.sql` |
| test-case-reviewer | `<host>/docs/test-case/` | `tc-reviews/<日期>-issues.md`；对已产出 TC 文件做原地修正 |

**不变式（写 skill 时的硬约束）：**

1. 一个 skill 的**所有**产出文件必须落在上表声明的目标文件夹，不允许跨目录分布（如 page-explainer 不允许一部分写 `src/frontend/page-preview/` 另一部分写 `prd/`）。例外：page-designer 的可运行代码写入 `<host>/<工程名>/`、元数据文件写入 `<host>/src/frontend/page-preview/`；project-baseline-auditor 需要与主入口共用 `<host>/project-profile.md`，同时把诊断清单写入 `<host>/docs/baseline/`。
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

## 0.5. project-baseline-auditor — 既有项目基线诊断

**职责**：S0.5 阶段用于已有代码接入套件时的维护性诊断。它基于真实代码生成或更新同一个 `project-profile.md`，并产出关键文件缺口清单，供主入口继续路由到 BRD / 页面说明 / foundation / PRD 相关 skill。

**边界**：
- 只诊断维护知识底座，不诊断测试用例
- 不判断待开发任务，不进入 `delivery-planner`
- 不直接生成正式 BRD / 页面说明 / foundation / PRD 正文

**依赖文件**：

| 文件 | 来源 | 位置 |
|------|------|------|
| 既有宿主代码、README、配置、docs | 宿主项目 | `<host>/` |
| `project-profile.md`（如已有） | ai-project-manager 或宿主已有文件 | `<host>/project-profile.md` |

**产出文件**：

| 产物 | 文件名 | 存放位置 | 说明 |
|------|--------|---------|------|
| 项目画像 | `project-profile.md` | `<host>/project-profile.md` | 与 ai-project-manager 共用文件名；保留用户确认字段，补充代码推断字段 |
| 结构化诊断清单 | `baseline-audit-<slug>.json` | `<host>/docs/baseline/` | 主路由读取的机器清单 |
| 诊断报告 | `baseline-audit-<slug>.md` | `<host>/docs/baseline/` | 人类 review 的关键文件缺口说明 |

---

## 全局伴随. project-link-indexer — 文件级引用索引

**职责**：按需扫描宿主项目已有文件，编译出可重建的文件级引用关系图，用于 LLM wiki 导航、坏链诊断、缺回链诊断和影响范围查询。它是全阶段伴随能力，不改变当前阶段，不给阶段路由建议。

**调度机制**：阶段产物完成后回到 `ai-project-manager`；主入口按场景调起 `project-link-indexer`，索引器自行决定 build / refresh / noop。主入口不判断索引新旧，索引是可重建产物，不是阶段门禁。

**主入口调起场景**：
- S0.5 baseline audit 完成后
- S1 BRD 完成后
- S2 页面 / foundation / PRD 产物形成或拆分后
- S3 开发计划文件组形成或修复后
- S5 验收文档 / 测试用例形成后
- 用户询问文件关系、坏链、回链、孤立文件或影响范围时

**边界**：
- 只产出 `docs/index/*` 下的索引文件
- 不替代 BRD / 页面说明 / foundation / PRD / 计划 / 测试用例 / 代码的权威内容
- 不要求其他 skill 直接维护同一个索引文件；各 skill 继续维护自己的交付物，索引器从交付物中重新编译关系

**依赖文件**：

| 文件 | 来源 | 位置 |
|------|------|------|
| 宿主项目 Markdown / JSON / 配置 / 代码文件 | 宿主项目与各阶段 skill | `<host>/` |
| `project-profile.md`、BRD、页面说明、foundation、PRD、计划、验收、TC 等已有产物 | 对应 skill | 对应固定目录 |

**产出文件**：

| 产物 | 文件名 | 存放位置 | 说明 |
|------|--------|---------|------|
| 文件关系图 | `project-link-graph.json` | `<host>/docs/index/` | 给工具读取的节点、边、证据和 issue 清单 |
| 人读 wiki 索引 | `project-link-graph.md` | `<host>/docs/index/` | 给人和 LLM 浏览的双链接索引 |
| wiki schema | `project-wiki-schema.json` | `<host>/docs/index/` | 节点类型、关系类型、必需回链规则 |

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

**职责**：基于 BRD 产出可交互的前端页面（技术栈从 tech-stack.md 读取，内置设计知识库）。单线 4-Phase 流程。

**依赖文件**：

| 文件 | 来源 | 位置 |
|------|------|------|
| `BRD-<slug>-*.md` | brd-writer | `<host>/docs/brd/` |

**产出文件**：

| 产物 | 文件名 | 存放位置 | 说明 |
|------|--------|---------|------|
| 页面台账 | `page-ledger-<slug>.json` | `<host>/src/frontend/page-preview/` | phase 状态、回环轮次 |
| 页面代码 | Vue 3 工程 | `<host>/<工程名>/` | 可交互，mock 数据 |
| 交付清单 | `page-delivery-<slug>.md` | `<host>/src/frontend/page-preview/` | 页面路由表、文件路径、下游索引 |

---

## 3. page-explainer — 页面交互解释

**职责**：以用户流程为骨架、逐页交互为血肉，产出结构化行为语义规格（含冻结门禁），主动识别交互盲区。发现差异时按分类产出修改建议供 page-designer 回环。

**依赖文件**：

| 文件 | 来源 | 位置 |
|------|------|------|
| `BRD-<slug>-*.md` | brd-writer | `<host>/docs/brd/` |
| `page-delivery-<slug>.md` | page-designer | `<host>/src/frontend/page-preview/` |
| 页面代码文件（Vue 3 组件） | page-designer | `<host>/<工程名>/`（路径从 page-delivery 中读取） |

**产出文件**：

| 产物 | 文件名 | 存放位置 | 说明 |
|------|--------|---------|------|
| 用户流程图 | `explainer-flow-<slug>.md` | `<host>/src/frontend/page-preview/` | 按用户任务组织的流程描述（只含流程语义，不含索引） |
| 交互描述 | `explainer-b-interaction-<slug>.md` | `<host>/src/frontend/page-preview/` | 结构化语义条目，含 locked/open 状态 |
| 差异 | `explainer-b-gap-<slug>.md` | `<host>/src/frontend/page-preview/` | 分类差异条目（有差异时） |
| 交付清单 | `explainer-delivery-<slug>.md` | `<host>/src/frontend/page-preview/` | 产物索引 + 冻结统计 + 差异摘要 + 流程映射 + 一致性自查；本环节收官与下游入口 |

**下游消费规则**：只有 `status: locked` 的语义条目，foundation-builder 和 prd-writer 才能当权威依据。

---

## 4. foundation-builder — 技术地基设计

**职责**：消费已确认的前端页面代码，反推并设计术语表、数据库 Schema 和 API 接口。不写代码，不生成 DDL。

**依赖文件**：

| 文件 | 来源 | 位置 |
|------|------|------|
| `BRD-<slug>-*.md` | brd-writer | `<host>/docs/brd/` |
| `page-delivery-<slug>.md` | page-designer | `<host>/src/frontend/page-preview/` |
| 页面代码文件（Vue 3 组件） | page-designer | `<host>/<工程名>/`（路径从 page-delivery 中读取） |
| `explainer-flow-<slug>.md` | page-explainer | `<host>/src/frontend/page-preview/` |
| `explainer-b-interaction-<slug>.md` | page-explainer | `<host>/src/frontend/page-preview/` |
| `explainer-delivery-<slug>.md` | page-explainer | `<host>/src/frontend/page-preview/` |
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
| `page-delivery-<slug>.md` | page-designer | `<host>/src/frontend/page-preview/` |
| 页面代码文件（Vue 3 组件） | page-designer | `<host>/<工程名>/`（路径从 page-delivery 中读取） |
| `explainer-flow-<slug>.md` | page-explainer | `<host>/src/frontend/page-preview/` |
| `explainer-b-interaction-<slug>.md` | page-explainer | `<host>/src/frontend/page-preview/` |
| `explainer-delivery-<slug>.md` | page-explainer | `<host>/src/frontend/page-preview/` |
| `foundation-glossary-<slug>.md` | foundation-builder | `<host>/docs/prd/foundation/` |
| `foundation-schema-<slug>.md` | foundation-builder | `<host>/docs/prd/foundation/` |
| `foundation-api-<slug>.md` | foundation-builder | `<host>/docs/prd/foundation/` |
| `foundation-delivery-<slug>.md` | foundation-builder | `<host>/docs/prd/foundation/` |

**产出文件**：

| 产物 | 文件名 | 存放位置 | 说明 |
|------|--------|---------|------|
| 功能列表 | `prd-feature-list-<slug>.md` | `<host>/docs/prd/` | 产品背景 + 页面全景 + 区块业务逻辑 |
| mainprd | `mainprd-<slug>.md` | `<host>/docs/prd/` | 全局索引枢纽，引用所有上游产物 |
| subprd（N 份） | `0X-subprd-<区块英文短名>.md` | `<host>/docs/prd/subprd/` | 按区块拆分，字段级可追溯 |

---

## 6. delivery-planner — 开发执行计划

**职责**：基于上游 PRD 规格和技术地基产物，产出面向 AI 执行、人类 review 的开发计划文档（Phase/Task 拆解、完成标准、完成判定）。不直接执行代码开发。前置运行 `collect-upstream-context.mjs` 脚本程序化发现上游产物，产出后运行 `validate-plan-structure.mjs` 脚本做结构化校验。

**依赖文件**：

| 文件 | 来源 | 位置 |
|------|------|------|
| `project-profile.md` | ai-project-manager | `<host>/project-profile.md` |
| `BRD-<slug>-*.md` | brd-writer | `<host>/docs/brd/` |
| `mainprd-<slug>.md` | prd-writer | `<host>/docs/prd/` |
| `prd-feature-list-<slug>.md` | prd-writer | `<host>/docs/prd/` |
| `0X-subprd-<区块英文短名>.md` | prd-writer | `<host>/docs/prd/subprd/` |
| `foundation-glossary-<slug>.md` | foundation-builder | `<host>/docs/prd/foundation/` |
| `foundation-schema-<slug>.md` | foundation-builder | `<host>/docs/prd/foundation/` |
| `foundation-api-<slug>.md` | foundation-builder | `<host>/docs/prd/foundation/` |
| `foundation-delivery-<slug>.md` | foundation-builder | `<host>/docs/prd/foundation/` |

**产出文件**：

| 产物 | 文件名 | 存放位置 | 说明 |
|------|--------|---------|------|
| 主开发计划 | `main-delivery-plan-<slug>.md` | `<host>/docs/plans/delivery-plans/` | 包含全局方法、Phase 索引、发布闸门、风险和 PRD 反向索引 |
| 任务看板 | `task-kanban-<slug>.md` | `<host>/docs/plans/delivery-plans/` | 汇总 Task、子开发计划链接、Owner、前置、状态、完成日期和备注 |
| 子开发计划 | `sub-delivery-plan-<slug>-<TaskID>-<short-name>.md` | `<host>/docs/plans/delivery-plans/` | 单个 Task 的 PRD、核心逻辑、核心文件、完成标准和验证证据 |

---

## 7. coding-standards — S4 代码实装

**职责**：消费 `main-delivery-plan-<slug>.md`、`task-kanban-<slug>.md` 和当前 Task 对应的 `sub-delivery-plan-*.md`，前置运行 `verify-task-context.mjs` 脚本确认上游 PRD 文件真实存在，再按 Task 的 `PRD双链·读` 加载对应 PRD 文件，参照 `skills/coding-standards/references/` 中匹配的编码规范，产出真实代码文件，并回写 Task 状态。不负责需求澄清、方案设计、测试执行或发布决策。

**依赖文件**：

| 文件 | 来源 | 位置 |
|------|------|------|
| `main-delivery-plan-<slug>.md` | delivery-planner | `<host>/docs/plans/delivery-plans/` |
| `task-kanban-<slug>.md` | delivery-planner | `<host>/docs/plans/delivery-plans/` |
| `sub-delivery-plan-<slug>-<TaskID>-<short-name>.md` | delivery-planner | `<host>/docs/plans/delivery-plans/` |
| Task 内 `PRD双链·读` 指向的文件 | foundation-builder / prd-writer | `<host>/docs/prd/` |
| `coding-standards/references/<规范>.md` | 本 skill | `skills/coding-standards/references/` |

**产出文件**：

| 产物 | 文件名 | 存放位置 | 说明 |
|------|--------|---------|------|
| 实装代码文件 | 由 Task 的 `核心文件` 字段决定 | `<host>/src/` 或项目约定代码根目录 | 按 PRD 和编码规范产出的真实文件 |
| Task 状态回写 | 对应子开发计划和任务看板 | `<host>/docs/plans/delivery-plans/` | 将已完成 Task 的状态改为 `已完成(YYYY-MM-DD)` |

---

## 8. prd-acceptance-reviewer — 验收标准审阅

**职责**：消费 subprd 中每个功能子区域 §X 末尾的 X.6 验收小节，拉齐到独立的验收文档，按 PRD 区块拆文件；在 PRD 侧只允许修订 §X.6 内部验收条目并在 §X.6 末尾追加回链。不改 PRD 正文、不编写测试用例、不维护 baseline / changelog / baseline.md。

**依赖文件**：

| 文件 | 来源 | 位置 |
|------|------|------|
| `project-profile.md` | ai-project-manager | `<host>/project-profile.md` |
| `BRD-<slug>-*.md` | brd-writer | `<host>/docs/brd/` |
| `foundation-glossary-<slug>.md` | foundation-builder | `<host>/docs/prd/foundation/` |
| `foundation-schema-<slug>.md` | foundation-builder | `<host>/docs/prd/foundation/` |
| `foundation-api-<slug>.md` | foundation-builder | `<host>/docs/prd/foundation/` |
| `foundation-delivery-<slug>.md` | foundation-builder | `<host>/docs/prd/foundation/` |
| `prd-feature-list-<slug>.md` | prd-writer | `<host>/docs/prd/` |
| `mainprd-<slug>.md` | prd-writer | `<host>/docs/prd/` |
| `0X-subprd-<区块英文短名>.md` | prd-writer | `<host>/docs/prd/subprd/` |

**产出文件**：

| 产物 | 文件名 | 存放位置 | 说明 |
|------|--------|---------|------|
| 验收文档主索引 | `acceptance-<slug>.md` | `<host>/docs/test-case/` | 全局入口，索引所有区块验收子文件 |
| 验收文档子文件 | `acceptance-<slug>/<区块名>.md` | `<host>/docs/test-case/acceptance-<slug>/` | 按 PRD 区块拆，一份对应一个 subprd 的 X.6 验收汇总 |
| PRD §X.6 验收条目修订 + 回链追加（原地回写） | `0X-subprd-<区块英文短名>.md` | `<host>/docs/prd/subprd/` | 仅在 subprd 每个 §X.6 小节内部修订验收条目，并在 §X.6 末尾追加到验收文档子文件的回链；不维护 baseline / changelog / baseline.md |

---

## 9. test-case-writer — 测试用例编写

**职责**：以验收文档为唯一验收权威源，结合 foundation（glossary / schema / api）、PRD（辅助上下文）、BRD（辅助上下文），产出按业务域组织的测试用例文件和配套 SQL 数据准备。不改 PRD、不改验收文档。

**依赖文件**：

| 文件 | 来源 | 位置 |
|------|------|------|
| `BRD-<slug>-*.md` | brd-writer | `<host>/docs/brd/` |
| `foundation-glossary-<slug>.md` | foundation-builder | `<host>/docs/prd/foundation/` |
| `foundation-schema-<slug>.md` | foundation-builder | `<host>/docs/prd/foundation/` |
| `foundation-api-<slug>.md` | foundation-builder | `<host>/docs/prd/foundation/` |
| `foundation-delivery-<slug>.md` | foundation-builder | `<host>/docs/prd/foundation/` |
| `prd-feature-list-<slug>.md` | prd-writer | `<host>/docs/prd/` |
| `mainprd-<slug>.md` | prd-writer | `<host>/docs/prd/` |
| `0X-subprd-<区块英文短名>.md` | prd-writer | `<host>/docs/prd/subprd/` |
| `acceptance-<slug>.md` | prd-acceptance-reviewer | `<host>/docs/test-case/` |
| `acceptance-<slug>/<区块名>.md` | prd-acceptance-reviewer | `<host>/docs/test-case/acceptance-<slug>/` |

**产出文件**：

| 产物 | 文件名 | 存放位置 | 说明 |
|------|--------|---------|------|
| TC 主索引 | `tc-main-<slug>.md` | `<host>/docs/test-case/` | 全局 TC 入口，按业务域索引所有域 TC 文件 |
| 域 TC 文件 | `<业务域>/tc-<业务域>.md` | `<host>/docs/test-case/<业务域>/` | 单个业务域下的完整测试用例 |
| 测试数据 SQL | `<业务域>/sql/<编号>-<场景>.sql` | `<host>/docs/test-case/<业务域>/sql/` | 本域测试用例对应的数据准备脚本 |

---

## 10. test-case-reviewer — 测试用例核查

**职责**：对 test-case-writer 产出的 TC 做质量检查，发现 TC 内部问题（覆盖不全、与验收文档对应错位、SQL 与用例脱节等）时，可直接原地修正 TC 文件；修正不了、需要用户裁定的问题写入待裁定问题清单。只管 TC 自身质量，不查 PRD 或验收文档——上游有问题不是本 skill 的回环范围。

**依赖文件**：

| 文件 | 来源 | 位置 |
|------|------|------|
| `acceptance-<slug>.md` | prd-acceptance-reviewer | `<host>/docs/test-case/` |
| `acceptance-<slug>/<区块名>.md` | prd-acceptance-reviewer | `<host>/docs/test-case/acceptance-<slug>/` |
| `tc-main-<slug>.md` | test-case-writer | `<host>/docs/test-case/` |
| `<业务域>/tc-<业务域>.md` | test-case-writer | `<host>/docs/test-case/<业务域>/` |
| `<业务域>/sql/<编号>-<场景>.sql` | test-case-writer | `<host>/docs/test-case/<业务域>/sql/` |

**产出文件**：

| 产物 | 文件名 | 存放位置 | 说明 |
|------|--------|---------|------|
| 待裁定 TC 问题清单 | `tc-reviews/<日期>-issues.md` | `<host>/docs/test-case/tc-reviews/` | 列出 reviewer 发现但需用户裁定的疑问 |
| TC 原地修正 | `<业务域>/tc-<业务域>.md` 等 | `<host>/docs/test-case/<业务域>/` | 可自行修正的 TC 内部问题，直接改对应文件 |

---

## 依赖关系矩阵

下表展示每个 Skill 消费了哪些上游产物（✓ = 直接依赖，👁 = 观察但不修改）：

| 产物 | ai-project-manager | brd-writer | page-chief | page-designer | page-explainer | prd-chief | foundation-builder | prd-writer | delivery-planner | coding-standards | test-case-chief | prd-acceptance-reviewer | test-case-writer | test-case-reviewer |
|------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| project-profile | 产出 | ✓（硬依赖） | | | | | | | ✓ | | | ✓ | | |
| BRD | | 产出 | 👁 | ✓ | ✓ | 👁 | ✓ | ✓ | ✓ | | | ✓ | ✓ | |
| 页面代码 | | | 👁 | 产出 | ✓ | 👁 | ✓ | ✓ | | | | | | |
| page-delivery | | | 👁 | 产出 | ✓ | 👁 | ✓ | ✓ | | | | | | |
| explainer-flow | | | 👁 | | 产出 | 👁 | ✓ | ✓ | | | | | | |
| explainer-b-interaction | | | 👁 | | 产出 | 👁 | ✓（仅 locked） | ✓（仅 locked） | | | | | | |
| explainer-b-gap | | | 👁 | | 产出（可选） | 👁 | | | | | | | | |
| explainer-delivery | | | 👁 | | 产出 | 👁 | ✓ | ✓ | | | | | | |
| foundation-glossary | | | | | | 👁 | 产出 | ✓ | ✓ | ✓（按 Task 选读） | 👁 | ✓ | ✓ | |
| foundation-schema | | | | | | 👁 | 产出 | ✓ | ✓ | ✓（按 Task 选读） | 👁 | ✓ | ✓ | |
| foundation-api | | | | | | 👁 | 产出 | ✓ | ✓ | ✓（按 Task 选读） | 👁 | ✓ | ✓ | |
| foundation-delivery | | | | | | 👁 | 产出 | ✓ | ✓ | | 👁 | ✓ | ✓ | |
| prd-feature-list | | | | | | 👁 | | 产出 | ✓ | | 👁 | ✓ | ✓ | |
| mainprd | | | | | | 👁 | | 产出 | ✓ | | 👁 | ✓ | ✓ | |
| subprd | | | | | | 👁 | | 产出 | ✓（按任务选读） | ✓（按 Task PRD双链选读） | 👁 | ✓ | ✓ | |
| delivery-plan | | | | | | | | | 产出 | ✓（硬依赖，逐 Task 消费） | 👁 | | | |
| 验收文档（主索引 + 子文件） | | | | | | | | | | | 👁 | 产出 | ✓ | ✓ |
| TC 主索引 + 域 TC + SQL | | | | | | | | | | | 👁 | | 产出 | ✓（原地修正） |
| TC 问题清单 | | | | | | | | | | | 👁 | | | 产出 |

---

## 路径约定变更须知

截至 2026-04-14，三大目录结构统一为 `docs/brd/` / `src/frontend/page-preview/` / `docs/prd/`。其中页面层目录已从 2026-04-13 版的 `可操作页面/` 改名为 `page-preview/`，现进一步归并到 `src/frontend/` 下。

截至 2026-04-16，page-designer 产出的 Vue 3 前端工程代码从 `page-preview/<工程名>/` 迁移到 `<host>/<工程名>/`（项目根级）。`src/frontend/page-preview/` 仅保留元数据文件（交付清单、实体中间文件）。页面代码是项目级产物，不应嵌套在环节产物目录中。

历史宿主项目若文件仍停留在旧目录或根目录：

- 调度层（page-chief / prd-chief）扫描产物时，应**优先检查新目录**，再兼容旧 `可操作页面/`，最后兜底扫根目录。
- 子 skill 写入新产物时，**一律按本文件约定的目录**写入，不再回写根目录。
- 迁移既有文件时，按 slug 归属关系移动到对应目录即可，内容无需改动；若原先位于 `可操作页面/` 或根级 `page-preview/`，应整体迁移到 `src/frontend/page-preview/`。
- 页面工程代码若仍在 `page-preview/<工程名>/`，应迁移到 `<host>/<工程名>/`。
