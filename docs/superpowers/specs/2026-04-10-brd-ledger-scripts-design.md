# BRD Ledger Scripts 设计规格

> 日期: 2026-04-10
> 状态: Draft
> 范围: skills/brd-writer 台账操作脚本化

## 1. 设计目标

将 brd-writer Skill 中的**流程型工作**（确定性、规则驱动、数据变换）从 AI 剥离到脚本，保留 AI 专注于**认知型工作**（诊断、追问、内容生成）。

### 1.1 认知-流程分离原则

**AI 负责"想"**：诊断产品缺陷、生成互斥选项、方法论推荐、需求真伪鉴别、BRD 正文撰写。

**脚本负责"记"**：台账创建、字段锁定、进度计算、结构校验、章节裁剪、文件落盘。

分离的理由：
- AI 编辑 markdown 表格是概率性操作，容易错列、漏行、破坏格式
- AI 计数和条件判断不可靠（历史 bug P2：忘记过滤条件字段 → 伪缺口）
- AI 上下文被簿记消耗，挤压思考空间

### 1.2 不越界

脚本只做结构校验，不做语义判断。具体边界见 §5.3。

## 2. 架构

### 2.1 数据层：JSON 为权威源，Markdown 为展示层

```
ledger-state-<slug>.json   ← 权威数据源（结构化、精确、脚本读写）
       ↓ render
brd-ledger-<slug>.md       ← 展示层（人可读、只读视图）
```

JSON 文件名包含 slug，与 markdown 命名规则一致，避免同目录多项目冲突。

- 所有脚本读写 `ledger-state-<slug>.json`
- 每次写入后自动重新渲染 `brd-ledger-<slug>.md`
- AI 和需求方查看 markdown，但不直接编辑它
- Markdown 头部包含防手改标记：`<!-- 此文件由 ledger-state-<slug>.json 自动生成，请勿手动编辑。修改请通过 brd-writer 脚本操作 JSON 源文件。 -->`

### 2.2 稳定字段 ID

JSON 中使用英文稳定 ID 作为字段键，不使用中文字段名。中文显示名在渲染时映射。

字段 value 分两种类型：

**普通字段**（多数字段）：value 为字符串或 null。
```json
{
  "id": "core_pain_points",
  "display_name": "核心痛点",
  "field_type": "fact",
  "value_type": "text",
  "value": "巡检漏检率高+异常上报滞后",
  "status": "locked",
  "lock_round": 3,
  "methodology": "来源: 需求方确认"
}
```

**结构化字段**：仅用于**天然是单条记录**的度量字段。value 为结构化子对象，脚本可精确校验每个子字段是否已填。这些字段在 field registry 中标记 `value_type: "structured"`，并定义 `value_schema`。

**适用边界**：只有当原 skill 模板中该字段明确是单行/单条记录时，才定义为 structured。多行表格（如"辅助指标体系"是多个指标的集合）、多条目列表（如"合规达标标准"可能对应多个法规条款）保持 `value_type: "text"`——脚本不改变原 skill 的数据语义。

示例——北极星指标（单条，适合结构化）：
```json
{
  "id": "innovation_north_star",
  "display_name": "北极星指标",
  "field_type": "decision",
  "value_type": "structured",
  "value_schema": ["metric_name", "formula", "target", "period"],
  "value": {
    "metric_name": "月活跃付费用户数",
    "formula": "当月至少完成 1 次付费的独立用户数",
    "target": "10000",
    "period": "月"
  },
  "status": "locked",
  "lock_round": 8,
  "methodology": "AARRR → Revenue 层指标"
}
```

示例——辅助指标体系（多条，保持 text）：
```json
{
  "id": "innovation_auxiliary_metrics",
  "display_name": "辅助指标体系",
  "field_type": "decision",
  "value_type": "text",
  "value": "7日留存率 ≥ 40%；付费转化率 ≥ 5%；ARPU ≥ ¥30/月",
  "status": "locked",
  "lock_round": 9,
  "methodology": "AARRR → Retention/Revenue 层"
}
```

结构化字段完整清单（仅限天然单条记录的字段）：

| 项目类型 | 字段 ID | value_schema | 原模板对应 |
|---------|---------|-------------|-----------|
| 创新型 | `innovation_north_star` | `[metric_name, formula, target, period]` | §2.2 北极星指标（单行） |
| 扩展型 | `extension_core_metrics` | `[metric_name, formula, target, period]` | 核心指标（单行） |
| 改造型 | `transformation_target_metric` | `[dimension, baseline, target]` | 改造目标指标（单维度） |
| 运营型 | `operational_efficiency_goal` | `[dimension, baseline, target]` | 效率目标（单维度） |

**不结构化的字段**（原 skill 中为多行/多条目，保持 text）：
- `innovation_auxiliary_metrics`（辅助指标体系——多个指标）
- `compliance_standard`（合规达标标准——可能多个法规条款）
- `integration_goal`（集成目标——可能多个维度）

字段 ID 命名规则：
- 通用 P0：`project_type`, `has_c_page`, `is_commercial`, `project_background`, `stakeholder_roles`, `core_pain_points`, `core_value_model`, `scope_definition`, `key_risks`, `milestones`
- 类型追加 P0：以类型前缀 + 语义命名，如 `innovation_target_user_scenario`, `transformation_current_pain`, `integration_upstream_downstream`
- 页面定位：`page_coverage`, `page_target_users`, `page_primary_use`, `page_positioning`, `page_structure`, `page_downstream_boundary`

