# 设计系统工程守门

设计规范需要能约束后续代码。仅有 `DESIGN.md` 或文字说明不够，至少要建立事实来源、运行时入口、人工预览和自动检查。

## 推荐事实来源

| 文件 | 作用 |
| --- | --- |
| `design-system/DESIGN.md` | 人能读懂的设计决策、范围和边界 |
| `design-system/system.config.json` | 机器可读入口、模式与运行时接入位置 |
| `design-system/tokens/tokens.json` | 机器可读 token 源 |
| `design-system/tokens/tokens.css` | 生成的运行时 CSS 变量入口 |
| `design-system/tokens/tokens.ts` | 生成的 Token 路径、变量和主题类型声明 |
| `design-system/tokens/tokens.schema.json` | 生成的 Token JSON Schema |
| `design-system/components/decisions.json` | 组件候选 keep/adjust/hold 记录 |
| `design-system/components/manifest.json` | 机器可读组件族索引 |
| `design-system/runtime/react/src/` | React 核心组件、统一导出与唯一组件样式入口 |
| `design-system/visualizations/manifest.json` | 图型、数据、交互、动效和 token 契约 |
| `design-system/visualizations/lieflat/` | 48 个 preset 的真实 Gallery、主题桥、mono token 与来源记录 |
| `design-system/visualizations/lieflat/runtime/` | 固定版本图表运行时、许可证与 SHA256 清单 |
| `design-system/catalog/catalog-foundation.css` | 统一 Catalog 共用的外壳、排版和交互基线 |
| `design-system/catalog/src/catalog.tsx` | 直接消费真实组件的 Catalog 源码 |
| `design-system/catalog/component-library.js` | 可确定性重建的离线 Catalog bundle |
| `design-system/catalog/` | 人工检查颜色、排版、组件状态、图表和页面模板 |
| `design-system/agent-rules.md` | 写入项目 AGENTS/CLAUDE 等规则文件的 AI 使用约束 |
| `design-system/checks/` | 阻止绕过设计系统 |
| `design-system/checks/product-commitments.json` | Composition Kit 承诺的状态、代码位置与场景映射 |
| `design-system/checks/product-acceptance.config.mjs` | Composition Kit 承诺与真实产品 Playwright 场景 |

## 最小工程闭环

1. 新增或修改颜色、圆角、控件高度、阴影、状态色时，只改 `tokens.json`，再运行 Token 编译器生成 CSS、TypeScript 和 Schema。
2. 同步更新 React Catalog 源码并重建 bundle，让人能看见真实组件变化。
3. 同步更新运行时 CSS 变量。
4. 业务组件只引用 token，不直接散落色值和尺寸。
5. 更新组件 manifest 或 component decisions，避免 AI 和前端同学继续猜组件边界。
6. 把 `project-design-agent-rules.md` 的适用片段写入项目 AI 规则文件。
7. 加静态检查或测试，防止后续绕过。
8. 包含图表时同步检查 visualization manifest、preset 谱系、token 色卡、真实模板、预览交互和固定本地运行时。
9. 组件与可视化必须位于同一个 Catalog，通过二级菜单切换，并共用 token、字体、容器、圆角和导航外壳。
10. Composition Kit 中所有可验证承诺必须使用稳定 ID 登记到 `product-commitments.json`，并同时绑定真实代码锚点与业务页场景。
11. 正式交付必须执行一键最终验收；局部 Token、组件或 Catalog 检查通过不能替代业务页验收。

## 既有系统守门

- `extract` 的事实报告与 `optimizationAdvice` 不能授权写入；所有自动候选保持 `proposed`。
- `adopt` 必须读取已确认计划，配置与 visual config 都绑定同一 `projectIdentity`。
- 既有 token 通过 bridge 成为 canonical token 的上游来源；缺源、冲突、未确认映射直接失败。
- Catalog 只消费 canonical runtime + bridge，并展示真实来源，不维护仿制组件。
- adoption-specific package 与 greenfield package 分开管理；组件来源以 `fileClosure v3` 封闭并校验依赖漂移。
- UI baseline 使用不可变 `generations/<id>/` 与 `current.json` 指针。历史违规可登记，新增违规返回非零退出码，已修复项只通过显式 prune 删除。
- `startCommand` 在所有平台都只是建议。应用服务由用户手工启动，视觉检查只连接 external baseUrl；没有 route 时如实返回 `not-configured`。
- `migrate` 只生成批次计划和已批准 bridge/adapter，不自动修改业务 import、CSS class、props 或页面。

