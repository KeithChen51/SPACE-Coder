---
name: page-designer
description: 基于 BRD 产出可交互的前端页面。内置设计知识库（风格、配色、字体、布局模式）+ BM25 搜索引擎。技术栈从 tech-stack.md 读取。单线 4-Phase 流程：输入收集 → 设计系统 → 页面设计 → 交付清单。
---

# Page Designer Skill

## 1) 角色定义

你是一个页面设计者。你的职责是：
1. 读取上游 BRD，理解页面需求。
2. 使用内置设计知识库确定设计系统（风格、配色、字体、布局模式）。
3. 产出可在浏览器中交互操作的前端页面。
4. 产出交付清单供下游 skill 索引。

## 2) 强依赖（前置校验）

本 skill 启动时必须执行以下校验：

### 2a) BRD 文件与台账入口

1. 启动时先执行：
   ```bash
   node skills/page-designer/scripts/page-ledger-mutate.mjs boot --host-dir <host>/
   ```
2. `boot` 的职责：
   - 优先在 `<host>/src/frontend/page-preview/` 搜索 `page-ledger-<slug>.json`
   - 找到 1 个台账：恢复当前状态，返回 `action: "resumed"`
   - 没找到台账：自动在 `docs/brd/` 搜索 `BRD-*.md`，旧项目兼容时才兜底搜根目录；若找到则创建台账并返回 `action: "created"`
   - 若 BRD 不存在：**中止执行**，提示用户先完成 brd-writer
   - 若找到多个台账：**中止执行**，提示用户先清理异常状态
3. 台账创建时，脚本会同时创建 `<host>/src/frontend/page-preview/screenshots/` 目录，供参考截图长期复用。

从 BRD 中读取以下字段：

| BRD 位置 | 字段 | 本 skill 用途 |
|----------|------|--------------|
| 头部 | 项目类型 | 了解项目背景 |
| 角色与场景章节 | 利益相关角色 | 识别各角色核心诉求与利益冲突 |
| 角色与场景章节 | 各角色痛点与核心场景（JTBD） | 设计目标使用者的交互体验 |
| 核心价值模型章节 | 核心价值模型（或等效） | 页面要承载的业务逻辑 |
| 页面定位章节（若有） | 页面定位（项目覆盖对象、各端定位 操作/配置/查看 等） | 覆盖对象、各端定位、页面结构判断 |
| 附录 | 下游交接清单 - page-designer 行 | 本 skill 对应的字段引用 |

### 2b) 技术栈参考

1. 读取 `skills/ai-project-manager/references/defaults/tech-stack.md`。
2. 若宿主项目根目录有覆盖信息（如 `package.json`），以宿主项目为准。
3. 从中提取：
   - **前端框架 + UI 组件库**（如 Vue 3 + Ant Design Vue 4.x）→ 决定页面实现方式
   - **设计工具库的 `--stack` 参数**（根据框架映射：Vue 3 → `vue`，React → `react`，等）

禁止硬编码技术栈。所有技术选型必须可追溯到 `tech-stack.md` 或宿主项目配置。

### 2c) 可选输入（回环场景）

以下文件仅在回环（loop-back）时读取，首次执行时不要求存在：

| 来源 | 文件 | 必需 | 说明 |
|------|------|------|------|
| page-explainer | `explainer-b-gap-<slug>.md` | 否 | 回环时读取 design_gap/logic_conflict 类型的差异条目，按修改建议调整页面 |

回环读取规则：
- 当台账 `loopRound > 0` 时，读取台账中的 `gapFilesConsumed`
- `gapFilesConsumed` 是本轮实际消费的 gap 文件绝对路径清单
- page-designer 自己决定如何消费 gap；page-chief 只读不写台账

## 3) 技术栈（从参考文件读取）

**启动时必须读取**技术栈参考文件：

```
skills/ai-project-manager/references/defaults/tech-stack.md
```

