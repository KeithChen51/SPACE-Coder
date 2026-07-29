# 数据可视化模块

本模块用于仪表盘、经营分析、数据报告和需要图表的产品界面。它直接接入已获授权的 Lieflat Charts 真实实现：48 个 preset、3 套 gallery 和 3 个独立交互大图。AI 不再“参考风格重新画”，而是先锁定真实模板，再替换数据、标题、旁注和必要布局。

## 触发条件

出现以下任一信号时读取本文件，并同时读取 `references/visualization-copy-guidelines.md` 与 `templates/visualization-manifest.json`：

- 用户要求图表、仪表盘、经营看板、趋势、排行、构成、分布、漏斗、流向或关系图。
- 数据需要读出形态、差异、变化、异常或关系，而不只是精确查数。
- 需要 hover、固定、重播、滚动入场、力导向拖拽或流向追踪。
- 用户希望浏览现有可视化能力或生成单文件 HTML。

只有精确查数、批量操作或逐行核对时，优先使用数据表，不要为了“有图”而画图。

## 接入方式

上游原件保存在 `vendor/lieflat-charts/`，版本和文件哈希记录在 `vendor/lieflat-charts/UPSTREAM.json`。不要直接修改 vendored 文件。

项目实际使用的是 `scripts/sync-lieflat-module.mjs` 生成的融合派生文件：

- 保留上游 SVG、Canvas、ECharts 几何和数据编码。
- 保留滚动 reveal、点击重播、timer 清理、拖拽、hover 和 pin 行为。
- 保留原始动画节奏和模板谱系。
- 通过 `lieflat-theme.js` 把原始色值编号映射到当前 Harbor/Coral 与 light/dark 主题的共享中性色阶。
- 通过 SVG、Chart.js 与 ECharts 适配器，把真实数据几何映射到当前色卡的同色根 `--viz-accent-*` 色阶，暗卡使用独立校准的 `--viz-accent-on-dark-*` 色阶。
- 面积填充使用平面的 `--viz-accent-area` 或 `--viz-accent-on-dark-area`；网格、轴线、日历发丝线、辅助连接和基准线继续使用 `--viz-grid / --viz-reference` 中性色。
- 字体、页面背景、反色面、圆角和焦点状态使用 `tokens.css`，与通用组件保持一致。
- Gallery 外壳与组件 Catalog 共享 `catalog-foundation.css`。
- 额外加入移动端单列、图表内部横向浏览、嵌入态标题收敛和 reduced-motion 补丁。
- Chart.js 4.5.1 与 ECharts 6.1.0 固定在 `vendor/runtime-libs/`，派生模板只读取本地运行时，不在使用时访问 CDN。

更新上游原件后执行：

```powershell
node .\scripts\sync-lieflat-module.mjs
node .\scripts\sync-lieflat-module.mjs --check
```

固定依赖的版本、许可证和 SHA256 记录在 `vendor/runtime-libs/RUNTIME.json`。同步脚本会把运行时复制到 `templates/visualization-lieflat/runtime/`；校验器会拒绝远程 CDN、版本漂移和哈希不一致。

## 固定工作流

### 1. 先写分析契约

选图前确认：分析问题、一句话结论、数据粒度、维度与指标、单位与分母、时间范围、交付表面和读者检查时间。缺少分母、可比时间范围或真实关系时，不得用视觉形式掩盖证据缺口。

### 2. 先判断表还是图

- 精确查找、逐行核对、多字段比较：Data Table。
- 趋势、比较、构成、分布、关系或流向：进入 preset 选型。
- 少量最新状态且没有形态判断：KPI 或文本摘要。

### 3. 按数据形状审计真实 preset

读取 `templates/visualization-manifest.json` 的 `presets`，按以下顺序：

1. 完整比较 Lupi Editorial（L1-L15）。
2. 完整比较 Lupi Basics（F1-F12）。
3. 至少比较 3 个能诚实承载数据的候选；不足 3 个时列出全部。
4. 只有前两组都不合适，或用户明确要求 dashboard、监控、周报、三秒快读时，才使用 Glance（G1-G18）。
5. 网络、力导向或 100+ 多段路径需要整页交互时，使用 B1-B3。

