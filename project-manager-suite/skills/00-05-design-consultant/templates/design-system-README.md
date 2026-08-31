# {{PROJECT_NAME}} 视觉系统

本目录是项目 UI 的本地事实来源。页面和业务组件不应自行发明颜色、间距、圆角或通用交互；需要变更时，先更新这里的设计决策、token 或共享组件契约，再进入业务代码。

如果项目原本已有成体系 token、共享组件或主题机制，本目录不能成为平行设计系统。先用 `extract` 生成事实报告和 draft plan，用户确认 `preserve / augment / migrate` 后才执行 `adopt`；迁移绝不自动执行。既有系统以原 token 和组件为上游，通过 bridge 接入 canonical runtime，Catalog 不复制现有组件实现。

当前模式：`{{MODE}}`。初始化内容使用 Editorial Utility 与 Harbor Blue Light 默认基线；Coral Office 和 dark 是同一语义 token 契约下的可选主题，不是独立组件皮肤。深色导航仍只作为 `inverse` 变体。系统处于 `draft`；项目负责人确认色卡、明暗模式、关键设计决策和技术接入位置后，再将 `system.config.json` 中的状态改为 `active`。

## 目录契约

| 路径 | 作用 | 主要维护者 |
| --- | --- | --- |
| `DESIGN.md` | 产品上下文、设计判断、视觉方向与页面规则 | 产品 / 设计 / 前端 |
| `system.config.json` | 机器可读入口、模式、状态和运行时接入位置 | 前端 |
| `tokens/tokens.json` | 设计 token 的机器可读事实源 | 设计 / 前端 |
| `tokens/tokens.css` | 从 JSON 生成的运行时 CSS 变量入口，不手改 | 前端 |
| `tokens/tokens.ts` | 从 JSON 生成的类型安全 Token 路径、变量与主题声明，不手改 | 前端 |
| `tokens/tokens.schema.json` | 从编译器生成、供编辑器与工具使用的 JSON Schema，不手改 | 前端 |
| `components/manifest.json` | 共享组件族、状态、API 与实现路径 | 前端 |
| `components/kit.json` | 本项目从 Skill Library 选中的组件、依赖闭包与选择来源 | 产品 / 前端 |
| `runtime/react/src/` | React 核心组件、统一导出和唯一组件样式入口 | 前端 |
| `components/decisions.json` | 组件 `keep / adjust / hold` 决策 | 产品 / 设计 / 前端 |
| `components/external/` | 外部组件库的语义映射，不是默认运行时依赖 | 前端 |
| `visualizations/manifest.json` | 图型、数据、交互、动效和 token 的机器契约 | 产品 / 设计 / 前端 |
| `visualizations/lieflat/` | 48 个真实 preset 的 Gallery、主题桥、mono token 和来源记录 | 产品 / 设计 / 前端 |
| `visualizations/lieflat/runtime/` | 固定版本的 Chart.js / ECharts、许可证和 SHA256 清单 | 前端 |
| `catalog/catalog-foundation.css` | Catalog 共用的外壳、字体和交互基础 | 设计 / 前端 |
| `catalog/src/catalog.tsx` | 直接导入真实组件的 Catalog 源码 | 设计 / 前端 |
| `catalog/component-library.js` | 可确定性重建的离线 Catalog bundle | 前端 |
| `catalog/component-library.css` | Catalog 专属导航与预览布局，不实现组件皮肤 | 设计 / 前端 |
| `catalog/component-preview.css` | 通用页面组合预览的专属布局样式 | 设计 / 前端 |
| `catalog/*.html` | 人工浏览与评审入口 | 全员 |
| `checks/` | 防止绕过 token 和共享组件的基础检查 | 前端 |
| `checks/product-commitments.json` | Composition Kit 承诺的实现状态、代码位置与场景映射 | 产品 / 前端 |
| `checks/product-acceptance.config.mjs` | Composition Kit 承诺与真实产品 Playwright 场景 | 产品 / 前端 |
| `checks/verify-project.mjs` | 串联系统检查与产品场景的一键最终门禁 | 前端 |
| `agent-rules.md` | 供项目 `AGENTS.md`、`CLAUDE.md` 等引用的 AI 规则 | 前端 |
| `intake/extraction-report.json` | `extract` 命令生成的项目现状线索 | AI / 前端 |

## 接入清单

