---
name: design-consultant
description: Use this skill when entering frontend design or UI implementation requiring a project-local visual system, product or UI decisions, consumer products and conversion journeys, UI/UX review, DESIGN.md or tokens, brand-logo or attribution placement, reusable components, dashboards, plugins, Agent UIs, governed charts, Composition Kit, HTML preview decisions, or external component-library adoption. It can scaffold, extract, and safely update a design-system folder, then route between default visual baseline, customization, project design-system, consumer product and growth overlays, brand attribution, host-native UI, Agent process UI, data visualization, UX review, component adoption, and engineering enforcement. Do not use for pure backend, data processing, copy editing, or bug fixes unless a design, visualization, or UI review decision is requested.
---

# 设计顾问 Skill

这是一个组合式设计 skill。它的首要目标是：当项目进入前端设计或 UI 实现时，快速在项目本地建立 `design-system/` 视觉系统目录，把设计决策、token、组件契约、预览、检查与 AI 规则固化为后续实现的事实来源。在此基础上，它再判断客制化投入，调用通用视觉基线、低成本客制化、宿主环境规范或完整项目设计系统。

## 工作原则

1. 先确认是否进入正式前端设计。进入后默认建立项目本地视觉系统；纯讨论、一次性预览或用户明确禁止改文件时除外。
2. 先判断，再客制化。`default / customize / design-system` 决定设计深度，不决定是否需要本地事实来源。
3. 默认使用通用视觉基线，除非有明确理由升级；客制化只开放少量高杠杆项。
4. 核心规则必须使用本 skill 本地 reference，不在运行时依赖远程拉取。
5. 设计系统不是口头约定。必须同时考虑 token 单一事实源、预览、运行时绑定、组件入口、AI 规则、产品验收场景和检查脚本。
6. 页面、流程或前端实现建议先产出 `Composition Kit`，并为可验证承诺分配稳定 ID，再进入具体组件或代码。
7. 外部组件库可以吸收机制、组件分类和工程方法，但不能默认成为本 skill 的运行时依赖。
8. 如果建议涉及页面布局、交互流程、视觉方向或多状态体验，主动判断是否需要询问用户做 HTML 预览，但 HTML 预览只是横向决策，不是主模式。
9. 历史项目经验只有在用户确认后才能写入 `ux-review-checklist.md`。
10. 图表先定分析问题、数据粒度、单位和分母，再从真实 catalog 选 preset；颜色、交互和动效必须受本地 token、模板谱系与真实性契约约束，运行时依赖固定在项目本地。
11. default 模式使用 Editorial Utility 与 Harbor Blue 共同基线：浅色为默认，Coral Office 和深色模式必须由用户或项目需求明确选择；`inverse` 导航只用于密集技术、监控或沉浸式场景。组件、图表及所有主题变体必须共用语义 token，不得各自维护独立皮肤。
12. 在运行任何脚手架前先判定项目路由：`greenfield`、`existing-ui-without-system` 或 `existing-design-system`。只要存在成体系的 token（coherent tokens）或共享组件（shared components），必须先读取 `references/existing-system-adoption.md`，执行事实提取，再决定 `preserve / augment / migrate`；绝不自动迁移。
13. 品牌署名默认纳入项目级组件能力，但按两个就绪门槛延后介入：视觉系统确认前不得展示或讨论 `BrandAttribution`，不得询问其位置、颜色、材质或重点色，也不得让默认品牌蓝参与色板决策；此时只记录 `status="deferred"`。视觉系统基本确认后，读取背景明度、系统重点色、明暗模式和界面密度，只给一个署名样式首选与一个安全 fallback；默认品牌方案的 AI 独立色为 `#3D63FF`，但只能在此阶段之后推荐。产品形态、Shell / 导航和主要页面清单基本确认后，再推荐桌面、移动、认证 / 授权位置及响应式迁移。用户确认后统一写入项目 `system.config.json`、`DESIGN.md` 与 token，业务页面不得散传配置。六张辅助字形蒙版以企业原素材为结构来源，当前正式版本使用已经审批的平滑轮廓，不得改用 UI 字体或自行重绘。完整状态机、正式灰阶、材质、重点色、资产完整性和落位规则见 `references/brand-attribution-placement.md`。
14. C 端设计使用 `consumer-product` 与 `growth-conversion` 横向模式补充 Composition Kit，不取代主模式。营销信号不等于需要完整品牌设计系统；仍按项目状态、品牌证据和维护成本选择设计深度。
15. 用户明确要求真实页面、可运行原型或 S2 页面交付时，读取 `references/page-production-contract.md` 并维护通用 Page Delivery Manifest；`startCommand` 只记录建议，不由本 skill 执行。
16. 页面设计、实现守门与产品验收都必须读取 `references/user-facing-content-boundary.md`：内部字段、raw enum、调试值和工程文案不得直接进入用户可见内容，必须经过展示映射、格式化与安全 fallback。