比较语义契合、单位诚实、标签容纳、阅读速度、叙事张力和同批次是否重复。不要因为某张预览更醒目而选它。

### 4. 锁定模板谱系

每张图必须记录：

- preset id，例如 `L14`、`F2`、`G16`、`B3`。
- system：Lupi Editorial / Lupi Basics / Glance / Interactive。
- source template。
- card title；独立大图记录文件名。

然后从对应 gallery 中提取卡片结构和同名脚本块。保留核心几何、编码方式、比例关系、交互和动画节奏；允许替换数据、标题、副标题、来源、旁注和适配容器所必需的布局。中文 `cardTitle` 用于展示，`sourceCardTitle` 用于定位上游脚本块。

### 5. 组成页面

图数由独立结论数决定，不由字段数决定。同一批次模板不重复、形状轮换、最多一张暗卡。一张图只承担一个主要结论；表达相同结论的候选只保留更适合阅读场合的一张。

## 色卡

Lieflat preset 默认使用 Editorial Utility 的共享中性色阶：

| 语义 | Token |
| --- | --- |
| 主墨色 | `--viz-editorial-ink` |
| 纸面 | `--viz-editorial-paper` |
| 次级文字 | `--viz-editorial-muted` |
| 微弱标记 | `--viz-editorial-faint` |
| 网格 | `--viz-editorial-grid` |
| 浅色表面关键数据几何 | `--viz-accent-strong / --viz-accent / --viz-accent-mid / --viz-accent-soft / --viz-accent-subtle` |
| 浅色表面面积填充 | `--viz-accent-area` |
| 暗色表面关键数据几何 | `--viz-accent-on-dark-strong / --viz-accent-on-dark / --viz-accent-on-dark-mid / --viz-accent-on-dark-soft / --viz-accent-on-dark-subtle` |
| 暗色表面面积填充 | `--viz-accent-on-dark-area` |
| 网格、轴线、日历发丝线、辅助连接 | `--viz-grid` |
| 基准、目标、未选中数据 | `--viz-reference` |
| 上游兼容槽 | `--viz-editorial-c-<hex>` |

`lieflat-theme.js` 是脚本侧的唯一主题桥。模板脚本从 `window.DC_LIEFLAT_COLORS` 读取当前主题值，并由 `window.DC_LIEFLAT_THEME.installAdapters()` 按“数据标记、面积填充、中性结构”三类角色统一处理 SVG、Chart.js 和 ECharts。ECharts preset 即使没有声明 `option.color`，适配器也必须注入当前主题的六阶数据标记色卡，不能让引擎默认色成为可见回退。兼容槽名称保留上游 hex 便于追溯，但实际值来自设计顾问 token，不是另一套皮肤。不要在派生文件中再次发明颜色，也不要把结构线整体映射成重点色。

普通产品图表仍可使用 `--viz-series-1..5`、`--viz-positive` 和 `--viz-negative`；但一旦选择 Lieflat preset，默认使用“一种重点色的完整同源色阶 + 中性结构阶梯”，不把五种分类色强行灌入。六阶数据标记色由 `strong / base / 中间过渡 / mid / soft / subtle` 组成；`area` 只负责面积填充，不进入柱、点、节点和主线的标记色阶。重点色负责数据，极浅灰仍负责网格、日历骨架和其他环境结构。切换 Harbor/Coral 或 light/dark 时必须通过 iframe 查询参数或项目主题状态重新初始化图表，保证 Canvas 颜色常量与 CSS 同步。页面容器、标题、按钮、筛选和状态组件仍使用通用组件 token。

## 中文文案

项目交付默认使用简体中文，并遵守 `references/visualization-copy-guidelines.md`。标题写分析对象与关系，不照搬英文隐喻；副标题补充指标、单位、分母、时间范围与必要的视觉编码。静态标题、Canvas / SVG 标签、tooltip、图例、坐标、交互提示和无障碍名称必须使用同一套业务术语。

`MAU`、`MRR`、`ARR`、`API`、`SLA` 等必要缩写可以保留。模板内部分类词、演示标签和宣传式表达不得进入项目 UI。原始英文只写入 manifest 的 `sourceName`、`sourceSystemLabel`、`sourceCardTitle`，不得为方便追溯而重新显示在页面中。

