#!/usr/bin/env node

/**
 * Traceability:
 * Rule sources:
 * - skills/00-01-ai-project-manager/references/core/runtime.md
 * - skills/00-01-ai-project-manager/references/core/routing.md
 * Structured config:
 * - lib/ai-pm-protocol/stages.js
 * - lib/ai-pm-protocol/routing.js
 * - lib/ai-pm-protocol/field-contracts.js
 *
 * Change impact:
 * - If stage judgment, S2 gating, or startup/page field packages change, also check:
 *   - skills/00-01-ai-project-manager/references/core/runtime.md
 *   - skills/00-01-ai-project-manager/references/core/routing.md
 *   - skills/00-01-ai-project-manager/assets/global-files/project-profile.md
 * - result.context.profileSummary and per-target gateChecks are consumed by
 *   lib/progress-dashboard/collect.js (progress dashboard renderer).
 */
import fs from 'fs';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';
import {
    FILE_ROLE_IDS,
    STAGE_IDS,
    fieldPackages,
    globalCompanionAbilities,
    routeTargets,
    gatingRules,
    markdownStructure,
    validationPolicy
} from '../lib/ai-pm-protocol/index.js';
import { validateGlobalFiles } from './validate-global-files.mjs';
import { validatePlan } from '../skills/05-01-delivery-planner/scripts/validate-plan-structure.mjs';
import { checkPlanConsistency } from '../skills/05-01-delivery-planner/scripts/check-plan-consistency.mjs';

const __filename = fileURLToPath(import.meta.url);

const STAGE_ORDER = [
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

const STATIC_FRONTEND_ENTRYPOINTS = new Set(['index.html', 'public/index.html', 'static/index.html']);

function printUsage() {
    console.log(
        `Usage: node <suite-path>/tools/route-check.mjs <host-project-root> [--target-stage ${STAGE_ORDER.join('|')}] [--json]`
    );
    console.log(
        '<suite-path> 指套件根目录：源码仓库联调时为 project-manager-suite/，安装到宿主后为 .agent/project-manager-suite/；命令默认在宿主项目根目录执行。'
    );
}

function parseArgs(argv) {
    const args = argv.slice(2);
    const options = {
        hostRoot: '',
        targetStage: '',
        json: false
    };

    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];

        if (arg === '--json') {
            options.json = true;
            continue;
        }

        if (arg === '--target-stage') {
            const nextArg = args[i + 1];
            if (!nextArg) {
                throw new Error('Missing value for --target-stage');
            }
            options.targetStage = nextArg.toUpperCase();
            i += 1;
            continue;
        }

        if (!options.hostRoot) {
            options.hostRoot = arg;
            continue;
        }

        throw new Error(`Unknown argument: ${arg}`);
    }

    if (!options.hostRoot) {
        throw new Error('Missing host project root.');
    }

    if (options.targetStage && !STAGE_ORDER.includes(options.targetStage)) {
        throw new Error(`Unsupported target stage: ${options.targetStage}`);
    }

    return options;
}

