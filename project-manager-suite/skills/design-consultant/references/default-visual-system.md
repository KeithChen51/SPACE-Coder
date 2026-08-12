# 部门默认视觉系统

> 面向普通用户的产品先用 `consumer-product-routing.md` 确认主类型；需要获客或转化结构时叠加 `growth-conversion-patterns.md`。两者只改变页面重点、证据和状态要求，颜色、字体、间距与组件仍以本文件和项目 Token 为准。

这是 default 模式的基础规范。它用于内部工具、后台、数据产品、报表和大多数没有品牌必要性的页面。默认方向称为 **Editorial Utility**：借用编辑设计的信息层级、发丝线、反色版面和阅读节奏，但仍以产品任务、重复操作和数据扫描为中心，不把业务界面做成杂志封面。

## 设计性格

- 可信：信息清楚，状态明确。
- 克制：颜色少，装饰少。
- 高效：适合重复操作和数据扫描。
- 可扩展：后续可轻客制化，不会推翻组件结构。
- 编辑型：用标题、元信息、留白、明暗表面和直接标签建立层级，不依赖大量白卡片。

## 产品类型 Overlay

默认视觉系统不是单一页面风格。先按产品类型叠加规则：

| 类型 | 默认策略 |
| --- | --- |
| 内部后台 / 数据工作台 | compact、浅色、边框优先、表格/筛选/分页完整 |
| 客户门户 | standard、轻品牌、清晰导航、完整状态 |
| 宿主插件 | host-native、使用宿主变量、品牌克制 |
| AI/Agent 工具 | process grammar、事件低强调、审批唯一位置 |
| 营销/演示 | 可进入 design-system，但必须有品牌资产和正反例 |

如果命中“宿主插件”或“AI/Agent 工具”，继续读取：

- `references/host-native-ui.md`
- `references/agent-process-ui.md`

## 字体

默认正文和组件使用：

```css
font-family: "Aptos", "Segoe UI", "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif;
```

目录标题、页面标题可使用 `--font-display` 提升编辑层级；代码、路径和 token 使用 `--font-mono`。数字、金额、表格列使用：

```css
font-variant-numeric: tabular-nums;
```

## 字号

| Token | 用途 | 大小 |
|---|---|---:|
| `text-2xs` | 版本、来源、元信息 | 10px |
| `text-xs` | 标签、辅助信息 | 11px |
| `text-sm` | 注释、帮助文字 | 12px |
| `text-table` | 表格、字段、按钮 | 13px |
| `text-body` | 正文、说明 | 14px |
| `text-subtitle` | 组件标题 | 16px |
| `text-section` | 区块标题 | 20px |
| `text-title` | 页面标题 | 28px |
| `text-display` | 仅用于 Catalog 或展示型总览 | 42px |

## 间距

使用 4px 基准：

| Token | 值 |
|---|---:|
| `space-1` | 4px |
| `space-2` | 8px |
| `space-3` | 12px |
| `space-4` | 16px |
| `space-6` | 24px |
| `space-8` | 32px |
| `space-12` | 48px |
| `space-16` | 64px |

默认页面密度：

- 后台/表格：compact，主间距 12-16px。
- 普通业务页：standard，主间距 16-24px。
- 对外展示页：spacious，主间距 24-48px。
- 宿主插件：跟随宿主密度，除非宿主没有对应模式。
- Agent 过程界面：正文保持可读，事件行和工具调用保持紧凑。

## 颜色

默认色卡命名为 **Harbor Blue**：以冷灰蓝画布、白色内容面和海军蓝文字建立熟悉的企业产品层级，以可承载反色文字的海港蓝承担主操作，以青色提供主要对照，并用紫、琥珀和洋红扩展数据分类。默认导航使用浅色表面；海军蓝反色面保留给暗卡、沉浸式工具和可选 `inverse` 导航。

通用基线同时提供 **Coral Office** 作为低成本可选色卡。它只替换同名语义 token，不建立第二套组件选择器：`primary` 使用珊瑚红 `#C24135`，`secondary` 使用低饱和鼠尾草绿 `#4F6F58`，`info / accent-plum` 使用灰紫 `#74506B`，背景与文字使用偏暖的中性灰。Coral 色卡不混入通用蓝色；成功、警告、危险仍保留各自的通用语义。默认仍是 Harbor Blue；只有用户明确选择 Coral，或品牌必要性判断支持时才切换。

两套色卡都支持 `light / dark`。明暗模式不是简单反相，而是分别定义表面、文字、边界、状态软背景、焦点环和图表暗卡重点色。完整值与选择器只以 `templates/tokens.json` 的 `themes` 为事实源，`tokens.css` 由编译器生成；`sync-tokens.mjs check` 会逐主题检查变量漂移、主题边界和 4.5:1 对比度。

