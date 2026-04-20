---
name: delivery-planner
description: 当任务涉及代码仓库内的开发实施计划时使用，例如功能开发、缺陷修复、重构、联调、发布前改造的 Phase / Task 拆解、计划更新、完成标准补强与发布闸门回写。仅限代码开发计划；不要用于产品排期、运营计划、纯文档执行计划、PRD 编写计划、测试执行排期或其他非代码项目计划。即使用户没有明确提到“skill”或“方法论”，只要语境明确是在做代码开发计划，也应触发本 skill。
version: 1.2.0
changelog: |
  v1.2.0 – 移除技术栈访谈与宿主文件生成逻辑；改为在 Step 1 直接读取套包内置
           tech-stack.md（skills/ai-project-manager/references/defaults/tech-stack.md）作为技术参考。
  v1.1.0 – 增加脚本驱动：Step 0.5 前置运行 collect-upstream-context.mjs 收集上游产物清单，
           Step 5 产出自检改用 validate-plan-structure.mjs 结构化校验，消除纯 prompt 纪律的漏读风险。
---

# delivery-planner

本 skill 用来生成或更新面向 AI 执行、人类 review 的执行计划文档。它沉淀的是一套可复用的方法论，而不是某个项目专属计划的外壳。

与纯 prompt 驱动的核心差异：**在进入任何读取步骤之前，必须先运行 `collect-upstream-context.mjs` 脚本**，由脚本程序化发现并清单化上游 PRD + foundation 文档，消除依赖 prompt 纪律的漏读风险。**计划产出后，必须运行 `validate-plan-structure.mjs` 脚本**做结构化校验。

相关协议：
- 设计流水线与产物目录：[`../../PIPELINE.md`](../../PIPELINE.md)
- 主入口运行协议：[`../ai-project-manager/references/core/runtime.md`](../ai-project-manager/references/core/runtime.md)
- 全局文件协议：[`../ai-project-manager/references/core/global-files-protocol.md`](../ai-project-manager/references/core/global-files-protocol.md)
- 当前执行驾驶舱模板：[`../ai-project-manager/assets/global-files/execution-plan.md`](../ai-project-manager/assets/global-files/execution-plan.md)

## 按任务阅读

