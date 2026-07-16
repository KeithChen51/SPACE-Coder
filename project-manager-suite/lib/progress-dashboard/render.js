/**
 * Traceability:
 * Rule sources:
 * - PIPELINE.md（进度页为可重建编译产物，非权威源）
 * Data source:
 * - lib/progress-dashboard/collect.js（DashboardModel）
 * Copy source:
 * - lib/progress-dashboard/copy.js（白话文案层）
 * Consumed by:
 * - tools/render-progress-dashboard.mjs
 *
 * 进度仪表盘渲染层：DashboardModel → 单文件自包含 HTML。
 * 约束：零外部请求（file:// 双击即开）；默认视图全白话，术语原文只进折叠的“工程师详情”；
 * 状态色只用于状态且永远带图标+文字（不靠颜色单独表意）；亮暗双主题。
 */
import { STAGE_IDS } from '../ai-pm-protocol/constants.js';
import {
    stageCopy,
    s2SubstepCopy,
    railStatusCopy,
    securityConclusionCopy,
    buildNextStepText,
    blockerPlainText
} from './copy.js';

const GENERATED_BY_COMMENT =
    '<!-- generated-by: ai-project-manager | 项目进度页：可重建编译产物，由 render-progress-dashboard 工具渲染，勿手改 -->';

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const STATUS_ICON = {
    produced: '✔',
    active: '▶',
    pending: '○',
    blocked: '⚠'
};

