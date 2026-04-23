#!/usr/bin/env node

/**
 * Traceability:
 * Rule sources:
 * - skills/ai-project-manager/references/core/runtime.md
 * - skills/ai-project-manager/references/core/routing.md
 * Structured config:
 * - lib/ai-pm-protocol/stages.js
 * - lib/ai-pm-protocol/routing.js
 * - lib/ai-pm-protocol/field-contracts.js
 *
 * Change impact:
 * - If stage judgment, S2 gating, or startup/page field packages change, also check:
 *   - skills/ai-project-manager/references/core/runtime.md
 *   - skills/ai-project-manager/references/core/routing.md
 *   - skills/ai-project-manager/assets/global-files/project-profile.md
 */
import fs from 'fs';
import path from 'path';
import process from 'process';
import {
    FILE_ROLE_IDS,
    STAGE_IDS,
    fieldPackages,
    routeTargets,
    gatingRules,
    markdownStructure,
    validationPolicy
} from '../lib/ai-pm-protocol/index.js';
import { validateGlobalFiles } from './validate-global-files.mjs';

const STAGE_ORDER = [
    STAGE_IDS.S0,
    STAGE_IDS.S1,
    STAGE_IDS.S2,
    STAGE_IDS.S3,
    STAGE_IDS.S4,
    STAGE_IDS.S5,
    STAGE_IDS.S6,
    STAGE_IDS.S7
];

function printUsage() {
    console.log(
        'Usage: node project-manager-suite/tools/route-check.mjs <host-project-root> [--target-stage S1|S2|S3|S4|S5|S6|S7] [--json]'
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
        /^S0\s*\/\s*S1\s*\/\s*S2\s*\/\s*S3\s*\/\s*S4\s*\/\s*S5\s*\/\s*S6\s*\/\s*S7$/.test(text) ||
        /^C端\s*\/\s*B端\s*\/\s*后台\s*\/\s*待确认$/.test(text) ||
        /^仅用户侧\s*\/\s*仅内部侧\s*\/\s*两边都有\s*\/\s*待确认$/.test(text)
    );
}

