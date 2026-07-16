import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
    collectDashboardModel,
    normalizeKanbanStatus,
    STAGE_SEQUENCE
} from '../lib/progress-dashboard/collect.js';
import { stageCopy, blockerCopy, buildNextStepText } from '../lib/progress-dashboard/copy.js';
import { renderDashboardHtml } from '../lib/progress-dashboard/render.js';
import { renderProgressDashboardFile, DASHBOARD_FILENAME } from '../lib/progress-dashboard/index.js';
import { buildClaudeHookPayload } from '../lib/bootstrap/index.js';

const TEST_FILE_PATH = fileURLToPath(import.meta.url);
const SUITE_ROOT = path.resolve(path.dirname(TEST_FILE_PATH), '..');
const RENDER_CLI = path.join(SUITE_ROOT, 'tools', 'render-progress-dashboard.mjs');

function makeTempDir(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(targetPath, content) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, content, 'utf8');
}

function buildProfileContent(overrides = {}) {
    const values = {
        project_name: '演示项目',
        project_one_liner: '帮助团队稳定推进项目',
        current_stage: 'S1',
        target_users: '运营人员',
        main_problem: '当前推进信息分散',
        recommended_stage: 'S1',
        current_round_deliverable: '业务需求文档 / BRD',
        largest_uncertainty: '验收口径待确认',
        current_executor: 'ai-project-manager',
        ...overrides
    };

    return `# 项目画像

## 1. 基本信息

- 项目名称：${values.project_name}
- 项目一句话目标：${values.project_one_liner}
- 目标使用者：${values.target_users}
- 主要问题：${values.main_problem}

## 2. 身份识别

- 协作模式：业务单人 + AI执行

## 7. 当前判断

- 当前阶段：${values.current_stage}
- 当前最适合进入的阶段：${values.recommended_stage}
- 当前轮应输出的交付物：${values.current_round_deliverable}
- 当前最大不确定项：${values.largest_uncertainty}
- 当前任务执行主体：${values.current_executor}

## 8. 待确认

- 验收口径待确认
`;
}

function buildPlanContent(overrides = {}) {
    const values = {
        current_stage: 'S1',
        current_goal: '完成 BRD 收敛',
        in_progress: '整理核心需求',
        next_tasks: '准备进入页面阶段',
        completion_criteria: 'BRD 可评审',
        ...overrides
    };

    return `# 当前执行计划

## 1. 当前阶段

- ${values.current_stage}

## 2. 当前目标

- ${values.current_goal}

## 3. 进行中任务

- ${values.in_progress}

## 4. 下一步任务

- ${values.next_tasks}

## 5. 完成标准

- ${values.completion_criteria}

## 6. 前置依赖

- 无

## 7. 待确认项

- 页面细节待确认
`;
}

function createHostFixture({ profileOverrides = {}, planOverrides = {}, logContent = '记录 S1 阶段推进' } = {}) {
    const hostRoot = makeTempDir('pm-dashboard-host-');
    writeFile(path.join(hostRoot, 'project-profile.md'), buildProfileContent(profileOverrides));
    writeFile(path.join(hostRoot, 'docs', 'plans', 'execution-plan.md'), buildPlanContent(planOverrides));
    writeFile(path.join(hostRoot, 'logs', '20260406_refactor_log_tester.md'), logContent);
    return hostRoot;
}

function writeBrd(hostRoot, slug = 'demo') {
    writeFile(path.join(hostRoot, 'docs', 'brd', `BRD-${slug}-20260601-1200.md`), '# BRD\n\n- 核心需求：演示\n');
}

function writeFullPrdArtifacts(hostRoot, slug = 'demo') {
    const mainFile = `mainprd-${slug}.md`;
    const subprdFile = 'subprd/01-subprd-core.md';

    writeFile(
        path.join(hostRoot, 'docs', 'prd', `prd-feature-list-${slug}.md`),
        `# 功能列表

## 功能总表

| # | 页面 | 区块 | 功能说明 | subprd文件 | 状态 |
|---|---|---|---|---|---|
| 1 | 操作页 | 核心操作 | 处理核心流程 | [01-subprd-core.md](${subprdFile}) | 已确认 |
`
    );
    writeFile(
        path.join(hostRoot, 'docs', 'prd', mainFile),
        `# mainprd

## subprd索引

| # | 区块 | 所属页面 | subprd文件 | 状态 |
|---|---|---|---|---|
| 1 | 核心操作 | 操作页 | [01-subprd-core.md](${subprdFile}) | 已确认 |
`
    );
    writeFile(
        path.join(hostRoot, 'docs', 'prd', subprdFile),
        `# 核心操作 subprd

- mainprd回链：[${mainFile}](../${mainFile})
`
    );
}

