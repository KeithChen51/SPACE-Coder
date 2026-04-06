/**
 * Traceability:
 * Rule sources:
 * - skills/ai-project-manager/references/core/runtime.md
 * - skills/ai-project-manager/references/core/routing.md
 * Consumed by:
 * - tools/route-check.mjs
 */
import { STAGE_IDS } from './constants.js';

const stages = [
    {
        id: STAGE_IDS.S0,
        name: '需求调研',
        signals: ['需求仍在访谈和业务理解层', '尚未形成正式需求文档'],
        minimumDeliverable: '需求清单',
        ownerSkill: null,
        gatekeeping: ['startupMinimum']
    },
    {
        id: STAGE_IDS.S1,
        name: '业务需求文档',
        signals: ['调研信息基本齐全', '需要形成可评审的业务需求文档'],
        minimumDeliverable: '业务需求文档 / BRD',
        ownerSkill: 'toxic-commercial-pm',
        gatekeeping: ['startupMinimum']
    },
    {
        id: STAGE_IDS.S2,
        name: '页面构建与完整版 PRD',
        signals: ['已有业务需求文档', '需要先通过页面原型固化结构和交互，再沉淀完整 PRD'],
        minimumDeliverable: '首轮：页面原型 / 页面代码 + 待确认项；确认后：完整版 PRD',
        ownerSkill: 'ui-ux-pro-max -> prd-writer',
        gatekeeping: ['startupMinimum', 'pageTaskRequired', 'pagePrototypeConfirmedForPrd']
    },
    {
        id: STAGE_IDS.S3,
        name: '任务拆解与开发计划',
        signals: ['完整版 PRD 已形成', '需要拆成开发任务并形成开发计划'],
        minimumDeliverable: '任务清单 + 执行顺序建议 + 待确认项',
        ownerSkill: 'delivery-planner',
        gatekeeping: ['startupMinimum', 'fullPrdReady']
    },
    {
        id: STAGE_IDS.S4,
        name: '开发执行',
        signals: ['开发计划已明确', '可以进入编码、联调和实现'],
        minimumDeliverable: '当前任务的执行结果 + 任务状态更新 + 问题/决策记录',
        ownerSkill: 'coding-standards',
        gatekeeping: ['startupMinimum', 'developmentPlanReady']
    },
    {
        id: STAGE_IDS.S5,
        name: '测试用例生成',
        signals: ['开发执行已完成，或当前版本已具备可验证基础', '需要基于 PRD 生成标准化测试用例'],
        minimumDeliverable: '单域测试用例文件 + 验收矩阵 + 版本历史',
        ownerSkill: 'prd-test-case-generator',
        gatekeeping: ['fullPrdReady', 'buildAvailableForValidation']
    },
    {
        id: STAGE_IDS.S6,
        name: '测试执行',
        signals: ['测试用例已准备好', '需要执行测试并记录问题'],
        minimumDeliverable: '验收结论 + 不符合项清单 + 补缺建议 + 阶段收口建议',
        ownerSkill: 'test-case-runner',
        gatekeeping: ['testCasesReady']
    }
];

const stageDecisionRules = [
    '多个阶段可选时，优先较早阶段',
    '缺关键业务信息时不跳过 S0',
    '用户要求先给方案时进入 S1 或 S2',
    '用户要求拆任务、拆开发任务、制定开发计划时进入 S3',
    '用户要求实现某模块但上下文不足时，先补上下文再进入 S3/S4',
    '当前阶段与推荐阶段冲突时，先解释差异再更新画像',
    'S2 页面原型未产出前，不得提前交付完整版 PRD',
    'S2 页面原型未确认前，不得进入 S3'
];

const globalCompanionAbilities = [
    {
        skill: 'project-devlog',
        triggers: [
            'new_stage_deliverable',
            'stage_changed',
            'effective_progress_made',
            'need_handover_for_next_round'
        ]
    }
];

export { stages, stageDecisionRules, globalCompanionAbilities };
