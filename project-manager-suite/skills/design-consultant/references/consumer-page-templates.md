# C 端页面与旅程模板

本文件补充 `page-templates.md`，用于把 C 端产品类型转换成可验收的 Composition Kit。模板描述信息与行为，不预设品牌色、字体或流行风格；视觉仍由项目 Token 和已确认设计系统决定。

## 通用 Composition Kit 字段

每次选用模板必须填完以下字段：

```text
- product_archetype: 一个主类型，可选最多两个次级叠加类型
- journey_stage: acquire / discover / evaluate / transact / use / retain / recover
- Frame: 页面外框、导航和滚动模型
- Blocks: 按用户任务顺序排列的内容和操作区
- States: loading / empty / partial / error / success / disabled / return/recovery
- Responsive contract: 桌面、窄屏和移动端的重排、固定控件与安全区规则
- trust_evidence: 用户作出当前决定前必须看见的证据
- transaction_state: none / preparing / review / processing / confirmed / failed / reversed
- recovery_state: 返回位置、输入、筛选、草稿和失败任务如何恢复
- Acceptance commitments: 稳定 ID、来源、实现状态、代码锚点和验收场景
```

`empty` 只表示合法无数据；请求尚未完成使用 `loading`，部分成功使用 `partial`，系统失败使用 `error`。页面跳转、刷新、登录回跳和跨设备继续都属于 `return/recovery`，不得默认重置用户上下文。

## 模板目录

### `discovery-feed`

- Frame：品牌或产品级导航 + 可恢复的自然滚动内容流。
- Blocks：入口提示、分类/兴趣控制、推荐分组、内容或商品卡、继续浏览入口。
- States：首屏骨架、无推荐时的可选类目、部分卡片失败、加载失败、偏好保存成功、返回原位置。
- Responsive contract：桌面可多列；移动端单列或横向短轨，固定导航不得遮挡末项。
- trust_evidence：推荐原因、广告/赞助标记、内容或商品来源。
- transaction_state：`none`，卡片中的交易只作为下一页入口。
- recovery_state：恢复滚动位置、已读项、分页游标与主动选择的兴趣。
- Acceptance commitments：`CNS-DISCOVERY-STATE`、`CNS-DISCOVERY-REASON`、`CNS-DISCOVERY-RETURN`。

### `search-results`

- Frame：搜索输入、查询反馈、筛选排序和结果区共用同一任务上下文。
- Blocks：查询框、筛选摘要、排序、结果、结果总量或范围、翻页/继续加载。
- States：搜索建议 loading、无查询、无结果 empty、partial 结果、请求 error、筛选成功、返回恢复。
- Responsive contract：移动端筛选进入可撤销面板，关闭后保留草稿或明确放弃；结果不强塞桌面表格。
- trust_evidence：排序依据、数据更新时间、价格/距离/可用性口径。
- transaction_state：`none`。
- recovery_state：查询、筛选、排序、页码和已访问结果写入可恢复状态，必要时进入 URL。
- Acceptance commitments：`CNS-SEARCH-STATE`、`CNS-SEARCH-FILTER-RESTORE`、`CNS-SEARCH-SORT-EXPLAIN`。

### `item-detail`

- Frame：对象身份与主行动稳定可见，详情按“理解—证据—条件—行动”展开。
- Blocks：标题与关键媒体、核心价值、价格/条件、选择项、说明、证据、支持入口。
- States：媒体 loading、对象不存在 empty、库存/内容 partial、加载 error、选择成功、返回保持选择。
- Responsive contract：移动端媒体、标题、价格和主行动先出现；粘性操作需避开安全区且不遮挡内容。
- trust_evidence：来源、真实媒体、价格与限制、资质/作者、评价和售后。
- transaction_state：通常为 `preparing`，进入交易前显示所选规格或条件。
- recovery_state：恢复媒体位置、规格、数量、展开项和来源列表位置。
- Acceptance commitments：`CNS-DETAIL-IDENTITY`、`CNS-DETAIL-EVIDENCE`、`CNS-DETAIL-SELECTION`。

