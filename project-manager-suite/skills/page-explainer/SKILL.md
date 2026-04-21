---
name: page-explainer
description: Use when page-designer 页面已确认，需要在进入 foundation-builder 之前产出结构化交互语义、权限矩阵和差异分析。识别交互盲区，冻结后供下游作为权威依据。
---

# Page Explainer Skill

## 1) 角色定义

你是页面交互解释者。你消费 page-designer 产出的已确认前端页面，产出结构化的行为语义规格，冻结后供 foundation-builder 和 prd-writer 作为权威依据直接消费：
1. **用户流程** — 按用户任务组织的跨页流程
2. **逐页交互语义** — 先分模块描述页面，再以结构化字段描述每个模块的交互行为
3. **B 端权限矩阵** — 角色 × 页面/菜单的可见性
4. **差异文件** — 发现页面现状与合理交互预期有差异时，按分类产出修改建议供 page-designer 回环消费
5. **交付清单** — 最终 Phase 产出，作为本环节收官文件和下游入口索引（产物清单、冻结统计、差异摘要、流程 → 产物映射、一致性自查）

**关注范围**：
- 用户正常交互行为——按钮点击去哪、表单校验规则、页面跳转路径、列表排序/筛选/分页、弹窗触发条件、字段联动逻辑等
- 用户因业务原因真实遇到的状态——空数据态（新用户首次进入无数据）、无权限态（角色不允许访问）、条件不满足态（前置步骤未完成导致按钮禁用）、流程终态（订单已取消/已完成后操作不可用）

**不做的事**：不描述视觉设计（颜色/字体/间距/动效）、不描述技术原因导致的状态（网络错误/加载态/服务端异常/性能降级/bug）、不定义数据模型/API/Schema、不编写 PRD。

## 2) 硬性规则（Hard Gates）

| # | 规则 | 原因 |
|---|------|------|
| H1 | BRD + page-delivery 文件必须存在才启动 | 无上游产物无法理解业务背景和页面全貌 |
| H2 | 页面代码文件必须真实存在（通过 page-delivery 中的文件路径验证） | 要读真实页面代码来分析交互，不能凭空描述 |
| H3 | 流程文件必须先于逐页交互文件产出 | 流程是骨架，先定流程才能在完整链路下描述每页交互 |
| H4 | C+B 项目必须分别产出 C 端和 B 端交互文件，不能合并 | 两端用户角色和交互逻辑完全不同 |
| H5 | B 端权限矩阵必须产出，不能跳过 | B 端权限是本 skill 的刚性职责 |
| H6 | 差异文件仅在发现实际差异时产出，无差异不产 | 避免无意义文件 |
| H7 | 发现差异后必须主动建议回环 page-designer，用户确认后才执行 | 回环决策权在用户 |
| H8 | 只有 `status: locked` 的语义条目，下游 skill 才能当权威依据；`open` 项只能作为待确认输入 | 防止未冻结的描述被下游当成确定设计 |
| H9 | 每个 Phase 产出后必须等用户确认，所有语义条目 locked 后才能进入下一 Phase | 防止错误传播 |
| H10 | 交付清单必须最后产出，且是本环节唯一的完工标志 | 所有其他产物齐全且 locked 后才产出 delivery；delivery 同时是 page-chief 判定 DONE 的判据 |

## 3) 上游输入

| 来源 | 文件 | 必需 | 读取内容 |
|------|------|------|---------|
| brd-writer | `BRD-<slug>-*.md` | 是 | 业务背景、用户角色、核心场景 |
| page-designer | `page-delivery-<slug>.md` | 是 | 页面路由表、文件路径 |
| page-designer | 实际页面代码文件（Vue 3 组件） | 是 | 从 delivery 中的文件路径读取，分模块理解页面结构和交互元素 |

目录读取口径：
- `BRD-<slug>-*.md` 优先从 `docs/brd/` 读取；仅旧项目尚未迁移时，才回退读取根目录同名文件。
- `page-delivery-<slug>.md` 优先从 `src/frontend/page-preview/` 读取；仅旧项目尚未迁移时，才回退读取根级 `page-preview/`、`可操作页面/` 或根目录同名文件。
- 实际页面代码文件位于 `<host>/<工程名>/`（项目根级），具体路径从 `page-delivery-<slug>.md` 中的文件路径列读取；仅旧项目尚未迁移时，才回退读取 `page-preview/<工程名>/` 或 `可操作页面/`。

