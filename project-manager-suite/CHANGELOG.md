# Changelog

> 本文件是套件版本历史的**唯一权威源**。README 顶部的版本声明行与「版本历史」表由
> `tools/sync-suite-version.mjs` 从这里渲染，`package.json` 的 `version` 字段也由它同步；
> 三处一致性由 `tests/suite-version.test.mjs` 做测试门禁。
>
> 写法约定：开发中的变更先记在 `## [Unreleased]` 段；发版时运行
> `node <suite-path>/tools/sync-suite-version.mjs --release <版本号>` 固化为版本条目并自动同步 README。
> 每个版本条目的第一个非列表段落会被用作 README 版本历史表的「变更摘要」。

## [Unreleased]

- 新增完整 `design-consultant` v0.10 技能包（上游 commit `b7667d9`），保留 references、scripts、templates、vendor 与许可证；本次仅提供能力分发，不修改 `ai-project-manager` 路由，也不替换 `03-02-page-designer`
- 进度页逐帧仿真评审修复：计划就绪待开工不再误报"受阻/状态对不上"（下一步改为提示「开工」）；全部完成后驾驶舱指针置空（missing_cockpit_active_task）纳入良性码；"等你拍板"过滤"无/暂无"伪空项；S2 页面子环节新增"草稿待确认"中间态；收尾态遇安全 WAIVER 时标题行提示有条件放行与豁免时限；警示横幅去 skill 黑话；runtime.md 增补"用户可见字段用业务白话回写"指引

## [2.1] - 2026-07-16
- 新增进度可视化：宿主根目录 `项目进度.html`（可重建编译产物），聚合阶段轨道、当前开发功能点、门禁卡点、质量与安全指标；bootstrap 初始化、主入口每轮回写、devlog 收口、会话启动四个时机自动刷新（`lib/progress-dashboard/` + `tools/render-progress-dashboard.mjs`）
- route-check 的 `context` 增补 `profileSummary`（项目名/一句话目标，additive）
- 新增版本 changelog 同步链：`CHANGELOG.md` 权威源 + `tools/sync-suite-version.mjs`（--check / --release）+ 版本一致性测试门禁

## [2.0] - 2026-07-10

全套件审计修复版。基于 51 项经真实执行核实的审计发现做系统性修复：模板与校验器对齐（S4 一致性门禁、prd-check 拆分模式、feature-list 编号）、脚本命令统一 `<suite-path>` 路径约定、foundation 目录契约统一为 `docs/prd/foundation/`、brd-writer 生命周期护栏（init 重入保护、栈式回滚、DONE 态保护）、baseline 按行合并保留用户确认字段、PIPELINE 补齐 S6/S7 契约、hooks 注入链路修通、清理历史项目泄漏词。测试 112/112 通过，6 个沙箱场景真实复现验证全部通过。

## [1.x] - 2026-04 ～ 2026-07

初始版本：S0–S5 主流水线、调度层（page-chief / prd-chief / test-case-chief）、协议脚本化（route-check / bootstrap / ledger 工具链）、既有项目接入旁路（S0.5 baseline）逐步成形。