完整 ID 清单在实现时由 `ledger-io.mjs` 内的 field registry 定义。

### 2.3 Schema Version

```json
{
  "schema_version": "1.0.0",
  "header": {
    "project_name": "...",
    "slug": "...",
    "project_type": "...",
    "has_pages": true,
    "current_phase": "C",
    "current_round": 5,
    "created_at": "...",
    "last_updated": "...",
    "reopen_count": 0,
    "pending_brd_filename": null,
    "brd_filename": null,
    "d5_state": {
      "last_result": null,
      "last_triggered_at_round": null,
      "fields_changed_since_last_d5": false
    }
  },
  "fields": [ ... ],
  "conflicts": [ ... ],
  "changelog": [ ... ],
  "gates": [ ... ],
  "chapter_plan": null
}
```

- 遵循 semver：字段增删改结构 = major，新增可选字段 = minor，纯 bug fix = patch
- `ledger-io.mjs` 在读取时检查 `schema_version`，不兼容版本直接报错并提示迁移路径
- 未来版本变更时，在 `ledger-io.mjs` 中添加迁移函数（`migrate_1_0_to_2_0`）

### 2.4 写入策略：JSON 优先，Markdown 可重建

JSON 是权威源，Markdown 是可随时从 JSON 重建的展示层。写入策略基于这一不对称性设计，不追求双文件原子事务（两次 rename 做不到真正的原子）。

```
1. 修改内存中的 JSON 对象
2. 写 JSON 到临时文件 ledger-state-<slug>.json.tmp
3. rename ledger-state-<slug>.json.tmp → ledger-state-<slug>.json（JSON 提交点）
4. 渲染 Markdown 到临时文件 brd-ledger-<slug>.md.tmp
5. rename brd-ledger-<slug>.md.tmp → brd-ledger-<slug>.md
```

**保证**：
- JSON 写入通过 rename 保证单文件原子性（不会出现写到一半的 JSON）
- 若步骤 4-5 失败（Markdown 渲染失败），JSON 已提交成功，Markdown 处于过期状态。这是可接受的——下次任何写操作或 `ledger-render.mjs markdown` 都会重建 Markdown
- 若步骤 2-3 失败，原文件不变

**不保证**：
- 不是双文件原子事务。存在"JSON 已更新但 Markdown 尚未更新"的短暂窗口

## 3. 文件结构

```
skills/brd-writer/scripts/
├── ledger-io.mjs           # 共享模块：field registry、JSON schema、读写、原子写入、JSON → Markdown 渲染
├── ledger-mutate.mjs       # 所有写操作（状态变更）
├── ledger-query.mjs        # 所有读操作（状态查询）
└── ledger-render.mjs       # 产物输出（章节裁剪、BRD 落盘）— 产物输出型 writer，非纯只读
```

脚本放在 `skills/brd-writer/scripts/` 内，是 brd-writer Skill 的私有工具。

## 4. ledger-io.mjs（共享模块）

不作为独立 CLI 调用，被其他 3 个脚本 import。

### 4.1 职责

- **Field Registry**：字段 ID → 显示名映射、字段类型（decision/fact）标注、按项目类型的字段集定义、条件字段过滤规则
- **JSON Schema**：`ledger-state-<slug>.json` 的结构定义与校验
- **读写**：读取/写入 JSON 文件，含 schema_version 兼容性检查
- **写入策略**：§2.4 描述的 JSON 优先写入（单文件原子，Markdown 可重建）
- **Markdown 渲染**：JSON → Markdown 转换（含防手改标记、表格格式化）
- **章节裁剪矩阵**：项目类型 × 章节的适用性查表
- **Phase 迁移规则**：合法的阶段转换有向图

### 4.2 Phase 迁移有向图

```
B → C                     （诊断完成，进入收敛）
C → D.5                   （P0 确认率 100%，且 should_trigger_d5 = true）
C → E                     （P0 确认率 100%，且 should_trigger_d5 = false，即 D.5 已通过无需重跑）
D.5 → E                   （前提全部通过）
D.5 → C                   （前提被否定，回退收敛）
E → E.5                   （门槛全部通过）
E → C                     （门槛未通过，隐含：继续提问后回到 C）
E.5 → F                   （需求方确认终稿）
E.5 → C                   （需求方要求修改，回退收敛）
F → DONE                  （终稿落盘成功）
DONE → C                  （需求方明确要求继续迭代）
```

`set-phase` 子命令必须校验当前阶段 → 目标阶段是否在此有向图中，非法迁移直接报错。

**DONE → C 的特殊处理**：重新打开时，脚本执行以下操作：
1. `reopen_count` 加 1
2. changelog 追加一条"重新打开"记录
3. **gates 快照全部重置**：所有门槛状态清为未检查（`status: null`），避免旧结论在新一轮改稿中被误读为仍然有效
4. **chapter_plan 清空**：设为 `null`，旧的章节计划不能用于校验新一轮的 BRD
5. **d5_state 设为"等待变更"**：`last_result` 设为 `"passed"`（上一轮确实通过了），`fields_changed_since_last_d5` 设为 `false`。这样 `should_trigger_d5` 的判定逻辑会要求"先发生字段变更"才能重新触发 D.5，不会在 reopen 后立刻误触发
6. 已锁定字段保持 locked 不重置——需求方是要求迭代改稿，不是推倒重来