- 在应用全局入口导入 `tokens/tokens.css`，并把真实导入路径写入 `system.config.json`。
- 先读取 `components/kit.json`，再从 `runtime/react/src/index.ts` 消费本项目已经选择的共享组件；不要根据 Skill 全量 Library 猜测项目已安装组件。已有同名 export 被映射时，以 Manifest 记录的实现路径为准。只有 `availability=runtime-ready` 的组件可直接 import；`evidence-only`、`contract-only` 和 `external-required` 分别表示待移植、仅有契约和必须采用成熟 adapter。
- 默认运行时提供 `SearchableSelect`，业务代码不得直接导入其底层 `react-aria-components` 依赖，也不得手写不完整 combobox。
- 根据项目上下文完成 `DESIGN.md`，明确仍待确认的决策。
- `BrandAttribution` 默认纳入项目能力，初始只在 `system.config.json` 记录 `status="deferred"`。视觉系统确认前不得展示 Catalog 署名预览，不得询问位置、颜色、材质或重点色，也不得让默认品牌蓝影响产品色板；用户明确拒绝时才改为 `disabled`。视觉系统基本确认后，再在 `catalog/component-library.html#brand-attribution` 复核 `brand / grayscale / grayscale-reverse / monochrome / inverse`、`metallic / flat` 与 `focus-and-orbit / orbit-only`，根据现有背景、重点色、明暗模式和界面密度给出一个样式首选及一个安全 fallback。产品形态、Shell / 导航和主要页面清单基本确认后，才完成桌面、移动、认证 / 授权、已登录首页及无 Shell fallback 的 placement map，并由位置推导 `standard-stacked / compact-horizontal` 与响应式迁移。用户确认后统一写入 `system.config.json`、`DESIGN.md` 和项目 token；SPACE 点缀色只通过 `--brand-attribution-accent` 覆写，AI 独立色默认 `#3D63FF` 且只通过 `--brand-attribution-ai` 覆写，两者都不得由业务页面散传。同一视口最多一个可见实例；产品结构变化时必须重新评估落位。
- 将 `agent-rules.md` 的受控区块写入项目 AI 规则文件。
- 把 `checks/` 中的检查命令接入本地验证或 CI。
- 修改 Token 时只编辑 `tokens/tokens.json`，再运行 `node .\checks\sync-tokens.mjs build`；提交前运行 `check`，需要查看逐行漂移时运行 `diff`。CSS、TypeScript 和 Schema 都是生成产物。
- `full` 包的 Catalog 直接渲染真实组件；修改 `catalog/src/catalog.tsx` 或运行时后，执行 `node .\checks\build-component-catalog.mjs build`，提交前执行 `check`。按需 Kit 不复制全量 Catalog；需要浏览全部能力时打开 Skill Library，需要项目视觉对齐时基于当前 Kit 生成局部 HTML 预览。
- 修改 Catalog 或 Lieflat 派生层时，不得建立独立色板；共同表面、文字、圆角和动效都从 `tokens/tokens.css` 读取。
- 页面包含图表时，先完成 `Visualization Kit`，锁定 preset 谱系，再从真实 Gallery 提取模板；可交互参考见 `catalog/component-library.html#visualization/lupi` 的二级菜单。
- 图表脚本只能从 `visualizations/lieflat/runtime/` 读取固定依赖，不得把模板改回远程 CDN；移动端复杂图形保持原始信息尺度并在图形容器内浏览。
- 运行 `node .\checks\check-visualization-module.mjs`，确认图型契约、预览、键盘补丁、本地运行时和 token 同步。
- 运行 `node .\checks\check-component-runtime.mjs` 和 `node .\checks\check-ui-contract.mjs`，确认实现/export/Manifest 一致且业务代码未绕过共享契约。
- 既有系统运行 `node .\checks\check-adoption-contract.mjs --root .`。配置必须绑定确认后的 `projectIdentity`，组件来源闭包使用 `fileClosure v3`，UI baseline 使用不可变 generation/current 指针。
- 运行 `node .\checks\visual-regression.mjs test`，验证桌面、窄屏、移动端和 reduced-motion 基线；只有审阅变化后才执行 `update`。
- 应用 route 需要用户手工启动目标服务并配置 external baseUrl；`startCommand` 只提供建议，任何平台都不得自动执行。没有 route 时如实记录 `not-configured`。
- 实现页面或流程后，把 `DESIGN.md` / Composition Kit 中的验收承诺按相同 ID 写入 `checks/product-commitments.json`，填写实现状态、代码锚点和场景 ID；场景实现写入 `checks/product-acceptance.config.mjs`。每条必选承诺至少绑定一个真实场景，每个场景必须归属某条承诺。
- 开发中可运行 `npm run verify:system`。正式交付前在本目录运行 `npm run verify`；配置为空、业务 UI 合约违规、组件/Catalog/视觉检查失败或产品场景失败都会阻断交付。

## 更新保护

脚手架使用 `.design-consultant-lock.json` 记录生成文件指纹。再次执行 `update` 时，只会更新自生成后未被修改的文件；用户改过的文件会保持原样，并在命令结果中标记为 `userManaged: true`。脚手架不会删除项目文件。

```powershell
node <design-consultant-skill>/scripts/manage-visual-system.mjs update --target . --mode {{MODE}} --dry-run
```
