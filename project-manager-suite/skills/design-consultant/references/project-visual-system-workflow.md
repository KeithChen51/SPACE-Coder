# 项目本地视觉系统工作流

## 路由前置

运行脚手架前先选择一条项目路由：

- `greenfield`：没有可复用 UI、成体系 token 或共享组件，执行 `init --dry-run`。
- `existing-ui-without-system`：已有页面和零散样式但没有稳定系统，执行 `extract --dry-run`。
- `existing-design-system`：存在成体系 token、共享组件、主题机制或设计资产，先读取 `existing-system-adoption.md`，再执行 `extract --dry-run`。

品牌投入的 `default / customize / design-system` 与项目路由是两个维度。任何 coherent tokens 或 shared components 都必须先进入既有系统参考，再决定 `extract / confirm / adopt`，不得自动迁移。

`consumer-product` 与 `growth-conversion` 是第三个维度，只为 Composition Kit 补充产品类型、旅程、页面、证据、移动导航、交易和恢复约束。它们不得绕过项目路由，也不因出现营销信号就自动升级为完整品牌设计系统。后台、数据工作台、宿主和 Agent 路由继续保持原有优先级。

`extract` 只生成事实报告和 draft plan。用户确认 `preserve / augment / migrate`、映射、baseline 与 route 后，才能执行 `adopt`。既有 React 系统的 Catalog 使用 canonical runtime + bridge；非 React 项目不生成 React adapter。

本文件定义“进入前端设计后”的主流程。设计顾问不只给一份建议，而是要在项目内建立可持续维护的视觉系统事实来源，并让后续 AI 和前端实现从同一套文件读取规则。

## 触发条件

出现以下任一信号时，进入本流程：

- 用户准备开始页面、组件或前端交互实现。
- 用户要求先定 UI、视觉规范、设计 token 或组件风格。
- 项目已有 UI，但缺少统一 token、共享组件入口或 AI 约束。
- 用户要求把默认规范或轻客制化结果固化到项目。
- 项目包含仪表盘或图表，需要统一图型、色卡、交互和渲染入口。

纯后端、纯数据处理、纯文案或与 UI 无关的修复不触发。

## 核心判断

`default / customize / design-system` 决定客制化深度，不决定“要不要生成本地视觉系统”。只要进入正式前端设计：

- `default`：生成完整目录契约，内容使用通用视觉基线。
- `customize`：先生成通用基线，再只调整主色、密度、圆角、字体策略、视觉强度和页面模板。
- `design-system`：生成同一目录契约，并基于完整 intake 扩展品牌、组件和工程规则。

一次性 HTML 草图或用户明确要求不改项目文件时，可以只做预览，不初始化目录。

## 标准目录

```text
design-system/
├── README.md
├── DESIGN.md
├── system.config.json
├── agent-rules.md
├── .design-consultant-lock.json
├── tokens/
│   ├── tokens.json
│   ├── tokens.css
│   ├── tokens.ts
│   └── tokens.schema.json
├── components/
│   ├── manifest.json
│   ├── kit.json
│   ├── decisions.json
│   └── external/
│       └── astryx-component-map.json
├── visualizations/
│   ├── manifest.json
│   └── lieflat/
│       ├── lieflat-theme.js
│       ├── mono-tokens.js
│       ├── runtime/
│       │   ├── RUNTIME.json
│       │   ├── chart.umd.min.js
│       │   └── echarts.min.js
│       ├── lupi-gallery.html
│       ├── basics-gallery.html
│       ├── glance-gallery.html
│       ├── big-circular.html
│       ├── big-force.html
│       ├── big-threads.html
│       └── UPSTREAM.json
├── catalog/
│   ├── catalog-foundation.css
│   ├── component-library.css
│   ├── component-preview.css
│   ├── component-library.html  # 组件与可视化统一入口
│   └── component-preview.html
├── checks/
│   ├── check-css-vars.ps1
│   ├── sync-tokens.mjs
│   ├── check-design-system-contract.ps1
│   ├── text-content.mjs
│   └── check-visualization-module.mjs
└── intake/
    └── extraction-report.json
```

`intake/extraction-report.json` 只在执行 `extract` 后出现。

## 命令

脚本仅依赖 Node.js 标准库，可在 Windows、macOS 和 Linux 运行。

```powershell
# 查看将创建什么，不写文件
node skills/design-consultant/scripts/manage-visual-system.mjs init --target <项目目录> --dry-run

# 使用通用视觉基线与精确组件 Kit 初始化
node skills/design-consultant/scripts/manage-visual-system.mjs init --target <项目目录> --mode default --components <逗号分隔的 family id>

# 提取现有技术栈、CSS 变量和共享组件目录线索
node skills/design-consultant/scripts/manage-visual-system.mjs extract --target <项目目录> --mode customize

# 先检查更新，再安全更新仍保持生成态的文件
node skills/design-consultant/scripts/manage-visual-system.mjs update --target <项目目录> --dry-run
node skills/design-consultant/scripts/manage-visual-system.mjs update --target <项目目录>

# 在生成的 design-system 目录中编译、检查或查看 Token 漂移
node .\checks\sync-tokens.mjs build
node .\checks\sync-tokens.mjs check
node .\checks\sync-tokens.mjs diff
```

可用参数：

