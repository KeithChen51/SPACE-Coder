# Design System - {{PROJECT_NAME}}

## 产品上下文

- **产品是什么：** [一句话说明]
- **目标用户：** [角色/人群]
- **使用场景：** [内部工具/后台/对外产品/营销页/报表/移动端]
- **维护周期：** [一次性/短期/长期]
- **设计模式：** {{MODE}}
- **横向场景：** [admin-data-workspace/host-native/agent-process-ui/data-visualization/preview_decision/enforcement]

## 设计判断

- **是否需要独特设计规范：** [是/否/轻客制化]
- **判断依据：** [引用评分或关键原因]
- **当前策略：** [使用部门默认系统/轻客制化/完整项目规范]
- **资料完整度：** [足够/草案/缺少品牌资产/缺少正反例/缺少页面范围]
- **不能最终确定的内容：** [资料不足时列出]

## Composition Kit

- **Route：** [default/customize/design-system/review] + [横向模式]
- **Page template：** [后台列表页/明细数据工作台/客户门户/宿主插件设置页/Agent 输入区/助手输出流]
- **Frame：** [App shell/工作台/文档流/宿主原生设置页/移动端自然滚动]
- **Blocks：** [按页面顺序列出区块]
- **Component families：** [Button/Field/DataTable/Dialog/Status/Agent meta/...]
- **States：** loading / empty / error / success / disabled / permission denied / partial data
- **Responsive contract：** [桌面/窄屏/移动端区域行为]
- **Acceptance commitments：** [用稳定 kebab-case ID 列出需要在真实产品中验证的可观察结果]
- **HTML preview decision：** [yes/no + reason]
- **Enforcement：** [token/CSS/shared component/icon/a11y checks]
- **Visualization decision：** [none / 需要 Visualization Kit]

## 产品验收承诺

正式实现前，把 Composition Kit 中已承诺的行为登记到这里，并在 `checks/product-commitments.json` 使用相同 ID；该 JSON 是实现状态、代码位置和场景映射的机器可读事实源，场景代码写在 `checks/product-acceptance.config.mjs`。未进入实现时可保留 `none`；进入实现后不能以 `none` 交付。

| Commitment ID | 来源 | 可观察结果 | 实现状态 | 代码位置与锚点 | Scenario ID | 豁免 |
| --- | --- | --- | --- | --- | --- | --- |
| [vehicle-selection-keyboard] | [Composition Kit / Interaction] | [键盘可完成选择并更新业务上下文] | [planned / in-progress / implemented / waived] | [src/... + 稳定文本锚点] | [vehicle-selection-keyboard] | [不适用，或原因 + 批准人] |

必选承诺只有在状态为 `implemented`、代码锚点可解析且绑定至少一个 Playwright 场景时才可交付。`waived` 不是跳过按钮，必须填写原因和批准人。

## Visualization Kit

没有图表时填写 `none`。包含图表时，每个主要分析问题至少记录一份：

- **Analytical question：** [读者需要回答的问题]
- **Takeaway：** [一句话结论或 exploratory]
- **Grain / unit / denominator：** [观测粒度、单位、分母]
- **Candidate presets：** [至少 3 个，或全部可用候选]
- **Selected lineage：** [preset id / system / source template / card title]
- **Rejected candidates：** [淘汰理由]
- **Data replacement：** [替换哪些数组和字段]
- **Interaction：** [继承模板行为 + 项目键盘补充]
- **Motion：** [继承模板行为 + reduced-motion]
- **Palette：** [使用的 --viz-accent-* / --viz-accent-on-dark-* / --viz-grid / --viz-reference / --viz-editorial-* token]
- **Color roles：** [数据标记使用同源重点色色阶；面积填充使用 flat area token；网格、轴线、日历骨架和基准线保持中性]
- **Accessibility：** [直接标签、键盘、摘要或数据表]
- **HTML preview decision：** [yes/no + reason]
- **QA：** [数据真实性、响应式、交互、性能、视觉回归]

## 视觉方向

- **共同基线：** [Editorial Utility / 项目替代方向]
- **色卡：** [Harbor Blue（默认）/ Coral Office / 项目客制化]
- **明暗模式：** [light（默认）/ dark / 跟随系统]
- **导航色调：** [light（默认）/ inverse（需说明使用场景）]
- **性格：** [可信/高效/克制/表达性/品牌化]
- **视觉强度：** [quiet/confident/expressive]
- **信息密度：** [compact/standard/spacious]
- **圆角系统：** [sharp/standard/soft]
- **信息层级：** [标题/元信息/发丝线/反色面/留白的使用规则]

## 品牌资产与产品级署名

主品牌 Logo 与 `Powered by` / 技术提供方署名分开记录。SPACE 技术署名默认启用，但在视觉系统确认前保持 `deferred`：不展示预览、不参与色板决策，也不提前询问样式和位置。只有用户明确拒绝时才改为 `disabled`。