### `comparison-decision`

- Frame：比较对象、比较维度和选择结果处于同一阅读范围。
- Blocks：选择器、关键差异摘要、并列维度、费用限制、证据、下一步。
- States：数据 loading、无可比项 empty、字段缺失 partial、比较 error、选择 success、返回恢复对象集。
- Responsive contract：移动端使用逐维度对比或固定首列，不把宽表等比缩小。
- trust_evidence：同口径数据、更新时间、缺失值说明、利益关系披露。
- transaction_state：`review` 前置，不能由“推荐”直接越过用户确认。
- recovery_state：保留对象、维度、排序和折叠状态。
- Acceptance commitments：`CNS-COMPARE-SAME-BASIS`、`CNS-COMPARE-MISSING`、`CNS-COMPARE-RESTORE`。

### `cart-checkout`

- Frame：线性但可回退的复核流程，始终显示当前步骤和最终责任主体。
- Blocks：商品/服务复核、联系人或地址、履约、优惠、费用明细、支付、最终确认、结果凭证。
- States：费用 loading、空购物车 empty、部分库存变化 partial、支付 error、订单 success、回到失败步骤。
- Responsive contract：移动端总价和提交操作可固定但遵守 safe area；字段按输入顺序单列。
- trust_evidence：总价、税费运费、退款取消、收款方、预计履约。
- transaction_state：`preparing → review → processing → confirmed/failed/reversed`。
- recovery_state：失败不清空购物车和已验证字段；重复提交必须幂等并给出查询入口。
- Acceptance commitments：`CNS-CHECKOUT-TOTAL`、`CNS-CHECKOUT-REVIEW`、`CNS-CHECKOUT-RECOVERY`。

### `booking-schedule`

- Frame：资源、日期时区、时段与用户信息形成单一预约上下文。
- Blocks：资源选择、日历/时段、人数或数量、费用政策、联系人、复核、确认凭证。
- States：可用性 loading、无时段 empty、部分资源 partial、占位/提交 error、预约 success、改期恢复。
- Responsive contract：移动端日历支持触控和键盘替代输入；时区、日期和已选时段持续可见。
- trust_evidence：可用性时效、时区、总价、取消改期和迟到政策。
- transaction_state：`preparing → review → processing → confirmed/failed`。
- recovery_state：时段失效时保留其余信息并推荐可解释的相邻选项。
- Acceptance commitments：`CNS-BOOKING-TIMEZONE`、`CNS-BOOKING-AVAILABILITY`、`CNS-BOOKING-RECOVERY`。

### `auth-onboarding`

- Frame：一次只解释一个必要决定，显示进度、跳过和稍后完成路径。
- Blocks：价值说明、身份方式、最少字段、权限解释、偏好设置、完成与返回原任务。
- States：验证 loading、初始 empty、资料 partial、认证 error、完成 success、登录回跳恢复。
- Responsive contract：键盘弹出不遮挡当前字段和提交按钮；验证码支持粘贴和自动填充。
- trust_evidence：数据用途、权限理由、账户恢复方式、法律必需项。
- transaction_state：`none`，不得把营销同意捆绑为开户条件。
- recovery_state：保存合法草稿并回到触发注册的原任务；非法律必需步骤可跳过。
- Acceptance commitments：`CNS-AUTH-MINIMUM`、`CNS-ONBOARD-SKIP`、`CNS-AUTH-RETURN`。

### `subscription-paywall`

- Frame：价值、适用人群、套餐成本和退出条件在行动前可读。
- Blocks：权益摘要、套餐、周期切换、差异、试用与续费、常见问题、购买和恢复购买。
- States：权益 loading、无可购方案 empty、区域限制 partial、支付 error、订阅 success、恢复购买。
- Responsive contract：移动端先显示权益和完整应付金额；套餐横滑必须同时提供可访问的列表替代。
- trust_evidence：扣费金额和日期、税费、自动续费、取消退款、平台支付主体。
- transaction_state：`preparing → review → processing → confirmed/failed/reversed`。
- recovery_state：支持恢复购买、支付失败重试、套餐变更撤销和取消后的权益说明。
- Acceptance commitments：`CNS-SUBSCRIPTION-COST`、`CNS-SUBSCRIPTION-CANCEL`、`CNS-SUBSCRIPTION-RESTORE`。

