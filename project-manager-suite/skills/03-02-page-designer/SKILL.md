---
name: page-designer
description: S2 页面设计与页面交付执行器。page-designer 仍是套包阶段负责人；design-consultant v0.11 是其内部的设计事实与页面生产核心。
---

# Page Designer（S2 适配器）

## 1. 责任边界

`page-designer` 仍负责 S2 的正式交付和套包门禁：读取 BRD 与技术栈、维护页面台账、询问截图、调用设计顾问完成设计系统和页面生产、要求用户确认页面方向、生成兼容的 `page-delivery-<slug>.md`，并把交付交给 `page-explainer`。

设计顾问 v0.11 是 `page-designer` 的内部设计与页面生产核心，不是第二个项目调度器。它负责设计事实、Token、组件契约、Composition Kit、页面状态、预览证据和通用 Page Delivery Manifest；它不负责套包阶段判断、台账、用户确认、回环计数或下游路由。

硬性原则：

- 阶段负责人仍是 `page-designer`；`ai-project-manager -> page-chief -> page-designer -> page-explainer` 路由不变。
- v0.11 的 `design-system/DESIGN.md`、`tokens/`、`components/manifest.json`、`system.config.json` 和 `design-system/page-delivery.json` 是新项目的设计事实源。
- 旧项目已经存在的 `design-system/<slug>/MASTER.md` 只能作为兼容输入读取；不得因为加载设计顾问而初始化第二套平行事实源。
- stack CSV、旧的 `search.py` 和 React 性能参考只提供实现兼容指导，不得覆盖 BRD、宿主技术栈或已确认的设计事实。

## 2. 启动前门禁

每次启动先查询台账：

```bash
node <suite-path>/skills/03-02-page-designer/scripts/page-ledger-query.mjs status --host-dir <host>/
```

随后执行 boot，确认唯一台账和 BRD：

```bash
node <suite-path>/skills/03-02-page-designer/scripts/page-ledger-mutate.mjs boot --host-dir <host>/
```

必须满足：

1. `docs/brd/BRD-<slug>-*.md` 存在；同一目录不得混有多个不同 slug 的 BRD。
2. 台账位于 `<host>/src/frontend/page-preview/page-ledger-<slug>.json`；旧项目尚未迁移时，才允许脚本回退到旧目录。
3. 从宿主项目配置或 `skills/00-01-ai-project-manager/references/defaults/tech-stack.md` 读取技术栈；不得硬编码框架、UI 库或运行命令。
4. 询问用户是否有参考截图。无截图也必须记录问询结果；有截图时，文件放在 `<host>/src/frontend/page-preview/screenshots/`。
5. 台账 `screenshotAsked` 为 `true` 后，才可把 phase `0` 推进到 phase `1`。

```bash
node <suite-path>/skills/03-02-page-designer/scripts/page-ledger-mutate.mjs mark-asked --host-dir <host>/ --field screenshot
node <suite-path>/skills/03-02-page-designer/scripts/page-ledger-mutate.mjs advance --host-dir <host>/ --to 1
```

BRD、台账或技术栈缺失时中止，不以设计顾问默认值代替上游正式输入。

## 3. 设计顾问 v0.11 的调用方式

phase `1` 到 `3` 之间调用设计顾问完成设计系统和页面生产。通用核心必须读取 BRD、宿主技术栈和既有视觉系统事实，并按 `preserve / augment / migrate` 结论工作。

核心工作顺序：

1. 判断项目属于后台、数据工作台、营销页、C 端产品、Agent UI 或宿主原生界面，并加载相应模板、旅程、增长和无障碍约束。
2. 先识别既有 Token、共享组件、主题机制和视觉资产；已存在的系统优先保留或增强，迁移方案必须等用户确认。
3. 建立或更新项目级 `design-system/`，其中 `DESIGN.md` 是设计判断，`tokens/` 是 Token 源，`components/manifest.json` 是组件索引，`system.config.json` 记录真实运行时入口。
4. 生成真实前端页面和 `design-system/page-delivery.json`。页面必须包含真实路由、真实文件、状态覆盖、响应式/主题/键盘/可访问性约束、mock 范围、Composition Kit 和稳定承诺 ID。
5. 使用宿主实际技术栈映射实现。设计顾问的 React runtime 或 contract-only family 不得被表述为宿主已有 Vue/Svelte/其他框架实现；需要时由宿主适配器承接。