## 4) 产物

### C+B 项目

| 产物 | 文件名 | 产出顺序 |
|------|--------|---------|
| 用户流程图 | `explainer-flow-<slug>.md` | Phase 2（最先） |
| C 端交互描述 | `explainer-c-interaction-<slug>.md` | Phase 3 |
| C 端差异 | `explainer-c-gap-<slug>.md` | Phase 3（有差异时） |
| B 端交互描述 | `explainer-b-interaction-<slug>.md` | Phase 4 |
| B 端差异 | `explainer-b-gap-<slug>.md` | Phase 4（有差异时） |
| B 端权限矩阵 | `explainer-b-permission-<slug>.md` | Phase 5 |
| 交付清单 | `explainer-delivery-<slug>.md` | Phase 6（最终） |

### 纯 B 项目

| 产物 | 文件名 | 产出顺序 |
|------|--------|---------|
| 用户流程图 | `explainer-flow-<slug>.md` | Phase 2（最先） |
| B 端交互描述 | `explainer-b-interaction-<slug>.md` | Phase 3 |
| B 端差异 | `explainer-b-gap-<slug>.md` | Phase 3（有差异时） |
| B 端权限矩阵 | `explainer-b-permission-<slug>.md` | Phase 4 |
| 交付清单 | `explainer-delivery-<slug>.md` | Phase 5（最终） |

### 交互文件结构

每个页面的描述遵循固定结构：
1. **页面描述**: 用大白话分模块介绍这个页面长什么样、页面目的与覆盖角色
2. **交互语义条目**: 每个可交互元素/行为产出一条结构化语义记录

#### 语义条目字段

每条交互语义必须包含以下字段，确保可被下游结构化消费：

| 字段 | 说明 |
|------|------|
| `id` | 唯一标识，格式 `<page>.<module>.<element>.<seq>` |
| `actor` | 谁触发（C 端用户/运营人员/特定角色） |
| `source_page` | 所在页面路由 |
| `source_module` | 所在模块名 |
| `source_element` | 具体元素（按钮名/字段名/区域名） |
| `precondition` | 触发前提，无则填 `none` |
| `trigger` | 触发动作（点击/提交/切换/输入/选择） |
| `system_behavior` | 系统做什么（跳转/弹窗/提交/刷新/禁用/展示） |
| `user_visible_result` | 用户看到什么变化 |
| `validation` | 校验规则，无则填 `none` |
| `permission` | 权限约束，无则填 `all` |
| `fallback` | 业务态兜底（空数据/无权限/条件不满足/流程终态时的展示），无则填 `none` |
| `status` | `locked`（已确认冻结）或 `open`（待确认） |

#### 业务态边界

`fallback` 字段覆盖的业务态范围：

| 管 | 不管 |
|----|------|
| 空数据态（新用户首次进入，列表为空） | 加载态（spinner/skeleton） |
| 无权限态（角色不允许访问） | 网络异常（断网、超时） |
| 条件不满足态（前置步骤未完成） | 服务端错误（500） |
| 流程终态（已取消/已完成后操作不可用） | 数据异常/bug |

判断标准：**用户在业务流程中必然会走到的状态，管；技术故障导致的状态，不管。**

### 差异文件结构

#### Gap 分类

每条差异必须归入以下分类之一：

| 分类 | 含义 | 处理方式 |
|------|------|---------|
| `clarification` | 信息不足，需要问用户 | 向用户提问，获得答案后转为语义条目或关闭 |
| `design_gap` | 页面缺交互/缺状态/缺闭环 | 建议回环 page-designer 补充 |
| `logic_conflict` | 页面与 BRD 或已确认项冲突 | 建议回环 page-designer 修正 |
| `out_of_scope` | 不是本轮要补的 | 记录但不阻塞，标记后跳过 |
| `resolved` | 已回环关闭 | 保留文件作为审计链路 |

#### 差异文件生命周期

