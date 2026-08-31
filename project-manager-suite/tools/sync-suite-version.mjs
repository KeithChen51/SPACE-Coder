#!/usr/bin/env node

/**
 * Traceability:
 * Rule sources:
 * - CHANGELOG.md（版本历史唯一权威源的写法约定，见其文件头）
 * - README.md（“版本历史”渲染区块与顶部版本声明行）
 * Related tests:
 * - tests/suite-version.test.mjs（三处版本一致性门禁）
 *
 * 套件版本同步工具：以 CHANGELOG.md 为权威源，渲染/校验 README 顶部版本行、
 * README「版本历史」表（<!-- version-history:begin/end --> 区块）和 package.json 的 version。
 *
 * 用法：
 *   node <suite-path>/tools/sync-suite-version.mjs [--suite-root <path>] [--check] [--release <版本号>] [--json]
 *   - 默认：按 CHANGELOG 重写 README 两处 + package.json version
 *   - --check：只校验不写，漂移时 exit 1（测试门禁复用）
 *   - --release <版本号>：把 Unreleased 段固化为该版本条目（盖当日日期），再执行同步
 */
import fs from 'fs';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_SUITE_ROOT = path.resolve(__dirname, '..');

const HISTORY_BEGIN = '<!-- version-history:begin -->';
const HISTORY_END = '<!-- version-history:end -->';

function printUsage() {
    console.log(
        'Usage: node <suite-path>/tools/sync-suite-version.mjs [--suite-root <path>] [--check] [--release <version>] [--json]'
    );
}

function parseArgs(argv) {
    const args = argv.slice(2);
    const options = { suiteRoot: DEFAULT_SUITE_ROOT, check: false, release: '', json: false };

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === '--check') options.check = true;
        else if (arg === '--json') options.json = true;
        else if (arg === '--release') {
            options.release = args[index + 1] || '';
            index += 1;
            if (!options.release) throw new Error('Missing value for --release');
        } else if (arg === '--suite-root') {
            options.suiteRoot = path.resolve(args[index + 1] || '');
            index += 1;
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    return options;
}

function parseChangelog(content) {
    const lines = String(content || '').split('\n');
    const entries = [];
    let current = null;

    for (const line of lines) {
        const heading = line.match(/^##\s+\[([^\]]+)\](?:\s*-\s*(.+))?\s*$/);
        if (heading) {
            current = { version: heading[1].trim(), date: (heading[2] || '').trim(), lines: [] };
            entries.push(current);
            continue;
        }
        if (current) current.lines.push(line);
    }

    for (const entry of entries) {
        const bodyLines = entry.lines.map((line) => line.trim()).filter(Boolean);
        entry.bullets = bodyLines.filter((line) => line.startsWith('- '));
        entry.paragraph = bodyLines.find((line) => !line.startsWith('- ') && !line.startsWith('>')) || '';
        entry.summary = entry.paragraph || entry.bullets.map((line) => line.slice(2)).join('；');
    }

    const unreleased = entries.find((entry) => /^unreleased$/i.test(entry.version)) || null;
    const released = entries.filter((entry) => !/^unreleased$/i.test(entry.version));

    return { entries, unreleased, released, latest: released[0] || null };
}

function majorMinor(version) {
    const match = String(version || '').match(/^(\d+)\.(\d+)/);
    return match ? `${match[1]}.${match[2]}` : String(version || '');
}

function normalizePackageVersion(version) {
    const normalized = String(version || '').trim();
    if (/^\d+\.\d+$/.test(normalized)) return `${normalized}.0`;
    if (/^\d+\.\d+\.\d+$/.test(normalized)) return normalized;
    throw new Error(`版本号必须使用 X.Y 或 X.Y.Z 格式：${normalized || '空值'}`);
}

function renderHistoryTable(released) {
    const rows = released.map((entry, index) => {
        const versionCell = index === 0 ? `**${entry.version}**` : entry.version;
        const summary = entry.summary.replace(/\|/g, '\\|');
        return `| ${versionCell} | ${entry.date || '—'} | ${summary} |`;
    });
    return ['| 版本 | 日期 | 变更摘要 |', '|------|------|---------|', ...rows].join('\n');
}

function renderVersionLine(latest) {
    return `> **当前版本：${latest.version}**（${latest.date}）。`;
}

// 对比时抹平一切空白差异：宿主的 markdown 格式化工具会重排表格列宽、增删空格，
// 这些纯格式变化不应被判定为"版本漂移"。
function normalizeForCompare(text) {
    return String(text || '').replace(/\s+/g, '');
}

function extractReadmeVersionLine(readme) {
    const match = readme.match(/^> \*\*当前版本：([^*]+)\*\*（([^）]*)）/m);
    return match ? { version: match[1].trim(), date: match[2].trim() } : null;
}

function extractReadmeHistoryRows(readme) {
    const beginIndex = readme.indexOf(HISTORY_BEGIN);
    const endIndex = readme.indexOf(HISTORY_END);
    if (beginIndex === -1 || endIndex === -1 || endIndex < beginIndex) return null;

    const region = readme.slice(beginIndex + HISTORY_BEGIN.length, endIndex);
    return region
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('|') && !/^\|[\s:|-]+\|$/.test(line))
        .slice(1) // 去表头
        .map((line) => {
            const cells = line
                .replace(/^\|/, '')
                .replace(/\|$/, '')
                .split('|')
                .map((cell) => cell.trim());
            return {
                version: (cells[0] || '').replace(/\*/g, '').trim(),
                date: cells[1] || '',
                summary: cells[2] || ''
            };
        });
}

