# SPACE AI NATIVE 产品级技术署名规范

本规范用于所有需要表达 “Powered by SPACE AI Native” 技术归属的内部产品。它不是产品主 Logo，也不是状态 Badge：主品牌回答“这是什么产品”，技术署名回答“由谁提供技术能力”。两者必须分层设计、分别落位。

可执行组件与可视化示例见 `templates/component-library.html#brand-attribution`。当前通用组件的正式入口是 `BrandAttribution`，标准竖向版为主版本，紧凑横向版只用于高度受限区域。

## 1. 已确认的通用决策

1. **默认启用，但延后介入。** `BrandAttribution` 默认进入项目级组件能力，初始状态为 `deferred`；视觉系统确认前不展示、不提问、不参与色板决策，用户明确拒绝时才标记 `disabled`。
2. **两个色层分别客制化。** 系统点缀色浅色默认 `#4F46E5`、深色默认 `#818CF8`，通过 `--brand-attribution-accent` 控制 SPACE 的 A / 双轨道；AI 通过独立的 `--brand-attribution-ai` 控制，默认使用正式原版渐变的核心蓝 `#3D63FF`，原渐变范围为 `#2F6BFF → #3D63FF → #7C4DFF`。两者只在项目 token 层覆写，业务页面不得散传色值。
3. **重点色范围有两个批准选项。** 默认 `focus-and-orbit` 让 SPACE 的 A 与双轨道共同使用重点色；备选 `orbit-only` 让 A 与 S、P、C、E 同为中性色，仅双轨道使用重点色。项目统一选择一种，不在页面间切换。AI 独立色层不属于 `accentScope`，避免为了改 AI 颜色而改变 SPACE 的识别规则。
4. **颜色与材质是两个维度。** `tone` 管理品牌色、正式灰阶、反向灰阶与单色；`material` 管理 `metallic / flat`。`metallic` 只复用正式银灰渐变，不添加投影、高光、玻璃、立体或彩虹效果。
5. **正式资产字形轮廓不替换。** SPACE 主标继续复用企业正式 SVG；`Powered by`、`AI` 与 `NATIVE` 以企业原素材为结构来源，使用已经审批并锁定指纹的平滑正式轮廓。它们的比例、间距和构形契约不变，不再由 UI 字体、近似品牌字体或项目侧重绘替代。
6. **品牌图形与技术署名分开。** `mark-only` 不是 `BrandAttribution` 的变体；favicon、启动图形等场景应使用独立品牌资产组件。

### 重点色范围推荐

| 选项 | 视觉含义 | 优先推荐场景 | 不应成为首选的场景 |
|---|---|---|---|
| `focus-and-orbit`（品牌原生版，组件默认） | A 与双轨道共同使用重点色，更接近原始品牌资产，技术识别更强 | 独立产品；认证、授权、关于等低频品牌表面；署名拥有独立留白；需要明确表达 SPACE AI Native 技术归属 | 已有强主品牌且署名必须长期常驻；高密度业务工作区中会与主操作争夺注意力 |
| `orbit-only`（克制融入版） | A 回归中性字标，只让双轨道保留品牌识别，层级更低 | 已有成熟品牌或视觉系统；运营后台、数据工作台等高密度界面；Rail / Shell 尾部长期常驻；署名需要融入而不抢主品牌 | 署名是产品首要技术识别，或单独品牌展示面需要更完整保留原始视觉特征 |

先判断产品品牌关系、署名曝光频率和所在表面的视觉密度，再给出一个首选建议并说明依据。上下文不足时同时展示两版并确认；一旦写入 `DESIGN.md`，同一产品不再按页面切换。

### 来源实现事实

已核对的 `dy-data` 历史实现属于 `fixed-brand`：SPACE 主体为 `#70747A` / `#D8DAD4`，轨道固定 `#FE5205`，尺寸为 horizontal 84px、stacked 70px、mark 64px。它是来源项目证据，不是当前跨产品规范。

### 通用组件决策

