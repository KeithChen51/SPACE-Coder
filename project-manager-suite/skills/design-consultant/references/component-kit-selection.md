# 全量 Library 与项目 Kit

## 两层边界

- Skill Library：`templates/component-manifest.json` 与 `templates/component-library.html` 保存全部组件族、可用性、规范和预览，是跨项目的能力目录。
- Project Kit：项目内的 `components/kit.json`、裁剪后的 `components/manifest.json`、运行时组件文件与统一 barrel，只包含当前项目已经选择的组件及其必要依赖。

项目不得为了“以后可能会用”复制全量 Library。后续新增需求时重新读取 Skill Library，更新 Composition Kit，再运行脚手架扩充 Project Kit。

## 标准选择顺序

1. 先完成 Composition Kit，列出页面与流程真正使用的 component family。
   - C 端 Kit 同时写明 `product_archetype`、`journey_stage`、`growth_pattern`、`trust_evidence`、`mobile_navigation`、`transaction_state` 与 `recovery_state`。
   - 身份、支付、预约和订阅行为不确定时保持草案，获得用户确认后再登记验收承诺。
2. 从全量 Manifest 读取 family `id` 和 `availability`，不得凭组件显示名称猜 ID。
3. 新项目优先使用 `--components <id,id,...>` 精确安装；脚手架会校验 ID，并补齐已声明的组件依赖。
4. 只有需求与预设档位完整吻合时，才使用 `--kit-profile`。
5. 先执行 `--dry-run`，核对 `kit.componentIds`、运行时数量和待创建文件，再正式写入。

示例：

```powershell
node <skill-path>/scripts/manage-visual-system.mjs init --target <project-path> --mode default --components app-frame,button,field,choice-field,dialog,status --dry-run
node <skill-path>/scripts/manage-visual-system.mjs init --target <project-path> --mode default --components app-frame,button,field,choice-field,dialog,status
```

## 快捷档位

| 档位 | 适用情况 | 说明 |
| --- | --- | --- |
| `core` | 普通内部工具、表单与基础流程 | 基础框架、操作、字段、弹层、资源状态、状态标识和技术署名 |
| `data-workspace` | 筛选、指标、表格、分页和移动记录卡构成的数据工作台 | 包含完整运行时组件，也保留 AppFrame 等按场景契约 |
| `agent-workspace` | Agent 过程、审批、命令入口与产物列表 | 复杂命令面板仍遵守 `external-required`，不会生成近似实现 |
| `full` | Library 维护、全量演示或明确需要全部组件族 | 会复制完整离线 Catalog；不作为新业务项目默认选择 |

档位不是新的设计模式，也不替代 `default / customize / design-system`。前者决定组件范围，后者决定视觉客制化深度。

`core`、`data-workspace` 与 `agent-workspace` 已包含 Form Selection、Overlay、Action Overlay 和 Feedback 的通用底座。`data-workspace` 还包含 `MultiSelectField / MetricCard / TertiaryNav / TextField / FilterBar / DataTable / MobileRecordCard / DefinitionList / TablePagination` 运行时。`AppFrame / EventRow / FileArtifactRow` 仍按场景提供契约，`CommandPalette` 仍要求外部适配。若项目不使用其中某个家族，优先改用精确 `--components`，不要为了套用档位保留闲置运行时。

相邻组件的选择规则见 `references/component-family-boundaries.md`。Composition Kit 应先完成边界判断，再把最终 family id 交给脚手架。

C 端所需 family 如果仍为 `contract-only`，只能在 Kit 中声明结构、状态和适配责任，不能声称已提供运行时实现；由项目共享组件映射或后续明确实现任务承接。

## 生成结果

按需 Kit 会生成：

- `components/kit.json`：选择来源、请求 ID、依赖补齐项、最终 ID 和运行时 ID。
- `components/manifest.json`：只保留最终 ID 对应的 family；继续保留 `runtime-ready / evidence-only / contract-only / external-required` 语义。
- `runtime/react/src/`：只生成所选 `runtime-ready` 组件、必要资源、共享样式和统一导出。
- `system.config.json`：记录 Kit 入口与选择事实。

按需 Kit 不复制全量 `catalog/component-library.html`。需要比较全量能力时打开 Skill Library；需要项目局部视觉对齐时，基于当前 Kit 生成项目专用 HTML 预览。

## 兼容与移除

- 旧命令未提供 `--kit-profile` 或 `--components` 时，按 `full / legacy-full` 处理，保证 v0.10 既有项目更新时不被隐式删减。
- `update` 默认沿用项目 `system.config.json` 中记录的 Kit 选择。
- 变更选择时显式传入新档位或组件 ID。脚手架会更新 Manifest 与 barrel，但不会自动删除旧文件；先确认无业务引用，再由项目维护者明确删除残留文件。
- 已有成熟视觉系统的项目仍先走 `extract -> confirm -> adopt`。Project Kit 的选择不能绕过既有 token、组件映射与迁移确认。