function normalizeValue(rawValue) {
    return rawValue
        .replace(/^`|`$/g, '')
        .replace(/`/g, '')
        .replace(/【(?:用户确认|系统推断|主入口回写)】/g, '')
        .trim();
}

function isPlaceholderText(value) {
    if (value == null) return true;
    const text = normalizeValue(String(value));
    if (!text) return true;
    return (
        /^(待填写|待建立|待确认)$/.test(text) ||
        /^例如/.test(text) ||
        /^S0(?:\.5)?\s*\/\s*S1\s*\/\s*S2\s*\/\s*S3\s*\/\s*S4\s*\/\s*S5\s*\/\s*S6\s*\/\s*S7$/.test(text) ||
        /^S0\s*\/\s*S0\.5\s*\/\s*S1\s*\/\s*S2\s*\/\s*S3\s*\/\s*S4\s*\/\s*S5\s*\/\s*S6\s*\/\s*S7$/.test(text) ||
        /^本地工具\s*\/\s*内网工具\s*\/\s*待确认$/.test(text) ||
        /^业务处理\s*\/\s*系统管理\s*\/\s*内容展示\s*\/\s*待确认$/.test(text) ||
        /^操作\s*\/\s*配置\s*\/\s*查看\s*\/\s*待确认$/.test(text)
    );
}

function extractStageId(text) {
    if (!text) return null;
    if (isPlaceholderText(text)) return null;
    const match = String(text).match(/\b(S0\.5|S[0-7])\b/);
    return match ? match[1] : null;
}

function parseSectionedMarkdown(content) {
    const sections = {};
    let currentSection = null;

    for (const rawLine of content.split('\n')) {
        const line = rawLine.trim();

        const headingMatch = line.match(/^##\s+\d+\.\s+(.+)$/);
        if (headingMatch) {
            currentSection = headingMatch[1].trim();
            sections[currentSection] ||= {
                bullets: [],
                rawLines: []
            };
            continue;
        }

        if (!currentSection) {
            continue;
        }

        sections[currentSection].rawLines.push(line);

        if (line.startsWith('- ')) {
            sections[currentSection].bullets.push(line.slice(2).trim());
        }
    }

    return sections;
}

function parseLabeledBullets(bullets) {
    const map = {};

    for (const bullet of bullets) {
        const colonIndex = bullet.indexOf('：');
        if (colonIndex === -1) {
            continue;
        }

        const label = bullet.slice(0, colonIndex).trim();
        const value = normalizeValue(bullet.slice(colonIndex + 1));
        map[label] = value;
    }

    return map;
}

function loadMarkdownFile(filePath) {
    if (!filePath) return null;
    return fs.readFileSync(filePath, 'utf8');
}

function resolveAbsolutePath(hostRoot, relativePath) {
    return relativePath ? path.join(hostRoot, relativePath) : null;
}

function normalizePathForMatch(hostRoot, targetPath) {
    return path.relative(hostRoot, targetPath).split(path.sep).join('/');
}

function shouldIgnoreDir(relativeDir) {
    const segments = relativeDir.split('/').filter(Boolean);
    return validationPolicy.scan.ignoredDirectories.some((ignored) => {
        const ignoredSegments = ignored.split('/').filter(Boolean);
        if (ignoredSegments.length === 0 || ignoredSegments.length > segments.length) {
            return false;
        }

        for (let index = 0; index <= segments.length - ignoredSegments.length; index += 1) {
            if (ignoredSegments.every((segment, offset) => segments[index + offset] === segment)) {
                return true;
            }
        }

        return false;
    });
}

function walkFiles(rootDir, maxDepth, includeExtensions) {
    const results = [];

    function recurse(currentDir, depth) {
        if (depth > maxDepth) return;

        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            const relativePath = normalizePathForMatch(rootDir, fullPath);

            if (entry.isDirectory()) {
                if (shouldIgnoreDir(relativePath)) {
                    continue;
                }
                recurse(fullPath, depth + 1);
                continue;
            }

            if (entry.isFile() && includeExtensions.some((ext) => entry.name.endsWith(ext))) {
                results.push(fullPath);
            }
        }
    }

    recurse(rootDir, 0);
    return results.sort();
}

function getLocationPriority(relativePath, preferredDirs = []) {
    if (preferredDirs.length === 0) {
        return 0;
    }

    for (let index = 0; index < preferredDirs.length; index += 1) {
        const preferredDir = preferredDirs[index];
        if (relativePath === preferredDir || relativePath.startsWith(`${preferredDir}/`)) {
            return index;
        }
    }

    if (!relativePath.includes('/')) {
        return preferredDirs.length;
    }

    return null;
}

function collectMatchingCandidates(hostRoot, files, pattern, preferredDirs = []) {
    return files
        .map((filePath) => ({
            filePath,
            relativePath: normalizePathForMatch(hostRoot, filePath),
            mtimeMs: fs.statSync(filePath).mtimeMs
        }))
        .filter((candidate) => pattern.test(path.basename(candidate.filePath)))
        .map((candidate) => ({
            ...candidate,
            locationPriority: getLocationPriority(candidate.relativePath, preferredDirs)
        }))
        .filter((candidate) => preferredDirs.length === 0 || candidate.locationPriority !== null)
        .sort(
            (a, b) =>
                (a.locationPriority ?? 0) - (b.locationPriority ?? 0) ||
                b.mtimeMs - a.mtimeMs ||
                a.relativePath.localeCompare(b.relativePath)
        );
}

function findLatestMatchingFile(hostRoot, files, pattern, preferredDirs = []) {
    const candidates = collectMatchingCandidates(hostRoot, files, pattern, preferredDirs);

    return candidates[0] || null;
}

function findMatchingFiles(hostRoot, files, pattern, preferredDirs = []) {
    return collectMatchingCandidates(hostRoot, files, pattern, preferredDirs);
}

function findExactSlugFileAtPriority(hostRoot, files, prefix, slug, extension, preferredDirs, locationPriority) {
    if (!slug || !Number.isInteger(locationPriority)) return null;
    const pattern = new RegExp(`^${escapeRegExp(prefix)}-${escapeRegExp(slug)}${escapeRegExp(extension)}$`);
    return collectMatchingCandidates(hostRoot, files, pattern, preferredDirs).find(
        (candidate) => candidate.locationPriority === locationPriority
    ) || null;
}

const DESIGN_ARTIFACT_DIRS = {
    brd: ['docs/brd'],
    page: ['src/frontend/page-preview', 'page-preview', '可操作页面'],
    foundation: ['docs/prd/foundation'],
    prd: ['docs/prd']
};

function parseMarkdownTables(content) {
    const lines = content.split('\n');
    const tables = [];
    let index = 0;

    while (index < lines.length) {
        const line = lines[index].trim();
        if (!line.startsWith('|')) {
            index += 1;
            continue;
        }

        const headerLine = line;
        const separatorLine = lines[index + 1]?.trim() || '';
        if (!separatorLine.startsWith('|')) {
            index += 1;
            continue;
        }

        const headerCells = splitMarkdownTableCells(headerLine);
        const separatorCells = splitMarkdownTableCells(separatorLine);

        if (
            headerCells.length === 0 ||
            headerCells.length !== separatorCells.length ||
            !separatorCells.every((cell) => /^:?-{3,}:?$/.test(cell))
        ) {
            index += 1;
            continue;
        }

        const rows = [];
        let rowIndex = index + 2;
        while (rowIndex < lines.length) {
            const rowLine = lines[rowIndex].trim();
            if (!rowLine.startsWith('|')) {
                break;
            }

            const rowCells = splitMarkdownTableCells(rowLine);

            if (rowCells.length === headerCells.length) {
                rows.push(rowCells);
            }
            rowIndex += 1;
        }

        tables.push({
            headers: headerCells,
            rows
        });
        index = rowIndex;
    }

    return tables;
}

function splitMarkdownTableCells(line) {
    const cells = [];
    let current = '';
    let escaped = false;

    for (const character of String(line ?? '')) {
        if (character === '|' && !escaped) {
            cells.push(current.trim());
            current = '';
            continue;
        }

        current += character;
        escaped = character === '\\' && !escaped;
        if (character !== '\\') {
            escaped = false;
        }
    }

    cells.push(current.trim());
    if (cells[0] === '') cells.shift();
    if (cells.at(-1) === '') cells.pop();
    return cells;
}

function normalizeArtifactPath(rawPath) {
    if (!rawPath) return '';
    return String(rawPath)
        .replace(/^`|`$/g, '')
        .replace(/^<|>$/g, '')
        .replace(/^["']|["']$/g, '')
        .trim();
}

function isLikelyPlaceholderPath(rawPath) {
    const value = normalizeArtifactPath(rawPath);
    if (!value) return true;
    return /<.+>|路径|待补|待确认|示例|文件绝对路径/.test(value);
}

function resolveArtifactFilePath(hostRoot, rawPath) {
    const value = normalizeArtifactPath(rawPath);
    if (!value || isLikelyPlaceholderPath(value)) {
        return null;
    }

    if (path.isAbsolute(value)) {
        return value;
    }

    return path.resolve(hostRoot, value);
}

function extractFilePathColumnValues(content) {
    const tables = parseMarkdownTables(content);
    const values = [];

    for (const table of tables) {
        const pathIndex = table.headers.findIndex((header) => header === '文件路径');
        if (pathIndex === -1) {
            continue;
        }

        for (const row of table.rows) {
            const rawValue = row[pathIndex];
            const decodedValue = decodeMarkdownEntities(normalizeArtifactPath(rawValue));
            if (!decodedValue || isLikelyPlaceholderPath(decodedValue)) {
                continue;
            }
            values.push(decodedValue);
        }
    }

    return values;
}

function extractNamedArtifactPaths(content) {
    const tables = parseMarkdownTables(content);
    const artifacts = [];

    for (const table of tables) {
        const nameIndex = table.headers.findIndex((header) => header === '产物');
        const pathIndex = table.headers.findIndex((header) => header === '文件路径');
        if (nameIndex === -1 || pathIndex === -1) {
            continue;
        }

        for (const row of table.rows) {
            const rawPath = row[pathIndex];
            if (!rawPath || isLikelyPlaceholderPath(rawPath)) {
                continue;
            }

            artifacts.push({
                name: row[nameIndex],
                filePath: normalizeArtifactPath(rawPath)
            });
        }
    }

    return artifacts;
}

function findTableColumnIndex(headers, candidates) {
    for (const candidate of candidates) {
        const index = headers.findIndex((header) => header === candidate);
        if (index !== -1) {
            return index;
        }
    }

    return -1;
}

function normalizeMarkdownLinkTarget(rawPath) {
    const value = normalizeArtifactPath(rawPath);
    if (!value) return '';

    const markdownLink = value.match(/\[[^\]]+\]\(([^)]+)\)/);
    const wikiLink = value.match(/^\[\[([^|\]]+)(?:\|[^\]]+)?\]\]$/);
    const target = markdownLink?.[1] || wikiLink?.[1] || value;

    return normalizeArtifactPath(target.replace(/[?#].*$/, ''));
}

function resolveLinkedMarkdownFile(hostRoot, sourceFilePath, rawPath) {
    const value = normalizeMarkdownLinkTarget(rawPath);
    if (!value || isLikelyPlaceholderPath(value)) {
        return null;
    }

    if (path.isAbsolute(value)) {
        return value;
    }

    const normalizedValue = value.split(path.sep).join('/');
    if (/^(?:docs|src|app|frontend|backend|server|web)\//.test(normalizedValue)) {
        return path.resolve(hostRoot, normalizedValue);
    }

    return path.resolve(path.dirname(sourceFilePath), value);
}

function extractPrdIndexRows(content) {
    const tables = parseMarkdownTables(content);
    const rows = [];

    for (const table of tables) {
        const blockIndex = findTableColumnIndex(table.headers, ['区块', '功能区块', 'subprd']);
        const pathIndex = findTableColumnIndex(table.headers, ['subprd文件', 'subprd 文件', '文件路径', '链接']);
        const statusIndex = findTableColumnIndex(table.headers, ['状态', '确认状态']);
        if (blockIndex === -1 || pathIndex === -1) {
            continue;
        }

        for (const row of table.rows) {
            const block = normalizeValue(row[blockIndex] || '');
            const rawPath = row[pathIndex] || '';
            if (!block || isPlaceholderText(block) || isLikelyPlaceholderPath(rawPath)) {
                continue;
            }

            rows.push({
                block,
                rawPath,
                status: statusIndex === -1 ? '' : normalizeValue(row[statusIndex] || '')
            });
        }
    }

    return rows;
}

function toPrdFileRefs(hostRoot, sourceFilePath, rows) {
    return rows
        .map((row) => {
            const filePath = resolveLinkedMarkdownFile(hostRoot, sourceFilePath, row.rawPath);
            return {
                ...row,
                filePath,
                relativePath: filePath ? normalizePathForMatch(hostRoot, filePath) : '',
                exists: Boolean(filePath && fs.existsSync(filePath))
            };
        })
        .filter((row) => row.relativePath);
}

function uniqueSorted(values) {
    return Array.from(new Set(values.filter(Boolean))).sort();
}

function listsEqual(left, right) {
    if (left.length !== right.length) {
        return false;
    }

    return left.every((value, index) => value === right[index]);
}

function collectUnconfirmedPrdRows(source, rows) {
    return rows
        .filter((row) => row.status !== '已确认')
        .map((row) => ({
            source,
            block: row.block,
            status: row.status || '未标记'
        }));
}

function isSubprdPath(relativePath) {
    return /^docs\/prd\/subprd\/\d{2}-subprd-[^/]+\.md$/u.test(relativePath);
}

function listResolvedFiles(hostRoot, rawPaths) {
    const files = rawPaths
        .map((rawPath) => resolveArtifactFilePath(hostRoot, rawPath))
        .filter(Boolean)
        .map((filePath) => ({
            filePath,
            exists: fs.existsSync(filePath)
        }));

    return {
        files,
        allExist: files.length > 0 && files.every((item) => item.exists)
    };
}

function extractInteractionStatuses(content) {
    if (!content) return [];

    const tables = parseMarkdownTables(content);
    const statuses = [];

    for (const table of tables) {
        const statusIndex = table.headers.findIndex((header) => header === 'status');
        if (statusIndex === -1) {
            continue;
        }

        for (const row of table.rows) {
            const status = row[statusIndex]?.trim().toLowerCase();
            if (status) {
                statuses.push(status);
            }
        }
    }

    return statuses;
}

function extractUnresolvedGapCategories(content) {
    if (!content) return [];

    const categories = [];
    const blocks = content.split(/^###\s+/m).slice(1);
    for (const block of blocks) {
        const categoryMatch = block.match(/-\s+\*\*分类\*\*:\s*`([^`]+)`/);
        if (!categoryMatch) continue;

        const category = categoryMatch[1].trim();
        if (category === 'design_gap' || category === 'logic_conflict') {
            categories.push(category);
        }
    }

    // Keep compatibility with compact gap files that omit GAP headings.
    if (blocks.length === 0) {
        const pattern = /-\s+\*\*分类\*\*:\s*`([^`]+)`/g;
        let match = pattern.exec(content);
        while (match) {
            const category = match[1].trim();
            if (category === 'design_gap' || category === 'logic_conflict') {
                categories.push(category);
            }
            match = pattern.exec(content);
        }
    }

    return categories;
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function deriveBrdSlug(filePath) {
    const fileName = path.basename(filePath);
    const match = fileName.match(/^BRD-(.+)\.md$/);
    if (!match) return null;
    return match[1].replace(/-\d{8}-\d{4}$/, '');
}

function selectAuthoritativeBrd(hostRoot, markdownFiles) {
    const candidates = collectMatchingCandidates(hostRoot, markdownFiles, /^BRD-.+\.md$/, DESIGN_ARTIFACT_DIRS.brd);
    if (candidates.length === 0) {
        return {
            exists: false,
            ambiguous: false,
            candidateCount: 0,
            file: null,
            slug: null
        };
    }

    const preferredPriority = candidates[0].locationPriority ?? 0;
    const preferredCandidates = candidates.filter((candidate) => (candidate.locationPriority ?? 0) === preferredPriority);
    const slugs = Array.from(new Set(preferredCandidates.map((candidate) => deriveBrdSlug(candidate.filePath)).filter(Boolean)));
    if (slugs.length !== 1) {
        return {
            exists: true,
            ambiguous: true,
            candidateCount: preferredCandidates.length,
            file: null,
            slug: null,
            slugs
        };
    }

    const selected = preferredCandidates[0];
    return {
        exists: true,
        ambiguous: false,
        candidateCount: preferredCandidates.length,
        file: selected,
        slug: slugs[0],
        slugs
    };
}

function findExactSlugFile(hostRoot, files, prefix, slug, extension, preferredDirs = []) {
    if (!slug) return null;
    const pattern = new RegExp(`^${escapeRegExp(prefix)}-${escapeRegExp(slug)}${escapeRegExp(extension)}$`);
    return findLatestMatchingFile(hostRoot, files, pattern, preferredDirs);
}

function extractDeliveryHeader(content, label) {
    if (!content) return '';
    const escapedLabel = escapeRegExp(label);
    return content.match(new RegExp(`^>\\s*${escapedLabel}:\\s*(.*)$`, 'm'))?.[1]?.trim() || '';
}

function extractDeliveryBullet(content, label) {
    if (!content) return '';
    const escapedLabel = escapeRegExp(label);
    return content.match(new RegExp(`^-\\s*${escapedLabel}:\\s*(.*)$`, 'm'))?.[1]?.trim() || '';
}

function parsePageDeliveryAdapterMetadata(content) {
    if (!content) {
        return { found: false, validJson: false, metadata: null, error: null };
    }

    const match = content.match(/<!--\s*page-delivery-adapter:v0\.11;base64:([A-Za-z0-9+/=]+)\s*-->/);
    if (!match) {
        return { found: false, validJson: false, metadata: null, error: null };
    }

    try {
        const metadata = JSON.parse(Buffer.from(match[1], 'base64').toString('utf8'));
        return { found: true, validJson: true, metadata, error: null };
    } catch (error) {
        return { found: true, validJson: false, metadata: null, error: error.message };
    }
}

function normalizeComparablePath(hostRoot, rawPath) {
    const value = normalizeArtifactPath(rawPath);
    if (!value) return '';
    return path.resolve(path.isAbsolute(value) ? value : path.join(hostRoot, value));
}

const PAGE_DELIVERY_ADAPTER = Object.freeze({
    adapter: 'page-designer',
    adapterVersion: '0.11.0'
});

function normalizeSingleLineValue(value) {
    return decodeMarkdownEntities(String(value ?? ''))
        .replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeSingleLineRawValue(value) {
    return String(value ?? '')
        .replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function decodeMarkdownEntities(value) {
    const entityMap = {
        amp: '&',
        lt: '<',
        gt: '>',
        quot: '"',
        '#39': "'"
    };
    return String(value ?? '')
        .replace(/&(amp|lt|gt|quot|#39);/g, (entity, name) => entityMap[name] ?? entity)
        .replace(/\\`/g, '`')
        .replace(/\\\|/g, '|');
}

function isContainedPath(rootPath, targetPath) {
    const relative = path.relative(rootPath, targetPath);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveRealContainedDirectory(hostRoot, rawPath, decodeRendered = true) {
    const normalizedPath = normalizeArtifactPath(rawPath);
    const value = decodeRendered ? decodeMarkdownEntities(normalizedPath) : normalizedPath;
    if (!value || isLikelyPlaceholderPath(value)) {
        return { rawPath, realPath: null, valid: false, reason: 'missing_path' };
    }

    const hostRootReal = fs.realpathSync(hostRoot);
    const absolutePath = path.resolve(path.isAbsolute(value) ? value : path.join(hostRoot, value));
    if (!isContainedPath(hostRootReal, absolutePath)) {
        return { rawPath, realPath: null, valid: false, reason: 'outside_host' };
    }
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isDirectory()) {
        return { rawPath, realPath: null, valid: false, reason: 'missing_directory' };
    }

    const realPath = fs.realpathSync(absolutePath);
    if (!isContainedPath(hostRootReal, realPath)) {
        return { rawPath, realPath: null, valid: false, reason: 'symlink_escape' };
    }

    return { rawPath, realPath, valid: true, reason: null };
}

function resolveRealContainedFile(hostRoot, rawPath, containmentRoot = hostRoot, decodeRendered = true) {
    const normalizedPath = normalizeArtifactPath(rawPath);
    const value = decodeRendered ? decodeMarkdownEntities(normalizedPath) : normalizedPath;
    if (!value || isLikelyPlaceholderPath(value)) {
        return { rawPath, realPath: null, valid: false, reason: 'missing_path' };
    }

    const hostRootReal = fs.realpathSync(hostRoot);
    if (!containmentRoot) {
        return { rawPath, realPath: null, valid: false, reason: 'missing_containment' };
    }
    const containmentRootReal = fs.realpathSync(containmentRoot);
    if (!isContainedPath(hostRootReal, containmentRootReal)) {
        return { rawPath, realPath: null, valid: false, reason: 'containment_outside_host' };
    }
    const absolutePath = path.resolve(path.isAbsolute(value) ? value : path.join(hostRoot, value));
    if (!isContainedPath(hostRootReal, absolutePath)) {
        return { rawPath, realPath: null, valid: false, reason: 'outside_host' };
    }
    if (!isContainedPath(containmentRootReal, absolutePath)) {
        return { rawPath, realPath: null, valid: false, reason: 'outside_containment' };
    }
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
        return { rawPath, realPath: null, valid: false, reason: 'missing_file' };
    }

    const realPath = fs.realpathSync(absolutePath);
    if (!isContainedPath(hostRootReal, realPath)) {
        return { rawPath, realPath: null, valid: false, reason: 'symlink_escape' };
    }
    if (!isContainedPath(containmentRootReal, realPath)) {
        return { rawPath, realPath: null, valid: false, reason: 'outside_containment' };
    }

    return { rawPath, realPath, valid: true, reason: null };
}