### 4.3 条件字段过滤规则

从 `references/p0-fields.md` 提取的规则，硬编码在 field registry 中：

| 条件 | 控制的字段 |
|------|-----------|
| `is_commercial === true` | 展开变现模式相关字段（如 `innovation_monetization`） |
| `has_c_page === true` | 展开页面定位全套字段（§1.3）；同时标记 `has_pages = true` |
| 集成型 | `has_c_page` 强制为 `false`；`has_pages` 为 `false`（纯 B2B，无页面） |
| 运营型 | 页面定位字段强制展开（运营型必有后台页面）；`has_pages` 强制为 `true`，与 `has_c_page` 无关 |

**`has_c_page` 与 `has_pages` 的区别**：
- `has_c_page`：是否包含 C 端页面（触发 BFF 架构约束）
- `has_pages`：是否包含任何页面（控制页面定位字段是否展开）
- 运营型：`has_c_page` 可能为 false，但 `has_pages` 恒为 true
- `has_pages` 是派生字段，由 `init` 根据项目类型和 `has_c_page` 自动计算，不需要需求方确认

条件不满足的字段不写入 JSON，避免产生永远 open 的伪缺口。

## 5. ledger-mutate.mjs

CLI 入口，处理所有台账状态变更。

### 5.1 子命令

#### `init`

```bash
node ledger-mutate.mjs init \
  --project-type <innovation|transformation|extension|integration|operational|compliance> \
  --has-c-page <true|false> \
  --is-commercial <true|false> \
  --slug <project-slug> \
  --project-name <"项目中文名称"> \
  --output-dir <path>
```

- 根据项目类型从 field registry 加载 P0 字段集
- 应用条件字段过滤规则（§4.3）
- 3 个元字段（`project_type`、`has_c_page`、`is_commercial`）直接写入 `fields[]` 并标记为 `locked`（锁定轮次 = 0，方法论 = "Phase A 定性"），因为调用 `init` 时 AI 已与需求方确认了这些值
- 其余 P0 字段写入 `fields[]`，状态为 `open`
- 创建 `ledger-state-<slug>.json` + 渲染 `brd-ledger-<slug>.md`
- 初始 phase = `B`

#### `lock`

```bash
node ledger-mutate.mjs lock \
  --ledger <path-to-ledger-state.json> \
  --fields '<JSON array>'  \
  --round <n> \
  --requester-quote <"需求方原话摘要">
```

`--fields` 格式（普通字段，value 为字符串）：
```json
[
  { "id": "stakeholder_roles", "value": "区域经理/巡检员/店长", "methodology": "来源: project-profile + 需求方确认" },
  { "id": "core_pain_points", "value": "巡检漏检率高+异常上报滞后", "methodology": "来源: 需求方确认" }
]
```

`--fields` 格式（结构化字段，value 为子对象，仅限 §2.2 中标记为 structured 的字段）：
```json
[
  {
    "id": "innovation_north_star",
    "value": { "metric_name": "月活跃付费用户数", "formula": "当月至少完成1次付费的独立用户数", "target": "10000", "period": "月" },
    "methodology": "AARRR → Revenue 层指标"
  }
]
```

脚本根据 field registry 中的 `value_type` 校验传入的 value 类型：text 字段传字符串，structured 字段传对象。类型不匹配则拒绝。
```

- 单字段和多字段使用同一接口（数组长度 1 = 单锁，>1 = 批量锁）
- 锁定前执行规则冲突检测（§5.3）
- **冲突阻断**：若检测到规则冲突，`lock` 拒绝写入，将冲突信息写入 conflicts 数组并返回错误。AI 必须先通过 `resolve-conflict` 解决冲突或调整锁定值后重试。这与 SKILL.md 的协议一致：先记录冲突、先解决、再继续锁定
- 无冲突时：更新字段状态 → 追加 changelog → 触发 §5.2 派生状态失效 → 写入

#### `rollback`

```bash
node ledger-mutate.mjs rollback --ledger <path>
```

- 读取 changelog 最后一条非回滚记录
- 逆转对应字段状态（首次锁定 → 恢复 open；修改已锁定 → 恢复旧值）
- 追加回滚记录到 changelog
- 触发 §5.2 派生状态失效（chapter_plan 清空、gates 重置、d5_state 重算）
- 不支持跳轮回滚

#### `set-phase`

```bash
node ledger-mutate.mjs set-phase --ledger <path> --phase <B|C|D.5|E|E.5|F|DONE> --round <n>
```

- 校验当前阶段 → 目标阶段是否为合法迁移（§4.2），非法迁移报错退出
- 更新 header 的 phase 和 round

#### `add-conflict`

```bash
node ledger-mutate.mjs add-conflict \
  --ledger <path> \
  --fields <"field_id_1,field_id_2"> \
  --description <"冲突描述">
```

#### `resolve-conflict`

```bash
node ledger-mutate.mjs resolve-conflict \
  --ledger <path> \
  --conflict-id <n> \
  --resolution <"解决方式"> \
  --round <n>
```

#### `update-gates`

```bash
node ledger-mutate.mjs update-gates \
  --ledger <path> \
  --gates '<JSON array>'
