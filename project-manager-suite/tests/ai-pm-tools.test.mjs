import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { validateGlobalFiles } from '../tools/validate-global-files.mjs';
import { routeCheck } from '../tools/route-check.mjs';
import { generateHostRules } from '../tools/generate-host-rules.mjs';
import { bootstrapHost } from '../tools/bootstrap-host.mjs';
import { installSuiteIntoHost } from '../tools/install-suite-into-host.mjs';
import { devlogSync } from '../tools/devlog-sync.mjs';

function makeTempDir(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(targetPath, content) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, content, 'utf8');
}

function writeJsonFile(targetPath, value) {
    writeFile(targetPath, JSON.stringify(value, null, 2));
}

function readFile(targetPath) {
    return fs.readFileSync(targetPath, 'utf8');
}

function buildStartupInterview(overrides = {}) {
    return {
        project_name: '演示项目',
        project_one_liner: '帮助团队稳定推进项目',
        target_users: '运营人员',
        main_problem: '推进信息分散',
        collaboration_mode: '业务单人 + AI执行',
        ...overrides
    };
}

function buildRulesContent() {
    return `# 项目全局规则

## 1. 规则入口与引用约定

- 规则入口：project-rules.md

## 2. 项目结构约定

- 项目结构：docs/、logs/、.agent/

## 3. 工作方式约定

- 每轮沉淀：是

## 6. 交付件要求

- 交付物要求：按阶段沉淀

## 7. AI 协作规则

- AI 协作：主入口先校验再推进
`;
}

function buildProfileContent(overrides = {}) {
    const values = {
        project_name: '演示项目',
        project_one_liner: '帮助团队稳定推进项目',
        current_stage: 'S1',
        collaboration_mode: '业务单人 + AI执行',
        target_users: '运营人员',
        main_problem: '当前推进信息分散',
        v1_core_goal: '完成需求收敛',
        coverage_scope: '内部人员',
        page_primary_user: '运营人员',
        page_primary_purpose: '业务处理',
        page_design_tag: 'B端',
        recommended_stage: 'S1',
        current_round_deliverable: '业务需求文档 / BRD',
        largest_uncertainty: '验收口径待确认',
        current_executor: 'ai-project-manager'
    };

    Object.assign(values, overrides);

    return `# 项目画像

## 1. 基本信息

- 项目名称：${values.project_name}
- 项目一句话目标：${values.project_one_liner}
- 目标用户：${values.target_users}
- 主要问题：${values.main_problem}

## 2. 协作与身份识别

- 协作模式：${values.collaboration_mode}

## 3. 业务目标

- 第一版核心目标：${values.v1_core_goal}

## 4. 页面与任务定位

- 项目覆盖对象：${values.coverage_scope}
- 当前页面主要给谁用：${values.page_primary_user}
- 当前页面主要用途：${values.page_primary_purpose}
- 页面设计标签：${values.page_design_tag}

## 5. 当前资产

- 已有材料：BRD 草稿

## 6. 项目入口与识别信息

- 计划入口：docs/plans/execution-plan.md
- 状态入口：logs/

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
        completion_criteria: 'BRD 可评审'
    };

    Object.assign(values, overrides);

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

- 用户确认页面方向

## 7. 待确认项

- 页面细节待确认
`;
}

function createHostFixture({ withRules = true, withProfile = true, withPlan = true, withDevlog = true, profileOverrides = {}, planOverrides = {}, logContent = '记录 S1 阶段推进' } = {}) {
    const hostRoot = makeTempDir('pm-suite-host-');

    if (withRules) {
        writeFile(path.join(hostRoot, 'project-rules.md'), buildRulesContent());
    }

    if (withProfile) {
        writeFile(path.join(hostRoot, 'project-profile.md'), buildProfileContent(profileOverrides));
    }

    if (withPlan) {
        writeFile(path.join(hostRoot, 'docs', 'plans', 'execution-plan.md'), buildPlanContent(planOverrides));
    }

    if (withDevlog) {
        writeFile(path.join(hostRoot, 'logs', '20260406_refactor_log_tester.md'), logContent);
    }

    return hostRoot;
}

