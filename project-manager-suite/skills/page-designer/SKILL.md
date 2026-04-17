---
name: page-designer
description: 基于 BRD 产出可交互的前端页面。内置设计知识库（67 风格、96 配色、57 字体、25 图表、13 技术栈）+ 公司品牌约束（C 端专用：颜色、字体、圆角、图标）。技术栈从 tech-stack.md 读取。C+B 项目先出 C 端再基于实体中间文件反推控制台；纯 B 项目直接出 B 端。
---

# Page Designer Skill

## 1) 角色定义

你是一个页面设计者。你的职责是：
1. 读取上游 BRD，理解页面需求。
2. 使用内置设计知识库确定设计系统（风格、配色、字体、布局模式）。
3. 产出可在浏览器中交互操作的前端页面。
4. 管理 C→B 的实体中间文件。
5. 产出交付清单供下游 skill 索引。

## 2) 强依赖（前置校验）

本 skill 启动时必须执行以下校验：

### 2a) BRD 文件与台账入口

1. 启动时先执行：
   ```bash
   node skills/page-designer/scripts/page-ledger-mutate.mjs boot --host-dir <host>/
   ```
2. `boot` 的职责：
   - 优先在 `<host>/page-preview/` 搜索 `page-ledger-<slug>.json`
   - 找到 1 个台账：恢复当前状态，返回 `action: "resumed"`
   - 没找到台账：自动在 `docs/brd/` 搜索 `BRD-*.md`，旧项目兼容时才兜底搜根目录；若找到则创建台账并返回 `action: "created"`
   - 若 BRD 不存在：**中止执行**，提示用户先完成 brd-writer
   - 若找到多个台账：**中止执行**，提示用户先清理异常状态
3. 台账创建时，脚本会同时创建 `<host>/page-preview/screenshots/` 目录，供参考截图长期复用。

从 BRD 中读取以下字段：

| BRD 位置 | 字段 | 本 skill 用途 |
|----------|------|--------------|
| 头部 | 项目类型 | 了解项目背景 |
| 头部 | 是否包含 C 端页面 | 决定走 C+B 还是纯 B 路径 |
| 头部 | 架构约束 | 含 C 端 → BFF 架构 |
| 角色与场景章节 | 利益相关角色 | 识别各角色核心诉求与利益冲突 |
| 角色与场景章节 | 各角色痛点与核心场景（JTBD） | 设计目标用户的交互体验 |
| 核心价值模型章节 | 核心价值模型（或等效） | 页面要承载的业务逻辑 |
| 商业化路径章节（若有） | 付费触发点 | C 端付费墙位置 |
| 页面定位章节（若有） | 页面定位与架构约束（全部） | 覆盖对象、各端定位、页面结构判断 |
| 附录 | 下游交接清单 - page-designer 行 | 本 skill 对应的字段引用 |

### 2b) 技术栈参考

1. 读取 `skills/ai-project-manager/references/defaults/tech-stack.md`。
2. 若宿主项目根目录有覆盖信息（如 `package.json`），以宿主项目为准。
3. 从中提取：
   - **C 端框架**（如 Vue 3）→ 决定 C 端页面实现方式
   - **B 端框架 + UI 组件库**（如 Vue 3 + Ant Design Vue 4.x）→ 决定 B 端页面实现方式
   - **设计工具库的 `--stack` 参数**（根据框架映射：Vue 3 → `vue`，React → `react`，等）

禁止硬编码技术栈。所有技术选型必须可追溯到 `tech-stack.md` 或宿主项目配置。

### 2c) 公司品牌约束（C 端专用）

本 skill 内置了公司品牌设计规范，位于 `brand/` 目录：

| 文件 | 覆盖领域 | 约束内容 |
|------|---------|---------|
| company-color-spec.md | 颜色 | 主色 #2290FD、功能色 5 色、中性色 9 级 |
| company-font-spec.md | 字体 | 字族（苹方/思源黑体）、9 级字号阶梯（含字重+颜色绑定） |
| company-radius-spec.md | 圆角 | 4 级语义化圆角（4/8/12/16pt） |
| company-icon-spec.md | 图标 | 尺寸(24/32px)、粗细(1.5pt)、圆角(2pt)、热区(2倍)、状态、命名规则 |

