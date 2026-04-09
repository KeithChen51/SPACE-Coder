# Project Manager Suite

## 快速概览

`project-manager-suite` 不是零散的 prompt 集合，也不是文档生成工具，而是一个面向业务团队的 **AI 项目经理引擎**。

它通过 `ai-project-manager` 作为唯一总入口，结合全局规则、项目画像、执行计划和状态回写，把模糊的业务想法持续推进成可执行、可回写、可验收的项目过程。

第一次使用时，建议先看 [安装与使用](#安装与使用)；想先理解它怎么运转，再看 [核心运行机制](#核心运行机制)。

## 按目的阅读

- 首次了解套件：看 [什么是 Project Manager Suite？](#什么是-project-manager-suite)
- 快速安装到宿主：看 [安装与使用](#安装与使用)
- 理解主入口和推进链路：看 [核心运行机制](#核心运行机制)
- 排查目录和文件职责：看 [套件目录结构](#套件目录结构)
- 查看 skill 职责边界：看 [能力分工](#能力分工)
- 查看补充资料：看 [延伸阅读](#延伸阅读)

## 什么是 Project Manager Suite？

`project-manager-suite` 的定位是 **宿主项目可挂载的通用项目推进套件**，而不是绑定某个单一业务项目的私有模板。仓库中的技术栈、接口、测试目录、PRD 结构等内容，默认都应理解为可替换的参考实现或示例约定，实际落地时由宿主项目按自身规则进行映射。

本套件的核心价值：

- 给项目提供默认推进骨架
- 给 AI 提供稳定上下文载体，不再依赖聊天记录临时记忆
- 给用户提供当前轮的最小下一步建议
- 给项目提供可持续回写和滚动推进机制
- 给不同 AI IDE 和不同宿主项目提供可迁移的协作协议

从产品能力抽象来看，`project-manager-suite` 可以概括为 4 个相互配合的层：

- **项目启动层**：由 `ai-project-manager` 接住模糊需求，完成最小访谈、项目画像建立和骨架补齐
- **项目持续记忆底座**：由项目画像、全局规则、执行计划和状态回写共同构成，让 AI 能跨轮恢复上下文
- **工程化流程编排层**：按阶段判断、最小交付物控制、能力路由和人工确认节点推进项目，避免 AI 失控扩写
- **专业执行层**：由需求、UI/UX、PRD、计划、研发、测试、验收等子能力承接具体交付

这 4 层叠加后的产品价值，不是多几个 prompt 或多几份文档模板，而是把项目从启动到交付收口的过程做成可持续运行的 AI 协作系统。

## 安装与使用

由于套件各组件存在强关联，对外分发时必须作为 **整体标准交付单位**。如果要在新项目中使用本套件，请将完整 `project-manager-suite` 安装到目标项目的 `.agent/project-manager-suite` 目录中，不可单独抽取某个字能力，例如只复制 `ai-project-manager` 目录。

推荐安装方式有两种：

- 直接整体复制到宿主 `.agent/project-manager-suite`
- 在套件源码仓库或已安装套件中运行：

```bash
node project-manager-suite/tools/install-suite-into-host.mjs <host-project-root>
```

安装补充说明：

- 安装脚本会复用宿主已有 `.agent/` 目录；若宿主没有 `.agent/`，脚本会自动创建
- 安装脚本只管理 `.agent/project-manager-suite/`，不会覆盖宿主 `.agent/` 下其他插件或配置
- 推荐先通过 `bootstrap-host.mjs` 完成宿主骨架补齐，再安装或同步套件到宿主内路径
- 安装完成后，后续命令应优先使用宿主内套件路径，例如 `node .agent/project-manager-suite/tools/generate-host-rules.mjs <host-project-root>`

接入宿主项目时，优先做的是 **角色映射**，不是强制重命名现有文档：

- 把宿主项目现有的规则入口映射为“全局规则文件”
- 把宿主项目现有的计划入口映射为“当前执行计划文件”
- 把宿主项目现有的日志或状态沉淀入口映射为“状态回写能力”
- 若缺失稳定的项目快照载体，再补齐“项目画像文件”

<details>
<summary>宿主专项规则生成</summary>

`ai-project-manager` 的专项规则默认源位于：

- `skills/ai-project-manager/references/rules/*.md`

宿主项目中的专项规则权威目录位于：

- `docs/rules/`

主入口在执行骨架补齐时，应负责创建宿主 `docs/rules/` 目录；当宿主缺少默认专项规则文件时，可调用以下工具脚本批量生成：

```bash
node .agent/project-manager-suite/tools/generate-host-rules.mjs <host-project-root>
```

补充说明：

- 默认策略是“只补缺失文件，不覆盖宿主已有同名规则文件”
- 若需要强制覆盖，可追加 `--force`
- 运行时读取顺序应始终保持“宿主 `docs/rules/` 优先，套件默认规则源兜底”
- 验收样例可参考 `docs/host-rules-generation-example.md`
- 若你当前就在套件源码仓库中联调，也可直接使用仓库路径：`node project-manager-suite/tools/generate-host-rules.mjs <host-project-root>`

</details>

## 核心运行机制

`ai-project-manager` 是全套件的 **唯一总入口**。它先建立统一上下文，再决定项目进入哪个阶段、由哪个能力承接，以及结果该写回哪里。

为了避免 AI 上下文漂移，项目状态不再依赖临时聊天记忆，而依赖于 **3 类全局文件 + 1 类状态回写能力**：

| 组成 | 作用 |
|------|------|
| 全局规则文件 | 定义项目怎么运行 |
| 项目画像文件 | 记录项目当前是什么 |
| 当前执行计划文件 | 指导现在该做什么 |
| `project-devlog` | 沉淀最近发生了什么变更 |

这组机制可以统一理解为一套 **项目持续记忆底座**：全局规则负责长期约束，项目画像负责项目快照，执行计划负责当前推进目标，`project-devlog` 负责最近状态沉淀。

在这套记忆底座之上，主入口再按阶段判断、最小交付物和人工确认节点进行推进，这部分可以统一理解为 **工程化流程编排**，其价值在于：

- 让 AI 知道当前项目处于哪个阶段
- 让每一轮都有明确的最小交付物
- 让关键节点保留人工确认，避免把未确认内容直接当成权威结论
- 让每轮结果都能回写，成为下一轮输入

默认推进链路为：

```text
项目画像
→ 需求清单
→ 业务需求文档
→ 页面代码 / 页面交付清单
→ 人工确认页面
→ 术语表 / Schema / API / foundation 交付清单
→ 功能列表 / 主 PRD / 子 PRD
→ 开发计划
→ 开发执行
→ 测试用例
→ 测试执行
→ 验收收口
```

其中 **S2 页面设计、技术地基与完整版 PRD** 阶段有一条硬约束：

- 先调用 `page-designer` 产出页面代码与页面交付清单
- 用户确认页面方向后，再调用 `foundation-builder` 产出术语表 / Schema / API
- 只有在 foundation 完成后，才允许调用 `prd-writer` 反推并沉淀完整 PRD
- 未经确认或未完成 foundation，不允许把 PRD 当作权威版本继续推进

## 适用场景

`project-manager-suite` 更适合以下宿主项目：

- 业务方已经有明确目标，但需求仍然零散，缺少稳定推进机制
- 团队希望把“需求整理 -> 设计 -> PRD -> 开发 -> 测试 -> 验收”串成单一闭环
- 项目需要跨轮协作，不能每次都依赖聊天上下文重新解释一遍
- 希望同时支持开源版能力复用与增强版能力扩展，而不是把关键能力锁死在单一 IDE 或单一项目里

## 能力分工

从 skill 角色来看，当前主链路中的能力可以先分成 3 类：

- **流程调度型**：`ai-project-manager`，负责识别全局文件、补齐最小上下文、判断阶段、路由子能力和回写状态
- **阶段交付型**：`brd-writer`、`page-designer`、`foundation-builder`、`prd-writer`、`delivery-planner`、`prd-test-case-generator`、`test-case-runner`，负责承接某一阶段的正式交付物，例如 BRD、页面代码、技术地基、PRD、开发计划、测试用例和测试结果
- **专项执行型**：`coding-standards`、`project-devlog`，负责研发执行规范、状态回写等专项工作，不承担主流程调度

当前主链路中的能力职责如下：

| 能力 | 主要职责 | 默认介入阶段 |
|------|----------|--------------|
| `ai-project-manager` | 识别全局文件、判断阶段、路由能力、回写状态 | 全阶段入口 |
| `brd-writer` | 将业务想法收敛成可评审的业务需求文档 / BRD，并锁定关键决策 | S1 |
| `page-designer` | 基于 BRD 产出可交互前端页面（内置设计知识库），管理页面交付清单和中间文件 | S2 首轮 |
| `foundation-builder` | 基于已确认页面反推术语表、Schema、API 和 foundation 交付清单 | S2 页面确认后 |
| `prd-writer` | 基于页面与 foundation 产物沉淀 AI 可编码 PRD | S2 foundation 完成后 |
| `delivery-planner` | 把 PRD 拆成开发计划和任务清单 | S3 |
| `coding-standards` | 承接开发执行和规范化实现工作 | S4 / 代码开发伴随 |
| `prd-test-case-generator` | 根据 PRD 生成结构化测试用例 | S5 |
| `test-case-runner` | 按测试用例文档执行 API / UI / 管理台测试并生成报告 | S6 |
| `test-and-acceptance` | 承接人工点检准备、验收判断和阶段收口 | 验收阶段 |
| `project-devlog` | 回写每轮推进状态和日志 | 全阶段伴随 |

## 套件目录结构

在使用本套件前，了解各层分工有助于排查问题或进行自定义适配：

```text
project-manager-suite/
├── package.json                   # Node 运行入口与测试脚本定义
├── README.md                      # 套件使用指南
├── docs/design/                   # （可选阅读）产品设计图纸与分层理念
├── docs/tooling/                  # 工具脚本使用与维护说明
├── hooks/                         # 会话启动时的注入与平台 hook 入口
├── lib/                           # 协议结构化实现与 bootstrap 组装层
│   ├── ai-pm-protocol/            # 字段、阶段、路由、规则同步等协议层结构化配置
│   └── bootstrap/                 # 平台注入与 bootstrap 组装逻辑
├── skills/                        # 实际运行时的能力目录
│   ├── ai-project-manager/        # [核心] 唯一总入口
│   │   ├── SKILL.md               # 入口指令
│   │   ├── references/
│   │   │   ├── core/              # 运行协议、全局文件协议、路由与骨架规则
│   │   │   ├── rules/             # 前端/后端/数据库/调试等专项规则
│   │   │   ├── defaults/          # 默认技术栈与其他默认参数
│   │   │   └── _archive/          # 历史版本与废弃草案，不参与当前运行
│   │   └── assets/global-files/   # 全局文件默认骨架（画像、计划等）
│   ├── coding-standards/          # [子能力] 编码规范与研发执行
│   ├── brd-writer/                # [子能力] 业务需求文档 / BRD 收敛
│   ├── page-designer/             # [子能力] 页面设计（内置设计知识库 + BM25 搜索）
│   ├── foundation-builder/        # [子能力] 术语表 / Schema / API 技术地基设计
│   ├── prd-writer/                # [子能力] 基于页面与 foundation 的 PRD 反推
│   ├── delivery-planner/          # [子能力] 任务拆解与交付规划
│   ├── prd-test-case-generator/   # [子能力] PRD 驱动测试用例生成
│   ├── test-case-runner/          # [子能力] 测试用例执行
│   ├── test-and-acceptance/       # [子能力] 验收收口
│   └── project-devlog/            # [子能力] 日志与状态回写
├── tests/                         # 工具链与协议对齐测试
└── tools/                         # 宿主初始化、校验、规则同步、日志回写、安装套件等脚本
```

<details>
<summary>各目录的作用与使用场景</summary>

- `README.md`
  - 作用：对外说明套件是什么、怎么安装、怎么接到宿主项目里
  - 什么时候看：第一次接入、需要给别人解释套件结构、想确认标准使用方式时
- `package.json`
  - 作用：定义 Node 侧的最小工程入口，例如测试脚本和模块类型配置
  - 什么时候看：要运行 `npm run test:ai-pm`、补充新的工具脚本命令、调整 Node 模块行为时
- `docs/design/`
  - 作用：沉淀产品设计图纸、架构分层和为什么这么设计
  - 什么时候看：要理解整套机制的设计意图、准备重构主流程、需要做架构层讨论时
- `docs/tooling/`
  - 作用：记录工具脚本的使用说明、维护方法和边界
  - 什么时候看：要跑脚本、排查脚本行为、维护工具链或补充自动化能力时
- `hooks/`
  - 作用：提供平台侧会话启动注入入口，例如 session start hook
  - 什么时候看：要接 Claude/OpenCode/Codex 等平台、排查“为什么启动时自动注入 ai-project-manager”时
- `lib/`
  - 作用：把协议文档中的稳定规则收口成结构化实现，供脚本和平台 bootstrap 复用
  - 什么时候看：要新增字段、调整阶段、修改路由规则、修复 hook/bootstrap 注入逻辑时
- `lib/ai-pm-protocol/`
  - 作用：维护字段合同、阶段定义、路由规则、规则同步策略等协议层结构化配置
  - 什么时候看：你改的是规则本身，而不是某个单一脚本的临时判断时
- `lib/bootstrap/`
  - 作用：负责把 `ai-project-manager` 主入口能力组装成各平台可消费的 bootstrap 内容
  - 什么时候看：要改 session-start 注入内容、平台适配逻辑、统一启动文案时
- `skills/`
  - 作用：存放实际面向项目推进的能力单元，是套件的主体能力层
  - 什么时候看：要新增或修改某个 skill、调整能力边界、扩展某阶段交付流程时
- `skills/ai-project-manager/`
  - 作用：唯一总入口，负责识别全局文件、最小访谈、阶段判断、路由和回写
  - 什么时候看：任何“项目启动 / 继续推进 / 下一步做什么 / 当前处于哪个阶段”的问题都应先看这里
- `skills/*/references/`
  - 作用：存放该 skill 的协议、规则、模板引用和补充说明
  - 什么时候看：要修改某个 skill 的行为规则，但不一定要改脚本实现时
- `skills/*/assets/`
  - 作用：存放该 skill 会创建或复用的模板、默认文件骨架、静态素材
  - 什么时候看：要调整默认模板内容、生成文件外形或默认骨架时
- `tools/`
  - 作用：提供宿主初始化、校验、阶段判断、规则同步、日志回写、安装套件等脚本化能力
  - 什么时候看：需要一键执行稳定动作，而不是靠主入口纯文本推理时
- `tests/`
  - 作用：验证工具链主路径、协议实现和对齐关系是否被改坏
  - 什么时候看：改了协议、脚本、bootstrap、路由逻辑后，准备收口或怀疑回归时
- `.codex/`、`.opencode/`
  - 作用：存放不同运行平台的安装说明或插件接入文件
  - 什么时候看：你要把套件接进对应平台，或排查平台侧为什么没有正确识别套件时

其中 `skills/ai-project-manager/references/` 建议按以下三层组织：

- `core/`：主入口运行所依赖的核心协议层，存放运行流程、全局文件协议、路由与骨架规则等上位约束
- `rules/`：面向具体任务类型的专项执行规则，存放前端、后端、数据库、文档、调试、日志等下位规则包
- `defaults/`：默认参数与默认约定，存放默认技术栈、默认实现偏好、默认环境口径等可被引用和覆盖的参考输入

当前 `ai-project-manager` 中，这三层的典型职责分别是：

- `references/core/runtime.md`：定义主入口运行流程与访谈协议
- `references/core/global-files-protocol.md`：定义全局文件字段合同与读写职责
- `references/core/routing.md`：定义阶段路由与项目骨架补齐规则
- `references/rules/*.md`：定义前端、后端、数据库、调试、文档等专项规则
- `references/defaults/tech-stack.md`：定义默认技术栈参数，供主入口和子能力在未有宿主项目明确技术栈时按需引用

补充说明：

- `references/_archive/` 只用于保留历史版本、迁移草案和旧设计，不应作为当前运行时的读取入口

</details>

## 使用提醒

- `project-manager-suite` 应作为完整目录整体复制使用，不建议拆散单个 skill
- 主入口行为以 `skills/ai-project-manager/references/core/runtime.md` 为准
- 路由映射和骨架补齐规则以 `skills/ai-project-manager/references/core/routing.md` 为准
- 若修改了阶段流转、技能职责或默认交付链路，应该同步更新本 README，避免使用者读到过期说明

## 延伸阅读

- 如果你希望了解为何如此设计，例如能力边界、闭环机制和分层策略，参阅 `docs/design/project-manager-suite-product-design.md`
- 如果你需要维护脚本化能力，而不是只使用它们，继续阅读 `docs/tooling/ai-pm-tools-usage.md` 和 `docs/tooling/ai-pm-maintenance-guide.md`

## 后续产品升级路径

`project-manager-suite` 后续还将补齐一项 **项目评测能力**，用于对项目说明、需求文档、PRD、页面原型、核心代码、测试与验收材料进行结构化评估，判断当前成果是否达到下一步推进标准，并输出缺口分析与整改建议。