## 快速路由

根据用户任务选择最小必要模块：

| 用户意图 | 读取文件 | 输出 |
|---|---|---|
| 项目有成体系 token、共享组件或主题机制 | `references/existing-system-adoption.md`, `references/project-visual-system-workflow.md` | 事实报告、draft plan 与待确认的 preserve/augment/migrate 建议 |
| 开始前端设计或 UI 实现 | `references/project-visual-system-workflow.md`, `scripts/manage-visual-system.mjs` | 项目本地 `design-system/` 与执行结果 |
| 新产品/新页面定义 | `references/brand-necessity-rubric.md`, `references/design-routing.md`, `references/design-system-intake.md` | 设计投入分级与下一步建议 |
| C 端产品定义、关键旅程或移动体验 | `references/consumer-product-routing.md`, `templates/consumer-product-manifest.json`, `references/consumer-ux-contract.md` | 一个主产品类型、最多两个叠加类型、旅程与体验风险 |
| C 端页面结构与状态设计 | `references/consumer-page-templates.md`, `references/consumer-ux-contract.md`, `references/page-templates.md` | 补全 C 端字段的 Composition Kit 与验收承诺 |
| 用户可见数据与文案边界 | `references/user-facing-content-boundary.md`, `references/design-system-enforcement.md`, `scripts/check-ui-contract.mjs`, `scripts/product-acceptance.mjs` | 展示映射、工程文案阻断、静态证据与真实页面验收 |
| 真实页面、可运行原型或 S2 页面交付 | `references/page-production-contract.md`, `templates/page-delivery-manifest.schema.json`, `scripts/page-delivery-contract.mjs` | 真实页面文件、外部预览地址、验证证据与通用交付清单 |
| 获客、落地页、定价、候补或 App 下载 | `references/growth-conversion-patterns.md`, `references/consumer-ux-contract.md` | 证据、主次 CTA、移动退化和反暗黑模式约束 |
| 页面/流程/前端建议需要组合式落地 | `references/agent-operating-contract.md`, `references/page-templates.md`, `references/component-kit-selection.md`, `references/component-family-boundaries.md`, `templates/component-manifest.json` | Composition Kit 与项目组件 ID 清单 |
| 需要浏览或呈现现有组件库 | `references/component-system.md`, `templates/component-manifest.json`, `templates/component-library.html` | 分组组件库索引或可打开的 HTML 预览 |
| 图表、仪表盘或数据可视化 | `references/data-visualization-module.md`, `references/visualization-copy-guidelines.md`, `templates/visualization-manifest.json`, 必要时 `templates/component-library.html#visualization/lupi` | 基于 48 个真实 preset 的中文 Visualization Kit 与页内可交互预览 |
| 没必要做独立设计规范 | `references/default-visual-system.md`, `references/component-system.md`, `references/project-visual-system-workflow.md` | 基于默认规范的项目本地视觉系统 |
| 需要轻客制化 | `references/customization-playbook.md`, `references/default-visual-system.md`, `references/project-visual-system-workflow.md` | 低成本客制化的项目本地视觉系统 |
| 需要项目级规范 | `references/design-system-intake.md`, `references/project-visual-system-workflow.md`, `templates/DESIGN.md`, `templates/tokens.json`, `templates/tokens.schema.json` | 完整项目视觉系统草案 |
| 主品牌 Logo、`Powered by` 或技术署名需要定义位置 | `references/brand-attribution-placement.md`, `templates/component-library.html#brand-attribution`, `templates/DESIGN.md`, `templates/project-design-agent-rules.md` | 可视化落位示例、主品牌与署名分层、桌面 / 移动 / 独立流程落位图及守门项 |
| 嵌入宿主产品 | `references/host-native-ui.md`, `references/component-system.md` | 宿主原生优先的 UI 规则 |
| AI/Agent 过程界面 | `references/agent-process-ui.md`, `references/component-system.md` | 过程、审批、工具调用、产物的信息语法 |
| 需要页面模板 | `references/page-templates.md`, `references/default-visual-system.md` | 页面结构和组件组合建议 |
| 讨论 Astryx 或外部组件库能否吸收 | `references/external-component-adoption.md`, `templates/component-manifest.json`, 必要时 `templates/astryx-component-map.json` | 吸收层级、适配边界、全量组件映射和采用条件 |
| 需要项目级 AI 规则 | `templates/project-design-agent-rules.md`, `references/design-system-enforcement.md` | 可复制到项目的 agent 设计规则 |
| 需要工程守门 | `references/design-system-enforcement.md`, `scripts/sync-tokens.mjs`, `scripts/check-component-runtime.mjs`, `scripts/check-ui-contract.mjs`, `scripts/build-component-catalog.mjs`, `scripts/visual-regression.mjs`, `scripts/product-acceptance.mjs`, `scripts/verify-project.mjs` | 跨平台契约、产品场景与一键最终验收 |
| 做 UI/UX 核查 | `references/ux-review-checklist.md`, 必要时 `references/motion-polish.md` | 按严重度排序的问题清单 |
| 前端/交互建议不够直观 | `references/html-preview-playbook.md` | 询问是否生成 HTML 预览 |
| 避免 AI 模板感 | `references/anti-slop-rules.md` | 反模板设计约束 |

