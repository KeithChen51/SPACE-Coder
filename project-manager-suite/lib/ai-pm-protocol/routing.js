/**
 * Traceability:
 * Rule sources:
 * - skills/ai-project-manager/references/core/runtime.md
 * - skills/ai-project-manager/references/core/routing.md
 * Consumed by:
 * - tools/route-check.mjs
 * - tools/bootstrap-host.mjs
 */
const routeTargets = {
    S1: {
        skill: 'brd-writer',
        exclusiveDeliverable: true
    },
    S2: {
        skill: 'page-chief',
        followUpSkills: ['prd-chief'],
        internalSkills: ['page-designer', 'page-explainer', 'foundation-builder', 'prd-writer'],
        exclusiveDeliverable: true,
        prerequisites: ['pageTaskRequired'],
        handoffGate: 'pageStageClosedForPrd'
    },
    S3: {
        skill: 'delivery-planner',
        exclusiveDeliverable: true
    },
    S4: {
        skill: 'coding-standards',
        exclusiveDeliverable: true
    },
    S5: {
        skill: 'prd-test-case-generator',
        exclusiveDeliverable: true
    },
    S6: {
        skill: 'test-case-runner',
        exclusiveDeliverable: true
    }
};

const gatingRules = {
    startupMinimum: {
        description: '启动最小必需字段包必须足以恢复上下文',
        fields: ['project_name', 'project_one_liner', 'target_users', 'main_problem', 'collaboration_mode'],
        blockOnMissing: true
    },
    pageTaskRequired: {
        description: '页面任务进入 S2 前必须补齐页面任务必补字段包',
        fields: ['coverage_scope', 'page_primary_user', 'page_primary_purpose', 'page_design_tag'],
        blockOnMissing: true
    },
    pageStageClosedForPrd: {
        description: 'S2 中只有页面环节被 page-chief 判定收口后，才允许切换到 prd-chief',
        evidence: [
            'page_delivery_exists',
            'page_code_files_exist',
            'explainer_files_complete',
            'interaction_status_locked',
            'no_unresolved_design_gap_or_logic_conflict'
        ],
        blockOnMissing: true
    },
    fullPrdReady: {
        description: '进入 S3/S5 前，完整版 PRD 必须已形成',
        evidence: ['full_prd_exists'],
        blockOnMissing: true
    },
    developmentPlanReady: {
        description: '进入 S4 前，开发计划必须明确',
        evidence: ['development_plan_exists'],
        blockOnMissing: true
    },
    buildAvailableForValidation: {
        description: '进入 S5 前，当前版本需要具备可验证基础',
        evidence: ['build_or_feature_available'],
        blockOnMissing: true
    },
    testCasesReady: {
        description: '进入 S6 前，测试用例必须已准备好',
        evidence: ['test_case_files_exist'],
        blockOnMissing: true
    },
    stageWritebackBeforeRouting: {
        description: '当前阶段变化时，必须先完成阶段切换日志回写，再进入子能力',
        evidence: ['stage_transition_logged'],
        blockOnMissing: true
    }
};

const pageDesignTagRules = [
    {
        when: {
            page_primary_user: ['车主', '客户', '终端用户', '会员', '消费者']
        },
        result: 'C端'
    },
    {
        when: {
            audience: 'internal',
            page_primary_purpose: ['业务处理', '内容展示']
        },
        result: 'B端'
    },
    {
        when: {
            audience: 'internal',
            page_primary_purpose: ['系统管理']
        },
        result: '后台'
    }
];

export { routeTargets, gatingRules, pageDesignTagRules };