function resolveRealFileSet(hostRoot, rawPaths, containmentRoot = hostRoot, decodeRendered = true) {
    const paths = Array.isArray(rawPaths) ? rawPaths : [];
    const entries = paths.map((rawPath) => resolveRealContainedFile(hostRoot, rawPath, containmentRoot, decodeRendered));
    const realPaths = [];
    const duplicates = [];
    const seen = new Set();

    for (const entry of entries) {
        if (!entry.valid) continue;
        if (seen.has(entry.realPath)) {
            duplicates.push(entry.realPath);
            continue;
        }
        seen.add(entry.realPath);
        realPaths.push(entry.realPath);
    }

    const invalidPaths = entries.filter((entry) => !entry.valid);
    return {
        rawPaths: paths,
        entries,
        realPaths: realPaths.sort(),
        duplicates,
        invalidPaths,
        allExist: paths.length > 0 && invalidPaths.length === 0 && duplicates.length === 0
    };
}

function compareRealFileSets(left, right) {
    return listsEqual(left.realPaths || [], right.realPaths || []) &&
        left.allExist === true &&
        right.allExist === true &&
        (left.duplicates || []).length === 0 &&
        (right.duplicates || []).length === 0;
}

function inspectExplainerSelfCheck(content) {
    const source = String(content || '');
    const sections = source.split(/^##\s+/m).slice(1);
    const matchingSections = sections.filter((section) => {
        const heading = section.split('\n', 1)[0]?.trim() || '';
        return heading === '一致性自查';
    });
    if (matchingSections.length !== 1) {
        return {
            tableFound: false,
            rowCount: 0,
            requiredRows: 6,
            allPassed: false,
            rows: []
        };
    }

    const tables = parseMarkdownTables(matchingSections[0]);
    const matchingTables = tables.filter(
        (candidate) => candidate.headers.includes('检查项') && candidate.headers.includes('结果')
    );
    if (matchingTables.length !== 1) {
        return {
            tableFound: false,
            rowCount: 0,
            requiredRows: 6,
            allPassed: false,
            rows: []
        };
    }

    const table = matchingTables[0];
    if (!table) {
        return {
            tableFound: false,
            rowCount: 0,
            requiredRows: 6,
            allPassed: false,
            rows: []
        };
    }

    const resultIndex = table.headers.indexOf('结果');
    const itemIndex = table.headers.indexOf('检查项');
    const rows = table.rows.map((row) => ({
        item: row[itemIndex] || '',
        result: row[resultIndex] || ''
    }));
    return {
        tableFound: true,
        rowCount: rows.length,
        requiredRows: 6,
        allPassed: rows.length === 6 && rows.every((row) => row.result === '✓'),
        rows
    };
}

function inspectS2Artifacts(hostRoot) {
    const markdownFiles = walkFiles(hostRoot, validationPolicy.scan.maxDepth, ['.md']);
    const jsonFiles = walkFiles(hostRoot, validationPolicy.scan.maxDepth, ['.json']);
    const brdSelection = selectAuthoritativeBrd(hostRoot, markdownFiles);
    const brd = brdSelection.file;
    const slug = brdSelection.slug;

    const pageDeliveryCandidates = slug
        ? findMatchingFiles(
              hostRoot,
              markdownFiles,
              new RegExp(`^page-delivery-${escapeRegExp(slug)}\\.md$`),
              DESIGN_ARTIFACT_DIRS.page
          )
        : [];
    const pageDelivery = pageDeliveryCandidates[0] || null;
    const selectedPageArtifactPriority = pageDelivery?.locationPriority ?? null;
    const findSelectedPageArtifact = (files, prefix, extension) =>
        findExactSlugFileAtPriority(
            hostRoot,
            files,
            prefix,
            slug,
            extension,
            DESIGN_ARTIFACT_DIRS.page,
            selectedPageArtifactPriority
        );
    const explainerFlow = findSelectedPageArtifact(markdownFiles, 'explainer-flow', '.md');
    const explainerBInteraction = findSelectedPageArtifact(markdownFiles, 'explainer-b-interaction', '.md');
    const explainerDelivery = findSelectedPageArtifact(markdownFiles, 'explainer-delivery', '.md');
    const gapCandidates = slug
        ? findMatchingFiles(
              hostRoot,
              markdownFiles,
              new RegExp(`^explainer-b-gap-${escapeRegExp(slug)}\\.md$`),
              DESIGN_ARTIFACT_DIRS.page
          )
        : [];
    const gapPriority = selectedPageArtifactPriority ?? gapCandidates[0]?.locationPriority ?? null;
    const gapFiles = gapPriority === null
        ? []
        : gapCandidates.filter((candidate) => candidate.locationPriority === gapPriority);
    const ledger = findSelectedPageArtifact(jsonFiles, 'page-ledger', '.json');

    let ledgerRecord = null;
    let ledgerParseError = null;
    if (ledger) {
        try {
            ledgerRecord = JSON.parse(loadMarkdownFile(ledger.filePath));
        } catch (error) {
            ledgerParseError = error.message;
        }
    }
    const ledgerPath = ledger?.filePath || null;
    const ledgerSlugMatches = Boolean(ledgerRecord && slug && ledgerRecord.slug === slug);
    const ledgerBrdMatches = Boolean(
        ledgerRecord &&
            brd &&
            normalizeComparablePath(hostRoot, ledgerRecord.brdFile) === normalizeComparablePath(hostRoot, brd.filePath)
    );
    const ledgerCheck = {
        exists: Boolean(ledger),
        path: ledger?.relativePath || null,
        phase: ledgerRecord?.phase ?? null,
        screenshotAsked: ledgerRecord?.screenshotAsked ?? null,
        slug: ledgerRecord?.slug ?? null,
        slugMatches: ledgerSlugMatches,
        brdMatches: ledgerBrdMatches,
        parseError: ledgerParseError,
        valid:
            Boolean(ledgerRecord) &&
            ledgerRecord.phase === 4 &&
            ledgerRecord.screenshotAsked === true &&
            ledgerSlugMatches &&
            ledgerBrdMatches
    };

    const pageDeliveryContent = pageDelivery ? loadMarkdownFile(pageDelivery.filePath) : null;
    const metadataParse = parsePageDeliveryAdapterMetadata(pageDeliveryContent);
    const metadata = metadataParse.metadata;
    const metadataResolvedFiles = Array.isArray(metadata?.resolvedFiles) ? metadata.resolvedFiles : [];
    const deliveryFilePaths = pageDeliveryContent ? extractFilePathColumnValues(pageDeliveryContent) : [];
    const metadataProjectRoot = resolveRealContainedDirectory(hostRoot, metadata?.projectRoot, false);
    const pageContainmentRoot = metadataProjectRoot.valid ? metadataProjectRoot.realPath : null;
    const pageCodeCheck = resolveRealFileSet(hostRoot, deliveryFilePaths, pageContainmentRoot);
    const metadataFilesCheck = resolveRealFileSet(hostRoot, metadataResolvedFiles, pageContainmentRoot, false);
    const resolvedFilesSetMatches = compareRealFileSets(pageCodeCheck, metadataFilesCheck);
    const visibleProjectSlug = extractDeliveryHeader(pageDeliveryContent, 'Project Slug');
    const visibleAdapterSource = extractDeliveryHeader(pageDeliveryContent, 'Adapter Source');
    const visibleManifestStatus = extractDeliveryHeader(pageDeliveryContent, 'Manifest Status');
    const visibleDirectionConfirmation = extractDeliveryHeader(pageDeliveryContent, '页面方向确认');
    const visibleConfirmationEvidence = extractDeliveryHeader(pageDeliveryContent, '确认证据');
    const visibleManifestSource = extractDeliveryBullet(pageDeliveryContent, 'Manifest source');
    const visibleProjectRoot = extractDeliveryBullet(pageDeliveryContent, '前端工程目录');
    const metadataAdapterSourceFile = resolveRealContainedFile(hostRoot, metadata?.adapterSource, hostRoot, false);
    const metadataSourcePathFile = resolveRealContainedFile(hostRoot, metadata?.sourcePath, hostRoot, false);
    const visibleAdapterSourceFile = resolveRealContainedFile(hostRoot, visibleAdapterSource);
    const visibleManifestSourceFile = resolveRealContainedFile(hostRoot, visibleManifestSource);
    const visibleProjectRootDirectory = resolveRealContainedDirectory(hostRoot, visibleProjectRoot);
    const adapterSourceMatchesVisible = metadataAdapterSourceFile.valid &&
        visibleAdapterSourceFile.valid &&
        metadataAdapterSourceFile.realPath === visibleAdapterSourceFile.realPath;
    const sourcePathMatchesVisible = metadataSourcePathFile.valid &&
        visibleManifestSourceFile.valid &&
        metadataSourcePathFile.realPath === visibleManifestSourceFile.realPath;
    const projectRootMatchesVisible = metadataProjectRoot.valid &&
        visibleProjectRootDirectory.valid &&
        metadataProjectRoot.realPath === visibleProjectRootDirectory.realPath;
    const metadataConfirmationEvidence = normalizeSingleLineRawValue(metadata?.confirmationEvidence);
    const visibleConfirmationEvidenceNormalized = normalizeSingleLineValue(visibleConfirmationEvidence);
    const adapterProvenance = {
        metadataFound: metadataParse.found,
        metadataValidJson: metadataParse.validJson,
        adapter: metadata?.adapter || null,
        adapterVersion: metadata?.adapterVersion || null,
        adapterSource: metadata?.adapterSource || null,
        adapterSourceExists: metadataAdapterSourceFile.valid,
        adapterSourcePath: metadataAdapterSourceFile.realPath,
        adapterSourceInvalidReason: metadataAdapterSourceFile.reason,
        adapterSourceMatchesVisible,
        sourcePath: metadata?.sourcePath || null,
        sourcePathExists: metadataSourcePathFile.valid,
        sourcePathInvalidReason: metadataSourcePathFile.reason,
        visibleManifestSource,
        visibleManifestSourceExists: visibleManifestSourceFile.valid,
        visibleManifestSourcePath: visibleManifestSourceFile.realPath,
        sourcePathMatchesVisible,
        projectRoot: metadata?.projectRoot || null,
        projectRootExists: metadataProjectRoot.valid,
        projectRootPath: metadataProjectRoot.realPath,
        projectRootInvalidReason: metadataProjectRoot.reason,
        visibleProjectRoot,
        visibleProjectRootExists: visibleProjectRootDirectory.valid,
        visibleProjectRootPath: visibleProjectRootDirectory.realPath,
        projectRootMatchesVisible,
        projectSlug: metadata?.projectSlug || null,
        manifestStatus: metadata?.manifestStatus || null,
        ledgerPathMatches: Boolean(metadata?.ledgerPath && ledgerPath) &&
            normalizeComparablePath(hostRoot, metadata.ledgerPath) === normalizeComparablePath(hostRoot, ledgerPath),
        brdPathMatches: Boolean(metadata?.brdPath && brd) &&
            normalizeComparablePath(hostRoot, metadata.brdPath) === normalizeComparablePath(hostRoot, brd.filePath),
        resolvedFilesNonEmpty: metadataResolvedFiles.length > 0,
        resolvedFilesSetMatches,
        error: metadataParse.error,
        valid:
            metadataParse.found &&
            metadataParse.validJson &&
            metadata?.adapter === PAGE_DELIVERY_ADAPTER.adapter &&
            metadata?.adapterVersion === PAGE_DELIVERY_ADAPTER.adapterVersion &&
            metadataAdapterSourceFile.valid &&
            adapterSourceMatchesVisible &&
            metadataSourcePathFile.valid &&
            sourcePathMatchesVisible &&
            metadataProjectRoot.valid &&
            projectRootMatchesVisible &&
            metadata?.projectSlug === slug &&
            metadata?.manifestStatus === 'confirmed' &&
            metadataResolvedFiles.length > 0 &&
            resolvedFilesSetMatches &&
            Boolean(ledgerPath) &&
            Boolean(brd) &&
            normalizeComparablePath(hostRoot, metadata.ledgerPath) === normalizeComparablePath(hostRoot, ledgerPath) &&
            normalizeComparablePath(hostRoot, metadata.brdPath) === normalizeComparablePath(hostRoot, brd.filePath)
    };
    const userConfirmation = {
        projectSlug: visibleProjectSlug,
        adapterSource: visibleAdapterSource,
        manifestStatus: visibleManifestStatus,
        direction: visibleDirectionConfirmation,
        evidence: visibleConfirmationEvidence,
        metadataEvidence: metadataConfirmationEvidence,
        evidenceNormalized: visibleConfirmationEvidenceNormalized,
        evidenceMatchesMetadata: Boolean(metadataConfirmationEvidence) &&
            metadataConfirmationEvidence === visibleConfirmationEvidenceNormalized,
        valid:
            visibleProjectSlug === slug &&
            Boolean(visibleAdapterSource) &&
            visibleManifestStatus === 'confirmed' &&
            visibleDirectionConfirmation === '已确认' &&
            Boolean(visibleConfirmationEvidenceNormalized) &&
            Boolean(metadataConfirmationEvidence) &&
            metadataConfirmationEvidence === visibleConfirmationEvidenceNormalized
    };

    const bInteractionStatuses = explainerBInteraction
        ? extractInteractionStatuses(loadMarkdownFile(explainerBInteraction.filePath))
        : [];
    const bInteractionLocked = bInteractionStatuses.length > 0 && bInteractionStatuses.every((status) => status === 'locked');
    const interactionCheck = {
        statuses: bInteractionStatuses,
        allLocked: bInteractionLocked,
        valid: bInteractionLocked
    };
    const selfCheck = inspectExplainerSelfCheck(explainerDelivery ? loadMarkdownFile(explainerDelivery.filePath) : null);
    const unresolvedGapCategories = gapFiles.flatMap((file) => extractUnresolvedGapCategories(loadMarkdownFile(file.filePath)));
    const explainerFilesComplete = Boolean(explainerFlow) && Boolean(explainerBInteraction) && Boolean(explainerDelivery);

    return {
        slug,
        brdExists: brdSelection.exists,
        brdPath: brd?.relativePath || null,
        brdSelection: {
            exists: brdSelection.exists,
            ambiguous: brdSelection.ambiguous,
            candidateCount: brdSelection.candidateCount,
            slugs: brdSelection.slugs || [],
            path: brd?.relativePath || null
        },
        pageDeliveryExists: Boolean(pageDelivery),
        pageDeliveryPath: pageDelivery?.relativePath || null,
        pageDelivery: {
            exists: Boolean(pageDelivery),
            path: pageDelivery?.relativePath || null
        },
        ledger: ledgerCheck,
        adapterProvenance,
        userConfirmation,
        pageCodeFiles: pageCodeCheck.realPaths,
        pageCodeFilesAllExist: pageCodeCheck.allExist,
        pageFiles: {
            paths: pageCodeCheck.realPaths,
            deliveryPaths: deliveryFilePaths,
            allExist: pageCodeCheck.allExist,
            metadataPaths: metadataResolvedFiles,
            metadataFiles: metadataFilesCheck.realPaths,
            metadataFilesAllExist: metadataFilesCheck.allExist,
            setMatches: resolvedFilesSetMatches,
            deliveryDuplicates: pageCodeCheck.duplicates,
            metadataDuplicates: metadataFilesCheck.duplicates,
            deliveryInvalidPaths: pageCodeCheck.invalidPaths,
            metadataInvalidPaths: metadataFilesCheck.invalidPaths
        },
        explainerFilesComplete,
        explainerDeliveryPath: explainerDelivery?.relativePath || null,
        explainers: {
            flow: { exists: Boolean(explainerFlow), path: explainerFlow?.relativePath || null },
            interaction: { exists: Boolean(explainerBInteraction), path: explainerBInteraction?.relativePath || null },
            delivery: { exists: Boolean(explainerDelivery), path: explainerDelivery?.relativePath || null }
        },
        selfCheck,
        bInteractionLocked,
        interactionStatusesLocked: bInteractionLocked,
        interactions: interactionCheck,
        unresolvedGapCategories,
        pageStageClosed:
            brdSelection.exists &&
            !brdSelection.ambiguous &&
            Boolean(slug) &&
            ledgerCheck.valid &&
            Boolean(pageDelivery) &&
            adapterProvenance.valid &&
            userConfirmation.valid &&
            pageCodeCheck.allExist &&
            metadataFilesCheck.allExist &&
            resolvedFilesSetMatches &&
            explainerFilesComplete &&
            selfCheck.allPassed &&
            bInteractionLocked &&
            unresolvedGapCategories.length === 0
    };
}

function inspectFoundationArtifacts(hostRoot) {
    const markdownFiles = walkFiles(hostRoot, validationPolicy.scan.maxDepth, ['.md']);
    const foundationDelivery = findLatestMatchingFile(
        hostRoot,
        markdownFiles,
        /^foundation-delivery-.+\.md$/,
        DESIGN_ARTIFACT_DIRS.foundation
    );
    if (!foundationDelivery) {
        return {
            foundationDeliveryExists: false,
            artifactsReady: false,
            artifactFiles: []
        };
    }

    const artifactFiles = listResolvedFiles(
        hostRoot,
        extractNamedArtifactPaths(loadMarkdownFile(foundationDelivery.filePath)).map((item) => item.filePath)
    );

    return {
        foundationDeliveryExists: true,
        foundationDeliveryPath: foundationDelivery.relativePath,
        artifactsReady: artifactFiles.allExist,
        artifactFiles: artifactFiles.files
    };
}

function inspectPrdArtifacts(hostRoot) {
    const markdownFiles = walkFiles(hostRoot, validationPolicy.scan.maxDepth, ['.md']);
    const featureList = findLatestMatchingFile(hostRoot, markdownFiles, /^prd-feature-list-.+\.md$/, DESIGN_ARTIFACT_DIRS.prd);
    const mainprd = findLatestMatchingFile(hostRoot, markdownFiles, /^mainprd-.+\.md$/, DESIGN_ARTIFACT_DIRS.prd);
    const featureRows = featureList ? extractPrdIndexRows(loadMarkdownFile(featureList.filePath)) : [];
    const mainRows = mainprd ? extractPrdIndexRows(loadMarkdownFile(mainprd.filePath)) : [];
    const featureRefs = featureList ? toPrdFileRefs(hostRoot, featureList.filePath, featureRows) : [];
    const mainRefs = mainprd ? toPrdFileRefs(hostRoot, mainprd.filePath, mainRows) : [];
    const featureTargets = uniqueSorted(featureRefs.map((row) => row.relativePath));
    const mainTargets = uniqueSorted(mainRefs.map((row) => row.relativePath));
    const expectedTargets = uniqueSorted([...featureTargets, ...mainTargets]);
    const existingTargets = expectedTargets.filter((relativePath) => fs.existsSync(path.join(hostRoot, relativePath)));
    const missingSubprd = expectedTargets.filter((relativePath) => !fs.existsSync(path.join(hostRoot, relativePath)));
    const indexCountsAligned = featureRows.length > 0 && featureRows.length === mainRows.length;
    const indexTargetsAligned = expectedTargets.length > 0 && listsEqual(featureTargets, mainTargets);
    const subprdPathsValid = expectedTargets.length > 0 && expectedTargets.every(isSubprdPath);
    const unconfirmedRows = [
        ...collectUnconfirmedPrdRows('feature-list', featureRows),
        ...collectUnconfirmedPrdRows('mainprd', mainRows)
    ];
    const allRowsConfirmed = unconfirmedRows.length === 0;

    return {
        featureListExists: Boolean(featureList),
        featureListPath: featureList?.relativePath || null,
        featureListItemCount: featureRows.length,
        mainprdExists: Boolean(mainprd),
        mainprdPath: mainprd?.relativePath || null,
        mainprdIndexCount: mainRows.length,
        expectedSubprdCount: expectedTargets.length,
        subprdCount: existingTargets.length,
        missingSubprd,
        indexCountsAligned,
        indexTargetsAligned,
        subprdPathsValid,
        allRowsConfirmed,
        unconfirmedRows,
        fullPrdReady:
            Boolean(featureList) &&
            Boolean(mainprd) &&
            indexCountsAligned &&
            indexTargetsAligned &&
            subprdPathsValid &&
            missingSubprd.length === 0 &&
            allRowsConfirmed
    };
}

const BASELINE_ROUTE_SKILLS = new Set(['brd-writer', 'page-explainer', 'foundation-builder', 'prd-writer']);
const BASELINE_NEXT_SKILLS = new Set(['ai-project-manager', ...BASELINE_ROUTE_SKILLS]);

function inspectBaselineAudit(hostRoot) {
    const jsonFiles = walkFiles(hostRoot, validationPolicy.scan.maxDepth, ['.json']);
    const auditFiles = jsonFiles
        .map((filePath) => ({
            filePath,
            relativePath: normalizePathForMatch(hostRoot, filePath),
            mtimeMs: fs.statSync(filePath).mtimeMs
        }))
        .filter((item) => /^docs\/baseline\/baseline-audit-.+\.json$/.test(item.relativePath))
        .sort((a, b) => b.mtimeMs - a.mtimeMs || a.relativePath.localeCompare(b.relativePath));

    const latest = auditFiles[0];
    if (!latest) {
        return {
            exists: false,
            usable: false
        };
    }

    try {
        const parsed = JSON.parse(loadMarkdownFile(latest.filePath));
        const recommendedNextSkill = parsed.summary?.recommended_next_skill || null;
        const status = parsed.summary?.status || null;
        const artifacts = Array.isArray(parsed.artifacts)
            ? parsed.artifacts.filter((artifact) => BASELINE_ROUTE_SKILLS.has(artifact.recommended_skill))
            : [];
        const complete = status === 'ready' && recommendedNextSkill === null;

        return {
            exists: true,
            auditPath: latest.relativePath,
            mode: parsed.mode || null,
            scope: parsed.scope || null,
            slug: parsed.slug || null,
            status,
            recommendedNextSkill,
            artifacts,
            usable:
                parsed.mode === 'existing-project-baseline' &&
                parsed.scope === 'maintenance-docs-only' &&
                (complete || BASELINE_NEXT_SKILLS.has(recommendedNextSkill))
        };
    } catch (error) {
        return {
            exists: true,
            auditPath: latest.relativePath,
            usable: false,
            parseError: error.message
        };
    }
}

function baselineRecommendedArtifactSatisfied(recommendedSkill, { s2Artifacts, foundationArtifacts, prdArtifacts }) {
    if (recommendedSkill === 'brd-writer') {
        return s2Artifacts.brdExists;
    }

    if (recommendedSkill === 'page-explainer') {
        return s2Artifacts.explainerFilesComplete;
    }

    if (recommendedSkill === 'foundation-builder') {
        return foundationArtifacts.foundationDeliveryExists && foundationArtifacts.artifactsReady;
    }

    if (recommendedSkill === 'prd-writer') {
        return prdArtifacts.fullPrdReady;
    }

    return false;
}

function directoryHasCodeFiles(rootDir, relativeDir, maxDepth = 4) {
    const startDir = path.join(rootDir, relativeDir);
    if (!fs.existsSync(startDir) || !fs.statSync(startDir).isDirectory()) {
        return false;
    }

    function recurse(currentDir, depth) {
        if (depth > maxDepth) return false;

        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            const relativePath = normalizePathForMatch(rootDir, fullPath);

            if (entry.isDirectory()) {
                if (shouldIgnoreDir(relativePath)) {
                    continue;
                }
                if (recurse(fullPath, depth + 1)) {
                    return true;
                }
                continue;
            }

            if (entry.isFile() && /\.(vue|tsx?|jsx?|java|py|go|rb|php|cs|sql)$/i.test(entry.name)) {
                return true;
            }
        }

        return false;
    }

    return recurse(startDir, 0);
}