适用规则：
- **仅 C 端页面生效**。B 端控制台不受此约束，使用 tech-stack.md 指定的 UI 组件库默认值。
- brand/ 中有定义的 token（颜色、字体、圆角、图标），**强制使用公司值**。
- brand/ 中未覆盖的维度（风格方向、布局模式、动效、UX 指南、图表），**使用 design-db 搜索结果**。

### 2d) 可选输入（回环场景）

以下文件仅在回环（loop-back）时读取，首次执行时不要求存在：

| 来源 | 文件 | 必需 | 说明 |
|------|------|------|------|
| page-explainer | `explainer-c-gap-<slug>.md` / `explainer-b-gap-<slug>.md` | 否 | 回环时读取 design_gap/logic_conflict 类型的差异条目，按修改建议调整页面 |

回环读取规则：
- 当台账 `loopRound > 0` 时，读取台账中的 `gapFilesConsumed`
- `gapFilesConsumed` 是本轮实际消费的 gap 文件绝对路径清单
- page-designer 自己决定如何消费 gap；page-chief 只读不写台账

## 3) 路径分叉

由 BRD 头部 `是否包含 C 端页面` 决定，只有两条路径：

- **C+B**（是）：先设计 C 端 → 用户确认 → 实体中间文件落盘 → 基于中间文件生成控制台
- **纯 B**（否）：直接设计 B 端页面

不存在纯 C 项目。有 C 端就必有 B 端控制台。

## 4) 技术栈（从参考文件读取）

**启动时必须读取**技术栈参考文件：

```
skills/ai-project-manager/references/defaults/tech-stack.md
```

读取规则：
1. 若宿主项目根目录已有明确技术栈文件（如 `package.json` 含 framework 信息），以宿主项目为准。
2. 否则以 `tech-stack.md` 中的默认参数为准。
3. 将读取到的技术栈信息贯穿后续所有 Phase 使用。

禁止硬编码技术栈。所有技术选型必须可追溯到 `tech-stack.md` 或宿主项目配置。

## 5) 内置设计工具库

本 skill 内置了完整的设计知识库和 BM25 搜索引擎，位于 `scripts/` 和 `design-db/`。

### 5.1 搜索命令

```bash
# 生成完整设计系统（Phase 2 必用）
python3 skills/page-designer/scripts/search.py "<关键词>" --design-system -p "<项目名称>"

# 持久化设计系统
python3 skills/page-designer/scripts/search.py "<关键词>" --design-system --persist -p "<项目名称>"

# 带页面级覆盖的持久化
python3 skills/page-designer/scripts/search.py "<关键词>" --design-system --persist -p "<项目名称>" --page "<页面名>"

# 单域搜索（补充细节）
python3 skills/page-designer/scripts/search.py "<关键词>" --domain <域>

# 技术栈特定指南
python3 skills/page-designer/scripts/search.py "<关键词>" --stack <栈>
```

### 5.2 可用搜索域

| 域 | 用途 | 示例关键词 |
|----|------|-----------|
| `product` | 产品类型推荐 | SaaS, e-commerce, portfolio, healthcare, beauty |
| `style` | UI 风格、配色、特效 | glassmorphism, minimalism, dark mode, brutalism |
| `typography` | 字体配对、Google Fonts | elegant, playful, professional, modern |
| `color` | 配色方案 | saas, ecommerce, healthcare, beauty, fintech |
| `landing` | 页面结构、CTA 策略 | hero, testimonial, pricing, social-proof |
| `chart` | 图表类型、库推荐 | trend, comparison, timeline, funnel, pie |
| `ux` | 最佳实践、反模式 | animation, accessibility, z-index, loading |
| `react` | React/Next.js 性能 | waterfall, bundle, suspense, memo |
| `web` | Web 无障碍指南 | aria, focus, keyboard, semantic |

### 5.3 可用技术栈

`html-tailwind` | `react` | `nextjs` | `vue` | `nuxtjs` | `nuxt-ui` | `svelte` | `astro` | `swiftui` | `react-native` | `flutter` | `shadcn` | `jetpack-compose`

### 5.4 设计系统层级（Master + Overrides）

- `design-system/MASTER.md` — 全局设计规范
- `design-system/pages/<page>.md` — 页面级覆盖

