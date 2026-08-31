# 组件家族与选择边界

本文件帮助 AI 在 Composition Kit 阶段选择组件，不负责重复描述视觉样式。先从用户任务判断信息关系，再选择 family id；不要先看组件外观再倒推用途。

## 模块划分

| 模块 | Family id | 当前运行时 | 负责的问题 |
| --- | --- | --- | --- |
| 字段基础 | `field / text-field / choice-field / multi-select-field / searchable-select` | `FieldShell / TextField / TextAreaField / NumberField / SelectField / MultiSelectField / SearchableSelect` | 标签、说明、错误、文本数值输入、单项、多项选择与筛选 |
| 表单选择 | `form-selection` | `CheckboxField / CheckboxGroupField / RadioGroupField / SwitchField` | 独立选择、多选、互斥决策与即时设置 |
| 直接动作 | `button / icon-button` | `Button / IconButton` | 页面主次动作和工具动作 |
| 上下文说明 | `overlay` | `Tooltip / PopoverCard` | 锚定触发器的补充说明或轻量交互 |
| 动作弹层 | `action-overlay` | `ActionMenu` | 在有限空间收纳同级低频命令 |
| 阻塞决策 | `dialog` | `Dialog` | 需要用户先处理才能继续的确认或短任务 |
| 操作反馈 | `feedback` | `InlineNotice / ToastViewport / FeedbackQueue` | 局部持久反馈与全局短暂通知 |
| 资源与状态 | `resource-state / status` | `ResourcePanel / StatusBadge` | 内容区域生命周期和稳定业务状态 |
| 工作区导航与查询 | `tertiary-nav / filter-bar` | `TertiaryNav / FilterBar` | 稳定子视图切换、临时查询条件与结果摘要 |
| 结构化数据 | `metric-card / data-table / mobile-record-card / definition-list / pagination` | `MetricCard / DataTable / MobileRecordCard / DefinitionList / TablePagination` | 关键指标、高密度比较、移动摘要、稳定键值详情与翻页 |
| 明确决策 | `approval-panel` | `ApprovalPanel` | 风险上下文中的批准、退回、提交中与完成结果 |

模块是责任边界，不是页面分区。一个页面可以同时使用多个模块，但同一条信息只能有一个主要承载位置。

## 选择控件

### Checkbox

- 用于互不依赖的开关项，或允许选择多个结果的集合。
- “同意条款后提交”属于 Checkbox，因为状态在提交时生效。
- 不要用一组 Checkbox 表达必须且只能选一项的决策。

### Radio

- 用于 2 到 7 个可同时看见、且必须互斥的选项。
- 默认值必须是真实业务默认，不要为消除空态随意预选。
- 选项过多、文案过长或空间不足时改用 Select；需要搜索时改用 SearchableSelect。

### Select、MultiSelect 与 SearchableSelect

- 少量固定选项且空间允许时，Radio 比 Select 更易比较。
- 选项较多但标签短、用户知道目标时用原生语义的 SelectField。
- 需要从受控集合选择多项，并让用户看见计数和逐项移除入口时用 MultiSelectField。
- 选项通常超过 10 项、标签需要过滤或用户按名称查找时用 SearchableSelect。
- 多选集合大到无法快速扫描时，不要继续扩展 MultiSelectField；改用带搜索的成熟多选适配器，并补充异步、分页或虚拟化策略。
- 异步加载、无结果、错误和清除已选值必须分别定义，不能共用空白菜单。

### Switch

- 只用于切换后立即生效的设置，例如“开启异常提醒”。
- 需要填写表单并点击保存才生效时，用 Checkbox，不用 Switch。
- 标签描述当前控制对象，不把“开启/关闭”写进标签造成状态重复。

## 覆盖层与反馈

按以下顺序判断：