仍可按需读取旧 stack 参考：

```bash
python3 <suite-path>/skills/03-02-page-designer/scripts/search.py "<英文关键词>" --design-system -p "<project-slug>"
python3 <suite-path>/skills/03-02-page-designer/scripts/search.py "<英文关键词>" --design-system --persist -p "<project-slug>" --output-dir <宿主项目>
python3 <suite-path>/skills/03-02-page-designer/scripts/search.py "<英文关键词>" --domain ux
python3 <suite-path>/skills/03-02-page-designer/scripts/search.py "layout responsive form" --stack <tech-stack.md 对应的 stack>
```

搜索关键词使用英文；`-p` 必须传 BRD slug，不传中文显示名。上述脚本只作为兼容参考，不得重新成为设计事实源。

## 4. S2 交付流程

套包只允许沿用以下顺序；设计顾问不能跳过任何门禁：

```text
ledger 0
  -> 询问截图并记录 screenshotAsked
  -> ledger 1
  -> 加载 design-consultant v0.11，创建/更新 canonical design-system
  -> 生成真实页面和 design-system/page-delivery.json（draft）
  -> 宿主或用户自行启动预览，记录 preview.baseUrl 和浏览器证据
  -> 用户逐页明确确认页面方向
  -> 将通用清单更新为 confirmed
  -> ledger 3
  -> 运行 page-delivery-adapter，生成 legacy page-delivery-<slug>.md
  -> ledger 4
  -> 调用 page-explainer 冻结流程和交互语义
```

### 4.1 草稿与确认

`draft` 只能表示计划或待确认状态，不能生成正式 legacy delivery。只有同时满足以下条件时，才可把清单标记为 `confirmed`：

- 每个页面都有唯一 `id`、`route` 和实际存在的文件；
- `projectRoot`、项目设计系统路径和宿主技术栈可追溯；
- 用户或明确的 host runner 已启动预览，`preview.baseUrl` 是 HTTP(S) 地址；
- `preview.verification` 为 `passed`，且至少有通过的浏览器证据；
- mock 范围是显式数组，不能把 mock 宣称为真实后端能力；
- Composition Kit 和承诺 ID 已记录，承诺可在后续实现和测试中追踪；
- 用户确认依据以非空文字传给适配器，并写入 legacy delivery。

适配器命令：

```bash
node <suite-path>/skills/03-02-page-designer/scripts/page-delivery-adapter.mjs build \
  --manifest <host>/design-system/page-delivery.json \
  --host-dir <host>/ \
  --confirmation-evidence "用户于浏览器预览后确认页面方向" \
  --tech-stack-source "<宿主技术栈文件或可追溯标签>"
```

适配器只接受 confirmed manifest、phase-3 台账、匹配的 BRD slug 和 `screenshotAsked: true`。它从上游校验器的 `resolvedFiles` 获取页面绝对路径，写入 `<host>/src/frontend/page-preview/page-delivery-<slug>.md`，采用临时文件后 rename 的原子写入方式。

交付清单中的机器记录使用唯一的 HTML 注释 `<!-- page-delivery-adapter:v0.11;base64:<payload> -->`；`<payload>` 是 UTF-8 JSON 的标准 Base64。后续 route-check 或下游工具读取时，应按该前缀解码，不要把注释内容当作可直接执行的 Markdown 或 JSON。

### 4.2 预览与适配器边界

- `preview.startCommand` 只能作为记录写入交付清单；适配器和设计顾问校验器都不得执行它。
- 预览服务由用户或明确的 host runner 启动，并把真实地址和证据写回通用清单。
- 适配器不写台账、不写全局套包状态、不调用 `page-chief`，也不把 draft 转成 confirmed。
- 适配器运行完成后，仍由既有 `page-ledger-mutate.mjs advance --to 4` 负责 phase `3 -> 4`；适配器不得自行修改 `page-ledger-<slug>.json`。

## 5. 兼容交付物

