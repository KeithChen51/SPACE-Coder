/**
 * Traceability:
 * Rule sources:
 * - skills/00-01-ai-project-manager/references/core/runtime.md（阶段判断与回写时机）
 * - PIPELINE.md（宿主目录契约与产物落点）
 * Data sources:
 * - tools/route-check.mjs（routeCheck：阶段/门禁/阻断/下一步）
 * - tools/validate-global-files.mjs（权威文件识别）
 * Consumed by:
 * - lib/progress-dashboard/render.js
 * - tools/render-progress-dashboard.mjs
 *
 * 进度仪表盘采数层：只读宿主项目，聚合成 DashboardModel。
 * 语义约束（与对抗审查结论一致）：
 * - 门禁按 targetStage 条件挂载，须逐 target 运行 routeCheck 后按门禁名合并；
 * - “已产出”基于产物门禁，不等于人工验收通过；
 * - S7 结论只认 docs/security/ 报告的“最终结论”行（route-check 不读安全报告）；
 * - 一致性检查的 missing_active_task 是正常态（未开工/全部完成），不算“计划不一致”。
 */
import fs from 'fs';
import path from 'path';
import { validateGlobalFiles } from '../../tools/validate-global-files.mjs';
import { routeCheck } from '../../tools/route-check.mjs';
import { STAGE_IDS, FILE_ROLE_IDS } from '../ai-pm-protocol/constants.js';

const DASHBOARD_SCHEMA_VERSION = '1.0.0';

const STAGE_SEQUENCE = [
    STAGE_IDS.S0,
    STAGE_IDS.S0_5,
    STAGE_IDS.S1,
    STAGE_IDS.S2,
    STAGE_IDS.S3,
    STAGE_IDS.S4,
    STAGE_IDS.S5,
    STAGE_IDS.S6,
    STAGE_IDS.S7
];

// 门禁名 → 产出它的 targetStage（“错位一格”：某阶段的产物就绪门禁由下一阶段入口计算）
const GATE_TARGET_MAP = {
    startupMinimum: STAGE_IDS.S1,
    projectBaselineAuditReady: STAGE_IDS.S0_5,
    brdReadyForPage: STAGE_IDS.S2,
    pageTaskRequired: STAGE_IDS.S2,
    pageStageClosedForPrd: STAGE_IDS.S2,
    foundationReadyForPrd: STAGE_IDS.S2,
    fullPrdReady: STAGE_IDS.S3,
    foundationReadyForDevelopmentPlan: STAGE_IDS.S3,
    developmentPlanReady: STAGE_IDS.S4,
    buildAvailableForValidation: STAGE_IDS.S5,
    testCasesReady: STAGE_IDS.S6,
    securityScanReady: STAGE_IDS.S7
};

// “没有活跃任务指针”是正常态（未开工或全部完成），不构成“计划不一致”：
// - missing_active_task：看板无「进行中」行
// - missing_cockpit_active_task：驾驶舱的当前活跃字段为空或写成“无（全部完成）”类文字
// 真正的“对不上”是 mismatch / multiple_active 类冲突码。
const BENIGN_CONSISTENCY_TYPES = new Set(['missing_active_task', 'missing_cockpit_active_task']);

const KANBAN_STATUS_ORDER = ['进行中', '阻塞', '待审阅', '待开发', '已完成'];

const DEVLOG_FILE_PATTERN = /^(?:\d{8}_.+|\d{4}-\d{2}-\d{2})\.md$/;

function safeReadFile(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8');
    } catch {
        return null;
    }
}

function safeReadJson(filePath) {
    const content = safeReadFile(filePath);
    if (!content) return null;
    try {
        return JSON.parse(content);
    } catch {
        return null;
    }
}

function listFiles(dirPath) {
    try {
        return fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
        return [];
    }
}

function toRelative(hostRoot, targetPath) {
    if (!targetPath) return null;
    const absolute = path.isAbsolute(targetPath) ? targetPath : path.join(hostRoot, targetPath);
    return path.relative(hostRoot, absolute).split(path.sep).join('/');
}

