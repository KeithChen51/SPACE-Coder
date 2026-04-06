#!/usr/bin/env node

/**
 * Traceability:
 * Rule sources:
 * - skills/ai-project-manager/references/core/runtime.md
 * - skills/ai-project-manager/references/core/routing.md
 * Structured config:
 * - lib/ai-pm-protocol/stages.js
 * - lib/ai-pm-protocol/routing.js
 * - lib/ai-pm-protocol/field-contracts.js
 */
import fs from 'fs';
import path from 'path';
import process from 'process';
import {
    FILE_ROLE_IDS,
    STAGE_IDS,
    fieldPackages,
    routeTargets,
    gatingRules,
    markdownStructure
} from '../lib/ai-pm-protocol/index.js';
import { validateGlobalFiles } from './validate-global-files.mjs';

const STAGE_ORDER = [
    STAGE_IDS.S0,
    STAGE_IDS.S1,
    STAGE_IDS.S2,
    STAGE_IDS.S3,
    STAGE_IDS.S4,
    STAGE_IDS.S5,
    STAGE_IDS.S6
];

function printUsage() {
    console.log(
        'Usage: node project-manager-suite/tools/route-check.mjs <host-project-root> [--target-stage S1|S2|S3|S4|S5|S6] [--json]'
    );
}

function parseArgs(argv) {
    const args = argv.slice(2);
    const options = {
        hostRoot: '',
        targetStage: '',
        json: false
    };

    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];

        if (arg === '--json') {
            options.json = true;
            continue;
        }

        if (arg === '--target-stage') {
            const nextArg = args[i + 1];
            if (!nextArg) {
                throw new Error('Missing value for --target-stage');
            }
            options.targetStage = nextArg.toUpperCase();
            i += 1;
            continue;
        }

        if (!options.hostRoot) {
            options.hostRoot = arg;
            continue;
        }

        throw new Error(`Unknown argument: ${arg}`);
    }

    if (!options.hostRoot) {
        throw new Error('Missing host project root.');
    }

    if (options.targetStage && !STAGE_ORDER.includes(options.targetStage)) {
        throw new Error(`Unsupported target stage: ${options.targetStage}`);
    }

    return options;
}