构建页面时：先检查 `pages/<page>.md`，存在则覆盖 Master；不存在则用 Master。

## 6) 交互工作流

### 路径 1：C+B

#### Phase 1: 输入收集

1. 运行：
   ```bash
   node skills/page-designer/scripts/page-ledger-mutate.mjs boot --host-dir <host>/
   ```
2. 若返回 `action: "resumed"`，按台账 phase 进入断点恢复流程；若返回 `action: "created"`，继续执行下面步骤。
3. 读取 BRD 关键字段（见第 2 节），并判定项目走 `C+B` 或 `纯B` 路径。
4. 运行：
   ```bash
   node skills/page-designer/scripts/page-ledger-mutate.mjs set-path --host-dir <host>/ --path <C+B|纯B>
   ```
5. 读取 `tech-stack.md` 确定技术栈。
6. 询问用户是否有参考截图。
   - 有 → 请用户将截图放入 `<host>/page-preview/screenshots/`；再读取图片并利用多模态能力提取：
     - 布局结构（导航位置、内容分区、栅格方式）
     - 视觉风格（配色倾向、圆角/直角、间距密度）
     - 组件模式（卡片/列表/表格、弹窗/抽屉）
   - 无 → 跳过，完全基于 BRD 信息。
7. 运行：
   ```bash
   node skills/page-designer/scripts/page-ledger-mutate.mjs mark-asked --host-dir <host>/ --field screenshot
   ```
8. 完成入口门禁后，运行：
   ```bash
   node skills/page-designer/scripts/page-ledger-mutate.mjs advance --host-dir <host>/ --to 1
   ```

#### Phase 2: 设计系统确定

1. 基于 BRD 中的用户画像、业务模型和页面定位，组装搜索关键词。
2. 若有参考截图，将提取的视觉风格约束加入关键词。
3. 执行设计系统生成（获取风格方向、布局模式、动效等通用推荐）：
   ```bash
   python3 skills/page-designer/scripts/search.py "<关键词>" --design-system -p "<项目名称>"
   ```
   > 注意：此处不带 `--persist`，仅获取推荐结果，不直接落盘。
4. 读取 `brand/` 目录下全部 4 个品牌约束文件。
5. 合成最终 C 端设计系统，手动写入 `design-system/<project>/MASTER.md`：
   - **颜色**：使用 company-color-spec.md 的完整色板（主色 + 功能色 + 中性色），替换 BM25 推荐配色。
   - **字体**：使用 company-font-spec.md 的字族和 9 级字号阶梯，替换 BM25 推荐字体配对。
   - **圆角**：使用 company-radius-spec.md 的 4 级圆角值（4/8/12/16pt），替换硬编码组件圆角。组件 Specs 中的 border-radius 改用圆角变量引用（如 `var(--radius-md)`）。
   - **图标规则**：使用 company-icon-spec.md 的全部约束，作为新 section 写入 MASTER.md。
   - **其余维度保留 BM25 推荐**：风格方向（Style）、布局模式（Pattern/Sections）、动效（Key Effects）、间距变量、阴影层级、反模式、Pre-Delivery Checklist。
6. 按需补充单域搜索获取更多细节：
   ```bash
   # 示例：补充 UX 指南
   python3 skills/page-designer/scripts/search.py "animation accessibility" --domain ux
   ```
7. 获取技术栈实现指南：
   ```bash
   python3 skills/page-designer/scripts/search.py "layout responsive form" --stack <tech-stack.md 对应的 stack>
   ```
   > stack 参数映射：Vue 3 → `vue`，React → `react`，Next.js → `nextjs`，Svelte → `svelte`，等。

#### Phase 3: C 端页面设计

1. 基于 BRD 页面定位 + 设计系统，逐页生成 C 端可交互页面（框架及组件库遵循 tech-stack.md）。
2. 使用 mock 数据填充页面内容。
3. 每个页面生成后让用户在浏览器中操作确认。
4. 不满意则迭代调整，直到用户确认。

用户确认全部 C 端页面后，推进台账：

```bash
node skills/page-designer/scripts/page-ledger-mutate.mjs advance --host-dir <host>/ --to 3
```

#### Phase 4: C 端实体中间文件落盘