```

`--gates` 格式：
```json
[
  { "gate": "field_completeness", "status": "pass", "remarks": "" },
  { "gate": "consistency", "status": "pass", "remarks": "" },
  { "gate": "executability", "status": "pass", "remarks": "AI 判断: DoD 可测试" },
  { "gate": "measurement", "status": "fail", "remarks": "AI 判断: 北极星指标缺公式口径" }
]
```

门槛结果由 `ledger-query.mjs lint`（结构部分）+ AI（语义部分）共同产出，最终由 AI 调用此命令统一写入。

### 5.2 所有 mutate 子命令的通用行为

1. 读取 JSON → 校验 schema_version
2. 执行变更
3. **若本次变更涉及字段值变化**（lock、rollback），触发派生状态失效：
   - `chapter_plan` → 清空为 null（字段变更可能影响章节裁剪）
   - `gates` → 全部重置为未检查（字段变更可能导致门槛结论失效）
   - `d5_state.fields_changed_since_last_d5` → 从 changelog 事实重算（见下方规则）
4. 更新 `last_updated` 时间戳
5. 按 §2.4 写入策略提交 JSON + 重渲染 Markdown
6. 输出 JSON 格式的操作结果（供 AI 消费）

**`fields_changed_since_last_d5` 重算规则**：扫描 changelog 中 `d5_state.last_triggered_at_round` 之后的所有记录，若存在至少一条非回滚的字段变更记录且该变更当前仍生效（未被后续回滚撤销），则为 `true`，否则为 `false`。

### 5.3 规则冲突检测（lock 子命令内置）

脚本能检测的**规则冲突**（显式约束违反）：

| 冲突类型 | 检测逻辑 |
|---------|---------|
| 集成型 + C 端页面 | `project_type === "integration" && has_c_page === true` |
| 非商业化 + 变现字段 | `is_commercial === false` 但尝试锁定 monetization 类字段 |
| 页面字段 + 无页面项目 | `has_pages === false` 但尝试锁定 page_ 类字段（注意：用 `has_pages` 而非 `has_c_page`，运营型 `has_pages` 为 true，不会被误杀） |

脚本**不检测**的**语义冲突**（需要 AI 判断）：
- 角色痛点与价值模型矛盾
- 目标指标与范围定义不匹配
- 竞品分析结论与价值主张冲突

规则冲突发现时：`lock` **拒绝写入字段值**，仅将冲突记录写入 conflicts 数组，返回错误码和冲突详情。AI 必须先解决冲突（通过 `resolve-conflict` 或调整锁定值），再重新调用 `lock`。这遵循 SKILL.md 的协议：先记录冲突 → 指出冲突要求确认 → 解决后再锁定，不得静默覆盖。

脚本返回的错误输出必须包含明确的重试指引，供 AI 直接消费：
```json
{
  "success": false,
  "error": "rule_conflict",
  "conflicts": [{ "id": 1, "fields": ["has_c_page", "project_type"], "description": "集成型不允许 C 端页面" }],
  "retry_hint": "resolve-conflict --conflict-id 1 或调整 --fields 中的值后重试 lock"
}
```
SKILL.md 改造时，对应 Phase D 的台账动作指令中也需写明：若 `lock` 返回 `rule_conflict`，先向需求方指出冲突，确认解决方式后调用 `resolve-conflict`，再重试 `lock`。

## 6. ledger-query.mjs

CLI 入口，处理所有只读查询。不修改 JSON。

### 6.1 子命令

#### `status`

```bash
node ledger-query.mjs status --ledger <path>
```

输出所有 locked 字段的紧凑摘要（对应"展开状态"命令）。

#### `gaps`

```bash
node ledger-query.mjs gaps --ledger <path>
```

输出所有 open 字段列表（对应"只看缺口"命令）。

#### `progress`

```bash
node ledger-query.mjs progress --ledger <path>
```

输出：
```json
{
  "total_fields": 20,
  "locked_fields": 17,
  "open_fields": 3,
  "rate": "85%",
  "current_phase": "C",
  "current_round": 12,
  "open_field_ids": ["scope_definition", "key_risks", "milestones"],
  "unresolved_conflicts": 0,
  "should_trigger_d5": false,
  "d5_state": {
    "last_result": "failed",
    "last_triggered_at_round": 10,
    "fields_changed_since_last_d5": true
  }
}
```

#### `summary`

```bash
node ledger-query.mjs summary --ledger <path>
```

输出全量 locked 字段的值（对应 Phase E.5 "终稿前确认摘要"）。

**`should_trigger_d5` 判定规则**：

`should_trigger_d5 = true` 当且仅当以下条件全部满足：
1. 当前 phase 为 `C`（只有在收敛阶段才可能触发）
2. P0 确认率 = 100%（open_fields = 0）
3. 未解决冲突数 = 0
4. 以下任一为真：
   - `d5_state.last_result === null`（从未触发过 D.5）
   - `d5_state.last_result === "failed" && d5_state.fields_changed_since_last_d5 === true`（上次 D.5 失败回退后，发生了字段变更并重新达到 100%——前提被动摇过，改完方案后需要重新审视）

**不触发 D.5 的场景**：`last_result === "passed"` 时，无论是否有字段变更，都不再触发 D.5。这覆盖：
- E.5 → C 修改后重新达到 100% → 直接进 E（前提已通过，只是调整细节）
- DONE → C 改稿后重新达到 100% → 直接进 E（前提在上一轮已通过）

D.5 是存在性验证（"问题对不对"），E 是完备性验证（"方案全不全"）。前提一旦通过，后续的字段微调不改变"要不要做这件事"的结论，只需要重新检查完备性。

`d5_state` 的维护：
- `lock` 子命令每次成功写入后，将 `fields_changed_since_last_d5` 设为 `true`
- `set-phase` 进入 `D.5` 时，将 `last_triggered_at_round` 设为当前轮次，将 `fields_changed_since_last_d5` 重置为 `false`
- `set-phase` 从 `D.5` 进入 `E` 时，将 `last_result` 设为 `"passed"`
- `set-phase` 从 `D.5` 回退到 `C` 时，将 `last_result` 设为 `"failed"`

#### `lint`

```bash
node ledger-query.mjs lint --ledger <path>
```

结构校验，诚实范围：

| 门槛 | lint 能做 | lint 不能做（标记 needs_ai_review） |
|------|----------|-----------------------------------|
| 字段完备门 | `locked count === total` | — |
| 一致性门 | `unresolved conflicts === 0` | — |
| 可执行门 | 检查 DoD 字段是否存在且非空 | DoD 内容是否真的可测试 |
| 度量门 | 结构化字段（`value_type: "structured"`）的每个 `value_schema` 子字段是否非空 | 指标公式是否业务合理、目标值是否现实 |
| 范围门 | 检查范围定义字段是否 locked | — |
| 方法论门 | 决策型字段的 methodology 列是否非空 | 方法论映射是否恰当 |
| 角色门 | 角色字段和痛点字段是否 locked | 痛点是否真的明确 |
| 页面门 | 页面字段是否全部 locked（若适用） | — |

**度量门检查逻辑**（两种字段区分处理）：
- **结构化字段**（`value_type: "structured"`，如北极星指标）：lint 检查 `value_schema` 中每个子字段是否非空。这是精确的字段存在性检查。
- **文本字段**（`value_type: "text"`，如辅助指标体系、合规达标标准）：lint 只检查 value 是否非空。**不对内容做正则或关键词匹配**——脚本不充当自由文本的"准权威判官"，内容质量统一交给 AI 在 `needs_ai_review` 中判断。

输出：
```json
{
  "pass": ["field_completeness", "consistency", "scope"],
  "fail": ["methodology"],
  "needs_ai_review": ["executability", "measurement", "methodology_quality", "role_quality"],
  "details": {
    "methodology": { "reason": "字段 core_value_model 的 methodology 列为空" }
  }
}
```

## 7. ledger-render.mjs

CLI 入口，处理产物输出。注意：这是**产物输出型 writer**，不是纯只读组件。`save-brd` 子命令既写产物文件又修改台账状态。

### 7.1 子命令

#### `chapters`

```bash
node ledger-render.mjs chapters --ledger <path>
```

分两步使用：先由 AI 决定 conditional 章节的去留，再由脚本生成最终编号映射。

**步骤一：`chapters plan`**（AI 决策前调用）

```bash
node ledger-render.mjs chapters plan --ledger <path>
```

输出裁剪矩阵的原始结果，AI 据此决定 conditional 章节保留或删除：

```json
{
  "chapters": [
    { "template_number": 1, "title": "项目背景与机会判断", "status": "required" },
    { "template_number": 2, "title": "商业目标与成功标准", "status": "required" },
    { "template_number": 4, "title": "核心价值主张", "status": "required" },
    { "template_number": 5, "title": "市场与竞品差异化", "status": "conditional", "reason": "裁剪矩阵标注'视情况'，由 AI 判断" },
    { "template_number": 7, "title": "商业化路径与收入模型", "status": "skip", "reason": "is_commercial === false" }
  ]
}
```

**步骤二：`chapters finalize`**（AI 决定 conditional 章节后调用）

```bash
node ledger-render.mjs chapters finalize --ledger <path> \
  --include <"1,2,4,5,8,9,10,11,12"> \
  --exclude <"7,13">