| Token | 值 | 用途 |
|---|---|---|
| `bg` | `#F3F6F9` | 冷灰蓝页面背景 |
| `surface` | `#FFFFFF` | 内容、表单和默认浅色导航 |
| `surface-muted` | `#EDF2F7` | 次级背景、hover 和预览画布 |
| `surface-inverse` | `#0B1F33` | 暗卡与可选反色导航 |
| `surface-inverse-muted` | `#1E2D45` | 反色面 hover 与次级层 |
| `border` | `#D4DEE8` | 默认冷灰蓝发丝线 |
| `border-strong` | `#AAB8C6` | 分组与关键边界 |
| `text` | `#14213D` | 海军蓝主文本 |
| `text-muted` | `#526273` | 次级文本 |
| `text-soft` | `#5C6B7A` | 来源、版本和弱元信息 |
| `primary` | `#0F6CDD` | 可承载反色文字的海港蓝主操作与焦点 |
| `primary-hover` | `#0958D9` | 主操作 hover |
| `primary-soft` | `#E6F4FF` | 当前项、选中项和轻提示背景 |
| `secondary` | `#08777C` | 青色辅助强调与主要对照 |
| `accent-plum` | `#722ED1` | 紫色数据分类色 |
| `accent-ochre` | `#8C5A00` | 琥珀数据分类色 |
| `accent-rose` | `#C41D7F` | 洋红数据分类色 |
| `success` | `#237804` | 成功 |
| `warning` | `#8C5A00` | 警告 |
| `danger` | `#CF1322` | 错误/危险 |
| `info` | `#0958D9` | 信息提示 |

颜色规则：

- 主色只用于关键操作、链接、当前状态。
- 不要把所有图标、标签、标题都染成主色。
- 状态色必须语义一致，不要用红色做普通强调。
- 正文、弱化文字、反相文字、操作色和状态色与其语义背景组合必须达到 4.5:1；运行 `checks/sync-tokens.mjs check` 验证。
- 默认不使用大面积渐变。
- 大面积层级优先使用 `surface / surface-muted / surface-inverse`，不要通过堆叠白卡片制造层级。
- AppFrame 默认使用 `surface` 浅色导航、`border` 分隔线和 `primary-soft` 当前项；`surface-inverse` 导航只用于密集监控、开发者工具或沉浸式场景，不作为通用默认值。

### 数据可视化色卡

图表不直接从页面主色或状态色中临时取色，统一使用以下语义 token：

| Token | 来源 | 用途 |
| --- | --- | --- |
| `viz-series-1` | `primary` | 单系列默认色、第一分类 |
| `viz-series-2` | `secondary` | 第二分类或主要对照 |
| `viz-series-3` | `accent-plum` | 第三分类 |
| `viz-series-4` | `accent-ochre` | 第四分类 |
| `viz-series-5` | `accent-rose` | 第五分类 |
| `viz-accent-strong / viz-accent / viz-accent-mid / viz-accent-soft / viz-accent-subtle` | 当前色卡的同色根梯度 | 浅色表面的数据标记、序列层级与选中强度 |
| `viz-accent-area` | 当前色卡的最浅同源色 | 浅色表面主线下方的平面面积填充 |
| `viz-accent-on-dark-strong / viz-accent-on-dark / viz-accent-on-dark-mid / viz-accent-on-dark-soft / viz-accent-on-dark-subtle` | 为反色表面独立校准的同色根梯度 | 暗色表面的数据标记、序列层级与选中强度 |
| `viz-accent-on-dark-area` | 反色表面的最暗同源色 | 暗色表面主线下方的平面面积填充 |
| `viz-positive` | `success` | 明确的正向业务语义 |
| `viz-negative` | `danger` | 明确的负向业务语义 |
| `viz-reference` | `text-muted` | 基准、对照、未选中数据 |
| `viz-grid` | `border` | 网格、轴线、连接线 |
| `viz-canvas` | `surface` | 图表画布 |

规则：

- 单系列主线和主标记优先使用 `viz-accent`；需要层级时从同色根的 `strong / mid / soft / subtle` 色阶取色，不临时混入灰色或另一种重点色。
- 面积图使用平面的 `viz-accent-area` 或 `viz-accent-on-dark-area`，不用与重点色无关的灰色渐变。
- 网格、轴线、日历骨架、辅助连接和基准线必须保持中性，分别使用 `viz-grid` 与 `viz-reference`；切换色卡不能把整张结构网染成重点色。
- 分类色最多 5 个；超过 5 类时使用 Top-N + Other、分面或改用表格。
- `viz-positive / viz-negative` 只有在业务语义确实是正负时使用，不能把普通类别默认画成红绿。
- 任何交付图表都必须有非颜色区分方式，如直接标签、形状、线型、排序或开放填充。

Lieflat preset 使用同一套 Editorial Utility 语义色，不再维护独立暖灰皮肤，也不把分类五色强行灌入。结构和文字使用中性色，关键数据几何使用当前色卡的重点色：

