#!/usr/bin/env node

/**
 * Traceability:
 * Rule sources:
 * - PIPELINE.md（进度页落点与“可重建编译产物”定位）
 * - skills/00-01-ai-project-manager/references/core/runtime.md（每轮回写后刷新进度页）
 * Structured config:
 * - lib/progress-dashboard/collect.js
 * - lib/progress-dashboard/render.js
 * - lib/progress-dashboard/copy.js
 *
 * 渲染宿主项目的进度可视化页（<host>/项目进度.html）。
 * 单个板块解析失败只降级展示，不阻断渲染；仅宿主目录本身不存在等硬错误才非零退出。
 */
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';
import { renderProgressDashboardFile, DASHBOARD_FILENAME } from '../lib/progress-dashboard/index.js';

const __filename = fileURLToPath(import.meta.url);

function printUsage() {
    console.log(
        'Usage: node <suite-path>/tools/render-progress-dashboard.mjs <host-project-root> [--out <path>] [--json]'
    );
    console.log(
        '<suite-path> 指套件根目录：源码仓库联调时为 project-manager-suite/，安装到宿主后为 .agent/project-manager-suite/；命令默认在宿主项目根目录执行。'
    );
    console.log(`默认输出：<host-project-root>/${DASHBOARD_FILENAME}（用浏览器打开即可查看项目进度）`);
}

function parseArgs(argv) {
    const args = argv.slice(2);
    const options = { hostRoot: '', outPath: null, json: false };

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === '--json') {
            options.json = true;
        } else if (arg === '--out') {
            options.outPath = args[index + 1] || null;
            index += 1;
        } else if (!arg.startsWith('--') && !options.hostRoot) {
            options.hostRoot = arg;
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    if (!options.hostRoot) {
        throw new Error('Missing required <host-project-root>');
    }

    return options;
}

function renderProgressDashboard(options) {
    return renderProgressDashboardFile({ hostRoot: options.hostRoot, outPath: options.outPath });
}

function main() {
    const options = parseArgs(process.argv);
    const { outPath, model } = renderProgressDashboard(options);

    if (options.json) {
        console.log(JSON.stringify({ outPath, model }, null, 2));
        return;
    }

    const lines = [
        `进度页已生成：${outPath}`,
        `数据截至：${model.generatedAt}`,
        `当前锚点阶段：${model.stage.anchor || (model.stage.allDone ? '已完工' : '未声明')}`
    ];
    if (model.warnings.length > 0) {
        lines.push('注意事项：');
        for (const warning of model.warnings) {
            lines.push(`- [${warning.code}] ${warning.message}`);
        }
    }
    console.log(lines.join('\n'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    try {
        main();
    } catch (error) {
        printUsage();
        console.error(error.message);
        process.exit(1);
    }
}

export { renderProgressDashboard };