function buildMainDeliveryPlanContent(slug, taskStatus) {
    return `# Demo Main Delivery Plan

> **版本**：v1
> **发布日期**：2026-06-01
> **适用范围**：demo

## 驾驶舱摘要（供 \`execution-plan.md\` 同步）

| 字段 | 内容 |
|---|---|
| 当前正式计划文件 | \`main-delivery-plan-${slug}.md\` |
| 当前任务看板 | \`task-kanban-${slug}.md\` |
| 当前子开发计划 | \`sub-delivery-plan-${slug}-T0.1-demo-task.md\` |
| 当前阶段 | \`S4 开发执行\` |
| 当前目标 | 当前进入 T0.1 实现演示任务。 |
| 当前活跃 Phase / Task | \`Phase 0 / T0.1 实现演示任务\` |
| 下一步任务 | 打开 T0.1 子开发计划并执行演示任务。 |
| 完成标准摘要 | \`node src/demo.js\` 输出 demo-ok。 |
| 当前阻塞与前置依赖 | 无 |
| 待确认项 | 无 |

## 0. 本计划使用指南
### 0.2 PRD 加载约束
按任务读取 PRD。
### 0.3 读前门禁
动手前确认 PRD、核心逻辑和核心文件。
### 0.4 完成前验证门禁
完成后执行真实验证。

## 环境依赖声明
无额外环境依赖。

## 1. 差距基线
- G1: demo gap

## 2. 分工与边界
- AI 执行，人审核。

## 3. 执行阶段
### Phase 0：Demo
| Task | 子开发计划 | 状态 |
|---|---|---|
| T0.1 | [sub-delivery-plan-${slug}-T0.1-demo-task.md](sub-delivery-plan-${slug}-T0.1-demo-task.md) | ${taskStatus} |

## 4. 任务看板
- 看板入口：[task-kanban-${slug}.md](task-kanban-${slug}.md)

## 5. 发布闸门
- [ ] 真实验证完成

## 6. 风险与应对
- 无

## 7. AI 执行示例
- 读取任务看板，按 Task 进入对应子开发计划。

## 8. PRD → 任务反向索引
| PRD | Task | 子开发计划 |
|---|---|---|
| mainprd-${slug}.md §1 | T0.1 | [sub-delivery-plan-${slug}-T0.1-demo-task.md](sub-delivery-plan-${slug}-T0.1-demo-task.md) |
`;
}

function buildTaskKanbanContent(slug, taskStatus, completedDate = '-') {
    return `# Demo Task Kanban

| Task | 子开发计划 | Owner | 前置 | 状态 | 完成日期 | 备注 |
|---|---|---|---|---|---|---|
| T0.1 | [sub-delivery-plan-${slug}-T0.1-demo-task.md](sub-delivery-plan-${slug}-T0.1-demo-task.md) | AI | 无 | ${taskStatus} | ${completedDate} | demo |
`;
}

function buildSubDeliveryPlanContent(slug, taskStatus) {
    return `# T0.1 Demo Sub Delivery Plan

## 任务来源
- 主开发计划：[main-delivery-plan-${slug}.md](main-delivery-plan-${slug}.md)
- 任务看板：[task-kanban-${slug}.md](task-kanban-${slug}.md)

#### T0.1 实现演示任务

**Requirement ID**：REQ-DEMO-001

**PRD 双链·读**：
- \`mainprd-${slug}.md\` §1

**核心逻辑**：
- 根据 PRD 处理演示任务。

**核心文件**：
- \`src/demo.js\`

**完成标准**：
- 运行 \`node src/demo.js\` 输出 demo-ok。

**Verification Method**：
- 执行 \`node src/demo.js\`。

**Evidence**：
- logs/demo-task.md

**Failure Handling**：
- PRD 或核心文件定位不到时阻塞。

**完成收尾：状态同步**：
- 完成实现与验证后，把完成事实、验证证据和完成日期提交给 \`ai-project-manager\`，同步主计划、看板和本子计划状态。

**Owner**：AI 执行 -> 人审核
**前置**：无
**状态**：${taskStatus}
`;
}