## 主流程：固化项目视觉系统

用户开始前端设计、页面实现或共享组件建设时，先读取 `references/project-visual-system-workflow.md`，然后：

1. 检查项目技术栈、已有样式、共享组件和工作区状态，判定 `greenfield / existing-ui-without-system / existing-design-system`。
2. 命中成体系 token、共享组件、主题机制或设计资产时，先读取 `references/existing-system-adoption.md`；不得直接初始化平行系统。
3. 用品牌必要性量表选择 `default / customize / design-system`。它描述设计投入，不替代项目路由。
4. 先从全量 Library 形成 Composition Kit，读取真实 family id；新项目优先使用精确 `--components`，档位完全匹配时才用 `--kit-profile`。
5. 首次执行脚手架前先使用带相同组件选择的 `--dry-run`，确认输出目录、最终 Kit、依赖补齐项和冲突。
6. `greenfield` 使用相同组件选择执行 `init`；其余两类先执行 `extract`。`extract` 只生成事实报告和 draft plan，不生成默认运行时。
7. 既有系统只有在用户确认 adoption plan 后才能执行 `adopt`；`migrate` 也不得自动改写业务代码。
8. 完善生成的 `DESIGN.md` 与 `system.config.json`，明确已确认项、草案项、token 导入和组件入口。
9. greenfield 只编辑 `tokens/tokens.json`；既有系统以现有 token 为上游事实源，经 bridge 接入 canonical runtime。Catalog 只消费 canonical runtime + bridge。
10. 把 Composition Kit 中已承诺的主流程、键盘、未保存提醒、状态、响应式行为和用户可见内容边界登记到 `checks/product-commitments.json`；同一稳定 ID 必须记录实现状态、代码位置和 Playwright 场景 ID，场景实现放在 `checks/product-acceptance.config.mjs`。必选承诺仍为 `planned / in-progress`、缺少有效代码锚点、缺少场景，或未提供审批信息却标为 `waived` 时，最终验收必须失败。
11. 开发中可执行 `npm run verify:system`；正式前端交付必须在生成的 `design-system/` 中执行 `npm run verify`。全量包校验 Catalog 与视觉基线；按需 Kit 校验 `kit.json`、Manifest、运行时与业务承诺。任一必需脚本、场景或检查失败都不得声称完成。

默认命令：

```powershell
node <skill-path>/scripts/manage-visual-system.mjs init --target <project-path> --mode default --components <family-id,...> --dry-run
node <skill-path>/scripts/manage-visual-system.mjs init --target <project-path> --mode default --components <family-id,...>
```

