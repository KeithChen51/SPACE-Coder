#!/usr/bin/env node

/**
 * validate-plan-structure.mjs
 *
 * Traceability:
 *   Rule sources:
 *     - skills/delivery-planner/SKILL.md (Step 5 产出自检)
 *     - skills/delivery-planner/references/quality-gates.md
 *
 * Location:
 *   skills/delivery-planner/scripts/validate-plan-structure.mjs
 *   （delivery-planner 专属产出校验脚本）
 *
 * Purpose:
 *   Validate a delivery plan markdown file against the "完整执行计划协议":
 *     - 13 required sections (chapters)
 *     - 7 required Task fields per task block
 *     - High-risk vague words detection
 *
 *   Outputs a structured validation report (JSON or human-readable).
 *
 * Usage:
 *   node <suite-path>/skills/delivery-planner/scripts/validate-plan-structure.mjs <plan-file> [--json]
 *
 * Exit codes:
 *   0 – all checks passed
 *   1 – fatal error (file not found, unreadable)
 *   2 – validation failed (missing sections or fields)
 */

import fs from 'fs';
import path from 'path';
import process from 'process';

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * The 13 required sections from the "完整执行计划协议".
 * Each entry is a regex that matches the expected heading.
 */
const REQUIRED_SECTIONS = [
    { id: 'meta',            label: '计划头部元信息',        pattern: /^#+\s.*(?:版本|发布日期|适用范围|元信息)/m },
    { id: 'guide',           label: '本计划使用指南',        pattern: /^#+\s.*使用指南/m },
    { id: 'prd-constraint',  label: 'PRD 加载约束',         pattern: /^#+\s.*PRD\s*加载约束/m },
    { id: 'pre-gate',        label: '读前门禁 / AI 自检清单', pattern: /^#+\s.*(?:读前门禁|AI\s*自检)/m },
    { id: 'post-gate',       label: '完成前验证门禁',        pattern: /^#+\s.*完成前验证/m },
    { id: 'gap-baseline',    label: '差距基线',             pattern: /^#+\s.*差距基线/m },
    { id: 'roles',           label: '分工与边界',           pattern: /^#+\s.*分工与边界/m },
    { id: 'phases',          label: '执行阶段',             pattern: /^#+\s.*(?:执行阶段|Phase)/m },
    { id: 'kanban',          label: '任务看板',             pattern: /^#+\s.*任务看板/m },
    { id: 'release-gate',    label: '发布闸门',             pattern: /^#+\s.*发布闸门/m },
    { id: 'risks',           label: '风险与应对',           pattern: /^#+\s.*风险与应对/m },
    { id: 'ai-example',      label: 'AI 执行示例',          pattern: /^#+\s.*AI\s*执行示例/m },
    { id: 'prd-index',       label: 'PRD → 任务反向索引',    pattern: /^#+\s.*PRD\s*→?\s*任务反向索引/m },
];

/**
 * The 7 required Task fields.
 * We look for these as bold labels within task blocks.
 */
const REQUIRED_TASK_FIELDS = [
    { id: 'prd-link',    label: 'PRD 双链·读',  pattern: /\*\*PRD\s*双链[·.]?\s*读\*\*/ },
    { id: 'core-logic',  label: '核心逻辑',     pattern: /\*\*核心逻辑\*\*/ },
    { id: 'core-files',  label: '核心文件',     pattern: /\*\*核心文件\*\*/ },
    { id: 'done-criteria',label: '完成标准',    pattern: /\*\*完成标准\*\*/ },
    { id: 'owner',       label: 'Owner',       pattern: /\*\*Owner\*\*/ },
    { id: 'dependency',  label: '前置',        pattern: /\*\*前置\*\*/ },
    { id: 'status',      label: '状态',        pattern: /\*\*状态\*\*/ },
];

/**
 * High-risk vague words that should NOT appear in completion criteria.
 */
const VAGUE_WORDS = [
    '数据完整',
    '配置补齐',
    '链路打通',
    '符合预期',
    '正常运行',
    '无明显问题',
    '基本可用',
];

// ─── Arg parsing ─────────────────────────────────────────────────────────────

function printUsage() {
    console.log(
        'Usage: node <suite-path>/skills/delivery-planner/scripts/validate-plan-structure.mjs <plan-file> [--json]'
    );
}

function parseArgs(argv) {
    const args = argv.slice(2);
    const options = {
        planFile: '',
        json: false,
    };

    for (const arg of args) {
        if (arg === '--json') { options.json = true; continue; }
        if (!options.planFile) { options.planFile = arg; continue; }
        throw new Error(`Unknown argument: ${arg}`);
    }

    if (!options.planFile) throw new Error('Missing <plan-file> argument.');
    return options;
}

// ─── Validation logic ────────────────────────────────────────────────────────

/**
 * Extract task blocks from the plan content.
 * A task block starts with a heading like "#### T0.1 ..." and ends
 * at the next heading of the same or higher level.
 */
function extractTaskBlocks(content) {
    const taskHeadingRe = /^(#{3,4})\s+(T\d+\.\d+)\s+(.+)$/gm;
    const blocks = [];
    let match;

    while ((match = taskHeadingRe.exec(content)) !== null) {
        blocks.push({
            id: match[2],
            title: match[3].trim(),
            startIndex: match.index,
            level: match[1].length,
        });
    }

    // Determine end index for each block
    for (let i = 0; i < blocks.length; i++) {
        const nextBlock = blocks[i + 1];
        blocks[i].endIndex = nextBlock ? nextBlock.startIndex : content.length;
        blocks[i].content = content.slice(blocks[i].startIndex, blocks[i].endIndex);
    }

    return blocks;
}

function validateSections(content) {
    const errors = [];
    const found = [];

    for (const section of REQUIRED_SECTIONS) {
        if (section.pattern.test(content)) {
            found.push(section.id);
        } else {
            errors.push({
                type: 'missing_section',
                sectionId: section.id,
                label: section.label,
                message: `缺少必需章节：${section.label}`,
            });
        }
    }

    return { errors, found };
}

function validateTaskFields(blocks) {
    const errors = [];
    const warnings = [];

    if (blocks.length === 0) {
        errors.push({
            type: 'no_tasks',
            message: '未找到任何 Task 块（格式应为 ### T0.1 或 #### T0.1）',
        });
        return { errors, warnings };
    }

    for (const block of blocks) {
        for (const field of REQUIRED_TASK_FIELDS) {
            if (!field.pattern.test(block.content)) {
                errors.push({
                    type: 'missing_task_field',
                    taskId: block.id,
                    taskTitle: block.title,
                    fieldId: field.id,
                    fieldLabel: field.label,
                    message: `${block.id} 缺少必填字段：${field.label}`,
                });
            }
        }

        // Check for vague words in completion criteria section
        const doneSection = block.content.match(/\*\*完成标准\*\*[：:]\s*([\s\S]*?)(?=\*\*|$)/);
        if (doneSection) {
            for (const word of VAGUE_WORDS) {
                if (doneSection[1].includes(word)) {
                    warnings.push({
                        type: 'vague_completion_criteria',
                        taskId: block.id,
                        word,
                        message: `${block.id} 的完成标准中包含高风险模糊词「${word}」`,
                    });
                }
            }
        }
    }

    return { errors, warnings };
}

function validatePlan(content) {
    const sectionResult = validateSections(content);
    const taskBlocks = extractTaskBlocks(content);
    const taskResult = validateTaskFields(taskBlocks);

    const allErrors = [...sectionResult.errors, ...taskResult.errors];
    const allWarnings = [...taskResult.warnings];

    return {
        passed: allErrors.length === 0,
        totalSectionsFound: sectionResult.found.length,
        totalSectionsRequired: REQUIRED_SECTIONS.length,
        totalTasksFound: taskBlocks.length,
        errors: allErrors,
        warnings: allWarnings,
        summary: {
            missingSections: sectionResult.errors.length,
            missingTaskFields: taskResult.errors.filter((e) => e.type === 'missing_task_field').length,
            vagueWords: allWarnings.filter((w) => w.type === 'vague_completion_criteria').length,
        },
    };
}

// ─── Text formatter ──────────────────────────────────────────────────────────

function formatReport(result) {
    const lines = [];

    lines.push('=== validate-plan-structure ===');
    lines.push(`章节: ${result.totalSectionsFound}/${result.totalSectionsRequired} | Task: ${result.totalTasksFound}`);
    lines.push('');

    if (result.passed && result.warnings.length === 0) {
        lines.push('✅ 全部通过');
        return lines.join('\n');
    }

    if (result.errors.length > 0) {
        lines.push(`── ❌ 错误 (${result.errors.length}) ──`);
        for (const e of result.errors) {
            lines.push(`  • ${e.message}`);
        }
        lines.push('');
    }

    if (result.warnings.length > 0) {
        lines.push(`── ⚠️  警告 (${result.warnings.length}) ──`);
        for (const w of result.warnings) {
            lines.push(`  • ${w.message}`);
        }
        lines.push('');
    }

    lines.push('── 结论 ──');
    if (result.passed) {
        lines.push('  ⚠️  结构通过，但存在警告项，建议修正');
    } else {
        lines.push('  ❌ 校验失败：请先修正以上错误再宣称计划完成');
    }

    return lines.join('\n');
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
    const options = parseArgs(process.argv);

    const planFile = path.resolve(options.planFile);
    if (!fs.existsSync(planFile)) {
        throw new Error(`Plan file does not exist: ${planFile}`);
    }

    const content = fs.readFileSync(planFile, 'utf8');
    const result = validatePlan(content);

    if (options.json) {
        console.log(JSON.stringify(result, null, 2));
    } else {
        console.log(formatReport(result));
    }

    if (!result.passed) {
        process.exit(2);
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
    try {
        main();
    } catch (err) {
        printUsage();
        console.error('\nError:', err.message);
        process.exit(1);
    }
}

export { validatePlan };
