# Phase 3/4: 交互描述

> 本文件在进入 Phase 3（C 端或 B 端交互描述）时由 SKILL.md 指令加载。Phase 4（C+B 项目的 B 端）复用本文件。

## 目标

逐页产出结构化交互语义，同步执行方法论四条线识别交互盲区。

## 执行步骤

对 page-delivery 中列出的每个页面：

1. **读取页面代码**：从 delivery 中的文件路径读取 Vue 3 组件代码
2. **分模块描述页面**：用大白话介绍这个页面由哪些模块组成，每个模块长什么样，页面目的与覆盖角色
3. **逐模块产出语义条目**：对每个模块中的每个可交互元素，填写完整的结构化字段（id/actor/trigger/system_behavior/fallback/status 等）
4. **逐元素解释检查**：是否有说不清的元素？说不清的产出 `clarification` 类型差异，主动问用户
5. **正向追踪检查**：从流程文件中该页面涉及的流程出发，每一步是否都能落在具体元素上？走不通 = `design_gap`
6. **CRUD 完整性检查**：该页面涉及的业务实体，增删改查是否齐全？缺失 = `design_gap`
7. **业务态覆盖检查**：每个语义条目的 `fallback` 字段是否覆盖了可能的业务态？未覆盖 = `design_gap`

## 产物结构

文件名：`explainer-c-interaction-<slug>.md` 或 `explainer-b-interaction-<slug>.md`

```markdown
# <C端/B端> 交互描述 - <项目名称>

> 生成时间: YYYY-MM-DD HH:MM
> Skill: page-explainer
> 依据: page-delivery + 页面代码

## <页面名称>

> 路由: <路由>
> 文件: <文件路径>
> 页面目的: <一句话>
> 覆盖角色: <角色列表>

### 页面描述

本页面由以下模块组成：

**<模块1名称>**: <用大白话描述这个模块长什么样、包含什么内容>

**<模块2名称>**: <同上>

### 交互语义

#### <模块1名称>

| id | actor | source_page | source_module | source_element | precondition | trigger | system_behavior | user_visible_result | validation | permission | fallback | status |
|----|-------|-------------|---------------|----------------|-------------|---------|-----------------|---------------------|------------|------------|----------|--------|
| order-list.filter.status-dropdown.1 | 运营人员 | /admin/orders | 筛选栏 | 状态下拉框 | none | 选择 | 按所选状态筛选列表 | 列表刷新，仅显示该状态的订单 | none | all | 空数据态: 显示「暂无该状态的订单」 | open |

#### <模块2名称>
<!-- 同上 -->

---

## <下一个页面>
<!-- 同上结构 -->
```

## 差异文件结构

文件名：`explainer-c-gap-<slug>.md` 或 `explainer-b-gap-<slug>.md`

仅在发现差异时产出。

```markdown
# <C端/B端> 交互差异 - <项目名称>

> 生成时间: YYYY-MM-DD HH:MM
> Skill: page-explainer

## 差异清单

### GAP-001: <简述>

- **分类**: `design_gap` / `logic_conflict` / `clarification` / `out_of_scope`
- **所在页面**: <页面名> (<路由>)
- **所在模块**: <模块名>
- **所在元素**: <元素名>
- **现状**: <当前页面是什么情况>
- **预期**: <合理的交互预期是什么>
- **修改建议**: <具体建议 page-designer 怎么改>

### GAP-002: <简述>
<!-- 同上 -->
```

## 冻结流程

1. 所有语义条目产出后，初始 status 为 `open`
2. 向用户展示，逐条或批量确认
3. 用户确认后标记为 `locked`
4. 全部 locked 后 Phase 完成