如果用户只在讨论产品定义，尚未进入前端阶段，可以先完成判断而不写文件；一旦用户确认开始实现，就进入上述主流程。

## 第一步：判断客制化深度

当用户在定义产品、页面、后台、报表、仪表盘、营销页、工具或工作流时，先用 `references/brand-necessity-rubric.md` 判断：

- `default`：在项目本地固化通用视觉基线。
- `customize`：在同一目录契约内基于默认系统做轻客制化。
- `design-system`：在同一目录契约内完成完整 intake、品牌与组件决策。

同时判断是否命中横向场景：

- `host-native`：嵌入 Obsidian、VS Code、浏览器插件、企业套件或第三方平台，优先像宿主产品。
- `admin-data-workspace`：高密度后台、筛选、分页、长表、批量操作，优先工作台模板。
- `agent-process-ui`：助手、审批、工具调用、过程展开、产物、同步冲突等 Agent 型界面，优先信息语法。
- `data-visualization`：图表、仪表盘和分析界面，先完成分析契约与 preset 选型，再沿用真实模板的渲染、交互和动效。
- `consumer-product`：面向普通用户的发现、内容、交易、预约、订阅、账户或设备任务，选择一个主产品类型并补齐 C 端旅程和状态。
- `growth-conversion`：获客、产品演示、社会证明、定价、留资、发布下载、目录或沉浸叙事，补齐证据、CTA 和反暗黑模式约束。
- `composition_kit`：页面、流程或前端实现建议需要组合包，先定 page template、blocks、component families、states 和守门项。
- `preview_decision`：是否需要 HTML 预览辅助对齐。
- `enforcement`：是否需要 token、组件入口、静态检查和回归测试。

输出时说明判断依据，不要只给结论。

## 第二步：选择执行模式

### default 模式

适用于内部工具、临时报表、数据后台、低品牌曝光页面。读取：

- `references/default-visual-system.md`
- `references/component-system.md`
- `references/component-family-boundaries.md`

进入正式前端设计时，先读取 `references/component-kit-selection.md`，再执行带 `--components` 的 `manage-visual-system.mjs init --mode default`。不要因为“不需要独立品牌”而省略本地视觉系统，也不要把全量 Library 复制进业务项目。

### customize 模式

适用于长期使用、有业务线气质、需要避免模板感但不值得完整品牌设计的产品。读取：

- `references/customization-playbook.md`
- `references/default-visual-system.md`
- 必要时 `references/anti-slop-rules.md`

新项目执行带 `--components` 的 `manage-visual-system.mjs init --mode customize`；已有 UI 项目执行 `extract`。只允许从少量杠杆改动：主色、密度、圆角、字体策略、视觉强度、场景模板。不要重新发明完整系统。

### design-system 模式

适用于外部产品、品牌触点、长期平台、多团队协作、演示招商、销售展示、复用页面很多的项目。读取：

- `references/design-system-intake.md`
- `references/brand-attribution-placement.md`
- `references/agent-operating-contract.md`
- `templates/DESIGN.md`
- `templates/tokens.json`
- `templates/tokens.schema.json`
- `templates/component-manifest.json`
- `references/component-kit-selection.md`
- `references/component-family-boundaries.md`
- `templates/component-library.html`
- 必要时 `templates/astryx-component-map.json`
- `templates/project-design-agent-rules.md`
- `references/customization-playbook.md`
- `references/component-system.md`
- `references/design-system-enforcement.md`
- `references/external-component-adoption.md`
- `references/html-preview-playbook.md`
- `references/data-visualization-module.md`
- `references/visualization-copy-guidelines.md`
- `templates/visualization-manifest.json`
- `vendor/lieflat-charts/catalog.md`

新项目先执行带 `--components` 的 `manage-visual-system.mjs init --mode design-system`；已有 UI 项目执行 `extract`。资料不足时，生成的文件必须保持 `draft`，并列出待补信息，不要最终确定 token。资料足够时，完善项目级 `DESIGN.md`、token、组件候选、运行时接入和工程守门，并判断是否生成 HTML 预览。

### review 模式

适用于“审一下 UI”“检查体验”“这个页面有没有问题”“做 UX review”。读取：