```

AI 将最终保留的模板章节编号传入 `--include`。脚本完成以下全部机械工作：

1. **重编号**：按 include 顺序分配连续的终稿编号（1, 2, 3, 4...）
2. **标题映射**：应用 type_specific_overrides（如改造型 §2 → "改造目标指标"）
3. **附录完整生成**：脚本内置每个下游 skill 依赖的语义字段清单（来自 brd-template.md 附录定义），逐行判定：
   - 该行所有必要字段在终稿中均不存在 → 整行删除（记入 `appendix_removed_rows`）
   - 该行至少一个字段存在 → 保留，逐字段标注：
     - 字段对应章节在终稿中存在 → `status: "present"`，填入终稿编号
     - 字段标注"若有"且对应章节不在终稿中 → `status: "not_applicable"`，备注"本次不适用"

输出：
```json
{
  "final_chapters": [
    { "final_number": 1, "template_number": 1, "title": "项目背景与机会判断" },
    { "final_number": 2, "template_number": 2, "title": "商业目标与成功标准" },
    { "final_number": 3, "template_number": 4, "title": "核心价值主张" },
    { "final_number": 4, "template_number": 5, "title": "市场与竞品差异化" },
    { "final_number": 5, "template_number": 8, "title": "MVP 范围" },
    { "final_number": 6, "template_number": 9, "title": "备选方案对比" },
    { "final_number": 7, "template_number": 10, "title": "关键前提假设" },
    { "final_number": 8, "template_number": 11, "title": "关键风险与兜底策略" },
    { "final_number": 9, "template_number": 12, "title": "阶段性里程碑" }
  ],
  "appendix": [
    {
      "downstream_skill": "prd-writer",
      "fields": [
        { "semantic_name": "目标与成功标准", "chapter_ref": "§2", "status": "present" },
        { "semantic_name": "竞品差异化", "chapter_ref": null, "status": "not_applicable", "note": "本次不适用" },
        { "semantic_name": "MVP范围", "chapter_ref": "§5", "status": "present" },
        { "semantic_name": "功能验收标准 DoD", "chapter_ref": "§5", "status": "present" }
      ]
    },
    {
      "downstream_skill": "foundation-builder",
      "fields": [
        { "semantic_name": "指标体系", "chapter_ref": "§2", "status": "present" },
        { "semantic_name": "核心价值模型", "chapter_ref": "§3", "status": "present" },
        { "semantic_name": "关键风险与兜底策略", "chapter_ref": "§8", "status": "present" },
        { "semantic_name": "是否包含C端页面", "chapter_ref": "头部", "status": "present" }
      ]
    }
  ],
  "appendix_removed_rows": [
    { "downstream_skill": "page-designer", "reason": "终稿无页面定位章节，所有必要读取字段均不存在" },
    { "downstream_skill": "page-explainer", "reason": "终稿无页面定位章节，所有必要读取字段均不存在" }
  ],
  "heading_outline": "## 1. 项目背景与机会判断\n## 2. 商业目标与成功标准\n## 3. 核心价值主张\n..."
}
```

AI 拿到 `final_chapters` 后按编号填写内容，拿到 `appendix` 直接粘贴，拿到 `heading_outline` 作为骨架——不需要自己算编号或回填引用。

`chapters finalize` 的结果同时写入台账 JSON 的 `chapter_plan` 字段（持久化），供 `save-brd` 校验时直接读取，不重新计算。
```

