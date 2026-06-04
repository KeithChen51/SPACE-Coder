---
name: project-link-indexer
description: Use when a host project needs file-level reference indexing, broken-link diagnosis, LLM wiki style navigation, impact lookup, or cross-skill artifact relationship checks across existing project-profile, BRD, page, foundation, PRD, plan, test, and code files.
---

# Project Link Indexer

本 skill 是 `project-manager-suite` 的全局伴随能力。它把宿主项目里的文件关系编译成可重建的文件级索引，方便人和 LLM 快速理解“哪个文件引用了哪个文件、哪个文件缺回链、哪个文件孤立”。

核心原则：索引是编译产物，不是业务权威源。BRD、页面说明、foundation、PRD、计划、验收、测试用例和代码仍由各自 skill 或宿主项目文件负责。

## 什么时候使用

- 已有代码或已有文档接入后，需要建立 LLM wiki 风格的项目导航
- 用户问“这些文件之间怎么关联”“改这个文件影响哪些文件”“有没有坏链/孤立文件”
- `project-baseline-auditor` 完成后，需要给后续补档建立文件级引用图
- BRD / 页面说明 / foundation / PRD / 计划等阶段产物新增或拆分后，需要刷新索引

## 不做什么

- 不替代 `project-baseline-auditor` 诊断关键文件缺口
- 不替代 `delivery-planner` 拆任务
- 不替代任何 `test-case-*` skill 编写、审查或执行测试
- 不要求其他 skill 直接写同一个索引文件

## 输出文件

默认写入宿主项目：

```text
<host>/docs/index/project-link-graph.json
<host>/docs/index/project-link-graph.md
<host>/docs/index/project-wiki-schema.json
```

`project-link-graph.json` 给工具和主入口读取；`project-link-graph.md` 给人阅读；`project-wiki-schema.json` 固定节点、边和诊断问题的含义。

## 标准流程

1. 读取宿主根目录，确认本轮是建索引、刷新索引，还是诊断引用问题。
2. 运行收集脚本：

```bash
node <suite-path>/skills/project-link-indexer/scripts/collect-project-links.mjs <hostRoot> --json
```

3. 若只需要检查，不写文件，运行：

```bash
node <suite-path>/skills/project-link-indexer/scripts/validate-project-links.mjs <hostRoot> --json
```

4. 把诊断结果按文件级问题反馈给用户：坏链、缺回链、孤立交付物、缺必需关系。
5. 如果用户要求刷新索引，保留原始业务文件，只重写 `docs/index/*`。

## 关系来源

索引器按证据抽取关系：

- Markdown 链接：`[标题](path/to/file.md)`
- Wiki 链接：`[[path/to/file.md|标题]]`
- 计划中的 `PRD 双链·读`：反推 `delivery-plan -> PRD/foundation/page` 的 `depends_on`
- 套件命名约定：识别 `project-profile.md`、`BRD-*`、`explainer-*`、`foundation-*`、`mainprd-*`、`subprd/0X-subprd-*`、`delivery-plan-*` 等文件角色

每条边都必须保留证据位置：来源文件、行号、原文和抽取语法。

## 诊断口径

常见 issue：

| code | 含义 | 处理方式 |
|---|---|---|
| `broken_link` | 文件引用的目标不存在 | 修正链接或补齐目标文件 |
| `missing_reverse_link` | 主索引指向子文件，但子文件没有回链 | 给子文件补回主文件链接 |
| `orphan_artifact` | 关键交付物没有发现任何入边或出边 | 判断是否应补引用，或确认它是独立材料 |

诊断只说明文件关系，不给阶段路由建议。

## LLM Wiki 写法

生成的人读索引可以同时保留两种链接：

- `[[docs/prd/mainprd-demo.md|mainprd]]`：方便支持 wiki link 的工具解析
- `[mainprd](../prd/mainprd-demo.md)`：普通 Markdown 可点击

不要强制改写所有原始文件为 wiki link。V1 只在生成的 `docs/index/*` 中使用这种双链接风格。