function hasExistingCodebaseSignal(hostRoot) {
    const rootMarkers = [
        'package.json',
        'pom.xml',
        'build.gradle',
        'pyproject.toml',
        'requirements.txt',
        'go.mod',
        'Cargo.toml',
        'composer.json'
    ];

    if (rootMarkers.some((marker) => fs.existsSync(path.join(hostRoot, marker)))) {
        return true;
    }

    if (
        [...STATIC_FRONTEND_ENTRYPOINTS].some((relativePath) => {
            const entrypointPath = path.join(hostRoot, relativePath);
            return fs.existsSync(entrypointPath) && fs.statSync(entrypointPath).isFile();
        })
    ) {
        return true;
    }

    return ['src', 'app', 'frontend', 'backend', 'server', 'web'].some((relativeDir) =>
        directoryHasCodeFiles(hostRoot, relativeDir)
    );
}

function inspectDevelopmentPlanArtifacts(hostRoot) {
    const markdownFiles = walkFiles(hostRoot, validationPolicy.scan.maxDepth, ['.md']);
    const deliveryPlan = findLatestMatchingFile(
        hostRoot,
        markdownFiles,
        /^main-delivery-plan-.+\.md$/,
        ['docs/plans/delivery-plans']
    );
    const validation = deliveryPlan
        ? validatePlan(loadMarkdownFile(deliveryPlan.filePath), { planPath: deliveryPlan.filePath })
        : null;
    let planConsistency = null;
    if (deliveryPlan && validation?.passed) {
        try {
            planConsistency = checkPlanConsistency({ planPath: deliveryPlan.filePath });
        } catch (error) {
            planConsistency = {
                passed: false,
                purpose: 's4_pre_coding_plan_consistency_check',
                activeTaskId: null,
                activeSubPlanPath: null,
                errors: [
                    {
                        type: 'plan_consistency_check_failed',
                        message: error.message
                    }
                ],
                warnings: [],
                sources: {
                    mainPlan: { path: deliveryPlan.filePath },
                    taskKanban: { path: null },
                    subPlan: { path: null }
                }
            };
        }
    }

    return {
        deliveryPlanExists: Boolean(deliveryPlan),
        deliveryPlanPath: deliveryPlan?.relativePath || null,
        structureValid: validation ? validation.passed : false,
        structureErrors: validation ? validation.errors.map((error) => error.message) : [],
        planConsistency: planConsistency || {
            passed: false,
            purpose: 's4_pre_coding_plan_consistency_check',
            activeTaskId: null,
            activeSubPlanPath: null,
            errors: [],
            warnings: [],
            sources: {
                mainPlan: { path: deliveryPlan?.filePath || null },
                taskKanban: { path: null },
                subPlan: { path: null }
            }
        }
    };
}

