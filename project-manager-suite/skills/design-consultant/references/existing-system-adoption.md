# 既有设计系统接入

当项目已经出现成体系的 token（coherent tokens）、共享组件（shared components）、主题机制或明确的设计资产时，先把它视为 `existing-design-system`。不要因为系统不完整就直接运行 greenfield 脚手架；先 `extract`，再由事实决定 `preserve / augment / migrate`。

## 三类入口

| 路由 | 判断依据 | 首个动作 |
| --- | --- | --- |
| `greenfield` | 没有可复用 UI、成体系 token 或共享组件 | `init --dry-run` |
| `existing-ui-without-system` | 已有页面和零散样式，但没有稳定 token、共享组件或主题契约 | `extract --dry-run`，先盘点再决定是否初始化 |
| `existing-design-system` | 有成体系 token、共享组件、主题机制或设计资产，成熟度不限 | 读取本文并执行 `extract --dry-run` |

只要命中成体系 token 或共享组件，就必须进入 `existing-design-system` 参考流程。检测结果只负责路由，不授权迁移；绝不自动迁移。

## 分析与确认闸门

1. `extract` 只收集项目事实，生成 `intake/extraction-report.json` 和 `adoption/adoption-plan.json` 的 draft plan。
2. 所有自动候选保持 `proposed`。事实报告中的 `optimizationAdvice` 可以提出非破坏性改进，但不授权写入、替换或迁移。
3. 用户逐项确认策略、token 映射、八个核心组件分类、运行时导入、legacy baseline 与可选视觉 route 后，才把计划改为 `confirmed`。
4. 只有已确认计划可以执行 `adopt`。未确认、证据不完整、映射冲突或来源漂移都必须失败关闭。
5. `migrate` 也只生成分批计划、bridge 与已批准 adapter；绝不自动改写业务 import、CSS class、组件 props 或页面实现。

## 策略选择

### `preserve`

现有 token、组件和主题继续作为上游事实源。允许提出非破坏性优化建议，但不得生成默认 Button、覆盖 token 或建立平行组件皮肤。Catalog 只展示真实来源。

### `augment`

保留已存在或仍待确认的能力，只为明确批准的缺口生成 adapter 或组件。不得因为语义名称不同就重复生成同类组件。

### `migrate`

为需要逐步收敛的项目生成批次、过渡 bridge、退出条件与回滚点。迁移计划不等于执行授权，业务页面仍由维护者分批修改。

## 产物与所有权

- `intake/extraction-report.json`：项目事实、证据路径、摘要与稳定 identity 输入。
- `adoption/adoption-plan.json`：draft/confirmed 状态、策略、token/component 映射、legacy baseline 和可选视觉验证路由；confirmed 原始字节及摘要必须与 lock 完全一致。
- `system.config.json`：运行时入口与 integration 指针；配置必须绑定已确认的 `projectIdentity`。
- `tokens/external-map.json` 与 `tokens/external-bridge.css`：把现有 token 映射到 canonical token。light/dark selector 都要有证据；缺源、冲突和未确认映射直接失败。
- `runtime/react/src/index.ts`：唯一 canonical runtime barrel。React adapter 只在类型证据成立且用户确认后生成。
- `components/manifest.json`：八个核心组件必须明确归类为 `direct / wrapper / generate / manual / reject`，没有隐式 fallback。
- `package.json`：既有系统使用 adoption-specific package，不与 greenfield package 混用。没有 React 组件运行时的项目使用 core package，仍可独立安装并运行 adoption/UI contract 检查。
- `.design-consultant-lock.json`：记录管理边界、确认状态与动态产物证明；组件来源闭包使用 `fileClosure v3`，任何依赖漂移都阻断检查。
- `checks/ui-contract-baseline.json`：不可变 generation/current 指针共同定义 UI baseline；不得原地覆盖历史 generation。

Catalog 必须按“现有样式 -> token bridge -> canonical runtime”的顺序消费真实能力。它只消费 canonical runtime + bridge，不维护仿制组件实现。

## Legacy ratchet

老项目可以先写入 UI baseline：已登记违规不阻断，新违规返回非零退出码，已修复项通过显式 `--prune-baseline` 安全移除。baseline 是渐进收敛工具，不是永久豁免，也不会触发批量自动修复。

## 可选 route 视觉验证

应用视觉验证只接受用户手工启动的目标服务和 external baseUrl。`startCommand` 在 Windows、macOS、Linux 都只是建议文本，工具、文档和 CI 均不得执行它，也不要提供所谓 allow 开关。

- 没有 route 时返回 `not-configured`，不得冒充验证通过。
- 有 route 时把 `visualVerification` 设为 `configured`，填写纯 HTTP(S) origin 的 `baseUrl`，并为每条 route 明确 `id / path / viewports`；每条 route 必须同时包含 desktop 与 mobile。随后由用户手工启动服务，桌面和移动端都必须通过。
- 基线采用不可变 `generations/<id>/` 与 `current.json` 指针；更新必须创建新 generation，不能覆盖旧截图。

## 非 React 项目

Vue/Svelte 等项目仍可生成事实报告、draft plan、设计契约、token bridge、core 检查包和守门计划，但不得声称或生成 React adapter。自动理解任意非 React 组件 API 不在本版本范围内。

## 命令顺序

```powershell
node <skill-path>/scripts/manage-visual-system.mjs extract --target <project> --dry-run
node <skill-path>/scripts/manage-visual-system.mjs extract --target <project>
# 人工审阅并确认 adoption/adoption-plan.json
node <skill-path>/scripts/manage-visual-system.mjs adopt --target <project> --dry-run
node <skill-path>/scripts/manage-visual-system.mjs adopt --target <project>
Set-Location <project>/design-system
npm install --ignore-scripts
node <project>/design-system/checks/check-adoption-contract.mjs --root <project>/design-system
```

真实 v0.9 greenfield 项目在首次 v0.10 `update` 前，先显式执行 `migrate-lock --dry-run`。该命令只接受完整、未漂移且来源清单与固定 v0.9 基线一致的 lock；确认后再执行 `migrate-lock`，它只补充 workflow provenance，不改写受管文件。