function formatDateTime(isoString) {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return isoString;
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function renderWarnings(model) {
    if (!model.warnings.length) return '';
    const items = model.warnings
        .map(
            (warning) =>
                `<div class="banner banner-warn"><span class="banner-icon">⚠</span><span>${escapeHtml(warning.message)}</span></div>`
        )
        .join('\n');
    return `<section class="banners">${items}</section>`;
}

function renderHeader(model) {
    const name = model.project.name || '（项目名待补充）';
    const oneLiner = model.project.oneLiner || '';
    let stageLine;
    if (model.stage.allDone) {
        stageLine =
            model.quality.security.conclusion === 'WAIVER'
                ? '全流程已走完（安全为有条件放行，注意豁免时限）'
                : '全流程已走完';
    } else if (model.stage.anchor) {
        const copy = stageCopy[model.stage.anchor];
        stageLine = `现在在「${copy.plain}」这一步`;
    } else {
        stageLine = '阶段未声明（项目可能刚启动，和 AI 聊几句补齐画像即可）';
    }

    return `<header class="page-header">
  <div>
    <h1>${escapeHtml(name)}</h1>
    ${oneLiner ? `<p class="one-liner">${escapeHtml(oneLiner)}</p>` : ''}
  </div>
  <div class="stage-line">${escapeHtml(stageLine)}</div>
</header>`;
}

function renderFreshnessBar(model) {
    return `<div class="freshness" id="freshness-bar" data-generated-at="${escapeHtml(model.generatedAt)}">
  <span class="freshness-label">数据截至：<strong>${escapeHtml(formatDateTime(model.generatedAt))}</strong></span>
  <span class="freshness-note">本页每 60 秒重读本地文件；数据只在 AI 推进或刷新后才会变化。想要最新进度：对 AI 说「刷新进度页」。</span>
</div>`;
}

function renderThreeQuestions(model) {
    const sequence = model.rail.map((item) => item.id);
    let whereText;
    if (model.stage.allDone) {
        whereText = '已完工 🎉';
    } else if (model.stage.anchor) {
        const idx = sequence.indexOf(model.stage.anchor) + 1;
        whereText = `第 ${idx} 步 / 共 ${sequence.length} 步 · ${stageCopy[model.stage.anchor].plain}`;
    } else {
        whereText = '刚起步';
    }

    // 开发收尾后（S5-S7），“正在做什么”应回答当前阶段的活动，而不是停留在“开发已完成”
    const anchorPastDev = [STAGE_IDS.S5, STAGE_IDS.S6, STAGE_IDS.S7].includes(model.stage.anchor);
    let doingText;
    if (model.dev.activeTask) {
        const title = model.dev.activeTask.title || model.dev.activeTask.id;
        doingText = `正在开发：${title}`;
    } else if (model.stage.allDone) {
        doingText = '收尾与交付';
    } else if (anchorPastDev) {
        doingText = stageCopy[model.stage.anchor].sub;
    } else if (model.dev.noActiveTaskReason === 'all_done') {
        doingText = '开发任务已全部完成';
    } else if (model.currentRoundDeliverable) {
        doingText = `本轮要产出：${model.currentRoundDeliverable}`;
    } else if (model.stage.anchor) {
        doingText = stageCopy[model.stage.anchor].sub;
    } else {
        doingText = '和 AI 完成首轮访谈';
    }

    // 计划就绪待开工是正常态：下一步给"说开工"的明确指令，而不是门禁黑话
    const devNotStarted =
        model.stage.anchor === STAGE_IDS.S4 &&
        model.dev.noActiveTaskReason === 'not_started' &&
        !model.dev.planInconsistent;
    const nextText = devNotStarted
        ? '开发计划已排好。对 AI 说「开工」，就从第一个任务开始'
        : buildNextStepText({
              blockers: model.anchorBlockers,
              routeTargetSkill: model.routeTargetSkill,
              anchorStage: model.stage.anchor,
              allDone: model.stage.allDone
          });

    return `<section class="three-questions">
  <div class="qa-card"><div class="qa-label">做到哪了</div><div class="qa-value">${escapeHtml(whereText)}</div></div>
  <div class="qa-card"><div class="qa-label">正在做什么</div><div class="qa-value">${escapeHtml(doingText)}</div></div>
  <div class="qa-card"><div class="qa-label">下一步做什么</div><div class="qa-value">${escapeHtml(nextText)}</div></div>
</section>`;
}

function renderS2Substeps(model) {
    const steps = [
        { key: 'page', done: model.s2.substeps.page, doing: !model.s2.substeps.page && model.s2.pageDraftExists },
        { key: 'foundation', done: model.s2.substeps.foundation, doing: false },
        { key: 'prd', done: model.s2.substeps.prd, doing: false }
    ];
    const items = steps
        .map((step) => {
            const copy = s2SubstepCopy[step.key];
            if (step.done) {
                return `<span class="substep sub-done" title="${escapeHtml(copy.sub)}">✔ ${escapeHtml(copy.plain)}</span>`;
            }
            if (step.doing) {
                return `<span class="substep sub-doing" title="${escapeHtml(copy.sub)}">● ${escapeHtml(copy.plain)}（草稿待确认）</span>`;
            }
            return `<span class="substep sub-todo" title="${escapeHtml(copy.sub)}">○ ${escapeHtml(copy.plain)}</span>`;
        })
        .join('');
    return `<div class="substeps">${items}</div>`;
}

function renderRail(model) {
    const items = model.rail
        .map((station, index) => {
            const copy = stageCopy[station.id];
            let statusLabel = railStatusCopy[station.status];
            if (station.status === 'produced' && copy.producedLabel) {
                statusLabel = copy.producedLabel;
            }
            if (station.id === STAGE_IDS.S7 && model.quality.security.conclusion) {
                const conclusion = securityConclusionCopy[model.quality.security.conclusion];
                if (conclusion) statusLabel = `安全检查：${conclusion.label}`;
            }
            // 子环节只在 S2 正在进行/受阻时展示：站点已产出或未开始时，细分状态只添乱
            const substeps =
                station.id === STAGE_IDS.S2 && (station.status === 'active' || station.status === 'blocked')
                    ? renderS2Substeps(model)
                    : '';
            return `<li class="station status-${station.status}">
  <div class="station-marker"><span class="station-icon">${STATUS_ICON[station.status]}</span><span class="station-index">${index + 1}</span></div>
  <div class="station-body">
    <div class="station-name">${escapeHtml(copy.plain)} <span class="station-tag">${escapeHtml(station.id)}</span></div>
    <div class="station-sub">${escapeHtml(copy.sub)}</div>
    <div class="station-status">${escapeHtml(statusLabel)}</div>
    ${substeps}
  </div>
</li>`;
        })
        .join('\n');

    return `<section class="card">
  <h2>整体进度</h2>
  <ol class="rail">
${items}
  </ol>
</section>`;
}

function renderEngineerDetails(model) {
    const gateRows = Object.entries(model.gates)
        .map(
            ([name, gate]) =>
                `<tr><td><code>${escapeHtml(name)}</code></td><td>${gate.pass ? '✔ pass' : '✘ fail'}</td><td><code>${escapeHtml(gate.fromTarget)}</code></td></tr>`
        )
        .join('');
    const blockerRows = model.anchorBlockers
        .map((item) => `<li><code>${escapeHtml(item.code)}</code> — ${escapeHtml(item.message)}</li>`)
        .join('');

    return `<details class="engineer">
  <summary>工程师详情（协议原文与门禁明细）</summary>
  <div class="engineer-body">
    <p>画像声明阶段：<code>${escapeHtml(model.stage.declared || 'null')}</code>；推荐阶段：<code>${escapeHtml(model.stage.recommended || 'null')}</code>；产物锚点：<code>${escapeHtml(model.stage.anchor || 'null')}</code></p>
    <p>route-check 下一步原文：${escapeHtml(model.nextActionRaw || '（无）')}</p>
    ${blockerRows ? `<p>阻断原因原文：</p><ul>${blockerRows}</ul>` : '<p>阻断原因原文：无</p>'}
    <table><thead><tr><th>门禁</th><th>结果</th><th>来自 target</th></tr></thead><tbody>${gateRows}</tbody></table>
    <p>完整数据：本页底部内嵌 JSON（<code>#dashboard-data</code>）。刷新命令（在宿主项目根目录执行，路径含空格需加引号）：</p>
    <pre>node ".agent/project-manager-suite/tools/render-progress-dashboard.mjs" .</pre>
  </div>
</details>`;
}

function renderCurrentStageCard(model) {
    if (model.stage.allDone) {
        return `<section class="card">
  <h2>当前状态</h2>
  <p class="stage-conclusion">全部阶段都已走完。${
      model.quality.security.conclusion
          ? escapeHtml(securityConclusionCopy[model.quality.security.conclusion]?.text || '')
          : '若要交付，先让 AI 做一次安全检查。'
  }</p>
  ${renderEngineerDetails(model)}
</section>`;
    }

    const anchor = model.stage.anchor;
    const copy = anchor ? stageCopy[anchor] : null;
    const meaningfulBlockers = model.anchorMeaningfulBlockers || model.anchorBlockers;
    let conclusion;
    if (!copy) {
        conclusion = '项目刚启动，还没有形成阶段画像。和 AI 聊几句，补齐项目基本信息即可开始。';
    } else if (meaningfulBlockers.length > 0) {
        conclusion = `「${copy.plain}」这一步暂时被卡住：${blockerPlainText(meaningfulBlockers[0].code)}。`;
    } else {
        conclusion = `「${copy.plain}」正在进行：${copy.sub}。`;
    }

    // 过滤伪空项："无"、"无（……已全部确认）"、"暂无" 之类不是真正等拍板的事
    const isRealPendingItem = (item) => {
        const text = String(item).trim();
        return text && !/^(无|暂无)([（(].*[）)])?$/.test(text);
    };
    const pendingAll = [
        ...new Set([...model.pendingItems.profile, ...model.pendingItems.plan].filter(isRealPendingItem))
    ];
    const pendingBlock = pendingAll.length
        ? `<div class="pending">
    <h3>等你拍板</h3>
    <ul>${pendingAll.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
  </div>`
        : '';

    return `<section class="card">
  <h2>当前阶段</h2>
  <p class="stage-conclusion">${escapeHtml(conclusion)}</p>
  ${pendingBlock}
  ${renderEngineerDetails(model)}
</section>`;
}

function renderDevCard(model) {
    const dev = model.dev;
    if (!dev.planExists) return '';

    const { total, done, inProgress, review, todo, blocked } = dev.counts;
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;

    let focusBlock = '';
    if (dev.planInconsistent) {
        focusBlock = `<div class="banner banner-critical"><span class="banner-icon">⚠</span><span>几份计划文件里的任务状态对不上，下面的任务信息可能不准。请让 AI 校正计划后刷新本页。</span></div>`;
    } else if (dev.activeTask) {
        const title = dev.activeTask.title || '（子计划未写标题）';
        focusBlock = `<div class="active-task">
    <div class="active-task-label">正在开发</div>
    <div class="active-task-title">${escapeHtml(title)} <span class="station-tag">${escapeHtml(dev.activeTask.id)}</span></div>
    ${dev.activeTask.subPlanPath ? `<a class="source-link" href="${escapeHtml(dev.activeTask.subPlanPath)}">查看这条任务的详细计划 →</a>` : ''}
  </div>`;
    } else if (dev.noActiveTaskReason === 'all_done') {
        focusBlock = `<div class="active-task active-task-done"><div class="active-task-label">开发进度</div><div class="active-task-title">全部任务已完成 ✔</div></div>`;
    } else if (dev.noActiveTaskReason === 'not_started') {
        focusBlock = `<div class="active-task"><div class="active-task-label">开发进度</div><div class="active-task-title">计划已排好，还没有任务开工</div></div>`;
    }

    const statusChip = (label, count) =>
        count > 0 ? `<span class="chip">${escapeHtml(label)} ${count}</span>` : '';

    const taskRows = dev.tasks
        .map(
            (task) =>
                `<tr><td>${escapeHtml(task.id)}</td><td>${escapeHtml(task.status || task.rawStatus || '—')}</td><td>${escapeHtml(task.completedDate || '—')}</td><td>${escapeHtml(task.note || '')}</td></tr>`
        )
        .join('');
    const taskTable = dev.tasks.length
        ? `<details class="task-list"><summary>全部任务清单（${total} 条）</summary>
  <div class="table-wrap"><table><thead><tr><th>任务号</th><th>状态</th><th>完成日期</th><th>备注</th></tr></thead><tbody>${taskRows}</tbody></table></div>
</details>`
        : '';

    return `<section class="card">
  <h2>开发进度</h2>
  <div class="dev-summary">
    <div class="stat-tile"><div class="stat-number">${done}<span class="stat-total">/${total}</span></div><div class="stat-label">任务已完成</div></div>
    <div class="dev-progress">
      <div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div>
      <div class="chips">${statusChip('进行中', inProgress)}${statusChip('待审阅', review)}${statusChip('待开发', todo)}${statusChip('阻塞', blocked)}</div>
    </div>
  </div>
  ${focusBlock}
  ${taskTable}
</section>`;
}

function renderQualityCard(model) {
    const { testCases, execution, defects, security } = model.quality;
    // 质量数据真正出现之前（S5 以前）整张卡不显示，避免"0 个业务域"式噪音
    const testCasesMeaningful = Boolean(testCases && (testCases.ready || testCases.tcMainExists));
    if (!testCasesMeaningful && !execution && !defects && !security.conclusion) return '';

    const tiles = [];
    if (execution?.totals) {
        tiles.push(
            `<div class="stat-tile"><div class="stat-number">${execution.totals.pass}<span class="stat-total">/${execution.totals.cases}</span></div><div class="stat-label">测试用例通过</div></div>`
        );
        if (execution.totals.fail > 0) {
            tiles.push(
                `<div class="stat-tile tone-critical"><div class="stat-number">${execution.totals.fail}</div><div class="stat-label">用例失败 ✘</div></div>`
            );
        }
    } else if (testCasesMeaningful) {
        tiles.push(
            `<div class="stat-tile"><div class="stat-number">${testCases.domainCount}</div><div class="stat-label">已备好测试的业务域</div></div>`
        );
    }
    if (defects) {
        const tone = defects.p0p1Open > 0 ? 'tone-critical' : defects.open > 0 ? 'tone-warning' : '';
        tiles.push(
            `<div class="stat-tile ${tone}"><div class="stat-number">${defects.open}</div><div class="stat-label">未关闭缺陷${defects.p0p1Open > 0 ? `（含 ${defects.p0p1Open} 个高优先级 ⚠）` : ''}</div></div>`
        );
    }
    if (security.conclusion) {
        const conclusion = securityConclusionCopy[security.conclusion];
        tiles.push(
            `<div class="stat-tile tone-${conclusion.tone === 'good' ? 'good' : conclusion.tone === 'warning' ? 'warning' : 'critical'}"><div class="stat-number">${escapeHtml(conclusion.label)}</div><div class="stat-label">安全检查结论</div></div>`
        );
    }

    const domainRows = execution
        ? execution.domains
              .map(
                  (domain) =>
                      `<tr><td>${escapeHtml(domain.name)}</td><td>${escapeHtml(domain.cases)}</td><td>${escapeHtml(domain.statusText)}</td></tr>`
              )
              .join('')
        : '';
    const domainTable = execution
        ? `<details class="task-list"><summary>各业务域测试情况</summary>
  <div class="table-wrap"><table><thead><tr><th>业务域</th><th>用例数</th><th>状态</th></tr></thead><tbody>${domainRows}</tbody></table></div>
</details>`
        : '';

    return `<section class="card">
  <h2>质量与安全</h2>
  <div class="tiles">${tiles.join('')}</div>
  ${domainTable}
</section>`;
}

function renderTimelineCard(model) {
    // 只展示真有任务摘要的日志日；一条摘要都没有时整卡不显示，避免"未记录"式噪音
    const daysWithEntries = model.timeline.filter((day) => day.entries.length > 0);
    if (!daysWithEntries.length) return '';
    const blocks = daysWithEntries
        .map((day) => {
            const entries = `<ul>${day.entries
                .map(
                    (entry) =>
                        `<li><span class="timeline-mark">${escapeHtml(entry.statusMark)}</span> ${escapeHtml(entry.title)}</li>`
                )
                .join('')}</ul>`;
            return `<div class="timeline-day"><div class="timeline-date">${escapeHtml(day.date)}</div>${entries}</div>`;
        })
        .join('\n');
    return `<section class="card">
  <h2>最近进展</h2>
${blocks}
</section>`;
}

function renderFooter(model) {
    const sourceLabels = {
        profile: '项目画像',
        plan: '执行计划（驾驶舱）',
        mainPlan: '主开发计划',
        kanban: '任务看板',
        activeSubPlan: '当前任务子计划',
        reportsIndex: '测试报告索引',
        defects: '缺陷清单',
        securityReport: '安全扫描报告',
        featureList: '功能列表'
    };
    const links = Object.entries(sourceLabels)
        .filter(([key]) => model.sources[key])
        .map(
            ([key, label]) =>
                `<a class="source-link" href="${escapeHtml(model.sources[key])}">${escapeHtml(label)}</a>`
        )
        .join('<span class="dot-sep">·</span>');

    return `<footer class="page-footer">
  <p><strong>想要最新进度：</strong>对 AI 说「刷新进度页」即可。</p>
  ${links ? `<p class="muted">本页数据来自这些权威文件：${links}</p>` : ''}
  <p class="muted">本页由套件脚本自动生成（可重建、非权威源、手改会被覆盖）。</p>
</footer>`;
}

function renderDashboardHtml(model) {
    const dataJson = JSON.stringify(model).replace(/</g, '\\u003c');

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
${GENERATED_BY_COMMENT}
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(model.project.name || '项目')} · 项目进度</title>
<style>
:root {
  color-scheme: light;
  --surface: #fcfcfb;
  --surface-card: #ffffff;
  --surface-muted: #f0efec;
  --text-primary: #0b0b0b;
  --text-secondary: #52514e;
  --border: #e3e2de;
  --accent: #2a78d6;
  --status-good: #0ca30c;
  --status-warning: #fab219;
  --status-serious: #ec835a;
  --status-critical: #d03b3b;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --surface: #1a1a19;
    --surface-card: #232322;
    --surface-muted: #383835;
    --text-primary: #ffffff;
    --text-secondary: #c3c2b7;
    --border: #3d3d3a;
    --accent: #3987e5;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --surface: #1a1a19;
  --surface-card: #232322;
  --surface-muted: #383835;
  --text-primary: #ffffff;
  --text-secondary: #c3c2b7;
  --border: #3d3d3a;
  --accent: #3987e5;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--surface);
  color: var(--text-primary);
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif;
  line-height: 1.6;
}
.wrap { max-width: 1020px; margin: 0 auto; padding: 20px 24px 48px; }
.freshness {
  display: flex; flex-wrap: wrap; gap: 4px 16px; align-items: baseline;
  padding: 10px 16px; border-radius: 10px; margin-bottom: 20px;
  background: var(--surface-muted); font-size: 13px; color: var(--text-secondary);
}
.freshness.stale { outline: 2px solid var(--status-warning); }
.freshness-label strong { color: var(--text-primary); }
.page-header { display: flex; flex-wrap: wrap; gap: 8px 24px; align-items: baseline; justify-content: space-between; margin-bottom: 8px; }
.page-header h1 { margin: 0; font-size: 26px; }
.one-liner { margin: 4px 0 0; color: var(--text-secondary); }
.stage-line { font-size: 15px; color: var(--text-secondary); }
.banners { display: grid; gap: 8px; margin: 12px 0; }
.banner { display: flex; gap: 10px; align-items: flex-start; padding: 10px 14px; border-radius: 10px; font-size: 14px; }
.banner-warn { background: color-mix(in srgb, var(--status-warning) 16%, var(--surface-card)); border: 1px solid color-mix(in srgb, var(--status-warning) 45%, var(--border)); }
.banner-critical { background: color-mix(in srgb, var(--status-critical) 12%, var(--surface-card)); border: 1px solid color-mix(in srgb, var(--status-critical) 45%, var(--border)); }
.banner-icon { flex: none; }
.three-questions { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin: 16px 0 20px; }
.qa-card { background: var(--surface-card); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; }
.qa-label { font-size: 13px; color: var(--text-secondary); margin-bottom: 4px; }
.qa-value { font-size: 17px; font-weight: 600; }
.card { background: var(--surface-card); border: 1px solid var(--border); border-radius: 12px; padding: 18px 20px; margin-bottom: 16px; }
.card h2 { margin: 0 0 12px; font-size: 18px; }
.rail { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.station { display: flex; gap: 14px; padding: 10px 8px; border-radius: 10px; }
.station-marker { flex: none; display: flex; flex-direction: column; align-items: center; width: 34px; }
.station-icon { font-size: 15px; }
.station-index { font-size: 11px; color: var(--text-secondary); }
.station-name { font-weight: 600; }
.station-tag { font-size: 11px; color: var(--text-secondary); border: 1px solid var(--border); border-radius: 6px; padding: 0 5px; margin-left: 4px; vertical-align: 1px; }
.station-sub { font-size: 13px; color: var(--text-secondary); }
.station-status { font-size: 13px; margin-top: 2px; }
.status-produced .station-icon { color: var(--status-good); }
.status-produced .station-status { color: var(--status-good); }
.status-active { background: color-mix(in srgb, var(--accent) 9%, var(--surface-card)); outline: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border)); }
.status-active .station-icon { color: var(--accent); }
.status-active .station-status { color: var(--accent); font-weight: 600; }
.status-blocked { background: color-mix(in srgb, var(--status-critical) 8%, var(--surface-card)); }
.status-blocked .station-icon, .status-blocked .station-status { color: var(--status-critical); font-weight: 600; }
.status-pending .station-icon, .status-pending .station-status { color: var(--text-secondary); }
.substeps { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.substep { font-size: 12px; border: 1px solid var(--border); border-radius: 999px; padding: 1px 10px; color: var(--text-secondary); }
.substep.sub-done { color: var(--status-good); border-color: color-mix(in srgb, var(--status-good) 40%, var(--border)); }
.substep.sub-doing { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 40%, var(--border)); }
.stage-conclusion { font-size: 15px; margin: 0 0 10px; }
.pending { border: 1px dashed color-mix(in srgb, var(--status-warning) 55%, var(--border)); border-radius: 10px; padding: 10px 14px; margin-bottom: 10px; }
.pending h3 { margin: 0 0 6px; font-size: 14px; }
.pending ul { margin: 0; padding-left: 20px; }
.engineer { margin-top: 8px; }
.engineer summary { cursor: pointer; font-size: 13px; color: var(--text-secondary); }
.engineer-body { font-size: 13px; color: var(--text-secondary); margin-top: 8px; }
.engineer-body table { border-collapse: collapse; width: 100%; }
.engineer-body th, .engineer-body td { border: 1px solid var(--border); padding: 4px 8px; text-align: left; }
.engineer-body pre { background: var(--surface-muted); padding: 8px 10px; border-radius: 8px; overflow-x: auto; }
.dev-summary { display: flex; flex-wrap: wrap; gap: 20px; align-items: center; margin-bottom: 12px; }
.stat-tile { min-width: 130px; }
.stat-number { font-size: 34px; font-weight: 700; line-height: 1.2; }
.stat-total { font-size: 18px; font-weight: 500; color: var(--text-secondary); }
.stat-label { font-size: 13px; color: var(--text-secondary); }
.tone-good .stat-number { color: var(--status-good); }
.tone-warning .stat-number { color: color-mix(in srgb, var(--status-warning) 75%, var(--text-primary)); }
.tone-critical .stat-number { color: var(--status-critical); }
.dev-progress { flex: 1; min-width: 220px; }
.progress-track { height: 6px; border-radius: 999px; background: var(--surface-muted); overflow: hidden; }
.progress-fill { height: 100%; border-radius: 999px; background: var(--accent); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.chip { font-size: 12px; border: 1px solid var(--border); border-radius: 999px; padding: 1px 10px; color: var(--text-secondary); }
.active-task { border-left: 3px solid var(--accent); padding: 8px 14px; margin: 10px 0; background: color-mix(in srgb, var(--accent) 6%, var(--surface-card)); border-radius: 0 10px 10px 0; }
.active-task-done { border-left-color: var(--status-good); background: color-mix(in srgb, var(--status-good) 6%, var(--surface-card)); }
.active-task-label { font-size: 12px; color: var(--text-secondary); }
.active-task-title { font-size: 17px; font-weight: 600; }
.task-list { margin-top: 10px; }
.task-list summary { cursor: pointer; font-size: 13px; color: var(--text-secondary); }
.table-wrap { overflow-x: auto; margin-top: 8px; }
.table-wrap table { border-collapse: collapse; width: 100%; font-size: 13px; }
.table-wrap th, .table-wrap td { border: 1px solid var(--border); padding: 5px 10px; text-align: left; }
.tiles { display: flex; flex-wrap: wrap; gap: 24px; }
.timeline-day { margin-bottom: 10px; }
.timeline-date { font-weight: 600; font-size: 14px; }
.timeline-day ul { margin: 4px 0 0; padding-left: 20px; font-size: 14px; }
.timeline-mark { margin-right: 4px; }
.page-footer { margin-top: 24px; font-size: 14px; }
.muted { color: var(--text-secondary); font-size: 13px; }
.source-link { color: var(--accent); text-decoration: none; }
.source-link:hover { text-decoration: underline; }
.dot-sep { margin: 0 6px; color: var(--text-secondary); }
@media (max-width: 640px) { .wrap { padding: 14px 14px 40px; } .page-header h1 { font-size: 22px; } }
</style>
</head>
<body>
<div class="wrap">
${renderFreshnessBar(model)}
${renderHeader(model)}
${renderWarnings(model)}
${renderThreeQuestions(model)}
${renderRail(model)}
${renderCurrentStageCard(model)}
${renderDevCard(model)}
${renderQualityCard(model)}
${renderTimelineCard(model)}
${renderFooter(model)}
</div>
<script type="application/json" id="dashboard-data">${dataJson}</script>
<script>
(function () {
  var bar = document.getElementById('freshness-bar');
  if (bar) {
    var generatedAt = new Date(bar.getAttribute('data-generated-at')).getTime();
    var STALE_MS = 24 * 60 * 60 * 1000;
    if (!isNaN(generatedAt) && Date.now() - generatedAt > STALE_MS) {
      bar.classList.add('stale');
      var label = bar.querySelector('.freshness-label');
      if (label) label.insertAdjacentHTML('beforeend', '<strong>（已超过 24 小时，可能过期）</strong>');
    }
  }
  setTimeout(function () { location.reload(); }, 60 * 1000);
})();
</script>
</body>
</html>
`;
}

export { renderDashboardHtml, escapeHtml, GENERATED_BY_COMMENT };