#### `save-brd`

```bash
node ledger-render.mjs save-brd \
  --ledger <path> \
  --content <path-to-brd-content.md> \
  --output-dir <path>
```

- **Phase 守卫**：读取台账当前 phase，必须为 `F` 才允许执行。若不是 `F`，拒绝执行并报错（防止绕过 E.5 终稿前确认）
- `--content` 接收 AI 已写好的 BRD 正文文件路径。约定临时文件路径为 `<output-dir>/.brd-draft-<slug>.md`（点号开头避免被当成正式产物）。AI 用 Write 工具写入此路径，脚本校验通过后将内容写入最终文件名并删除临时文件
- **前置检查**：台账中 `chapter_plan` 必须非空。若为空（说明 finalize 之后又发生了字段变更），拒绝执行并提示需要重新运行 `chapters finalize`
- **BRD 结构校验**（在写入前执行，不通过则拒绝落盘）。校验基于台账中的 `chapter_plan`（见 §7.1），不重新计算：
  1. **章节完备性**：解析 BRD 正文的 `## ` 标题，与 `final_chapters` 列表比对。附录（`## 附录：下游交接清单`）不参与编号章节比对——它是所有类型必有的固定章节，单独校验（见第 3 条）。编号章节中：缺少任一 final_number 对应的章节 → 拒绝。出现 final_chapters 中不存在的编号章节 → 拒绝
  2. **章节编号连续性**：实际章节编号必须与 `final_chapters` 的 final_number 序列完全一致
  3. **附录校验**：比对 BRD 中的附录与 `chapter_plan.appendix` 输出：
     - 已删除的下游行（`appendix_removed_rows`）不应出现在终稿中
     - 保留的下游行必须存在，且每个 `present` 字段的引用编号与 `chapter_plan` 一致
     - `not_applicable` 字段必须标注"本次不适用"，不能留空或引用不存在的章节
  4. **头部字段校验**：BRD 头部的项目类型、C 端页面、商业化标记必须与台账一致。若 `has_c_page === true`，校验两处 BFF 声明：头部的架构约束行必须包含"BFF"关键词，且终稿中 §13.1（按 `chapter_plan` 映射到实际编号）必须包含"BFF"关键词。任一缺失则拒绝
- 校验全部通过后，执行两阶段提交：
  1. **阶段一：预注册文件名**。生成带时间戳的文件名 `BRD-<slug>-<YYYYMMDD-HHMM>.md`，将文件名写入台账 header 的 `pending_brd_filename` 字段并提交 JSON（此时 phase 仍为 `F`）
  2. **阶段二：写入 BRD 文件**。将 BRD 正文写入目标文件，成功后清除 `pending_brd_filename`，将 `brd_filename` 设为最终文件名，更新 phase `F` → `DONE`
- **幂等恢复**：若重试时台账中 `pending_brd_filename` 非空（阶段一已完成但阶段二未完成），脚本用该文件名检测目标文件是否已存在：
  - 文件已存在（BRD 写成功但台账没推到 DONE）→ 直接更新台账 → `DONE`
  - 文件不存在（BRD 写入也失败了）→ 用同一个文件名重新写入，不生成新时间戳
- 输出绝对路径。这解决了"BRD 已落盘但台账还在 F"的中间态

#### `markdown`

```bash
node ledger-render.mjs markdown --ledger <path>
```

强制从 JSON 重新渲染台账 Markdown。正常流程中由原子写入自动触发，此命令用于调试或修复。

## 8. SKILL.md 对接方式

在 SKILL.md 的每个 Phase 的"台账动作"处，将原有的"AI 手动编辑台账"描述替换为具体的脚本调用指令。示例：

