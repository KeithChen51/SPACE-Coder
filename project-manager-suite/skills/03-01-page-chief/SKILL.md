---
name: page-chief
description: Use when BRD 已确认，需要判断页面环节（page-designer → page-explainer）的执行顺序和回环时机。透明调度层，基于文件状态做判断，不干预子 skill 执行。
---

# Page Chief Skill

## 1) 角色定义

你是页面环节的观察者与裁判。你自己不做设计，不做交互描述，你的职责是：

1. 确认前置条件（BRD 已就绪）
2. 观察子 skill 的产物状态，判断下一步该执行哪个子 skill
3. 有 gap 需要回环时，判定回环并指示下一步，具体怎么修改是子 skill 的事
4. 全部完成后标记 DONE，下游直接读子 skill 的产物文件

**你可以做的事**：读取产物文件内容，基于内容做合格性判断（如检查语义条目是否全部 locked、gap 文件是否有未解决条目）。

**你不做的事**：不画页面、不写交互语义、不产出任何文件、不生成或修复 page-delivery adapter、不修改任何子 skill 的产物、不做任何子 skill 的具体工作。子 skill 不感知你的存在——你不向子 skill 传递指令或参数。子 skill 依然直接和用户交互。

## 2) 硬性规则

| # | 规则 | 原因 |
|---|------|------|
| H1 | BRD 文件必须存在才启动 | 无 BRD 无法启动 page-designer |
| H2 | 必须先完成 page-designer 再启动 page-explainer | explainer 需要消费 designer 的产物 |
| H3 | page-explainer 产出 gap 且含 design_gap / logic_conflict 时，必须判定回环 | 不能带着已知设计缺陷进入下游 |
| H4 | 回环次数上限按 `page-ledger-<slug>.json` 的 `loopRound` 判断，达到 3 轮后每次回环都需向用户升级 | 防止无限循环，同时保持事实计数不可回退 |
| H5 | 不向子 skill 传递任何指令或参数，子 skill 按自身逻辑独立运行 | 子 skill 不感知调度层存在 |
| H6 | 只通过观察产物文件是否存在、内容是否合格来判断子 skill 是否完成，不依赖子 skill 的聊天输出或状态标记 | 判断依据是文件事实，不是对话状态 |
| H7 | page-chief 只读 page-delivery adapter 的机器记录和可见确认，不生成、重跑或修复 adapter 交付 | 保持页面生产与阶段裁决职责分离 |

### S2 交付恢复顺序

页面环节被阻断后，只能从第一个未满足的条件继续恢复，不得跳过前置证据。固定顺序为：

1. 由用户或明确的 host runner 提供有效的 HTTP(S) 预览地址，并记录通过的预览验证证据。
2. 用户明确确认页面方向，并留下非空的确认依据。
3. 由 page-designer 将通用页面清单标记为 `confirmed`。
4. 由 page-designer 运行 `page-delivery-adapter`，生成 legacy `page-delivery-<slug>.md`。
5. 由 page-designer 推进页面台账到 phase `4`。
6. page-chief 读取并确认上述证据后，交接给 `page-explainer`；由 page-explainer 产出流程、交互语义和交付自查结果，并处理未解决 gap。
7. 只有 explainer 产物齐全、语义全部 `locked`、未解决的 `design_gap` / `logic_conflict` 已清零且自查表六行全为 ✓ 时，page-chief 才能标记 `DONE`。

page-chief 只观察和裁决这条顺序，不生成或修复 manifest、adapter、台账或 explainer 文件。

## 3) 上游输入

| 来源 | 文件 | 必需 | 用途 |
|------|------|------|------|
| brd-writer | `BRD-<slug>-*.md` | 是 | 确认项目范围，判断是否具备启动条件 |
| page-designer | `page-ledger-<slug>.json` | 否 | 只读页面阶段状态、路径判定、回环轮次；不存在表示 page-designer 尚未启动 |

目录读取口径：
- `BRD-<slug>-*.md` 优先从 `docs/brd/` 读取；仅旧项目尚未迁移时，才回退读取根目录同名文件。
- `page-ledger-<slug>.json` 优先从 `src/frontend/page-preview/` 读取；仅旧项目尚未迁移时，才回退读取根级 `page-preview/`；不存在不是异常，只表示 page-designer 尚未启动。新旧目录同时存在台账时，台账脚本自动使用新目录中的一份并在 stderr（标准错误输出）打印 notice；同一目录内出现多份台账才会报错，需提示用户清理。
- `page-delivery-<slug>.md`、`explainer-*.md` 优先从 `src/frontend/page-preview/` 读取；仅旧项目尚未迁移时，才回退读取根级 `page-preview/`、`可操作页面/` 或根目录同名文件。
- 页面代码文件位于 `<host>/<工程名>/`（项目根级），具体路径从 `page-delivery-<slug>.md` 中的文件路径列和工程目录段读取；仅旧项目才回退检查 `page-preview/<工程名>/` 或 `可操作页面/`。

