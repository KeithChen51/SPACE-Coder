#!/usr/bin/env node

/**
 * verify-task-context.mjs
 *
 * Traceability:
 *   Rule sources:
 *     - skills/coding-standards/SKILL.md (执行前置协议)
 *     - PIPELINE.md §7 coding-standards
 *
 * Location:
 *   skills/coding-standards/scripts/verify-task-context.mjs
 *
 * Purpose:
 *   Before coding-standards starts implementing a Task, verify that:
 *     1. The Task exists in the delivery plan
 *     2. All files referenced in the Task's "PRD双链·读" field actually exist on disk
 *     3. The Task's "核心文件" field is declared (non-empty)
 *
 *   Outputs a structured report (JSON or human-readable).
 *
 * Usage:
 *   node <suite-path>/skills/coding-standards/scripts/verify-task-context.mjs \
 *     <delivery-plan-path> <task-id> [--json]
 *
 * Exit codes:
 *   0 – canExecute: true (all checks passed)
 *   1 – fatal error (file not found, bad args)
 *   2 – canExecute: false (task missing or PRD files missing)
 */

import fs from 'fs';
import path from 'path';
import process from 'process';

// ─── Arg parsing ─────────────────────────────────────────────────────────────

function printUsage() {
    console.log(
        'Usage: node verify-task-context.mjs <delivery-plan-path> <task-id> [--json]'
    );
}

function parseArgs(argv) {
    const args = argv.slice(2);
    const options = { planFile: '', taskId: '', json: false };

    for (const arg of args) {
        if (arg === '--json') { options.json = true; continue; }
        if (!options.planFile) { options.planFile = arg; continue; }
        if (!options.taskId) { options.taskId = arg; continue; }
        throw new Error(`Unknown argument: ${arg}`);
    }

    if (!options.planFile) throw new Error('Missing <delivery-plan-path> argument.');
    if (!options.taskId) throw new Error('Missing <task-id> argument.');
    return options;
}

// ─── Task extraction ─────────────────────────────────────────────────────────

/**
 * Extract a single task block by ID from the delivery plan content.
 * Task blocks start with ### or #### T<n>.<n>
 */
function extractTaskBlock(content, taskId) {
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

    for (let i = 0; i < blocks.length; i++) {
        const next = blocks[i + 1];
        blocks[i].endIndex = next ? next.startIndex : content.length;
        blocks[i].content = content.slice(blocks[i].startIndex, blocks[i].endIndex);
    }

    return blocks.find((b) => b.id === taskId) || null;
}

// ─── PRD link extraction ──────────────────────────────────────────────────────

/**
 * Extract file paths from the "PRD双链·读" section of a task block.
 * Looks for lines like:  - `docs/prd/some-file.md` §section
 * or plain:              - docs/prd/some-file.md
 */
function extractPrdLinks(taskContent) {
    const sectionMatch = taskContent.match(
        /\*\*PRD\s*双链[·.]?\s*读\*\*[：:]?\s*([\s\S]*?)(?=\*\*|$)/
    );
    if (!sectionMatch) return [];

    const sectionText = sectionMatch[1];
    const fileRe = /`([^`]+\.md)`|^[-*]\s+([\w./]+\.md)/gm;
    const files = [];
    let m;

    while ((m = fileRe.exec(sectionText)) !== null) {
        const raw = (m[1] || m[2]).trim();
        // Strip §section suffix if present
        const filePath = raw.split(' ')[0].replace(/\s*§.*$/, '').trim();
        if (filePath.endsWith('.md')) {
            files.push(filePath);
        }
    }

    return [...new Set(files)];
}

/**
 * Check whether the "核心文件" field is declared in the task block.
 */
function hasCoreFilesDeclared(taskContent) {
    const match = taskContent.match(/\*\*核心文件\*\*[：:]?\s*([\s\S]*?)(?=\*\*|$)/);
    if (!match) return false;
    return match[1].trim().length > 0;
}

// ─── Verification ─────────────────────────────────────────────────────────────

function verifyTask(planFile, taskId) {
    const planPath = path.resolve(planFile);
    if (!fs.existsSync(planPath)) {
        throw new Error(`Delivery plan file does not exist: ${planPath}`);
    }

    const content = fs.readFileSync(planPath, 'utf8');
    const planDir = path.dirname(planPath);

    // 1. Task existence
    const task = extractTaskBlock(content, taskId);
    if (!task) {
        return {
            taskId,
            taskTitle: null,
            canExecute: false,
            reason: `Task ${taskId} not found in delivery plan.`,
            missingFiles: [],
            coreFilesDeclared: false,
        };
    }

    // 2. PRD双链·读 files existence check
    const prdLinks = extractPrdLinks(task.content);
    const missingFiles = [];

    for (const link of prdLinks) {
        // Resolve relative to the host project root (2 levels up from docs/plans/)
        const candidates = [
            path.resolve(planDir, '..', '..', link),   // relative to <host>/
            path.resolve(planDir, link),                // relative to docs/plans/
            path.resolve(link),                         // absolute fallback
        ];
        const exists = candidates.some((c) => fs.existsSync(c));
        if (!exists) {
            missingFiles.push(link);
        }
    }

    // 3. 核心文件 declared
    const coreFilesDeclared = hasCoreFilesDeclared(task.content);

    const canExecute = missingFiles.length === 0 && coreFilesDeclared;

    return {
        taskId,
        taskTitle: task.title,
        canExecute,
        prdLinksFound: prdLinks,
        missingFiles,
        coreFilesDeclared,
    };
}

// ─── Formatter ───────────────────────────────────────────────────────────────

function formatReport(result) {
    const lines = [];
    lines.push('=== verify-task-context ===');
    lines.push(`Task: ${result.taskId} ${result.taskTitle ? `"${result.taskTitle}"` : '(not found)'}`);
    lines.push('');

    if (result.canExecute) {
        lines.push('✅ 验证通过 — canExecute: true');
        lines.push(`   PRD 双链文件: ${result.prdLinksFound.length} 个，全部存在`);
        lines.push(`   核心文件字段: 已声明`);
        return lines.join('\n');
    }

    lines.push('❌ 验证失败 — canExecute: false');
    lines.push('');

    if (!result.taskTitle) {
        lines.push(`  • Task ${result.taskId} 在 delivery plan 中不存在`);
    }

    if (result.missingFiles.length > 0) {
        lines.push(`── 缺失 PRD 文件 (${result.missingFiles.length}) ──`);
        for (const f of result.missingFiles) {
            lines.push(`  • ${f}`);
        }
    }

    if (!result.coreFilesDeclared) {
        lines.push('── 未声明核心文件 ──');
        lines.push('  • Task 的 **核心文件** 字段为空或缺失，禁止开始实装');
    }

    lines.push('');
    lines.push('请先补齐上述缺失项，再重新运行本脚本。');
    return lines.join('\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
    const options = parseArgs(process.argv);
    const result = verifyTask(options.planFile, options.taskId);

    if (options.json) {
        console.log(JSON.stringify(result, null, 2));
    } else {
        console.log(formatReport(result));
    }

    if (!result.canExecute) {
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

export { verifyTask };
