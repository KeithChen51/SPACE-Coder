# page-explainer Skill 设计规格

> 日期: 2026-04-09
> 状态: 待实现
> 管线位置: page-designer → **page-explainer** → foundation-builder → prd-writer

---

## 1. 角色定义

**page-explainer** — 页面交互解释者

- **定位**: page-designer 和 foundation-builder 之间的独立环节
- **职责**: 以用户流程为骨架、逐页交互为血肉，产出结构化的行为语义规格，冻结后供 foundation-builder 和 prd-writer 作为权威依据直接消费。主动识别交互盲区，发现差异时产出修改建议供 page-designer 回环消费
- **关注范围**:
  - 用户正常交互行为——按钮点击去哪、表单校验规则、页面跳转路径、列表排序/筛选/分页、弹窗触发条件、字段联动逻辑等
  - 用户因业务原因真实遇到的状态——空数据态（新用户首次进入无数据）、无权限态（角色不允许访问）、条件不满足态（前置步骤未完成导致按钮禁用）、流程终态（订单已取消/已完成后操作不可用）
- **不关注**: 视觉设计（颜色/字体/间距/动效）、技术原因导致的状态（网络错误/加载态/服务端异常/性能降级/bug）
- **B 端额外职责**: 输出页面级角色权限矩阵（哪些角色能看到哪些页面/菜单）
- **回环能力**: 发现页面现状与合理交互预期有差异时，自动产出差异文件（含具体修改建议），主动建议回到 page-designer，用户确认后执行

**管线位置:**

```
page-designer → page-explainer → foundation-builder → prd-writer
                     ↑    ↓
                     └────┘  （差异回环）
```

---

## 2. 硬性规则（Hard Gates）

| # | 规则 | 原因 |
|---|------|------|
| H1 | BRD + page-delivery 必须存在才能启动 | 没有上游产物，无法理解业务背景和页面全貌 |
| H2 | 页面代码文件必须真实存在（通过 page-delivery 中的文件路径验证） | explainer 要读真实页面代码来分析交互，不能凭空描述 |
| H3 | 流程文件必须先于逐页交互文件产出 | 流程是骨架，先定流程才能在完整链路下描述每页交互 |
| H4 | C+B 项目必须分别产出 C 端和 B 端交互文件，不能合并 | 两端用户角色和交互逻辑完全不同 |
| H5 | B 端权限矩阵必须产出，不能跳过 | B 端权限是本 skill 的刚性职责 |
| H6 | 差异文件仅在发现实际差异时产出，无差异不产 | 避免无意义文件 |
| H7 | 发现差异后必须主动建议回环 page-designer，用户确认后才执行 | 回环决策权在用户 |
| H8 | 只有 `status: locked` 的语义条目，下游 skill 才能当权威依据；`open` 项只能作为待确认输入 | 防止未冻结的描述被下游当成确定设计 |
| H9 | 每个 Phase 产出后必须等用户确认，所有语义条目 locked 后才能进入下一 Phase | 防止错误传播 |

---

## 3. 上游输入

| 来源 | 文件 | 用途 |
|------|------|------|
| brd-writer | `BRD-<slug>-*.md` | 理解业务背景、用户角色、核心场景 |
| page-designer | `page-delivery-<slug>.md` | 获取所有页面的路由和文件路径 |
| page-designer | 页面代码文件（通过 page-delivery 中路径定位） | 读取真实页面代码，分模块理解页面结构和交互元素 |

---

## 4. 产物清单

### C+B 项目

| 产物 | 文件名 | 说明 |
|------|--------|------|
| 用户流程图 | `explainer-flow-<slug>.md` | 按用户任务组织的流程描述 + 所有交互文件的索引 |
| C 端交互描述 | `explainer-c-interaction-<slug>.md` | 逐页：先分模块描述页面，再以结构化语义字段描述每个模块的交互行为 |
| B 端交互描述 | `explainer-b-interaction-<slug>.md` | 逐页：先分模块描述页面，再以结构化语义字段描述每个模块的交互行为 |
| B 端权限矩阵 | `explainer-b-permission-<slug>.md` | 角色 × 页面/菜单 的可见性矩阵 |
| C 端差异 | `explainer-c-gap-<slug>.md` | （有差异时）分类差异条目 + 修改建议 |
| B 端差异 | `explainer-b-gap-<slug>.md` | （有差异时）分类差异条目 + 修改建议 |

### 纯 B 项目

| 产物 | 文件名 | 说明 |
|------|--------|------|
| 用户流程图 | `explainer-flow-<slug>.md` | 流程描述 + 索引 |
| B 端交互描述 | `explainer-b-interaction-<slug>.md` | 逐页交互 |
| B 端权限矩阵 | `explainer-b-permission-<slug>.md` | 权限矩阵 |
| B 端差异 | `explainer-b-gap-<slug>.md` | （有差异时）分类差异条目 + 修改建议 |

### 交互文件结构

