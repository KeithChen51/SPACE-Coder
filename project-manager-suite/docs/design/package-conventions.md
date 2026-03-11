# Package Conventions

## 1. 命名规范

- 对外产品名：`项目经理`
- 主入口 skill 名：`ai-project-manager`
- 套件名：`project-manager-suite`

## 2. 目录规范

- 套件根目录只负责分发和总说明
- 套件级全局文件骨架由 `skills/ai-project-manager/assets/global-files/` 持有
- 所有实际 skill 放在 `skills/` 下
- 套件级文档放在 `docs/` 下
- `docs/design/` 只放给人理解的设计定义、边界、分层、工作流总览和推进文件
- 会被主入口直接引用的运行规则，统一放在 `skills/ai-project-manager/references/`

补充约束：

1. `skills/ai-project-manager/assets/global-files/` 是套件级全局文件的唯一权威来源
2. `skills/` 下的 skill 不应复制一份同内容的全局模板副本
3. 若某个 skill 需要使用全局文件模板，应直接引用 `skills/ai-project-manager/assets/global-files/`

## 2.1 顶层目录与主入口模板层

顶层目录固定为：

- `docs/`
- `skills/`

其中：

- `docs/` 负责套件级设计说明
- `skills/` 负责主入口与各基础子能力实现
- `skills/ai-project-manager/references/` 是主入口规则、协议和路由说明的参考层
- `skills/ai-project-manager/assets/global-files/` 是主入口内置的默认全局文件模板层

职责必须硬分层，不允许相互吞并。

### `docs/`

职责：

- 存放套件级设计判断、边界说明和专题设计文档
- 回答“为什么这样设计”

允许放入：

- `docs/design/`：定位、边界、实施计划、演进记录、分层清单、结构约定、工作流总览

不应放入：

- 可直接填写的项目模板副本
- 某个 skill 私有资源的重复拷贝
- 只服务单一 skill 的局部运行素材

### `skills/ai-project-manager/references/`

职责：

- 存放主入口实际引用的规则、协议、工作流和局部方法资料
- 回答“主入口运行时按什么规则工作”

允许放入：

- 全局文件模型与读写协议
- 主入口运行模型与路由条件
- 访谈、阶段判断、默认交付流等主入口参考资料
- 只服务 `ai-project-manager` 的规则说明

不应放入：

- 给人读的上位设计说明
- 与 `assets/global-files/` 重复的模板副本
- 其它 skill 的私有资源副本

### `skills/ai-project-manager/assets/global-files/`

职责：

- 存放套件级默认全局文件模板
- 回答“默认骨架长什么样”

允许放入：

- `project-rules.md`
- `project-profile.md`
- `execution-plan.md`
- `project-status.md`
- 解释这些模板如何使用的目录说明

不应放入：

- 运行时协议、路由规则、阶段判断逻辑
- 某个具体 skill 的局部参考资料
- 与现有模板同职责的第二套副本

### `skills/`

职责：

- 存放主入口和各基础子 skill 的实际能力实现
- 回答“谁来做、在什么条件下介入、要读什么、产出什么”

允许放入：

- 每个 skill 自己的 `SKILL.md`
- 每个 skill 自己的 `README.md`
- 只服务该 skill 的 `references/`
- 只服务该 skill、且不与 `skills/ai-project-manager/assets/global-files/` 重复的 `assets/`
- 必要的 `agents/` 或其它 skill 局部元信息

不应放入：

- 套件级运行协议副本
- 与 `skills/ai-project-manager/assets/global-files/` 同内容的全局模板副本
- 应属于 `docs/design/` 的上位设计文档

## 2.2 协作规则

1. `docs/design/` 负责解释设计判断，`skills/ai-project-manager/references/` 负责主入口引用规则，`skills/ai-project-manager/assets/global-files/` 提供模板，`skills/` 消费这些规则和模板来完成实际能力。
2. 若需要新增“给人理解的套件级设计说明”，优先放入 `docs/design/`，而不是写进某个 skill。
3. 若需要新增“套件级默认模板”，优先放入 `skills/ai-project-manager/assets/global-files/`，而不是散落到多个 skill。
4. 若需要新增“某个能力自己的参考资料或局部模板”，放入对应 `skills/<skill>/references/` 或 `skills/<skill>/assets/`。
5. `skills/` 可以引用 `docs/design/`、`skills/ai-project-manager/references/` 和 `skills/ai-project-manager/assets/global-files/`，但不应反向成为它们的权威来源。
6. 判断一个文件该放哪一层时，优先看“它服务整个套件，还是只服务某个 skill”，再决定位置。
7. 判断是放 `docs/design/` 还是 `skills/ai-project-manager/references/` 时，优先看“给人理解”还是“给主入口引用”：
   - 主要用于解释、对齐认知、帮助讨论，放 `docs/design/`
   - 会被主入口直接当规则引用，放 `skills/ai-project-manager/references/`

## 2.3 示例说明

为了避免“套件级”这个词过于抽象，下面给出直接例子。

### 什么叫“套件级规范”

定义：

- 服务整个 `project-manager-suite`
- 不只服务某一个 skill
- 多个 skill 和主入口都需要共同遵守