1. 只是简短补充说明，且没有交互内容：`Tooltip`。
2. 内容锚定当前控件、可交互、但不阻塞主任务：`PopoverCard`。
3. 只是一组同级命令：`ActionMenu`。
4. 用户必须先确认、填写或处理风险才能继续：`Dialog`。
5. 消息属于当前内容区域，需要保留到问题被处理：`InlineNotice`。
6. 消息是操作完成后的全局短暂确认：`ToastViewport`。

边界规则：

- Tooltip 不能放按钮、链接、表单，也不能成为关键业务信息的唯一入口。
- Popover 可以交互，但不能伪装成无需关闭的复杂工作台。
- ActionMenu 只放动作，不放筛选、表单或页面导航；主要动作始终直接可见。
- Dialog 承担阻塞决策；普通 Dialog 可通过 Escape 或外部点击关闭，警示 Dialog 只能通过明确动作结束。
- InlineNotice 跟随内容布局，不遮挡工作区；字段级错误仍放在字段旁。
- 同时只显示一条 Toast。普通 Toast 至少保留 5 秒；错误或带恢复动作的 Toast 不自动消失；每条最多一个恢复动作。
- 同一错误不要同时出现在字段、InlineNotice、Dialog 和 Toast。选择最靠近问题、最能支持恢复的位置。

## 工作台组合边界

### TextField、FieldShell 与选择控件

- `FieldShell` 只负责标签、说明、错误和控件关系，不单独成为业务输入控件。
- 自由文本用 `TextField`，长说明用 `TextAreaField`，受范围约束的数字用 `NumberField`。
- 固定选项不伪装成文本输入；按互斥关系、选择数量与搜索需要改用 Radio、`SelectField`、`MultiSelectField` 或 `SearchableSelect`。

### TertiaryNav 与 FilterBar

- `TertiaryNav` 表达稳定、可命名的工作区子视图，例如“待我处理 / 团队队列 / 已结束”。
- `FilterBar` 表达可组合、可重置的临时条件，例如风险等级、处理状态和关键词。
- 不把筛选条件放进导航，也不使用标签页模拟提交/重置动作。

### DataTable、MobileRecordCard 与 DefinitionList

- 需要跨行扫描和列对齐比较时用 `DataTable`；窄屏不能维持可读列宽时切换为 `MobileRecordCard`。
- `MobileRecordCard` 只保留任务所需关键字段，字段仍带可读标签；它是同一结果集的响应式视图，不是第二份数据。
- 单条记录的稳定详情用 `DefinitionList`；需要编辑时回到字段组件，需要跨记录比较时回到表格。

### MetricCard 与普通详情

- `MetricCard` 只用于少量、可比较且有明确单位或时间范围的关键指标。
- 普通字段和单条记录属性使用 `DefinitionList`，不要为了强调层级把每个字段都做成指标卡。
- 口径说明使用可聚焦 Tooltip；存在详情页时提供明确链接，不能把整张卡片变成含有嵌套交互的模糊点击区。
- loading 状态保留稳定骨架和 `aria-busy`，不得用 `0` 或 `--` 冒充尚未完成的数据。

### ApprovalPanel、Dialog 与反馈

- 当前上下文已经完整、用户只需批准或退回时用 `ApprovalPanel`。
- 决策会打断其他任务、包含短表单或必须确认不可逆风险时用 `Dialog`。
- `InlineNotice` 说明异常与恢复方式，Toast 确认短暂结果；两者都不代替审批动作。
- 决策完成态必须留在 `ApprovalPanel` 或对应记录中，支持审计，不只依赖短暂通知。

### FilterBar 与 TablePagination

- 筛选、排序和每页条数变化通常回到第一页；页码、总量与范围来自同一查询结果。
- 移动端可折叠筛选字段，但结果摘要与“展开筛选”入口必须保留。
- 数据量不超过一页时隐藏分页，不显示不可操作的页码装饰。

## 复核工作台优先家族