每个页面的描述遵循固定结构：
1. **页面描述**: 用大白话分模块介绍这个页面长什么样、页面目的与覆盖角色
2. **交互语义条目**: 每个可交互元素/行为产出一条结构化语义记录

#### 语义条目字段

每条交互语义必须包含以下字段，确保可被下游结构化消费：

| 字段 | 说明 |
|------|------|
| `id` | 唯一标识，格式 `<page>.<module>.<element>.<seq>`，如 `order-list.filter.status-dropdown.1` |
| `actor` | 谁触发（C 端用户/运营人员/特定角色） |
| `source_page` | 所在页面路由 |
| `source_module` | 所在模块名 |
| `source_element` | 具体元素（按钮名/字段名/区域名） |
| `precondition` | 触发前提（如「已登录」「订单状态=待支付」「必填项已填完」），无则填 `none` |
| `trigger` | 触发动作（点击/提交/切换/输入/选择） |
| `system_behavior` | 系统做什么（跳转/弹窗/提交/刷新/禁用/展示） |
| `user_visible_result` | 用户看到什么变化 |
| `validation` | 校验规则（如「手机号 11 位」「金额 > 0」），无则填 `none` |
| `permission` | 权限约束（如「仅管理员可见」），无则填 `all` |
| `fallback` | 业务态兜底（空数据时展示什么、无权限时展示什么、条件不满足时按钮状态），无则填 `none` |
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
- 回环复查后差异已闭环：将对应差异条目的分类改为 `resolved`，保留文件作为审计链路（记录页面为什么改、改过什么），下游 skill 忽略 resolved 状态的差异条目

---

## 5. 交互分析方法论

Phase 3/4 交互描述的执行方法，四条线交叉覆盖：

### 5.1 逐元素解释（基础）

对每个页面的每个可交互元素（按钮、链接、表单字段、下拉框、开关、标签页等），必须能用结构化字段说清楚交互行为。**说不清的，主动问用户（产出 `clarification` 类型差异），不能跳过或猜测。**

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

---

## 6. 冻结门禁

### 冻结规则

- 每条语义条目初始状态为 `open`
- 用户确认后，explainer 将其标记为 `locked`
- 每个 Phase 结束时，该 Phase 涉及的所有语义条目必须全部 `locked` 才能进入下一 Phase
- 若用户对某条语义有异议，保持 `open` 并记录待确认原因

### 下游消费规则

**只有 `locked` 的语义条目，foundation-builder 和 prd-writer 才能当权威依据。`open` 项只能作为待确认输入，不能下沉成权威设计。**

foundation-builder 在设计 Schema/API 时，必须检查引用的语义条目 status 是否为 locked。若引用了 open 项，必须在产物中标注「依据未冻结，待上游确认」。

---

## 7. 工作流概览

### C+B 项目（6 Phase）

| Phase | 动作 | 产出 | 用户确认 |
|-------|------|------|---------|
| 1 | 输入收集：验证 BRD + page-delivery 存在，读取页面代码 | 无 | 无 |
| 2 | 流程梳理：按用户任务梳理跨页流程，识别流程断点 | `explainer-flow-<slug>.md` | 确认后进入 Phase 3 |
| 3 | C 端交互描述：逐页分模块描述页面，产出结构化语义条目，执行四条检查线，冻结确认 | `explainer-c-interaction-<slug>.md` +（有差异时）`explainer-c-gap-<slug>.md` | 所有语义条目 locked 后进入 Phase 4 |
| 4 | B 端交互描述：同上逻辑 | `explainer-b-interaction-<slug>.md` +（有差异时）`explainer-b-gap-<slug>.md` | 所有语义条目 locked 后进入 Phase 5 |
| 5 | B 端权限矩阵：梳理角色与页面/菜单的可见性 | `explainer-b-permission-<slug>.md` | 确认后进入 Phase 6 |
| 6 | 回环判断：回填 explainer-flow 产物索引为真实路径；汇总差异文件中非 resolved 条目，有 design_gap/logic_conflict 则建议回环 page-designer，全部 resolved/out_of_scope 则标记完成 | 无新文件 | 用户决定是否回环 |

### 纯 B 项目（5 Phase）

| Phase | 动作 | 产出 | 用户确认 |
|-------|------|------|---------|
| 1 | 输入收集：验证 BRD + page-delivery 存在，读取页面代码 | 无 | 无 |
| 2 | 流程梳理：按用户任务梳理跨页流程，识别流程断点 | `explainer-flow-<slug>.md` | 确认后进入 Phase 3 |
| 3 | B 端交互描述：逐页分模块描述页面，产出结构化语义条目，执行四条检查线，冻结确认 | `explainer-b-interaction-<slug>.md` +（有差异时）`explainer-b-gap-<slug>.md` | 所有语义条目 locked 后进入 Phase 4 |
| 4 | B 端权限矩阵：梳理角色与页面/菜单的可见性 | `explainer-b-permission-<slug>.md` | 确认后进入 Phase 5 |
| 5 | 回环判断：同 C+B Phase 6 逻辑 | 无新文件 | 用户决定是否回环 |