test('validate-global-files resolves authority files on a valid host fixture', () => {
    const hostRoot = createHostFixture();
    generateHostRules({ hostRoot, dryRun: false, force: false });

    const result = validateGlobalFiles({ hostRoot });

    assert.equal(result.summary.errors, 0);
    assert.equal(result.authority.project_profile, 'project-profile.md');
    assert.equal(result.authority.global_rules, 'project-rules.md');
    assert.equal(result.authority.execution_plan, 'docs/plans/execution-plan.md');
    assert.equal(result.authority.project_devlog, 'logs/20260406_refactor_log_tester.md');
    assert.equal(result.rulesDirectory.missingDefaultRules.length, 0);
});

test('route-check blocks S2 routing when stage transition writeback is missing', () => {
    const hostRoot = createHostFixture({
        withDevlog: false,
        profileOverrides: {
            current_stage: 'S1',
            recommended_stage: 'S1',
            current_round_deliverable: '页面原型 / 页面代码'
        },
        planOverrides: {
            current_stage: 'S1',
            current_goal: '进入页面设计阶段',
            next_tasks: '调用 ui-ux-pro-max'
        }
    });
    generateHostRules({ hostRoot, dryRun: false, force: false });

    const result = routeCheck({ hostRoot, targetStage: 'S2' });

    assert.equal(result.canEnter, false);
    assert.ok(result.blockingReasons.some((item) => item.code === 'stage_transition_writeback_missing'));
    assert.equal(result.gateChecks.pageTaskRequired.pass, true);
});

test('generate-host-rules syncs default rules into host docs/rules', () => {
    const hostRoot = makeTempDir('pm-suite-rules-');

    const result = generateHostRules({ hostRoot, dryRun: false, force: false });

    assert.ok(result.results.created.length > 0);
    assert.ok(fs.existsSync(path.join(hostRoot, 'docs', 'rules', 'devlog.md')));
    assert.ok(readFile(path.join(hostRoot, 'docs', 'rules', 'devlog.md')).includes('<!-- generated-by: ai-project-manager -->'));
});

test('install-suite-into-host creates host .agent directory when it does not exist', () => {
    const hostRoot = makeTempDir('pm-suite-install-host-');

    const result = installSuiteIntoHost({
        hostRoot,
        force: false,
        move: false,
        dryRun: false,
        json: false
    });

    const targetSuiteRoot = path.join(hostRoot, '.agent', 'project-manager-suite');
    const manifestPath = path.join(targetSuiteRoot, '.install-manifest.json');

    assert.equal(result.installMode, 'install');
    assert.ok(fs.existsSync(path.join(hostRoot, '.agent')));
    assert.ok(fs.existsSync(path.join(targetSuiteRoot, 'tools', 'bootstrap-host.mjs')));
    assert.ok(fs.existsSync(path.join(targetSuiteRoot, 'skills', 'ai-project-manager', 'SKILL.md')));
    assert.ok(fs.existsSync(manifestPath));
    assert.equal(JSON.parse(readFile(manifestPath)).install_mode, 'install');
});

test('install-suite-into-host reuses existing .agent directory without touching other host assets', () => {
    const hostRoot = makeTempDir('pm-suite-install-existing-agent-');
    const existingAgentFile = path.join(hostRoot, '.agent', 'custom-plugin.txt');

    writeFile(existingAgentFile, 'keep me');

    const result = installSuiteIntoHost({
        hostRoot,
        force: false,
        move: false,
        dryRun: false,
        json: false
    });

    const targetSuiteRoot = path.join(hostRoot, '.agent', 'project-manager-suite');

    assert.ok(result.directories.reused.includes(path.join(hostRoot, '.agent')));
    assert.ok(fs.existsSync(existingAgentFile));
    assert.equal(readFile(existingAgentFile), 'keep me');
    assert.ok(fs.existsSync(path.join(targetSuiteRoot, 'tools', 'install-suite-into-host.mjs')));
    assert.ok(fs.existsSync(path.join(targetSuiteRoot, '.install-manifest.json')));
});

test('install-suite-into-host upgrades an existing host-installed suite in place', () => {
    const hostRoot = makeTempDir('pm-suite-install-upgrade-');

    const firstResult = installSuiteIntoHost({
        hostRoot,
        force: false,
        move: false,
        dryRun: false,
        json: false
    });

    const secondResult = installSuiteIntoHost({
        hostRoot,
        force: false,
        move: false,
        dryRun: false,
        json: false
    });

    const manifestPath = path.join(hostRoot, '.agent', 'project-manager-suite', '.install-manifest.json');

    assert.equal(firstResult.installMode, 'install');
    assert.equal(secondResult.installMode, 'upgrade');
    assert.equal(JSON.parse(readFile(manifestPath)).install_mode, 'upgrade');
    assert.ok(secondResult.files.overwritten.length > 0);
});

