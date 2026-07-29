# SPACE AI NATIVE 产品级技术署名规范

本规范用于所有需要表达 “Powered by SPACE AI Native” 技术归属的内部产品。它不是产品主 Logo，也不是状态 Badge：主品牌回答“这是什么产品”，技术署名回答“由谁提供技术能力”。两者必须分层设计、分别落位。

可执行组件与可视化示例见 `templates/component-library.html#brand-attribution`。当前通用组件的正式入口是 `BrandAttribution`，标准竖向版为主版本，紧凑横向版只用于高度受限区域。

## 1. 已确认的通用决策

1. **稳定可发现，不要求每个页面出现。** 每个产品在登录后选择一个稳定主位置；登录、授权等未登录流程可以在自己的面板尾部补充。
2. **重点色可客制化。** 浅色默认靛蓝 `#4F46E5`，深色默认亮靛蓝 `#818CF8`；项目只能通过 `--brand-attribution-accent` 覆盖，业务页面不得散传色值。
3. **重点色范围有两个批准选项。** 默认 `focus-and-orbit` 让 A 与双轨道共同使用重点色；备选 `orbit-only` 让 A 与 S、P、C、E 同为中性色，仅双轨道使用重点色。项目统一选择一种，不在页面间切换。
4. **不使用金属和渐变。** 正式版本只保留双色、单色深和单色浅，不建立高光、立体、玻璃或彩虹版本。
5. **字体分工明确。** `Powered by` 使用项目普通 UI 字体；SPACE 使用批准的 SVG 字形；`AI NATIVE` 使用组件内 vendored 的 Ethnocentric Regular，不扩散到导航、标题、按钮和正文。
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

跨产品组件改为可主题化语义 Token，默认使用靛蓝，并把字母主体、A 与双轨道拆成四个几何一致的绘制层：后轨道、S/P/C/E、A、前轨道。旧项目可以继续保存自己的来源事实，但新产品和主动升级的项目使用本规范，不得把旧尺寸、橙色轨道或 `mark` 变体倒写为通用规则。

## 2. 对象边界

| 对象 | 作用 | 默认位置 |
|---|---|---|
| 产品主 Logo | 产品身份与返回首页入口 | App Shell 身份区，例如侧栏顶部或页面标题区 |
| `BrandAttribution` | 完整技术归属 “Powered by SPACE AI Native” | Shell 边缘、账户 / 关于表面或独立流程尾部 |
| 独立 SPACE Mark | favicon、启动识别、品牌图形 | 浏览器 chrome、启动画面；不能替代完整技术署名 |

署名属于产品级容器，不属于业务表格、图表、卡片或正文。一个视口只保留一个可见实例；响应式变化应迁移或互斥显示，不得复制第二份。

## 3. 落位矩阵

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

## 4. 明确禁区

完整署名不得进入：

- 顶部栏、面包屑、页面标题行或产品主 Logo 组合；
- 桌面主导航项、移动端底部一级导航或 FAB；
- 表格、筛选栏、图表、KPI、业务卡片、空状态或每个内容区块；
- 业务 Dialog / Drawer 正文、Toast、错误提示；
- 主 CTA 两侧、提交按钮组内部或任何会被理解为操作的区域；
- 未预留空间的固定角落或遮挡滚动内容的位置。

设置、账户和关于页面属于产品级容器，可以承载署名；普通业务弹层不可以。

## 5. 视觉规范

### 正式变体

| variant / tone | SPACE 宽度 | 文字尺寸 | 内部间距 | 用途 |
|---|---:|---:|---:|---|
| `standard-stacked` / `brand` | `160px` | Powered by `12px`；AI NATIVE `10px` | 纵向 `7px` | 默认主版本、桌面 Rail、关于页面 |
| `compact-horizontal` / `brand` | `108px` | Powered by `11px`；AI NATIVE `10px` | 横向 `12px` | 认证、授权、移动账户、Shell 尾部 |
| 任一 variant / `monochrome` | 同上 | 同上 | 同上 | 单色深墨环境 |
| 任一 variant / `inverse` | 同上 | 同上 | 同上 | 深色或图片背景上的单色浅墨版本 |

四周至少保留 `0.5 × SPACE 字标高度` 的清晰空间，并且不小于所在容器的 16px 内边距。不能通过业务页面缩小字体、压缩内部间距或拉伸字标。

### 色彩 Token

```css
:root {
  --brand-attribution-accent: #4F46E5;
  --brand-attribution-neutral: var(--text-soft);
  --brand-attribution-inverse: var(--text-inverse);
}

:root[data-theme="dark"] {
  --brand-attribution-accent: #818CF8;
}
```