---

## 8. 禁止事项

| # | 禁止 | 原因 |
|---|------|------|
| F1 | 没有 BRD + page-delivery 就开始描述交互 | 没有上游产物无法工作 |
| F2 | 跳过流程文件直接写逐页交互 | 流程是骨架，没骨架的页面描述是散的 |
| F3 | 描述视觉设计（颜色、字体、间距、动效） | 不在职责范围内 |
| F4 | 描述技术原因导致的状态（网络错误、加载态、服务端异常） | 只管业务原因导致的状态 |
| F5 | 将 C 端和 B 端交互合并为一个文件 | 两端用户角色和交互逻辑完全不同 |
| F6 | 无差异时产出差异文件 | 避免无意义文件 |
| F7 | 发现差异后未经用户确认就回环 page-designer | 回环决策权在用户 |
| F8 | 定义数据模型、API 接口、数据库 schema | 那是 foundation-builder 的事 |
| F9 | 编写 PRD 或功能规格 | 那是 prd-writer 的事 |
| F10 | 权限矩阵细到按钮级或字段级 | 只做页面/菜单级可见性 |
| F11 | 闭环后不标记差异条目状态 | 未标记 resolved 的差异条目会误导下游 |
| F12 | 在语义条目仍为 open 时声称 Phase 完成 | 未冻结的描述不能流入下游 |
| F13 | 产出不含结构化字段的纯文本交互描述 | 下游无法结构化消费，会重新猜测 |

---

## 9. 质量红线

| # | 红线 |
|---|------|
| Q1 | 流程文件必须覆盖 BRD 中所有核心用户场景，不能遗漏 |
| Q2 | 交互文件中每个页面必须先分模块描述页面，再产出结构化语义条目，不能跳过描述直接列字段 |
| Q3 | 交互文件中引用的页面路由和文件路径必须与 page-delivery 一致 |
| Q4 | 权限矩阵必须覆盖 B 端所有页面/菜单，不能遗漏 |
| Q5 | 差异文件中每条差异必须归入正式分类（clarification/design_gap/logic_conflict/out_of_scope/resolved），不能笼统标「有问题」 |
| Q6 | 流程文件作为索引，必须包含所有交互文件和权限文件的真实路径 |
| Q7 | 每条语义条目必须可追溯到具体页面/模块/元素（通过 source_page + source_module + source_element），不能写成抽象产品文档 |
| Q8 | Phase 结束时所有语义条目必须为 locked 状态 |

---

## 10. 状态标记（强制）

每轮响应开头必须带状态行：

```
【Skill状态】page-explainer | phase=1 | 输入收集 | RUNNING
【Skill状态】page-explainer | phase=1 | 输入收集 | PHASE_DONE
【Skill状态】page-explainer | phase=2 | 流程梳理 | RUNNING
【Skill状态】page-explainer | phase=2 | 流程梳理 | PHASE_DONE
【Skill状态】page-explainer | phase=3 | C端交互描述 | RUNNING
【Skill状态】page-explainer | phase=3 | C端交互描述 | PHASE_DONE
【Skill状态】page-explainer | phase=4 | B端交互描述 | RUNNING
【Skill状态】page-explainer | phase=4 | B端交互描述 | PHASE_DONE
【Skill状态】page-explainer | phase=5 | B端权限矩阵 | RUNNING
【Skill状态】page-explainer | phase=5 | B端权限矩阵 | PHASE_DONE
【Skill状态】page-explainer | phase=6 | 回环判断-无差异 | DONE
【Skill状态】page-explainer | phase=6 | 回环判断-建议回环 | WAITING_USER
```

回环后复查：

```
【Skill状态】page-explainer | phase=3 | C端交互复查(回环#1) | RUNNING
```

---

## 11. 下游影响

### 对 PIPELINE.md 的变更

管线从：
```
page-designer → foundation-builder → prd-writer
```

变为：
```
page-designer → page-explainer → foundation-builder → prd-writer
```

### 对 foundation-builder 的影响

新增上游输入：
- `explainer-flow-<slug>.md` — 理解用户流程全貌
- `explainer-c-interaction-<slug>.md` / `explainer-b-interaction-<slug>.md` — 结构化交互语义作为 API 设计的权威依据（仅消费 locked 条目）
- `explainer-b-permission-<slug>.md` — 权限模型影响 schema 和 API 设计

### 对 prd-writer 的影响

新增上游输入：
- 所有 explainer 产物作为 PRD 编写的权威依据（仅消费 locked 条目）
- prd-writer 从「补写交互逻辑」变成「引用已冻结的交互语义」，角色更纯粹

### 对 page-designer 的影响

新增可选输入：
- `explainer-c-gap-<slug>.md` / `explainer-b-gap-<slug>.md` — 回环时读取 design_gap/logic_conflict 类型的差异条目，按修改建议调整页面