function writeDeliveryPlan(hostRoot, { slug = 'demo', mainStatus = '进行中', kanbanStatus = '进行中', subStatus = '进行中', completedDate = '-' } = {}) {
    const planDir = path.join(hostRoot, 'docs', 'plans', 'delivery-plans');
    writeFile(path.join(planDir, `main-delivery-plan-${slug}.md`), buildMainDeliveryPlanContent(slug, mainStatus));
    writeFile(path.join(planDir, `task-kanban-${slug}.md`), buildTaskKanbanContent(slug, kanbanStatus, completedDate));
    writeFile(path.join(planDir, `sub-delivery-plan-${slug}-T0.1-demo-task.md`), buildSubDeliveryPlanContent(slug, subStatus));
}

function createS4Fixture(options = {}) {
    const hostRoot = createHostFixture({
        profileOverrides: { current_stage: 'S4', recommended_stage: 'S4', current_round_deliverable: '当前任务的执行结果' },
        planOverrides: { current_stage: 'S4', current_goal: '推进 T0.1', in_progress: 'Phase 0 / T0.1 实现演示任务' },
        logContent: '记录 S4 阶段推进'
    });
    writeBrd(hostRoot);
    writeFullPrdArtifacts(hostRoot);
    writeDeliveryPlan(hostRoot, options);
    return hostRoot;
}

// ─── 状态归一（与 check-plan-consistency 同口径，防漂移） ───

test('normalizeKanbanStatus keeps the five-state mapping', () => {
    assert.equal(normalizeKanbanStatus('进行中'), '进行中');
    assert.equal(normalizeKanbanStatus('已完成（2026-06-05）'), '已完成');
    assert.equal(normalizeKanbanStatus('已完成(2026-06-05)'), '已完成');
    assert.equal(normalizeKanbanStatus('待审阅'), '待审阅');
    assert.equal(normalizeKanbanStatus('待开发'), '待开发');
    assert.equal(normalizeKanbanStatus('阻塞'), '阻塞');
    assert.equal(normalizeKanbanStatus('随便写的'), '');
});

// ─── 白话文案完备性（防脚本演进后黑话直接上墙） ───

test('every stage id has plain-language copy', () => {
    for (const stageId of STAGE_SEQUENCE) {
        assert.ok(stageCopy[stageId]?.plain, `stageCopy missing ${stageId}`);
        assert.ok(stageCopy[stageId]?.sub, `stageCopy sub missing ${stageId}`);
        assert.ok(stageCopy[stageId]?.producedLabel, `stageCopy producedLabel missing ${stageId}`);
    }
});

test('every route-check blocker code has plain-language copy', () => {
    const routeCheckSource = fs.readFileSync(path.join(SUITE_ROOT, 'tools', 'route-check.mjs'), 'utf8');
    const codes = new Set(
        [...routeCheckSource.matchAll(/'([a-z0-9_]+_(?:missing|invalid|inconsistent))'/g)].map((m) => m[1])
    );
    assert.ok(codes.size >= 10, `expected to extract blocker codes from route-check, got ${codes.size}`);
    for (const code of codes) {
        assert.ok(blockerCopy[code], `blockerCopy missing entry for ${code}`);
    }
});

test('buildNextStepText prefers blockers, then route target, then stage fallback', () => {
    assert.match(
        buildNextStepText({ blockers: [{ code: 'brd_missing' }], routeTargetSkill: 'page-chief' }),
        /先解决/
    );
    assert.equal(
        buildNextStepText({ blockers: [], routeTargetSkill: 'delivery-planner' }),
        '让 AI 把活儿拆成任务、排出开发计划'
    );
    assert.match(buildNextStepText({ blockers: [], routeTargetSkill: null, anchorStage: 'S4' }), /开发实施/);
    assert.match(buildNextStepText({ allDone: true }), /全流程已走完/);
});

// ─── collect：初始态与降级 ───