跨产品组件改为可主题化语义 Token。SPACE 仍按后轨道、S/P/C/E、A、前轨道四层绘制；`Powered by`、`AI`、`NATIVE` 由六张以企业原素材为结构来源、经审批平滑修复的正式字形蒙版分别覆盖标准竖向版和紧凑横向版。SPACE 点缀色由 `--brand-attribution-accent` 管理，AI 独立色层由 `--brand-attribution-ai` 管理，默认值分别为通用靛蓝 `#4F46E5` 与正式原版渐变核心蓝 `#3D63FF`。旧项目可以继续保存自己的来源事实，但新产品和主动升级的项目使用本规范，不得把旧尺寸、橙色轨道、近似字体或 `mark` 变体倒写为通用规则。

## 2. 默认启用与分阶段接入

固定顺序是：**视觉系统独立确定 → 推荐署名样式 → 产品结构确定 → 推荐署名位置 → 用户确认并写入配置**。安装组件不等于立即展示，推荐也不等于最终确认。

### 状态机

| 状态 | 就绪条件 | 本阶段行为 |
|---|---|---|
| `deferred` | 视觉系统尚未基本确认 | 只记录待办；不得展示署名预览，不得询问位置、颜色、材质或重点色，不得把默认品牌蓝带入色板决策 |
| `style-recommended` | 色板、表面、明暗模式、密度与视觉强度已基本确认 | 评估适配度，只给出一个首选配置、理由与安全 fallback，等待用户确认 |
| `placement-pending` | 样式已确认，产品结构尚未就绪 | 保留样式配置，不猜 `rail-footer / shell-footer / page-footer`，不渲染到产品页面 |
| `placement-recommended` | 产品形态、Shell / 导航与主要页面清单已基本确认 | 推荐桌面、移动、认证 / 授权位置，由位置推导 variant，并定义响应式迁移与互斥 |
| `confirmed` | 用户确认样式与位置 | 写入项目 `system.config.json`、`DESIGN.md` 和 token，才允许产品页面消费 |
| `disabled` | 用户明确拒绝署名 | 保留拒绝记录，不渲染组件 |

### 样式推荐门槛

视觉系统基本确认后，按以下事实评估：

- 背景与表面明度，以及浅色 / 深色表面的实际分布；
- 系统重点色与默认品牌蓝的冲突，是否会形成两个竞争重点色；
- 明暗模式下中性层、重点层和小字形的可读性；
- 信息密度与视觉抢占，署名是低频品牌表面还是长期常驻工作区。

输出不是空白选项表，而是一条完整项目级建议：`tone + material + accentScope + SPACE 点缀色 + AI 独立色`，并附推荐依据和安全 fallback。默认连续性首选是 `brand + metallic + focus-and-orbit`；成熟主品牌、高密度工作台或常驻位置通常下调为 `orbit-only` 或 `flat`。当系统重点色不是蓝色或与默认品牌蓝冲突时，明确向用户确认首选方案：改用 `grayscale`、把署名点缀映射为系统重点色，或使用低调的 `orbit-only`；仍然只给出一个首选配置，其他方案只作为安全 fallback。

### 位置推荐门槛

只有产品形态、Shell / 导航与主要页面清单基本确认后才推荐位置；认证、授权、移动账户 / 关于等表面也需要先确认是否真实存在。`standard-stacked / compact-horizontal` 由 placement 与响应式空间推导，不在样式阶段让用户随意选择。

产品形态、Shell / 导航、主要页面或认证流程发生变化时，必须在结构变化后重新评估位置；不得沿用过期 placement。一个视口仍最多一个可见实例。

### 项目级配置

`system.config.json` 保存 `enabled / status / style / placement`。业务页面不得传入颜色、材质或任意结构开关，只能消费已确认配置；`DESIGN.md` 记录推荐依据、fallback 与尚未就绪的门槛，实际色值继续由 `tokens/tokens.json` 管理。

## 3. 对象边界

| 对象 | 作用 | 默认位置 |
|---|---|---|
| 产品主 Logo | 产品身份与返回首页入口 | App Shell 身份区，例如侧栏顶部或页面标题区 |
| `BrandAttribution` | 完整技术归属 “Powered by SPACE AI Native” | Shell 边缘、账户 / 关于表面或独立流程尾部 |
| 独立 SPACE Mark | favicon、启动识别、品牌图形 | 浏览器 chrome、启动画面；不能替代完整技术署名 |

