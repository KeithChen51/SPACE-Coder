# Design Consultant Skill

中文名：设计顾问。用于在项目进入前端设计时快速建立本地视觉系统，并持续支持产品定义、客制化深度判断、UI/UX 核查、默认视觉规范调用和 HTML 预览决策。

## 包含能力

- 跨平台项目视觉系统脚手架，支持 `init / extract / update / --dry-run`。
- 三路由接入：`greenfield / existing-ui-without-system / existing-design-system`；存在成体系 token 或共享组件时先提取事实，绝不自动迁移。
- 既有系统的 `preserve / augment / migrate` 确认闸门、token bridge、组件 adapter、legacy ratchet 与 adoption contract。
- 标准 `design-system/` 目录契约与用户文件保护。
- 品牌/独立设计系统必要性分析。
- 主品牌 Logo 与 `Powered by` / 技术署名的产品级落位、响应式迁移、资产完整性和独立重点色规则；Catalog 的“品牌与技术署名”分组提供主版 `standard-stacked`、次版 `compact-horizontal`、品牌原生版 `focus-and-orbit`、克制融入版 `orbit-only`、默认靛蓝与项目覆写，以及桌面 Rail、移动账户表面、认证 / 授权面板和已登录首页尾部示例。Skill 会根据主品牌成熟度、界面密度、曝光频率与技术归属强度给出首选建议，并要求在项目级统一记录。
- 部门默认视觉系统。
- 低成本客制化方法。
- 组件系统与状态规范。
- 本地 vendored UI/UX 核查清单。
- 反模板规则。
- 动效与组件手感规则。
- HTML 预览决策规则。
- 由真实 React 组件驱动、可搜索和切换密度的统一 Catalog。
- Skill 保留全量组件 Library；项目通过 `components/kit.json`、裁剪 Manifest、按需运行时与 CSS 只安装实际使用的组件。
- React + TypeScript + CSS Variables 运行时，内置 23 个可直接使用的组件家族及统一导出入口。
- 宿主原生 UI 规则。
- AI/Agent 过程型 UI 信息语法。
- 页面模板库。
- Composition Kit 输出格式。
- 外部组件库吸收策略，含 Astryx 边界。
- 机器可读组件族 manifest。
- 数据形态优先的可视化选型契约与 Visualization Kit。
- 已获授权并 vendored 的 Lieflat Charts：Lupi Editorial 15、Lupi Basics 12、Glance 18、Interactive 3，共 48 个真实 preset。
- 保留真实模板的几何、滚动入场、重播、拖拽、hover 与点击固定，并把其编辑型层级反向融入 Editorial Utility 通用基线；组件与图表共享表面、字体、中性色阶、圆角和动效 token。
- `tokens.json -> tokens.css / tokens.ts / tokens.schema.json` 确定性编译链，支持 `build / check / diff`、引用与循环检测、Manifest 引用校验和逐主题 AA 检查。
- 固定本地 Chart.js / ECharts 运行时，图表 Catalog 可离线使用且不依赖 CDN。
- 移动端图表保持可读尺度并在图形容器内浏览；Threads 提供焦点、Enter/Space 固定和 Escape 清除。
- 项目级 AI 设计规则模板。
- 设计系统 intake 与资料完整度判断。
- 设计系统工程守门和基础检查脚本。
- 跨平台 Node UI 合约守门，输出文件、行号、规则和修复建议。
- Playwright 桌面、窄屏、移动端和 reduced-motion 版本化截图回归。

## 快速开始

```powershell
# 先查看计划
node .\scripts\manage-visual-system.mjs init --target <项目目录> --mode default --components <family-id,...> --dry-run

# 新项目初始化
node .\scripts\manage-visual-system.mjs init --target <项目目录> --mode default --components <family-id,...>

# 已有 UI 项目提取现状
node .\scripts\manage-visual-system.mjs extract --target <项目目录> --mode customize

# 用户确认 adoption plan 后才可接入
node .\scripts\manage-visual-system.mjs adopt --target <项目目录> --dry-run

# 安全更新未被用户修改的生成文件
node .\scripts\manage-visual-system.mjs update --target <项目目录> --dry-run

# 在生成的 design-system 目录中只改 tokens.json，再生成并检查产物
node .\checks\sync-tokens.mjs build
node .\checks\sync-tokens.mjs check
```

详细流程见 `references/project-visual-system-workflow.md` 与 `references/component-kit-selection.md`。项目存在成体系 token、共享组件、主题机制或设计资产时，还必须先读 `references/existing-system-adoption.md`。

## 当前状态

v0.10 保留 v0.9 的全部命令和 greenfield 能力，并增加既有系统接入。`extract` 只生成事实报告与 draft plan；用户确认后，React 项目通过 canonical runtime + bridge 消费现有能力，adoption-specific package、`projectIdentity`、`fileClosure v3` 和不可变 generation/current 指针共同守门。非 React 项目生成事实报告、设计契约、token bridge、可独立安装的 core 检查包与守门计划，但不生成 React adapter。真实 v0.9 greenfield lock 可通过显式 `migrate-lock --dry-run` / `migrate-lock` 验证后升级 provenance。