| Token | 用途 |
| --- | --- |
| `viz-editorial-ink` | 主数据、标题、最重要标记 |
| `viz-editorial-paper` | Gallery 纸面与暗卡反色文字 |
| `viz-editorial-muted` | 次级文字与中间明度 |
| `viz-editorial-faint` | 来源、辅助刻度、弱标记 |
| `viz-editorial-grid` | 发丝线、网格和环境结构 |
| `viz-accent-*` | 浅色卡关键数据标记的单色根色阶与平面面积填充 |
| `viz-accent-on-dark-*` | 暗卡关键数据标记的独立校准色阶与平面面积填充 |
| `viz-grid` | 网格、轴线、日历发丝线和辅助连接，始终保持中性 |
| `viz-reference` | 基准、目标和未选中数据，始终保持中性 |
| `viz-editorial-c-<hex>` | 为保持上游源码谱系而保留的兼容槽 |

`viz-editorial-c-<hex>` 中的 `<hex>` 是上游标识，不代表项目实际色值。`lieflat-theme.js` 会按当前 Harbor/Coral 与 light/dark 模式解析颜色角色：SVG、Chart.js、ECharts 的真实数据几何进入同色根重点色色阶，面积填充使用对应的平面浅色；标题、轴、日历发丝线、网格、辅助连接和注释继续使用中性色。业务页不直接使用兼容槽。

## 圆角

| Token | 值 | 用途 |
|---|---:|---|
| `radius-xs` | 2px | 元信息标签、小控件 |
| `radius-sm` | 4px | 菜单项、紧凑内部控件 |
| `radius-md` | 6px | 输入框、按钮、卡片、表格容器 |
| `radius-lg` | 8px | 弹窗、抽屉、图表暗卡 |
| `radius-full` | 999px | pill、头像 |

不要混用过多圆角风格。默认表单控件、按钮和卡片使用 6px，菜单项内部使用 4px，弹窗和图表暗卡使用 8px。

## 控件尺寸

默认控件尺寸：

| Token | 值 | 用途 |
| --- | ---: | --- |
| `control-height` | 38px | 桌面按钮、输入框、select |
| `touch-target` | 44px | 移动端和触控控件 |
| `icon-button-sm` | 32px | 表格内轻量操作 |
| `icon-button-md` | 38px | 桌面 icon-only 按钮 |

规则：

- Button、Input、Select 共享基础高度和圆角。
- icon-only 按钮必须有可访问名称。
- 移动端关键操作不低于 44px。

## 阴影

默认少用阴影，优先用边框和留白组织层级。

```css
--shadow-soft: 0 1px 2px rgb(32 34 31 / 0.05), 0 8px 22px rgb(32 34 31 / 0.07);
--shadow-overlay: 0 18px 48px rgb(32 34 31 / 0.16);
```

后台页面不要到处使用浮动卡片。只有弹窗、抽屉、浮层、重要卡片需要阴影。

## 动效

- 高频操作：尽量无动画或使用 `duration-fast` 120ms。
- 普通 hover/press：`duration-base` 180ms。
- 弹窗、抽屉和 Catalog reveal：`duration-slow` 360ms。
- 默认 easing：`cubic-bezier(.2, .75, .25, 1)`。
- 强调型 reveal：`cubic-bezier(.16, 1, .3, 1)`。

所有动效必须支持 `prefers-reduced-motion`。

## 数据工作台默认规则

适用于订单、线索、结算、对账、配置等高密度页面：

- 认证后的工作区默认使用全宽，不把长表居中在窄容器里。
- 明细长表桌面端可使用固定视口工作台：页面外层不纵向滚动，表格结果区内部滚动。
- 分页属于结果区底部，不放进表格滚动容器。
- 移动端回到自然页面滚动，表格改为记录卡片或关键字段列表。
- 表头 sticky 时必须处理导航高度、横向滚动和 sticky column 层级。
- 筛选、分页、排序和 tab 如影响工作连续性，应可恢复，优先进入 URL。

## 规范工程化默认规则

进入正式前端设计时，使用 `references/project-visual-system-workflow.md` 在项目内建立 `design-system/`。默认至少包含：

- `design-system/DESIGN.md`：人读的决策文档。
- `design-system/system.config.json`：机器可读入口与接入状态。
- `design-system/tokens/tokens.json`：唯一可编辑的机器可读 Token 源。
- `design-system/tokens/tokens.css`：生成的运行时变量。
- `design-system/tokens/tokens.ts`：生成的类型安全路径与变量声明。
- `design-system/tokens/tokens.schema.json`：生成的 JSON Schema。
- `design-system/components/manifest.json`：组件契约。
- `design-system/catalog/component-preview.html`：人工预览。
- 静态检查：CSS var 未定义、散落颜色、绕过共享组件、非语义点击元素。