署名属于产品级容器，不属于业务表格、图表、卡片或正文；稳定可发现不等于每页重复，不要求每个页面出现。一个视口只保留一个可见实例；响应式变化应迁移或互斥显示，不得复制第二份。

## 4. 落位矩阵

| 场景 | placement | variant | 规则 |
|---|---|---|---|
| 桌面已登录，存在持续 Rail / Sidebar | `rail-footer` | `standard-stacked` | 放在导航与帮助等次级工具之后的侧栏最底部 |
| 移动端已登录 | `account-surface-footer` | `compact-horizontal` | 放在“我的 / 账户 / 更多 / 关于”内容底部，不进入底部一级导航 |
| 登录、激活、重置密码、首次设置 | `auth-panel-footer` | `compact-horizontal` | 放在认证内容和主操作之后，以留白或细分隔线降级 |
| OAuth、CLI、MCP、设备或 Agent 授权 | `authorization-panel-footer` | `compact-horizontal` | 放在允许 / 拒绝操作之后，不改变操作层级和焦点顺序 |
| 已登录首页且 Shell 无署名 | `home-footer` | `compact-horizontal` | 随首页内容自然收尾，不固定、不悬浮 |
| 桌面无持续侧栏，但存在全局 Shell 尾部 | `shell-footer` | `compact-horizontal` | 作为登录后唯一稳定主位置 |
| 无 Shell 的独立入口 | `page-footer` | `compact-horizontal` | 只在项目明确批准时使用，不从首页规则自动推导 |

### 位置选择顺序

1. 有持续桌面侧栏时优先 `rail-footer`。
2. 侧栏在窄屏消失时，迁移到移动端账户 / 关于表面。
3. 没有侧栏但有稳定 Shell 尾部时，使用 `shell-footer`。
4. 登录和授权是未登录补充位置，不要求在登录后每个页面重复。
5. 暂无稳定容器时，在 `DESIGN.md` 标记 `pending`，不得先用 `position: fixed` 贴角。

## 5. 明确禁区

完整署名不得进入：

- 顶部栏、面包屑、页面标题行或产品主 Logo 组合；
- 桌面主导航项、移动端底部一级导航或 FAB；
- 表格、筛选栏、图表、KPI、业务卡片、空状态或每个内容区块；
- 业务 Dialog / Drawer 正文、Toast、错误提示；
- 主 CTA 两侧、提交按钮组内部或任何会被理解为操作的区域；
- 未预留空间的固定角落或遮挡滚动内容的位置。

设置、账户和关于页面属于产品级容器，可以承载署名；普通业务弹层不可以。

## 6. 视觉规范

### 正式变体

| variant / tone / material | SPACE 宽度 | 正式辅助字形轮廓 | 内部间距 | 用途 |
|---|---:|---:|---:|---|
| `standard-stacked` / `brand` / `metallic` | `160px` | Powered by `80 × 7px`；AI / NATIVE 组合区 `127 × 5px` | 纵向 `7px` + `10px` | 连续性默认、桌面 Rail、关于页面 |
| `compact-horizontal` / `brand` / `metallic` | `108px` | Powered by `97 × 13px`；AI `14 × 7px`；NATIVE `28 × 4px` | 横向 `4px` / `6px`，AI 与 NATIVE 纵向 `5px` | 认证、授权、移动账户、Shell 尾部 |
| 任一 variant / `brand` / `flat` | 同上 | 同上 | 同上 | 成熟视觉系统、密集工作区或需要降低材质感 |
| 任一 variant / `grayscale` / `metallic` | 同上 | 同上 | 同上 | 浅色背景上的正式灰阶：银灰中性层，A / AI / 轨道为深灰层 |
| 任一 variant / `grayscale-reverse` / `metallic` | 同上 | 同上 | 同上 | 深色背景上的正式反向灰阶：白银中性层，A / AI / 轨道为灰层 |
| 任一 variant / `monochrome` / `flat` | 同上 | 同上 | 同上 | 纯黑或单色深墨限制环境 |
| 任一 variant / `inverse` / `flat` | 同上 | 同上 | 同上 | 深色、照片或复杂背景上的纯白版本 |