读取规则：
1. 若宿主项目根目录已有明确技术栈文件（如 `package.json` 含 framework 信息），以宿主项目为准。
2. 否则以 `tech-stack.md` 中的默认参数为准。
3. 将读取到的技术栈信息贯穿后续所有 Phase 使用。

禁止硬编码技术栈。所有技术选型必须可追溯到 `tech-stack.md` 或宿主项目配置。

## 4) 内置设计工具库

本 skill 内置了完整的设计知识库和 BM25 搜索引擎，位于 `scripts/` 和 `design-db/`。

### 4.1 搜索命令

```bash
# 生成完整设计系统（Phase 2 必用）
python3 skills/page-designer/scripts/search.py "<关键词>" --design-system -p "<项目名称>"

# 持久化设计系统
python3 skills/page-designer/scripts/search.py "<关键词>" --design-system --persist -p "<项目名称>" --output-dir <宿主项目>

# 带页面级覆盖的持久化
python3 skills/page-designer/scripts/search.py "<关键词>" --design-system --persist -p "<项目名称>" --page "<页面名>" --output-dir <宿主项目>

# 单域搜索（补充细节）
python3 skills/page-designer/scripts/search.py "<关键词>" --domain <域>

# 技术栈特定指南
python3 skills/page-designer/scripts/search.py "<关键词>" --stack <栈>
```

### 4.2 可用搜索域

| 域 | 用途 | 示例关键词 |
|----|------|-----------|
| `product` | 产品类型推荐（业务领域 vertical） | SaaS, productivity tool, analytics dashboard, knowledge base, healthcare |
| `style` | UI 风格、配色、特效 | glassmorphism, minimalism, dark mode, brutalism, bento grid |
| `typography` | 字体配对、Google Fonts | elegant, professional, modern |
| `color` | 配色方案 | saas, dashboard, healthcare, fintech |
| `chart` | 图表类型、库推荐 | trend, comparison, timeline, funnel, pie |
| `ux` | 最佳实践、反模式 | animation, accessibility, z-index, loading |
| `react` | React/Next.js 性能 | waterfall, bundle, suspense, memo |
| `web` | Web 无障碍指南 | aria, focus, keyboard, semantic |
| `icons` | 图标库与图标推荐 | lucide, heroicons, navigation, arrow |
| `landing` | 落地页结构与转化模式 | hero, cta, conversion, pricing, testimonial |

### 4.3 可用技术栈

`html-tailwind` | `react` | `nextjs` | `vue` | `nuxtjs` | `nuxt-ui` | `svelte` | `astro` | `swiftui` | `react-native` | `flutter` | `shadcn` | `jetpack-compose`

### 4.4 设计系统层级（Master + Overrides）

- `<宿主项目>/design-system/<project-slug>/MASTER.md` — 全局设计规范
- `<宿主项目>/design-system/<project-slug>/pages/<page>.md` — 页面级覆盖

构建页面时：先检查 `<宿主项目>/design-system/<project-slug>/pages/<page>.md`，存在则覆盖 Master；不存在则用 Master。

## 5) 交互工作流（单线 4-Phase）

### Phase 1: 输入收集

1. 运行：
   ```bash
   node skills/page-designer/scripts/page-ledger-mutate.mjs boot --host-dir <host>/
   ```
2. 若返回 `action: "resumed"`，按台账 phase 进入断点恢复流程；若返回 `action: "created"`，继续执行下面步骤。
3. 读取 BRD 关键字段（见第 2 节）。
4. 读取 `tech-stack.md` 确定技术栈。
5. 询问用户是否有参考截图。
   - 有 → 请用户将截图放入 `<host>/src/frontend/page-preview/screenshots/`；再读取图片并利用多模态能力提取：
     - 布局结构（导航位置、内容分区、栅格方式）
     - 视觉风格（配色倾向、圆角/直角、间距密度）
     - 组件模式（卡片/列表/表格、弹窗/抽屉）
   - 无 → 跳过，完全基于 BRD 信息。
