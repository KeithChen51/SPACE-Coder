# 设计路由与工作模式

本文件负责把用户意图路由到正确的设计工作模式。它部分吸收了 `taste-skill` 的 brief inference、设计系统映射和反模板意识，但不照搬其适用边界。部门 skill 必须覆盖内部工具、后台、数据产品、营销页、报表和长期业务平台。

## 一句话设计读取

在进入具体建议前，先用一句话判断任务：

```text
我把这个任务理解为：[产品/页面类型]，面向[用户/角色]，核心目标是[业务目标]，当前适合走[default/customize/design-system/review]主模式，并命中[host-native/admin-data-workspace/agent-process-ui/data-visualization/preview_decision/enforcement]横向判断。
```

这句话不是形式感，它用于防止 AI 默认套用营销页、三卡片、紫色渐变、过度动效等模板。

## 读取信号

优先读取这些信号：

1. 产品类型：内部工具、数据后台、业务系统、报表、营销页、门户、移动端、演示页。
2. 使用者：一线员工、运营、管理者、客户、消费者、销售、合作伙伴、开发者。
3. 维护周期：一次性、短期活动、长期系统、多团队协作。
4. 曝光范围：内部、部门内、公司级、客户可见、公开传播。
5. 视觉诉求：可信、效率、品牌感、差异化、销售转化、数据密度。
6. 现有资产：Logo、品牌色、字体、历史页面、参考案例、禁止案例。
7. 风险约束：合规、可访问性、移动端、性能、国际化、暗色模式。
8. 宿主环境：是否嵌入 Obsidian、VS Code、浏览器插件、企业套件或第三方平台。
9. 过程界面：是否包含助手、审批、工具调用、运行中、产物或同步冲突。
10. 组件生态：项目是否已有共享组件、token、设计系统、外部 UI 库或必须遵守的官方生态。
11. 数据表达：是否需要趋势、比较、构成、分布、关系、流向或精确查数；数据粒度、单位和分母是否完整。

## 模式定义

以下模式决定客制化深度。项目一旦进入正式前端设计，继续读取 `references/project-visual-system-workflow.md`，把所选模式固化到项目本地 `design-system/`；不要把 `default` 理解为“无需本地规范”。

### default

在项目本地使用 Editorial Utility 通用视觉基线，不做独特品牌设计。默认 Harbor Blue 色卡以编辑式信息层级、浅色导航、冷灰蓝画布、海港蓝操作色、青色对照、细分隔线和紧凑元信息为语言；深色导航仅作为 `inverse` 可选变体。适合：

- 内部 CRUD。
- 数据表、筛选、导入导出、配置页。
- 一次性分析页或临时报表。
- 没有品牌曝光需求。

### customize

在项目本地视觉系统中基于通用基线轻客制化。适合：

- 会长期使用，但不是公司品牌触点。
- 需要看起来像某个业务线，而不是随机模板。
- 用户提出“希望有点风格”，但没有完整品牌资产。
- 页面未来会扩展，但当前还不值得完整设计系统。

### design-system

先完成 intake，再在项目本地固化完整设计规范。适合：

- 对外产品或客户可见页面。
- 销售、招商、官网、品牌宣传、演示。
- 多团队长期协作。
- 页面类型超过 3 类，组件复用明显。
- 已经有品牌资产或明确差异化诉求。

进入前必须读取 `references/design-system-intake.md`。资料不足时输出草案，不最终定 token。

### review

对已有 UI 或设计方案做核查。适合：

- 用户要求“审一下”“检查体验”“有没有问题”。
- 页面已经实现，需要找风险。
- 用户想知道要不要重构或优化。

## 横向模式

横向模式可以与任一主模式叠加。

### composition_kit

适合页面、流程和前端实现建议。读取 `references/agent-operating-contract.md`。

规则：

- 先输出组合包，再进入具体组件或代码。
- 组合包必须包含 route、page template、frame、blocks、component families、states、responsive contract、HTML preview decision、enforcement。
- 如果项目已有组件，先映射到本项目组件，不要直接发明新组件。
- 如果涉及外部组件库，读取 `references/external-component-adoption.md`。