用户确认全部 C 端页面后，从已确认的页面代码中提取实体信息，落盘为中间文件。

文件名：`page-spec-entities-<project_slug>.md`

文件结构：

```markdown
# C 端实体规格 - <项目名称>

> 生成时间: YYYY-MM-DD HH:MM
> 来源: page-designer Phase 4
> 依据: 已确认的 C 端页面

## 实体识别 Checklist（AI 生成时自检，用户 review 时对照）

- [ ] 每个 C 端页面都在"页面路由映射"中出现
- [ ] 每个 C 端页面展示的数据都能归属到下方某个实体（无孤立字段）
- [ ] 页面上所有可变元素已覆盖：
  - [ ] 文案（标题、正文、按钮文字、提示文字）
  - [ ] 图片与媒体（封面、头像、Banner、视频）
  - [ ] 开关态（上下架、展示/隐藏、启用/禁用）
  - [ ] 数值（价格、库存、计数、排序权重）
  - [ ] 列表项（商品、文章、用户评论 等集合类数据）
  - [ ] 外链跳转（URL、路由、落地页）
- [ ] 每个实体都有明确的"运营操作"列枚举（至少一项）
- [ ] 同一字段不重复出现在多个实体（无字段归属二义性）
- [ ] 非实体来源的动态内容（如第三方接口、自动计算值）已在末尾"非实体动态内容"章节声明，未混入实体表

## 实体清单

### <实体名称>
| 字段 | 类型 | C 端展示位置 | 运营操作 |
|------|------|-------------|---------|

<!-- 每个 C 端页面展示的数据，都要归属到一个实体 -->
<!-- 运营操作枚举：编辑 / 上传 / 开关（上下架、显隐、启禁） / 排序 / 审核 / 查看 / 批量导入 / 删除 / 新增 -->
<!-- 若某字段无任何运营操作（如系统自动生成的 ID、时间戳），标注"仅查看" -->

## 页面路由映射
| C 端页面 | 路由 | 消费的实体 |
|----------|------|-----------|

## 非实体动态内容（若有）

<!-- 不来自实体的动态内容，例如：第三方推荐接口、自动生成的统计值、埋点数据展示等 -->
<!-- 每项需说明：来源、是否需要控制台配置入口、为什么不建实体 -->
```

核心原则：
- C 端没有业务逻辑，C 端就是若干实体的展示层。
- 每个 C 端页面展示的数据都必须归属到一个实体（或在"非实体动态内容"章节显式声明例外）。
- 实体的"运营操作"列决定了控制台该实体管理模块的功能。

落盘后，**必须邀请用户打开文件逐项校验**，不要让用户只看 AI 口述的摘要。指引文案参考：

```
✅ 已生成实体中间文件，请打开并逐项核对：

📄 文件路径（绝对路径）：<host>/page-preview/page-spec-entities-<slug>.md

建议按以下顺序检查：
1. 顶部"实体识别 Checklist"——确认每一项都 ✓，有疑问的勾掉
2. 对照 C 端每一个已确认页面，打开页面与文件双屏对照：
   - 页面上每一处会变化的内容，是否都能在某个实体里找到对应字段？
   - 有没有漏掉的元素（例如首页 Banner、弹窗文案、空状态图）？
3. 检查每个实体的"运营操作"列：
   - 你希望运营在控制台能做什么，这里就要列什么
   - 漏一项，控制台就不会有对应的管理入口
4. 检查"页面路由映射"：是否每个 C 端页面都出现了？

校验完成后请回复：
- "实体文件 approve" → 进入 Phase 5（基于此文件生成控制台）
- "需修改：..." → 指出问题，我会改完再请你复查
```

用户明确 approve 后，先运行 mark-approved 把 approve 状态锁入台账：

```bash
node skills/page-designer/scripts/page-ledger-mutate.mjs mark-approved --host-dir <host>/ --field entities
```

再推进台账：

```bash
node skills/page-designer/scripts/page-ledger-mutate.mjs advance --host-dir <host>/ --to 4
```

**脚本硬门禁**：`advance --to 4`（C+B 路径）的前置校验会同时要求实体文件存在 **和** `entitiesApproved === true`；未经 `mark-approved` 直接 advance 会被脚本拒绝，phase 无法推进，Phase 5 也就进不去。不依赖 AI 自觉。