function reviewIssueSortValue(relativePath) {
    const filename = path.basename(relativePath);
    const match = filename.match(/^(?<prefix>.+)-issues(?:-(?<suffix>\d+))?\.md$/);
    if (!match) {
        return { prefix: filename, suffix: 0 };
    }

    return {
        prefix: match.groups.prefix,
        suffix: Number(match.groups.suffix || 1)
    };
}

function compareReviewIssueFiles(a, b) {
    const left = reviewIssueSortValue(a.relativePath);
    const right = reviewIssueSortValue(b.relativePath);
    return (
        left.prefix.localeCompare(right.prefix) ||
        left.suffix - right.suffix ||
        a.relativePath.localeCompare(b.relativePath)
    );
}

function isPositiveReviewConclusion(content) {
    const text = content.replace(/\s+/g, ' ').trim();
    if (!text) {
        return false;
    }

    if (/未通过|不通过|未完工|需\s*(?:writer\s*)?续改|需补|返工|BLOCK(?:ED)?/i.test(text)) {
        return false;
    }

    return /结论\s*[=:：]\s*(?:已完工|通过|DONE)|(?:^|\s)(?:已完工|DONE)(?:\s|$)/i.test(text);
}

function inspectTestCaseArtifacts(hostRoot) {
    const markdownFiles = walkFiles(hostRoot, validationPolicy.scan.maxDepth, ['.md']);
    const relativeFiles = markdownFiles.map((filePath) => ({
        filePath,
        relativePath: normalizePathForMatch(hostRoot, filePath)
    }));

    const tcMain = relativeFiles.find((item) => /^docs\/test-case\/tc-main-.+\.md$/.test(item.relativePath));
    const domainTcFiles = relativeFiles.filter((item) =>
        /^docs\/test-case\/(?!reports\/|tc-reviews\/|acceptance-)[^/]+\/tc-[^/]+\.md$/.test(item.relativePath)
    );
    const reviewIssues = relativeFiles
        .filter((item) => /^docs\/test-case\/tc-reviews\/.+-issues(?:-\d+)?\.md$/.test(item.relativePath))
        .sort(compareReviewIssueFiles);
    const latestReview = reviewIssues[reviewIssues.length - 1] || null;
    const latestReviewDone = latestReview ? isPositiveReviewConclusion(loadMarkdownFile(latestReview.filePath)) : false;

    return {
        tcMainExists: Boolean(tcMain),
        tcMainPath: tcMain?.relativePath || null,
        domainTcCount: domainTcFiles.length,
        latestReviewPath: latestReview?.relativePath || null,
        latestReviewDone,
        testCasesReady: Boolean(tcMain) && domainTcFiles.length > 0 && latestReviewDone
    };
}

function inspectTestExecutionArtifacts(hostRoot) {
    const markdownFiles = walkFiles(hostRoot, validationPolicy.scan.maxDepth, ['.md']);
    const relativeFiles = markdownFiles.map((filePath) => ({
        filePath,
        relativePath: normalizePathForMatch(hostRoot, filePath)
    }));

    const indexReports = relativeFiles.filter((item) => /^docs\/test-case\/reports\/index\.md$/.test(item.relativePath));
    const blockReports = relativeFiles.filter((item) => /^docs\/test-case\/reports\/测试验收-.+\.md$/.test(item.relativePath));
    const defectsFile = relativeFiles.find((item) => item.relativePath === 'docs/test-case/reports/defects.md');

    return {
        indexReportCount: indexReports.length,
        blockReportCount: blockReports.length,
        defectsFileExists: Boolean(defectsFile),
        reportsReady: indexReports.length > 0 && blockReports.length > 0
    };
}

function extractProfileContext(content) {
    if (!content) {
        return {
            fields: {},
            pendingItems: []
        };
    }

    const structure = markdownStructure[FILE_ROLE_IDS.PROFILE];
    const sections = parseSectionedMarkdown(content);

    const combinedLabels = {};
    for (const sectionName of Object.values(structure.sections)) {
        if (!sections[sectionName]) continue;
        Object.assign(combinedLabels, parseLabeledBullets(sections[sectionName].bullets));
    }

    const fields = {};
    for (const [fieldKey, label] of Object.entries(structure.labels)) {
        fields[fieldKey] = combinedLabels[label] || '';
    }

    fields.current_stage = extractStageId(fields.current_stage);
    fields.recommended_stage = extractStageId(fields.recommended_stage);

    const pendingSection = sections[structure.sections.pending];
    const pendingItems = pendingSection
        ? pendingSection.bullets
              .map((bullet) => normalizeValue(bullet))
              .filter((item) => item && item !== '无（S0 待确认项已全部确认）' && item !== '无')
        : [];

    return {
        fields,
        pendingItems
    };
}

function extractPlanContext(content) {
    if (!content) {
        return {
            currentStage: null,
            currentGoal: [],
            inProgressTasks: [],
            nextTasks: [],
            completionCriteria: [],
            dependencies: [],
            pendingItems: []
        };
    }

    const structure = markdownStructure[FILE_ROLE_IDS.PLAN];
    const sections = parseSectionedMarkdown(content);
    const getBullets = (sectionTitle) => sections[sectionTitle]?.bullets || [];
    const getBulletsByAliases = (...sectionTitles) =>
        sectionTitles.flatMap((sectionTitle) => getBullets(sectionTitle)).filter(Boolean);

    const currentStageBullets = getBulletsByAliases(structure.sections.currentStage);

    return {
        currentStage: extractStageId(currentStageBullets[0] || ''),
        currentGoal: getBulletsByAliases(structure.sections.currentGoal),
        inProgressTasks: getBulletsByAliases(structure.sections.inProgress, '当前活跃 Phase / Task'),
        nextTasks: getBulletsByAliases(structure.sections.nextTasks),
        completionCriteria: getBulletsByAliases(structure.sections.completionCriteria, '完成标准摘要'),
        dependencies: getBulletsByAliases(structure.sections.dependencies, '当前阻塞与前置依赖'),
        pendingItems: getBulletsByAliases(structure.sections.pending)
    };
}

function isMissingValue(value) {
    if (value == null) return true;
    const normalized = String(value).trim();
    if (!normalized) return true;
    if (normalized === '待确认') return true;
    if (normalized === '待建立') return true;
    if (normalized === '待填写') return true;
    if (isPlaceholderText(normalized)) return true;
    return false;
}

function hasPageTaskSignal(profileContext, planContext) {
    const deliverable = profileContext.fields.current_round_deliverable || '';
    const pageSpecificFields = [
        profileContext.fields.page_primary_user,
        profileContext.fields.page_primary_purpose,
        profileContext.fields.page_positioning_tag
    ];

    const textPool = [
        ...Object.values(profileContext.fields),
        deliverable,
        ...planContext.currentGoal,
        ...planContext.nextTasks,
        ...planContext.inProgressTasks
    ].join(' ');

    if (pageSpecificFields.some((value) => !isMissingValue(value))) {
        return true;
    }

    return /页面|原型|前端|界面|网站|落地页|用户界面|\b(?:frontend|front-end|page|screen|website|landing\s+page|UI|UX)\b/i.test(
        textPool
    );
}

function hasExistingFrontendCodeSignal(hostRoot) {
    const frontendFiles = walkFiles(hostRoot, validationPolicy.scan.maxDepth, [
        '.vue',
        '.tsx',
        '.jsx',
        '.svelte',
        '.astro',
        '.html',
        '.css'
    ]);

    return frontendFiles.some((filePath) => {
        const relativePath = normalizePathForMatch(hostRoot, filePath);
        return (
            STATIC_FRONTEND_ENTRYPOINTS.has(relativePath.toLowerCase()) ||
            /(^|\/)(frontend|web|pages|components|views|app)\//i.test(relativePath) ||
            /^src\/[^/]+\.(vue|tsx|jsx|svelte|astro|html|css)$/i.test(relativePath)
        );
    });
}

function hasCanonicalDesignSystem(hostRoot) {
    const designSystemRoot = path.join(hostRoot, 'design-system');
    if (!fs.existsSync(designSystemRoot) || !fs.statSync(designSystemRoot).isDirectory()) {
        return false;
    }

    if (fs.existsSync(path.join(designSystemRoot, 'DESIGN.md'))) {
        return true;
    }

    return fs.readdirSync(designSystemRoot, { withFileTypes: true }).some(
        (entry) => entry.isDirectory() && fs.existsSync(path.join(designSystemRoot, entry.name, 'MASTER.md'))
    );
}

function hasCurrentUiWorkSignal(planContext) {
    const textPool = [
        ...planContext.currentGoal,
        ...planContext.inProgressTasks,
        ...planContext.nextTasks
    ]
        .filter(Boolean)
        .join(' ');

    return /(页面|前端|界面|\bUI\b|\bUX\b|frontend|front-end|design\s*(system|token)|\bCSS\b|Vue|Svelte|\bReact\s+UI\s+component\b)/i.test(
        textPool
    );
}

function hasSecurityGateSignal(profileContext, planContext) {
    const textPool = [
        profileContext.fields.current_round_deliverable,
        profileContext.fields.largest_uncertainty,
        ...planContext.currentGoal,
        ...planContext.nextTasks,
        ...planContext.inProgressTasks,
        ...planContext.completionCriteria
    ]
        .filter(Boolean)
        .join(' ');

    return /完工|落地放行|go-live|go live|release|安全放行|最终安全检查|security gate|security scan/i.test(
        textPool
    );
}

function hasBuildAvailableForValidation(profileContext, planContext) {
    const textPool = [
        profileContext.fields.current_round_deliverable,
        profileContext.fields.largest_uncertainty,
        ...planContext.currentGoal,
        ...planContext.nextTasks,
        ...planContext.inProgressTasks,
        ...planContext.completionCriteria
    ]
        .filter(Boolean)
        .join(' ');

    return /开发完成|已实现|可验证基础|具备可验证|可运行版本|本地可运行|构建完成|ready for test|build available/i.test(
        textPool
    );
}

