# Project Design Agent Rules

把本段复制到项目的 `AGENTS.md`、`CLAUDE.md` 或等价 AI 规则文件中，用于让 AI 在具体代码库里遵守项目设计系统。

<!-- DESIGN-CONSULTANT:START -->

本项目使用本地设计规范，不允许凭空发明 UI 风格。写任何页面、组件或前端交互前，先执行以下顺序：

1. 读取项目内的 `design-system/DESIGN.md`、`design-system/system.config.json`、`design-system/tokens/tokens.json` 和生成的 `tokens.css / tokens.ts`；涉及图表时同时读取 `design-system/visualizations/manifest.json`。
2. 先读取 `components/kit.json` 确认本项目已选 family，再读取统一共享组件入口，并核对裁剪后 `components/manifest.json` 的 `availability`。不得因为 Skill Library 有某组件就假定项目已安装。
3. 如果是新页面，先产出 Composition Kit：route、page template、frame、blocks、component families、states、responsive contract、带稳定 ID 的 acceptance commitments、HTML preview decision、enforcement；包含图表时追加 Visualization Kit。
4. 如果资料不足，只能输出设计草案和待补资料，不最终确定 token。

工程约束：

- 未记录独特品牌方向时，使用项目内 Editorial Utility 与 Harbor Blue Light 通用基线；Coral Office 或 dark 必须在 `DESIGN.md` / `system.config.json` 明确选择。AppFrame 默认浅色导航，`inverse` 导航只用于明确记录的密集技术、监控或沉浸式场景。只能通过共享 token 客制化，不得为组件、图表或单个页面分别创建独立皮肤。
- 主品牌 Logo 与 `Powered by` / 技术署名不得混用：主品牌属于身份区；署名只按 `DESIGN.md` 的 placement map 进入桌面 Rail / Shell 尾部、移动端账户 / 关于表面、认证 / 授权面板尾部或已登录首页内容尾部。`page-footer` 只作项目明确批准的无 Shell fallback。禁止进入顶部栏、移动端一级导航、业务表格、业务弹层正文和每个内容区块。
- 署名只通过共享 `BrandAttribution` 组件渲染；组件内部负责资产、字体、固定文案、主题解析和 accessible name，页面只选择批准的 placement / variant。`standard-stacked` 是主版本，`compact-horizontal` 是空间受限时的次版本；`mark-only` 使用独立品牌资产组件。署名在产品中选择一个稳定位置，不要求每个页面重复出现；同一视口最多一个可见实例，侧栏收起时迁移到移动账户 / 关于表面，不把完整署名压进图标 Rail。四周至少保留 `0.5 × 字标高度`。默认重点色为 light `#4F46E5`、dark `#818CF8`，项目只能通过 `--brand-attribution-accent` 独立覆写，不得默认映射到 `--primary`。项目统一选择 `focus-and-orbit`（品牌原生版，A + 双轨道为重点色，组件默认）或 `orbit-only`（克制融入版，A 跟随中性字标，仅双轨道为重点色），不得按页面切换。独立产品、低频品牌表面或需要明确技术归属时优先前者；成熟主品牌、密集工作台或长期常驻位置优先后者，并把依据写入 `DESIGN.md`。`Powered by` 使用普通 UI 字体，`AI NATIVE` 使用随附品牌字体。只使用批准、版本化的资产和字体，不重画 SVG、不裁切拉伸、不用 CSS filter 整体变色。
- `tokens/tokens.json` 是唯一可编辑 Token 源；修改后运行 `checks/sync-tokens.mjs build` 生成 CSS、TypeScript 和 Schema，并用 `check` 阻止未知或循环引用、命名冲突、Manifest 引用错误、主题越界、产物漂移和关键配色低于 4.5:1。
- 使用语义 token，不在业务页散写 `#hex`、`rgb()`、`hsl()`、`oklch()` 或随意尺寸。
- 已有共享组件时，不直接写 raw `<table>`、`<select>`、`role="dialog"`、`role="combobox"`、`div/span onClick`。
- 只有 `runtime-ready` 组件可以直接 import；`evidence-only` 需要先移植，`contract-only` 不能当作已有实现，`external-required` 必须使用清单批准的成熟 adapter。业务页不得直接 import `react-aria-components`，需要搜索选择时使用共享 `SearchableSelect`。
- icon-only 操作必须有 accessible name；业务页不要直接 import 图标库，除非项目尚无统一图标入口。
- 表格必须覆盖 loading、empty、error、permission denied、partial data；移动端宽表要有记录卡片或关键列策略。
- 字段错误贴近字段，通过 `aria-describedby` 关联；不要只用 toast 表达字段错误。
- Dialog 需要 focus trap、Escape close、return focus、background inert。
- 审批/危险操作只保留一个主视觉位置，避免多处重复强提醒。