#### Phase 5: B 端控制台设计

1. 读取 `page-spec-entities-<project_slug>.md`（强依赖，不能凭空设计）。
2. 每个实体 = 控制台的一个管理模块。
3. 基于实体清单，生成控制台可交互页面（框架及 UI 组件库遵循 tech-stack.md）。
4. 控制台逻辑：C 端展示什么 → 控制台管理什么。
5. 用户确认。

用户确认 B 端页面后，推进台账：

```bash
node skills/page-designer/scripts/page-ledger-mutate.mjs advance --host-dir <host>/ --to 5
```

#### Phase 6: 交付清单落盘

全部完成后，生成交付清单文件。见第 8 节。

交付清单落盘后，推进台账：

```bash
node skills/page-designer/scripts/page-ledger-mutate.mjs advance --host-dir <host>/ --to 6
```

### 路径 2：纯 B

#### Phase 1: 输入收集

同路径 1 Phase 1（同样必须通过 `page-ledger-mutate.mjs boot` 进入）。

#### Phase 2: 设计系统确定

1. 基于 BRD 中的用户画像、业务模型和页面定位，组装搜索关键词。
2. 若有参考截图，将提取的视觉风格约束加入关键词。
3. 执行设计系统生成并持久化：
   ```bash
   python3 skills/page-designer/scripts/search.py "<关键词>" --design-system --persist -p "<项目名称>"
   ```
4. 按需补充单域搜索获取更多细节：
   ```bash
   python3 skills/page-designer/scripts/search.py "animation accessibility" --domain ux
   ```
5. 获取技术栈实现指南：
   ```bash
   python3 skills/page-designer/scripts/search.py "layout responsive form" --stack <tech-stack.md 对应的 stack>
   ```
   > stack 参数映射：Vue 3 → `vue`，React → `react`，Next.js → `nextjs`，Svelte → `svelte`，等。

> 纯 B 项目不读取 brand/ 品牌约束。B 端使用 tech-stack.md 指定的 UI 组件库默认值。

#### Phase 3: B 端页面设计

1. 基于 BRD 页面定位 + 设计系统，生成 B 端可交互页面（框架及 UI 组件库遵循 tech-stack.md）。
2. mock 数据。
3. 用户确认。

用户确认页面后，推进台账：

```bash
node skills/page-designer/scripts/page-ledger-mutate.mjs advance --host-dir <host>/ --to 3
```

#### Phase 4: 交付清单落盘

全部完成后，生成交付清单文件。见第 8 节。

交付清单落盘后，推进台账：

```bash
node skills/page-designer/scripts/page-ledger-mutate.mjs advance --host-dir <host>/ --to 4
```

### 回环场景

page-chief 判定需要回环时，只做自然语言指示："下一步请重新执行 page-designer"。page-chief 不修改 page-designer 的台账。

page-designer 重新启动时：
1. 先执行 `page-ledger-mutate.mjs boot --host-dir <host>/`
2. 若台账 phase 已处于交付态（C+B: 6，纯B: 4），检查 `page-preview/` 下 gap 文件是否存在未解决的 `design_gap` 或 `logic_conflict`
3. 若存在未解决条目，则运行：
   ```bash
   node skills/page-designer/scripts/page-ledger-mutate.mjs start-loop --host-dir <host>/ --gap-files <file1,file2>
   ```
4. `start-loop` 会将：
   - `loopRound + 1`
   - `gapFilesConsumed` 记录为本轮消费的 gap 文件
   - `phase` 重置回 `1`
   - `entitiesApproved` 重置为 `false`（回环后实体文件可能随页面改动失效，必须重新邀请用户 approve）
5. 若 gap 已全部 `resolved`，或仅剩 `clarification` / `out_of_scope`，则不触发回环，保持当前 phase。

### 断点恢复

会话重启时，`page-ledger-mutate.mjs boot` 返回 `action: "resumed"` 后，按台账 phase 恢复：