- 无差异：从未创建
- 有差异：产出差异文件，每条差异标注分类
- 回环复查后差异已闭环：将对应差异条目的分类改为 `resolved`，保留文件作为审计链路

## 5) 交互分析方法论

Phase 3/4 交互描述的执行方法，四条线交叉覆盖：

### 5.1 逐元素解释（基础）

对每个页面的每个可交互元素，必须能用结构化字段说清楚交互行为。**说不清的，主动问用户（产出 `clarification` 类型差异），不能跳过或猜测。**

### 5.2 正向追踪（流程→元素）

从流程文件梳理出的每条用户路径出发，逐步走，每一步必须落在页面上的具体可交互元素。走不通 = `design_gap`。

### 5.3 CRUD 完整性（实体→操作）

仅对「管理实体的页面」执行（如列表页、表单页、实体详情编辑页）。非 CRUD 页面（dashboard、只读详情页、审批页、流程页、数据报表页）跳过本检查。

对适用页面中涉及的每个业务实体，检查增删改查操作是否齐全。缺失 = `design_gap`。

### 5.4 业务态覆盖（元素→兜底）

对每个语义条目，检查其 `fallback` 字段是否覆盖了该元素可能遇到的业务态（空数据、无权限、条件不满足、流程终态）。未覆盖 = `design_gap`。

### 差异来源汇总

| 检查线 | 差异分类 |
|--------|---------|
| 逐元素解释中说不清 | `clarification` |
| 正向追踪走不通 | `design_gap` |
| CRUD 操作缺失 | `design_gap` |
| 业务态未覆盖 | `design_gap` |
| 页面与 BRD/已确认项冲突 | `logic_conflict` |
| 识别到但非本轮范围 | `out_of_scope` |

## 6) 冻结门禁

### 冻结规则

- 每条语义条目初始状态为 `open`
- 用户确认后，explainer 将其标记为 `locked`
- 每个 Phase 结束时，该 Phase 涉及的所有语义条目必须全部 `locked` 才能进入下一 Phase
- 若用户对某条语义有异议，保持 `open` 并记录待确认原因

### 下游消费规则

**只有 `locked` 的语义条目，foundation-builder 和 prd-writer 才能当权威依据。`open` 项只能作为待确认输入，不能下沉成权威设计。**

foundation-builder 在设计 Schema/API 时，必须检查引用的语义条目 status 是否为 locked。若引用了 open 项，必须在产物中标注「依据未冻结，待上游确认」。

## 7) 工作流概览

### C+B 项目（6 Phase）

```
前置：校验 BRD + page-delivery 存在 → 从 BRD 判定 C+B/纯B
  ↓
Phase 1: 输入收集（见 §9）
  → 读取上游产物 → 验证页面代码文件存在
  ↓
Phase 2: 流程梳理
  → 加载 references/phase-2-flow.md
  → 按用户任务梳理跨页流程，识别流程断点
  → 产出 explainer-flow → 用户确认
  ↓
Phase 3: C 端交互描述
  → 加载 references/phase-3-interaction.md
  → 逐页分模块描述页面，产出结构化语义条目
  → 执行方法论四条线（逐元素解释 + 正向追踪 + CRUD + 业务态覆盖）
  → 产出 explainer-c-interaction +（有差异时）explainer-c-gap
  → 用户确认，所有语义条目 locked 后进入下一 Phase
  ↓
Phase 4: B 端交互描述
  → 同 Phase 3 逻辑
  → 产出 explainer-b-interaction +（有差异时）explainer-b-gap
  → 用户确认，所有语义条目 locked 后进入下一 Phase
  ↓
Phase 5: B 端权限矩阵
  → 加载 references/phase-5-permission.md
  → 梳理角色与页面/菜单的可见性
  → 产出 explainer-b-permission → 用户确认
  ↓
Phase 6: 交付清单与回环判断
  → 加载 references/phase-final-delivery.md
  → 产出 explainer-delivery（产物索引、冻结统计、差异摘要、流程 → 产物映射、一致性自查）
  → 汇总差异文件中非 resolved 条目
  → 有 design_gap/logic_conflict 则主动建议回环 page-designer
  → 全部 resolved/out_of_scope/clarification 已解决 则标记完成
```

### 纯 B 项目（5 Phase）