// 与 check-plan-consistency.mjs 的 normalizeStatus 保持同一五态口径（该函数未导出，此处复刻并由测试钉住）
function normalizeKanbanStatus(text) {
    const value = String(text || '');
    if (value.includes('进行中')) return '进行中';
    if (value.includes('已完成')) return '已完成';
    if (value.includes('阻塞')) return '阻塞';
    if (value.includes('待审阅')) return '待审阅';
    if (value.includes('待开发')) return '待开发';
    return '';
}

function parseMarkdownTables(content) {
    const lines = String(content || '').split('\n');
    const tables = [];

    for (let index = 0; index < lines.length - 1; index += 1) {
        const headerLine = lines[index].trim();
        const separatorLine = lines[index + 1]?.trim() || '';
        if (!headerLine.startsWith('|') || !/^\|[\s:|-]+\|$/.test(separatorLine)) {
            continue;
        }

        const splitRow = (line) =>
            line
                .replace(/^\|/, '')
                .replace(/\|$/, '')
                .split('|')
                .map((cell) => cell.trim());

        const headers = splitRow(headerLine);
        const rows = [];
        let cursor = index + 2;
        while (cursor < lines.length) {
            const rowLine = lines[cursor].trim();
            if (!rowLine.startsWith('|')) break;
            const cells = splitRow(rowLine);
            if (cells.length === headers.length) {
                rows.push(cells);
            }
            cursor += 1;
        }

        tables.push({ headers, rows });
        index = cursor - 1;
    }

    return tables;
}

function findTableByHeaders(content, requiredHeaders) {
    return (
        parseMarkdownTables(content).find((table) =>
            requiredHeaders.every((header) => table.headers.includes(header))
        ) || null
    );
}

function collectSlugs(hostRoot) {
    const slugs = new Set();
    const patterns = [
        { dir: 'docs/brd', regex: /^ledger-state-(.+)\.json$/ },
        { dir: 'docs/brd', regex: /^brd-ledger-(.+)\.md$/ },
        { dir: 'src/frontend/page-preview', regex: /^page-ledger-(.+)\.json$/ },
        { dir: 'docs/prd', regex: /^prd-feature-list-(.+)\.md$/ },
        { dir: 'docs/plans/delivery-plans', regex: /^main-delivery-plan-(.+)\.md$/ }
    ];

    for (const { dir, regex } of patterns) {
        for (const entry of listFiles(path.join(hostRoot, dir))) {
            if (!entry.isFile()) continue;
            const match = entry.name.match(regex);
            if (match) slugs.add(match[1]);
        }
    }

    return Array.from(slugs).sort();
}

function runRouteChecks(hostRoot, warnings) {
    const runs = {};
    for (const stageId of STAGE_SEQUENCE) {
        try {
            runs[stageId] = routeCheck({ hostRoot, targetStage: stageId });
        } catch (error) {
            warnings.push({
                code: 'route_check_failed',
                area: `route-check(${stageId})`,
                message: error.message
            });
        }
    }

    try {
        runs.default = routeCheck({ hostRoot });
    } catch (error) {
        warnings.push({ code: 'route_check_failed', area: 'route-check(default)', message: error.message });
    }

    return runs;
}

function mergeGates(runs) {
    const gates = {};
    for (const [gateName, targetStage] of Object.entries(GATE_TARGET_MAP)) {
        const run = runs[targetStage];
        const gate = run?.gateChecks?.[gateName];
        if (gate) {
            gates[gateName] = { ...gate, fromTarget: targetStage };
        }
    }
    return gates;
}