## 必查项

### Token 与 CSS

- CSS `var(--*)` 引用必须有定义，或明确来自宿主环境。
- 业务 CSS 不应直接散落 `#hex`、`rgb()`、`hsl()`、`oklch()`。
- `tokens.json` 是 Token 单一事实源；`tokens.css`、`tokens.ts` 和 `tokens.schema.json` 均为生成产物，不允许手改或漂移。
- Token 必须归入 `base / semantic / component / data-viz` 四层之一；明暗主题不得覆盖 base 层。
- Token 别名、主题覆盖、组件 Manifest 与可视化 Manifest 中的变量引用必须全部可解析，循环引用和 CSS 变量重名直接失败。
- 默认文字、弱文字、反色文字和状态色组合的对比度不得低于 4.5:1。
- 暗色模式必须单独设计，不要偷偷跟随系统导致局部反相。

### 组件入口

- 表格走共享 `DataTable` 或等价组件。
- Select 走共享 `SelectField`；需要搜索时走共享 `SearchableSelect`，避免每个页面重写筛选、活动项、键盘和错误状态。
- Dialog/ConfirmDialog 走共享组件，保证焦点管理和关闭逻辑。
- Icon-only 走共享 `IconButton`，必须有 accessible name。
- 图标库应集中入口，不在业务页直接 import。
- 外部组件库只在 adapter/wrapper 内使用，业务页不直接依赖外部组件 API，除非项目明确规定。

组件 Manifest 的 `availability` 是可执行边界：

- `runtime-ready` 可从统一入口直接使用。
- `evidence-only` 只有历史实现证据，需先完成移植和测试。
- `contract-only` 只有设计契约，不代表代码存在。
- `external-required` 禁止手写，只能使用清单批准的成熟 adapter。

### 可访问性

- `div/span onClick` 不应扮演按钮或链接。
- 异步状态使用 `role=status/alert` 与 `aria-live`。
- 错误信息贴近字段，不只弹 toast。
- Dialog 需要 focus trap、Escape、return focus、background inert。
- Loading/empty/error/permission denied/partial data 都要覆盖。

### 页面模板

- 高密度数据工作台：页面外层不滚动，结果区内部滚动，分页保持可见。
- 移动端宽表：提供记录卡片或关键列策略。
- 筛选、分页、tab、排序等运营上下文应可恢复，优先进入 URL。

### 数据可视化

- 图型选择必须能追溯到分析问题、数据粒度、单位、分母和至少 3 个候选 preset。
- 记录 preset id、system、source template 和 card title；不能只写“参考 Lieflat 风格”。
- 从真实模板提取结构和脚本，保留核心几何、数据编码、交互和动画节奏。
- Lieflat 模板只使用 `--viz-editorial-*` 兼容 token；不要绕过 `lieflat-theme.js`。这些上游色值 ID 仅用于来源追踪，实际值必须来自共享 Editorial Utility 色阶。
- 保留图表的几何、数据编码、交互和动画节奏；页面背景、字体、卡片容器、圆角、焦点样式与 Catalog 外壳必须回到项目共享基线。
- hover、focus、drag、click pin 只绑定真实数据标记，并在项目实现中补键盘等价操作。
- 移动端复杂图表保持可读尺度并在图形容器内横向浏览，不得把整张桌面图压缩成不可读缩略图，也不得造成页面级横向溢出。
- Chart.js / ECharts 等依赖读取 `runtime/RUNTIME.json` 中的固定本地版本；生成的模板和 Catalog 不得访问远程 CDN。
- 遵守 reduced motion；重播前沿用上游机制清理旧动画和 timer。
- 精确数据仍可通过表格、摘要或可访问文本获得。

### 项目级 AI 规则

当设计规范需要长期约束 AI 写代码时，将生成的 `design-system/agent-rules.md` 受控区块复制或改写到项目规则文件中。

最小内容应包含：

