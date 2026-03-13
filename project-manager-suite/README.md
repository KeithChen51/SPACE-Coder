# Project Manager Suite

## 什么是 Project Manager Suite？

`project-manager-suite` 不是零散的 prompt 集合，也不是文档生成工具，而是一个面向业务团队的**AI 项目经理引擎**。

它提供了一套标准的工作流和全局文件骨架，用来把模糊的业务想法持续推进成可执行、可回写、可验收的项目过程。

本套件的核心价值：
- 给项目提供默认推进骨架
- 给 AI 提供稳定上下文载体（不再依赖聊天记录临时记忆）
- 给用户提供当前轮的“最小下一步”建议
- 给项目提供可持续回写和滚动推进机制

## 安装与使用

由于套件各组件存在强关联，对外分发时必须作为**整体标准交付单位**。

如果要在新项目中使用本套件，请**整体复制** `project-manager-suite` 文件夹到目标项目的 `.agent` 或 `.trae` 目录中，不可单独抽取某个字能力（如仅复制 `ai-project-manager` 目录）。

## 核心运行机制

`ai-project-manager` 作为全套件的**唯一总入口**。

为了避免 AI 上下文漂移，项目状态不再依赖临时聊天记忆，而依赖于 **3 类全局文件 + 1 类状态回写能力**：

1. **全局规则文件**：定义项目怎么运行
2. **项目画像文件**：记录项目当前是什么
3. **当前执行计划文件**：指导现在该做什么
4. **项目状态回写能力（`project-devlog`）**：沉淀最近发生了什么变更

每次交互时，AI-Project-Manager 会识别全局文件，分析当前所处阶段，自动路由调起适合的子能力（如需求分析、架构设计或任务拆解），并将本轮确认的结果写回源文件，形成正向循环。

当前默认推进链路为：

```text
项目画像
→ 需求清单
→ 业务需求文档
→ 页面原型 / 页面代码
→ 人工确认页面原型
→ 完整版 PRD
→ 开发计划
→ 开发执行
→ 测试用例
→ 测试执行
→ 人工点检准备
→ 点检结果回写
```

其中 **S2 页面构建与完整版 PRD** 阶段有一条硬约束：

- 先调用 `ui-ux-pro-max` 产出页面原型或页面代码
- 用户确认页面方向后，再调用 `prd-writer` 反推并沉淀完整 PRD
- 未经确认，不允许把 PRD 当作权威版本继续推进

## 套件目录结构

在使用本套件前，了解各层分工有助于排查问题或进行自定义适配：

```text
project-manager-suite/
├── README.md                      # 套件使用指南
├── docs/design/                   # （可选阅读）产品设计图纸与分层理念
└── skills/                        # 实际运行时的能力目录
    ├── ai-project-manager/            # [核心] 唯一总入口
    │   ├── SKILL.md                   # 入口指令
    │   ├── references/                # 路由规则与协议层
    │   └── assets/global-files/       # 全局文件默认骨架（画像、计划等）
    ├── coding-standards/              # [子能力] 编码规范
    ├── requirements-starter/          # [子能力] 需求分析启动器
    ├── ui-ux-pro-max/                 # [子能力] 页面原型与视觉设计
    ├── prd-writer/                    # [子能力] 页面确认后的完整 PRD 反推
    ├── delivery-planner/              # [子能力] 任务拆解与交付规划
    ├── engineering-executor/          # [子能力] 研发执行器
    ├── prd-test-case-generator/       # [子能力] PRD 驱动测试用例生成
    ├── test-and-acceptance/           # [子能力] 测试与验收
    └── project-devlog/                # [子能力] 日志与状态回写
```

## 能力分工

当前主链路中的能力职责如下：

| 能力 | 主要职责 | 默认介入阶段 |
|------|----------|--------------|
| `ai-project-manager` | 识别全局文件、判断阶段、路由能力、回写状态 | 全阶段入口 |
| `requirements-starter` | 将零散业务信息整理为需求摘要 | S1 |
| `ui-ux-pro-max` | 生成页面原型、视觉方向和交互原型 | S2 首轮 |
| `prd-writer` | 在页面确认后反推完整 PRD | S2 确认后 |
| `delivery-planner` | 把 PRD 拆成开发计划和任务清单 | S3 |
| `engineering-executor` | 承接开发执行和实现工作 | S4 |
| `prd-test-case-generator` | 根据 PRD 生成结构化测试用例 | S5 |
| `test-and-acceptance` | 承接测试执行、点检准备和收口 | S6 / S7 / S8 |
| `project-devlog` | 回写每轮推进状态和日志 | 全阶段伴随 |
| `coding-standards` | 为代码、接口、SQL、测试任务加载规范 | 代码相关任务伴随 |

## 使用提醒

- `project-manager-suite` 应作为完整目录整体复制使用，不建议拆散单个 skill。
- 主入口行为以 `skills/ai-project-manager/references/runtime.md` 为准。
- 路由映射和骨架补齐规则以 `skills/ai-project-manager/references/routing.md` 为准。
- 若修改了阶段流转、技能职责或默认交付链路，应该同步更新本 README，避免使用者读到过期说明。

## 延伸阅读

如果你希望了解为何如此设计（如能力边界在哪、有哪些机制确保不退化成单次会话工具、分层策略的考量），请参阅产品设计白皮书：
- `docs/design/project-manager-suite-product-design.md`