应用 route 的目标服务必须由用户手工启动并通过 external baseUrl 连接。`startCommand` 在所有平台都只是建议；没有 route 时视觉验证明确返回 `not-configured`。

全量 Library 目前有 27 个 family，其中 23 个为 `runtime-ready`。除基础动作、字段、选择、覆盖层、反馈、资源状态、技术署名外，已补齐 `TextField / TextAreaField / NumberField`、`MultiSelectField`、`MetricCard`、`TertiaryNav`、`FilterBar`、可选择 `DataTable`、`DefinitionList`、`MobileRecordCard`、`TablePagination` 与 `ApprovalPanel`，并用“复核决策工作台”验证桌面表格和移动记录卡共享同一业务状态。`AppFrame / EventRow / FileArtifactRow` 按场景提供设计与验收契约，`CommandPalette` 保持外部成熟实现适配，不伪装成默认运行时。相邻组件的选择边界见 `references/component-family-boundaries.md`。

新项目先由 Composition Kit 给出 Manifest family id，再用 `--components` 精确生成 Project Kit；`core / data-workspace / agent-workspace / full` 只作为完整匹配时的快捷档位。裸 `init` 保留为 `full / legacy-full` 兼容入口，不能作为新业务项目默认路径。

## v0.10 验证

```powershell
npm run test:node
npm run test:components
npm run typecheck:components
npm run tokens:check
npm run catalog:check
npm run guard:ui
npm run adoption:check
npm run ui:check
npm run visual:test
```

测试覆盖 Token 生成链、脚手架文件保护、React 组件行为和可访问性、已有组件映射、Catalog bundle 漂移、八类 UI 违规注入，以及四类浏览器视觉基线。完整验收映射见 `../../evals/design-consultant/v0.8-acceptance.md` 与 `../../evals/design-consultant/v0.9-acceptance.md`。

## 重要约束

- 不依赖运行时远程拉取设计规则。
- `taste-skill` 只做部分吸收，不直接照搬。
- 新的历史项目经验写入 `ux-review-checklist.md` 前必须先给用户确认清单。
- 资料不足时生成内容保持 `draft`，不能最终定 token。
- 任何 coherent tokens 或 shared components 都先进入既有系统参考；建议不等于迁移授权。
- 外部组件库只能按“参考/适配/依赖”分层吸收；默认不 vendored 代码，不作为 skill 运行时依赖。
- Lieflat 上游原件保持 byte-identical，实际交付使用同步脚本生成的融合派生层；图形实现保持，表面与组件视觉服从 Editorial Utility。版本、来源和文件哈希记录在 `vendor/lieflat-charts/UPSTREAM.json`。
- Chart.js / ECharts 固定版本、许可证和哈希记录在 `vendor/runtime-libs/RUNTIME.json`；生成模板不允许恢复远程 CDN。

## 关键新增文件

- `references/project-visual-system-workflow.md`
- `templates/design-system-README.md`
- `templates/system.config.json`
- `scripts/manage-visual-system.mjs`
- `scripts/manage-visual-system.test.mjs`
- `references/design-system-intake.md`
- `references/brand-attribution-placement.md`
- `references/design-system-enforcement.md`
- `references/page-templates.md`
- `references/host-native-ui.md`
- `references/agent-process-ui.md`
- `references/agent-operating-contract.md`
- `references/external-component-adoption.md`
- `references/data-visualization-module.md`
- `references/visualization-copy-guidelines.md`
- `templates/component-manifest.json`
- `templates/component-library.html`
- `templates/catalog-react.tsx`
- `templates/react-runtime/`
- `templates/catalog-foundation.css`
- `templates/component-library.css`
- `templates/component-preview.css`
- `templates/visualization-manifest.json`
- `templates/visualization-lieflat/`
- `vendor/lieflat-charts/`
- `vendor/runtime-libs/`
- `templates/astryx-component-map.json`
- `templates/project-design-agent-rules.md`
- `templates/component-decisions.json`
- `templates/tokens.json`
- `templates/tokens.css`
- `templates/tokens.ts`
- `templates/tokens.schema.json`
- `scripts/token-compiler.test.mjs`
- `scripts/generate-astryx-component-map.mjs`
- `scripts/check-css-vars.ps1`
- `scripts/check-design-system-contract.ps1`
- `scripts/check-visualization-module.mjs`
- `scripts/check-component-runtime.mjs`
- `scripts/check-ui-contract.mjs`
- `scripts/build-component-catalog.mjs`
- `scripts/visual-regression.mjs`
- `scripts/text-content.mjs`
- `scripts/sync-tokens.mjs`
- `scripts/sync-lieflat-module.mjs`