test('bootstrap-host initializes container root and creates safe scaffold', () => {
    const workspaceRoot = makeTempDir('pm-suite-workspace-');
    const interviewJsonPath = path.join(workspaceRoot, 'interview.json');

    writeJsonFile(interviewJsonPath, buildStartupInterview());

    const result = bootstrapHost({
        hostRoot: workspaceRoot,
        projectName: '演示项目',
        targetStage: '',
        containerRoot: true,
        dryRun: false,
        json: false,
        forceRules: false,
        interviewComplete: true,
        interviewJsonPath,
        createProfileFile: false,
        createRulesFile: true,
        createPlanFile: false
    });

    const effectiveRoot = path.join(workspaceRoot, '演示项目');
    assert.equal(result.rootResolution.rootMode, 'container');
    assert.ok(fs.existsSync(path.join(effectiveRoot, 'docs', 'rules')));
    assert.ok(fs.existsSync(path.join(effectiveRoot, 'docs', 'plans', 'execution-plan.md')));
    assert.ok(fs.existsSync(path.join(effectiveRoot, '.agent', 'skills')));
    assert.ok(fs.existsSync(path.join(effectiveRoot, 'project-rules.md')));
    assert.ok(result.files.deferred.some((item) => item.reason === 'profile_creation_not_requested'));
});

test('bootstrap-host refuses to bootstrap a container root before startup interview is complete', () => {
    const workspaceRoot = makeTempDir('pm-suite-bootstrap-container-incomplete-');

    assert.throws(
        () =>
            bootstrapHost({
                hostRoot: workspaceRoot,
                targetStage: '',
                containerRoot: true,
                dryRun: false,
                json: false,
                forceRules: false,
                interviewComplete: false,
                createProfileFile: false,
                createRulesFile: true,
                createPlanFile: false
            }),
        /completed startup interview confirmation/
    );
});

test('bootstrap-host refuses to create project-profile.md with only interview-complete flag', () => {
    const workspaceRoot = makeTempDir('pm-suite-bootstrap-no-interview-');

    assert.throws(
        () =>
            bootstrapHost({
                hostRoot: workspaceRoot,
                projectName: '演示项目',
                targetStage: '',
                containerRoot: true,
                dryRun: false,
                json: false,
                forceRules: false,
                interviewComplete: true,
                createProfileFile: true,
                createRulesFile: false,
                createPlanFile: false
            }),
        /startup minimum interview fields/
    );
});

test('bootstrap-host refuses to create project-profile.md when interview JSON misses startup minimum fields', () => {
    const workspaceRoot = makeTempDir('pm-suite-bootstrap-missing-fields-');
    const interviewJsonPath = path.join(workspaceRoot, 'interview.json');

    writeJsonFile(interviewJsonPath, {
        project_name: '演示项目',
        project_one_liner: '帮助团队稳定推进项目'
    });

    assert.throws(
        () =>
            bootstrapHost({
                hostRoot: workspaceRoot,
                projectName: 'demo-host',
                targetStage: '',
                containerRoot: true,
                dryRun: false,
                json: false,
                forceRules: false,
                interviewComplete: true,
                interviewJsonPath,
                createProfileFile: true,
                createRulesFile: false,
                createPlanFile: false
            }),
        /Interview JSON is missing required startup fields/
    );
});

test('bootstrap-host creates project-profile.md only after receiving complete interview JSON', () => {
    const workspaceRoot = makeTempDir('pm-suite-bootstrap-complete-interview-');
    const interviewJsonPath = path.join(workspaceRoot, 'interview.json');

    writeJsonFile(interviewJsonPath, buildStartupInterview());

    const result = bootstrapHost({
        hostRoot: workspaceRoot,
        projectName: '演示项目',
        targetStage: '',
        containerRoot: true,
        dryRun: false,
        json: false,
        forceRules: false,
        interviewComplete: true,
        interviewJsonPath,
        createProfileFile: true,
        createRulesFile: true,
        createPlanFile: false
    });

    const effectiveRoot = path.join(workspaceRoot, '演示项目');
    const profileContent = readFile(path.join(effectiveRoot, 'project-profile.md'));

    assert.ok(fs.existsSync(path.join(effectiveRoot, 'project-profile.md')));
    assert.ok(result.files.created.includes(path.join(effectiveRoot, 'project-profile.md')));
    assert.ok(profileContent.includes('`【用户确认】` `演示项目`'));
    assert.ok(profileContent.includes('`【用户确认】` `帮助团队稳定推进项目`'));
    assert.ok(profileContent.includes('`【用户确认】` `运营人员`'));
});