function isPagePositioningTagResolved(value) {
    if (isMissingValue(value)) return false;
    return /(操作|配置|查看)/.test(value);
}

function hasStartupMinimum(profileContext) {
    const values = fieldValueMap(profileContext);
    return collectMissingFields(fieldPackages.startupMinimum, values).length === 0;
}

function inferRecommendedStage(profileContext, planContext, hostRoot) {
    if (profileContext.fields.recommended_stage) {
        return profileContext.fields.recommended_stage;
    }

    if (profileContext.fields.current_stage) {
        return profileContext.fields.current_stage;
    }

    if (planContext.currentStage) {
        return planContext.currentStage;
    }

    if (hasSecurityGateSignal(profileContext, planContext)) {
        return STAGE_IDS.S7;
    }

    if (!hasStartupMinimum(profileContext) && hasExistingCodebaseSignal(hostRoot)) {
        return STAGE_IDS.S0_5;
    }

    if (hasPageTaskSignal(profileContext, planContext)) {
        return STAGE_IDS.S2;
    }

    if (hasStartupMinimum(profileContext)) {
        return STAGE_IDS.S1;
    }

    if (planContext.currentGoal.some((item) => /BRD|业务需求文档/.test(item))) {
        return STAGE_IDS.S1;
    }

    return STAGE_IDS.S0;
}

function fieldValueMap(profileContext) {
    return {
        project_name: profileContext.fields.project_name,
        project_one_liner: profileContext.fields.project_one_liner,
        target_users: profileContext.fields.target_users,
        main_problem: profileContext.fields.main_problem,
        collaboration_mode: profileContext.fields.collaboration_mode,
        coverage_scope: profileContext.fields.coverage_scope,
        page_primary_user: profileContext.fields.page_primary_user,
        page_primary_purpose: profileContext.fields.page_primary_purpose,
        page_positioning_tag: profileContext.fields.page_positioning_tag,
        current_stage: profileContext.fields.current_stage,
        recommended_stage: profileContext.fields.recommended_stage,
        current_round_deliverable: profileContext.fields.current_round_deliverable,
        current_executor: profileContext.fields.current_executor,
        largest_uncertainty: profileContext.fields.largest_uncertainty
    };
}

function collectMissingFields(fieldKeys, values, extraChecks = {}) {
    return fieldKeys.filter((fieldKey) => {
        if (fieldKey === 'page_positioning_tag') {
            return !isPagePositioningTagResolved(values[fieldKey]);
        }

        if (extraChecks[fieldKey]) {
            return !extraChecks[fieldKey](values[fieldKey]);
        }

        return isMissingValue(values[fieldKey]);
    });
}

function hasRecentStageWriteback(hostRoot, validationResult, targetStage) {
    const latestDevlogRelative = validationResult.authority[FILE_ROLE_IDS.DEVLOG];
    if (!latestDevlogRelative) return false;

    const latestDevlogPath = resolveAbsolutePath(hostRoot, latestDevlogRelative);
    const profilePath = resolveAbsolutePath(hostRoot, validationResult.authority[FILE_ROLE_IDS.PROFILE]);
    const planPath = resolveAbsolutePath(hostRoot, validationResult.authority[FILE_ROLE_IDS.PLAN]);

    if (!latestDevlogPath || !fs.existsSync(latestDevlogPath)) {
        return false;
    }

    const logContent = fs.readFileSync(latestDevlogPath, 'utf8');
    if (targetStage && logContent.includes(targetStage)) {
        return true;
    }

    const logMtime = fs.statSync(latestDevlogPath).mtimeMs;
    const referenceMtime = Math.max(
        profilePath && fs.existsSync(profilePath) ? fs.statSync(profilePath).mtimeMs : 0,
        planPath && fs.existsSync(planPath) ? fs.statSync(planPath).mtimeMs : 0
    );

    return logMtime >= referenceMtime;
}

function buildGateChecks({ targetStage, profileContext, planContext, validationResult, hostRoot }) {
    const values = fieldValueMap(profileContext);
    const checks = {};
    const s2Artifacts = inspectS2Artifacts(hostRoot);
    const foundationArtifacts = inspectFoundationArtifacts(hostRoot);
    const prdArtifacts = inspectPrdArtifacts(hostRoot);
    const developmentPlanArtifacts = inspectDevelopmentPlanArtifacts(hostRoot);
    const baselineAudit = inspectBaselineAudit(hostRoot);
    const testCaseArtifacts = inspectTestCaseArtifacts(hostRoot);
    const testExecutionArtifacts = inspectTestExecutionArtifacts(hostRoot);

    checks.startupMinimum = {
        pass: collectMissingFields(fieldPackages.startupMinimum, values).length === 0,
        missingFields: collectMissingFields(fieldPackages.startupMinimum, values)
    };

    if (targetStage === STAGE_IDS.S2) {
        checks.brdReadyForPage = {
            pass: s2Artifacts.brdExists,
            evidence: {
                brdExists: s2Artifacts.brdExists,
                brdPath: s2Artifacts.brdPath
            }
        };

        checks.pageTaskRequired = {
            pass: collectMissingFields(fieldPackages.pageTaskRequired, values).length === 0,
            missingFields: collectMissingFields(fieldPackages.pageTaskRequired, values)
        };

        checks.pageStageClosedForPrd = {
            pass: s2Artifacts.pageStageClosed,
            evidence: {
                slug: s2Artifacts.slug,
                brdExists: s2Artifacts.brdExists,
                brdPath: s2Artifacts.brdPath,
                brdSelection: s2Artifacts.brdSelection,
                ledger: s2Artifacts.ledger,
                ledgerPath: s2Artifacts.ledger.path,
                ledgerPhase: s2Artifacts.ledger.phase,
                adapterProvenance: s2Artifacts.adapterProvenance,
                userConfirmation: s2Artifacts.userConfirmation,
                pageDeliveryExists: s2Artifacts.pageDeliveryExists,
                pageDeliveryPath: s2Artifacts.pageDeliveryPath,
                pageDelivery: s2Artifacts.pageDelivery,
                pageCodeFiles: s2Artifacts.pageCodeFiles,
                pageCodeFilesAllExist: s2Artifacts.pageCodeFilesAllExist,
                pageFiles: s2Artifacts.pageFiles,
                explainerFilesComplete: s2Artifacts.explainerFilesComplete,
                explainerDeliveryPath: s2Artifacts.explainerDeliveryPath,
                explainers: s2Artifacts.explainers,
                explainerPaths: s2Artifacts.explainers,
                selfCheck: s2Artifacts.selfCheck,
                selfCheckResult: s2Artifacts.selfCheck,
                interactionStatusesLocked: s2Artifacts.interactionStatusesLocked,
                interactions: s2Artifacts.interactions,
                interactionLockResult: s2Artifacts.interactions,
                unresolvedGapCategories: s2Artifacts.unresolvedGapCategories
            }
        };

        checks.foundationReadyForPrd = {
            pass: foundationArtifacts.foundationDeliveryExists && foundationArtifacts.artifactsReady,
            evidence: {
                foundationDeliveryExists: foundationArtifacts.foundationDeliveryExists,
                artifactsReady: foundationArtifacts.artifactsReady
            }
        };
    }

    if (targetStage === STAGE_IDS.S3 || targetStage === STAGE_IDS.S5) {
        checks.fullPrdReady = {
            pass: prdArtifacts.fullPrdReady,
            evidence: {
                featureListExists: prdArtifacts.featureListExists,
                featureListPath: prdArtifacts.featureListPath,
                featureListItemCount: prdArtifacts.featureListItemCount,
                mainprdExists: prdArtifacts.mainprdExists,
                mainprdPath: prdArtifacts.mainprdPath,
                mainprdIndexCount: prdArtifacts.mainprdIndexCount,
                expectedSubprdCount: prdArtifacts.expectedSubprdCount,
                subprdCount: prdArtifacts.subprdCount,
                indexCountsAligned: prdArtifacts.indexCountsAligned,
                indexTargetsAligned: prdArtifacts.indexTargetsAligned,
                subprdPathsValid: prdArtifacts.subprdPathsValid,
                allRowsConfirmed: prdArtifacts.allRowsConfirmed,
                missingSubprd: prdArtifacts.missingSubprd,
                unconfirmedRows: prdArtifacts.unconfirmedRows
            }
        };
    }

    if (targetStage === STAGE_IDS.S3) {
        checks.foundationReadyForDevelopmentPlan = {
            pass: foundationArtifacts.foundationDeliveryExists && foundationArtifacts.artifactsReady,
            evidence: {
                foundationDeliveryExists: foundationArtifacts.foundationDeliveryExists,
                foundationDeliveryPath: foundationArtifacts.foundationDeliveryPath || null,
                artifactsReady: foundationArtifacts.artifactsReady
            }
        };
    }

    if (targetStage === STAGE_IDS.S5) {
        const buildSignalPresent = hasBuildAvailableForValidation(profileContext, planContext);
        checks.buildAvailableForValidation = {
            pass: buildSignalPresent,
            evidence: {
                buildSignalPresent
            }
        };
    }

    if (targetStage === STAGE_IDS.S4) {
        checks.developmentPlanReady = {
            pass:
                developmentPlanArtifacts.deliveryPlanExists &&
                developmentPlanArtifacts.structureValid &&
                developmentPlanArtifacts.planConsistency.passed,
            evidence: {
                deliveryPlanExists: developmentPlanArtifacts.deliveryPlanExists,
                deliveryPlanPath: developmentPlanArtifacts.deliveryPlanPath,
                structureValid: developmentPlanArtifacts.structureValid,
                structureErrors: developmentPlanArtifacts.structureErrors,
                planConsistency: developmentPlanArtifacts.planConsistency
            }
        };
    }

    if (targetStage === STAGE_IDS.S6) {
        checks.testCasesReady = {
            pass: testCaseArtifacts.testCasesReady,
            evidence: {
                tcMainExists: testCaseArtifacts.tcMainExists,
                tcMainPath: testCaseArtifacts.tcMainPath,
                domainTcCount: testCaseArtifacts.domainTcCount,
                latestReviewPath: testCaseArtifacts.latestReviewPath,
                latestReviewDone: testCaseArtifacts.latestReviewDone
            }
        };
    }

    if (targetStage === STAGE_IDS.S7) {
        const releaseGateSignalPresent =
            hasSecurityGateSignal(profileContext, planContext) ||
            profileContext.fields.current_stage === STAGE_IDS.S7 ||
            profileContext.fields.recommended_stage === STAGE_IDS.S7;

        checks.securityScanReady = {
            pass: testExecutionArtifacts.reportsReady && releaseGateSignalPresent,
            evidence: {
                indexReportCount: testExecutionArtifacts.indexReportCount,
                blockReportCount: testExecutionArtifacts.blockReportCount,
                defectsFileExists: testExecutionArtifacts.defectsFileExists,
                releaseGateSignalPresent
            }
        };
    }

    checks.stageWritebackBeforeRouting = {
        pass: hasRecentStageWriteback(hostRoot, validationResult, targetStage),
        evidence: validationResult.authority[FILE_ROLE_IDS.DEVLOG]
    };

    if (targetStage === STAGE_IDS.S0_5 || baselineAudit.exists) {
        checks.projectBaselineAuditReady = {
            pass: baselineAudit.usable,
            evidence: {
                auditPath: baselineAudit.auditPath || null,
                mode: baselineAudit.mode || null,
                scope: baselineAudit.scope || null,
                status: baselineAudit.status || null,
                recommendedNextSkill: baselineAudit.recommendedNextSkill || null,
                recommendedArtifactSatisfied: baselineRecommendedArtifactSatisfied(
                    baselineAudit.recommendedNextSkill,
                    { s2Artifacts, foundationArtifacts, prdArtifacts }
                ),
                parseError: baselineAudit.parseError || null
            }
        };
    }

    return checks;
}

