# 设计系统 Intake

本文件用于解决一个常见问题：AI 在资料不足时直接产出看似完整的 `DESIGN.md` 和 token。项目本地视觉系统目录可以先按通用基线创建，但其中的独特品牌、token 和组件决策需要输入、候选、预览和工程守门；资料不足时必须保持草案。

如果项目已有成体系 token、共享组件、主题机制或设计资产，本 Intake 只能补充未知信息；先执行既有系统事实提取，并由用户确认 `preserve / augment / migrate`，不得初始化平行系统或自动迁移。

## 先判断产品类型

在进入 `design-system` 前，先标记产品类型。一个项目可以命中多个类型。

| 类型 | 信号 | 默认策略 |
| --- | --- | --- |
| `admin-data-workspace` | 筛选、长表、分页、批量操作、运营后台 | compact、浅色优先、表格/卡片双形态、状态完整 |
| `external-portal` | 客户、经销商、合作伙伴可见 | standard、轻品牌、导航和状态清晰 |
| `host-native-plugin` | Obsidian、VS Code、浏览器插件、企业套件内嵌 | 先像宿主，品牌克制 |
| `agent-process-ui` | 助手、工具调用、审批、产物、过程展开 | 使用统一过程信息语法 |
| `marketing-demo` | 销售演示、招商、官网、发布物料 | 可升级品牌系统，但必须有品牌资产和正反例 |
| `consumer-product` | 发现、内容、交易、预约、订阅、账户或移动端任务 | 选择主产品类型，补齐旅程、信任、状态和恢复契约 |
| `growth-conversion` | 获客、演示、定价、留资、候补或下载 | 先证据后 CTA，明确移动退化与反暗黑模式 |
| `one-off-report` | 一次性分析、短期活动、临时报表 | default，不创建完整设计系统 |

## 必需输入

将 `design-system/DESIGN.md` 从初始草案升级为正式决策前，尽量收集：

- 产品一句话定义。
- 目标用户和角色。
- 使用场景：内部、客户、公众、宿主环境、销售演示。
- 维护周期：一次性、短期、长期。
- 页面类型和关键流程。
- 现有品牌资产：Logo、主色、字体、历史页面、图标。
- 正例和反例：至少各 1 个，避免只用“高级、现代、简洁”。
- 技术栈和组件库：React、Vue、shadcn、Radix、Ant Design、宿主 API 等。
- 主题要求：浅色、暗色、跟随系统、跟随宿主。
- 可访问性、移动端、性能、国际化等硬约束。
- C 端 `product_archetype`、`journey_stage`、`growth_pattern`、`trust_evidence` 与 `mobile_navigation`。
- 交易相关 `transaction_state` 和失败后的 `recovery_state`；身份、支付、预约或订阅行为不确定时必须请用户确认。

## 资料不足时的输出边界

如果缺少品牌资产、页面范围或正反例，不要最终确定：

- 主色。
- 字体。
- Logo 或品牌图形。
- 完整 token。
- 完整组件库。

可以输出：

- 当前判断。
- 缺口清单。
- 设计系统草案。
- 默认视觉系统的临时落地方案。
- 需要用户确认的 1 个关键问题。

## 组件候选决策

当用户要沉淀组件库时，先用 `templates/component-decisions.json` 记录候选状态：

- `keep`：进入首批规范，可写入 token、组件和模板。
- `adjust`：进入候选画板或 HTML 预览，但不能作为最终规范。
- `hold`：暂缓，不得被偷偷抽成公共 token 或样式。

规则：

- 不从 `hold` 组件抽公共样式。
- `adjust` 组件可以被讨论，但不能阻塞当前产品交付。
- 每次新增 `keep` 组件，都要说明复用场景和禁止滥用场景。

## 输出模板

```markdown
判断：design-system 草案

产品类型：
- external-portal
- admin-data-workspace

C 端补充字段：
- product_archetype: [主类型 + 最多两个叠加类型]
- journey_stage: [acquire/discover/evaluate/transact/use/retain/recover]
- growth_pattern: [无或稳定模式 ID]
- trust_evidence: [当前决定前必须可见的证据]
- mobile_navigation: [底部/顶部/任务式/内容式 + 返回规则]
- transaction_state: [none/preparing/review/processing/confirmed/failed/reversed]
- recovery_state: [失败、登录回跳和返回时保留什么]

资料完整度：
- 已知：目标用户、页面类型、Logo、主色
- 缺少：反例、移动端范围、暗色模式要求

当前能确定：
- 页面密度：standard
- 组件基线：Button / Field / Table / Dialog / Status
- 预览建议：需要，用于确认客户门户首页和工单详情状态

不能最终确定：
- 完整色板
- 字体系统
- 品牌插画或图标风格

下一步只问一个问题：
请给我 1 个你认为“像我们”的旧页面或参考产品，以及 1 个明确不要像的反例。
```