- **主品牌 Logo：** [身份区位置 + 批准资产路径]
- **署名关系与完整文案：** [none / Powered by SPACE AI Native / 技术提供方 / 合作品牌]
- **接入状态：`deferred`**；[deferred / style-recommended / placement-pending / placement-recommended / confirmed / disabled]
- **样式推荐状态：`pending-visual-system`**；视觉系统基本确认后填写 [recommended / confirmed]，并记录一个首选与安全 fallback
- **位置推荐状态：`pending-product-structure`**；产品形态、Shell / 导航和主要页面清单基本确认后填写 [recommended / confirmed]
- **样式首选：** [tone + material + accentScope + SPACE 点缀色 + AI 独立色 + 推荐依据]
- **安全 fallback：** [灰阶 / 反向灰阶 / 单色 / 系统重点色映射 + 触发条件]
- **署名资产：** [后轨道、S/P/C/E、A、前轨道蒙版；标准 / 紧凑两组 Powered by、AI、NATIVE 正式字形蒙版及版本化路径]
- **SPACE 点缀色：** 默认 light = `#4F46E5`、dark = `#818CF8`；[沿用默认 / 项目通过 `--brand-attribution-accent` 覆写为 … + 选择理由]。该 token 独立于页面 `--primary`
- **AI 独立色：** 默认 `#3D63FF`（正式原版渐变核心蓝）；[沿用默认 / 项目通过 `--brand-attribution-ai` 覆写为 … + 选择理由]。不得隐式跟随 SPACE 点缀色
- **重点色范围：** [`focus-and-orbit`（品牌原生版，组件默认，A + 双轨道）/ `orbit-only`（克制融入版，A 跟随中性字标，仅双轨道）]；同一产品不得按页面切换
- **色调与材质：** [brand / grayscale / grayscale-reverse / monochrome / inverse] + [metallic / flat]；正式连续性默认 `brand + metallic`，受限背景按规范选择灰阶或单色
- **范围选择依据：** [独立产品、低频品牌表面或需要突出技术归属时优先品牌原生版；成熟主品牌、密集工作台或长期常驻位置时优先克制融入版；记录本项目的实际判断]
- **共享组件入口：** [`BrandAttribution`；禁止页面各自重画]
- **主次版本：** `standard-stacked` 为主版本；`compact-horizontal` 仅用于空间受限的位置；`mark-only` 使用独立品牌资产组件
- **桌面已登录：** [rail-footer / shell-footer / none] + [standard-stacked / compact-horizontal]
- **移动端已登录：** [account-surface-footer / none] + [compact-horizontal]
- **认证 / 授权：** [auth-panel-footer / authorization-panel-footer / none] + [compact-horizontal]
- **已登录产品首页：** [home-footer / none] + [compact-horizontal]
- **其他无 Shell 页面：** [page-footer / none] + [compact-horizontal]；这是需明确批准的通用 fallback，不能从首页规则自动推导
- **响应式迁移：** [侧栏收起后移动到哪里；如何保证同一视口只有一个可见实例]
- **位置重评估：** 产品形态、Shell / 导航或主要页面清单变化后必须重新评估，不能沿用过期 placement
- **禁止落位：** [顶部栏/移动端一级导航/业务表格/业务弹层正文/内容区块/主 CTA]
- **稳定性要求：** [产品级固定位置；不要求每个页面重复出现]
- **可访问名称：** `Powered by SPACE AI Native`
- **清晰空间：** [四周至少 0.5 × 字标高度 / 项目批准值]
- **标准尺寸：** `standard-stacked` = [SPACE 160px / Powered by 80 × 7px / AI + NATIVE 127 × 5px / 纵向间距 7px + 10px]；`compact-horizontal` = [SPACE 108px / Powered by 97 × 13px / AI 14 × 7px / NATIVE 28 × 4px / 横向间距 4px + 6px]
- **字形约束：** `Powered by`、SPACE、`AI`、`NATIVE` 全部使用正式 SVG 字形轮廓，不继承项目 UI 字体，也不使用近似品牌字体替排
- **色层约束：** 绘制顺序固定为“后轨道 → S/P/C/E → A → 前轨道”，让 A 遮挡后轨道且前轨道保持跨越；双轨道始终使用 `--brand-attribution-accent`；A 根据统一 `accentScope` 使用重点色或 `--brand-attribution-neutral`；AI 独立使用 `--brand-attribution-ai`；Powered by、S/P/C/E 与 NATIVE 使用中性色；monochrome / inverse 强制所有层同色
- **资产约束：** 使用批准、版本化资产；不重画、不裁切、不拉伸、不用 CSS filter 整体变色；只使用从批准 SVG 确定性生成且几何一致的十张运行时蒙版；`mark-only` 不属于完整署名变体

## Typography

- **字体策略：** [system/data-heavy/corporate/editorial]
- **正文：** [字体栈]
- **数据：** [tabular nums/等宽字体]
- **字号层级：** [列出 token]

## Color