// 语义级一致性：版本行的版本号/日期一致，版本历史表逐行（版本/日期/摘要，忽略空白）一致
function readmeMatchesChangelog(readme, parsed) {
    const versionLine = extractReadmeVersionLine(readme);
    if (!versionLine) return false;
    if (versionLine.version !== parsed.latest.version || versionLine.date !== parsed.latest.date) {
        return false;
    }

    const rows = extractReadmeHistoryRows(readme);
    if (!rows || rows.length !== parsed.released.length) return false;

    return parsed.released.every((entry, index) => {
        const row = rows[index];
        return (
            row.version === entry.version &&
            normalizeForCompare(row.date) === normalizeForCompare(entry.date || '—') &&
            normalizeForCompare(row.summary) === normalizeForCompare(entry.summary.replace(/\|/g, '\\|'))
        );
    });
}

function loadFiles(suiteRoot) {
    const changelogPath = path.join(suiteRoot, 'CHANGELOG.md');
    const readmePath = path.join(suiteRoot, 'README.md');
    const packagePath = path.join(suiteRoot, 'package.json');

    if (!fs.existsSync(changelogPath)) throw new Error(`CHANGELOG.md not found: ${changelogPath}`);
    if (!fs.existsSync(readmePath)) throw new Error(`README.md not found: ${readmePath}`);
    if (!fs.existsSync(packagePath)) throw new Error(`package.json not found: ${packagePath}`);

    return {
        changelogPath,
        readmePath,
        packagePath,
        changelog: fs.readFileSync(changelogPath, 'utf8'),
        readme: fs.readFileSync(readmePath, 'utf8'),
        packageJson: JSON.parse(fs.readFileSync(packagePath, 'utf8'))
    };
}

function applyToReadme(readme, parsed) {
    const versionLine = renderVersionLine(parsed.latest);
    let updated = readme.replace(/^> \*\*当前版本：.*$/m, versionLine);
    if (!/^> \*\*当前版本：/m.test(readme)) {
        throw new Error('README 缺少“当前版本”声明行（`> **当前版本：...`），无法定位同步点');
    }

    const beginIndex = updated.indexOf(HISTORY_BEGIN);
    const endIndex = updated.indexOf(HISTORY_END);
    if (beginIndex === -1 || endIndex === -1 || endIndex < beginIndex) {
        throw new Error(`README 缺少版本历史渲染标记（${HISTORY_BEGIN} / ${HISTORY_END}）`);
    }

    const table = renderHistoryTable(parsed.released);
    updated =
        updated.slice(0, beginIndex + HISTORY_BEGIN.length) +
        '\n' +
        table +
        '\n' +
        updated.slice(endIndex);

    return updated;
}

