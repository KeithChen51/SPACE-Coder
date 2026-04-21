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
 *   OR check environment readiness if --env-check is passed.
 *
 *   Outputs a structured report (JSON or human-readable).
 *
 * Usage:
 *   node <suite-path>/skills/coding-standards/scripts/verify-task-context.mjs \
 *     <delivery-plan-path> <task-id> [--json] [--env-check]
 *
 * Exit codes:
 *   0 – canExecute/envReady: true (all checks passed)
 *   1 – fatal error (file not found, bad args)
 *   2 – canExecute/envReady: false (checks failed)
 */

import fs from 'fs';
import path from 'path';
import process from 'process';
import { execSync } from 'child_process';

// ─── Arg parsing ─────────────────────────────────────────────────────────────

function printUsage() {
    console.log(
        'Usage: node verify-task-context.mjs <delivery-plan-path> <task-id> [--json] [--env-check]'
    );
}

function parseArgs(argv) {
    const args = argv.slice(2);
    const options = { planFile: '', taskId: '', json: false, envCheck: false };

    for (const arg of args) {
        if (arg === '--json') { options.json = true; continue; }
        if (arg === '--env-check') { options.envCheck = true; continue; }
        if (!options.planFile) { options.planFile = arg; continue; }
        if (!options.taskId) { options.taskId = arg; continue; }
        throw new Error(`Unknown argument: ${arg}`);
    }

    if (!options.planFile) throw new Error('Missing <delivery-plan-path> argument.');
    if (!options.taskId) throw new Error('Missing <task-id> argument.');
    return options;
}

// ─── Environment Verification (--env-check) ──────────────────────────────────

function extractEnvDeclarations(content) {
    const lines = content.split('\n');
    const cmds = [];
    const dirs = [];
    
    let inBlock = false;
    for (const line of lines) {
        if (line.includes('## 环境依赖声明') || line.includes('### 环境依赖声明')) {
            inBlock = true;
            continue;
        }
        if (inBlock && line.startsWith('## ') && !line.includes('环境依赖声明')) {
            break;
        }
        if (!inBlock) continue;

        // Matches markdown table lines: | Node.js | >= 18 | `node -v` | ... |
        const cmdMatch = line.match(/\|\s*[^|]+\s*\|\s*[^|]+\s*\|\s*`([^`]+)`\s*\|/);
        if (cmdMatch) {
            cmds.push({ raw: line, cmd: cmdMatch[1].trim() });
            continue;
        }

        // Matches path table lines: | `<前端工程目录>/` | `node_modules/` 存在 ... |
        const dirMatch = line.match(/\|\s*`([^`]+)`\s*\|\s*[^\s|]*?(`([^`]+)`|([a-zA-Z0-9_\-\./]+))\s*(存在|已就绪)/);
        if (dirMatch) {
            const dir = dirMatch[1].replace(/<|>/g, '');
            const required = (dirMatch[3] || dirMatch[4]).replace(/<|>/g, '');
            dirs.push({ raw: line, targetDir: dir, requiredItem: required });
        }
    }
    return { cmds, dirs };
}

function verifyEnv(planFile) {
    const planPath = path.resolve(planFile);
    if (!fs.existsSync(planPath)) {
        throw new Error(`Delivery plan file does not exist: ${planPath}`);
    }
    const content = fs.readFileSync(planPath, 'utf8');
    const declarations = extractEnvDeclarations(content);
    
    // If no declarations found, we treat it as gracefully passing, or we can enforce it.
    // For minimal invasion, if not found, we just return true.
    if (declarations.cmds.length === 0 && declarations.dirs.length === 0) {
        return { envReady: true, missingEnv: [], reason: 'No environment declarations found.' };
    }

    const missingEnv = [];
    
    for (const { cmd, raw } of declarations.cmds) {
        try {
            execSync(cmd, { stdio: 'ignore' });
        } catch (e) {
            missingEnv.push(`命令执行失败: ${cmd} (依赖项: ${raw.split('|')[1]?.trim()})`);
        }
    }

    const planDir = path.dirname(planPath);
    for (const { targetDir, requiredItem } of declarations.dirs) {
        // Just checking if we can find it relative to host dir
        const hostDir = path.resolve(planDir, '..', '..');
        const resolvedPath = path.resolve(hostDir, targetDir, requiredItem);
        if (!fs.existsSync(resolvedPath)) {
            missingEnv.push(`缺失工程依赖: ${path.join(targetDir, requiredItem)} 未找到。`);
        }
    }

    return {
        envReady: missingEnv.length === 0,
        missingEnv,
    };
}

// ─── Task extraction ─────────────────────────────────────────────────────────

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
        const filePath = raw.split(' ')[0].replace(/\s*§.*$/, '').trim();
        if (filePath.endsWith('.md')) {
            files.push(filePath);
        }
    }

    return [...new Set(files)];
}

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

    const prdLinks = extractPrdLinks(task.content);
    const missingFiles = [];

    for (const link of prdLinks) {
        const candidates = [
            path.resolve(planDir, '..', '..', link),
            path.resolve(planDir, link),
            path.resolve(link),
        ];
        const exists = candidates.some((c) => fs.existsSync(c));
        if (!exists) {
            missingFiles.push(link);
        }
    }

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

function formatEnvReport(result) {
    const lines = ['=== check-env-context ===', ''];
    if (result.envReady) {
        lines.push('✅ 环境验证通过 — envReady: true');
        if (result.reason) lines.push(`   ${result.reason}`);
        return lines.join('\n');
    }
    
    lines.push('❌ 环境验证失败 — envReady: false', '');
    lines.push('── 缺失或异常的环境依赖 ──');
    for (const msg of result.missingEnv) {
        lines.push(`  • ${msg}`);
    }
    lines.push('', '请先补齐或安装上述环境依赖，再开始执行 Task。');
    return lines.join('\n');
}

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
    
    if (options.envCheck) {
        const result = verifyEnv(options.planFile);
        if (options.json) {
            console.log(JSON.stringify(result, null, 2));
        } else {
            console.log(formatEnvReport(result));
        }
        if (!result.envReady) process.exit(2);
        return;
    }

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

export { verifyTask, verifyEnv };
