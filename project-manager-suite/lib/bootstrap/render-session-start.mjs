#!/usr/bin/env node

import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';
import { buildClaudeHookPayload } from './index.js';
import {
    renderProgressDashboardFile,
    looksLikeSuiteHost,
    DASHBOARD_FILENAME
} from '../progress-dashboard/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const suiteRoot = path.resolve(__dirname, '..', '..');

// 会话启动时 best-effort 刷新宿主进度页。任何失败都必须吞掉：
// 本脚本的唯一硬契约是向 stdout 输出合法的 hook JSON 载荷（否则会话自动注入会被破坏）。
let dashboardExtraText = '';
try {
    const hostRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    if (looksLikeSuiteHost(hostRoot)) {
        const { outPath } = renderProgressDashboardFile({ hostRoot });
        dashboardExtraText = [
            `**项目进度页**：本宿主项目的进度可视化页为 \`${DASHBOARD_FILENAME}\`（已在本次会话启动时刷新：${outPath}）。`,
            '每轮回写完成后，运行 `node <suite-path>/tools/render-progress-dashboard.mjs <host-project-root>` 刷新它，并用中文提醒用户可用浏览器打开查看进度。'
        ].join('\n');
    }
} catch {
    // 忽略：进度页刷新失败不影响会话注入
}

const payload = buildClaudeHookPayload(suiteRoot, { extraText: dashboardExtraText });
console.log(JSON.stringify(payload, null, 2));