test('bootstrap-host rejects mismatched --project-name and interview project_name in container mode', () => {
    const workspaceRoot = makeTempDir('pm-suite-bootstrap-mismatch-name-');
    const interviewJsonPath = path.join(workspaceRoot, 'interview.json');

    writeJsonFile(interviewJsonPath, buildStartupInterview());

    assert.throws(
        () =>
            bootstrapHost({
                hostRoot: workspaceRoot,
                projectName: 'demo-host',
                targetStage: '',
                containerRoot: true,
                dryRun: false,
                json: false,
                forceRules: false,
                interviewComplete: true,
                interviewJsonPath,
                createProfileFile: false,
                createRulesFile: true,
                createPlanFile: false
            }),
        /must match interview project_name/
    );
});

test('bootstrap-host creates execution-plan.md as part of startup scaffold', () => {
    const workspaceRoot = makeTempDir('pm-suite-bootstrap-plan-default-');
    const interviewJsonPath = path.join(workspaceRoot, 'interview.json');

    writeJsonFile(interviewJsonPath, buildStartupInterview());

    const result = bootstrapHost({
        hostRoot: workspaceRoot,
        projectName: '演示项目',
        targetStage: '',
        containerRoot: true,
        dryRun: false,
        json: false,
        forceRules: false,
        interviewComplete: true,
        interviewJsonPath,
        createProfileFile: false,
        createRulesFile: true,
        createPlanFile: false
    });

    const effectiveRoot = path.join(workspaceRoot, '演示项目');
    assert.ok(fs.existsSync(path.join(effectiveRoot, 'docs', 'plans', 'execution-plan.md')));
    assert.ok(result.files.created.includes(path.join(effectiveRoot, 'docs/plans/execution-plan.md')));
});

test('devlog-sync creates daily log, appends updates, and updates candidate pool', () => {
    const hostRoot = makeTempDir('pm-suite-devlog-');

    const firstResult = devlogSync({
        hostRoot,
        actor: 'tester',
        date: '2026-04-06',
        time: '10:00',
        title: '阶段切换回写',
        goal: '补齐阶段切换日志',
        action: '写入结构化日志',
        result: '阶段切换前必须先日志回写，建议提炼为规则',
        files: 'project-profile.md,docs/plans/execution-plan.md',
        stage: 'S1',
        conclusion: '日志闭环已补齐',
        next: '继续 BRD 收敛||补齐验收标准',
        planPath: '',
        reflection: '阶段切换前必须先日志回写，建议提炼为规则',
        ruleScope: '全局',
        ruleTarget: 'project-rules.md',
        ruleCheck: '进入子能力前检查最近日志是否记录阶段切换',
        ruleTitle: '阶段切换前必须先日志回写',
        dryRun: false,
        json: false
    });

    assert.equal(firstResult.createdLog, true);
    assert.equal(firstResult.updatedCandidatePool, true);
    assert.ok(fs.existsSync(path.join(hostRoot, firstResult.logFile)));
    assert.ok(fs.existsSync(path.join(hostRoot, firstResult.candidatePoolFile)));

    const secondResult = devlogSync({
        hostRoot,
        actor: 'tester',
        date: '2026-04-06',
        time: '11:30',
        title: '补充更新',
        goal: '追加同日日志',
        action: '继续记录推进状态',
        result: '追加成功',
        files: 'logs/20260406_refactor_log_tester.md',
        stage: 'S1',
        conclusion: '追加完成',
        next: '继续推进',
        planPath: '',
        reflection: '',
        ruleScope: '',
        ruleTarget: '',
        ruleCheck: '',
        ruleTitle: '',
        dryRun: false,
        json: false
    });

    assert.equal(secondResult.appendedLog, true);
    assert.ok(readFile(path.join(hostRoot, secondResult.logFile)).includes('## 补充更新 1'));
});
