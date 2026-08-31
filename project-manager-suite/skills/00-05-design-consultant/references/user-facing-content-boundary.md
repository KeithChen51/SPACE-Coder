# 用户可见内容边界

本规则用于避免把内部数据值和工程文案直接暴露给最终用户。它同时约束页面设计、前端实现与 product acceptance；数据库、API 和运行时模型仍可保留真实字段，但进入 visible text 前必须经过展示层转换。

## 两类阻断问题

### `internal-data-exposure`

用户界面不得直接显示数据库列名、API field、raw enum、内部状态码、布尔开关、对象 dump、未格式化 ID、配置值或调试值，例如 `payment_status`、`PAYMENT_RETRY_PENDING`、`internalUserId`、`{"status_code": 12}`。确有业务意义的订单号、交易凭证或设备编号可以展示，但必须有用户能理解的名称、必要的格式化或脱敏，并在需求中明确用途。

### `engineering-copy`

用户界面不得出现只对开发者有意义的 debug、mock、placeholder、TODO、API response、stack trace、源码路径、`undefined`、`null`、`[object Object]` 或“组件加载失败”一类工程文案。错误状态要说明用户受到的影响、当前结果是否确定、可以采取的恢复动作；不能把异常对象或服务端原文直接交给用户。

## 设计阶段

Composition Kit 增加 `Content boundary`：

- 明确当前页面的用户和可见信息范围；内部运营、开发诊断与普通用户页面不能共用未经区分的展示模型。
- 为状态、类型、金额、时间、权限、错误和空值建立 presentation mapping：内部值、用户文案、格式化方式、未知值 fallback、可执行恢复动作。
- loading、empty、partial、error、success 等状态都写用户能理解的业务文案，不使用工程占位符填充版面。
- 原型和真实页面使用接近真实长度与语义的示例内容；mock 数据不得以 `mock data`、变量名或内部枚举形式出现在界面。
- 对确需展示的业务编号，记录用途、显示名称、格式和脱敏规则；没有需求证据时默认不展示。

## 实现阶段

- API DTO、数据库模型和状态机值停留在数据层；组件只消费经过转换的展示模型。
- 使用集中 label dictionary、status copy、formatter 和 safe unknown fallback，禁止在页面中散落 `if/else` 后直接输出 raw value。
- 不把 `JSON.stringify`、异常消息、请求对象、路径、feature flag 或内部属性直接渲染到 JSX、模板、表格列、tooltip、Toast、空状态和错误页。
- `scripts/check-ui-contract.mjs` 静态报告 `internal-data-exposure` 与 `engineering-copy`，提供文件、行号和最小修复方向；它是守门证据，不替代真实页面验收。

## 验收阶段

- product acceptance 在每个场景截图前扫描真实页面的 visible text，以及可见控件的 label、placeholder、title、alt 和表单值；命中任一阻断规则即失败，不生成通过证据。
- 至少覆盖 desktop、mobile，以及 loading、empty、partial、error、success 和关键恢复状态；每种状态都检查用户文案与展示值。
- 使用包含未知枚举、空值、长 ID、服务端错误和部分数据的测试输入，验证 presentation mapping 与 fallback，不能只测理想数据。
- 截图用于复核语境，机器扫描用于定位明显泄漏；两者都不能被“这是测试数据”豁免。
- 开发者诊断页必须有独立权限、独立路由和明确受众，不得混入普通用户验收路径；若业务确需显示技术标识，应建立明确承诺和人工复核证据。
