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

为了避免 AI 上下文漂移，项目状态不再依赖临时聊天记忆，而依赖于 **4 类全局文件体系**：

1. **全局规则文件**：定义项目怎么运行
2. **项目画像文件**：记录项目当前是什么
3. **当前执行计划文件**：指导现在该做什么
4. **项目状态回写文件**：沉淀最近发生了什么变更

每次交互时，AI-Project-Manager 会识别全局文件，分析当前所处阶段，自动路由调起适合的子能力（如需求分析、架构设计或任务拆解），并将本轮确认的结果写回源文件，形成正向循环。

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
    ├── solution-designer/             # [子能力] 方案设计器
    ├── delivery-planner/              # [子能力] 任务拆解与交付规划
    ├── engineering-executor/          # [子能力] 研发执行器
    ├── test-and-acceptance/           # [子能力] 测试与验收
    └── project-devlog/                # [子能力] 日志与状态回写
```

## 延伸阅读

如果你希望了解为何如此设计（如能力边界在哪、有哪些机制确保不退化成单次会话工具、分层策略的考量），请参阅产品设计白皮书：
- `docs/design/project-manager-suite-product-design.md`