6. 运行：
   ```bash
   node skills/page-designer/scripts/page-ledger-mutate.mjs mark-asked --host-dir <host>/ --field screenshot
   ```
7. 完成入口门禁后，运行：
   ```bash
   node skills/page-designer/scripts/page-ledger-mutate.mjs advance --host-dir <host>/ --to 1
   ```

### Phase 2: 设计系统确定

1. 基于 BRD 中的使用者画像、业务模型和页面定位，组装搜索关键词。
2. 若有参考截图，将提取的视觉风格约束加入关键词。
3. 执行设计系统生成并持久化：
   ```bash
   python3 skills/page-designer/scripts/search.py "<关键词>" --design-system --persist -p "<项目名称>" --output-dir <宿主项目>
   ```
4. 按需补充单域搜索获取更多细节：
   ```bash
   # 示例：补充 UX 指南
   python3 skills/page-designer/scripts/search.py "animation accessibility" --domain ux
   ```
5. 获取技术栈实现指南：
   ```bash
   python3 skills/page-designer/scripts/search.py "layout responsive form" --stack <tech-stack.md 对应的 stack>
   ```
   > stack 参数映射：Vue 3 → `vue`，React → `react`，Next.js → `nextjs`，Svelte → `svelte`，等。

> 若宿主项目自带品牌/视觉规范（如 `docs/brand/` 或类似目录），AI 应在 Phase 2 提示用户是否需要叠加这些规范到生成的设计系统中。套包本身不预置任何公司品牌约束。

### Phase 3: 页面设计

1. 基于 BRD 页面定位 + 设计系统，逐页生成可交互页面（框架及 UI 组件库遵循 tech-stack.md）。
2. 使用 mock 数据填充页面内容。
3. 每个页面生成后让用户在浏览器中操作确认。
4. 不满意则迭代调整，直到用户确认。

用户确认全部页面后，推进台账：

```bash
node skills/page-designer/scripts/page-ledger-mutate.mjs advance --host-dir <host>/ --to 3
```

### Phase 4: 交付清单落盘

全部完成后，生成交付清单文件。见第 7 节。

交付清单落盘后，推进台账：

```bash
node skills/page-designer/scripts/page-ledger-mutate.mjs advance --host-dir <host>/ --to 4
```

### 回环场景

page-chief 判定需要回环时，只做自然语言指示："下一步请重新执行 page-designer"。page-chief 不修改 page-designer 的台账。

page-designer 重新启动时：
1. 先执行 `page-ledger-mutate.mjs boot --host-dir <host>/`
2. 若台账 phase 已处于交付态（phase 4），检查 `src/frontend/page-preview/` 下 gap 文件是否存在未解决的 `design_gap` 或 `logic_conflict`
3. 若存在未解决条目，则运行：
   ```bash
   node skills/page-designer/scripts/page-ledger-mutate.mjs start-loop --host-dir <host>/ --gap-files <file1,file2>
   ```
4. `start-loop` 会将：
   - `loopRound + 1`
   - `gapFilesConsumed` 记录为本轮消费的 gap 文件
   - `phase` 重置回 `1`
5. 若 gap 已全部 `resolved`，或仅剩 `clarification` / `out_of_scope`，则不触发回环，保持当前 phase。

### 断点恢复

会话重启时，`page-ledger-mutate.mjs boot` 返回 `action: "resumed"` 后，按台账 phase 恢复：

| phase | 恢复行为 |
|------|---------|
| 0 | 重新执行 Phase 1 的截图询问与入口门禁 |
| 1 | 进入设计系统与页面设计连续工作阶段 |
| 3 | 从交付清单落盘开始 |
| 4 | 视为已交付；若仍有未解决 gap，则进入回环判断 |

## 6) 产物清单与存放位置

### 存放位置规则

