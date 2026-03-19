# Content Layering Inventory

## 1. 目的

本文件用于盘点 `project-manager-suite` 当前与未来的内容分层，并明确公开版发布前必须补齐哪些实物。

本文件属于内部设计治理清单，不作为主入口或子 skill 的运行时依赖。

目的不是描述目录结构，而是明确：

1. 哪些内容属于基础公开能力
2. 哪些内容属于公开低配模板
3. 哪些内容应保留为私有增强逻辑
4. 哪些内容应保留为私有增强模板 / 案例
5. 当前哪些文件已经可以归类，哪些仍待定
6. 公开版发布前哪些内容必须具备，哪些暂可后补

---

## 2. 分层标准

本清单采用 4 类分层。

### A. 基础公开能力

定义：

- 必须公开
- 保证业务团队能跑完整基础闭环

### B. 公开低配模板 / 说明

定义：

- 可以公开
- 提供基础模板或基础说明
- 允许未来存在更高质量私有增强版

### C. 私有增强逻辑

定义：

- 不建议公开
- 直接决定判断质量和效果上限

### D. 私有增强模板 / 案例

定义：

- 不建议公开
- 是高质量资产积累
- 直接影响输出质量差异

---

## 3. 当前已存在文件分层

### 3.1 套件根目录

| 文件 | 建议分层 | 说明 |
|---|---|---|
| `README.md` | A | 套件入口说明，必须公开 |

### 3.2 套件级 docs

| 文件 | 建议分层 | 说明 |
|---|---|---|
| `docs/design/project-progression-workflow.md` | A | 项目推进工作流图，适合公开解释运行方式 |
| `docs/design/package-conventions.md` | C | 套件设计约定，属于内部设计定义层 |
| `docs/design/open-core-strategy.md` | C | 开源策略与商业化边界，属于内部设计定义层 |
| `docs/design/content-layering-inventory.md` | C | 分层与发布前必备清单，属于内部设计定义层 |
| `docs/design/project-manager-suite-product-design.md` | C | 套件唯一设计主文档，承载产品定位、设计思路、实施策略和关键演进摘要 |
| `docs/design/global-files-architecture.md` | C | 全局文件总体架构说明，属于内部设计定义层 |

### 3.3 主入口 references

| 文件 | 建议分层 | 说明 |
|---|---|---|
| `skills/ai-project-manager/references/global-files-protocol.md` | A | 全局文件职责、字段合同与读写协议，属于公开运行骨架 |
| `skills/ai-project-manager/references/runtime.md` | A | 主入口运行协议，属于公开运行骨架 |
| `skills/ai-project-manager/references/routing.md` | A | 主入口路由条件与项目骨架规则，属于公开运行骨架 |

### 3.4 主入口 `ai-project-manager`

| 文件 | 建议分层 | 说明 |
|---|---|---|
| `skills/ai-project-manager/SKILL.md` | A | 当前版本属于基础公开能力，但后续需控制不要写入私有 heuristics |
| `skills/ai-project-manager/agents/openai.yaml` | A | UI 元信息，属于公开接口层 |

### 3.5 全局文件 starter pack 与主入口 references

| 文件 | 建议分层 | 说明 |
|---|---|---|
| `skills/ai-project-manager/assets/global-files/project-profile.md` | B | 基础项目画像模板，适合公开；未来可有私有增强版 |
| `skills/ai-project-manager/assets/global-files/project-rules.md` | B | 最小全局规则模板，适合公开；未来可有私有增强版 |
| `skills/ai-project-manager/assets/global-files/execution-plan.md` | B | 最小计划载体模板，适合公开；未来可有私有增强版 |
| `skills/ai-project-manager/assets/global-files/project-status.md` | B | 废弃兼容说明文件，用于明确不再默认创建状态文件 |
| `skills/ai-project-manager/assets/global-files/README.md` | B | starter pack 使用说明，适合公开 |
| `skills/ai-project-manager/references/tech.md` | B | 默认技术约束说明，当前属于公开低配约束层 |