## 交互真实性

交互只绑定真实数据标记。网格、装饰线和肌理不能提供虚假的 tooltip。

- 普通 gallery：滚入视口播放，点击图表重播；重播前清理旧 timer。
- B1 Circular：hover 聚焦邻接关系，点击重播。
- B2 Force：节点可拖拽回弹，hover 聚焦。
- B3 Threads：可见线下使用透明孪生线扩大命中区；hover 单线或整束，点击固定，状态栏显示路径数据。融合派生层为真实路径补 `tab` 焦点、Enter/Space 固定和 Escape 清除。
- SVG 或 Canvas 交付需补可访问摘要；除 B3 已内置的键盘补丁外，项目实现仍要为其他自定义交互提供键盘等价操作和精确数据表。

## 响应式图表

移动端不能把桌面图表等比压缩到文字和数据标记不可读。默认策略是：

- 页面与卡片保持单列且不产生整页横向溢出。
- 复杂图形保持原始信息尺度，在卡片内部提供横向滚动或触摸平移；图表宽度不随视口强行缩成 390px。
- 标题、结论、单位和来源保持在可见区；滚动只作用于图形画布。
- 需要移动端完成精确操作时，另外提供摘要、数据表或任务化的移动端视图，而不是让用户在缩小图上点选。

## 动效

保留上游节奏：常规入场约 900ms，大元素和关系图约 1200ms，点阵 stagger 约 12ms，条形 stagger 约 100ms。不要把它改回统一的 240-420ms 通用组件动效。

- 使用上游 quarticOut / cubicOut 性格和个别模板专属节奏。
- 重播必须复用原模板机制，不另叠一层动画。
- reduced motion 下取消 CSS 入场；项目框架接入时还需关闭对应图表引擎动画。
- 动效不能改变数据含义、尺度、排序或命中范围。

## Visualization Kit

```text
Visualization Kit
- Analytical question: [要回答的问题]
- Takeaway: [一句话结论或 exploratory]
- Grain / unit / denominator: [观测粒度、单位、分母]
- Candidate presets: [至少 3 个，或全部可用候选]
- Selected lineage: [preset id / system / source template / card title]
- Rejected candidates: [淘汰理由]
- Data replacement: [替换哪些数组和字段]
- Interaction: [继承模板行为 + 项目键盘补充]
- Motion: [继承模板行为 + reduced-motion]
- Palette: [--viz-editorial-*]
- Accessibility: [摘要、键盘、精确数据表]
- HTML preview decision: [yes/no + reason]
- QA: [数据真实性、谱系、响应式、交互、动效、视觉回归]
```

## 文件与验证

| 文件 | 作用 |
| --- | --- |
| `vendor/lieflat-charts/` | byte-identical 上游原件 |
| `vendor/runtime-libs/` | 固定版本的 Chart.js / ECharts、许可证与哈希清单 |
| `templates/visualization-manifest.json` | 48 个 preset 的机器索引与来源谱系 |
| `templates/visualization-lieflat/` | 与通用基线融合的真实 gallery、主题桥与本地运行时 |
| `references/visualization-copy-guidelines.md` | 标题、副标题、图例、标注和交互提示的中文写作规范 |
| `templates/component-library.html#visualization/lupi` | 组件目录内的可视化入口，通过二级菜单切换 6 个真实预览 |
| `templates/catalog-foundation.css` | Catalog 的共享基础样式 |
| `scripts/sync-lieflat-module.mjs` | 从上游原件重建派生层 |
| `scripts/lieflat-localization.mjs` | 将上游可见文案稳定映射为中文，并保留原始谱系字段 |
| `scripts/check-visualization-module.mjs` | 检查 preset 数、哈希、主题桥、预览和 token |

```powershell
node .\scripts\sync-lieflat-module.mjs --check
node .\scripts\check-visualization-module.mjs
```

项目脚手架生成后，对应文件位于 `design-system/visualizations/lieflat/`、`design-system/visualizations/lieflat/runtime/`、`design-system/catalog/component-library.html#visualization/lupi` 和 `design-system/checks/`。生成结果可离线打开，不应再出现 `cdn.jsdelivr.net` 等远程运行时地址。