- 写 UI 前先读 `DESIGN.md`、token 和共享组件入口。
- 新页面先产出 Composition Kit。
- 禁止业务页绕过共享组件、散写色值、直接导入图标库。
- 说明外部组件库只能按参考、适配或依赖三层接入。
- 说明何时需要询问 HTML 预览。

## 脚本

项目脚手架会把跨平台 Node 工具、兼容 PowerShell 检查和版本化视觉基线放到 `design-system/checks/`：

- `checks/sync-tokens.mjs`：以 `tokens.json` 为唯一事实源执行 `build / check / diff`，生成 CSS、TypeScript 和 Schema，并检查引用、循环、命名冲突、主题边界、Manifest、预览、漂移和关键 AA 对比度。
- `checks/check-css-vars.ps1`：检查 CSS 变量引用是否有定义，可配置宿主变量白名单。
- `checks/check-design-system-contract.ps1`：检查散落颜色、非语义点击元素、直接图标导入、直接表格/select/dialog 等常见绕过。
- `checks/check-visualization-module.mjs`：检查 48 个 preset、6 个真实 Gallery、来源版本、Editorial Utility 模式、共享 Catalog 外壳、主题桥、键盘补丁、本地运行时和 token 引用的一致性。
- `checks/check-component-runtime.mjs`：校验 23 个默认 React 运行时家族的实现路径、export、状态、API、Manifest、四级可用性和 barrel 一致性。
- `checks/check-ui-contract.mjs`：跨平台扫描未定义 token、散落色值、外部 UI 直引、原生 table/select/dialog、非语义点击和无名称图标按钮；输出文件、行号与修复建议。
- `checks/check-adoption-contract.mjs`：校验确认状态、`projectIdentity`、token bridge、canonical runtime、adoption-specific package、动态产物与 `fileClosure v3`。
- `checks/build-component-catalog.mjs`：构建或检查真实组件 Catalog bundle，阻止提交过期产物。
- `checks/visual-regression.mjs`：执行桌面、窄屏、移动端和 reduced-motion 的截图差异、非空像素、布局与关键交互检查。
- `checks/product-acceptance.mjs`：加载承诺契约与项目场景，校验实现状态、代码锚点、豁免信息和场景双向关联，并在手工启动的真实应用上执行 Playwright 验收和生成报告。
- `checks/verify-project.mjs`：按项目类型串行执行所有适用系统检查，最后强制执行产品验收；缺脚本、空场景或任一失败都返回非零退出码。
- `checks/text-content.mjs`：统一 LF/CRLF 的比较与哈希口径，供可视化同步和校验复用。

示例：

```powershell
node .\design-system\checks\sync-tokens.mjs build
node .\design-system\checks\sync-tokens.mjs check
node .\design-system\checks\sync-tokens.mjs diff
powershell -NoProfile -ExecutionPolicy Bypass -File .\design-system\checks\check-css-vars.ps1 -Path .\src
powershell -NoProfile -ExecutionPolicy Bypass -File .\design-system\checks\check-design-system-contract.ps1 -Path .\src -IconImportPattern '@iconify/react|@iconify-icons/solar'
node .\design-system\checks\check-visualization-module.mjs
node .\design-system\checks\check-component-runtime.mjs
node .\design-system\checks\check-ui-contract.mjs
node .\design-system\checks\check-adoption-contract.mjs --root .\design-system
node .\design-system\checks\build-component-catalog.mjs check
node .\design-system\checks\visual-regression.mjs test
Set-Location .\design-system
npm run verify
```

## 输出建议

当用户进入前端设计时，不要只交付 `DESIGN.md`。执行脚手架并至少形成：

```text
我建议这次至少交付 5 类文件：
1. `design-system/DESIGN.md`：人读的决策。
2. `design-system/system.config.json`：入口与接入状态。
3. `design-system/tokens/`：机器可读 token 与运行时变量。
4. `design-system/components/`：组件契约与决策。
5. `design-system/catalog/`：人工预览。
6. `design-system/visualizations/`：48 个 preset、主题化真实模板和来源谱系（项目包含可视化时）。

如果进入代码库，还应执行七类检查：Token 生成链、组件运行时、业务 UI 合约、Catalog 漂移、可视化谱系、浏览器视觉回归和真实产品场景；正式交付由 `npm run verify` 一次执行。
```
