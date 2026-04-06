# AI Project Manager Tools

本目录存放 `ai-project-manager` 第一阶段脚本化改造的工具脚本。

当前目标不是替代主入口，而是把已经稳定、可判定、可重复执行的部分收敛成工具层能力。

---

## 当前工具一览

| 工具 | 作用 | 当前状态 |
|------|------|----------|
| `generate-host-rules.mjs` | 同步宿主 `docs/rules/` 默认规则文件 | 已有能力，复用中 |
| `validate-global-files.mjs` | 校验全局文件入口、结构和规则目录状态 | V1 可用 |
| `route-check.mjs` | 判断当前阶段、推荐阶段、阶段门禁和阻断原因 | V1 可用 |
| `bootstrap-host.mjs` | 安全补齐宿主骨架并复用规则同步 | V1 可用 |
| `devlog-sync.mjs` | 每日日志新建/追加与规则候选池联动 | V1 可用 |
| `check-protocol-alignment.mjs` | 检查协议文档与结构化实现的双向追踪是否一致 | V1 可用 |

---

## 推荐使用顺序

建议按以下顺序使用：

1. `validate-global-files.mjs`
2. `route-check.mjs`
3. `bootstrap-host.mjs`
4. `devlog-sync.mjs`

原因：

- 先确认宿主当前是否健康
- 再判断当前应该进入哪个阶段
- 再补骨架和规则目录
- 最后做日志沉淀与规则候选联动

---

## 工具说明

## `generate-host-rules.mjs`

作用：

- 将套件默认规则源 `skills/ai-project-manager/references/rules/*.md` 同步到宿主 `docs/rules/`

特点：

- 默认只补缺失，不覆盖已有文件
- 支持 `--force`
- 支持 `--dry-run`

适用场景：

- 宿主项目首次初始化 `docs/rules/`
- 宿主缺少默认规则文件

---

## `validate-global-files.mjs`

作用：

- 识别规则、画像、计划、最近日志入口
- 校验结构性必备标记
- 检查多权威候选和规则目录缺口

适用场景：

- 每次启动后先做健康检查
- 在进入后续自动化动作前做只读校验

当前边界：

- V1 重点是结构性校验
- 还没有做更细粒度的字段逐项解析和自动修复

---

## `route-check.mjs`

作用：

- 基于画像、计划、日志判断当前阶段和推荐阶段
- 判断是否允许进入目标阶段
- 输出门禁检查、阻断原因和下一步动作

当前重点门禁：

- 启动最小必需字段包
- 页面任务必补字段包
- 阶段切换日志回写前置条件
- S3 / S4 的基础进入条件

当前边界：

- V1 主要依赖宿主 Markdown 结构和关键字段
- 暂未覆盖所有复杂场景和更深层语义判断

---

## `bootstrap-host.mjs`

作用：

- 安全补齐宿主基础目录骨架
- 复用 `generate-host-rules` 补齐 `docs/rules/`
- 在显式前置条件满足时创建模板文件

当前策略：

- 默认优先创建目录和规则目录
- 不默认静默创建 `project-profile.md`
- 创建 `project-profile.md` 时，必须同时提供 `--interview-complete` 与 `--interview-json`
- 不默认静默创建 `execution-plan.md`
- 不覆盖已有权威文件

适用场景：

- 新项目初始化
- 宿主项目缺少骨架目录
- 宿主缺少规则目录或默认规则文件

当前边界：

- V1 不负责自动迁移整个套件到宿主 `.agent/`
- V1 不负责自动删除旧套件目录
- V1 不替代主入口完成访谈；调用方必须先完成访谈并提交结构化结果

---

## `devlog-sync.mjs`

作用：

- 新建每日日志
- 追加同日日志补充更新
- 命中规则升级信号时同步更新规则候选池

适用场景：

- 一轮有效推进结束后
- 用户要求“写日志 / 总结今天 / 补今日日志”时

当前边界：

- V1 重点是结构化写入
- 暂未接入 git 提交记录聚合
- 不自动回写执行计划状态
- 日志文件负责当天工作的总结沉淀，计划文件仍是 AI 执行判断依据
- 规则候选池目前是“追加记录”能力，不做复杂去重合并

---

## `check-protocol-alignment.mjs`

作用：

- 检查协议文档中的“结构化实现”映射是否完整
- 检查结构化实现文件的 Traceability 头是否反向指回协议源
- 提前发现“文档改了、结构化实现没改”或“结构化实现改了、文档没回写”的分叉

适用场景：

- 改了协议文档中的映射关系后
- 改了 `lib/ai-pm-protocol/` 或 `lib/bootstrap/` 中的 Traceability 头后
- 想快速确认协议文档和结构化实现是否仍然双向对齐时

当前边界：

- V1 先覆盖协议文档与结构化实现的双向对照
- 还没有覆盖“协议文档 ↔ 工具脚本 ↔ 平台入口”的全量自动对照

---

## 重要说明

- 这些工具当前都以“安全优先”为原则
- 先校验，再补目录，再做受控写入
- 不应把它们理解为“已经完全替代主入口判断”
- 现阶段最可靠的用法是：`validate` + `route-check` + 有条件地执行 `bootstrap` 或 `devlog`

---

## 相关文档

- `docs/ai-project-manager-scriptification-plan.md`
- `lib/ai-pm-protocol/README.md`
- `docs/tooling/ai-pm-tools-usage.md`
- `docs/tooling/ai-pm-maintenance-guide.md`
- `tests/README.md`