四周至少保留 `0.5 × SPACE 字标高度` 的清晰空间，并且不小于所在容器的 16px 内边距。不能通过业务页面缩小字体、压缩内部间距或拉伸字标。

### 色彩 Token

```css
:root {
  --brand-attribution-accent: #4F46E5;
  --brand-attribution-ai: #3D63FF;
  --brand-attribution-neutral: var(--text-soft);
  --brand-attribution-metallic: linear-gradient(180deg, #E6E9EE 0%, #A9B0BA 48%, #D8DCE2 78%, #8E98A5 100%);
  --brand-attribution-grayscale-emphasis: linear-gradient(135deg, #8A8A8A 0%, #3F3F3F 100%);
  --brand-attribution-reverse-metallic: linear-gradient(180deg, #FFFFFF 0%, #DCE2EA 48%, #FFFFFF 100%);
  --brand-attribution-reverse-emphasis: linear-gradient(135deg, #B8B8B8 0%, #757575 100%);
  --brand-attribution-monochrome: #000000;
  --brand-attribution-inverse: #FFFFFF;
}

:root[data-theme="dark"] {
  --brand-attribution-accent: #818CF8;
}
```

- 项目可在 `tokens.json` 中覆盖浅色和深色的 `brandAttribution.accent`，例如显式映射自己的系统点缀色；只需要调整 AI 两字时覆盖 `brandAttribution.ai`。两个 token 独立解析，不得互相隐式绑定，也不得改组件结构或传入行内色值。
- 中性层继续使用语义前景色，不能跟随重点色一起染色。
- `material="metallic"` 只把中性层切换为正式银灰渐变；`flat` 使用语义中性色。`grayscale / grayscale-reverse` 同时把 A、AI 与轨道切换为正式灰阶重点层。
- `monochrome` 与 `inverse` 强制所有层使用同一纯色，不保留 AI 的独立双色覆盖，也不保留金属材质。
- 小尺寸正式字形与背景对比度不低于 4.5:1；使用重点色的 A / 双轨道识别图形与背景对比度不低于 3:1。
- 组件本身透明，不添加胶囊、卡片底、投影或悬浮动画。

### 分层资产实现

外部 `<img>` 中的 `var()` 不能可靠继承页面 Token，因此将批准 SVG 确定性拆成后轨道、S/P/C/E、A、前轨道四张同形蒙版；同时从标准版与紧凑版正式资产逐段提取 `Powered by`、`AI`、`NATIVE` 六张字形蒙版。运行时把它们编码为本地 `data:` 蒙版，保证 `file://` 预览与正常 Web 部署使用同一实现：

```css
.dc-brand-attribution__mark-layer--orbit-back {
  z-index: 0;
  background: var(--brand-attribution-accent);
}

.dc-brand-attribution__mark-layer--neutral {
  z-index: 1;
  background: var(--brand-attribution-neutral);
}

.dc-brand-attribution__mark-layer--focus {
  z-index: 2;
  background: var(--brand-attribution-accent);
}

.dc-brand-attribution__mark-layer--orbit-front {
  z-index: 3;
  background: var(--brand-attribution-accent);
}

.dc-brand-attribution--accent-orbit-only
  .dc-brand-attribution__mark-layer--focus {
  background: var(--brand-attribution-neutral);
}

.dc-brand-attribution__ai {
  color: var(--brand-attribution-ai);
}
```

SPACE 的四张运行时蒙版分别包含后轨道、S/P/C/E、A 和前轨道，并严格按此顺序绘制；后轨道被字标遮挡，前轨道覆盖字标，从而保留原始环绕关系。六张辅助字形蒙版则分别锁定两种结构中的 `Powered by`、`AI`、`NATIVE` 平滑正式轮廓。全部蒙版必须由批准 SVG 确定性生成，保持当前正式 path、transform、fill-rule、viewBox 与相对比例，不使用 CSS filter 整体染色；合并的双轨道及 A + 轨道蒙版只作为资产校验与兼容产物保留。

## 7. 组件契约

