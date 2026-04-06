# AI PM Tool Tests

本目录存放 `ai-project-manager` 脚本化能力的最小测试样例。

当前覆盖范围：

- `validate-global-files.mjs`
- `route-check.mjs`
- `generate-host-rules.mjs`
- `bootstrap-host.mjs`
- `install-suite-into-host.mjs`
- `devlog-sync.mjs`
- `check-protocol-alignment.mjs`

运行方式：

```bash
cd project-manager-suite
npm run test:ai-pm
```

说明：

- 使用 Node 原生测试运行器，不引入额外依赖
- 测试基于临时宿主目录执行，不依赖真实业务项目目录
- 当前属于第一版最小测试链路，重点覆盖主链路和高风险写入动作

## 什么时候使用

以下场景建议主动运行这组测试：

- 改了协议层之后  
  例如修改 `SKILL.md`、`runtime.md`、`global-files-protocol.md`、`routing.md`，或调整 `lib/ai-pm-protocol/` 下的字段、阶段、路由配置。

- 改了工具脚本之后  
  例如修改 `route-check.mjs`、`bootstrap-host.mjs`、`install-suite-into-host.mjs`、`devlog-sync.mjs`、`validate-global-files.mjs`。

- 一轮脚本化改造准备收口时  
  当你觉得“这轮改完了”，需要用测试确认主链路没有被改坏。

- 怀疑出现回归时  
  例如发现阶段门禁失效、骨架补齐异常、日志没有正确追加时，可以先跑测试判断是不是主链路已经被破坏。

- 后续 AI 接手维护时  
  AI 改完协议或脚本后，不应只看文档判断，应跑一遍测试确认行为仍成立。

## 典型使用场景

### 场景 1：新增字段

例子：

- 你给页面任务新增了一个必须补齐的字段
- 先改协议文档
- 再改 `field-contracts.js`
- 如果 `route-check.mjs` 需要消费它，再改脚本
- 改完后运行测试，确认原有门禁没有被破坏

### 场景 2：修阶段门禁

例子：

- 你修复“阶段切换前必须先日志回写”的判断逻辑
- 改完 `route-check.mjs` 后，运行测试确认：
  - 该拦的时候仍然会拦
  - 其他主链路行为没有被顺手改坏

### 场景 3：调整骨架补齐逻辑

例子：

- 你修改了 `bootstrap-host.mjs`
- 想确认容器目录识别、规则目录补齐、模板延后创建仍然成立
- 这时应该立刻跑测试，而不是只看代码

### 场景 4：调整日志回写能力

例子：

- 你修改了 `devlog-sync.mjs`
- 想确认：
  - 第一次会建日志
  - 第二次会追加而不是覆盖
  - 命中规则升级信号时仍会更新候选池

### 场景 5：提交前最小验收

例子：

- 这次同时改了协议层和 2 个工具脚本
- 在提交或结束这一轮修改前，运行一次测试，把它作为最小验收动作

### 场景 6：修改协议映射关系

例子：

- 你改了协议文件里的“对应实现与执行入口”
- 或者你给结构化实现文件新增 / 修改了 Traceability 头
- 这时应该运行测试，确认协议文档和结构化实现之间仍然双向对齐

## 一句话原则

只要你改的是“协议、脚本、bootstrap 执行链、主链路行为”，就应该跑这组测试。

## 补充命令

如果你只想单独检查“协议文档 ↔ 结构化实现”是否仍然对齐，可直接运行：

```bash
cd project-manager-suite
node tools/check-protocol-alignment.mjs
```