function releaseUnreleased(changelog, version, today) {
    const parsed = parseChangelog(changelog);
    if (!parsed.unreleased) {
        throw new Error('CHANGELOG.md 没有 Unreleased 段，无法发版');
    }
    const meaningfulParagraph =
        parsed.unreleased.paragraph && parsed.unreleased.paragraph !== '（暂无未发布变更）';
    if (parsed.unreleased.bullets.length === 0 && !meaningfulParagraph) {
        throw new Error('Unreleased 段没有任何变更条目，没有可发版的内容');
    }
    const requestedPackageVersion = normalizePackageVersion(version);
    const duplicateVersion = parsed.released.some((entry) => {
        if (entry.version === version) return true;
        try {
            return normalizePackageVersion(entry.version) === requestedPackageVersion;
        } catch {
            return false;
        }
    });
    if (duplicateVersion) {
        throw new Error(`版本 ${version} 已存在于 CHANGELOG`);
    }

    const unreleasedHeading = changelog.match(/^##\s+\[Unreleased\]\s*$/im);
    if (!unreleasedHeading) {
        throw new Error('未找到 "## [Unreleased]" 标题');
    }

    return changelog.replace(
        /^##\s+\[Unreleased\]\s*$/im,
        `## [Unreleased]\n\n（暂无未发布变更）\n\n## [${version}] - ${today}`
    );
}

function syncSuiteVersion({ suiteRoot = DEFAULT_SUITE_ROOT, check = false, release = '' } = {}) {
    const result = { passed: true, errors: [], actions: [], latest: null };
    const files = loadFiles(suiteRoot);

    if (release) {
        normalizePackageVersion(release);
        const pad = (n) => String(n).padStart(2, '0');
        const now = new Date();
        const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        files.changelog = releaseUnreleased(files.changelog, release, today);
        fs.writeFileSync(files.changelogPath, files.changelog, 'utf8');
        result.actions.push(`released ${release} (${today})`);
    }

    const parsed = parseChangelog(files.changelog);
    if (!parsed.latest) {
        throw new Error('CHANGELOG.md 没有任何已发布版本条目');
    }
    result.latest = { version: parsed.latest.version, date: parsed.latest.date };

    const expectedPackageVersion = normalizePackageVersion(parsed.latest.version);
    const readmeInSync = readmeMatchesChangelog(files.readme, parsed);

    if (check) {
        if (!readmeInSync) {
            result.passed = false;
            result.errors.push('README 与 CHANGELOG 不一致（版本行或版本历史表需要重新渲染）');
        }
        if (files.packageJson.version !== expectedPackageVersion) {
            result.passed = false;
            result.errors.push(
                `package.json version（${files.packageJson.version || '缺失'}）与 CHANGELOG 最新版本（${parsed.latest.version}，应同步为 ${expectedPackageVersion}）不一致`
            );
        }
        return result;
    }

    if (!readmeInSync) {
        fs.writeFileSync(files.readmePath, applyToReadme(files.readme, parsed), 'utf8');
        result.actions.push('README 已按 CHANGELOG 重新渲染');
    }
    if (files.packageJson.version !== expectedPackageVersion) {
        const updatedPackage = { ...files.packageJson };
        const keys = Object.keys(updatedPackage);
        const ordered = {};
        for (const key of keys) {
            ordered[key] = updatedPackage[key];
            if (key === 'name') ordered.version = expectedPackageVersion;
        }
        if (!ordered.version) ordered.version = expectedPackageVersion;
        else ordered.version = expectedPackageVersion;
        fs.writeFileSync(files.packagePath, `${JSON.stringify(ordered, null, 2)}\n`, 'utf8');
        result.actions.push(`package.json version -> ${expectedPackageVersion}`);
    }

    return result;
}

function main() {
    const options = parseArgs(process.argv);
    const result = syncSuiteVersion(options);

    if (options.json) {
        console.log(JSON.stringify(result, null, 2));
    } else {
        console.log(`最新版本：${result.latest.version}（${result.latest.date}）`);
        for (const action of result.actions) console.log(`- ${action}`);
        for (const error of result.errors) console.log(`✘ ${error}`);
        if (options.check) console.log(result.passed ? '一致性检查通过' : '一致性检查未通过');
        else if (result.actions.length === 0) console.log('已是一致状态，无需改动');
    }

    if (!result.passed) {
        process.exitCode = 1;
    }
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

export { syncSuiteVersion, parseChangelog, renderHistoryTable, majorMinor, normalizePackageVersion };
