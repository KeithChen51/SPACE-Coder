/**
 * Traceability:
 * Rule sources:
 * - skills/00-01-ai-project-manager/references/core/runtime.md（阶段判断表）
 * - PIPELINE.md（阶段产物语义）
 * Consumed by:
 * - lib/progress-dashboard/render.js
 * - tools/render-progress-dashboard.mjs
 *
 * 本文件是进度仪表盘的“白话文案层”：把协议里的操作者术语（阶段名、阻断码、skill 名）
 * 翻译成业务同事能直接读懂的说法。展示层专用，不是协议配置——阶段定义仍以
 * lib/ai-pm-protocol/stages.js 为准，这里只提供人话别名。
 */
import { STAGE_IDS } from '../ai-pm-protocol/constants.js';

// 每个阶段的白话主标 / 一句话副标 / “已产出”态的诚实措辞（产出≠人工验收通过）
const stageCopy = {
    [STAGE_IDS.S0]: {
        plain: '需求梳理',
        sub: '把想做什么聊清楚',
        producedLabel: '需求信息已聊清'
    },
    [STAGE_IDS.S0_5]: {
        plain: '已有代码体检',
        sub: '盘点现有项目，找出缺的文档',
        producedLabel: '体检完成'
    },
    [STAGE_IDS.S1]: {
        plain: '需求文档',
        sub: '把需求写成一份大家认可的文档',
        producedLabel: '需求文档已产出'
    },
    [STAGE_IDS.S2]: {
        plain: '页面与方案设计',
        sub: '把页面样子和技术底子定下来，写清楚怎么做',
        producedLabel: '设计与规格已产出'
    },
    [STAGE_IDS.S3]: {
        plain: '排开发计划',
        sub: '把要做的事拆成一件件任务',
        producedLabel: '开发计划已排好'
    },
    [STAGE_IDS.S4]: {
        plain: '开发实施',
        sub: '按任务清单一项项写代码',
        producedLabel: '全部任务已完成'
    },
    [STAGE_IDS.S5]: {
        plain: '准备测试',
        sub: '为每个功能准备测试用例',
        producedLabel: '测试用例已备好'
    },
    [STAGE_IDS.S6]: {
        plain: '测试验收',
        sub: '逐条跑测试，记录问题',
        producedLabel: '测试已跑完'
    },
    [STAGE_IDS.S7]: {
        plain: '安全检查',
        sub: '交付前最后一道安全关卡',
        producedLabel: '安全检查已通过'
    }
};

// S2 内部三个子环节
const s2SubstepCopy = {
    page: { plain: '页面设计', sub: '先把页面做出来给你确认' },
    foundation: { plain: '技术底子', sub: '定术语、数据结构和接口' },
    prd: { plain: '详细规格', sub: '写成 AI 能直接照做的规格书' }
};

// route-check 阻断码 → 业务白话（原文只进“工程师详情”折叠区）
const blockerCopy = {
    startup_minimum_missing: '项目的基本信息还没聊全（叫什么、做什么、给谁用、解决什么问题）',
    baseline_audit_missing: '还没给现有代码做体检，先体检才知道缺什么文档',
    brd_missing: '需求文档还没写出来，先把需求定下来才能设计页面',
    page_task_required_missing: '页面给谁用、主要做什么还没确认，需要你回答几个问题',
    full_prd_missing: '详细规格（PRD）还没写齐，写齐才能拆任务',
    foundation_missing: '技术底子（术语、数据结构、接口）还没定好',
    build_available_for_validation_missing: '开发还没到可以测试的程度',
    development_plan_missing: '开发计划还没排出来',
    development_plan_invalid: '开发计划文件不完整，需要先修好',
    development_plan_status_inconsistent: '几份计划文件里的任务状态对不上，需要先校正',
    test_cases_missing: '测试用例还没准备好',
    security_scan_inputs_missing: '安全检查需要的测试报告还没备齐',
    stage_transition_writeback_missing: '上一步的推进记录还没写日志，补上才能进下一步'
};

const genericBlockerText = '有一项前置条件还没满足（详情见下方“工程师详情”）';

// 下一步承接者（skill 名）→ 白话动作
const skillNextCopy = {
    'ai-project-manager': '和 AI 聊几句，把缺的信息补齐',
    'project-baseline-auditor': '让 AI 给现有项目做一次体检',
    'brd-writer': '让 AI 把需求整理成文档',
    'page-chief': '让 AI 把页面做出来给你确认',
    'page-designer': '让 AI 把页面做出来给你确认',
    'page-explainer': '让 AI 把页面的交互逻辑写清楚并和你确认',
    'prd-chief': '让 AI 把技术底子和详细规格写出来',
    'foundation-builder': '让 AI 定好术语、数据结构和接口',
    'prd-writer': '让 AI 写详细规格（PRD）',
    'delivery-planner': '让 AI 把活儿拆成任务、排出开发计划',
    'coding-standards': '让 AI 按计划继续写代码',
    'test-case-chief': '让 AI 准备测试用例',
    'test-case-runner': '让 AI 逐条跑测试',
    'test-and-acceptance': '和 AI 一起做人工验收',
    'security-scan': '让 AI 做交付前安全检查'
};

const railStatusCopy = {
    produced: '已产出',
    active: '进行中',
    pending: '未开始',
    blocked: '受阻'
};

const securityConclusionCopy = {
    PASS: { label: '通过', tone: 'good', text: '安全检查已通过，可以放行' },
    WAIVER: { label: '有条件放行', tone: 'warning', text: '安全检查有豁免项，凭书面豁免放行（注意失效日期）' },
    BLOCK: { label: '不放行', tone: 'critical', text: '安全检查发现阻断问题，修复前不能交付' }
};

/**
 * 组装“下一步做什么”的白话句。
 * 优先级：真阻断 → 承接 skill 的白话动作 → 通用兜底。
 */
function buildNextStepText({ blockers = [], routeTargetSkill = null, anchorStage = null, allDone = false }) {
    if (allDone) {
        return '全流程已走完。如需交付，确认安全检查结论后即可收尾。';
    }

    const knownBlocker = blockers.find((item) => blockerCopy[item.code]);
    if (knownBlocker) {
        return `先解决：${blockerCopy[knownBlocker.code]}`;
    }
    if (blockers.length > 0) {
        return `先解决：${genericBlockerText}`;
    }

    if (routeTargetSkill && skillNextCopy[routeTargetSkill]) {
        return skillNextCopy[routeTargetSkill];
    }

    const stage = anchorStage && stageCopy[anchorStage];
    if (stage) {
        return `继续推进「${stage.plain}」：${stage.sub}`;
    }

    return '和 AI 说「继续推进项目」，由它判断下一步。';
}

function blockerPlainText(code) {
    return blockerCopy[code] || genericBlockerText;
}

export {
    stageCopy,
    s2SubstepCopy,
    blockerCopy,
    genericBlockerText,
    skillNextCopy,
    railStatusCopy,
    securityConclusionCopy,
    buildNextStepText,
    blockerPlainText
};