- 项目可在 `tokens.json` 中覆盖浅色和深色的 `brandAttribution.accent`，例如映射自己的品牌主色。
- 中性层继续使用语义前景色，不能跟随重点色一起染色。
- 小尺寸辅助文字与背景对比度不低于 4.5:1；使用重点色的 A / 双轨道识别图形与背景对比度不低于 3:1。
- 组件本身透明，不添加胶囊、卡片底、投影或悬浮动画。

### 分层资产实现

外部 `<img>` 中的 `var()` 不能可靠继承页面 Token，因此将批准 SVG 确定性拆成后轨道、S/P/C/E、A、前轨道四张同形蒙版。运行时把它们编码为本地 `data:` 蒙版，保证 `file://` 预览与正常 Web 部署使用同一实现：

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
```

四张运行时蒙版分别包含后轨道、S/P/C/E、A 和前轨道，并严格按此顺序绘制；后轨道被字标遮挡，前轨道覆盖字标，从而保留原始环绕关系。它们必须由批准 SVG 确定性生成，保持原始 path、transform、fill-rule、viewBox 和顶层组顺序，不使用 CSS filter 整体染色；合并的双轨道及 A + 轨道蒙版只作为资产校验与兼容产物保留。

## 6. 组件契约

```text
component: BrandAttribution
variant: standard-stacked | compact-horizontal
tone: brand | monochrome | inverse
accentScope: focus-and-orbit | orbit-only
placement: rail-footer | account-surface-footer | auth-panel-footer |
           authorization-panel-footer | home-footer | shell-footer | page-footer
theme: 从项目主题上下文解析
accessibleName: “Powered by SPACE AI Native”
```

- `standard-stacked` 是主版本；`compact-horizontal` 只用于高度受限区域。
- 页面只能选择项目批准的 `placement`、`variant`、`tone` 和统一 `accentScope`，不能传入颜色、文案、字体或任意尺寸。
- 共享组件内部负责资产、字体、固定文案、主题解析和 accessible name。
- 默认参与正常文档流。只有 Shell 明确预留空间并定义 safe area 与 z-index 契约时才允许 sticky / fixed。
- 独立 SPACE Mark 使用另一组件或批准资产，不加入此组件的 variant union。

## 7. 可访问性与资产完整性

- 完整署名作为一个语义整体提供唯一可读名称，内部文字和图形使用 `aria-hidden` 避免重复朗读。
- 不用颜色单独表达技术提供关系，完整文字关系始终存在。
- 只使用版本化的 SVG、蒙版和 vendored 字体；不得重新描摹、内联仿制、裁切、拉伸、CSS filter 变色或替换字形。
- `Powered by` 的 UI 字体跟随项目字体栈；Ethnocentric 只用于 `AI NATIVE`。

## 8. `DESIGN.md` 必须记录

项目接入技术署名时至少记录：

- 完整关系文案和共享组件入口；
- 浅色 / 深色重点色 Token 值及其品牌依据；
- 桌面、移动端、认证 / 授权和无侧栏场景的唯一主 placement；
- placement 对应的 variant、tone 与产品统一 `accentScope`；
- 响应式迁移和互斥规则；
- 禁止落位、清晰空间与 accessible name；
- 资产版本及尚未确认项。

不需要署名时填写 `none`；暂时无法确定稳定位置时填写 `pending`。

## 9. 验收与防退化

- 组件测试：只有一个 “Powered by SPACE AI Native” 可读名称，且 variant 不包含 `mark`。
- 资产测试：后轨道、S/P/C/E、A、前轨道四个运行时蒙版互不混入且绘制顺序固定；合并重点色蒙版等于 A + 双轨道；生成脚本 `check` 无漂移。
- 主题测试：浅色默认 `#4F46E5`，深色默认 `#818CF8`；覆盖 Token 后重点色层立即变化，中性层不被污染。
- 落位测试：桌面 Rail、移动账户 / 关于、认证 / 授权和 Shell 尾部按项目 placement map 覆盖。
- 互斥测试：同一视口最多一个登录后主署名实例。
- 响应式测试：至少检查 390、768、1440，不横向溢出、不进入底部导航、不遮挡内容。
- 视觉复核：署名低于产品身份和主任务层级，透明、克制，不形成第二张品牌卡片。

来源证据仍保留 `dy-data` 的桌面 Rail、移动“我的”、认证、授权和首页尾部实现；通用层只吸收其稳定位置逻辑，不继承固定橙色、旧尺寸和 `mark-only` 组件边界。