- `--output <相对路径>`：修改输出目录，默认 `design-system`。
- `--project-name <名称>`：覆盖从目标目录推导出的项目名。
- `--mode default|customize|design-system`：写入项目配置和目录说明。
- `--components <id,id,...>`：根据 Composition Kit 精确选择组件，并自动补齐依赖；新项目优先使用。
- `--kit-profile core|data-workspace|agent-workspace|full`：需求与档位完整吻合时使用的快捷选择。
- `--dry-run`：只输出 JSON 计划，任何目录和文件都不会创建。

全量组件 Library 只保留在 Skill 的 `templates/component-manifest.json` 与 `templates/component-library.html`。项目内的 `components/kit.json`、裁剪后 Manifest 和运行时只保存当前项目所需组件。未传组件选择的裸命令仅作为既有 v0.10 项目的 `full / legacy-full` 兼容入口，不是新项目标准流程。完整规则见 `component-kit-selection.md`。

## 三个动作的边界

### init

- 创建缺失的标准文件。
- 已有文件无论是否同名都不覆盖。
- 重复执行结果稳定，不删除、不重写项目文件。

### extract

- 先补齐缺失的标准文件。
- 识别 `package.json` 中的前端框架、构建工具、样式方案和常见组件库。
- 识别常见共享组件目录、CSS 自定义属性和已有设计资产。
- 结果写入草案报告，不自动把检测结果改成最终 token 或组件决策。

### update

- 根据 `.design-consultant-lock.json` 判断文件归属。
- 只更新内容仍等于上次生成结果的文件。
- 用户修改过或原本就存在的文件保持不变，并在输出中标记。
- 不删除废弃文件；需要删除时必须由项目维护者明确决定。

## AI 执行顺序

1. 检查目标项目技术栈、现有设计资产和工作区状态。
2. 用品牌必要性量表选择 `default / customize / design-system`。
3. 先完成 Composition Kit，从全量 Manifest 提取真实 family id；优先形成精确 `--components` 参数。
4. 首次接入先执行带组件选择的 `--dry-run`，向用户说明目标目录、最终 Kit、依赖补齐项与冲突。
5. 执行带相同组件选择的 `init`；已有 UI 项目优先执行 `extract`。
6. 根据用户输入完善 `DESIGN.md`，把未确认项保留为草案；视觉系统尚未基本确认时，品牌署名保持 `deferred`，不展示预览、不提问，也不让品牌默认色参与视觉决策。
7. 视觉系统基本确认后读取 `references/brand-attribution-placement.md`，根据当前背景明度、重点色、明暗模式和密度给出一个署名样式首选与安全 fallback；用户确认前不渲染到产品页面。
8. 产品形态、Shell / 导航与主要页面清单基本确认后，再推荐署名位置、由位置推导结构变体并定义响应式迁移；用户确认后写入 `system.config.json`、`DESIGN.md` 和 token。结构变化时重新评估位置。
9. 明确 token 的运行时导入位置和共享组件入口。
10. 只编辑 `tokens/tokens.json`，先运行 `checks/sync-tokens.mjs build` 生成 CSS、TypeScript 与 Schema，再运行 `check`；需要定位漂移时运行 `diff`。
11. 项目包含图表时，完善 visualization preset 谱系与真实模板接入决策，确认运行时来自 `visualizations/lieflat/runtime/`，并运行可视化模块检查。
12. React 项目运行组件行为与类型检查；`full` 包重建全量 Catalog，按需 Kit 则以 `kit.json + manifest + barrel` 验证组件边界。
13. 把 Composition Kit 中的可验证承诺按稳定 ID 登记到 `checks/product-commitments.json`，绑定实现状态、代码锚点与场景 ID；再在 `checks/product-acceptance.config.mjs` 实现真实产品 Playwright 场景，覆盖主流程、键盘、未保存提醒、状态与响应式行为。
14. 开发中可运行 `npm run verify:system`；正式交付必须运行 `npm run verify`，不允许用局部检查结果代替。
15. 页面实现和 UX review 持续读取该目录，不再从聊天上下文猜设计规则。

## 完成标准

- 项目内存在标准视觉系统目录，所有核心入口可被人和机器定位。
- `system.config.json`、token、组件清单均可解析。
- `components/kit.json` 与 Composition Kit 一致，项目 Manifest 和 barrel 不包含未选择组件。
- `DESIGN.md` 明确模式、已确认决策和待确认项。
- 应用有明确的 token 导入计划与共享组件路径；React 项目的 Manifest 可追溯到实现、export 和统一 barrel。
- 图表项目有明确的 preset 谱系、editorial 色卡、交互、真实模板和接入路径。
- `tokens.json` 是唯一可编辑 Token 源；CSS、TypeScript 与 Schema 均由其确定性生成，Manifest 引用可解析，主题边界合法，关键文字和状态色组合满足 4.5:1 对比度。
- 图表运行时版本与哈希可追溯，Catalog 和模板不依赖远程 CDN。
- 重复执行脚手架不会覆盖用户修改。
- Catalog 直接渲染真实运行时组件，bundle 可确定性重建；可视化真实模板通过同页二级菜单进入。
- 跨平台 UI 合约守门和桌面、窄屏、移动端、reduced-motion 视觉回归全部通过。
