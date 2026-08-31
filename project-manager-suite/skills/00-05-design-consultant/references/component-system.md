# 组件系统

本文件定义部门默认组件的结构、状态和使用边界。它服务于可用性和一致性，不追求复杂视觉表达。

## 机器可读索引

当 AI 需要快速选择组件族时，先读取 `templates/component-manifest.json`。本文件负责解释规则和边界，manifest 负责提供结构化索引。

Manifest 的 `tokens` 字段必须写真实的 `--*` CSS 变量名，不写 `spacing`、`status-color` 等不可解析概念名；`sync-tokens.mjs check` 会与唯一 Token 源交叉校验。

Manifest 的 `availability` 是实现边界：`runtime-ready` 可从统一入口直接使用；`evidence-only` 只有历史实现证据；`contract-only` 只有设计与验收契约；`external-required` 必须使用批准的成熟 adapter。名称出现在清单里不等于已有运行时。

当用户需要“看现有组件库”“组件库分组预览”“给前端一个组件索引页”时，使用 `templates/component-library.html`。HTML 只是挂载外壳，`templates/catalog-react.tsx` 直接导入 `templates/react-runtime/src/index.ts` 的真实组件，并由 `component-library.js` 提供可离线运行的确定性 bundle。Catalog 是运行时组件的可视索引，不是另一套仿制组件；组件可用性属于维护信息，固定放在正文与导航末尾。

当前技术栈为 React + TypeScript + CSS Variables。23 个 `runtime-ready` 家族位于 `templates/react-runtime/src/`，除基础动作、选择、覆盖层与反馈外，已覆盖多选字段、关键指标、文本字段、工作区子导航、筛选、可选择表格、定义详情、移动记录卡、分页和审批决策。C 端新增的 `consumer-navigation / discovery-card / media-gallery / price-summary / rating-summary / step-progress` 均为 `contract-only`，可进入 Composition Kit，但不会进入 React runtime barrel 或生成包。具体组件选择顺序和相邻边界见 `references/component-family-boundaries.md`。项目采用其他框架时，保留 Manifest、Token 和行为契约，通过该框架的 adapter 映射，不得声称已有 Vue/Svelte 实现。

使用顺序：

1. 先从页面模板或 Composition Kit 确定场景。
2. 再用 `component-manifest.json` 选组件族。
3. 需要可视化对齐时打开 `component-library.html`，确认真实组件、色卡、密度和状态。
4. 最后回到本文件确认状态、可访问性和反模式。

涉及选择控件、覆盖层、动作菜单、Dialog、InlineNotice 或 Toast 时，必须同时读取 `references/component-family-boundaries.md`，不能只根据组件名称或视觉相似度选择。

如果项目已有共享组件，以项目组件为准；本文件提供默认语义和补齐清单。

## 外部组件库参考

可以参考 Astryx、Material、Fluent、Carbon、Radix、shadcn/ui 的组件族和可访问性实践，但不能默认替换部门组件。

规则：

- 吸收组件分类、状态覆盖、页面模板和反模式，不直接吸收视觉风格。
- 具体项目若采用外部组件库，必须读取 `references/external-component-adoption.md`。
- 外部组件应通过项目 wrapper/adapter 暴露部门语义组件，例如 `DataTable`、`AppFrame`、`AgentEventRow`。
- 不要猜外部组件 props；先查项目安装版本对应文档或类型定义。

## 历史项目提炼

`component-manifest.json` 的 `project_extractions` 记录已验证项目中的可复用实现证据。当前 `dy-data-admin-controls` 从抖音结算中心提炼：

