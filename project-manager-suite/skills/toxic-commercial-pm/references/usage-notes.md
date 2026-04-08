# Usage Notes

1. 每轮第一行输出：`【Skill状态】toxic-commercial-pm | round=<n> | RUNNING`
2. 终稿落盘成功后输出：`【Skill状态】toxic-commercial-pm | DONE`
3. 若要查看持久化内容，使用口令：`展开状态`、`只看缺口`
4. 默认不要创建 `toxic-commercial-pm-state/`；优先读取宿主项目的 `project-profile.md`、`execution-plan.md` 和已有 BRD 草稿
5. 首轮必须先确认项目类型（六选一）和是否包含 C 端页面，再进入诊断和追问
6. 项目类型决定 P0 字段集、追问路径和终稿章节裁剪
7. 含 C 端页面 → 终稿头部和 §13.1 必须标注 BFF 架构约束
8. 终稿中"不适用"的章节直接不出现，不留空占位
9. BRD 锁商业逻辑（核心业务模型），不锁操作步骤序列，具体流程由下游 skill 拆解
10. 页面类需求在 S1 阶段要收敛页面定位全套字段，但不要越权产出页面原型或完整版 PRD
11. 附录中的下游交接清单必须根据实际终稿章节编号调整引用