function collectDevSection({ hostRoot, gates, warnings }) {
    const evidence = gates.developmentPlanReady?.evidence || null;
    const dev = {
        planExists: Boolean(evidence?.deliveryPlanExists),
        structureValid: Boolean(evidence?.structureValid),
        mainPlanPath: evidence?.deliveryPlanPath ? toRelative(hostRoot, evidence.deliveryPlanPath) : null,
        kanbanPath: null,
        tasks: [],
        counts: { total: 0, done: 0, inProgress: 0, todo: 0, review: 0, blocked: 0 },
        activeTask: null,
        noActiveTaskReason: null,
        planInconsistent: false,
        consistencyIssues: [],
        allTasksDone: false
    };

    if (!dev.planExists) {
        return dev;
    }

    const consistency = evidence?.planConsistency || null;
    if (consistency) {
        dev.consistencyIssues = Array.isArray(consistency.errors) ? consistency.errors : [];
        dev.planInconsistent = dev.consistencyIssues.some(
            (issue) => issue?.type && !BENIGN_CONSISTENCY_TYPES.has(issue.type)
        );

        const kanbanSource = consistency.sources?.taskKanban?.path || null;
        dev.kanbanPath = kanbanSource ? toRelative(hostRoot, kanbanSource) : null;

        if (consistency.activeTaskId && consistency.activeSubPlanPath && !dev.planInconsistent) {
            const subPlanAbsolute = path.isAbsolute(consistency.activeSubPlanPath)
                ? consistency.activeSubPlanPath
                : path.join(hostRoot, consistency.activeSubPlanPath);
            const subPlanContent = safeReadFile(subPlanAbsolute);
            let title = null;
            if (subPlanContent) {
                const headingMatch =
                    subPlanContent.match(
                        new RegExp(`^####\\s+${consistency.activeTaskId.replace('.', '\\.')}\\s+(.+)$`, 'm')
                    ) || subPlanContent.match(/^####\s+T\d+(?:\.\d+)*\s+(.+)$/m);
                if (headingMatch) {
                    title = headingMatch[1].trim();
                }
            }
            dev.activeTask = {
                id: consistency.activeTaskId,
                title,
                subPlanPath: toRelative(hostRoot, subPlanAbsolute)
            };
        }
    }

    if (!dev.kanbanPath && dev.mainPlanPath) {
        const slugMatch = path.basename(dev.mainPlanPath).match(/^main-delivery-plan-(.+)\.md$/);
        if (slugMatch) {
            const candidate = path.join(path.dirname(dev.mainPlanPath), `task-kanban-${slugMatch[1]}.md`);
            if (fs.existsSync(path.join(hostRoot, candidate))) {
                dev.kanbanPath = candidate.split(path.sep).join('/');
            }
        }
    }

    if (dev.kanbanPath) {
        const kanbanContent = safeReadFile(path.join(hostRoot, dev.kanbanPath));
        const table = kanbanContent ? findTableByHeaders(kanbanContent, ['Task', '状态']) : null;
        if (table) {
            const taskIndex = table.headers.indexOf('Task');
            const statusIndex = table.headers.indexOf('状态');
            const subPlanIndex = table.headers.indexOf('子开发计划');
            const dateIndex = table.headers.indexOf('完成日期');
            const noteIndex = table.headers.indexOf('备注');

            for (const row of table.rows) {
                const id = row[taskIndex] || '';
                if (!/^T\d+(?:\.\d+)*$/.test(id)) continue;
                const status = normalizeKanbanStatus(row[statusIndex]);
                dev.tasks.push({
                    id,
                    status,
                    rawStatus: row[statusIndex] || '',
                    subPlanCell: subPlanIndex >= 0 ? row[subPlanIndex] || '' : '',
                    completedDate: dateIndex >= 0 ? row[dateIndex] || '' : '',
                    note: noteIndex >= 0 ? row[noteIndex] || '' : ''
                });
            }
        } else if (kanbanContent) {
            warnings.push({
                code: 'parse_failed',
                area: 'task-kanban',
                message: `任务看板里没有找到含 Task/状态 列的表格：${dev.kanbanPath}`
            });
        }
    }

    dev.counts.total = dev.tasks.length;
    for (const task of dev.tasks) {
        if (task.status === '已完成') dev.counts.done += 1;
        else if (task.status === '进行中') dev.counts.inProgress += 1;
        else if (task.status === '待审阅') dev.counts.review += 1;
        else if (task.status === '阻塞') dev.counts.blocked += 1;
        else dev.counts.todo += 1;
    }

    dev.allTasksDone = dev.counts.total > 0 && dev.counts.done === dev.counts.total;

    if (dev.counts.total > 0 && dev.counts.inProgress === 0 && !dev.planInconsistent) {
        dev.noActiveTaskReason = dev.allTasksDone ? 'all_done' : 'not_started';
    }

    return dev;
}

function collectS2Section({ hostRoot, gates, slug }) {
    const s2 = {
        brdPhase: null,
        pageLedger: null,
        featureList: null,
        substeps: {
            page: Boolean(gates.pageStageClosedForPrd?.pass),
            foundation: Boolean(
                gates.foundationReadyForDevelopmentPlan?.pass || gates.foundationReadyForPrd?.pass
            ),
            prd: Boolean(gates.fullPrdReady?.pass)
        },
        // 页面草稿已产出但环节未收口（交互说明还没确认完）——给子环节一个"进行中"中间态
        pageDraftExists: Boolean(gates.pageStageClosedForPrd?.evidence?.pageDeliveryExists)
    };

    if (!slug) return s2;

    const brdLedger = safeReadJson(path.join(hostRoot, 'docs/brd', `ledger-state-${slug}.json`));
    if (brdLedger?.header?.current_phase) {
        s2.brdPhase = String(brdLedger.header.current_phase);
    }

    const pageLedger = safeReadJson(
        path.join(hostRoot, 'src/frontend/page-preview', `page-ledger-${slug}.json`)
    );
    if (pageLedger && Number.isInteger(pageLedger.phase)) {
        s2.pageLedger = { phase: pageLedger.phase, loopRound: pageLedger.loopRound ?? 0 };
    }

    const featureListPath = path.join(hostRoot, 'docs/prd', `prd-feature-list-${slug}.md`);
    const featureListContent = safeReadFile(featureListPath);
    if (featureListContent) {
        const table = findTableByHeaders(featureListContent, ['区块', '状态']);
        if (table) {
            const statusIndex = table.headers.indexOf('状态');
            let confirmed = 0;
            let pending = 0;
            for (const row of table.rows) {
                const status = row[statusIndex] || '';
                if (status.includes('已确认')) confirmed += 1;
                else pending += 1;
            }
            s2.featureList = {
                confirmed,
                pending,
                total: table.rows.length,
                sourcePath: toRelative(hostRoot, featureListPath)
            };
        }
    }

    return s2;
}

function collectQualitySection({ hostRoot, gates, warnings }) {
    const quality = {
        testCases: null,
        execution: null,
        defects: null,
        security: { conclusion: null, reportPath: null }
    };

    const tcEvidence = gates.testCasesReady?.evidence || null;
    if (tcEvidence) {
        quality.testCases = {
            ready: Boolean(gates.testCasesReady?.pass),
            tcMainExists: Boolean(tcEvidence.tcMainExists),
            tcMainPath: tcEvidence.tcMainPath ? toRelative(hostRoot, tcEvidence.tcMainPath) : null,
            domainCount: tcEvidence.domainTcCount ?? 0
        };
    }

    const reportsDir = path.join(hostRoot, 'docs/test-case/reports');
    const indexContent = safeReadFile(path.join(reportsDir, 'index.md'));
    if (indexContent) {
        const table = findTableByHeaders(indexContent, ['业务域', '状态']);
        if (table) {
            const domainIndex = table.headers.indexOf('业务域');
            const casesIndex = table.headers.indexOf('用例数');
            const statusIndex = table.headers.indexOf('状态');
            const domains = table.rows.map((row) => {
                const statusText = row[statusIndex] || '';
                const looksDone =
                    !/⏳|进行中|待执行|BLOCKED/i.test(statusText) && /✅|PASS|完成/i.test(statusText);
                return {
                    name: row[domainIndex] || '',
                    cases: casesIndex >= 0 ? row[casesIndex] || '' : '',
                    statusText,
                    done: looksDone
                };
            });

            const totals = { pass: 0, fail: 0, blocked: 0, cases: 0, statedDomains: 0 };
            for (const domain of domains) {
                const reportContent = safeReadFile(path.join(reportsDir, `测试验收-${domain.name}.md`));
                if (!reportContent) continue;
                const statLines = [
                    ...reportContent.matchAll(
                        /用例总数[:：]\s*(\d+)\s*\|\s*PASS[:：]\s*(\d+)\s*\|\s*FAIL[:：]\s*(\d+)\s*\|\s*BLOCKED[:：]\s*(\d+)/g
                    )
                ];
                const latest = statLines[statLines.length - 1];
                if (latest) {
                    totals.statedDomains += 1;
                    totals.cases += Number(latest[1]);
                    totals.pass += Number(latest[2]);
                    totals.fail += Number(latest[3]);
                    totals.blocked += Number(latest[4]);
                }
            }

            quality.execution = {
                domains,
                allDone: domains.length > 0 && domains.every((domain) => domain.done),
                totals: totals.statedDomains > 0 ? totals : null,
                sourcePath: toRelative(hostRoot, path.join(reportsDir, 'index.md'))
            };
        } else {
            warnings.push({
                code: 'parse_failed',
                area: 'test-reports',
                message: '测试报告 index.md 存在，但没有解析到“业务域/状态”进度表'
            });
        }
    }

    const defectsContent = safeReadFile(path.join(reportsDir, 'defects.md'));
    if (defectsContent) {
        const table = findTableByHeaders(defectsContent, ['严重度', '状态']);
        if (table) {
            const severityIndex = table.headers.indexOf('严重度');
            const statusIndex = table.headers.indexOf('状态');
            let open = 0;
            let p0p1Open = 0;
            for (const row of table.rows) {
                const status = row[statusIndex] || '';
                const isOpen = /OPEN|RETEST-FAIL/i.test(status);
                if (isOpen) {
                    open += 1;
                    if (/P0|P1/i.test(row[severityIndex] || '')) p0p1Open += 1;
                }
            }
            quality.defects = {
                total: table.rows.length,
                open,
                p0p1Open,
                sourcePath: toRelative(hostRoot, path.join(reportsDir, 'defects.md'))
            };
        }
    }

    const securityDir = path.join(hostRoot, 'docs/security');
    let latestConclusion = null;
    for (const entry of listFiles(securityDir)) {
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
        const filePath = path.join(securityDir, entry.name);
        const content = safeReadFile(filePath);
        if (!content) continue;
        const match = content.match(/最终结论[:：]\s*([^\n]+)/);
        if (!match) continue;
        const rawValue = match[1].replace(/`/g, '').trim();
        // 模板占位是 “PASS / BLOCK / WAIVER” 三选一原样串，含多个候选词的视为未填写
        const hits = ['PASS', 'BLOCK', 'WAIVER'].filter((word) =>
            new RegExp(`\\b${word}\\b`, 'i').test(rawValue)
        );
        if (hits.length !== 1) continue;
        const mtime = fs.statSync(filePath).mtimeMs;
        if (!latestConclusion || mtime > latestConclusion.mtime) {
            latestConclusion = { conclusion: hits[0].toUpperCase(), reportPath: filePath, mtime };
        }
    }
    if (latestConclusion) {
        quality.security = {
            conclusion: latestConclusion.conclusion,
            reportPath: toRelative(hostRoot, latestConclusion.reportPath)
        };
    }

    return quality;
}

function collectTimeline({ hostRoot, limit = 3 }) {
    const logsDir = path.join(hostRoot, 'logs');
    const files = listFiles(logsDir)
        .filter((entry) => entry.isFile() && DEVLOG_FILE_PATTERN.test(entry.name))
        .map((entry) => entry.name)
        .sort()
        .reverse()
        .slice(0, limit);

    const timeline = [];
    for (const fileName of files) {
        const content = safeReadFile(path.join(logsDir, fileName));
        if (!content) continue;
        const table = findTableByHeaders(content, ['任务', '状态']);
        const entries = table
            ? table.rows.slice(0, 6).map((row) => ({
                  title: row[table.headers.indexOf('任务')] || '',
                  rel: table.headers.indexOf('关联') >= 0 ? row[table.headers.indexOf('关联')] || '' : '',
                  statusMark: row[table.headers.indexOf('状态')] || ''
              }))
            : [];
        const dateMatch = fileName.match(/^(\d{4})(\d{2})(\d{2})_/) || fileName.match(/^(\d{4})-(\d{2})-(\d{2})/);
        timeline.push({
            file: `logs/${fileName}`,
            date: dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : fileName,
            entries
        });
    }

    return timeline;
}

function buildRail({ runs, gates, dev, quality, warnings }) {
    const baselineAuditPresent = Boolean(gates.projectBaselineAuditReady?.evidence?.auditPath);

    const producedMap = {
        [STAGE_IDS.S0]: Boolean(gates.startupMinimum?.pass),
        [STAGE_IDS.S0_5]:
            Boolean(gates.projectBaselineAuditReady?.pass) &&
            gates.projectBaselineAuditReady?.evidence?.status === 'ready' &&
            gates.projectBaselineAuditReady?.evidence?.recommendedNextSkill === null,
        [STAGE_IDS.S1]: Boolean(gates.brdReadyForPage?.pass),
        [STAGE_IDS.S2]: Boolean(gates.fullPrdReady?.pass),
        [STAGE_IDS.S3]: dev.planExists && dev.structureValid && !dev.planInconsistent,
        [STAGE_IDS.S4]: dev.allTasksDone,
        [STAGE_IDS.S5]: Boolean(gates.testCasesReady?.pass),
        [STAGE_IDS.S6]: Boolean(quality.execution?.allDone),
        [STAGE_IDS.S7]:
            quality.security.conclusion === 'PASS' || quality.security.conclusion === 'WAIVER'
    };

    const sequence = STAGE_SEQUENCE.filter(
        (stageId) => stageId !== STAGE_IDS.S0_5 || baselineAuditPresent
    );

    let anchor = null;
    for (const stageId of sequence) {
        if (!producedMap[stageId]) {
            anchor = stageId;
            break;
        }
    }

    const anchorRun = anchor ? runs[anchor] : null;
    const anchorBlockers = anchorRun?.blockingReasons || [];
    // 两类"伪阻断"不算受阻：
    // 1. 全新项目"基本信息未聊全"是正常起点（S0）；
    // 2. 计划排好但尚未开工时，S4 入场门禁因"无进行中任务"报 status_inconsistent——
    //    实际没有任何状态冲突（missing_active_task 是良性码），只是等用户说开工。
    const meaningfulBlockers = (() => {
        if (anchor === STAGE_IDS.S0) {
            return anchorBlockers.filter((item) => item.code !== 'startup_minimum_missing');
        }
        if (anchor === STAGE_IDS.S4 && dev.noActiveTaskReason === 'not_started' && !dev.planInconsistent) {
            return anchorBlockers.filter((item) => item.code !== 'development_plan_status_inconsistent');
        }
        return anchorBlockers;
    })();

    const rail = sequence.map((stageId) => {
        let status;
        if (producedMap[stageId]) {
            status = 'produced';
        } else if (stageId === anchor) {
            status = meaningfulBlockers.length > 0 ? 'blocked' : 'active';
        } else {
            status = 'pending';
        }
        if (stageId === STAGE_IDS.S7 && quality.security.conclusion === 'BLOCK') {
            status = 'blocked';
        }
        return { id: stageId, status };
    });

    const declared = runs.default?.currentStage || null;
    let stageConflict = false;
    if (declared && anchor) {
        const declaredIndex = STAGE_SEQUENCE.indexOf(declared);
        const anchorIndex = STAGE_SEQUENCE.indexOf(anchor);
        if (declaredIndex > anchorIndex) {
            stageConflict = true;
            warnings.push({
                code: 'stage_conflict',
                area: 'stage',
                message: `项目记录里写的当前阶段是 ${declared}，但实际产出只支撑到 ${anchor}；本页以实际产出为准显示，请与 AI 核对一下项目阶段`
            });
        }
    }

    return { rail, anchor, producedMap, stageConflict, anchorBlockers, meaningfulBlockers, anchorRun };
}

function collectDashboardModel({ hostRoot }) {
    const resolvedHostRoot = path.resolve(hostRoot || '.');
    if (!fs.existsSync(resolvedHostRoot) || !fs.statSync(resolvedHostRoot).isDirectory()) {
        throw new Error(`宿主项目目录不存在：${resolvedHostRoot}`);
    }

    const warnings = [];
    const validation = validateGlobalFiles({ hostRoot: resolvedHostRoot });
    const effectiveRoot = validation.hostRoot || resolvedHostRoot;

    const runs = runRouteChecks(effectiveRoot, warnings);
    const gates = mergeGates(runs);

    const slugs = collectSlugs(effectiveRoot);
    if (slugs.length > 1) {
        warnings.push({
            code: 'multiple_slugs',
            area: 'slug',
            message: `检测到多套项目产物（${slugs.join('、')}）。本套件按单项目宿主设计，页面数据可能混淆`
        });
    }
    const slug = slugs[0] || null;

    const dev = collectDevSection({ hostRoot: effectiveRoot, gates, warnings });
    const s2 = collectS2Section({ hostRoot: effectiveRoot, gates, slug });
    const quality = collectQualitySection({ hostRoot: effectiveRoot, gates, warnings });
    const timeline = collectTimeline({ hostRoot: effectiveRoot });

    if (dev.planInconsistent) {
        warnings.push({
            code: 'plan_inconsistent',
            area: 'delivery-plan',
            message: '几份开发计划文件里的任务状态对不上。请对 AI 说「校正开发计划的任务状态」，校正后再看任务进度'
        });
    }

    const { rail, anchor, producedMap, stageConflict, anchorBlockers, meaningfulBlockers, anchorRun } =
        buildRail({
            runs,
            gates,
            dev,
            quality,
            warnings
        });

    const defaultRun = runs.default || null;

    return {
        schemaVersion: DASHBOARD_SCHEMA_VERSION,
        generatedAt: new Date().toISOString(),
        hostRoot: effectiveRoot,
        project: {
            name: defaultRun?.context?.profileSummary?.projectName || null,
            oneLiner: defaultRun?.context?.profileSummary?.projectOneLiner || null,
            slug
        },
        stage: {
            declared: defaultRun?.currentStage || null,
            recommended: defaultRun?.recommendedStage || null,
            anchor,
            conflict: stageConflict,
            allDone: anchor === null
        },
        rail,
        producedMap,
        gates,
        anchorBlockers,
        anchorMeaningfulBlockers: meaningfulBlockers,
        nextActionRaw: anchorRun?.nextAction || defaultRun?.nextAction || null,
        routeTargetSkill: anchorRun?.routeTarget?.skill || null,
        pendingItems: {
            profile: defaultRun?.context?.pendingItems?.profile || [],
            plan: defaultRun?.context?.pendingItems?.plan || []
        },
        currentRoundDeliverable: defaultRun?.context?.currentRoundDeliverable || null,
        dev,
        s2,
        baseline: defaultRun?.context?.baselineAudit || null,
        quality,
        timeline,
        warnings,
        sources: {
            profile: validation.authority?.[FILE_ROLE_IDS.PROFILE] || null,
            plan: validation.authority?.[FILE_ROLE_IDS.PLAN] || null,
            rules: validation.authority?.[FILE_ROLE_IDS.RULES] || null,
            devlog: validation.authority?.[FILE_ROLE_IDS.DEVLOG] || null,
            mainPlan: dev.mainPlanPath,
            kanban: dev.kanbanPath,
            activeSubPlan: dev.activeTask?.subPlanPath || null,
            reportsIndex: quality.execution?.sourcePath || null,
            defects: quality.defects?.sourcePath || null,
            securityReport: quality.security.reportPath,
            featureList: s2.featureList?.sourcePath || null
        }
    };
}

export {
    collectDashboardModel,
    normalizeKanbanStatus,
    parseMarkdownTables,
    findTableByHeaders,
    STAGE_SEQUENCE,
    GATE_TARGET_MAP,
    BENIGN_CONSISTENCY_TYPES,
    DASHBOARD_SCHEMA_VERSION
};