- `SelectField`：自定义触发器与菜单表面的单选、禁用选项、字段错误关联和完整键盘行为；已进入默认运行时。
- `MultiSelectField`：listbox 状态、方向键、Home/End、Enter/Space、Escape、禁用选项、已选摘要和逐项移除；已进入默认运行时。
- `SearchableSelect / Combobox`：过滤、`aria-activedescendant`、空结果、失焦恢复与选中值同步；已进入默认运行时。
- `FilterBar / FilterField`：响应式筛选网格、compact、重置和动作区；`FilterBar` 已进入默认运行时。
- `MetricCard / TooltipLabel`：口径说明、明确详情入口、`aria-busy` 和稳定骨架；已进入默认运行时并复用 Tooltip 家族。
- `DefinitionList`：`dl/dt/dd` 字段口径结构；已进入默认运行时。
- `TertiaryNav`：`aria-current`、禁用项与窄屏横向滚动；已进入默认运行时。

提炼只保留通用结构、状态、键盘和可访问性契约。业务类型、结算文案、项目路由和旧品牌色不能进入通用组件；视觉必须重新绑定设计顾问 token。当前只有 Manifest 标记的 23 个 `runtime-ready` 家族可直接使用，其余项目仍按场景契约或外部适配处理，不能按同等完成度表述。

### 视觉工艺提炼

dy-data 还提供了一组可迁移的视觉工艺。它们必须映射到设计顾问的语义 token，不能复制项目橙色、业务色或页面级硬编码：

- 表面分为页面、卡片、弱强调区域、表头和悬停五类，分别使用 `--background`、`--surface`、`--surface-subtle`、`--surface-table-head` 和 `--surface-hover`。不要用同一种浅重点色铺满所有区域。
- 禁用态使用 `--disabled-bg` 与 `--disabled-text`。禁止只降低重点色按钮的整体透明度，因为这会让品牌色和文字同时失去可读性。
- 高度分为卡片、浮层和对话框三档，分别使用 `--shadow-card`、`--shadow-popover` 与 `--shadow-dialog`。阴影只表达层级，不作为装饰。
- 桌面表单控件以 38px 为基线；触摸场景不得低于 44px。紧凑数据表正文以 13px 和约 44px 行高为基线，表头必须与普通卡片表面可区分。
- 常规卡片圆角不超过 8px。指标卡不使用位移式悬停；可点击时只通过边框、背景和阴影变化表达。
- 状态提示保留中性完整边框，以左侧语义色标记类型；不能把整块边框、图标和正文全部染成高饱和状态色。

这些规则只提升组件的结构精度，不改变 Harbor Blue、Coral Office 或项目客制色卡的色彩语义。

## 基础组件

### Button

类型：

- Primary：页面唯一主操作。
- Secondary：次级操作。
- Ghost：低强调操作。
- Danger：删除、撤销、不可逆操作。
- Icon：只放图标时必须有可访问名称。

状态必须包含：

- default
- hover
- active
- focus-visible
- disabled
- loading

规则：

- 按钮文案必须具体，例如“保存规则”，不要只写“继续”。
- 桌面端按钮文字不能换行。
- icon-only 按钮必须有 `aria-label`。
- danger 操作需要确认或撤销机制。
- active 状态可使用 `transform: scale(0.98)` 或 `translateY(1px)`。

Button 组件族应拆清：

- `Button`：有文字的动作。
- `IconButton`：只有图标的动作，必须有 `aria-label` 或等价名称。
- `ButtonGroup`：同一语义的一组操作，尺寸和间距一致。
- `DangerButton`：删除、重置、断开连接等危险操作，必须配确认或撤销。

### Input / Select / Textarea

规则：

- 必须有 label 或明确的 `aria-label`。
- 错误信息放在字段旁边，不只用 toast。
- 邮箱、手机号、数字要使用正确 `type` 和 `inputmode`。
- 不要禁用粘贴。
- loading/disabled 状态要让用户知道原因。

Field 组件族建议：