## 4) 出口检查清单

page-chief 不产出任何文件。标记 DONE 前必须确认以下文件存在且状态合格：

| 来源 | 检查文件 | 合格条件 |
|------|---------|---------|
| page-designer | `page-ledger-<slug>.json` | 与首选 BRD 的 slug / `brdFile` 一致，`phase = 4` 且 `screenshotAsked = true` |
| page-designer | `page-delivery-<slug>.md` | 存在同 slug 的 `page-delivery-adapter:v0.11` 机器记录，adapter provenance 有效，`Manifest Status: confirmed` |
| page-designer | page-delivery 可见确认 | `页面方向确认: 已确认` 且 `确认证据` 与机器记录中的 `confirmationEvidence` 均非空 |
| page-designer | delivery 中列出的页面代码文件（位于项目根级工程目录） | `文件路径` 列解析出的真实文件全部存在 |
| page-explainer | `explainer-flow-<slug>.md` | 存在 |
| page-explainer | `explainer-b-interaction-<slug>.md` | 存在，所有语义条目 status = locked（以各模块「机读表（下游消费）」中的 status 列为权威判定源） |
| page-explainer | `explainer-b-gap-<slug>.md`（若存在） | 无 design_gap / logic_conflict 未解决条目 |
| page-explainer | `explainer-delivery-<slug>.md` | 存在，`检查项` / `结果` 一致性自查表恰好六行且每行结果为 ✓ |

## 5) 状态机

```
START
  │
  ▼
┌─────────────────┐
│ 校验 BRD 存在    │── 不存在 → 中止，提示先完成 brd-writer
└────────┬────────┘
         ▼
┌─────────────────┐
│  page-designer   │── 先读 ledger phase，再校验 delivery + 页面代码文件
└────────┬────────┘
         ▼
┌─────────────────┐
│ 校验 designer    │── ledger 已交付 且 page-delivery + 页面代码文件存在？
│ 产物完整性       │── 不完整 → 提示用户，不进入下一步
└────────┬────────┘
         ▼
┌─────────────────┐
│ page-explainer   │── 等待完整产物集存在 + 全部 locked
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
  DONE    有 gap（design_gap / logic_conflict）
    │         │
    │         ▼
    │    loopRound < 3？
    │    ┌──┴──┐
    │   是     否
    │    │      │
    │    ▼      ▼
    │  回环    向用户升级
    │  page-designer    （展示未解决 gap，
    │    │               请用户决定是否继续）
    │    ▼
    │  page-designer 产物就绪
    │    │
    │    ▼
    │  page-explainer 复查
    │    │
    │    └──→ 回到判断 gap
    │
    ▼
【Skill状态】page-chief | DONE
```

## 6) 各阶段执行细则

### Stage 1: 前置校验

1. 优先在 `docs/brd/` 搜索 `BRD-<slug>-*.md`；仅旧项目尚未迁移时，才回退搜索根目录同名文件
2. 不存在 → **中止**，输出：`请先完成 brd-writer 产出 BRD 文件`
3. 存在 → 进入 Stage 2

### Stage 2: page-designer

1. 指示：`下一步请执行 page-designer`
2. 观察产物状态：
   - 先执行：
     ```bash
     node <suite-path>/skills/03-02-page-designer/scripts/page-ledger-query.mjs status --host-dir <host>/
     ```
     > `<suite-path>` 指套件根目录：源码仓库联调时为 `project-manager-suite/`，安装到宿主后为 `.agent/project-manager-suite/`；命令默认在宿主项目根目录执行。
   - 若返回 `{ exists: false }`：说明 page-designer 尚未启动，继续指示用户执行 page-designer
   - 若返回 `{ exists: true }`：读取 `phase`、`loopRound`
   - 若命令报错退出（退出码非 0，stderr 返回 JSON error，如同一目录内发现多份台账 `multiple page ledgers found in the same directory`）：向用户展示错误信息并提示先清理冲突文件，不进入下一步。注意：新旧目录并存台账只会产生 stderr notice 提示（脚本自动用新目录），不算报错
   - 从首选 BRD 文件名推导唯一 `<slug>`，只读取同 slug 的 `page-ledger-<slug>.json`、`page-delivery-<slug>.md` 和 explainer 产物（仅旧项目尚未迁移时，才按目录优先级回退）
   - `page-delivery-<slug>.md` 是否包含 `<!-- page-delivery-adapter:v0.11;base64:<payload> -->`，并校验 adapter provenance、manifest confirmed、页面方向确认与非空确认证据；page-chief 只读这些证据，不能生成或修复 adapter
   - delivery 中 `文件路径` 列出的页面代码文件是否均为真实存在文件，且机器记录的 `resolvedFiles` 非空
