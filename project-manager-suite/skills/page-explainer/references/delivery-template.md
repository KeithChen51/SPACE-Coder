# 回环判断与交付

> 本文件在进入最终 Phase（回环判断）时由 SKILL.md 指令加载。

## 触发条件

所有交互描述和权限矩阵完成并获用户确认后进入。

## 回环判断流程

1. 检查是否存在差异文件（`explainer-c-gap-<slug>.md` 和/或 `explainer-b-gap-<slug>.md`）
2. **存在差异文件**：
   - 筛选非 `resolved` 和非 `out_of_scope` 的差异条目
   - 按分类汇总：`design_gap` N 条、`logic_conflict` N 条、`clarification` N 条
   - 若存在 `design_gap` 或 `logic_conflict`：主动建议回环 page-designer，展示具体条目
   - 若仅剩 `clarification`：向用户提问，获得答案后转为语义条目或标记 `resolved`
   - 用户确认回环后，保留差异文件供 page-designer 消费
   - 用户拒绝回环后，将对应差异条目标记为 `resolved | reason: user-declined`，标记完成
3. **不存在差异文件**：直接标记完成

## 回环后复查

page-designer 修改完页面后重新进入 page-explainer 时：
1. 仅复查差异文件中 `design_gap` 和 `logic_conflict` 类型的条目涉及的页面和交互
2. 差异已闭环：将对应条目分类改为 `resolved`
3. 仍有差异：更新差异文件，再次建议回环

## 完成后状态标记

```
【Skill状态】page-explainer | DONE
```
