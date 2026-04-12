/**
 * Traceability:
 * Rule sources:
 * - docs/ai-project-manager-scriptification-plan.md
 * Consumed by:
 * - tools/check-protocol-alignment.mjs
 */

const changeImpactMap = {
    entryIdentity: {
        description: '主入口身份、默认第一入口定位、核心红线与上位边界',
        currentAuthority: ['skills/ai-project-manager/SKILL.md'],
        targetAuthority: ['lib/ai-pm-protocol/bootstrap.js', 'lib/bootstrap/index.js'],
        checkAlso: [
            'skills/ai-project-manager/references/core/runtime.md',
            'skills/ai-project-manager/references/core/routing.md',
            'lib/ai-pm-protocol/stages.js',
            'lib/ai-pm-protocol/routing.js',
            'tools/route-check.mjs'
        ]
    },
    startupInterview: {
        description: '首轮访谈的必问字段、追问条件、展示顺序与停机条件',
        currentAuthority: ['skills/ai-project-manager/references/core/runtime.md'],
        targetAuthority: ['lib/ai-pm-protocol/interview.js'],
        checkAlso: [
            'lib/ai-pm-protocol/field-contracts.js',
            'skills/ai-project-manager/assets/global-files/project-profile.md',
            'tools/bootstrap-host.mjs',
            'tools/validate-global-files.mjs'
        ]
    },
    runtimeFlow: {
        description: '主入口 Step 0 到 Step 5 的执行顺序、脚本优先和回退条件',
        currentAuthority: ['skills/ai-project-manager/references/core/runtime.md'],
        targetAuthority: ['lib/ai-pm-protocol/runtime-flow.js'],
        checkAlso: [
            'tools/route-check.mjs',
            'tools/devlog-sync.mjs',
            'hooks/session-start'
        ]
    },
    stageDefinitions: {
        description: '阶段定义、最小交付物、默认 owner skill 与 gatekeeping 入口',
        currentAuthority: [
            'skills/ai-project-manager/references/core/runtime.md',
            'skills/ai-project-manager/references/core/routing.md'
        ],
        targetAuthority: ['lib/ai-pm-protocol/constants.js', 'lib/ai-pm-protocol/stages.js'],
        checkAlso: [
            'skills/ai-project-manager/assets/global-files/project-profile.md',
            'tools/route-check.mjs'
        ]
    },
    s2PageProtocol: {
        description: 'S2 页面先行协议、页面字段包门禁、确认后再进入 prd-writer 的条件',
        currentAuthority: ['skills/ai-project-manager/references/core/runtime.md'],
        targetAuthority: ['lib/ai-pm-protocol/routing.js'],
        checkAlso: [
            'lib/ai-pm-protocol/stages.js',
            'lib/ai-pm-protocol/field-contracts.js',
            'skills/ai-project-manager/assets/global-files/project-profile.md',
            'tools/route-check.mjs'
        ]
    },
    scaffoldPolicy: {
        description: '宿主根目录判定、基础骨架、阶段触发目录与安装迁移策略',
        currentAuthority: ['skills/ai-project-manager/references/core/routing.md'],
        targetAuthority: ['lib/ai-pm-protocol/scaffold.js'],
        checkAlso: [
            'tools/bootstrap-host.mjs',
            'tools/generate-host-rules.mjs',
            'tools/install-suite-into-host.mjs'
        ]
    },
    profileFieldContracts: {
        description: '项目画像字段合同、字段级别、字段来源与字段包',
        currentAuthority: ['skills/ai-project-manager/references/core/global-files-protocol.md'],
        targetAuthority: ['lib/ai-pm-protocol/field-contracts.js'],
        checkAlso: [
            'skills/ai-project-manager/assets/global-files/project-profile.md',
            'tools/validate-global-files.mjs',
            'tools/route-check.mjs',
            'tools/bootstrap-host.mjs'
        ]
    },
    profileTemplate: {
        description: '项目画像模板的字段标签、章节落点与默认占位内容',
        currentAuthority: ['skills/ai-project-manager/assets/global-files/project-profile.md'],
        targetAuthority: ['skills/ai-project-manager/assets/global-files/project-profile.md'],
        checkAlso: [
            'lib/ai-pm-protocol/field-contracts.js',
            'lib/ai-pm-protocol/stages.js',
            'tools/bootstrap-host.mjs',
            'tools/route-check.mjs'
        ]
    }
};

export { changeImpactMap };
