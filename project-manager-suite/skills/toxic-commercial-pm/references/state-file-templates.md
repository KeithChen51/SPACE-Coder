# Host File Mapping Notes

`toxic-commercial-pm` 默认不创建 `toxic-commercial-pm-state/` 这类 skill 私有状态目录。

优先读取这些宿主文件作为状态来源：

1. `project-profile.md`
2. `execution-plan.md`
3. 已存在的 BRD 草稿或需求摘要

如果需要向用户展示“已锁定决策 / 当前缺口 / 方法依据”，使用紧凑摘要即可。推荐摘要结构如下：

```md
# 本轮收敛摘要

## 已锁定
- 商业目标与时间窗口：
- 目标用户与核心场景：
- 核心价值主张：
- 核心流程：
- MVP In/Out Scope：
- 页面定位（如适用）：

## 当前缺口
- 待补字段：
- 下一题优先级：

## 方法依据
- 决策主题：
  - 方法依据：
  - 关键推导：
  - 结论：
  - 待验证：
```