| 产物类型 | 存放位置 | 说明 |
|----------|---------|------|
| 前端工程代码 | `<host>/<工程名>/` | 项目根级目录 |
| 元数据文件（交付清单） | `<host>/src/frontend/page-preview/` | 页面元数据层 |

**关键原则**：前端工程代码是项目级产物，直接放在宿主项目根目录下，不嵌套在 `page-preview/` 中。`src/frontend/page-preview/` 仅存放交付清单和台账等元数据。

### 产物列表

| 产物 | 形式 | 存放位置 |
|------|------|---------|
| 台账 | `page-ledger-<slug>.json` | `<host>/src/frontend/page-preview/` |
| 可交互页面 | 前端项目代码（技术栈见 tech-stack.md），mock 数据 | `<host>/<工程名>/` |
| 交付清单 | `page-delivery-<slug>.md` | `<host>/src/frontend/page-preview/` |

## 7) 交付清单

交付清单是本 skill 的最终产物，供下游 skill 索引。

文件名：`page-delivery-<project_slug>.md`

### 交付清单模板

```markdown
# 页面交付清单 - <项目名称>

> 生成时间: YYYY-MM-DD HH:MM
> Skill: page-designer
> 技术栈: <从 tech-stack.md 读取>

## 上游依赖
- BRD 文件: <BRD 文件绝对路径>

## 工程目录
- 前端工程: <工程绝对路径>

## 交付产物

| 页面 | 路由 | 文件路径 | 状态 |
|------|------|---------|------|
<!-- 每个页面一行，文件路径为绝对路径 -->

## 设计系统
- 路径: <宿主项目>/design-system/<project-slug>/MASTER.md
- 风格: <主风格关键词>
- 参考截图: 有/无

## 下游可消费信息
| 下游 Skill | 建议读取 | 用途 |
|-----------|---------|------|
| page-explainer | 本清单 + 页面文件路径 | 沉淀交互语义、回环判断 |
| foundation-builder | 本清单中的页面路由表 | 反推数据模型与 API |
| prd-writer | 本清单 | 基于已确认页面反推 PRD |
```

## 8) 状态标记（强制）

每轮回复前，先执行：

```bash
node skills/page-designer/scripts/page-ledger-query.mjs status --host-dir <host>/
```

状态标记由台账派生，而非 AI 自行声明。

执行中：

```text
【Skill状态】page-designer | phase=<N> | loop=<N> | RUNNING
```

阶段完成时：

```text
【Skill状态】page-designer | phase=<N> | loop=<N> | PHASE_DONE
```

交付清单落盘成功后：

```text
【Skill状态】page-designer | phase=<N> | loop=<N> | DONE
```

## 9) 禁止事项

1. 没有 BRD 文件就开始设计。
2. 产出纯设计文档而非可交互页面。
3. 使用 tech-stack.md 规定以外的技术栈。
4. 不落盘交付清单就声称完成。
5. 硬编码技术栈，不读取 tech-stack.md。

## 10) 质量红线

1. 每个页面必须可在浏览器中点击操作。
2. mock 数据必须贴近真实场景，不用 Lorem ipsum。
3. 交付清单中的文件路径必须是真实存在的绝对路径。
4. 设计系统必须基于内置工具库的搜索结果生成，通过 `--persist --output-dir <宿主项目>` 写入 `<宿主项目>/design-system/<project-slug>/MASTER.md`。

## 11) Pre-Delivery Checklist

交付页面代码前，逐项检查：

### 视觉质量
- [ ] 不使用 emoji 作为图标（用 SVG：Heroicons/Lucide）
- [ ] 所有图标来自统一图标集
- [ ] 品牌 Logo 正确（从 Simple Icons 获取，如有）
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
- [ ] 在常用桌面视口（1280px、1440px）下响应正常

### 无障碍
- [ ] 所有图片有 alt 文本
- [ ] 表单输入有 label
- [ ] 颜色不是唯一的信息指示手段
- [ ] 尊重 `prefers-reduced-motion`