- `references/ux-review-checklist.md`
- `references/motion-polish.md`
- 必要时 `references/anti-slop-rules.md`

问题按严重度排序，优先指出会影响完成任务、可访问性、数据理解、响应式和状态完整性的缺陷。

### host-native 横向模式

适用于嵌入宿主产品的插件、扩展和内嵌工具。读取：

- `references/host-native-ui.md`
- 必要时 `references/component-system.md`

先遵守宿主环境的主题、密度、控件和 CSS 变量。品牌只作为身份信号，不做全局皮肤。

### agent-process-ui 横向模式

适用于 AI 助手、自动化过程、审批、工具调用、Task Bar、产物和同步冲突等界面。读取：

- `references/agent-process-ui.md`
- `references/component-system.md`

把正文、过程、工具调用、审批和产物放进统一信息语法。不要把所有内容都做成重卡片。

### enforcement 横向模式

适用于要把设计规范落到工程里的任务。读取：

- `references/design-system-enforcement.md`
- `scripts/sync-tokens.mjs`
- `scripts/check-component-runtime.mjs`
- `scripts/check-ui-contract.mjs`
- `scripts/build-component-catalog.mjs`
- `scripts/visual-regression.mjs`
- `scripts/check-visualization-module.mjs`

优先检查 Token 三类生成产物是否同步、组件 Manifest 与 export 是否一致、业务代码是否绕过共享组件、Catalog bundle 是否漂移、关键配色是否达到 AA、用户可见内容是否泄漏内部值或工程文案、可视化契约与本地运行时是否完整，以及四类视口下是否通过视觉和交互回归。正式交付只认 `npm run verify` 的完整结果，不能用其中某几项通过替代产品场景验收。PowerShell 检查仅作为兼容入口，跨平台 CI 以 Node 守门为准。

### composition_kit 横向流程

适用于页面、流程和前端实现建议。读取：

- `references/agent-operating-contract.md`
- `references/page-templates.md`
- `references/component-kit-selection.md`
- `references/component-family-boundaries.md`
- `templates/component-manifest.json`
- 用户要求“看现有组件库”“组件库分组预览”时读取或交付 `templates/component-library.html`

先输出 route、page template、frame、blocks、component families、states、responsive contract、HTML preview decision、enforcement 和带稳定 ID 的 acceptance commitments。进入实现后，把这些 ID 原样登记到 `checks/product-commitments.json`，再把对应场景写入 `checks/product-acceptance.config.mjs`；不适用的行为不要虚构承诺，已经承诺的行为不能只靠人工描述验收。

选择组件时必须先读取 `templates/component-manifest.json` 的 `availability`：`runtime-ready` 才能从统一入口直接 import；`evidence-only` 只能作为移植依据；`contract-only` 只能作为设计与验收契约；`external-required` 必须使用清单批准的成熟 adapter，禁止手写近似实现。默认 React 运行时已提供 `SearchableSelect` 与 `MultiSelectField`，业务页不得直接拼装只有 combobox/listbox 外观、却缺少完整键盘和活动项管理的半成品。

Composition Kit 确认后，把其中实际使用的 family id 作为 `--components` 参数写入项目。Skill 保留 33 个 family 的全量 Library，其中 23 个为 `runtime-ready`、可按需生成运行时；其余 family 必须遵守 Manifest 的 `contract-only / external-required` 边界。项目 `components/kit.json`、裁剪后的 Manifest 和运行时只保留最终选择及依赖。选择 Checkbox/Radio/Switch/Select/MultiSelect、Tooltip/Popover/ActionMenu/Dialog、InlineNotice/Toast，或决定桌面 `DataTable` 的移动端承载方式前，先读取 `references/component-family-boundaries.md`。裸 `init` 的 `full / legacy-full` 只用于旧项目兼容或明确的 Library 维护任务。

如果页面包含图表，在 Composition Kit 后追加 `Visualization Kit`，不要把图型名称直接当作需求。

### data-visualization 横向模式

适用于图表、仪表盘、经营分析、数据报告、趋势、排行、构成、分布、关系、流向和 cohort 界面。读取：