function extractStageId(text) {
    if (!text) return null;
    if (isPlaceholderText(text)) return null;
    const match = String(text).match(/\b(S[0-7])\b/);
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
    return validationPolicy.scan.ignoredDirectories.some((ignored) => {
        return relativeDir === ignored || relativeDir.startsWith(`${ignored}/`);
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

const DESIGN_ARTIFACT_DIRS = {
    brd: ['docs/brd'],
    page: ['src/frontend/page-preview', 'page-preview', '可操作页面'],
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

        const headerCells = headerLine
            .split('|')
            .slice(1, -1)
            .map((cell) => cell.trim());
        const separatorCells = separatorLine
            .split('|')
            .slice(1, -1)
            .map((cell) => cell.trim());

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

            const rowCells = rowLine
                .split('|')
                .slice(1, -1)
                .map((cell) => cell.trim());

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
            if (!rawValue || isLikelyPlaceholderPath(rawValue)) {
                continue;
            }
            values.push(normalizeArtifactPath(rawValue));
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

function extractHasCEndFromBrd(content) {
    if (!content) return null;

    const match = content.match(/是否包含\s*C\s*端页面[^：:\n]*[：:]\s*`?(是|否)`?/);
    if (!match) {
        return null;
    }

    return match[1] === '是';
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
    const pattern = /-\s+\*\*分类\*\*:\s*`([^`]+)`/g;
    let match = pattern.exec(content);
    while (match) {
        const category = match[1].trim();
        if (category === 'design_gap' || category === 'logic_conflict') {
            categories.push(category);
        }
        match = pattern.exec(content);
    }

    return categories;
}

function inspectS2Artifacts(hostRoot) {
    const markdownFiles = walkFiles(hostRoot, validationPolicy.scan.maxDepth, ['.md']);
    const brd = findLatestMatchingFile(hostRoot, markdownFiles, /^BRD-.+\.md$/, DESIGN_ARTIFACT_DIRS.brd);
    const pageDelivery = findLatestMatchingFile(hostRoot, markdownFiles, /^page-delivery-.+\.md$/, DESIGN_ARTIFACT_DIRS.page);
    const explainerFlow = findLatestMatchingFile(hostRoot, markdownFiles, /^explainer-flow-.+\.md$/, DESIGN_ARTIFACT_DIRS.page);
    const explainerBInteraction = findLatestMatchingFile(
        hostRoot,
        markdownFiles,
        /^explainer-b-interaction-.+\.md$/,
        DESIGN_ARTIFACT_DIRS.page
    );
    const explainerCInteraction = findLatestMatchingFile(
        hostRoot,
        markdownFiles,
        /^explainer-c-interaction-.+\.md$/,
        DESIGN_ARTIFACT_DIRS.page
    );
    const explainerBPermission = findLatestMatchingFile(
        hostRoot,
        markdownFiles,
        /^explainer-b-permission-.+\.md$/,
        DESIGN_ARTIFACT_DIRS.page
    );
    const explainerDelivery = findLatestMatchingFile(
        hostRoot,
        markdownFiles,
        /^explainer-delivery-.+\.md$/,
        DESIGN_ARTIFACT_DIRS.page
    );
    const gapFiles = findMatchingFiles(hostRoot, markdownFiles, /^explainer-(c|b)-gap-.+\.md$/, DESIGN_ARTIFACT_DIRS.page);

    const brdContent = brd ? loadMarkdownFile(brd.filePath) : null;
    const pageDeliveryContent = pageDelivery ? loadMarkdownFile(pageDelivery.filePath) : null;
    const hasCEnd = extractHasCEndFromBrd(brdContent);

    const pageCodeCheck = pageDeliveryContent
        ? listResolvedFiles(hostRoot, extractFilePathColumnValues(pageDeliveryContent))
        : { files: [], allExist: false };

    const bInteractionStatuses = explainerBInteraction ? extractInteractionStatuses(loadMarkdownFile(explainerBInteraction.filePath)) : [];
    const cInteractionStatuses = explainerCInteraction ? extractInteractionStatuses(loadMarkdownFile(explainerCInteraction.filePath)) : [];
    const unresolvedGapCategories = gapFiles.flatMap((file) => extractUnresolvedGapCategories(loadMarkdownFile(file.filePath)));

    const requiresCInteraction = hasCEnd === true || (hasCEnd == null && Boolean(explainerCInteraction));
    const bInteractionLocked = bInteractionStatuses.length > 0 && bInteractionStatuses.every((status) => status === 'locked');
    const cInteractionLocked = !requiresCInteraction || (cInteractionStatuses.length > 0 && cInteractionStatuses.every((status) => status === 'locked'));

    const explainerFilesComplete =
        Boolean(explainerFlow) &&
        Boolean(explainerBInteraction) &&
        Boolean(explainerBPermission) &&
        Boolean(explainerDelivery) &&
        (!requiresCInteraction || Boolean(explainerCInteraction));

    return {
        brdExists: Boolean(brd),
        brdPath: brd?.relativePath || null,
        pageDeliveryExists: Boolean(pageDelivery),
        pageDeliveryPath: pageDelivery?.relativePath || null,
        pageCodeFiles: pageCodeCheck.files,
        pageCodeFilesAllExist: pageCodeCheck.allExist,
        hasCEnd,
        requiresCInteraction,
        explainerFilesComplete,
        explainerDeliveryPath: explainerDelivery?.relativePath || null,
        bInteractionLocked,
        cInteractionLocked,
        interactionStatusesLocked: bInteractionLocked && cInteractionLocked,
        unresolvedGapCategories,
        pageStageClosed:
            Boolean(brd) &&
            Boolean(pageDelivery) &&
            pageCodeCheck.allExist &&
            explainerFilesComplete &&
            bInteractionLocked &&
            cInteractionLocked &&
            unresolvedGapCategories.length === 0
    };
}

function inspectFoundationArtifacts(hostRoot) {
    const markdownFiles = walkFiles(hostRoot, validationPolicy.scan.maxDepth, ['.md']);
    const foundationDelivery = findLatestMatchingFile(
        hostRoot,
        markdownFiles,
        /^foundation-delivery-.+\.md$/,
        DESIGN_ARTIFACT_DIRS.prd
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
    const mainPrd = findLatestMatchingFile(hostRoot, markdownFiles, /^prd-main-.+\.md$/, DESIGN_ARTIFACT_DIRS.prd);
    const subPrds = findMatchingFiles(hostRoot, markdownFiles, /^prd-(?!feature-list-|main-).+\.md$/, DESIGN_ARTIFACT_DIRS.prd);

    return {
        featureListExists: Boolean(featureList),
        mainPrdExists: Boolean(mainPrd),
        subPrdCount: subPrds.length,
        fullPrdReady: Boolean(featureList) && Boolean(mainPrd) && subPrds.length > 0
    };
}

function inspectTestExecutionArtifacts(hostRoot) {
    const markdownFiles = walkFiles(hostRoot, validationPolicy.scan.maxDepth, ['.md']);
    const relativeFiles = markdownFiles.map((filePath) => ({
        filePath,
        relativePath: normalizePathForMatch(hostRoot, filePath)
    }));

    const indexReports = relativeFiles.filter((item) => /^docs\/test-case\/reports\/[^/]+\/index\.md$/.test(item.relativePath));
    const blockReports = relativeFiles.filter((item) => /^docs\/test-case\/reports\/[^/]+\/测试验收-.+\.md$/.test(item.relativePath));
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
    const pageFields = [
        profileContext.fields.coverage_scope,
        profileContext.fields.page_primary_user,
        profileContext.fields.page_primary_purpose,
        profileContext.fields.page_design_tag
    ];

    const textPool = [
        deliverable,
        ...planContext.currentGoal,
        ...planContext.nextTasks,
        ...planContext.inProgressTasks
    ].join(' ');

    if (pageFields.some((value) => !isMissingValue(value))) {
        return true;
    }

    return /页面|原型|前端|界面|UI|UX|后台配置页|C端|H5|小程序/.test(textPool);
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

    return /上线|发版|生产发布|发布生产|go-live|go live|release|安全放行|最终安全检查|security gate|security scan/i.test(
        textPool
    );
}

function isPageDesignTagResolved(value) {
    if (isMissingValue(value)) return false;
    return /(C端|B端|后台)/.test(value);
}

function hasStartupMinimum(profileContext) {
    const values = fieldValueMap(profileContext);
    return collectMissingFields(fieldPackages.startupMinimum, values).length === 0;
}

function inferRecommendedStage(profileContext, planContext) {
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
        page_design_tag: profileContext.fields.page_design_tag,
        current_stage: profileContext.fields.current_stage,
        recommended_stage: profileContext.fields.recommended_stage,
        current_round_deliverable: profileContext.fields.current_round_deliverable,
        current_executor: profileContext.fields.current_executor,
        largest_uncertainty: profileContext.fields.largest_uncertainty
    };
}

function collectMissingFields(fieldKeys, values, extraChecks = {}) {
    return fieldKeys.filter((fieldKey) => {
        if (fieldKey === 'page_design_tag') {
            return !isPageDesignTagResolved(values[fieldKey]);
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
    const testExecutionArtifacts = inspectTestExecutionArtifacts(hostRoot);

    checks.startupMinimum = {
        pass: collectMissingFields(fieldPackages.startupMinimum, values).length === 0,
        missingFields: collectMissingFields(fieldPackages.startupMinimum, values)
    };

    if (targetStage === STAGE_IDS.S2) {
        checks.pageTaskRequired = {
            pass: collectMissingFields(fieldPackages.pageTaskRequired, values).length === 0,
            missingFields: collectMissingFields(fieldPackages.pageTaskRequired, values)
        };

        checks.pageStageClosedForPrd = {
            pass: s2Artifacts.pageStageClosed,
            evidence: {
                brdExists: s2Artifacts.brdExists,
                brdPath: s2Artifacts.brdPath,
                pageDeliveryExists: s2Artifacts.pageDeliveryExists,
                pageDeliveryPath: s2Artifacts.pageDeliveryPath,
                pageCodeFilesAllExist: s2Artifacts.pageCodeFilesAllExist,
                explainerFilesComplete: s2Artifacts.explainerFilesComplete,
                explainerDeliveryPath: s2Artifacts.explainerDeliveryPath,
                interactionStatusesLocked: s2Artifacts.interactionStatusesLocked,
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

    if (targetStage === STAGE_IDS.S3) {
        checks.fullPrdReady = {
            pass: prdArtifacts.fullPrdReady,
            evidence: {
                featureListExists: prdArtifacts.featureListExists,
                mainPrdExists: prdArtifacts.mainPrdExists,
                subPrdCount: prdArtifacts.subPrdCount
            }
        };
    }

    if (targetStage === STAGE_IDS.S4) {
        checks.developmentPlanReady = {
            pass: planContext.currentStage === STAGE_IDS.S3 || planContext.inProgressTasks.length > 0,
            evidence: {
                planStage: planContext.currentStage,
                inProgressTasks: planContext.inProgressTasks.length
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

    return checks;
}

function buildBlockingReasons({ targetStage, currentStage, recommendedStage, gateChecks }) {
    const reasons = [];

    if (!gateChecks.startupMinimum.pass) {
        reasons.push({
            code: 'startup_minimum_missing',
            message: gatingRules.startupMinimum.description,
            missingFields: gateChecks.startupMinimum.missingFields
        });
    }

    if (targetStage === STAGE_IDS.S2 && gateChecks.pageTaskRequired && !gateChecks.pageTaskRequired.pass) {
        reasons.push({
            code: 'page_task_required_missing',
            message: gatingRules.pageTaskRequired.description,
            missingFields: gateChecks.pageTaskRequired.missingFields
        });
    }

    if (targetStage === STAGE_IDS.S3 && gateChecks.fullPrdReady && !gateChecks.fullPrdReady.pass) {
        reasons.push({
            code: 'full_prd_missing',
            message: gatingRules.fullPrdReady.description
        });
    }

    if (targetStage === STAGE_IDS.S4 && gateChecks.developmentPlanReady && !gateChecks.developmentPlanReady.pass) {
        reasons.push({
            code: 'development_plan_missing',
            message: gatingRules.developmentPlanReady.description
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

function resolveNextActionWithContext({ validationResult, targetStage, resolvedRouteTarget, blockers, gateChecks }) {
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

    const writebackBlocker = blockers.find((item) => item.code === 'stage_transition_writeback_missing');
    if (writebackBlocker) {
        return '先调用 project-devlog 完成阶段切换日志回写，再进入下一阶段能力';
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
    const recommendedStage = inferRecommendedStage(profileContext, planContext);
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
    const resolvedRouteTarget = resolveRouteTarget(resolvedTargetStage, gateChecks);
    const hasStartupBootstrapBlocker =
        !validationResult.authority[FILE_ROLE_IDS.PROFILE] ||
        blockingReasons.some((item) => item.code === 'startup_minimum_missing');
    const visibleRouteTarget = hasStartupBootstrapBlocker ? null : resolvedRouteTarget;

    const result = {
        hostRoot: resolvedHostRoot,
        currentStage,
        recommendedStage,
        targetStage: resolvedTargetStage,
        routeTarget: visibleRouteTarget,
        canEnter: blockingReasons.length === 0,
        gateChecks,
        blockingReasons,
        context: {
            currentRoundDeliverable: profileContext.fields.current_round_deliverable || null,
            currentExecutor: profileContext.fields.current_executor || null,
            planCurrentGoalCount: planContext.currentGoal.length,
            inProgressTaskCount: planContext.inProgressTasks.length,
            nextTaskCount: planContext.nextTasks.length,
            pendingItems: {
                profile: profileContext.pendingItems,
                plan: planContext.pendingItems
            }
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

    lines.push('', 'Gate checks:');
    for (const [key, check] of Object.entries(result.gateChecks)) {
        lines.push(`- ${key}: ${check.pass ? 'pass' : 'fail'}`);
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
        return;
    }

    console.log(formatTextReport(result));

    if (!result.canEnter) {
        process.exitCode = 1;
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
    try {
        main();
    } catch (error) {
        printUsage();
        console.error(error.message);
        process.exit(1);
    }
}

export { routeCheck, formatTextReport };