function buildBlockingReasons({ targetStage, currentStage, recommendedStage, gateChecks }) {
    const reasons = [];

    if (targetStage !== STAGE_IDS.S0_5 && !gateChecks.startupMinimum.pass) {
        reasons.push({
            code: 'startup_minimum_missing',
            message: gatingRules.startupMinimum.description,
            missingFields: gateChecks.startupMinimum.missingFields
        });
    }

    if (
        targetStage === STAGE_IDS.S0_5 &&
        gateChecks.projectBaselineAuditReady?.evidence.auditPath &&
        !gateChecks.projectBaselineAuditReady.pass
    ) {
        reasons.push({
            code: 'baseline_audit_missing',
            message: gatingRules.projectBaselineAuditReady.description
        });
    }

    if (targetStage === STAGE_IDS.S2 && gateChecks.brdReadyForPage && !gateChecks.brdReadyForPage.pass) {
        reasons.push({
            code: 'brd_missing',
            message: gatingRules.brdReadyForPage.description
        });
    }

    if (targetStage === STAGE_IDS.S2 && gateChecks.pageTaskRequired && !gateChecks.pageTaskRequired.pass) {
        reasons.push({
            code: 'page_task_required_missing',
            message: gatingRules.pageTaskRequired.description,
            missingFields: gateChecks.pageTaskRequired.missingFields
        });
    }

    if ((targetStage === STAGE_IDS.S3 || targetStage === STAGE_IDS.S5) && gateChecks.fullPrdReady && !gateChecks.fullPrdReady.pass) {
        reasons.push({
            code: 'full_prd_missing',
            message: gatingRules.fullPrdReady.description
        });
    }

    if (
        targetStage === STAGE_IDS.S3 &&
        gateChecks.foundationReadyForDevelopmentPlan &&
        !gateChecks.foundationReadyForDevelopmentPlan.pass
    ) {
        reasons.push({
            code: 'foundation_missing',
            message: gatingRules.foundationReadyForDevelopmentPlan.description
        });
    }

    if (targetStage === STAGE_IDS.S5 && gateChecks.buildAvailableForValidation && !gateChecks.buildAvailableForValidation.pass) {
        reasons.push({
            code: 'build_available_for_validation_missing',
            message: gatingRules.buildAvailableForValidation.description
        });
    }

    if (targetStage === STAGE_IDS.S4 && gateChecks.developmentPlanReady && !gateChecks.developmentPlanReady.pass) {
        const hasPlan = gateChecks.developmentPlanReady.evidence.deliveryPlanExists;
        const structureValid = gateChecks.developmentPlanReady.evidence.structureValid;
        reasons.push({
            code: !hasPlan
                ? 'development_plan_missing'
                : !structureValid
                  ? 'development_plan_invalid'
                  : 'development_plan_status_inconsistent',
            message: gatingRules.developmentPlanReady.description
        });
    }

    if (targetStage === STAGE_IDS.S6 && gateChecks.testCasesReady && !gateChecks.testCasesReady.pass) {
        reasons.push({
            code: 'test_cases_missing',
            message: gatingRules.testCasesReady.description
        });
    }

    if (targetStage === STAGE_IDS.S7 && gateChecks.securityScanReady && !gateChecks.securityScanReady.pass) {
        reasons.push({
            code: 'security_scan_inputs_missing',
            message: gatingRules.securityScanReady.description
        });
    }

    const stageChangeRequested =
        (currentStage && targetStage && currentStage !== targetStage) ||
        (currentStage && recommendedStage && currentStage !== recommendedStage);

    if (stageChangeRequested && gateChecks.stageWritebackBeforeRouting && !gateChecks.stageWritebackBeforeRouting.pass) {
        reasons.push({
            code: 'stage_transition_writeback_missing',
            message: gatingRules.stageWritebackBeforeRouting.description
        });
    }

    return reasons;
}

function resolveRouteTarget(targetStage, gateChecks) {
    if (targetStage === STAGE_IDS.S0_5 && gateChecks.projectBaselineAuditReady?.pass) {
        if (
            gateChecks.projectBaselineAuditReady.evidence.status === 'ready' &&
            gateChecks.projectBaselineAuditReady.evidence.recommendedNextSkill === null
        ) {
            return {
                skill: 'ai-project-manager',
                source: 'baseline-complete',
                auditPath: gateChecks.projectBaselineAuditReady.evidence.auditPath,
                exclusiveDeliverable: false
            };
        }

        if (gateChecks.projectBaselineAuditReady.evidence.recommendedNextSkill === 'ai-project-manager') {
            return {
                skill: 'ai-project-manager',
                source: 'baseline-audit',
                auditPath: gateChecks.projectBaselineAuditReady.evidence.auditPath,
                exclusiveDeliverable: false
            };
        }

        if (gateChecks.projectBaselineAuditReady.evidence.recommendedArtifactSatisfied) {
            return {
                skill: 'project-baseline-auditor',
                source: 'baseline-refresh',
                auditPath: gateChecks.projectBaselineAuditReady.evidence.auditPath,
                exclusiveDeliverable: true
            };
        }

        return {
            skill: gateChecks.projectBaselineAuditReady.evidence.recommendedNextSkill,
            source: 'baseline-audit',
            auditPath: gateChecks.projectBaselineAuditReady.evidence.auditPath,
            exclusiveDeliverable: true
        };
    }

    const baseTarget = routeTargets[targetStage];
    if (!baseTarget) {
        return null;
    }

    if (targetStage !== STAGE_IDS.S2) {
        return baseTarget;
    }

    if (gateChecks.pageStageClosedForPrd?.pass) {
        return {
            ...baseTarget,
            skill: 'prd-chief',
            followUpSkills: ['foundation-builder', 'prd-writer']
        };
    }

    return {
        ...baseTarget,
        skill: 'page-chief',
        followUpSkills: ['page-designer', 'page-explainer', 'prd-chief']
    };
}

function findDevelopmentPlanBlocker(blockers) {
    return blockers.find((item) =>
        ['development_plan_missing', 'development_plan_invalid', 'development_plan_status_inconsistent'].includes(item.code)
    ) || null;
}

function resolveRecoveryRouteTarget({ targetStage, blockers, gateChecks }) {
    if (targetStage !== STAGE_IDS.S4) {
        return null;
    }

    const developmentPlanBlocker = findDevelopmentPlanBlocker(blockers);
    if (!developmentPlanBlocker) {
        return null;
    }

    return {
        skill: 'delivery-planner',
        source: 'development-plan-gate',
        recoveryFor: developmentPlanBlocker.code,
        exclusiveDeliverable: true,
        evidence: {
            deliveryPlanPath: gateChecks.developmentPlanReady?.evidence.deliveryPlanPath || null,
            structureValid: Boolean(gateChecks.developmentPlanReady?.evidence.structureValid),
            structureErrors: gateChecks.developmentPlanReady?.evidence.structureErrors || [],
            planConsistency: gateChecks.developmentPlanReady?.evidence.planConsistency || null
        }
    };
}

function makeProjectLinkIndexerAction(trigger, reason) {
    return {
        skill: 'project-link-indexer',
        trigger,
        reason
    };
}

function projectLinkIndexerRegistered() {
    return globalCompanionAbilities.some((ability) => ability.skill === 'project-link-indexer');
}

function resolveProjectLinkIndexerActions({ targetStage, gateChecks }) {
    if (!projectLinkIndexerRegistered()) {
        return [];
    }

    if (gateChecks.projectBaselineAuditReady?.pass) {
        return [
            makeProjectLinkIndexerAction(
                'after_existing_project_baseline_audit',
                'S0.5 baseline audit 完成后，主入口必须调起 project-link-indexer 建立或刷新文件级索引'
            )
        ];
    }

    if (targetStage === STAGE_IDS.S2 && gateChecks.brdReadyForPage?.evidence?.brdExists) {
        return [
            makeProjectLinkIndexerAction(
                'artifact_files_added_or_split',
                'S1 BRD 完成后，主入口必须调起 project-link-indexer 建立或刷新文件级索引'
            )
        ];
    }

    if (
        [STAGE_IDS.S3, STAGE_IDS.S5].includes(targetStage) &&
        (gateChecks.pageStageClosedForPrd?.pass ||
            gateChecks.foundationReadyForDevelopmentPlan?.pass ||
            gateChecks.fullPrdReady?.pass)
    ) {
        return [
            makeProjectLinkIndexerAction(
                'artifact_files_added_or_split',
                'S2 页面、foundation 或 PRD 产物形成后，主入口必须调起 project-link-indexer 建立或刷新文件级索引'
            )
        ];
    }

    if (targetStage === STAGE_IDS.S4 && gateChecks.developmentPlanReady?.pass) {
        return [
            makeProjectLinkIndexerAction(
                'artifact_files_added_or_split',
                'S3 开发计划文件组形成或修复后，主入口必须调起 project-link-indexer 建立或刷新文件级索引'
            )
        ];
    }

    if (targetStage === STAGE_IDS.S6 && gateChecks.testCasesReady?.pass) {
        return [
            makeProjectLinkIndexerAction(
                'artifact_files_added_or_split',
                'S5 验收文档或测试用例形成后，主入口必须调起 project-link-indexer 建立或刷新文件级索引'
            )
        ];
    }

    return [];
}

const DESIGN_CONSULTANT_ACTIONS = {
    before_brd_design_decision: {
        capability: 'design-decision',
        consumer: 'brd-writer',
        mode: 'read-only',
        references: [
            'references/design-routing.md',
            'references/brand-necessity-rubric.md',
            'references/html-preview-playbook.md'
        ],
        operation: null
    },
    audit_existing_visual_system: {
        capability: 'existing-system-audit',
        consumer: 'project-baseline-auditor',
        mode: 'read-only',
        references: ['references/existing-system-adoption.md'],
        operation: null
    },
    plan_design_constraints: {
        capability: 'planning-constraints',
        consumer: 'delivery-planner',
        mode: 'read-only',
        references: [
            'references/agent-operating-contract.md',
            'references/design-system-enforcement.md'
        ],
        operation: null
    },
    guard_ui_implementation: {
        capability: 'implementation-enforcement',
        consumer: 'coding-standards',
        mode: 'check-only',
        references: ['references/design-system-enforcement.md'],
        operation: null
    },
    derive_ui_acceptance: {
        capability: 'ui-acceptance-input',
        consumer: 'test-case-chief',
        mode: 'read-only',
        references: ['references/design-system-enforcement.md'],
        operation: null
    },
    collect_ui_acceptance_evidence: {
        capability: 'ui-acceptance-evidence',
        consumer: 'test-case-runner',
        mode: 'evidence-only',
        references: ['references/design-system-enforcement.md'],
        operation: null
    }
};

function designConsultantRegistered() {
    return globalCompanionAbilities.some((ability) => ability.skill === 'design-consultant');
}

function makeDesignConsultantAction(trigger) {
    const definition = DESIGN_CONSULTANT_ACTIONS[trigger];
    if (!definition) {
        throw new Error(`Unknown design-consultant companion trigger: ${trigger}`);
    }

    return {
        skill: 'design-consultant',
        trigger,
        capability: definition.capability,
        consumer: definition.consumer,
        required: true,
        mode: definition.mode,
        references: [...definition.references],
        operation: definition.operation,
        reason: `ai-project-manager invokes design-consultant ${trigger} and passes the result to ${definition.consumer}`
    };
}

function resolveDesignConsultantActions({ targetStage, gateChecks, profileContext, planContext, hostRoot }) {
    if (!designConsultantRegistered()) {
        return [];
    }

    if (
        [STAGE_IDS.S0, STAGE_IDS.S1].includes(targetStage) &&
        gateChecks.startupMinimum?.pass &&
        hasPageTaskSignal(profileContext, planContext)
    ) {
        return [makeDesignConsultantAction('before_brd_design_decision')];
    }

    if (
        targetStage === STAGE_IDS.S0_5 &&
        (hasExistingFrontendCodeSignal(hostRoot) || hasCanonicalDesignSystem(hostRoot))
    ) {
        return [makeDesignConsultantAction('audit_existing_visual_system')];
    }

    if (targetStage === STAGE_IDS.S3 && hasCanonicalDesignSystem(hostRoot)) {
        return [makeDesignConsultantAction('plan_design_constraints')];
    }

    if (
        targetStage === STAGE_IDS.S4 &&
        hasCanonicalDesignSystem(hostRoot) &&
        hasCurrentUiWorkSignal(planContext)
    ) {
        return [makeDesignConsultantAction('guard_ui_implementation')];
    }

    const commitmentsPath = path.join(hostRoot, 'design-system', 'checks', 'product-commitments.json');
    if (targetStage === STAGE_IDS.S5 && fs.existsSync(commitmentsPath)) {
        return [makeDesignConsultantAction('derive_ui_acceptance')];
    }

    const acceptanceConfigPath = path.join(hostRoot, 'design-system', 'checks', 'product-acceptance.config.mjs');
    if (
        targetStage === STAGE_IDS.S6 &&
        fs.existsSync(commitmentsPath) &&
        fs.existsSync(acceptanceConfigPath)
    ) {
        return [makeDesignConsultantAction('collect_ui_acceptance_evidence')];
    }

    return [];
}

