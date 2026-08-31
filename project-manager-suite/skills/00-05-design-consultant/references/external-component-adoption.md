# 外部组件库吸收策略

本文件定义如何判断 Astryx、Material、Fluent、Carbon、Radix、shadcn/ui 等外部组件库是否能被部门 skill 或具体项目吸收。

## 结论先行

外部组件库可以吸收，但要分层。

| 层级 | 是否可吸收 | 说明 |
|---|---|---|
| 设计原则层 | 可以 | 如 frame-first、语义 token、rows over cards、状态完整性、反模式守门。 |
| 组件分类层 | 可以 | 可吸收组件族、页面模板、状态覆盖和使用边界。 |
| 文档机制层 | 可以 | 可吸收 AI 操作链、dense 文档、JSON manifest、项目 agent rules。 |
| 代码适配层 | 谨慎 | 仅在具体项目技术栈、许可证、维护风险都匹配时，用 wrapper/adapter 接入。 |
| 直接 vendored 代码 | 默认不做 | 不把外部组件源码塞进本 skill；确需 vendoring 时要保留 license、版本、来源和安全审查记录。 |

部门 skill 的核心规则必须 vendored 到本地。外部组件库只能作为参考来源或具体项目的可选实现方案，不能成为 skill 运行时依赖。

## Astryx 专项判断

Astryx 可以被吸收，但吸收边界如下：

### 全量组件映射

本 skill 已沉淀 Astryx v0.1.4 CLI 返回的全量组件映射：

- 映射文件：`templates/astryx-component-map.json`
- 生成脚本：`scripts/generate-astryx-component-map.mjs`
- 来源命令：`npx astryx --json component --list`
- 当前覆盖：149 个组件
- 当前分布：`direct_map` 6 个、`semantic_map` 128 个、`pattern_only` 7 个、`defer` 8 个

当用户要求“一次性映射 Astryx 组件”“把 Astryx 已设计好的组件按我们的技术方案映射过来”“输出哪些能直接吸收”时，必须读取 `templates/astryx-component-map.json`。不要凭记忆补组件名，也不要把未出现在映射表里的组件说成已覆盖。

映射表能直接产出：

- Astryx 组件到部门 kit 组件族的对应关系。
- 每个组件的吸收层级：直接映射、语义映射、模式吸收、暂缓。
- 组件应补的 token、状态、可访问性和工程策略。
- P0/P1/P2/P3 的建设优先级。

映射表不能直接产出：

- 可直接运行的 React 组件代码。
- Astryx props 到部门组件 props 的逐项转换。
- 对未来 Astryx 新版本的自动覆盖承诺。

如果需要代码实现，把映射表当作 backlog 和设计约束，再读取目标项目的技术栈、现有组件入口和 token 源后落地。

### 可以吸收

- AI 操作链：先按产品意图生成组合包，再看模板骨架，再查组件文档。
- 组件族思路：AppShell、LayoutPanel、Table hooks、PowerSearch、CommandPalette、Chat Tool Calls、StatusDot、Token 等分类方式。
- 页面模板思路：AI Chat、Grouped Table、IDE、Settings、Analytics Dashboard 等高频页面骨架。
- 设计系统工程思路：token 源、theme build、运行时 CSS、组件变体、agent docs、doctor/upgrade 类守门。
- 反模式：不猜 props、不散写硬编码 token、不把密集列表包成卡片、不用 Badge 做装饰。

### 不直接吸收

- 不把 Astryx 作为部门默认 React 组件库。
- 不把 StyleX 作为部门默认样式技术。
- 不照搬 Astryx token 命名、主题包和视觉风格。
- 不在宿主插件、已有成熟设计系统或非 React 项目中强推 Astryx。
- 不把 Beta 阶段文档当作稳定权威；采用前要确认版本和 changelog。

### 具体项目可以采用的条件

只有同时满足以下条件，才建议把 Astryx 作为项目依赖：

1. 项目是 React 前端，且团队接受 npm 依赖。
2. 产品不是强宿主原生 UI，也不是必须使用 Material/Fluent/Polaris 等官方生态。
3. 团队认可 Astryx 的 Beta 风险、升级成本和包体/样式接入方式。
4. 项目需要较完整的 AppShell、Table、Chat、CommandPalette、Theme 体系。
5. 已在 `DESIGN.md` 里记录采用原因、版本、token 桥接和组件适配策略。

## 推荐吸收方式

### 1. 参考吸收

用于部门 skill 和多数项目。

输出方式：

```text
参考 Astryx 的组件分类和 AI 操作链，但不引入 Astryx 运行时。当前项目继续使用部门默认组件和 token。
```

### 2. 适配吸收

用于已有项目组件库需要增强的情况。

做法：

- 把 Astryx 的组件族映射到本项目组件族。
- 如果目标是全量评估，先读取 `templates/astryx-component-map.json`，按 `mapping_type` 和 `adoption_priority` 分批进入 backlog。
- 保留本项目命名和 API。
- 只借鉴状态、可访问性、页面模板和守门规则。
- 不改变业务页调用方式。

### 3. 依赖吸收

用于新 React 项目，且明确选择 Astryx。

做法：

- 作为项目依赖安装，而不是复制到 skill。
- 用 wrapper 暴露部门语义组件，例如 `DataTable`、`AppFrame`、`AgentEventRow`。
- 建立 token 桥接，业务代码只用部门语义 token。
- 在项目 agent rules 里写清楚 Astryx 的查询命令和禁止猜 props 的规则。

## 决策清单

采用外部组件库前回答：

1. 这是参考、适配，还是依赖？
2. 项目技术栈是否匹配？
3. 是否已有官方生态必须优先？
4. 许可证和版本是否记录？
5. token 如何桥接？
6. 组件 API 是否通过 wrapper 统一？
7. 未来升级和替换成本由谁承担？
8. 它解决的是组件质量问题，还是只是审美偏好？

如果无法回答，默认只做参考吸收。