### 5.1 legacy page-delivery

`page-delivery-<slug>.md` 是套包下游的唯一页面索引入口，至少包含：

- BRD、通用清单、技术栈来源、项目工程目录和设计系统的绝对路径；
- 页面名称、路由、页面文件绝对路径和确认状态；
- 预览启动命令（仅记录）、访问地址、启动者、验证状态、浏览器证据和证据文件；
- 明确的 mock 范围；
- `design-system/DESIGN.md` 或宿主已确认的设计系统路径；
- Composition Kit、组件契约边界和稳定承诺 ID；
- 供 `page-explainer`、`foundation-builder`、`prd-writer` 读取的下游说明。

页面表头必须保持：

```markdown
| 页面 | 路由 | 文件路径 | 状态 |
| --- | --- | --- | --- |
```

下游仍从 `src/frontend/page-preview/` 读取交付清单。页面代码位于 `<host>/<工程名>/`，不要把代码塞进 `page-preview/`。

### 5.2 设计系统兼容策略

- 新项目：以 `design-system/DESIGN.md`、Token、组件清单和通用 manifest 为权威。
- 已有项目：先审计既有系统；`MASTER.md` 只能作为旧项目兼容输入，禁止与 canonical system 并行争夺权威。
- 迁移或增强：先记录事实和建议，等待用户确认后再改写宿主系统。

## 6. 回环与断点恢复

`page-chief` 只判断是否需要回环并提示重新执行 `page-designer`，不直接修改台账。回环必须由台账命令驱动：

```bash
node <suite-path>/skills/03-02-page-designer/scripts/page-ledger-mutate.mjs start-loop \
  --host-dir <host>/ \
  --gap-files <absolute-gap-file-1>,<absolute-gap-file-2>
```

该命令只允许从 phase `4` 开始，将 `loopRound` 加一、记录本轮消费的 gap 文件，并把 phase 置回 `1`。重新执行时：

1. 先 `boot` 和 `status`；
2. 读取台账中的 `gapFilesConsumed`，只消费本轮实际文件；
3. 重新执行设计顾问的系统/页面生产；
4. 重新完成预览证据、用户确认、manifest confirmed、phase `3`、适配器和 phase `4`。

已解决或仅为 `clarification`/`out_of_scope` 的 gap 不触发回环。会话重启按台账 phase 恢复：`0` 回到输入门禁，`1` 回到设计/页面生产，`3` 回到交付适配，`4` 进入回环判断。

## 7. 完成标记与禁止事项

每次回复前读取台账并报告：

```text
【Skill 状态】page-designer | phase=<N> | loop=<N> | RUNNING
```

阶段完成但尚未推进台账时使用 `PHASE_DONE`；legacy delivery 已生成且 phase `4` 已由台账命令确认后才使用 `DONE`。

禁止：

1. 没有 BRD 或技术栈来源就开始页面设计；
2. 以设计顾问默认视觉系统代替宿主已有系统事实；
3. 仅有截图、静态 HTML 或“命令看起来正确”就把 manifest 标记 confirmed；
4. 让适配器执行 `preview.startCommand`、调用 page-chief 或写全局路由状态；
5. 让适配器直接推进或修改 page ledger；
6. 把 contract-only 组件、mock 数据或 React runtime 宣称为宿主已有运行时能力；
7. 生成没有真实绝对文件路径、预览证据、mock 范围或承诺 ID 的交付清单；
8. 因替换设计知识库而改变 `page-chief`、`page-explainer`、foundation 或 PRD 的正式交接协议。

## 8. 质量红线

- 页面文件真实存在，可从浏览器预览中操作；
- 桌面与移动视口、浅色与深色主题（如项目支持）、loading/empty/error/success/disabled 等相关状态有证据；
- 键盘操作、焦点、语义 HTML、对比度和 reduced motion 约束明确；
- 页面使用确认的 Token 和共享组件，不散落硬编码样式；
- 图表记录分析问题、口径、颜色语义和无障碍替代；
- 品牌署名位置遵循项目事实，不因套包默认值自动展示；
- 下游能按同一 slug 找到 BRD、page delivery、页面代码、explainer 和后续 foundation/PRD 产物。