test('empty host renders an initial-state model without crashing', () => {
    const hostRoot = makeTempDir('pm-dashboard-empty-');
    const model = collectDashboardModel({ hostRoot });

    assert.equal(model.stage.declared, null);
    assert.equal(model.stage.anchor, 'S0');
    assert.equal(model.stage.allDone, false);
    assert.ok(!model.rail.some((station) => station.id === 'S0.5'), 'S0.5 should be hidden without baseline audit');

    // 人类视角修复回归钉：全新项目是“进行中”的正常起点，不是红色“受阻”
    const s0 = model.rail.find((station) => station.id === 'S0');
    assert.equal(s0.status, 'active');

    const html = renderDashboardHtml(model);
    assert.match(html, /generated-by: ai-project-manager/);
    assert.match(html, /需求梳理/);
    assert.ok(!/https?:\/\//.test(html), 'dashboard html must be self-contained (no external URLs)');
    // 质量数据出现前，质量卡整卡不显示（避免“0 个业务域”噪音）
    assert.ok(!html.includes('已备好测试的业务域'));
    assert.ok(!html.includes('质量与安全'));
});

// ─── collect：S4 进行中（当前功能点） ───

test('S4 fixture surfaces the active task with its Chinese title', () => {
    const hostRoot = createS4Fixture();
    const model = collectDashboardModel({ hostRoot });

    assert.equal(model.stage.anchor, 'S4');
    assert.equal(model.stage.conflict, false);
    assert.equal(model.dev.planInconsistent, false);
    assert.equal(model.dev.activeTask?.id, 'T0.1');
    assert.equal(model.dev.activeTask?.title, '实现演示任务');
    assert.equal(model.dev.counts.total, 1);
    assert.equal(model.dev.counts.inProgress, 1);

    const byId = Object.fromEntries(model.rail.map((station) => [station.id, station.status]));
    assert.equal(byId.S1, 'produced');
    assert.equal(byId.S2, 'produced');
    assert.equal(byId.S3, 'produced');
    assert.equal(byId.S4, 'active');
    assert.equal(byId.S5, 'pending');

    const html = renderDashboardHtml(model);
    assert.match(html, /实现演示任务/);
    assert.match(html, /正在开发/);
    assert.ok(!/https?:\/\//.test(html));
});

test('plan ready but not started is a normal state: S4 active with a "start work" next step', () => {
    const hostRoot = createS4Fixture({ mainStatus: '待开发', kanbanStatus: '待开发', subStatus: '待开发' });
    const model = collectDashboardModel({ hostRoot });

    assert.equal(model.dev.noActiveTaskReason, 'not_started');
    assert.equal(model.dev.planInconsistent, false);
    const s4 = model.rail.find((station) => station.id === 'S4');
    assert.equal(s4.status, 'active', '待开工不是受阻');

    const html = renderDashboardHtml(model);
    assert.match(html, /对 AI 说「开工」/);
    assert.ok(!html.includes('任务状态对不上'), '待开工不得误报计划不一致');
});

test('all tasks done is a normal state, not a plan inconsistency', () => {
    const hostRoot = createS4Fixture({
        mainStatus: '已完成（2026-06-05）',
        kanbanStatus: '已完成（2026-06-05）',
        subStatus: '已完成（2026-06-05）',
        completedDate: '2026-06-05'
    });
    const model = collectDashboardModel({ hostRoot });

    assert.equal(model.dev.planInconsistent, false, JSON.stringify(model.dev.consistencyIssues));
    assert.equal(model.dev.noActiveTaskReason, 'all_done');
    assert.equal(model.dev.allTasksDone, true);
    assert.equal(model.stage.anchor, 'S5');
    assert.ok(!model.warnings.some((warning) => warning.code === 'plan_inconsistent'));
});

test('all done with a blanked cockpit pointer ("无（全部完成）") stays benign', () => {
    const hostRoot = createS4Fixture({
        mainStatus: '已完成（2026-06-05）',
        kanbanStatus: '已完成（2026-06-05）',
        subStatus: '已完成（2026-06-05）',
        completedDate: '2026-06-05'
    });
    const mainPath = path.join(hostRoot, 'docs', 'plans', 'delivery-plans', 'main-delivery-plan-demo.md');
    writeFile(
        mainPath,
        fs
            .readFileSync(mainPath, 'utf8')
            .replace('| 当前活跃 Phase / Task | `Phase 0 / T0.1 实现演示任务` |', '| 当前活跃 Phase / Task | 无（全部完成） |')
    );

    const model = collectDashboardModel({ hostRoot });
    assert.equal(model.dev.planInconsistent, false, JSON.stringify(model.dev.consistencyIssues));
    assert.equal(model.dev.noActiveTaskReason, 'all_done');
    assert.ok(!model.warnings.some((warning) => warning.code === 'plan_inconsistent'));
});

test('a real status conflict raises the plan-inconsistent warning and hides the active task', () => {
    const hostRoot = createS4Fixture({ subStatus: '待开发' });
    const model = collectDashboardModel({ hostRoot });

    assert.equal(model.dev.planInconsistent, true);
    assert.equal(model.dev.activeTask, null);
    assert.ok(model.warnings.some((warning) => warning.code === 'plan_inconsistent'));
});

test('self-declared stage ahead of artifacts raises a stage conflict', () => {
    const hostRoot = createHostFixture({
        profileOverrides: { current_stage: 'S4', recommended_stage: 'S4' },
        planOverrides: { current_stage: 'S4' },
        logContent: '记录 S4 阶段推进'
    });
    writeBrd(hostRoot);

    const model = collectDashboardModel({ hostRoot });
    assert.equal(model.stage.anchor, 'S2');
    assert.equal(model.stage.conflict, true);
    assert.ok(model.warnings.some((warning) => warning.code === 'stage_conflict'));
});

// ─── S7：安全结论只认安全报告 ───

test('S7 conclusion comes only from the security report, never from profile keywords', () => {
    const hostRoot = createHostFixture({
        profileOverrides: { largest_uncertainty: '已完工，等待安全放行' }
    });
    writeFile(
        path.join(hostRoot, 'docs', 'test-case', 'reports', 'index.md'),
        `# 测试执行报告

## 执行进度

| 业务域 | 用例数 | 状态 | 报告 |
|------|--------|------|------|
| 模块A | 2 | ✅ 2 PASS | [测试验收-模块A.md](测试验收-模块A.md) |
`
    );
    writeFile(
        path.join(hostRoot, 'docs', 'test-case', 'reports', '测试验收-模块A.md'),
        `# 模块A — 测试报告

## 第1轮（2026-06-05）

> 用例总数: 2 | PASS: 2 | FAIL: 0 | BLOCKED: 0
`
    );

    let model = collectDashboardModel({ hostRoot });
    assert.equal(model.quality.security.conclusion, null, 'no security report -> no conclusion');
    assert.equal(model.producedMap.S7, false);

    // 模板占位（三选一原样串）不算已填写
    writeFile(
        path.join(hostRoot, 'docs', 'security', 'scan-report.md'),
        '# 安全扫描报告\n\n## 6. 放行结论\n\n- 最终结论：`PASS / BLOCK / WAIVER`\n'
    );
    model = collectDashboardModel({ hostRoot });
    assert.equal(model.quality.security.conclusion, null);

    writeFile(
        path.join(hostRoot, 'docs', 'security', 'scan-report.md'),
        '# 安全扫描报告\n\n## 6. 放行结论\n\n- 最终结论：`BLOCK`\n'
    );
    model = collectDashboardModel({ hostRoot });
    assert.equal(model.quality.security.conclusion, 'BLOCK');
    const s7 = model.rail.find((station) => station.id === 'S7');
    assert.equal(s7.status, 'blocked');

    assert.equal(model.quality.execution.totals.pass, 2);
});

// ─── 多 slug 警示 ───

test('multiple slugs raise a warning banner', () => {
    const hostRoot = createHostFixture();
    writeFile(path.join(hostRoot, 'docs', 'brd', 'ledger-state-alpha.json'), '{}');
    writeFile(path.join(hostRoot, 'docs', 'brd', 'ledger-state-beta.json'), '{}');

    const model = collectDashboardModel({ hostRoot });
    assert.ok(model.warnings.some((warning) => warning.code === 'multiple_slugs'));
});

// ─── CLI 与触发点 ───

test('render CLI writes the dashboard file and exits 0; bad host exits non-zero', () => {
    const hostRoot = createHostFixture();
    const output = execFileSync(process.execPath, [RENDER_CLI, hostRoot], { encoding: 'utf8' });
    assert.match(output, /进度页已生成/);
    assert.ok(fs.existsSync(path.join(hostRoot, DASHBOARD_FILENAME)));

    const bad = spawnSync(process.execPath, [RENDER_CLI, path.join(hostRoot, 'no-such-dir')], {
        encoding: 'utf8'
    });
    assert.notEqual(bad.status, 0);
});

test('bootstrap CLI renders the dashboard and announces it (but not in dry-run)', () => {
    const BOOTSTRAP_CLI = path.join(SUITE_ROOT, 'tools', 'bootstrap-host.mjs');

    const dryHost = createHostFixture();
    const dryOutput = execFileSync(process.execPath, [BOOTSTRAP_CLI, dryHost, '--dry-run'], { encoding: 'utf8' });
    assert.ok(!fs.existsSync(path.join(dryHost, DASHBOARD_FILENAME)), 'dry-run must not create the dashboard');
    assert.ok(!dryOutput.includes('项目进度页已生成'));

    const hostRoot = createHostFixture();
    const output = execFileSync(process.execPath, [BOOTSTRAP_CLI, hostRoot], { encoding: 'utf8' });
    assert.match(output, /项目进度页已生成/);
    assert.ok(fs.existsSync(path.join(hostRoot, DASHBOARD_FILENAME)));
});

test('devlog-sync CLI refreshes the dashboard unless --no-dashboard', () => {
    const DEVLOG_CLI = path.join(SUITE_ROOT, 'tools', 'devlog-sync.mjs');
    const args = ['--title', '测试轮', '--goal', '验证', '--action', '跑测试', '--result', '通过'];

    const hostRoot = createHostFixture();
    execFileSync(process.execPath, [DEVLOG_CLI, hostRoot, ...args], { encoding: 'utf8' });
    assert.ok(fs.existsSync(path.join(hostRoot, DASHBOARD_FILENAME)));

    const skippedHost = createHostFixture();
    execFileSync(process.execPath, [DEVLOG_CLI, skippedHost, ...args, '--no-dashboard'], { encoding: 'utf8' });
    assert.ok(!fs.existsSync(path.join(skippedHost, DASHBOARD_FILENAME)));
});

test('session-start renderer refreshes the dashboard for suite hosts and always emits valid hook JSON', () => {
    const SESSION_CLI = path.join(SUITE_ROOT, 'lib', 'bootstrap', 'render-session-start.mjs');

    const hostRoot = createHostFixture();
    const output = execFileSync(process.execPath, [SESSION_CLI], {
        encoding: 'utf8',
        env: { ...process.env, CLAUDE_PROJECT_DIR: hostRoot }
    });
    const payload = JSON.parse(output);
    assert.equal(payload.hookSpecificOutput.hookEventName, 'SessionStart');
    assert.match(payload.additional_context, /项目进度页/);
    assert.ok(fs.existsSync(path.join(hostRoot, DASHBOARD_FILENAME)));

    const nonHost = makeTempDir('pm-dashboard-nonhost-');
    const plainOutput = execFileSync(process.execPath, [SESSION_CLI], {
        encoding: 'utf8',
        env: { ...process.env, CLAUDE_PROJECT_DIR: nonHost }
    });
    const plainPayload = JSON.parse(plainOutput);
    assert.equal(plainPayload.hookSpecificOutput.hookEventName, 'SessionStart');
    assert.ok(!plainPayload.additional_context.includes('项目进度页'));
    assert.ok(!fs.existsSync(path.join(nonHost, DASHBOARD_FILENAME)));
});

test('buildClaudeHookPayload keeps working without options and appends extraText when given', () => {
    const base = buildClaudeHookPayload(SUITE_ROOT);
    assert.equal(base.hookSpecificOutput.hookEventName, 'SessionStart');
    assert.ok(base.additional_context.length > 0);

    const withExtra = buildClaudeHookPayload(SUITE_ROOT, { extraText: '项目进度页：项目进度.html' });
    assert.match(withExtra.additional_context, /项目进度页：项目进度\.html/);
});

test('renderProgressDashboardFile honours a custom out path', () => {
    const hostRoot = createHostFixture();
    const outPath = path.join(makeTempDir('pm-dashboard-out-'), 'custom.html');
    const { outPath: written } = renderProgressDashboardFile({ hostRoot, outPath });
    assert.equal(written, outPath);
    assert.ok(fs.readFileSync(outPath, 'utf8').includes('generated-by: ai-project-manager'));
});

test('pseudo-empty pending items ("无") are filtered from the decision list', () => {
    const hostRoot = createS4Fixture();
    const planPath = path.join(hostRoot, 'docs', 'plans', 'execution-plan.md');
    writeFile(planPath, fs.readFileSync(planPath, 'utf8').replace('- 页面细节待确认', '- 无（S2 待确认项已全部确认）'));
    const profilePath = path.join(hostRoot, 'project-profile.md');
    writeFile(profilePath, fs.readFileSync(profilePath, 'utf8').replace('- 验收口径待确认', '- 无'));

    const html = renderDashboardHtml(collectDashboardModel({ hostRoot }));
    assert.ok(!html.includes('等你拍板'), '全是"无"时不应显示等你拍板');
});