function resolveCompanionActions({ targetStage, gateChecks, validationResult, profileContext, planContext, hostRoot }) {
    if (!validationResult.authority[FILE_ROLE_IDS.PROFILE] && targetStage !== STAGE_IDS.S0_5) {
        return [];
    }

    return [
        ...resolveProjectLinkIndexerActions({ targetStage, gateChecks }),
        ...resolveDesignConsultantActions({ targetStage, gateChecks, profileContext, planContext, hostRoot })
    ];
}

function resolveNextActionWithContext({ validationResult, targetStage, resolvedRouteTarget, blockers, gateChecks }) {
    if (targetStage === STAGE_IDS.S0_5 && resolvedRouteTarget?.source === 'baseline-refresh') {
        return `读取 ${resolvedRouteTarget.auditPath} 后发现推荐缺口已被补齐；先刷新 baseline，再按最新维护资料缺口继续路由`;
    }

    if (targetStage === STAGE_IDS.S0_5 && resolvedRouteTarget?.source === 'baseline-complete') {
        return 'S0.5 维护知识底座已补齐；交由 ai-project-manager 收口历史项目标准化，并重新判断后续阶段';
    }

    if (targetStage === STAGE_IDS.S0_5 && resolvedRouteTarget?.skill === 'project-baseline-auditor') {
        return '可进入 S0.5，默认交由 project-baseline-auditor，先扫描代码并生成/更新 project-profile.md 与 baseline-audit 清单';
    }

    if (!validationResult.authority[FILE_ROLE_IDS.PROFILE]) {
        return '停留主入口，发起首轮极简访谈并补齐项目画像';
    }

    const startupBlocker = blockers.find((item) => item.code === 'startup_minimum_missing');
    if (startupBlocker) {
        return '停留主入口，补齐启动最小必需字段包';
    }

    const pageBlocker = blockers.find((item) => item.code === 'page_task_required_missing');
    if (pageBlocker) {
        return '停留主入口，补齐页面任务必补字段包并回写页面设计标签';
    }

    const brdBlocker = blockers.find((item) => item.code === 'brd_missing');
    if (brdBlocker) {
        return '停留主入口或回到 S1，先补齐 BRD 权威文档，再进入页面阶段';
    }

    const foundationBlocker = blockers.find((item) => item.code === 'foundation_missing');
    if (foundationBlocker) {
        return '停留 S2，先完成 foundation-builder 产物并确认交付清单中的文件真实存在';
    }

    const fullPrdBlocker = blockers.find((item) => item.code === 'full_prd_missing');
    if (fullPrdBlocker) {
        return '停留 S2，先补齐 mainprd 与全部 subprd，并确认功能列表和 mainprd 状态后再进入 S3/S5';
    }

    const baselineBlocker = blockers.find((item) => item.code === 'baseline_audit_missing');
    if (baselineBlocker) {
        return '先调用 project-baseline-auditor 生成 docs/baseline/baseline-audit-<slug>.json，再按关键文件缺口路由';
    }

    const writebackBlocker = blockers.find((item) => item.code === 'stage_transition_writeback_missing');
    if (writebackBlocker) {
        return '先调用 project-devlog 完成阶段切换日志回写，再进入下一阶段能力';
    }

    const developmentPlanBlocker = findDevelopmentPlanBlocker(blockers);
    if (developmentPlanBlocker) {
        if (developmentPlanBlocker.code === 'development_plan_missing') {
            return '停留开发计划修复链路，先调用 delivery-planner 生成 docs/plans/delivery-plans/ 下的 main-delivery-plan-<slug>.md、task-kanban-<slug>.md 和 sub-delivery-plan-<slug>-<TaskID>-<short-name>.md，再重新运行 S4 门禁';
        }

        if (developmentPlanBlocker.code === 'development_plan_status_inconsistent') {
            return '当前为 S4，但正式开发计划文件组状态不一致；先调用 delivery-planner 校正 main plan / kanban / sub plan，再重新进入 coding-standards';
        }

        return '停留开发计划修复链路，先调用 delivery-planner 修复 docs/plans/delivery-plans/ 下的正式开发计划文件组，使 main-delivery-plan-<slug>.md、task-kanban-<slug>.md 和子开发计划通过结构校验，再重新运行 S4 门禁';
    }

    if (targetStage === STAGE_IDS.S2) {
        if (resolvedRouteTarget?.skill === 'page-chief') {
            return '可进入 S2，默认先交由 page-chief，先完成页面代码 / 页面交付清单 / explainer 收口';
        }

        if (resolvedRouteTarget?.skill === 'prd-chief') {
            if (!gateChecks.foundationReadyForPrd?.pass) {
                return '可进入 S2，页面环节已收口，下一步进入 prd-chief，并先调度 foundation-builder';
            }
            return '可进入 S2，页面环节已收口，下一步进入 prd-chief，并继续推进 prd-writer';
        }
    }

    if (targetStage === STAGE_IDS.S0_5 && resolvedRouteTarget?.source === 'baseline-audit') {
        return `读取 ${resolvedRouteTarget.auditPath}，按 maintenance-docs-only 缺口交由 ${resolvedRouteTarget.skill}`;
    }

    if (targetStage === STAGE_IDS.S7 && resolvedRouteTarget?.skill === 'security-scan') {
        return '可进入 S7，默认交由 security-scan，输出固定结构的安全扫描报告和 PASS / BLOCK / WAIVER 结论';
    }

    if (targetStage && resolvedRouteTarget) {
        const routeTarget = resolvedRouteTarget;
        if (Array.isArray(routeTarget.followUpSkills) && routeTarget.followUpSkills.length > 0) {
            return `可进入 ${targetStage}，默认先交由 ${routeTarget.skill}，后续按链路进入 ${routeTarget.followUpSkills.join(' -> ')}`;
        }

        return `可进入 ${targetStage}，默认交由 ${routeTarget.skill}`;
    }

    return '停留主入口继续澄清上下文';
}

function routeCheck({ hostRoot, targetStage = '' }) {
    const validationResult = validateGlobalFiles({ hostRoot });
    const resolvedHostRoot = validationResult.hostRoot;

    const profileContent = loadMarkdownFile(
        resolveAbsolutePath(resolvedHostRoot, validationResult.authority[FILE_ROLE_IDS.PROFILE])
    );
    const planContent = loadMarkdownFile(
        resolveAbsolutePath(resolvedHostRoot, validationResult.authority[FILE_ROLE_IDS.PLAN])
    );

    const profileContext = extractProfileContext(profileContent);
    const planContext = extractPlanContext(planContent);

    const currentStage = profileContext.fields.current_stage || planContext.currentStage || null;
    const recommendedStage = inferRecommendedStage(profileContext, planContext, resolvedHostRoot);
    const resolvedTargetStage = targetStage || recommendedStage || currentStage || STAGE_IDS.S0;
    const gateChecks = buildGateChecks({
        targetStage: resolvedTargetStage,
        profileContext,
        planContext,
        validationResult,
        hostRoot: resolvedHostRoot
    });

    const blockingReasons = buildBlockingReasons({
        targetStage: resolvedTargetStage,
        currentStage,
        recommendedStage,
        gateChecks
    });
    const stageRouteTarget = resolveRouteTarget(resolvedTargetStage, gateChecks);
    const recoveryRouteTarget = resolveRecoveryRouteTarget({
        targetStage: resolvedTargetStage,
        blockers: blockingReasons,
        gateChecks
    });
    const resolvedRouteTarget = recoveryRouteTarget || stageRouteTarget;
    const isBaselineEntry = resolvedTargetStage === STAGE_IDS.S0_5;
    const hasStartupBootstrapBlocker =
        !isBaselineEntry &&
        (!validationResult.authority[FILE_ROLE_IDS.PROFILE] ||
            blockingReasons.some((item) => item.code === 'startup_minimum_missing'));
    const visibleRouteTarget = hasStartupBootstrapBlocker ? null : resolvedRouteTarget;
    const companionActions = resolveCompanionActions({
        targetStage: resolvedTargetStage,
        gateChecks,
        validationResult,
        profileContext,
        planContext,
        hostRoot: resolvedHostRoot
    });

    const result = {
        hostRoot: resolvedHostRoot,
        currentStage,
        recommendedStage,
        targetStage: resolvedTargetStage,
        routeTarget: visibleRouteTarget,
        canEnter: blockingReasons.length === 0,
        companionActions,
        gateChecks,
        blockingReasons,
        context: {
            profileSummary: {
                projectName: isMissingValue(profileContext.fields.project_name)
                    ? null
                    : profileContext.fields.project_name,
                projectOneLiner: isMissingValue(profileContext.fields.project_one_liner)
                    ? null
                    : profileContext.fields.project_one_liner
            },
            currentRoundDeliverable: profileContext.fields.current_round_deliverable || null,
            currentExecutor: profileContext.fields.current_executor || null,
            planCurrentGoalCount: planContext.currentGoal.length,
            inProgressTaskCount: planContext.inProgressTasks.length,
            nextTaskCount: planContext.nextTasks.length,
            pendingItems: {
                profile: profileContext.pendingItems,
                plan: planContext.pendingItems
            },
            baselineAudit: gateChecks.projectBaselineAuditReady
                ? {
                      auditPath: gateChecks.projectBaselineAuditReady.evidence.auditPath,
                      scope: gateChecks.projectBaselineAuditReady.evidence.scope,
                      status: gateChecks.projectBaselineAuditReady.evidence.status,
                      recommendedNextSkill: gateChecks.projectBaselineAuditReady.evidence.recommendedNextSkill,
                      recommendedArtifactSatisfied:
                          gateChecks.projectBaselineAuditReady.evidence.recommendedArtifactSatisfied,
                      usable: gateChecks.projectBaselineAuditReady.pass
                  }
                : null
        },
        nextAction: resolveNextActionWithContext({
            validationResult,
            targetStage: resolvedTargetStage,
            resolvedRouteTarget: visibleRouteTarget,
            blockers: blockingReasons,
            gateChecks
        }),
        validation: validationResult.summary
    };

    return result;
}

function formatTextReport(result) {
    const lines = [
        `Host root: ${result.hostRoot}`,
        `Current stage: ${result.currentStage || 'UNKNOWN'}`,
        `Recommended stage: ${result.recommendedStage || 'UNKNOWN'}`,
        `Target stage: ${result.targetStage || 'UNKNOWN'}`,
        `Can enter: ${result.canEnter ? 'yes' : 'no'}`
    ];

    if (result.routeTarget?.skill) {
        lines.push(`Route target: ${result.routeTarget.skill}`);
    }

    lines.push('', 'Companion actions:');
    if (result.companionActions.length === 0) {
        lines.push('- none');
    } else {
        for (const action of result.companionActions) {
            lines.push(`- ${action.skill}: ${action.trigger} (${action.reason})`);
        }
    }

    lines.push('', 'Gate checks:');
    for (const [key, check] of Object.entries(result.gateChecks)) {
        lines.push(`- ${key}: ${check.pass ? 'pass' : 'fail'}`);
    }

    const hasFailedGate = Object.values(result.gateChecks).some((check) => !check.pass);
    if (result.canEnter && hasFailedGate) {
        lines.push(
            'Note: gates marked "fail" above do not block the current target stage; entry is decided by "Blocking reasons" below (empty means allowed).'
        );
    }

    lines.push('', 'Blocking reasons:');
    if (result.blockingReasons.length === 0) {
        lines.push('- none');
    } else {
        for (const blocker of result.blockingReasons) {
            lines.push(`- ${blocker.code}: ${blocker.message}`);
        }
    }

    lines.push('', `Next action: ${result.nextAction}`);
    return lines.join('\n');
}

function main() {
    const options = parseArgs(process.argv);
    const result = routeCheck(options);

    if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        if (!result.canEnter) {
            process.exitCode = 1;
        }
        return;
    }

    console.log(formatTextReport(result));

    if (!result.canEnter) {
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

export { routeCheck, formatTextReport };