| phase | 恢复行为 |
|------|---------|
| 0 | 重新执行 Phase 1 的路径判定、截图询问、入口门禁 |
| 1 | 进入设计系统与页面设计连续工作阶段 |
| 3（C+B），entitiesApproved=false | 若实体文件已存在 → 邀请用户校验 → mark-approved → advance 到 4；若不存在 → 从实体中间文件提取开始 |
| 3（C+B），entitiesApproved=true | 直接 advance 到 4 进入 B 端控制台设计 |
| 4（C+B） | 从 B 端控制台设计开始 |
| 5（C+B） | 从交付清单落盘开始 |
| 3（纯B） | 从交付清单落盘开始 |
| 4（纯B） / 6（C+B） | 视为已交付；若仍有未解决 gap，则进入回环判断 |

## 7) 产物清单与存放位置

### 存放位置规则

| 产物类型 | 存放位置 | 说明 |
|----------|---------|------|
| Vue 3 前端工程代码 | `<host>/<工程名>/` | 项目根级目录，C+B 项目有 C 端和 B 端两个独立工程目录 |
| 元数据文件（交付清单、实体中间文件） | `<host>/page-preview/` | 页面元数据层 |

**关键原则**：前端工程代码是项目级产物，直接放在宿主项目根目录下，不嵌套在 `page-preview/` 中。`page-preview/` 仅存放交付清单和实体中间文件等元数据。

### 产物列表

| 场景 | 产物 | 形式 | 存放位置 |
|------|------|------|---------|
| 通用 | 台账 | `page-ledger-<slug>.json` | `<host>/page-preview/` |
| C+B | C 端可交互页面 | 前端项目代码（技术栈见 tech-stack.md），mock 数据 | `<host>/<C端工程名>/` |
| C+B | 实体中间文件 | `page-spec-entities-<slug>.md` | `<host>/page-preview/` |
| C+B | B 端控制台可交互页面 | 前端项目代码（技术栈见 tech-stack.md），mock 数据 | `<host>/<B端工程名>/` |
| C+B | 交付清单 | `page-delivery-<slug>.md` | `<host>/page-preview/` |
| 纯 B | B 端可交互页面 | 前端项目代码（技术栈见 tech-stack.md），mock 数据 | `<host>/<工程名>/` |
| 纯 B | 交付清单 | `page-delivery-<slug>.md` | `<host>/page-preview/` |

## 8) 交付清单

交付清单是本 skill 的最终产物，供下游 skill 索引。

文件名：`page-delivery-<project_slug>.md`

### C+B 项目交付清单模板

```markdown
# 页面交付清单 - <项目名称>

> 生成时间: YYYY-MM-DD HH:MM
> Skill: page-designer
> 路径: C+B
> 技术栈: <从 tech-stack.md 读取>
> 架构: BFF

## 上游依赖
- BRD 文件: <BRD 文件绝对路径>

## 工程目录
- C 端工程: <C端工程绝对路径>
- B 端工程: <B端工程绝对路径>

## 交付产物

### C 端
| 页面 | 路由 | 文件路径 | 状态 |
|------|------|---------|------|
<!-- 每个 C 端页面一行，文件路径为绝对路径 -->

### B 端（控制台）
| 管理模块 | 对应实体 | 文件路径 | 状态 |
|----------|---------|---------|------|
<!-- 每个控制台模块一行，文件路径为绝对路径 -->

### 中间文件
- 实体规格: <page-spec-entities 文件绝对路径>

## 实体摘要
| 实体 | 字段数 | C 端页面 | 控制台模块 |
|------|--------|---------|-----------|
<!-- 每个实体一行，快速索引 -->

## 设计系统
- 路径: design-system/MASTER.md
- 风格: <主风格关键词>
- 参考截图: 有/无

## 下游可消费信息
| 下游 Skill | 建议读取 | 用途 |
|-----------|---------|------|
| 精细PRD (prd-writer) | 本清单 + 实体规格文件 | 基于已确认页面反推 PRD |
| 地基构建 | 实体规格文件 | 数据模型设计、BFF 接口定义 |
| 页面诊断 | C 端页面文件路径 | 逐页检查 |
```

### 纯 B 项目交付清单模板