### 3.6 当前基础子 skill 文件

| 文件 | 建议分层 | 说明 |
|---|---|---|
| `skills/requirements-starter/SKILL.md` | A | 基础需求整理能力，属于公开版闭环实物 |
| `skills/ui-ux-pro-max/SKILL.md` | A | 全局伴随的页面原型能力，当前属于公开版能力骨架 |
| `skills/prd-writer/SKILL.md` | A | 页面确认后的完整版 PRD 反推能力，当前属于公开版能力骨架 |
| `skills/delivery-planner/SKILL.md` | A | 基础计划拆解能力入口，当前属于公开版能力骨架 |
| `skills/engineering-executor/SKILL.md` | A | 基础工程执行能力入口，当前属于公开版能力骨架 |
| `skills/prd-test-case-generator/SKILL.md` | A | 基础测试用例生成入口，当前属于公开版能力骨架 |
| `skills/test-case-runner/SKILL.md` | A | 基础测试执行能力入口，当前属于公开版能力骨架 |
| `skills/test-and-acceptance/SKILL.md` | A | 基础人工点检与验收收口能力入口，当前属于公开版能力骨架 |
| `skills/cloud-deploy/SKILL.md` | A | 基础自动化部署能力入口，当前属于公开版能力骨架 |
| `skills/project-devlog/SKILL.md` | A | 全局伴随的基础状态回写能力，属于公开版闭环实物 |

### 3.7 当前待补的公开低配实物

| 文件 | 建议分层 | 说明 |
|---|---|---|
| `skills/requirements-starter/assets/*` | B | 需求整理模板与局部参考资料尚未补齐到当前目录结构中 |
| `skills/project-devlog/assets/*` | B | 状态回写模板与局部参考资料尚未补齐到当前目录结构中 |
| `skills/ui-ux-pro-max/assets/*` | B | 页面设计低配模板仍待补齐 |
| `skills/prd-writer/assets/*` | B | PRD低配模板仍待补齐 |
| `skills/delivery-planner/assets/*` | B | 计划拆解低配模板仍待补齐 |
| `skills/engineering-executor/assets/*` | B | 执行阶段低配模板仍待补齐 |
| `skills/prd-test-case-generator/assets/*` | B | 测试用例低配模板仍待补齐 |
| `skills/test-case-runner/assets/*` | B | 测试执行低配模板仍待补齐 |
| `skills/test-and-acceptance/assets/*` | B | 测试验收低配模板仍待补齐 |
| `skills/cloud-deploy/assets/*` | B | 自动化部署低配模板仍待补齐 |

---

## 4. 公开版发布前必备清单

### 4.1 必须具备的 A 类实物

以下内容在公开版发布前必须真实存在，而不能只停留在文档承诺：

- 主入口基础版 `SKILL.md`
- 至少 1 个可运行的基础子 skill
- 全局规则模板
- 项目画像模板
- 最小计划载体模板
- 状态回写兼容说明或默认日志回写说明
- 基础需求摘要模板
- 套件 README
- 全局文件协议
- 主入口运行模型
- 开源 / 私有分层策略

当前状态判断：

- 已具备：主入口基础版、套件级核心文档、全局规则模板、项目画像模板、最小计划载体模板、状态回写兼容说明、基础需求摘要模板、至少 1 个可运行基础子 skill 实物
- 未具备：无

### 4.2 首个公开版建议最低交付组合

为了让公开版从“设计”进入“可用”，当前建议第一个可发布组合至少包含：

- `skills/ai-project-manager/`
- `skills/requirements-starter/`
- `skills/project-devlog/`
- `skills/ai-project-manager/assets/global-files/project-profile.md`
- 最小计划载体模板
- 状态回写兼容说明

原因：

