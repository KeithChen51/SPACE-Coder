# Phase 3: 交互描述

> 本文件在进入 Phase 3 时由 SKILL.md 指令加载。

## 目标

逐页产出结构化交互语义，同步执行方法论四条线识别交互盲区。

## 执行步骤

对 page-delivery 中列出的每个页面：

1. **读取页面代码**：从 delivery 中的文件路径读取 Vue 3 组件代码
2. **分模块描述页面**：用大白话介绍这个页面由哪些模块组成，每个模块长什么样，页面目的与覆盖角色
3. **逐模块产出语义条目**：对每个模块中的每个可交互元素，填写完整的结构化字段（id/actor/trigger/system_behavior/fallback/status 等）
4. **逐元素解释检查**：是否有说不清的元素？说不清的产出 `clarification` 类型差异，主动问用户
5. **正向追踪检查**：从流程文件中该页面涉及的流程出发，每一步是否都能落在具体元素上？走不通 = `design_gap`
6. **CRUD 完整性检查**（仅对管理实体的页面执行，如列表页/表单页/实体详情编辑页；dashboard、只读详情页、审批页、流程页、数据报表页跳过）：该页面涉及的业务实体，增删改查是否齐全？缺失 = `design_gap`
7. **业务态覆盖检查**：每个语义条目的 `fallback` 字段是否覆盖了可能的业务态？未覆盖 = `design_gap`

## 产物结构

文件名：`explainer-b-interaction-<slug>.md`

模板：读取 `templates/interaction.md`

## 差异文件结构

文件名：`explainer-b-gap-<slug>.md`

仅在发现差异时产出。模板：读取 `templates/gap.md`

## 冻结流程

1. 所有语义条目产出后，初始 status 为 `open`
2. 向用户展示，逐条或批量确认
3. 用户确认后标记为 `locked`
4. 全部 locked 后 Phase 完成
