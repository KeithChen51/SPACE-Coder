# AI 操作链与 Composition Kit

本文件定义 AI 在产品定义、前端建议和 UI 实现前应该走的固定操作链。它吸收 Astryx 的“先找组合包、再看模板骨架、再查组件”的机制，但不绑定任何外部运行时。

## 使用时机

当任务包含以下任一内容时读取本文件：

- 新页面、新产品、新流程或新模块定义。
- 前端交互建议、页面结构建议、组件选型。
- 需要把设计规范落到代码里。
- 仪表盘、图表、数据报告或可视化交互建议。
- 用户要求“给我一个方案”“怎么设计”“前端怎么做”“要不要做 HTML 预览”。

纯后端、纯数据、纯文案、纯 bugfix 不走本操作链。

## 固定操作链

### 1. 一句话读取

先用一句话读任务，防止套用错误模板：

```text
我把这个任务理解为：[产品/页面类型]，面向[用户/角色]，核心目标是[业务目标]，当前适合走[default/customize/design-system/review]主模式，并命中[host-native/admin-data-workspace/agent-process-ui/data-visualization/preview_decision/enforcement]横向判断。
```

### 2. 路由到最小必要模式

读取 `references/design-routing.md` 和 `references/brand-necessity-rubric.md`，只选择必要模块。

默认不要升级为独特品牌设计系统。只有对外产品、长期平台、多团队协作、品牌触点或复用面很大时，才进入 `design-system`。这只决定客制化深度；正式前端实现仍需项目本地视觉系统。

### 3. 固化项目本地视觉系统

如果用户已经确认进入前端设计或实现，读取 `references/project-visual-system-workflow.md`：

1. 首次执行 `manage-visual-system.mjs` 前先 `--dry-run`。
2. 新项目先从 Composition Kit 提取真实 family id，按 `references/component-kit-selection.md` 使用 `--components` 执行 `init`；已有 UI 项目执行 `extract`。
3. 确认 `design-system/system.config.json` 中的 token 导入和共享组件入口。
4. 默认使用 Editorial Utility 与 Harbor Blue 视觉基线，AppFrame 使用浅色导航；`inverse` 导航必须由密集技术、监控或沉浸式场景触发。客制化只能改共享 token 和明确记录的设计决策，不能给组件与图表分别换皮。

如果仍处于纯产品讨论，或用户明确不要写文件，则先保留为建议，不初始化。

### 4. 输出 Composition Kit

如果任务涉及页面、流程或前端实现，先输出一个组合包，而不是直接写散乱建议。

```text
Composition Kit
- Route: [default/customize/design-system/review] + [横向模式]
- Page template: [后台列表页/明细数据工作台/客户门户/宿主插件设置页/Agent 输入区/助手输出流/...]
- Frame: [App shell/工作台/文档流/宿主原生设置页/移动端自然滚动]
- Blocks: [筛选栏/结果摘要/DataTable/分页/详情面板/审批区/产物列表/...]
- Component families: [Button/Field/DataTable/Dialog/Status/Agent meta/...]
- States: [loading/empty/error/success/disabled/permission denied/partial data]
- Responsive contract: [桌面/窄屏/移动端区域行为]
- Acceptance commitments: [稳定 kebab-case ID + 可观察结果；覆盖已承诺的主流程、键盘、未保存提醒、状态和响应式行为]
- HTML preview decision: [yes/no + reason]
- Enforcement: [token/CSS/shared component/icon/a11y checks]
- Visualization decision: [none / 需要 Visualization Kit]
- Open questions: [只列真正阻塞最终设计系统的资料]
```

### 5. 再查本地模板和组件

根据组合包读取：

- 页面模板：`references/page-templates.md`
- 组件规则：`references/component-system.md`
- 机器可读组件索引：`templates/component-manifest.json`
- Library 与项目 Kit 选择：`references/component-kit-selection.md`
- 默认视觉系统：`references/default-visual-system.md`
- 工程守门：`references/design-system-enforcement.md`
- 数据可视化：`references/data-visualization-module.md` 与 `templates/visualization-manifest.json`

