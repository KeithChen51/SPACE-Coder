/**
 * Traceability:
 * Rule sources:
 * - PIPELINE.md（进度页落点：宿主根目录 项目进度.html，可重建编译产物）
 * - skills/00-01-ai-project-manager/references/core/runtime.md（每轮回写后刷新进度页）
 * Consumed by:
 * - tools/render-progress-dashboard.mjs
 * - tools/bootstrap-host.mjs（初始化触发）
 * - tools/devlog-sync.mjs（日志收口触发）
 * - lib/bootstrap/render-session-start.mjs（会话启动触发）
 */
import fs from 'fs';
import path from 'path';
import { collectDashboardModel } from './collect.js';
import { renderDashboardHtml } from './render.js';

const DASHBOARD_FILENAME = '项目进度.html';

/**
 * 采数 + 渲染 + 落盘，一步到位。
 * @returns {{ outPath: string, model: object }}
 */
function renderProgressDashboardFile({ hostRoot, outPath = null }) {
    const model = collectDashboardModel({ hostRoot });
    const html = renderDashboardHtml(model);
    const targetPath = outPath
        ? path.resolve(outPath)
        : path.join(model.hostRoot, DASHBOARD_FILENAME);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, html, 'utf8');
    return { outPath: targetPath, model };
}

/**
 * 判断目录是否像一个挂了套件/画像的宿主项目（供会话启动等 best-effort 触发点做前置判断）。
 */
function looksLikeSuiteHost(hostRoot) {
    if (!hostRoot) return false;
    try {
        return (
            fs.existsSync(path.join(hostRoot, 'project-profile.md')) ||
            fs.existsSync(path.join(hostRoot, '.agent', 'project-manager-suite')) ||
            fs.existsSync(path.join(hostRoot, DASHBOARD_FILENAME))
        );
    } catch {
        return false;
    }
}

export { renderProgressDashboardFile, looksLikeSuiteHost, DASHBOARD_FILENAME };
export { collectDashboardModel } from './collect.js';
export { renderDashboardHtml } from './render.js';