数据可视化约束：

- 先写 analytical question、takeaway、grain、unit 和 denominator，再从 `visualizations/manifest.json` 比较至少 3 个 preset。
- 精确查数优先数据表；不要因为预览醒目而选图，不得编造明细、分母或辅助指标。
- 锁定 preset id、system、source template 和 card title，直接沿用 `visualizations/lieflat/` 中真实模板的几何、编码、交互和动效。
- Lieflat 图表颜色只使用 `--viz-editorial-*` 兼容 token，不绕过 `lieflat-theme.js`；兼容色槽的实际值必须来自项目共享色阶。
- 保留真实模板的图形几何、数据编码、交互与动效，但字体、容器、圆角、焦点样式和背景必须与共享组件系统一致。
- hover、focus、drag 和 click pin 只绑定真实数据标记，并提供键盘等价操作；遵守 reduced motion。
- B3 Threads 沿用项目派生模板的焦点、Enter/Space 固定和 Escape 清除；其他图表交互也必须提供相同任务的键盘路径。
- 移动端复杂图表保持可读尺度，在图形容器内横向滚动或触摸平移；不得压缩到标签不可读，也不得造成整页横向溢出。
- Chart.js / ECharts 只从 `visualizations/lieflat/runtime/` 读取 `RUNTIME.json` 记录的固定本地版本，禁止恢复 CDN 地址。
- 业务组件化时包裹真实模板代码，但不要退回图表库默认样式或另画“差不多”的版本。

外部组件库：

- 默认使用项目现有组件和本地设计规范。
- 可以参考 Astryx、Material、Fluent、Carbon、Radix、shadcn/ui 的组件分类和可访问性规则。
- 只有项目明确选择外部库时，才把它作为依赖；接入时必须通过 wrapper/adapter 暴露项目语义组件。
- 不要猜外部组件 props；先读项目依赖版本对应的官方文档或本地类型。

HTML 预览：

- 涉及页面布局、多状态、复杂交互或方案比较时，先判断是否需要单文件 HTML 预览。
- 纯后端、纯文案、轻量 bugfix 不需要预览。

产品实现开始后，把 Composition Kit 中可验证承诺原样登记到 `design-system/checks/product-commitments.json`，填写 `implementationStatus`、`codeRefs` 和 `scenarioIds`；场景代码写入 `product-acceptance.config.mjs`。必选承诺未实现、代码锚点无效、没有场景，或豁免缺少原因与批准人时，最终验收必须失败。键盘路径、未保存提醒、响应式变化和关键状态不能只写在文档里。应用服务由用户手工启动，`startCommand` 永远不执行。

开发中检查：

```powershell
node .\design-system\checks\sync-tokens.mjs build
node .\design-system\checks\sync-tokens.mjs check
powershell -NoProfile -ExecutionPolicy Bypass -File .\design-system\checks\check-css-vars.ps1 -Path .\src
powershell -NoProfile -ExecutionPolicy Bypass -File .\design-system\checks\check-design-system-contract.ps1 -Path .\src
node .\design-system\checks\check-visualization-module.mjs
```

正式前端交付只执行并认可以下完整门禁；不得用局部检查通过替代它：

```powershell
Set-Location .\design-system
npm run verify
```

<!-- DESIGN-CONSULTANT:END -->