- `ai-project-manager` 负责建立上下文和路由
- `requirements-starter` 负责完成第一轮真正可用的需求整理
- `project-devlog` 负责最低限度状态沉淀
- 若没有计划载体和状态回写载体，公开版很难证明自己具备持续推进能力

### 4.3 发布前可暂缓项

以下内容重要，但可以不作为第一批公开版阻塞项：

- `ui-ux-pro-max` 完整基础版
- `prd-writer` 完整基础版
- `delivery-planner` 完整基础版
- `engineering-executor` 完整基础版
- `prd-test-case-generator` 完整基础版
- `test-case-runner` 完整基础版
- `test-and-acceptance` 完整基础版
- `cloud-deploy` 完整基础版
- 多行业案例
- 高质量示例集

前提是：

- README 和相关文档中必须明确当前公开版边界
- 不得宣称“完整开箱即用”但实际只有占位 skill

---

## 5. 未来新增内容的建议分层

### 5.1 未来应公开的内容

建议公开：

- 各基础子 skill 的基础版 `SKILL.md`
- 各基础子 skill 的基础模板
- 基础示例
- 基础运行说明

原因：

- 这些内容决定业务团队是否能独立跑完整闭环
- 若不公开，公开版就会退化成空壳

### 5.2 未来应保留的私有增强逻辑

建议保留：

- 动态追问策略
- 细粒度阶段判断 heuristics
- 高级任务拆分策略
- 高级协作角色识别
- 高级 routing 优先级
- 高级纠偏规则
- 反模式库

建议命名方式：

- `private-interview-playbook.md`
- `private-stage-heuristics.md`
- `private-routing-rules.md`
- `private-anti-patterns.md`

这些文件不应进入公开层。

### 5.3 未来应保留的私有增强模板 / 案例

建议保留：

- 高质量需求模板
- 高质量方案模板
- 高质量计划模板
- 行业案例映射
- 私有提示模板

建议命名方式：

- `private-templates/`
- `private-case-maps/`
- `private-prompts/`

---

## 6. 当前最关键的边界提醒

以下文件目前虽然归在公开层或灰度公开层，但后续迭代时最容易被写进私有逻辑：

### 风险文件 1：`runtime.md`

风险：

- 很容易逐渐写成完整访谈树

控制要求：

- 公开版只保留基础首轮访谈
- 动态追问规则另行进入私有层

### 风险文件 2：`routing.md`

风险：

- 很容易写入过多 heuristics

控制要求：

- 公开版只保留阶段定义和基础判断
- 复杂判断条件进入私有增强层

### 风险文件 3：各类模板文件

风险：

- 公开版模板容易不断被优化到接近私有资产

控制要求：

- 公开版只保留基础模板
- 高质量版本另放私有层

### 风险文件 4：基础子 skill 的 `SKILL.md`

风险：

- 很容易为了提升效果，直接把增强 heuristics 写进公开版主逻辑

控制要求：

- 公开版只保留基础流程、基础输入输出和最低必要判断
- 动态追问、复杂纠偏、高级分支策略进入私有层

---

## 7. 当前建议

基于当前盘点，建议立即执行：

1. 先补齐公开版发布前必备清单中的缺口
2. 优先实现 `requirements-starter` 与 `project-devlog` 的最小可运行版本
3. 同步补齐最小计划载体模板与最小状态回写模板
4. 后续新增文件时，先判断属于 A / B / C / D 哪一类再落盘
5. 对 `runtime.md`、`routing.md` 和各基础子 skill `SKILL.md` 重点设边界，避免它们自然长成私有层

---

## 8. 一句话结论

`project-manager-suite` 的内容分层不应只区分“公开 / 私有”，而应区分：

- 基础公开能力
- 公开低配模板 / 说明
- 私有增强逻辑
- 私有增强模板 / 案例

这样既能保证业务团队可用，又能保住内部版的质量壁垒。