function normalizeValue(rawValue) {
    return rawValue
        .replace(/^`|`$/g, '')
        .replace(/`/g, '')
        .trim();
}

function isPlaceholderText(value) {
    if (value == null) return true;
    const text = String(value).trim();
    if (!text) return true;
    return /【[^】]+】|待填写|待建立|待确认/.test(text);
}

function extractStageId(text) {
    if (!text) return null;
    if (isPlaceholderText(text)) return null;
    const match = String(text).match(/\b(S[0-6])\b/);
    return match ? match[1] : null;
}

function parseSectionedMarkdown(content) {
    const sections = {};
    let currentSection = null;

    for (const rawLine of content.split('\n')) {
        const line = rawLine.trim();

        const headingMatch = line.match(/^##\s+\d+\.\s+(.+)$/);
        if (headingMatch) {
            currentSection = headingMatch[1].trim();
            sections[currentSection] ||= {
                bullets: [],
                rawLines: []
            };
            continue;
        }

        if (!currentSection) {
            continue;
        }

        sections[currentSection].rawLines.push(line);

        if (line.startsWith('- ')) {
            sections[currentSection].bullets.push(line.slice(2).trim());
        }
    }

    return sections;
}

function parseLabeledBullets(bullets) {
    const map = {};

    for (const bullet of bullets) {
        const colonIndex = bullet.indexOf('：');
        if (colonIndex === -1) {
            continue;
        }

        const label = bullet.slice(0, colonIndex).trim();
        const value = normalizeValue(bullet.slice(colonIndex + 1));
        map[label] = value;
    }

    return map;
}

function loadMarkdownFile(filePath) {
    if (!filePath) return null;
    return fs.readFileSync(filePath, 'utf8');
}

function resolveAbsolutePath(hostRoot, relativePath) {
    return relativePath ? path.join(hostRoot, relativePath) : null;
}

function extractProfileContext(content) {
    if (!content) {
        return {
            fields: {},
            pendingItems: []
        };
    }

    const structure = markdownStructure[FILE_ROLE_IDS.PROFILE];
    const sections = parseSectionedMarkdown(content);

    const combinedLabels = {};
    for (const sectionName of Object.values(structure.sections)) {
        if (!sections[sectionName]) continue;
        Object.assign(combinedLabels, parseLabeledBullets(sections[sectionName].bullets));
    }

    const fields = {};
    for (const [fieldKey, label] of Object.entries(structure.labels)) {
        fields[fieldKey] = combinedLabels[label] || '';
    }

    fields.current_stage = extractStageId(fields.current_stage);
    fields.recommended_stage = extractStageId(fields.recommended_stage);

    const pendingSection = sections[structure.sections.pending];
    const pendingItems = pendingSection
        ? pendingSection.bullets
              .map((bullet) => normalizeValue(bullet))
              .filter((item) => item && item !== '无（S0 待确认项已全部确认）' && item !== '无')
        : [];

    return {
        fields,
        pendingItems
    };
}

function extractPlanContext(content) {
    if (!content) {
        return {
            currentStage: null,
            currentGoal: [],
            inProgressTasks: [],
            nextTasks: [],
            completionCriteria: [],
            dependencies: [],
            pendingItems: []
        };
    }

    const structure = markdownStructure[FILE_ROLE_IDS.PLAN];
    const sections = parseSectionedMarkdown(content);
    const getBullets = (sectionTitle) => sections[sectionTitle]?.bullets || [];

    const currentStageBullets = getBullets(structure.sections.currentStage);

    return {
        currentStage: extractStageId(currentStageBullets[0] || ''),
        currentGoal: getBullets(structure.sections.currentGoal),
        inProgressTasks: getBullets(structure.sections.inProgress),
        nextTasks: getBullets(structure.sections.nextTasks),
        completionCriteria: getBullets(structure.sections.completionCriteria),
        dependencies: getBullets(structure.sections.dependencies),
        pendingItems: getBullets(structure.sections.pending)
    };
}

function isMissingValue(value) {
    if (value == null) return true;
    const normalized = String(value).trim();
    if (!normalized) return true;
    if (normalized === '待确认') return true;
    if (normalized === '待建立') return true;
    if (normalized === '待填写') return true;
    if (isPlaceholderText(normalized)) return true;
    return false;
}

function hasPageTaskSignal(profileContext, planContext) {
    const deliverable = profileContext.fields.current_round_deliverable || '';
    const pageFields = [
        profileContext.fields.coverage_scope,
        profileContext.fields.page_primary_user,
        profileContext.fields.page_primary_purpose,
        profileContext.fields.page_design_tag
    ];

    const textPool = [
        deliverable,
        ...planContext.currentGoal,
        ...planContext.nextTasks,
        ...planContext.inProgressTasks
    ].join(' ');

    if (pageFields.some((value) => !isMissingValue(value))) {
        return true;
    }

    return /页面|原型|前端|界面|UI|UX|后台配置页|C端|H5|小程序/.test(textPool);
}

function isPageDesignTagResolved(value) {
    if (isMissingValue(value)) return false;
    return /(C端|B端|后台)/.test(value);
}

function inferRecommendedStage(profileContext, planContext) {
    if (profileContext.fields.recommended_stage) {
        return profileContext.fields.recommended_stage;
    }

    if (profileContext.fields.current_stage) {
        return profileContext.fields.current_stage;
    }

    if (planContext.currentStage) {
        return planContext.currentStage;
    }

    if (hasPageTaskSignal(profileContext, planContext)) {
        return STAGE_IDS.S2;
    }

    if (planContext.currentGoal.some((item) => /BRD|业务需求文档/.test(item))) {
        return STAGE_IDS.S1;
    }

    return STAGE_IDS.S0;
}

function fieldValueMap(profileContext) {
    return {
        project_name: profileContext.fields.project_name,
        project_one_liner: profileContext.fields.project_one_liner,
        target_users: profileContext.fields.target_users,
        main_problem: profileContext.fields.main_problem,
        collaboration_mode: profileContext.fields.collaboration_mode,
        coverage_scope: profileContext.fields.coverage_scope,
        page_primary_user: profileContext.fields.page_primary_user,
        page_primary_purpose: profileContext.fields.page_primary_purpose,
        page_design_tag: profileContext.fields.page_design_tag,
        current_stage: profileContext.fields.current_stage,
        recommended_stage: profileContext.fields.recommended_stage,
        current_round_deliverable: profileContext.fields.current_round_deliverable,
        current_executor: profileContext.fields.current_executor,
        largest_uncertainty: profileContext.fields.largest_uncertainty
    };
}

function collectMissingFields(fieldKeys, values, extraChecks = {}) {
    return fieldKeys.filter((fieldKey) => {
        if (fieldKey === 'page_design_tag') {
            return !isPageDesignTagResolved(values[fieldKey]);
        }

        if (extraChecks[fieldKey]) {
            return !extraChecks[fieldKey](values[fieldKey]);
        }

        return isMissingValue(values[fieldKey]);
    });
}

function hasRecentStageWriteback(hostRoot, validationResult, targetStage) {
    const latestDevlogRelative = validationResult.authority[FILE_ROLE_IDS.DEVLOG];
    if (!latestDevlogRelative) return false;

    const latestDevlogPath = resolveAbsolutePath(hostRoot, latestDevlogRelative);
    const profilePath = resolveAbsolutePath(hostRoot, validationResult.authority[FILE_ROLE_IDS.PROFILE]);
    const planPath = resolveAbsolutePath(hostRoot, validationResult.authority[FILE_ROLE_IDS.PLAN]);

    if (!latestDevlogPath || !fs.existsSync(latestDevlogPath)) {
        return false;
    }

    const logContent = fs.readFileSync(latestDevlogPath, 'utf8');
    if (targetStage && logContent.includes(targetStage)) {
        return true;
    }

    const logMtime = fs.statSync(latestDevlogPath).mtimeMs;
    const referenceMtime = Math.max(
        profilePath && fs.existsSync(profilePath) ? fs.statSync(profilePath).mtimeMs : 0,
        planPath && fs.existsSync(planPath) ? fs.statSync(planPath).mtimeMs : 0
    );

    return logMtime >= referenceMtime;
}

function buildGateChecks({ targetStage, profileContext, planContext, validationResult, hostRoot }) {
    const values = fieldValueMap(profileContext);
    const checks = {};

    checks.startupMinimum = {
        pass: collectMissingFields(fieldPackages.startupMinimum, values).length === 0,
        missingFields: collectMissingFields(fieldPackages.startupMinimum, values)
    };

    if (targetStage === STAGE_IDS.S2) {
        checks.pageTaskRequired = {
            pass: collectMissingFields(fieldPackages.pageTaskRequired, values).length === 0,
            missingFields: collectMissingFields(fieldPackages.pageTaskRequired, values)
        };
    }

    if (targetStage === STAGE_IDS.S3) {
        checks.fullPrdReady = {
            pass: /PRD/.test(profileContext.fields.current_round_deliverable || '') ||
                planContext.currentGoal.some((item) => /PRD/.test(item)),
            evidence: profileContext.fields.current_round_deliverable || planContext.currentGoal.join(' | ')
        };
    }

    if (targetStage === STAGE_IDS.S4) {
        checks.developmentPlanReady = {
            pass: planContext.currentStage === STAGE_IDS.S3 || planContext.inProgressTasks.length > 0,
            evidence: {
                planStage: planContext.currentStage,
                inProgressTasks: planContext.inProgressTasks.length
            }
        };
    }

    checks.stageWritebackBeforeRouting = {
        pass: hasRecentStageWriteback(hostRoot, validationResult, targetStage),
        evidence: validationResult.authority[FILE_ROLE_IDS.DEVLOG]
    };

    return checks;
}

function buildBlockingReasons({ targetStage, currentStage, recommendedStage, gateChecks }) {
    const reasons = [];

    if (!gateChecks.startupMinimum.pass) {
        reasons.push({
            code: 'startup_minimum_missing',
            message: gatingRules.startupMinimum.description,
            missingFields: gateChecks.startupMinimum.missingFields
        });
    }

    if (targetStage === STAGE_IDS.S2 && gateChecks.pageTaskRequired && !gateChecks.pageTaskRequired.pass) {
        reasons.push({
            code: 'page_task_required_missing',
            message: gatingRules.pageTaskRequired.description,
            missingFields: gateChecks.pageTaskRequired.missingFields
        });
    }

    if (targetStage === STAGE_IDS.S3 && gateChecks.fullPrdReady && !gateChecks.fullPrdReady.pass) {
        reasons.push({
            code: 'full_prd_missing',
            message: gatingRules.fullPrdReady.description
        });
    }

    if (targetStage === STAGE_IDS.S4 && gateChecks.developmentPlanReady && !gateChecks.developmentPlanReady.pass) {
        reasons.push({
            code: 'development_plan_missing',
            message: gatingRules.developmentPlanReady.description
        });
    }

    const stageChangeRequested =
        (currentStage && targetStage && currentStage !== targetStage) ||
        (currentStage && recommendedStage && currentStage !== recommendedStage);

    if (stageChangeRequested && gateChecks.stageWritebackBeforeRouting && !gateChecks.stageWritebackBeforeRouting.pass) {
        reasons.push({
            code: 'stage_transition_writeback_missing',
            message: gatingRules.stageWritebackBeforeRouting.description
        });
    }

    return reasons;
}

function resolveNextAction({ validationResult, recommendedStage, blockers }) {
    if (!validationResult.authority[FILE_ROLE_IDS.PROFILE]) {
        return '停留主入口，发起首轮极简访谈并补齐项目画像';
    }

    const startupBlocker = blockers.find((item) => item.code === 'startup_minimum_missing');
    if (startupBlocker) {
        return '停留主入口，补齐启动最小必需字段包';
    }

    const pageBlocker = blockers.find((item) => item.code === 'page_task_required_missing');
    if (pageBlocker) {
        return '停留主入口，补齐页面任务必补字段包并回写页面设计标签';
    }

    const writebackBlocker = blockers.find((item) => item.code === 'stage_transition_writeback_missing');
    if (writebackBlocker) {
        return '先调用 project-devlog 完成阶段切换日志回写，再进入下一阶段能力';
    }

    if (recommendedStage && routeTargets[recommendedStage]) {
        return `可进入 ${recommendedStage}，默认交由 ${routeTargets[recommendedStage].skill}`;
    }

    return '停留主入口继续澄清上下文';
}

function routeCheck({ hostRoot, targetStage = '' }) {
    const validationResult = validateGlobalFiles({ hostRoot });
    const resolvedHostRoot = validationResult.hostRoot;

    const profileContent = loadMarkdownFile(
        resolveAbsolutePath(resolvedHostRoot, validationResult.authority[FILE_ROLE_IDS.PROFILE])
    );
    const planContent = loadMarkdownFile(
        resolveAbsolutePath(resolvedHostRoot, validationResult.authority[FILE_ROLE_IDS.PLAN])
    );

    const profileContext = extractProfileContext(profileContent);
    const planContext = extractPlanContext(planContent);

    const currentStage = profileContext.fields.current_stage || planContext.currentStage || null;
    const recommendedStage = inferRecommendedStage(profileContext, planContext);
    const resolvedTargetStage = targetStage || recommendedStage || currentStage || STAGE_IDS.S0;
    const gateChecks = buildGateChecks({
        targetStage: resolvedTargetStage,
        profileContext,
        planContext,
        validationResult,
        hostRoot: resolvedHostRoot
    });

    const blockingReasons = buildBlockingReasons({
        targetStage: resolvedTargetStage,
        currentStage,
        recommendedStage,
        gateChecks
    });

    const result = {
        hostRoot: resolvedHostRoot,
        currentStage,
        recommendedStage,
        targetStage: resolvedTargetStage,
        routeTarget: routeTargets[resolvedTargetStage] || null,
        canEnter: blockingReasons.length === 0,
        gateChecks,
        blockingReasons,
        context: {
            currentRoundDeliverable: profileContext.fields.current_round_deliverable || null,
            currentExecutor: profileContext.fields.current_executor || null,
            planCurrentGoalCount: planContext.currentGoal.length,
            inProgressTaskCount: planContext.inProgressTasks.length,
            nextTaskCount: planContext.nextTasks.length,
            pendingItems: {
                profile: profileContext.pendingItems,
                plan: planContext.pendingItems
            }
        },
        nextAction: resolveNextAction({
            validationResult,
            recommendedStage: resolvedTargetStage,
            blockers: blockingReasons
        }),
        validation: validationResult.summary
    };

    return result;
}

function formatTextReport(result) {
    const lines = [
        `Host root: ${result.hostRoot}`,
        `Current stage: ${result.currentStage || 'UNKNOWN'}`,
        `Recommended stage: ${result.recommendedStage || 'UNKNOWN'}`,
        `Target stage: ${result.targetStage || 'UNKNOWN'}`,
        `Can enter: ${result.canEnter ? 'yes' : 'no'}`
    ];

    if (result.routeTarget?.skill) {
        lines.push(`Route target: ${result.routeTarget.skill}`);
    }

    lines.push('', 'Gate checks:');
    for (const [key, check] of Object.entries(result.gateChecks)) {
        lines.push(`- ${key}: ${check.pass ? 'pass' : 'fail'}`);
    }

    lines.push('', 'Blocking reasons:');
    if (result.blockingReasons.length === 0) {
        lines.push('- none');
    } else {
        for (const blocker of result.blockingReasons) {
            lines.push(`- ${blocker.code}: ${blocker.message}`);
        }
    }

    lines.push('', `Next action: ${result.nextAction}`);
    return lines.join('\n');
}

function main() {
    const options = parseArgs(process.argv);
    const result = routeCheck(options);

    if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
    }

    console.log(formatTextReport(result));

    if (!result.canEnter) {
        process.exitCode = 1;
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
    try {
        main();
    } catch (error) {
        printUsage();
        console.error(error.message);
        process.exit(1);
    }
}

export { routeCheck, formatTextReport };