如果已有项目代码，先检查现有组件入口和设计 token，再建议新增组件。不要在业务页绕过共享组件。

Composition Kit 的 `Component families` 必须同时给出 Manifest family id。进入 greenfield 实现时，把这些 ID 传给 `manage-visual-system.mjs --components`；项目内只生成依赖闭包后的 Kit，不复制 Skill 全量 Library。只有组合与预设完全一致时才使用 `--kit-profile`。

页面包含图表时，在 Composition Kit 后输出 `Visualization Kit`：明确 analytical question、takeaway、grain、unit、denominator、至少 3 个候选 preset、选中谱系、淘汰理由、数据替换、interaction、motion、palette、accessibility 和 QA。完整格式见 `references/data-visualization-module.md`。

### 6. 决定是否预览

读取 `references/html-preview-playbook.md`。当页面结构、多状态、方案比较或视觉方向难以用文字对齐时，询问是否做单文件 HTML 预览。

不要每次都问；纯原则解释、轻量 bugfix、纯文案不用问。

### 7. 进入实现前守门

如果要写代码或给前端交付，必须说明：

- token 来源在哪里。
- 是否已有运行时 CSS 变量入口。
- 使用哪些共享组件。
- 图表使用哪个 preset id、source template 和 `--viz-editorial-*` token。
- 统一 Catalog 中的组件区与可视化区是否共同读取 `tokens.css` 和 `catalog-foundation.css`。
- 哪些 raw HTML 禁止直接写。
- 是否需要补静态检查或回归测试。
- 哪些 Composition Kit 承诺要写入 `checks/product-commitments.json`，分别由哪个代码锚点和 Playwright 场景验收；场景实现写入 `checks/product-acceptance.config.mjs`。

进入实现后，Acceptance commitment 的 ID 是设计承诺、代码实现与真实产品验收之间的连接键。`checks/product-commitments.json` 是机器可读事实源，每条记录必须包含 `source / requirement / required / implementationStatus / codeRefs / scenarioIds / waiver`。必选项只有在 `implementationStatus=implemented`、代码锚点真实存在且至少绑定一个场景时才可交付；豁免必须写明原因和批准人。每个场景也必须归属于至少一条承诺。开发中可以只跑 `npm run verify:system`；只有生成目录中的 `npm run verify` 全部通过，才能把前端实现标记为完成。

### 组件可用性不是同一个概念

读取 `templates/component-manifest.json` 后，严格按 `availability` 行动：

- `runtime-ready`：已生成、已测试，可从统一 barrel 直接 import。
- `evidence-only`：存在历史项目实现证据，但尚未移植；只能作为提炼输入。
- `contract-only`：只有状态、可访问性和 token 契约；不得声称已有组件。
- `external-required`：交互复杂度要求成熟实现，只能通过清单批准的 adapter/wrapper 接入。

`SearchableSelect` 与 `MultiSelectField` 属于 `runtime-ready`，由共享组件封装成熟的无样式可访问性原语。业务页只能消费共享组件，不得直接 import 底层依赖，也不得自行拼装不完整 combobox/listbox。`MetricCard` 同样属于 `runtime-ready`，口径提示必须复用共享 Tooltip，不能在业务页新增另一套悬浮说明。

## 组件与 props 原则

不要猜组件 props。真实项目里：

1. 先读项目已有组件源码、类型定义或 Storybook/文档。
2. 再决定是否需要新增组件或适配外部组件。
3. 如果使用外部库，读取 `references/external-component-adoption.md`，明确是参考、适配还是依赖。

## 输出要求

- 先给路由结论，再给 Composition Kit。
- 如果资料不足，明确标注“草案”，不要最终确定 token。
- 对用户只问一个最关键问题。
- 不输出空泛审美词，把建议落到布局、组件、状态、token、响应式和守门项。
