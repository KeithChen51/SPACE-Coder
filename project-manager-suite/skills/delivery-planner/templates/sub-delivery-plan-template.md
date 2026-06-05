# T0.1 Demo Sub Delivery Plan

## 任务来源

- 主开发计划：[main-delivery-plan-demo.md](main-delivery-plan-demo.md)
- 任务看板：[task-kanban-demo.md](task-kanban-demo.md)

#### T0.1 实现演示任务

**Requirement ID**：REQ-DEMO-001

**PRD 双链·读**：
- `mainprd-demo.md` §1

**核心逻辑**：
- 根据 PRD 处理演示任务。

**核心文件**：
- `src/demo.js`

**完成标准**：
- 运行 `node src/demo.js` 输出 demo-ok。

**Verification Method**：
- 执行 `node src/demo.js`。

**Evidence**：
- `logs/demo-task.md`

**Failure Handling**：
- PRD 或核心文件定位不到时阻塞。

**Owner**：AI 执行 -> 人审核

**前置**：无

**状态**：待开发