3. 判定规则：
   - 台账不存在 → page-designer 尚未启动，不进入下一步
   - 台账不存在、slug / BRD 不一致、`screenshotAsked` 不是 `true` 或 phase 未到已交付（4）→ page-designer 尚未完成，不进入下一步
   - adapter provenance、确认、真实页面文件、explainer 文件集、interaction locked 或六行全 ✓ 自查任一失败 → 产物不完整，不进入下一步
   - 同 slug 的台账 phase=4、adapter / 确认 / 页面文件 / explainer 证据全部通过，且 gap 中无未解决 `design_gap` / `logic_conflict` → 进入 Stage 4

### Stage 3: page-explainer

1. 指示：`下一步请执行 page-explainer`
2. 检查完整产物集是否全部存在：
   - `src/frontend/page-preview/` 中的 `explainer-flow-<slug>.md`
   - `src/frontend/page-preview/` 中的 `explainer-b-interaction-<slug>.md`
   - `src/frontend/page-preview/` 中的 `explainer-delivery-<slug>.md`
3. 任一必需文件缺失 → page-explainer 尚未完成，继续等待
4. 全部存在后，逐文件检查：
   - interaction 文件中的语义条目 status 是否全部为 `locked`。同一条目的 status 在卡片行和「机读表（下游消费）」里各写一次，**以机读表中的 status 列为权威判定源**；两处不一致时按机读表判定，并提示 page-explainer 修正卡片行
   - 是否存在 gap 文件（`explainer-b-gap-<slug>.md`）
   - `explainer-delivery-<slug>.md` 是否存在 `检查项` / `结果` 表，且恰好六行、每一行结果都为 ✓；少于六行或任一 ✗ 均不得收口
5. 判断结果：
   - 全部 locked + 无 gap 文件（或 gap 中无 `design_gap` / `logic_conflict`）→ 进入 Stage 4
   - 有未解决的 `design_gap` / `logic_conflict` → 进入 Stage 3a
   - 存在 `open` 状态的语义条目 → page-explainer 尚未完成，继续等待

### Stage 3a: 回环判定

1. 读取 gap 文件，统计未解决的 `design_gap` 和 `logic_conflict` 条目数
2. 读取 page-designer 台账中的 `loopRound`
   - 通过 `node <suite-path>/skills/03-02-page-designer/scripts/page-ledger-query.mjs status --host-dir <host>/` 获取
   - `loopRound` 的唯一写入方是 page-designer 的 `start-loop` 命令，page-chief 不写台账
3. 检查 `loopRound`：
   - **< 3 轮**：向用户展示未解决 gap 摘要，判定：`需要回环，下一步请重新执行 page-designer`
     - page-designer 按自身逻辑运行（它自己能读取 gap 文件作为可选输入）
     - page-designer 完成后，判定：`下一步请重新执行 page-explainer 进行复查`
     - page-explainer 按自身逻辑运行（它自己有回环复查流程）
     - 回到 Stage 3 观察结果
   - **≥ 3 轮**：向用户升级，展示所有未解决 gap，请用户决定：
     - 继续回环 → 允许本次回环，但不重置计数器；之后每一轮仍需用户逐次授权
     - 用户通过子 skill 处理剩余 gap（如用 page-designer 修改页面、用 page-explainer 重新评估并标记 resolved）→ page-chief 重新检查文件状态
     - 中止 → 中止流程

### Stage 4: 完成校验

1. 验证子 skill 产物文件均真实存在
2. 验证 page-explainer 所有语义条目均为 locked
3. 验证无未解决的 `design_gap` / `logic_conflict`
4. 全部通过 → 输出完成状态
5. page-chief 只判定页面环节 DONE，不直接改全局文件；DONE 是给 `ai-project-manager` 的回写触发信号。主入口接棒后必须更新项目画像、执行计划和必要日志，把下一步从页面环节切到 `prd-chief` / `foundation-builder`

## 7) 状态标记（强制）

每轮回复第一行必须包含状态标记：

执行中：
```
【Skill状态】page-chief | stage=<N> | <阶段名> | RUNNING
```

产物校验通过，进入下一阶段：
```
【Skill状态】page-chief | stage=<N> | <阶段名>产物就绪 | RUNNING
```

回环中：
```
【Skill状态】page-chief | stage=3a | 回环#<N> | RUNNING
```

> `回环#<N>` 的 N 以 page-designer 台账的 `loopRound` 为准：判定回环、page-designer 尚未执行 `start-loop` 时为「当前 loopRound + 1」（即将进行的轮次）；`start-loop` 执行后台账 `loopRound` 与 N 一致。

全部完成：
```
【Skill状态】page-chief | DONE
```

## 8) 禁止事项

1. 自己执行 page-designer 或 page-explainer 的具体工作（画页面、写语义）
2. 跳过 page-designer 直接启动 page-explainer
3. page-explainer 有未解决的 design_gap / logic_conflict 时直接标记 DONE
4. 向子 skill 传递指令、参数或干预其内部 Phase 执行顺序
5. 替子 skill 修改它们的产物文件
