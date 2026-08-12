# 页面生产与交付契约

本契约用于用户明确要求真实页面、可运行原型或阶段页面交付时，把设计事实转成可核验的页面交付证据。普通设计咨询、方向讨论和一次性静态预览不要求创建 Page Delivery Manifest。

## 权责边界

- 设计顾问负责设计系统、Composition Kit、页面状态与交互契约、真实页面文件、预览信息和验证证据。
- `preview.startCommand` 只记录建议命令。设计顾问的校验器不会启动服务；服务只能由用户或明确的 host runner 启动，再把外部 `baseUrl` 写回清单。
- 通用核心不记录套包阶段、`page-ledger`、`page-chief` 或 `page-delivery-<slug>.md` 等流程字段。套包适配器读取本清单并转换成自己的台账和交付格式。
- S2 替代 03-02 时，套包仍负责阶段判断、循环次数、用户确认和前后门禁；设计顾问只在被路由后承担页面生产。

## 文件位置与状态

从 `templates/page-delivery-manifest.example.json` 创建项目文件，建议保存为：

```text
design-system/page-delivery.json
```

状态只有两种：

- `draft`：可以尚未有页面、地址或验证证据，用于记录计划和待确认项。
- `confirmed`：必须有真实页面文件、可访问的外部预览地址、通过的浏览器证据、明确 mock 范围和验收承诺 ID。

不能用“代码已生成”“命令看起来正确”或静态截图代替 confirmed 条件。

## confirmed 门禁

确认前逐项满足：

1. `projectRoot` 是真实目录，`pages` 至少一项，每项有唯一 `id`、唯一 `route` 和存在的页面文件。
2. `preview.baseUrl` 是用户或 host runner 已启动服务的 HTTP(S) 地址，`startedBy` 记录实际启动方。
3. `preview.verification` 为 `passed`，且至少有一条带 URL 的 `browser` 证据；按项目范围补充桌面、移动、主题、键盘和关键状态。
4. `mockScope` 必须显式存在。没有 mock 时写空数组；有 mock 时说明模拟内容和受影响页面，禁止把 mock 当成真实后端能力。
5. `commitmentIds` 至少一项，并可在项目的产品验收承诺中追踪。
6. 页面必须使用已确认 Token 和共享组件入口；`contract-only` family 需明确项目实现或 adapter，不得声称 skill 已提供运行时。

## 校验

```powershell
node <skill-path>/scripts/page-delivery-contract.mjs check --manifest C:\fixtures\consumer-demo\design-system\page-delivery.json --host-root C:\fixtures\consumer-demo
```

校验器只读取 JSON、目录、页面文件和证据，不执行 `startCommand`，也不修改项目。

## 套包 S2 适配要求

适配器可从通用清单读取：项目 slug、来源、设计系统路径、项目根目录、页面 ID/路由/文件、预览地址、mock 范围、Composition Kit 和承诺 ID。随后由套包自己的 S2 负责人：

- 更新原页面台账；
- 生成兼容的 `page-delivery-<slug>.md`；
- 把真实预览地址传给用户确认；
- 在 `page-explainer` 前确认页面方向已完成；
- 保留 foundation、PRD 及后续阶段原有读取顺序。

适配器不得反向把套包路由状态写进设计顾问核心，也不得把 draft 清单转换成“已确认交付”。