### host-native

适合嵌入宿主环境的插件或扩展。读取 `references/host-native-ui.md`。

规则：

- 先像宿主产品，再表达品牌。
- 使用宿主变量和原生组件。
- 品牌只作为身份信号。

### admin-data-workspace

适合高密度后台、长表、筛选、分页、批量操作。读取 `references/page-templates.md`。

规则：

- 工作台全宽。
- 表格内部滚动，分页可见。
- 移动端改卡片或关键字段。

### agent-process-ui

适合助手、审批、工具调用、Task Bar、产物和同步冲突。读取 `references/agent-process-ui.md`。

规则：

- 正文、过程、工具调用、审批、产物用统一信息语法。
- 工具调用低强调。
- 审批只有一个主视觉位置。

### data-visualization

适合仪表盘、经营看板、数据报告和包含图表的产品界面。读取 `references/data-visualization-module.md` 与 `templates/visualization-manifest.json`。

规则：

- 先写分析问题、结论、数据粒度、单位和分母，再选图。
- 按 Lupi Editorial、Lupi Basics、Glance 顺序审计，至少比较 3 个诚实 preset；精确查数优先数据表。
- 锁定 preset id、source template 和 card title，直接沿用真实模板的几何、编码、交互与动效。
- Lieflat 模板颜色只使用 `--viz-editorial-*` 兼容 token；其实际值必须映射到项目共享色阶，字体、容器、圆角和 Catalog 外壳必须与组件系统一致。
- 交互只绑定真实数据标记，不为展示效果虚构路径或命中区域语义。
- 涉及图型或交互方案比较时，命中 `preview_decision`。

### preview_decision

用 HTML 辅助对齐。适合：

- 文字难以表达布局、层级、动效或状态。
- 需要比较方案。
- 用户在产品定义阶段还没写代码，但需要看见大概效果。

### enforcement

当设计规范要落到代码库里，读取 `references/design-system-enforcement.md`。

规则：

- 不只写文档，还要考虑 token、运行时 CSS、预览和检查。
- 对共享组件、图标入口、CSS var 和可访问性做守门。

### external-component-adoption

适合用户询问 Astryx、Material、Fluent、Carbon、Radix、shadcn/ui 等外部组件库是否能吸收。读取 `references/external-component-adoption.md`。

规则：

- 区分参考吸收、适配吸收、依赖吸收。
- 部门 skill 只吸收原则、组件分类、文档机制和工程方法。
- 具体项目采用外部组件库前，必须确认技术栈、许可证、版本、token 桥接、wrapper 策略和维护成本。

## 设计系统选择

如果项目已经明确属于成熟设计系统生态，优先使用官方系统，不要手写仿制：

| 场景 | 优先系统 |
|---|---|
| Microsoft/企业办公 | Fluent UI |
| Google/Material 风格 | Material 3 |
| IBM/企业分析 | Carbon |
| Shopify App | Polaris |
| Atlassian/Jira 类 | Atlassian Design System |
| GitHub/开发者工具 | Primer |
| 政府公共服务 | GOV.UK 或 USWDS |
| 自有 React SaaS | Radix Themes 或 shadcn/ui |
| AI-ready React 组件体系候选 | Astryx，需按 `references/external-component-adoption.md` 评估 |

如果只是审美方向，例如玻璃拟态、bento、brutalist、editorial、dark tech，要说明这是审美语言，不是官方设计系统。

Astryx 属于可选外部组件库和机制参考，不是部门默认运行时依赖。可以吸收它的 AI 操作链、组件族分类、页面模板和工程守门思路；只有具体 React 项目明确选择时，才作为依赖接入。

## 非触发或降级场景

以下场景不要升级设计工作量：

- 纯后端接口、没有可视表达需求的数据清洗、数据库脚本。
- 纯文案修改，且不涉及页面结构。
- 纯 bugfix，用户没有要求设计判断。
- 一次性脚本或临时验证页。
- 用户明确说先不要设计稿或预览。