- **Primary：** [hex]
- **Secondary：** [hex]
- **Background：** [hex]
- **Surface：** [hex]
- **Subtle Surface：** [弱强调区域；对应 `--surface-subtle`]
- **Table Head Surface：** [表头；对应 `--surface-table-head`]
- **Hover Surface：** [低强度悬停；对应 `--surface-hover`]
- **Inverse Surface：** [hex]
- **Text：** [hex]
- **Muted Text：** [hex]
- **Disabled：** [背景 `--disabled-bg` / 文字 `--disabled-text`]
- **Border：** [hex]
- **Semantic：** success / warning / danger / info
- **Visualization：** `--viz-series-1..5` / positive / negative / reference / grid / canvas；Lieflat 数据标记使用 `--viz-accent-*` 同源色阶，面积填充使用 `--viz-accent-area`，结构线保持 `--viz-grid / --viz-reference` 中性，兼容槽 `--viz-editorial-*` 只负责上游谱系映射

表面角色不能用同一种浅重点色替代；主题切换时必须逐项验证背景、表头、悬停与禁用态，而不是只替换 `Primary`。

## Spacing

- **基础单位：** 4px
- **页面主间距：** [12/16/24/32/48]
- **组件内间距：** [列出规则]

## Radius

- **按钮：** [px]
- **输入框：** [px]
- **卡片：** [px]
- **弹窗/抽屉：** [px]

## Elevation

- **Card：** `--shadow-card`，只表达卡片与页面的轻微分层。
- **Popover：** `--shadow-popover`，用于选择菜单、操作菜单、Toast 与 Tooltip。
- **Dialog：** `--shadow-dialog`，用于模态对话框和高优先级覆盖层。
- **约束：** 不以阴影制造装饰性漂浮；嵌套区域优先使用表面和边框分层。

## Components

必须覆盖：

- Button
- Input / Select / Textarea
- Table
- Card
- Modal / Drawer
- Tabs
- Empty / Loading / Error
- Badge / Tag

组件候选状态：

| 组件 | 状态 | 理由 | 是否进入首批 |
|---|---|---|---|
| [Button] | keep | [复用高] | 是 |
| [未定组件] | adjust | [需要预览] | 否 |
| [暂缓组件] | hold | [信息架构未定] | 否 |

规则：

- `keep` 才进入首批规范。
- `adjust` 只进入候选和预览。
- `hold` 不抽 token，不进入公共组件。

## Page Templates

- **主要页面模板：** [后台列表页/明细数据工作台/客户门户/宿主插件设置页/Agent 输入区/助手输出流]
- **桌面结构：** [说明]
- **移动端结构：** [说明]
- **状态覆盖：** loading / empty / error / success / disabled / permission denied / partial data

## Motion

- **动效策略：** [minimal-functional/intentional/expressive]
- **默认时长：** [ms]
- **默认 easing：** [cubic-bezier]
- **Catalog reveal：** [是否沿用 360ms emphasized reveal]
- **Reduced motion：** [策略]

## HTML 预览

- **是否需要预览：** [是/否]
- **原因：** [为什么需要或不需要]
- **预览范围：** [页面/组件/状态/方案对比]

## 工程守门

- **Token 源：** `tokens/tokens.json`
- **Token 分类：** `base / semantic / component / data-viz`
- **生成产物：** `tokens/tokens.css`、`tokens/tokens.ts`、`tokens/tokens.schema.json`，由 `checks/sync-tokens.mjs build` 从 Token 源确定性生成，不手改
- **运行时入口：** `tokens/tokens.css`，并在 `system.config.json` 记录真实应用导入位置
- **人工预览：** `catalog/component-library.html` / `catalog/component-preview.html`
- **Catalog 共享样式：** `catalog/catalog-foundation.css`；组件目录追加 `catalog/component-library.css`，页面组合预览追加 `catalog/component-preview.css`
- **机器可读组件索引：** `components/manifest.json`
- **机器可读可视化索引：** `visualizations/manifest.json`
- **可视化真实模板：** `visualizations/lieflat/`；记录 preset 谱系、主题桥和项目接入位置
- **可视化运行时：** `visualizations/lieflat/runtime/`；固定版本、许可证和 SHA256，不依赖远程 CDN
- **组件决策：** `components/decisions.json`
- **项目 AI 规则：** `agent-rules.md`，并按需同步到项目 `AGENTS.md` / `CLAUDE.md`
- **组件入口：** [Button/DataTable/Dialog/IconButton 等]
- **图标入口：** [统一图标组件或宿主图标系统]
- **外部组件库策略：** [不用/参考吸收/适配吸收/依赖吸收；如 Astryx，记录版本和原因]
- **静态检查：**
  - Token CSS / TypeScript / Schema 生成、引用、Manifest、主题边界、漂移与关键 AA 对比度检查
  - CSS var 未定义检查
  - 散落颜色检查
  - 绕过共享组件检查
  - 非语义点击元素检查
  - icon-only accessible name 检查
  - visualization manifest / preview / keyboard / local runtime / token 一致性检查

## 决策日志

| 日期 | 决策 | 理由 |
|---|---|---|
| [YYYY-MM-DD] | 初始设计系统 | [依据] |