### Phase A 台账动作（改造前）

> 三个元字段和 slug 全部确定后，基于 `templates/brd-ledger.md` 创建 `brd-ledger-<slug>.md`，将项目类型对应的追加 P0 字段填入台账 §1.2

### Phase A 台账动作（改造后）

> 三个元字段和 slug 全部确定后，执行：
> ```bash
> node scripts/ledger-mutate.mjs init \
>   --project-type <type> --has-c-page <bool> --is-commercial <bool> \
>   --slug <slug> --project-name <"项目名称"> --output-dir <项目目录>
> ```
> 脚本自动完成：根据项目类型加载 P0 字段集、条件过滤、创建 `ledger-state-<slug>.json` + 渲染 `brd-ledger-<slug>.md`。

其他 Phase 同理，每个台账动作处替换为对应的脚本调用。

## 9. 跨会话恢复变更

当前 SKILL.md 描述的跨会话恢复是读取 markdown 台账。改造后：

- 读取 `ledger-state-<slug>.json`（而非 markdown）恢复状态
- 调用 `node ledger-query.mjs progress --ledger <path>` 获取当前阶段和进度
- 若 JSON 存在但 markdown 缺失/过时，调用 `node ledger-render.mjs markdown --ledger <path>` 重建

## 10. 不改变的部分

以下环节保持 AI 执行，脚本不介入：

- Phase A 入场门槛校验（读取 project-profile.md 判断信息是否充分）——上游产物的格式由 ai-project-manager 定义，skill 之间的产物对接靠 AI 语义理解，不由脚本硬编码解析
- Phase B 诊断（三维风险评估、致命问题识别）
- Phase B 角色识别 + 需求真伪鉴别
- Phase C 选项生成 + 方法论推荐
- Phase D 解读用户回答 → 提取决策值
- Phase D.5 前提挑战
- Phase E 语义类门槛判断（DoD 质量、指标合理性、方法论恰当性、角色痛点明确性）
- Phase E 业务语义冲突检测
- Phase F BRD 正文撰写
- 反奉承规则执行
- 苛评生成

## 11. 实施影响

### 11.1 新增文件

| 文件 | 类型 |
|------|------|
| `skills/brd-writer/scripts/ledger-io.mjs` | 共享模块 |
| `skills/brd-writer/scripts/ledger-mutate.mjs` | CLI 脚本 |
| `skills/brd-writer/scripts/ledger-query.mjs` | CLI 脚本 |
| `skills/brd-writer/scripts/ledger-render.mjs` | CLI 脚本（产物输出型 writer） |

### 11.2 修改文件

| 文件 | 变更内容 |
|------|---------|
| `skills/brd-writer/SKILL.md` | 各 Phase 台账动作替换为脚本调用指令；跨会话恢复改为读 JSON |
| `skills/brd-writer/templates/brd-ledger.md` | 保留作为 markdown 渲染的格式参考，但不再被 AI 直接用作模板填充 |

### 11.3 新增产物文件（运行时生成在项目目录）

| 文件 | 说明 |
|------|------|
| `ledger-state-<slug>.json` | 台账权威数据源，与 `brd-ledger-<slug>.md` 同级目录 |

### 11.4 不变文件

`references/` 下所有文件不变（p0-fields.md、methodology.md、interrogation-patterns.md、brd-template.md、test-scenarios.md）。它们仍然是 AI 在认知工作中读取的参考材料。

## 12. Traceability：脚本与规则源的对齐

Field registry 和章节裁剪矩阵硬编码在 `ledger-io.mjs` 中，其规则源分别是 `references/p0-fields.md` 和 `references/brd-template.md`。两者之间会形成双源，必须有对齐机制防止漂移。

### 12.1 对齐规则

每个硬编码的数据结构顶部必须标注 traceability 注释：

```javascript
/**
 * Traceability:
 * Rule source: references/p0-fields.md
 * Last aligned: 2026-04-10
 *
 * Change impact:
 * - If p0-fields.md changes field list or conditions, this registry must sync.
 * - Run: node scripts/ledger-query.mjs alignment-check
 */
```

### 12.2 alignment-check 子命令

在 `ledger-query.mjs` 中新增 `alignment-check` 子命令：

```bash
node ledger-query.mjs alignment-check --refs-dir <path-to-references>
```

- 解析 `p0-fields.md` 提取字段列表（按 `[决策]`/`[事实]` 标记和项目类型分组）
- 解析 `brd-template.md` 提取章节裁剪矩阵
- 解析 `brd-template.md` 附录表提取下游 skill 依赖的语义字段清单（每行的下游 skill 名 + 需读取字段列表）
- 与 `ledger-io.mjs` 中硬编码的 registry、矩阵、附录映射做 diff
- 输出不一致项（新增/删除/修改的字段、章节规则或附录依赖）

此命令不在运行时执行。建议在 CI 或 pre-commit hook 中自动触发：当 `references/p0-fields.md` 或 `references/brd-template.md` 被修改时，自动运行 `alignment-check`，输出不一致则阻断提交。不依赖开发者纪律。

## 13. 验证方案

实现完成后，需覆盖以下验证场景：

### 13.1 Phase 迁移