- `references/data-visualization-module.md`
- `templates/visualization-manifest.json`
- 需要浏览全部实现时打开 `templates/component-library.html#visualization/lupi`，通过可视化二级菜单切换 6 套体系
- 锁定 preset 后读取 `vendor/lieflat-charts/catalog.md` 和对应 `templates/visualization-lieflat/*.html`
- 需要按上游方法生成单图时读取 `vendor/lieflat-charts/SKILL.md`

先输出 analytical question、takeaway、grain、unit 和 denominator，再按 Lupi Editorial、Lupi Basics、Glance 的顺序审计真实 preset。至少比较 3 个候选，锁定 preset id、system、source template 和 source card title 后，直接沿用对应模板的几何、数据编码、交互与动效，只替换数据和文案；展示标题、图例、坐标、tooltip 与交互提示默认使用自然中文，不照搬上游英文隐喻。字体、表面与圆角回到 Editorial Utility 共同 token，真实数据使用当前色卡的同源重点色色阶，面积填充使用对应 flat area token，网格、轴线、日历发丝线、辅助连接与基准线必须保持中性。移动端保持图表信息尺度并在图形容器内浏览，运行时只读固定本地依赖。精确查数仍优先数据表。

### external-component-adoption 横向模式

适用于用户询问 Astryx、Material、Fluent、Carbon、Radix、shadcn/ui 等外部组件库是否能吸收。读取：

- `references/external-component-adoption.md`
- `templates/component-manifest.json`
- 用户要求“把 Astryx 组件映射过来”时读取 `templates/astryx-component-map.json`

默认结论是：可以吸收原则、组件分类、文档机制和工程方法；代码层只能在具体项目明确选择时通过 adapter/wrapper 接入，不作为部门 skill 默认依赖。

### preview_decision 横向模式

当文字解释不足以对齐理解时，读取 `references/html-preview-playbook.md`。先判断是否值得预览，再询问用户是否要做 HTML 预览。不要每次都问。

## HTML 预览触发规则

主动询问用户是否做 HTML 预览的场景：

- 有页面布局、导航结构、信息架构或多区块组合。
- 有多个状态：空状态、加载、错误、提交成功、权限不足。
- 有两个以上设计方案需要比较。
- 有两个以上图型候选，或需要对齐 hover、固定、筛选、重播等可视化交互。
- 用户在讨论视觉风格、组件样式、交互路径。
- 文字说明可能导致理解偏差。

不需要询问的场景：

- 只是改文案。
- 只是解释原则。
- 只是轻量代码修复。
- 用户明确说先不要做视觉稿或预览。

询问方式：

```text
这里建议做一个单文件 HTML 预览，因为需要对齐[布局/状态/方案比较]。要我先做预览，还是先继续文字方案？
```

## 输出风格

- 默认使用中文。
- 先给结论，再给依据。
- 如果要问用户，只问一个最关键的问题。
- 涉及页面、流程或前端实现时，先给 `Composition Kit`，再给细节。
- 不使用空泛审美词。把“高级、好看、现代”落到字体、间距、信息密度、组件状态和业务语境。
- 如果规则来自本 skill 的本地 reference，可以直接执行；如果要加入新的历史项目经验，先向用户列出拟加入内容，得到确认后再写入。

## 交付边界

这个 skill 负责初始化和维护项目本地视觉系统，并提供设计判断、默认规范、客制化方法、既有系统接入、宿主环境规则、Agent UI 信息语法、数据可视化选型与真实模板运行时、UX 核查、HTML 预览决策和工程守门。当前发布版 v0.11.1；为避免让既有项目无确认升级，生成目录、lock、CLI 与模板中的 `0.10.0` 仍表示兼容的设计系统契约版本，不是 Skill 发布版本。该契约为 React 既有系统提供 canonical runtime + bridge、adoption-specific package、`projectIdentity` 绑定、`fileClosure v3` 来源闭包、不可变 generation/current 视觉基线和 legacy ratchet；非 React 项目获得可独立安装的 core 检查包，但不得声称或生成 React adapter。`startCommand` 永远只是建议，目标服务必须由用户手工启动并通过 external baseUrl 接入；不存在任何执行它的 allow 开关。真实 v0.9 greenfield lock 必须经显式 `migrate-lock` 验证后才能进入兼容契约的 `update`。资料不足时必须保持 `draft`，不能伪装成最终设计系统。