- 想看什么时候该用这个 skill：看 [什么时候使用](#什么时候使用)
- 想看上游文档怎么先收集：看 [Step 0.5：运行上游产物收集](#step-05运行上游产物收集硬性前置不可跳过)
- 想看计划正文怎么写：看 [Step 3：按完整执行计划协议输出](#step-3按完整执行计划协议输出)
- 想看产出文件落到哪里：看 [产出要求](#产出要求)
- 想看和 `execution-plan.md` 怎么分工：看 [与 `execution-plan.md` 的关系](#与-execution-planmd-的关系)

## 目录索引

- 设计流水线：[`../../PIPELINE.md`](../../PIPELINE.md)
- 全局文件协议：[`../ai-project-manager/references/core/global-files-protocol.md`](../ai-project-manager/references/core/global-files-protocol.md)
- 主入口运行协议：[`../ai-project-manager/references/core/runtime.md`](../ai-project-manager/references/core/runtime.md)
- 计划模板：[`./templates/delivery-plan-template.md`](./templates/delivery-plan-template.md)
- 结构说明：[`./references/plan-anatomy.md`](./references/plan-anatomy.md)
- 自检门禁：[`./references/quality-gates.md`](./references/quality-gates.md)

## 与 `execution-plan.md` 的关系

- `delivery-plan-<slug>.md` 是正式开发计划正文权威源，默认位于宿主项目 `docs/plans/`
- `execution-plan.md` 是主入口维护的当前执行驾驶舱，只保留正式计划入口、当前活跃任务、下一步动作和完成标准摘要
- 本 skill 负责生成或更新正式计划正文，不负责把完整 Phase / Task 正文复制进 `execution-plan.md`
- 当本 skill 完成新建或更新后，应由 `ai-project-manager` 把摘要同步回 `execution-plan.md`
- 驾驶舱摘要必须使用 `templates/delivery-plan-template.md` 顶部的固定区块，不允许自由发挥字段名或顺序
- 仅在以下事件发生时同步摘要：首次生成正式计划、当前活跃 Phase / Task 变化、阻塞状态实质变化、阶段跨越

## 非目标

本 skill 不负责：
- 代替 PRD skill 编写或重构 PRD
- 代替日志 skill 写开发日志
- 代替测试用例 skill 生成测试用例
- 直接进入代码实现或测试执行
- 把计划写成需要人自己完成大量技术分析的手工待办

## 什么时候使用

出现以下意图时，优先使用本 skill：
- 写代码开发计划
- 写代码实施计划
- 按 PRD 为开发任务拆 Phase / Task
- 更新已有开发计划的状态、依赖、完成标准、发布闸门
- 把需求、PRD 与代码现状差距转成正式开发执行文档

以下场景不要使用本 skill：
- 产品路线图、里程碑、版本排期或项目管理计划
- 运营执行计划、活动排期、业务推进计划
- 纯文档整改计划、PRD 编写或 PRD 改版计划
- 测试执行排期、测试报告排期、非开发类验收计划
- 不涉及代码仓库落点的泛项目执行计划

## 工作方式

### Step 0：先判断任务类型

先确认当前属于哪一种：
- **新建计划**：从需求、PRD、现状差距开始，输出一份完整计划
- **更新计划**：已有计划文档，补状态、日期、依赖、验收口径、风险、闸门
- **局部补 Phase**：只修改某个阶段，但必须同步更新看板、风险、反向索引等关联章节

---

### Step 0.5：运行上游产物收集（硬性前置，不可跳过）

**在读取任何项目文件之前**，执行以下命令，获取上游产物清单：

```bash
node <suite-path>/skills/delivery-planner/scripts/collect-upstream-context.mjs <hostRoot> --json
```

> 如果项目不在默认的 `docs/prd/` 目录存放文档，追加 `--docs-dir <相对路径>` 参数。
> 如果项目未安装 suite（`.agent/` 目录不存在），改用 suite 的绝对路径运行脚本。

**读取脚本输出后，按以下逻辑分支执行：**

#### 分支 A：`canProceed: true`（所有必需文档存在）

按脚本输出的路径清单作为 Step 1 的**强制读取清单**，顺序如下：

1. `prdMain.path`（最高优先级，必读）
2. `foundations` 数组中所有条目（按 type 顺序：glossary → schema → api → delivery）
3. `prdFeatureList.path`（若存在）
4. `prdChildren` 数组（按任务相关性选读，不要全部整包读取）
5. `explainers` 数组（按任务相关性选读）

> 对 `isLarge: true` 的文件，**禁止整包读取**，必须按章节定位读取。

#### 分支 B：`canProceed: false`（必需文档缺失）

进入**失败分支**：

1. 输出 `requiredMissing` 列表，说明哪些文档缺失
2. 说明缺失文档对计划完整性的影响
3. 允许输出"阻塞版计划骨架"，但缺失依据的 Task 必须显式标注 `状态: 阻塞-等待PRD`
4. 不要猜需求、伪造核心文件路径、填空式写完成标准

#### 分支 C：仅有 `warnings`，`canProceed: true`

可进入正常流程，但须在计划头部元信息中注明警告条目（如文件过大需分章节读取、发现未命名规范的文档等）。

#### 分支 D：`meta.mode: 'fallback'`（未匹配到 PIPELINE 命名约定）

当项目没有使用 PIPELINE.md 流水线产出文档时，脚本会自动切入兜底模式，按关键词模糊分类 docs/ 中的 .md 文件。

1. 将脚本输出的分类结果（`prdDocs` / `foundationDocs` / `explainerDocs` / `otherDocs`）作为**参考清单**，不作为强制读取清单
2. AI 需要自行打开每个匹配文件的头部（前 30 行），确认文件类型后再决定读取深度
3. 在计划头部元信息中注明 `上游发现模式: 兜底模式（未检测到 PIPELINE 命名约定）`
4. 不触发失败分支，`missingExpected` 检测被禁用
5. `canProceed` 始终为 `true`

---

### Step 1：在脚本清单基础上补读仓库规则与技术参考

脚本只扫描 docs/ 产物文件，不扫描仓库规则源。在消费脚本输出后，还需补读：

读取顺序见：
- `references/source-loading-order.md`（第二节〜第三节：仓库规则源、现有计划源）

**【必须读取】套包内置技术栈参考文件：**
- `<suite-path>/skills/ai-project-manager/references/defaults/tech-stack.md`

> 本文件是套包默认技术选型参考，用于在写任务拆解、核心文件路径、完成标准时对齐技术栈。
> 宿主项目若已有明确技术约定（如项目规则文件、README 或 BRD 中注明），以宿主约定为准，tech-stack.md 作为兜底参考。
> 所有 Task 的技术实现细节（框架、语言、ORM 等）应与实际使用技术栈一致，避免混用不同框架的实现方式。

生成新计划前，再读取：
- `templates/delivery-plan-template.md`
- `references/plan-anatomy.md`

### Step 2：先建立目标态，再写任务拆解

先基于 PRD 和规则确认“应该做到什么”，再读取真实代码、SQL、接口、页面文件确认“现在做到哪一步”。

没有读到真实依据时，不要输出看似完整但内容空泛的计划。

### Step 2.5：把增强要求翻成执行规则，不要把概念名词直接塞进计划

当任务需要更高执行稳定性、可追溯性或更适合 harness 评估时，按以下映射增强计划：
- 把需求写成可追溯链，至少形成 `Requirement/PRD -> Task -> Verification Method -> Evidence`
- 把关键 Phase 写成可进入、可退出的过程单元，补 `Entry Criteria` / `Exit Criteria`
- 按交付物或结果拆解，不把计划写成纯动作流水账
- 完成标准要体现共享的“什么算完成”，未满足则不能标记完成

### Step 3：按完整执行计划协议输出

默认输出必须包含以下章节：
1. 计划头部元信息
2. 本计划使用指南
3. PRD 加载约束
4. 读前门禁 / AI 自检清单
5. 完成前验证门禁
6. 差距基线
7. 分工与边界
8. 执行阶段（Phase / Task）
9. 任务看板
10. 发布闸门
11. 风险与应对
12. AI 执行示例
13. PRD → 任务反向索引

每个任务默认必须包含：
- `PRD 双链·读`
- `核心逻辑`
- `核心文件`
- `完成标准`
- `Owner`
- `前置`
- `状态`

对“新建计划 / 跨端任务 / 高风险发布 / 真实联调链路改造”这类场景，默认启用以下增强字段：
- `Requirement ID`
- `Verification Method`
- `Evidence`
- `Failure Handling`

对关键 Phase，默认补：
- `Entry Criteria`
- `Exit Criteria`

章节写法和字段说明见：
- `references/plan-anatomy.md`

### Step 4：把方法论写进计划，而不是留在对话里

计划中必须显式体现：
- AI 直接执行、人类 review 的协作目标
- PRD 分层加载约束
- 技术判断步骤默认 `AI 执行 -> 人审核`
- 完成前必须做真实验证，而不是只看 build 或局部单测
- 状态、日期、依赖、闸门、风险、反向索引要可追溯
- 证据不足、需求冲突、验证资产缺失时的失败分支

### Step 5：产出后自检（脚本 + 人工）

完成初稿或更新稿后，**必须先运行结构校验脚本**：

```bash
node <suite-path>/skills/delivery-planner/scripts/validate-plan-structure.mjs <计划文件路径> --json
```

**脚本会自动检查**：
- 13 个必需章节是否齐全
- 每个 Task 是否具备 7 个必填字段
- 完成标准中是否出现高风险模糊词（`数据完整`、`配置补齐`、`符合预期` 等）

**脚本报错（`passed: false`）时，不能宣称计划完成**，必须先修正再重新校验。

脚本通过后，再人工逐项自检：
- 是否真的引用了 PRD / API / 数据库 / 代码 / 验证资产
- 如果是更新计划，是否同步回写了状态、日期、依赖、看板、风险或反向索引

完整自检清单见：
- `references/quality-gates.md`

## Harness 增强协议（兼容模式）

兼容原则：
- 现有 13 章节骨架和 7 个 Task 默认字段继续保留，不推倒重来
- 增强内容优先加在关键 Phase / 关键 Task 上，不要求一次把历史计划全部重写
- 新建计划默认按增强协议写；更新计划按“受影响范围”补增强字段

增强协议最少补齐三件事：
1. 关键需求有可追溯链，而不只停留在 `PRD 双链·读`
2. 关键阶段有进入 / 退出条件，而不只写“开始做 / 做完了”
3. 关键任务有验证方法与证据落点，而不只写抽象完成标准

## 强制约束

- **Step 0.5 不可跳过**：未运行 `collect-upstream-context.mjs` 前，禁止开始写计划
- **Step 5 脚本校验不可跳过**：未运行 `validate-plan-structure.mjs` 且通过前，禁止宣称计划完成
- 禁止一次性读取整个 PRD 目录
- 必须先读 PRD 导航文档，再按任务读取相关章节
- 大文件（脚本输出 `isLarge: true`）必须按章节定位读取，不要整包拉入上下文
- 编写待办和任务转述时，必须回溯原始计划与真实文件，不得复述聊天摘要
- 任何新增验收口径，如果会影响后续执行，必须写回计划正文，不得只留在聊天里
- 没有读到 API / 数据库 / 代码 / PRD 中至少与任务相关的依据前，不要输出“完成标准已定义”的计划
- 如果 PRD 缺失、章节定位不到、代码与 PRD 冲突，必须显式输出阻塞点或待审核决策，不得假装已形成完整计划
- 如果缺少验证资产，必须把发布闸门标为阻塞，或把相关 Task 标记为“待补验证依据”

## 产出要求

### 新建计划

- 默认落到宿主项目的 `docs/plans/`，主文件名为 `delivery-plan-<slug>.md`
- 计划标题、目标、Phase 命名、看板状态要与当前仓库术语一致
- 结构默认使用 `templates/delivery-plan-template.md`
- **计划头部元信息中必须记录 `collect-upstream-context.mjs` 的运行结论**（slug、扫描时间、是否进入失败分支）
- 不要把完整正文回写进 `execution-plan.md`；驾驶舱只同步入口和摘要
- 顶部“驾驶舱摘要”区块必须填写完整，作为后续同步 `execution-plan.md` 的唯一机读来源

### 更新计划

- 在原文件上直接回写，不要另起一份“修订版草稿”替代正式计划
- 同步更新状态、日期、依赖、发布闸门、风险与应对、反向索引中受影响的部分
- 若本次升级了验收口径，必须把新口径写入计划正文

### 局部补 Phase

- 只补一个 Phase 也不能只改该小节
- 至少同步检查：任务看板、风险与应对、发布闸门、PRD → 任务反向索引

## 失败分支

### 场景 1：PRD 缺失或章节无法定位

- 不要猜需求
- 先输出缺失清单、影响任务和待补资料
- 允许给出“阻塞版计划骨架”，但相关 Task 状态必须显式标注阻塞原因

### 场景 2：代码现状与 PRD 冲突

- 不要私自选择一边当真相
- 先把冲突点、影响范围、建议决策写入风险或待确认项
- 技术判断默认写成 `AI 执行 -> 人审核`

### 场景 3：验证资产缺失

- 不要把“无法验证”包装成“已完成”
- 相关 Task 的 `Verification Method` 和 `Evidence` 写明缺口
- 发布闸门必须体现“验证资产待补”

## 写作原则

- 计划写给 AI worker，不是写给人类开发者自由发挥
- 任务粒度要小到可以直接执行，但不要碎成没有业务含义的命令列表
- `核心逻辑` 写“为什么做、规则是什么”，不是只写“修改文件”
- `核心文件` 必须列出真实落点，而不是写“相关代码”
- `完成标准` 必须可核查、可验证、可回归
- Task 拆解优先围绕“可验证交付物 / 结果”，不要只按技术动作切分
- 单个 Task 默认应是可在一个执行会话内闭环的 work package；若跨多个端、多个子系统或核心文件过多，优先继续拆分
- 任务标题可以保留动作表达，但完成标准必须落到可交付结果

## 快速出口

- 需要运行上游发现脚本时：`node <suite-path>/skills/delivery-planner/scripts/collect-upstream-context.mjs <hostRoot> --json`
- 需要运行产出校验脚本时：`node <suite-path>/skills/delivery-planner/scripts/validate-plan-structure.mjs <计划文件路径> --json`
- 需要模板时：读取 `templates/delivery-plan-template.md`
- 需要章节说明时：读取 `references/plan-anatomy.md`
- 需要判断先读哪些资料时：读取 `references/source-loading-order.md`
- 需要做产出自检时：读取 `references/quality-gates.md`