`multi-select-field / metric-card / tertiary-nav / text-field / filter-bar / data-table / mobile-record-card / definition-list / pagination / approval-panel` 已全部为 `runtime-ready`。脚手架按 family id 生成，并自动补齐 `button / field / overlay / resource-state / status` 等真实依赖。参考组合见 Catalog 的“复核决策工作台”，但项目 Kit 仍只安装实际使用的家族。

## 模板与可选模块边界

| Family | 可用性 | 处理方式 |
| --- | --- | --- |
| `app-frame` | `contract-only` | 作为页面框架与响应式预算模板使用，由项目现有 Shell、路由和导航结构组合；不生成单体 `AppFrame` 运行时组件。 |
| `agent-event-row` | `contract-only` | 只在 Agent 过程、任务时间线或审计事件场景纳入项目 Kit，并按项目事件模型实现。 |
| `file-artifact-row` | `contract-only` | 只在文件产物、Diff、冲突和同步状态成为核心对象时纳入，与普通附件或正文链接分开。 |
| `command-palette` | `external-required` | 通过清单批准的成熟 adapter 接入焦点、筛选、键盘和弹层行为；禁止临时手写近似实现。 |

## C 端组件契约

以下六类均为可选择的 `contract-only` family，不进入 React runtime barrel，也不由脚手架伪造通用实现：

| Family | 与相邻组件的边界 |
| --- | --- |
| `consumer-navigation` | 负责顶部 App Bar、移动底部导航、账户与更多表面的组合；普通 `button`、`menu` 和项目路由仍各自负责动作与导航事实。 |
| `discovery-card` | 负责发现列表中的对象摘要；必须区分 product、content、service 元数据，不替代 `data-table`、详情页或匿名万能 Card。 |
| `media-gallery` | 负责多媒体顺序、选择、缩放、播放与退化；媒体加载和播放器运行时由项目或成熟库负责。 |
| `price-summary` | 负责价格、周期、费用明细与总价语义；计算、优惠资格和收款事实仍由业务域负责。 |
| `rating-summary` | 负责均值、满分、样本量、分布和来源；聚合、验证与反作弊仍由评价服务负责。 |
| `step-progress` | 负责多步骤位置、完成、错误和返回语义；流程状态机、校验与路由仍由业务流程负责。 |

Composition Kit 可以选择这些 ID，但必须写清项目映射、状态来源和实现责任；未提供项目实现或批准 adapter 时，只能声称契约已定义。

这些项目继续保留在全量 Library 和 Manifest 中，但 Catalog 将它们收在末尾的“规划与适配”内，不与可直接导入的运行时组件等权展示。

## 七个基础组件升级

| 组件 | 补齐能力 | 使用要求 |
| --- | --- | --- |
| `Button` | small/medium/large、前后图标、稳定 loading 名称 | 图标仅装饰；动作名称仍由文字表达 |
| `IconButton` | 尺寸与键盘可触发 Tooltip | 必须有稳定 `label`，Tooltip 只作补充 |
| `FieldShell` | 合并业务控件已有的 `aria-describedby` | 不覆盖业务已声明的说明关系 |
| `SelectField` | loading 与加载文案 | 加载时禁用并暴露 busy 状态 |
| `SearchableSelect` | loading、无结果与清除动作 | 清除必须真正回传 `null`，不伪造空选项 |
| `DataTable` | 可交互排序和方向命名 | 排序必须改变真实数据顺序，不只改变图标 |
| `Dialog` | `dialog / alert` 与 `dismissable` | 保留焦点约束、背景隔离和关闭后焦点返回 |

## AI 输出要求

Composition Kit 中每个页面至少写清：

- 使用的 family id，而不是只写显示名称。
- 选择原因和被排除的相邻组件。
- 必需状态，例如 loading、empty、error、disabled、open、dismissed。
- 键盘、焦点和恢复路径。
- 该组件是否已是 `runtime-ready`；不是时写明 adapter、移植或契约方案。

项目 Kit 只安装确认使用的 family 及依赖。全量能力继续留在 Skill Library，不为“以后可能用到”复制到项目。
