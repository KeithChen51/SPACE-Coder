# Changelog

> 本文件是套件版本历史的**唯一权威源**。README 顶部的版本声明行与「版本历史」表由
> `tools/sync-suite-version.mjs` 从这里渲染，`package.json` 的 `version` 字段也由它同步；
> 三处一致性由 `tests/suite-version.test.mjs` 做测试门禁。
>
> 写法约定：开发中的变更先记在 `## [Unreleased]` 段；发版时运行
> `node <suite-path>/tools/sync-suite-version.mjs --release <版本号>` 固化为版本条目并自动同步 README。
> 每个版本条目的第一个非列表段落会被用作 README 版本历史表的「变更摘要」。

## [Unreleased]

（暂无未发布变更）

## [2.2] - 2026-08-31
套件新增贯穿需求、设计、开发和验收的内建设计治理能力：从早期设计判断、既有系统继承，到页面交付、实现约束和 UI 验收，统一在原有 S0–S6 流水线内完成，不增加新的主入口或阶段负责人。

- S0/S1 的设计决策、S0.5 的既有系统审计、S3 的设计约束、S4 的 UI 实现检查，以及 S5/S6 的 UI 验收输入与证据，均作为原阶段的内建伴随能力按信号启用，不改变既有阶段负责人和正式产物。
- S2 页面生产原生包含设计治理：`page-designer` 统一维护项目 `design-system/` 事实源，用户确认后的通用 `page-delivery.json` 经 S2 adapter 生成下游兼容的 `page-delivery-<slug>.md`；同时强化用户确认、台账 phase 4 与 `page-explainer` 的页面收口门禁。
- “SPACE AI Native”品牌署名纳入套包内建设计系统：视觉系统确认前保持 `deferred`，不展示、不提问，也不参与色板决策；确认后根据背景、重点色、明暗模式和界面密度给出一个首选样式与安全 fallback，待产品结构基本确认后再推荐桌面、移动及认证 / 授权场景的落位。用户确认结果统一写入 `system.config.json`、`DESIGN.md` 与 token；组件同时约束响应式迁移、单视口仅一个实例、无障碍与正式字形蒙版，业务页面不得散传配置、使用 UI 字体替代或自行重绘。
- 内建设计规则基线升级至 v0.11.2：补齐外部路由硬停止、既有系统建议确认契约、internal/admin 设计系统继承规则，以及混合和嵌套 JSX 中内部数据值与工程文案的检查；评测、source tests 和维护过程产物仍只保留在 source，不进入发布套包。
- 套件内建设计能力的物理实现统一收口到 `skills/00-05-design-consultant/`：同步路由、adapter、文档、导入锁和测试路径；导入锁升级为可验证的 relocation overlay，既保留上游 v0.11.2 原始摘要，又校验套件内编号化路径替换；固定包内文本为 LF，避免 Windows checkout 误触发字节锁；新增顶层 skill 目录 `NN-NN-*` 命名门禁。
- 升级提醒：正式 2.1 尚未包含这套设计治理能力，直接升级不会产生旧目录；若宿主曾安装 2.1 之后的未发布 `main` 构建，增量同步会将原 `skills/design-consultant/` 列入 `Stale files`，但不会自动删除。确认旧目录没有宿主手工改动后再删除，或在确认整套安装目录可覆盖时使用 `install-suite-into-host.mjs --force` 做干净安装。
- 版本同步门禁改为精确支持 `X.Y` 与 `X.Y.Z`：发布补丁版本时同步更新 README 与 `package.json` 的完整版本号，并拒绝只在 patch 位发生的版本漂移及含糊格式。
- 进度页逐帧仿真评审修复：计划就绪待开工不再误报“受阻/状态对不上”（下一步改为提示“开工”）；全部完成后驾驶舱指针置空（`missing_cockpit_active_task`）纳入良性码；“等你拍板”过滤“无/暂无”伪空项；S2 页面子环节新增“草稿待确认”中间态；收尾态遇安全 WAIVER 时标题行提示有条件放行与豁免时限；警示横幅去除 skill 黑话；`runtime.md` 增补“用户可见字段用业务白话回写”指引。

## [2.1] - 2026-07-16
- 新增进度可视化：宿主根目录 `项目进度.html`（可重建编译产物），聚合阶段轨道、当前开发功能点、门禁卡点、质量与安全指标；bootstrap 初始化、主入口每轮回写、devlog 收口、会话启动四个时机自动刷新（`lib/progress-dashboard/` + `tools/render-progress-dashboard.mjs`）
- route-check 的 `context` 增补 `profileSummary`（项目名/一句话目标，additive）
- 新增版本 changelog 同步链：`CHANGELOG.md` 权威源 + `tools/sync-suite-version.mjs`（--check / --release）+ 版本一致性测试门禁

## [2.0] - 2026-07-10

全套件审计修复版。基于 51 项经真实执行核实的审计发现做系统性修复：模板与校验器对齐（S4 一致性门禁、prd-check 拆分模式、feature-list 编号）、脚本命令统一 `<suite-path>` 路径约定、foundation 目录契约统一为 `docs/prd/foundation/`、brd-writer 生命周期护栏（init 重入保护、栈式回滚、DONE 态保护）、baseline 按行合并保留用户确认字段、PIPELINE 补齐 S6/S7 契约、hooks 注入链路修通、清理历史项目泄漏词。测试 112/112 通过，6 个沙箱场景真实复现验证全部通过。

## [1.x] - 2026-04 ～ 2026-07

初始版本：S0–S5 主流水线、调度层（page-chief / prd-chief / test-case-chief）、协议脚本化（route-check / bootstrap / ledger 工具链）、既有项目接入旁路（S0.5 baseline）逐步成形。