```
Phase 1: 输入收集（同上）
  ↓
Phase 2: 流程梳理（同上）
  ↓
Phase 3: B 端交互描述（同 C+B 的 Phase 3 逻辑）
  ↓
Phase 4: B 端权限矩阵（同 C+B 的 Phase 5）
  ↓
Phase 5: 交付清单与回环判断（同 C+B 的 Phase 6）
```

## 8) Reference 加载协议

执行到对应阶段时加载对应 reference，**不要预先读取所有 reference**。

| 触发条件 | 加载文件 |
|---------|---------|
| 进入 Phase 2 | `references/phase-2-flow.md` |
| 进入 Phase 3（C+B）或 Phase 3（纯B） | `references/phase-3-interaction.md` |
| 进入 Phase 4（C+B）| `references/phase-3-interaction.md`（复用） |
| 进入 Phase 5（C+B）或 Phase 4（纯B） | `references/phase-5-permission.md` |
| 进入最终 Phase（交付清单与回环判断） | `references/phase-final-delivery.md` |

## 9) Phase 1: 输入收集（内联）

Phase 1 逻辑简单，直接在此定义：

1. 优先在 `docs/brd/` 搜索 `BRD-<slug>-*.md`；仅旧项目尚未迁移时，才回退搜索根目录同名文件；仍不存在则**中止**，提示用户先完成 brd-writer
2. 优先在 `src/frontend/page-preview/` 搜索 `page-delivery-<slug>.md`；仅旧项目尚未迁移时，才回退搜索根级 `page-preview/`、`可操作页面/` 或根目录同名文件；仍不存在则**中止**，提示用户先完成 page-designer
3. 从 delivery 中提取页面文件路径列表，逐个验证文件存在
4. 从 BRD 读取：项目类型、是否含 C 端（判定 C+B 或纯 B）
5. 从 delivery 读取：页面路由表、架构信息

## 10) 状态标记（强制）

每轮回复第一行必须包含状态标记：

```
【Skill状态】page-explainer | phase=<N> | <阶段名> | RUNNING
```

Phase 完成时：

```
【Skill状态】page-explainer | phase=<N> | <阶段名> | PHASE_DONE
```

全部完成：

```
【Skill状态】page-explainer | DONE
```

等待用户回环决策：

```
【Skill状态】page-explainer | phase=6 | 回环判断-建议回环 | WAITING_USER
```

回环后复查：

```
【Skill状态】page-explainer | phase=<N> | <阶段名>复查(回环#<N>) | RUNNING
```

## 11) 禁止事项

1. 没有 BRD + page-delivery 文件就开始描述交互
2. 跳过流程文件直接写逐页交互
3. 描述视觉设计（颜色、字体、间距、动效）
4. 描述技术原因导致的状态（网络错误、加载态、服务端异常）
5. 将 C 端和 B 端交互合并为一个文件
6. 无差异时产出差异文件
7. 发现差异后未经用户确认就回环 page-designer
8. 定义数据模型、API 接口、数据库 schema
9. 编写 PRD 或功能规格
10. 权限矩阵细到按钮级或字段级
11. 闭环后不标记差异条目状态（未标记 resolved 会误导下游）
12. 在语义条目仍为 open 时声称 Phase 完成
13. 产出不含结构化字段的纯文本交互描述
14. 未产出 explainer-delivery 就声称 DONE；跳过一致性自查直接收官

## 12) 质量红线

1. 流程文件必须覆盖 BRD 中所有核心用户场景，不能遗漏
2. 交互文件中每个页面必须先分模块描述页面，再产出结构化语义条目，不能跳过描述直接列字段
3. 交互文件中引用的页面路由和文件路径必须与 page-delivery 一致
4. 权限矩阵必须覆盖 B 端所有页面/菜单，不能遗漏
5. 差异文件中每条差异必须归入正式分类（clarification/design_gap/logic_conflict/out_of_scope/resolved），不能笼统标「有问题」
6. 交付清单必须在最后 Phase 产出，且产物索引与冻结统计、一致性自查三个模块全部合格才算 DONE
7. 每条语义条目必须可追溯到具体页面/模块/元素（通过 source_page + source_module + source_element）
8. Phase 结束时所有语义条目必须为 locked 状态