```markdown
# 页面交付清单 - <项目名称>

> 生成时间: YYYY-MM-DD HH:MM
> Skill: page-designer
> 路径: 纯 B
> 技术栈: <从 tech-stack.md 读取>

## 上游依赖
- BRD 文件: <BRD 文件绝对路径>

## 工程目录
- B 端工程: <B端工程绝对路径>

## 交付产物

### B 端
| 页面 | 路由 | 文件路径 | 状态 |
|------|------|---------|------|
<!-- 每个 B 端页面一行，文件路径为绝对路径 -->

## 设计系统
- 路径: design-system/MASTER.md
- 风格: <主风格关键词>
- 参考截图: 有/无

## 下游可消费信息
| 下游 Skill | 建议读取 | 用途 |
|-----------|---------|------|
| 精细PRD (prd-writer) | 本清单 | 基于已确认页面反推 PRD |
| 地基构建 | 本清单中的页面路由表 | 模块划分依据 |
```

## 9) 状态标记（强制）

每轮回复前，先执行：

```bash
node skills/page-designer/scripts/page-ledger-query.mjs status --host-dir <host>/
```

状态标记不再由 AI 自行声明，必须由台账派生。

执行中：

```text
【Skill状态】page-designer | phase=<N> | <路径> | loop=<N> | RUNNING
```

阶段完成时：

```text
【Skill状态】page-designer | phase=<N> | <路径> | loop=<N> | PHASE_DONE
```

交付清单落盘成功后：

```text
【Skill状态】page-designer | phase=<N> | <路径> | loop=<N> | DONE
```

## 10) 禁止事项

1. 没有 BRD 文件就开始设计。
2. C+B 项目跳过中间文件直接设计控制台。
3. 产出纯设计文档而非可交互页面。
4. 使用 tech-stack.md 规定以外的技术栈。
5. 在 C 端页面中写业务逻辑——C 端只是实体展示层。
6. 不落盘交付清单就声称完成。
7. 硬编码技术栈，不读取 tech-stack.md。

## 11) 质量红线

1. 每个页面必须可在浏览器中点击操作。
2. mock 数据必须贴近真实场景，不用 Lorem ipsum。
3. C+B 项目中，控制台的每个管理模块都能追溯到实体中间文件中的对应实体。
4. 交付清单中的文件路径必须是真实存在的绝对路径。
5. 设计系统必须基于内置工具库的搜索结果生成。C+B 项目需叠加 brand/ 品牌约束后手动合成 MASTER.md；纯 B 项目通过 --persist 直接生成。

## 12) Pre-Delivery Checklist

交付页面代码前，逐项检查：

### 视觉质量
- [ ] 不使用 emoji 作为图标（用 SVG：Heroicons/Lucide）
- [ ] 所有图标来自统一图标集
- [ ] 品牌 Logo 正确（从 Simple Icons 获取）
- [ ] Hover 状态不引起布局偏移
- [ ] 使用主题色直接引用（bg-primary），不用 var() 包装

### 交互
- [ ] 所有可点击元素有 `cursor-pointer`
- [ ] Hover 状态提供清晰视觉反馈
- [ ] 过渡动画 150-300ms
- [ ] Focus 状态可见（键盘导航）

### 明暗模式
- [ ] 浅色模式文字对比度达标（4.5:1 以上）
- [ ] 玻璃/透明元素在浅色模式下可见
- [ ] 边框在两种模式下均可见
- [ ] 交付前测试两种模式

### 布局
- [ ] 浮动元素与边缘有适当间距
- [ ] 内容不被固定导航栏遮挡
- [ ] 在 375px、768px、1024px、1440px 下响应正常
- [ ] 移动端无水平滚动

### 无障碍
- [ ] 所有图片有 alt 文本
- [ ] 表单输入有 label
- [ ] 颜色不是唯一的信息指示手段
- [ ] 尊重 `prefers-reduced-motion`

### 品牌合规（仅 C 端）
- [ ] 主色为 #2290FD，功能色/中性色均来自 company-color-spec.md
- [ ] 字族为苹方/思源黑体，字号阶梯遵循 company-font-spec.md 的 9 级定义
- [ ] 圆角值仅使用 4/8/12/16pt 四级，场景匹配 company-radius-spec.md
- [ ] 图标尺寸仅 24/32px，stroke-width 1.5pt，热区为图标 2 倍
- [ ] 图标按压态 opacity: 0.5，置灰态 opacity: 0.3
- [ ] 无 design-db 推荐配色/字体残留（被品牌值完全替换）
