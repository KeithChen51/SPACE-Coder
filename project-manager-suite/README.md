# Project Manager Suite

## 一句话定义

`project-manager-suite` 不是零散的 skill 集合，也不是文档生成器。

它是一个面向业务团队的“项目经理产品”能力包，用来把模糊业务想法持续推进成可执行、可回写、可验收的项目过程。

当前阶段版本定义为：

- `project-manager-suite` 开源版 `1.0`

这一版本的目标不是覆盖所有场景，而是先证明：

- 这套产品已经具备首个可对外说明的公开版形态
- 这套模型不是文档生成器，而是轻量项目推进闭环
- 业务团队能够在统一骨架上完成一次从启动到执行回写的最小闭环

---

## 文档入口

如果只读一份文档就想知道“这个产品是什么、为什么这样设计、边界怎么划”，优先读：

- `docs/design/project-manager-suite-product-design.md`

当前文档分工已经固定为：

- `README.md`
  - 套件总览入口
  - 说明产品形态、目录结构、迁移和阅读顺序

- `docs/design/project-manager-suite-product-design.md`
  - design 层唯一主文档
  - 统一承载产品目标、目标用户、边界判断、设计思路、实施策略和关键演进摘要

- `docs/design/`
  - 给人理解的设计说明层
  - 负责解释为什么这样设计、边界如何划分、当前结构如何理解

- `skills/ai-project-manager/references/`
  - 主入口实际引用的规则与协议层
  - 负责承载全局文件模型、读写协议、主入口运行模型、路由条件等

- `skills/ai-project-manager/assets/global-files/`
  - 默认模板层
  - 提供全局规则、项目画像、执行计划、状态回写的默认载体

- `docs/design/package-conventions.md`
  - 结构约束主文件
  - 定义 `docs/design/`、`skills/ai-project-manager/references/`、`skills/ai-project-manager/assets/global-files/` 和 `skills/` 的职责边界

一句话区分：

- 想知道“产品目标和设计判断”，读 `docs/design/project-manager-suite-product-design.md`
- 想知道“主入口运行时按什么规则工作”，读 `skills/ai-project-manager/references/`
- 想知道“默认模板长什么样”，读 `skills/ai-project-manager/assets/global-files/`
- 想知道“目录和层级怎么分工”，读 `docs/design/package-conventions.md`

---

## 它解决什么问题

这套产品优先解决的，不是“用户不会调用 AI”，而是：

- 不知道当前项目处于什么阶段
- 不知道下一步该做什么
- 不知道哪些信息应该沉淀成长期上下文
- 缺少稳定交付件，导致 AI 每轮输出容易漂移
- 项目能开始，但很难持续推进到执行和验收

因此，它的核心价值不是“多生成几份文档”，而是：

- 给项目提供默认推进骨架
- 给 AI 提供稳定上下文载体
- 给用户提供当前轮最小下一步
- 给项目提供可持续回写和滚动推进机制

---

## 目标用户

本套件优先服务的用户是：

- 会使用 AI IDE
- 能描述业务目标和优先级
- 但不懂从需求分析到上线的完整流程
- 缺少稳定交付件意识和项目推进方法的业务团队

本套件不以以下用户为默认设计中心：

- 已有成熟研发体系的专业研发团队
- 只想要代码生成，而不需要项目推进能力的用户
- 已经具备完整项目管理与工程协作体系的团队

---

## 产品模型

这套产品的最小模型可以压缩为：

`项目经理主入口 + 全局文件骨架 + 基础子能力 + 状态回写闭环`

其中：

- `ai-project-manager` 是唯一总入口
- 子 skill 不是平铺罗列，而是被主入口按阶段路由调用
- 项目状态不依赖聊天上下文临时记忆，而依赖统一全局文件体系
- 每轮结果必须回写，形成项目级持续推进链路

更准确地说，这个套件承载的是：

- 岗位能力
- 交付标准
- 项目推进骨架
- 项目状态沉淀方式

---

## 核心运行机制

主入口 `ai-project-manager` 的职责不是承载所有细节执行，而是：

1. 识别项目是否已有全局文件
2. 读取最小必要上下文
3. 补齐当前轮推进所需的最小缺口
4. 判断当前项目阶段
5. 决定是否进入某个子 skill
6. 将本轮结果写回正确位置