| 场景 | 预期 |
|------|------|
| B → C | 通过 |
| C → D.5 | 通过 |
| B → DONE | 拒绝，报非法迁移 |
| C → F | 拒绝 |
| E.5 → C（回退） | 通过 |
| F → DONE | 通过 |
| DONE → C（重新打开） | 通过，reopen_count +1，changelog 追加记录，gates 重置，chapter_plan 清空，d5_state = {last_result: "passed", fields_changed_since_last_d5: false} |
| DONE → F | 拒绝 |

### 13.2 锁定与冲突

| 场景 | 预期 |
|------|------|
| 锁定单个 open 字段 | 成功，changelog 追加记录 |
| 批量锁定 5 个字段 | 成功，5 个字段全部变 locked |
| 锁定时触发规则冲突（集成型 + C 端页面） | 拒绝写入字段值，冲突写入 conflicts 数组，返回错误 |
| 锁定不存在的字段 ID | 拒绝，报字段不存在 |
| 修改已锁定字段的值 | 成功，changelog 记录旧值 → 新值 |

### 13.3 回滚

| 场景 | 预期 |
|------|------|
| 回滚最后一轮（首次锁定） | 字段恢复 open，changelog 追加回滚记录 |
| 回滚最后一轮（修改已锁定字段） | 字段恢复旧值，保持 locked |
| 连续回滚两次 | 第一次回滚最后一轮，第二次回滚倒数第二轮 |
| 无 changelog 记录时回滚 | 拒绝，报无可回滚记录 |
| D.5 失败回退 C 后 lock 了一个字段再 rollback | `fields_changed_since_last_d5` 重算为 false（D.5 之后无有效变更），`should_trigger_d5` 不误触发 |
| D.5 失败回退 C 后 lock 了两个字段再 rollback 最后一个 | `fields_changed_since_last_d5` 仍为 true（第一个 lock 仍有效） |

### 13.4 写入与重建

| 场景 | 预期 |
|------|------|
| 正常 lock 后 | JSON 和 Markdown 均已更新 |
| 手动删除 Markdown 后调用 `ledger-render.mjs markdown` | Markdown 从 JSON 重建，内容一致 |
| JSON 与 Markdown 内容不一致时 | 以 JSON 为准，Markdown 可被覆盖重建 |

### 13.5 save-brd

| 场景 | 预期 |
|------|------|
| 当前 phase = F，BRD 结构正确 | 成功，BRD 文件落盘，phase → DONE |
| 当前 phase = C，执行 save-brd | 拒绝，报 phase 守卫错误 |
| 当前 phase = E.5，执行 save-brd | 拒绝 |
| 当前 phase = F，chapter_plan 为空（finalize 后又 lock 了字段） | 拒绝，提示需重新运行 chapters finalize |
| 当前 phase = F，BRD 缺少 required 章节 | 拒绝，报结构校验失败（列出缺失章节） |
| 当前 phase = F，BRD 包含 skip 章节 | 拒绝，报结构校验失败（列出多余章节） |
| 当前 phase = F，附录引用了 `§5` 但终稿无第 5 章 | 拒绝，报引用校验失败 |
| 当前 phase = F，BRD 头部与台账不一致 | 拒绝，报头部校验失败 |
| BRD 文件写入失败（权限/路径） | 台账 phase 不变（仍为 F），报错 |
| BRD 已成功写入但台账未推到 DONE（pending_brd_filename 非空，文件存在） | 重试时检测到文件已存在，直接更新台账 → DONE，不重复写入 |
| BRD 写入也失败（pending_brd_filename 非空，文件不存在） | 重试时用同一文件名重新写入，不生成新时间戳 |
| 隔数分钟后重试 | 使用 pending_brd_filename 中记录的文件名，不受时间戳变化影响 |

### 13.6 Schema 迁移

| 场景 | 预期 |
|------|------|
| 读取 schema_version 1.0.0 的 JSON（当前版本） | 正常读取 |
| 读取 schema_version 0.9.0 的 JSON（旧版本） | 报错，提示不兼容 |
| 读取 schema_version 2.0.0 的 JSON（未来版本） | 报错，提示需要升级脚本 |

### 13.7 D.5 触发判定

| 场景 | 预期 |
|------|------|
| 首次 100% locked，从未触发 D.5 | `should_trigger_d5 = true` |
| D.5 通过后进入 E，progress 查询 | `should_trigger_d5 = false` |
| D.5 失败回退 C，未发生字段变更，重新查 progress | `should_trigger_d5 = false` |
| D.5 失败回退 C，发生字段变更后重新 100% | `should_trigger_d5 = true` |
| D.5 通过 → E.5 → C 修改字段 → 重新 100% | `should_trigger_d5 = false`（前提已通过，直接进 E） |
| DONE → C 改稿 → 字段变更 → 重新 100% | `should_trigger_d5 = false`（前提在上轮已通过，直接进 E） |
| lock 成功后 `fields_changed_since_last_d5` | 变为 `true` |
| set-phase 进入 D.5 后 `fields_changed_since_last_d5` | 重置为 `false` |

### 13.8 对齐检查

| 场景 | 预期 |
|------|------|
| references 与 registry 一致 | 输出"aligned" |
| p0-fields.md 新增了一个字段但 registry 没同步 | 输出 diff：缺失字段 |
| brd-template.md 裁剪矩阵改了一个章节规则 | 输出 diff：规则不一致 |
| brd-template.md 附录新增了一个下游 skill 行 | 输出 diff：附录映射缺失 |
| brd-template.md 附录某行的依赖字段改了 | 输出 diff：附录依赖不一致 |