- `FieldShell`：统一 label、helper、error、meta。
- `SelectField`：已实现；使用成熟交互原语管理隐藏表单值、触发器、菜单、placeholder、disabled、error 和字段关系。
- `SearchableSelect`：已实现；选项较多且需要过滤时使用，由成熟无样式交互原语负责 combobox 键盘和焦点语义。
- `MultiSelectField`：已实现；适合受控选项集合的多项选择，提供计数、逐项移除、禁用项、错误关系和 listbox 键盘行为。
- 错误信息使用 `role="alert"`，并通过 `aria-describedby` 关联。

选择控件规则：

- 固定少量选项优先 `SelectField`；已有成熟视觉系统明确保留原生 `select` 时，才通过 adoption adapter 延续原实现。
- `SelectField` 的可见部分使用自定义触发器与菜单，表单提交值、标签关系、方向键、Enter/Space、Escape 和焦点恢复由 React Aria 管理，不自行拼接 ARIA 状态。
- `SelectField`、`SearchableSelect` 与 `MultiSelectField` 共用 38px 高、6px 圆角、边界、焦点环、浮层阴影、选项高亮和禁用态。菜单项有辅助说明时保持“名称在上、说明在下”，选中状态必须同时使用颜色与勾选图标。
- 下拉、清除、加载和选中图标使用项目注册的图标库；设计顾问 React 运行时默认使用 Lucide。不得使用字符箭头、CSS 边框画图标或浏览器原生箭头作为规范示例。
- `MultiSelectField` 触发器必须声明 `aria-haspopup="listbox"`、`aria-expanded` 和受控菜单 id；菜单支持 ArrowUp/ArrowDown、Home、End、Enter/Space 和 Escape，关闭后焦点返回触发器。
- 选项较长或超过快速扫描范围时升级为 `SearchableSelect`，输入框使用 `role="combobox"`、`aria-controls` 和 `aria-activedescendant`。
- 搜索无结果、异步加载、接口错误和失焦恢复必须分别定义，不能只保留一个空白菜单。

### Table

适用于高密度数据。默认规则：

- 表头固定时要处理横向滚动和移动端。
- 数字右对齐并使用 tabular nums。
- 长文本要截断或换行策略明确。
- 空表格显示空状态，不要只显示空白。
- 筛选、排序、分页状态应进入 URL 或可恢复状态。

DataTable 组件族建议：

- `DataTable`：统一列定义、empty/loading/error、sticky header/column。
- `MobileRecordCard`：已实现的移动端宽表替代视图；保留字段标签、状态、选择和行操作，并与桌面表格共享同一业务状态。
- `TablePagination`：范围、每页条数、页码输入、跳转校验。
- `RowAction`：表格内轻量动作，icon-only 必须有名称。
- `FilterBar`：字段标签、响应式布局、提交/重置和 dirty 状态的统一组合。
- `MetricCard`：已实现；用于少量关键指标，分开表达数值、单位、口径、时间范围、明确详情入口和 loading skeleton。
- `DefinitionList`：字段定义、规则口径和接口说明，不代替可编辑表单或高密度表格。

规则：

- 业务页不直接写 `<table>`，除非项目没有共享表格组件。
- 表格 loading skeleton 应匹配最终行结构。
- 分页输入只接受 1 到总页数之间的正整数。
- 同一结果集在桌面使用 `DataTable`、移动端使用 `MobileRecordCard` 时，筛选、选择、分页和当前详情必须来自同一状态源；禁止维护两套互相漂移的数据与选中状态。

### Card

卡片只在需要分组或层级时使用。不要把页面每个区块都套成卡片。

适合：

- 指标卡。
- 独立对象。
- 可点击集合项。
- 弹窗内局部分组。

不适合：

- 页面大区块外层。
- 已经有表格边框的内容。
- 只是为了“好看”的重复包裹。

### Modal / Drawer

Modal 用于阻塞决策，Drawer 用于保持上下文的侧向编辑或详情。

必须包含：

- 标题。
- 关闭方式。
- 焦点管理。
- Esc 关闭。
- 背景滚动锁定。
- 表单未保存提醒。