正例：

- `skills/ai-project-manager/references/global-files-readwrite-protocol.md`
  - 它规定谁先读什么、谁能写什么、什么时候补默认文件、什么时候必须回写
  - 主入口围绕它做判断，其它默认能力也会遵循这个骨架，所以它属于套件级规范

反例：

- `skills/requirements-starter/references/requirements-checklist.md`
  - 它只服务 `requirements-starter` 的局部工作，不是整个套件共同规则
  - 因此它不是套件级规范

### 什么叫“套件级默认模板”

定义：

- 服务整个套件的默认骨架
- 不是某一个 skill 私有的模板
- 主入口和多个 skill 都可能围绕它读取、补齐或回写

正例：

- `skills/ai-project-manager/assets/global-files/project-profile.md`
  - 它是项目画像的默认载体
  - 主入口补项目画像时使用它，后续多个 skill 也围绕这类文件读取项目上下文
  - 因此它属于套件级默认模板

反例：

- `skills/project-devlog/assets/devlog-template.md`
  - 它只服务 `project-devlog` 这个单一能力
  - 因此它是 skill 级局部模板，不是套件级默认模板

## 3. 入口规范

- `skills/ai-project-manager/` 是唯一总入口
- 其它 skill 只作为被调度能力存在

## 4. 目标用户约束

本套件的默认设计对象是：

- 没有完整研发流程认知的业务团队

因此，所有设计都应满足：

1. 不假设用户懂需求分析、方案设计、任务拆解、测试验收
2. 不把关键流程判断责任转嫁给用户
3. 公开版必须提供完整基础闭环能力，而不是只提供骨架
4. 文档和 skill 默认用业务语言组织，而不是研发黑话
5. 主入口必须承担“翻译业务语言为研发动作”的职责

## 5. 默认基础子能力

- `requirements-starter`
- `solution-designer`
- `delivery-planner`
- `engineering-executor`
- `test-and-acceptance`
- `project-devlog`

## 6. 稳定能力名

- `requirements`
- `solution-design`
- `delivery-planning`
- `engineering-execution`
- `test-acceptance`
- `project-devlog`
- `coding-standards`

补充约束：

1. 每个默认基础子 skill 应尽量对应一个清晰的岗位职责，而不是只对应一个零散功能点
2. 每个岗位能力都应有明确的最小交付物定义
3. 每个岗位能力都应明确其结果写回哪一类全局文件
4. 不允许只有岗位名称，没有输入、输出和交付标准
5. `skills/*` 目录名是默认实现载体，稳定能力名才是产品级路由接口
6. `coding-standards` 属于辅助能力，可与阶段主能力同时命中，但不单独代表阶段推进

## 7. 覆盖机制

1. 默认使用套件内置能力的默认实现
2. 宿主项目有增强实现时，允许按稳定能力名覆盖默认实现映射
3. 无增强实现时必须可回退到默认能力

## 8. 项目全局文件模型

套件中的主入口和各子 skill 都应遵循统一的项目全局文件模型。

模型定义见：

- `skills/ai-project-manager/references/global-files-model.md`
- `skills/ai-project-manager/references/global-files-readwrite-protocol.md`

约束：

1. 先按职责识别宿主项目现有文件，再做映射
2. 若宿主项目缺少某类全局文件，再由套件补默认文件
3. 子 skill 不得自行扩张全局文件定义
4. 4 类全局文件模板属于主入口默认路由骨架的一部分

## 9. 主入口运行模型

`ai-project-manager` 的运行协议见：

- `skills/ai-project-manager/references/entry-runtime-model.md`

约束：

1. 主入口必须先识别宿主项目已有全局文件
2. 主入口必须先补齐缺失上下文，再判断阶段
3. 主入口输出必须按文件职责回写，不得把所有内容写入同一文件

## 10. 开源策略

套件的开源 / 私有分层策略见：

- `docs/design/open-core-strategy.md`

约束：

1. 公开层应提供“最小可用闭环实现”，而不只是结构、接口或空骨架
2. 核心 heuristics、经验规则与增强能力不得直接写入公开层
3. 私有增强能力优先通过稳定能力名覆盖默认实现

## 11. 内容分层清单

套件当前文件与未来内容的分层盘点见：

- `docs/design/content-layering-inventory.md`

约束：

1. 新增文件前，先判断属于 A / B / C / D 哪一层
2. 公开低配文件不得自然演化为私有增强逻辑容器
3. 文件级分层若有变化，需同步更新本清单

## 12. 岗位能力与交付标准约束

本套件不是普通多 agent 集合，而是围绕项目推进组织的一组岗位能力包。

因此新增或重构 skill 时，默认应同时回答以下问题：

1. 这个 skill 对应哪个岗位职责
2. 这个岗位通常在什么阶段介入
3. 这个岗位的最小输入是什么
4. 这个岗位这一轮应产出什么交付物
5. 这个交付物的最低完成标准是什么
6. 这个交付物应写回哪个全局文件

若上述问题不能回答清楚，则说明该 skill 仍停留在“功能点”层，而没有进入“岗位能力”层。