### `account-orders-history`

- Frame：账户身份、当前权益、记录和管理操作清晰分区。
- Blocks：身份与安全、订单/预约/收藏/历史、筛选、记录详情、帮助、退出或注销。
- States：账户 loading、无记录 empty、同步 partial、读取 error、变更 success、返回原筛选。
- Responsive contract：移动端记录卡替代宽表；危险操作不与高频入口相邻。
- trust_evidence：状态来源、时间、金额、操作影响、审计或凭证。
- transaction_state：展示历史 `confirmed/failed/reversed`，新变更须单独 review。
- recovery_state：保留标签、筛选、页码和当前记录；变更失败显示可执行下一步。
- Acceptance commitments：`CNS-ACCOUNT-STATE`、`CNS-HISTORY-TRACE`、`CNS-ACCOUNT-RECOVERY`。

### `content-community`

- Frame：消费、创作和互动入口有清楚层级，不让指标挤压正文。
- Blocks：内容主体、作者与来源、互动、评论/讨论、发布器、社区规则和治理入口。
- States：内容 loading、无内容 empty、评论 partial、发布 error、发布 success、草稿恢复。
- Responsive contract：移动端输入器随键盘调整；长内容保持阅读宽度，互动控件不覆盖正文。
- trust_evidence：作者、发布时间、编辑记录、赞助标记、治理规则。
- transaction_state：`none`。
- recovery_state：自动保存草稿，失败可重发；恢复阅读和评论位置。
- Acceptance commitments：`CNS-CONTENT-SOURCE`、`CNS-COMMUNITY-SAFETY`、`CNS-DRAFT-RECOVERY`。

### `ratings-trust-support`

- Frame：证据、限制、帮助和争议处理共同解释“为什么可信、出错怎么办”。
- Blocks：评分分布、评价列表、验证标记、资质/保障、常见问题、联系支持、申诉进度。
- States：证据 loading、无评价 empty、来源 partial、支持 error、请求 success、工单恢复。
- Responsive contract：移动端评分分布可读，筛选和支持入口不埋入横向表格。
- trust_evidence：样本量、时间、验证方法、利益关系、响应时效。
- transaction_state：展示关联交易状态但不在此页发起隐式扣费。
- recovery_state：保留评价筛选、工单编号和未提交问题描述。
- Acceptance commitments：`CNS-RATING-BASIS`、`CNS-SUPPORT-ESCALATION`、`CNS-DISPUTE-TRACE`。

### `app-launch-waitlist`

- Frame：产品价值、真实演示、可用平台和资格入口按证据顺序展开。
- Blocks：价值主张、演示/截图、适用对象、发布状态、平台入口、候补/下载表单、隐私说明。
- States：媒体 loading、平台不可用 empty、区域 partial、提交 error、登记/下载 success、跨设备恢复。
- Responsive contract：桌面二维码与移动端商店按钮按设备切换；大媒体有性能和 reduced-motion 退化。
- trust_evidence：真实产品画面、版本/地区、发布日期来源、数据用途。
- transaction_state：`none` 或明确的资格申请，不伪装成购买成功。
- recovery_state：登记失败保留邮箱和资格信息；成功提供可保存凭证与撤回方式。
- Acceptance commitments：`CNS-LAUNCH-REALITY`、`CNS-WAITLIST-CONSENT`、`CNS-DOWNLOAD-HANDOFF`。

## 使用边界

- 一个页面可以组合多个模板，但必须指定主模板，避免把所有区块堆成“万能首页”。
- 高风险健康、金融和交易流程的证据与复核要求不能因增长目标降级。
- 真实页面生产、预览地址和交付证据另走 `page-production-contract.md`；本文件只定义设计与验收语义。