Dialog 组件族建议：

- `Dialog`：普通阻塞信息或表单。
- `ConfirmDialog`：危险、批量、不可逆、权限改变。
- `WorkbenchModal`：复杂任务工作台，不是普通弹窗的默认尺寸。

所有 Dialog 都要统一 focus trap、Escape close、return focus、background inert。

### Tabs

适合在同一对象下切换平级视图。不适合替代主导航。

规则：

- 当前 tab 状态清楚。
- 键盘可访问。
- 若 tab 影响可分享状态，应同步到 URL。
- 由页面路由驱动的稳定子视图使用 `TertiaryNav` 和 `aria-current="page"`；纯客户端 tab 使用 `tablist/tab/tabpanel`，不要混用两套语义。
- 明暗模式、色卡和密度这类有限互斥设置使用 segmented control，不占用页面导航层级。

### Empty / Loading / Error

每个业务模块都要有三态：

- Empty：说明为什么为空，以及下一步。
- Loading：骨架屏优先于普通 spinner。
- Error：说明问题和修复路径。

错误信息模板：

```text
未能保存规则。请检查网络后重试，或复制当前配置联系管理员。
```

资源状态组件建议：

- `ResourceNotice`：靠近触发区域的 loading/error/fallback 提示。
- `ResourcePanel`：内容区 empty/loading/error/permission denied。
- 异步更新使用 `role=status` 或 `role=alert`。
- 错误文案必须包含恢复路径。

### Badge / Tag

用于状态或分类，不用于装饰。

状态色必须稳定：

- success：完成、启用、通过。
- warning：待处理、需确认。
- danger：失败、禁用、风险。
- info：同步中、说明性状态。

Badge 不要混用：

- `StatusBadge`：业务状态。
- `CountPill`：数量。
- `FilterChip`：已选筛选，可清除。
- `RoleBadge`：角色或权限范围。
- `CodeToken`：代码、命令、路径。

不要用同一个 chip 样式表达所有东西。

## Agent / 过程型元组件

适用于 AI、自动化、审批、工具调用和同步等过程界面：

- `EventRow`：低强调事件行，承载工具调用、后台记录、同步日志。
- `RunningSurface`：单行运行中状态，低幅度动效，支持 reduced motion。
- `FileTypeIcon`：Markdown、Canvas、HTML、代码、普通文件。
- `ControlButtonGroup`：模型、权限、上下文、Skill、搜索、刷新、设置。
- `ApprovalPanel`：唯一强提醒入口，通常占用输入区或相关表单区域。

规则：

- 工具调用不要做成重卡片。
- 审批不要在多个区域重复强提醒。
- 产物、Diff、同步冲突文件行复用同一文件类型图标。
- Skill 展示用技能名，不显示 `Skill /xxx`，除非是用户原始命令输入。

## 页面结构

默认后台页面结构：

1. 页面标题区：标题、说明、主操作。
2. 筛选区：搜索、筛选、批量操作。
3. 内容区：表格、卡片列表、详情。
4. 辅助区：分页、状态、说明。

不要把功能说明写成大篇营销文案。后台用户要快速完成任务。

更多页面模板见 `references/page-templates.md`。

## 响应式

- 移动端优先保证信息不重叠。
- 表格可横向滚动，但关键列要固定或提供卡片视图。
- 导航、筛选、批量操作在窄屏要折叠。
- 不使用 `h-screen` 做移动端满屏布局，优先 `min-height: 100dvh`。

## 工程守门

当项目已有共享组件时，默认禁止：

- 业务页直接写散落颜色。
- 业务页直接导入图标库，绕过统一图标入口。
- 业务页直接写 `<table>`、`<select>`、`role="dialog"`。
- 使用 `div/span onClick` 扮演按钮。
- 新增 CSS var 引用但未定义。

需要检查时读取 `references/design-system-enforcement.md`。