全局文件体系当前按 4 类定义：

1. 全局规则文件
   回答：项目怎么运行
2. 项目画像文件
   回答：项目当前是什么
3. 当前执行计划文件
   回答：现在做什么
4. 项目状态回写文件
   回答：最近发生了什么

这 4 类文件共同构成这套产品的最小路由骨架。

---

## 基础版最小闭环

基础版不能退化成模板包或单次需求摘要工具。

当前定义下，基础版至少应覆盖以下闭环能力：

- 项目启动
- 项目画像
- 需求摘要
- 基础方案
- 基础任务拆解
- 基础执行规则
- 基础验收
- 基础日志回写

判断标准不是“功能看起来多不多”，而是：

- 用户能不能从模糊想法进入项目启动
- AI 能不能在统一骨架上持续推进
- 项目能不能形成最小可执行与可回写闭环

---

## 标准交付单位

对外分发时，`project-manager-suite` 是标准交付单位。

给其它项目使用时，应整体复制这个文件夹，而不是分别复制多个零散目录。

```text
project-manager-suite/
```

不是：

- 单独复制 `ai-project-manager/`
- 单独复制某几个子 skill
- 单独复制说明文档

原因是这套体系不是单点能力，而是统一约束下的产品化能力包。拆散交付后：

- 使用方不知道哪个才是总入口
- 子能力边界和覆盖机制会失去统一约束

---

## 当前结构

```text
project-manager-suite/
├── README.md
├── docs/
│   └── design/
│       ├── README.md
│       ├── project-manager-suite-product-design.md
│       ├── global-files-architecture.md
│       ├── project-progression-workflow.md
│       ├── open-core-strategy.md
│       ├── content-layering-inventory.md
│       ├── package-conventions.md
│       └── project-scaffold-design.md
└── skills/
    ├── ai-project-manager/
    │   ├── SKILL.md
    │   ├── references/
    │   └── assets/global-files/
    ├── coding-standards/
    ├── requirements-starter/
    ├── solution-designer/
    ├── delivery-planner/
    ├── engineering-executor/
    ├── test-and-acceptance/
    └── project-devlog/
```

说明：

- `docs/design/` 是设计说明层，不承载运行时权威规则
- `skills/ai-project-manager/references/` 是主入口引用的规则与协议层
- `skills/ai-project-manager/assets/global-files/` 是套件级默认全局文件模板层
- `skills/` 下其它目录是默认内置基础能力

目录边界：

- 顶层目录只有 `docs/` 和 `skills/`
- `docs/design/` 负责解释为什么这样设计
- `skills/ai-project-manager/references/` 负责主入口运行时引用的规则与协议
- `skills/ai-project-manager/assets/global-files/` 负责默认模板
- `skills/` 负责具体能力实现

---

## 当前版本状态

当前这个目录的状态，不是“已经完全开箱即用”，而是：

- 已完成产品定位与边界定义
- 已完成主入口与全局文件模型定义
- 已完成开源 / 增强版分层原则定义
- 已进入从设计文档推进到可分发实现的阶段

当前已具备的基础实物包括：

- 一套可独立交付的全局文件 starter pack
- `ai-project-manager`
- `requirements-starter`
- `solution-designer`
- `delivery-planner`
- `engineering-executor`
- `test-and-acceptance`
- `project-devlog`

当前仍需继续补齐的重点包括：

- 更完整的低配模板与局部参考资料
- 首个真正可演示的完整基础闭环
- 迁移到新项目时的宿主项目适配和冒烟验证

---

## 阅读顺序

如果你在问：

- 这套产品到底是什么
- 为什么它不是单个 skill
- 它服务谁，不服务谁
- 它靠什么机制持续推进项目
- 基础版最低应该做到什么程度

先读这个 `README.md`，再读 `docs/design/project-manager-suite-product-design.md`。

如果你在问：

- 主入口具体怎么运行
- 全局文件字段怎么定义
- 路由条件怎么判断

再看 `skills/ai-project-manager/references/`。

如果你在问：

- 为什么边界这样划
- 哪些能力该公开，哪些该保留
- 当前设计是怎么一步步收敛成现在这样的

再看 `docs/design/`。