```text
component: BrandAttribution
variant: standard-stacked | compact-horizontal
tone: brand | grayscale | grayscale-reverse | monochrome | inverse
material: metallic | flat
accentScope: focus-and-orbit | orbit-only
placement: rail-footer | account-surface-footer | auth-panel-footer |
           authorization-panel-footer | home-footer | shell-footer | page-footer
theme: 从项目主题上下文解析
accessibleName: “Powered by SPACE AI Native”
```

- `standard-stacked` 是主版本；`compact-horizontal` 只用于高度受限区域。
- 页面不能自行选择配置；它只能消费项目已确认的 `placement`、由位置推导的 `variant`、`tone`、`material` 和统一 `accentScope`，不能传入颜色、文案、字体或任意尺寸。
- 共享组件内部负责正式资产字形轮廓、固定文案、主题解析和 accessible name；颜色只从组件 Token 解析。
- 默认参与正常文档流。只有 Shell 明确预留空间并定义 safe area 与 z-index 契约时才允许 sticky / fixed。
- 独立 SPACE Mark 使用另一组件或批准资产，不加入此组件的 variant union。

## 8. 可访问性与资产完整性

- 完整署名作为一个语义整体提供唯一可读名称，内部文字和图形使用 `aria-hidden` 避免重复朗读。
- 不用颜色单独表达技术提供关系，完整文字关系始终存在。
- 只使用版本化、已审批并锁定指纹的正式 SVG 与生成蒙版；不得重新描摹、内联仿制、裁切、拉伸、CSS filter 变色、字体替排或替换字形。
- `Powered by`、`AI`、`NATIVE` 不参与项目字体继承；它们与 SPACE 一样按正式轮廓渲染。

## 9. `DESIGN.md` 必须记录

项目接入技术署名时至少记录：

- 完整关系文案和共享组件入口；
- 当前接入状态、两个就绪门槛、样式首选、推荐依据与安全 fallback；
- 浅色 / 深色重点色 Token 值、AI 独立色 Token 值及其品牌依据；
- 桌面、移动端、认证 / 授权和无侧栏场景的唯一主 placement；
- placement 对应的 variant、tone、material 与产品统一 `accentScope`；
- 响应式迁移和互斥规则；
- 禁止落位、清晰空间与 accessible name；
- 资产版本及尚未确认项。

默认状态是 `deferred`；用户明确拒绝时填写 `disabled`，暂时无法确定稳定位置时保持 `placement-pending`，不能以 `page-footer` 或 fixed 角落冒充完成。

## 10. 验收与防退化

- 组件测试：只有一个 “Powered by SPACE AI Native” 可读名称，且 variant 不包含 `mark`。
- 资产测试：后轨道、S/P/C/E、A、前轨道四个运行时蒙版互不混入且绘制顺序固定；六张平滑辅助字形蒙版保持批准的 SHA-256、单条黑色 even-odd 路径、正式 viewBox 与运行时内嵌一致；生成脚本 `check` 无漂移。
- 主题测试：SPACE 点缀色浅色默认 `#4F46E5`、深色默认 `#818CF8`，AI 独立色默认 `#3D63FF`；覆盖 `--brand-attribution-accent` 后只改变 SPACE 重点色层，覆盖 `--brand-attribution-ai` 时只改变 AI 两字，中性层不被污染。
- 阶段测试：视觉系统未确认时没有预览、问题或品牌蓝污染；结构未确认时位置保持 pending；只有用户确认后才允许产品页面消费配置。
- 材质与灰阶测试：正式银灰、灰阶和反向灰阶渐变停靠值不漂移；`monochrome / inverse` 强制纯色。
- 落位测试：桌面 Rail、移动账户 / 关于、认证 / 授权和 Shell 尾部按项目 placement map 覆盖。
- 互斥测试：同一视口最多一个登录后主署名实例。
- 响应式测试：至少检查 390、768、1440，不横向溢出、不进入底部导航、不遮挡内容。
- 视觉复核：署名低于产品身份和主任务层级，透明、克制，不形成第二张品牌卡片。

来源证据仍保留 `dy-data` 的桌面 Rail、移动“我的”、认证、授权和首页尾部实现；通用层只吸收其稳定位置逻辑，不继承固定橙色、旧尺寸和 `mark-only` 组件边界。
