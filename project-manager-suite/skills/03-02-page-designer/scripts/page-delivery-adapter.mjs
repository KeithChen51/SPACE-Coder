#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
    loadPageDeliveryManifest,
    validatePageDeliveryManifest
} from '../../design-consultant/scripts/page-delivery-contract.mjs';
import {
    deriveSlugFromBrd,
    findBrd,
    findLedger,
    getDeliveryFilePath,
    readLedger,
    resolveHostDir
} from './page-ledger-io.mjs';

const ADAPTER_VERSION = '0.11.0';
const MANIFEST_SCHEMA_VERSION = '1.0.0';
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f\u2028\u2029]/g;

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function normalizeForDisplay(value) {
    return String(value).replaceAll('\\', '/');
}

function normalizeSingleLine(value) {
    return String(value ?? '')
        .replace(CONTROL_CHARACTER_PATTERN, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function escapeMarkdownInline(value) {
    return normalizeSingleLine(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('`', '\\`');
}

function escapeMarkdownCell(value) {
    return escapeMarkdownInline(value).replaceAll('|', '\\|');
}

function containsControlCharacters(value) {
    const result = CONTROL_CHARACTER_PATTERN.test(String(value ?? ''));
    CONTROL_CHARACTER_PATTERN.lastIndex = 0;
    return result;
}

function relativeOrAbsolutePath(hostRoot, value) {
    const absolute = path.resolve(value);
    const relative = path.relative(path.resolve(hostRoot), absolute);
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
        return normalizeForDisplay(relative);
    }
    return normalizeForDisplay(absolute);
}

function isHttpUrl(value) {
    if (!isNonEmptyString(value)) return false;
    try {
        const parsed = new URL(value);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

function isFileUrl(value) {
    if (!isNonEmptyString(value)) return false;
    try {
        return new URL(value).protocol === 'file:';
    } catch {
        return false;
    }
}

function pathContainsParentTraversal(value) {
    return String(value).replaceAll('\\', '/').split('/').some((segment) => segment === '..');
}

function assertLexicallyContained(hostRoot, candidate, label) {
    const relation = path.relative(hostRoot, candidate);
    if (relation === '..' || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) {
        throw new Error(`${label} escapes host root: ${candidate}`);
    }
}

function toLocalPath(value, label) {
    if (isHttpUrl(value)) return null;
    if (CONTROL_CHARACTER_PATTERN.test(String(value))) {
        CONTROL_CHARACTER_PATTERN.lastIndex = 0;
        throw new Error(`${label} contains control characters`);
    }
    CONTROL_CHARACTER_PATTERN.lastIndex = 0;
    if (isFileUrl(value)) {
        try {
            return fileURLToPath(value);
        } catch (error) {
            throw new Error(`${label} is not a valid local file URL: ${error.message}`);
        }
    }
    return value;
}

function resolveLocalPath(hostRoot, value, label) {
    if (!isNonEmptyString(value)) return null;
    const localPath = toLocalPath(value, label);
    if (localPath === null) return null;
    if (pathContainsParentTraversal(localPath)) {
        throw new Error(`${label} must not contain parent traversal (..)`);
    }
    const absolute = path.isAbsolute(localPath)
        ? path.resolve(localPath)
        : path.resolve(hostRoot, localPath);
    assertLexicallyContained(hostRoot, absolute, label);
    return absolute;
}

function realpathExistingContained(hostRootReal, candidate, label, kind = 'any') {
    if (!fs.existsSync(candidate)) {
        throw new Error(`${label} does not exist: ${candidate}`);
    }
    const stats = fs.statSync(candidate);
    if (kind === 'file' && !stats.isFile()) {
        throw new Error(`${label} must be a file: ${candidate}`);
    }
    if (kind === 'directory' && !stats.isDirectory()) {
        throw new Error(`${label} must be a directory: ${candidate}`);
    }
    const real = fs.realpathSync(candidate);
    assertLexicallyContained(hostRootReal, real, `${label} realpath`);
    return real;
}

function resolveHostRoot(hostRoot) {
    const absolute = resolveHostDir(hostRoot);
    if (!fs.existsSync(absolute)) {
        throw new Error(`host root does not exist: ${absolute}`);
    }
    if (!fs.statSync(absolute).isDirectory()) {
        throw new Error(`host root must be a directory: ${absolute}`);
    }
    return fs.realpathSync(absolute);
}

function validateOptionalLocalArtifact(hostRoot, hostRootReal, value, label) {
    if (!isNonEmptyString(value)) {
        return { absolute: null, real: null, display: normalizeSingleLine(value) };
    }
    const absolute = resolveLocalPath(hostRoot, value, label);
    if (absolute === null) {
        return { absolute: null, real: null, display: normalizeSingleLine(value) };
    }
    if (!fs.existsSync(absolute)) {
        return { absolute, real: null, display: normalizeForDisplay(absolute) };
    }
    const real = realpathExistingContained(hostRootReal, absolute, label);
    return { absolute, real, display: normalizeForDisplay(real) };
}

function displayTechStackSource(hostRoot, hostRootReal, source) {
    if (containsControlCharacters(source)) {
        return normalizeSingleLine(source);
    }
    const candidate = validateOptionalLocalArtifact(hostRoot, hostRootReal, source, 'tech-stack source');
    return candidate.real ? normalizeForDisplay(candidate.real) : normalizeSingleLine(source);
}

function requireLedger(hostRoot, hostRootReal) {
    const ledgerPath = findLedger(hostRoot);
    if (!ledgerPath) {
        throw new Error(`phase-3 page ledger is required under ${path.join(hostRoot, 'src', 'frontend', 'page-preview')}`);
    }

    const ledgerRealPath = realpathExistingContained(hostRootReal, path.resolve(ledgerPath), 'page ledger', 'file');
    const ledger = readLedger(ledgerRealPath);
    if (ledger.phase !== 3) {
        throw new Error(`page ledger must be at phase 3 before delivery adapter runs (received phase ${ledger.phase})`);
    }
    if (ledger.screenshotAsked !== true) {
        throw new Error('page ledger screenshotAsked must be true before delivery adapter runs');
    }
    if (!isNonEmptyString(ledger.slug)) {
        throw new Error('page ledger slug must be a non-empty string');
    }

    return { ledger, ledgerPath: ledgerRealPath };
}

function requireBrdSlug(hostRoot, hostRootReal) {
    const brdPath = findBrd(hostRoot);
    if (!brdPath) {
        throw new Error(`BRD is required to derive the project slug under ${hostRoot}`);
    }

    let slug;
    try {
        slug = deriveSlugFromBrd(brdPath);
    } catch (error) {
        throw new Error(`unable to derive BRD slug: ${error.message}`);
    }

    const brdRealPath = realpathExistingContained(hostRootReal, path.resolve(brdPath), 'BRD path', 'file');
    return { brdPath: brdRealPath, slug };
}

function assertSlugAlignment(manifest, ledger, brd) {
    if (manifest.projectSlug !== ledger.slug) {
        throw new Error(`manifest projectSlug ${manifest.projectSlug} does not match page ledger slug ${ledger.slug}`);
    }
    if (manifest.projectSlug !== brd.slug) {
        throw new Error(`manifest projectSlug ${manifest.projectSlug} does not match BRD-derived slug ${brd.slug}`);
    }
}

function assertProjectRootPath(hostRoot, hostRootReal, projectRoot) {
    const absolute = resolveLocalPath(hostRoot, projectRoot, 'projectRoot');
    if (!absolute) {
        throw new Error('projectRoot must be a local host path');
    }
    return realpathExistingContained(hostRootReal, absolute, 'projectRoot', 'directory');
}

function assertDesignSystemPath(hostRoot, hostRootReal, designSystemPath) {
    const absolute = resolveLocalPath(hostRoot, designSystemPath, 'project design-system path');
    if (!absolute) {
        throw new Error('project design-system path must be a local host path');
    }
    return realpathExistingContained(hostRootReal, absolute, 'project design-system path');
}

function assertManifestPath(hostRoot, hostRootReal, manifestPath) {
    const absolute = resolveLocalPath(hostRoot, manifestPath, 'manifest path');
    if (!absolute) {
        throw new Error('manifest path must be a local host path');
    }
    return realpathExistingContained(hostRootReal, absolute, 'manifest path', 'file');
}

function validatePagePathInputs(hostRoot, projectRoot, pages) {
    for (const [index, page] of (Array.isArray(pages) ? pages : []).entries()) {
        if (!page || !isNonEmptyString(page.file)) continue;
        const label = `page file pages[${index}]`;
        const absolute = resolveLocalPath(projectRoot, page.file, label);
        if (absolute === null) {
            throw new Error(`${label} must be a local host path`);
        }
        assertLexicallyContained(hostRoot, absolute, label);
        assertLexicallyContained(projectRoot, absolute, label);
    }
}

function validatePreviewEvidence(hostRoot, hostRootReal, evidence) {
    const resolvedPaths = new Map();
    if (!Array.isArray(evidence)) return resolvedPaths;

    for (const [index, item] of evidence.entries()) {
        if (!item || !Object.hasOwn(item, 'path')) continue;
        const rawPath = item.path;
        if (!isNonEmptyString(rawPath)) {
            throw new Error(`preview evidence path ${index} must be a non-empty local path`);
        }
        if (isHttpUrl(rawPath)) {
            resolvedPaths.set(index, rawPath);
            continue;
        }
        const absolute = resolveLocalPath(hostRoot, rawPath, `preview evidence path ${index}`);
        if (!absolute) {
            throw new Error(`preview evidence path ${index} must be a local path`);
        }
        const real = realpathExistingContained(
            hostRootReal,
            absolute,
            `preview evidence path ${index}`,
            'file'
        );
        resolvedPaths.set(index, real);
    }

    return resolvedPaths;
}

function renderEvidence(evidence, resolvedEvidencePaths = new Map()) {
    if (!Array.isArray(evidence) || evidence.length === 0) {
        return '- 无额外浏览器证据';
    }

    return evidence
        .map((item, index) => {
            const type = escapeMarkdownInline(item?.type ?? 'unknown');
            const result = escapeMarkdownInline(item?.result ?? 'unknown');
            const url = escapeMarkdownInline(item?.url ?? '-');
            const viewport = escapeMarkdownInline(item?.viewport ?? '-');
            const evidencePath = resolvedEvidencePaths.get(index);
            const note = isNonEmptyString(item?.note) ? escapeMarkdownInline(item.note) : '';
            const pathPart = evidencePath
                ? `；证据文件: ${escapeMarkdownInline(normalizeForDisplay(evidencePath))}`
                : '';
            const notePart = note ? `；${note}` : '';
            return `${index + 1}. ${type} / ${result} / ${url} / ${viewport}${pathPart}${notePart}`;
        })
        .join('\n');
}

function renderMockScope(mockScope) {
    if (!Array.isArray(mockScope) || mockScope.length === 0) {
        return '- 无 mock；页面数据来源已明确为真实接口或静态内容';
    }

    return mockScope
        .map((item) => {
            const id = escapeMarkdownInline(item?.id ?? 'unnamed-mock');
            const description = escapeMarkdownInline(item?.description ?? '未提供说明');
            const affects = Array.isArray(item?.affects)
                ? escapeMarkdownInline(item.affects.join('、'))
                : '未声明';
            return `- ${id}: ${description}（影响页面: ${affects}）`;
        })
        .join('\n');
}

function renderPages(manifest, resolvedFiles) {
    if (resolvedFiles.length !== manifest.pages.length) {
        throw new Error('validator resolved file count does not match manifest page count');
    }

    const rows = manifest.pages.map((page, index) => {
        const filePath = resolvedFiles[index];
        if (!path.isAbsolute(filePath)) {
            throw new Error(`validator returned a non-absolute page file path for ${page.id}`);
        }
        return `| ${escapeMarkdownCell(page.title)} | ${escapeMarkdownCell(page.route)} | ${escapeMarkdownCell(path.resolve(filePath))} | 已确认 (confirmed) |`;
    });

    return [
        '| 页面 | 路由 | 文件路径 | 状态 |',
        '| --- | --- | --- | --- |',
        ...rows
    ].join('\n');
}

function renderLegacyDelivery({
    manifest,
    hostRoot,
    manifestPath,
    confirmationEvidence,
    techStackSource,
    ledger,
    ledgerPath,
    brdPath,
    sourcePath,
    projectRoot,
    designSystemPath,
    resolvedFiles,
    resolvedEvidencePaths
}) {
    const outputPath = path.resolve(getDeliveryFilePath(hostRoot, manifest.projectSlug));
    const manifestAbsolutePath = path.resolve(manifestPath);
    const adapterSource = relativeOrAbsolutePath(hostRoot, manifestAbsolutePath);
    const preview = manifest.preview ?? {};
    const machineMetadata = {
        schemaVersion: MANIFEST_SCHEMA_VERSION,
        adapter: 'page-designer',
        adapterVersion: ADAPTER_VERSION,
        projectSlug: normalizeSingleLine(manifest.projectSlug),
        manifestStatus: normalizeSingleLine(manifest.status),
        adapterSource: manifestAbsolutePath,
        ledgerPath,
        ledgerPhase: ledger.phase,
        brdPath,
        projectRoot,
        designSystemPath,
        sourcePath: normalizeSingleLine(sourcePath),
        confirmationEvidence: normalizeSingleLine(confirmationEvidence),
        techStackSource: normalizeSingleLine(techStackSource),
        resolvedFiles: resolvedFiles.map((filePath) => path.resolve(filePath)),
        preview: {
            baseUrl: preview.baseUrl ?? null,
            startedBy: preview.startedBy ?? null,
            verification: preview.verification ?? null
        },
        compositionKitId: manifest.compositionKitId,
        commitmentIds: manifest.commitmentIds
    };
    const machineMetadataRecord = `<!-- page-delivery-adapter:v0.11;base64:${Buffer.from(
        JSON.stringify(machineMetadata),
        'utf8'
    ).toString('base64')} -->`;

    const content = [
        `# 页面交付清单 - ${escapeMarkdownInline(manifest.projectSlug)}`,
        '',
        machineMetadataRecord,
        '',
        '> Skill: page-designer (design-consultant v0.11 adapter)',
        `> Project Slug: ${escapeMarkdownInline(manifest.projectSlug)}`,
        `> Adapter Source: ${escapeMarkdownInline(adapterSource)}`,
        `> Manifest Status: ${escapeMarkdownInline(manifest.status)}`,
        '> 页面方向确认: 已确认',
        `> 确认证据: ${escapeMarkdownInline(confirmationEvidence)}`,
        `> 技术栈来源: ${escapeMarkdownInline(techStackSource)}`,
        '> 台账阶段: 3（适配器只读；由现有 page-ledger 命令负责 3 -> 4）',
        '',
        '## 上游依赖',
        `- BRD 文件: ${escapeMarkdownInline(normalizeForDisplay(brdPath))}`,
        `- 通用清单: ${escapeMarkdownInline(normalizeForDisplay(manifestAbsolutePath))}`,
        `- Manifest source: ${escapeMarkdownInline(sourcePath)}`,
        `- 前端工程目录: ${escapeMarkdownInline(normalizeForDisplay(projectRoot))}`,
        '',
        '## 本地预览',
        `- 启动命令（仅记录，不执行）: ${escapeMarkdownInline(preview.startCommand ?? '未提供')}`,
        `- 访问地址: ${escapeMarkdownInline(preview.baseUrl ?? '未提供')}`,
        `- 启动者: ${escapeMarkdownInline(preview.startedBy ?? '未提供')}`,
        `- 验证状态: ${escapeMarkdownInline(preview.verification ?? '未提供')}`,
        '- 浏览器证据:',
        renderEvidence(preview.evidence, resolvedEvidencePaths),
        '',
        '## 交付产物',
        renderPages(manifest, resolvedFiles),
        '',
        '## Mock 范围',
        renderMockScope(manifest.mockScope),
        '',
        '## 设计系统与组件契约',
        `- 设计系统路径: ${escapeMarkdownInline(normalizeForDisplay(designSystemPath))}`,
        `- Composition Kit: ${escapeMarkdownInline(manifest.compositionKitId)}`,
        `- 组件契约来源: design-consultant v${ADAPTER_VERSION}；contract-only family 仍需宿主 adapter，不宣称已有运行时实现`,
        '',
        '## 产品验收承诺',
        '| Commitment ID | 状态 |',
        '| --- | --- |',
        ...manifest.commitmentIds.map((id) => `| ${escapeMarkdownCell(id)} | confirmed |`),
        '',
        '## 下游读取说明',
        '- page-explainer 读取本清单中的页面路由、绝对文件路径、预览地址和验证证据。',
        '- foundation-builder 与 prd-writer 继续读取本清单，不直接读取 design-consultant 内部阶段状态。',
        '- 本适配器不写入全局套包状态、不调用 page-chief，也不执行 preview.startCommand。',
        ''
    ].join('\n');

    return { outputPath, content };
}

function writeAtomically(outputPath, content) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const tempPath = `${outputPath}.tmp-${process.pid}-${Date.now()}`;
    try {
        fs.writeFileSync(tempPath, content, 'utf8');
        fs.renameSync(tempPath, outputPath);
    } finally {
        if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true });
    }
}

export async function buildLegacyPageDelivery({
    manifest,
    hostRoot,
    manifestPath,
    confirmationEvidence,
    techStackSource
}) {
    const resolvedHostRoot = resolveHostDir(hostRoot);
    const hostRootReal = resolveHostRoot(hostRoot);
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
        throw new Error('manifest must be an object');
    }
    if (manifest.status !== 'confirmed') {
        throw new Error(`manifest must be confirmed before legacy delivery (received ${manifest.status ?? 'missing status'})`);
    }
    if (!isNonEmptyString(confirmationEvidence)) {
        throw new Error('confirmation evidence must be a non-empty string');
    }
    if (!isNonEmptyString(techStackSource)) {
        throw new Error('tech-stack source must be a non-empty string');
    }
    if (!isNonEmptyString(manifestPath)) {
        manifestPath = path.join(resolvedHostRoot, 'design-system', 'page-delivery.json');
    }

    // Resolve and contain all host artifacts before invoking the imported
    // validator. This keeps adapter-specific path errors deterministic and
    // prevents an upstream relative-path diagnostic from masking containment.
    const manifestAbsolutePath = assertManifestPath(resolvedHostRoot, hostRootReal, manifestPath);
    const projectRootPath = resolveLocalPath(resolvedHostRoot, manifest.projectRoot, 'projectRoot');
    if (!projectRootPath) {
        throw new Error('projectRoot must be a local host path');
    }
    assertLexicallyContained(resolvedHostRoot, projectRootPath, 'projectRoot');
    const projectRootReal = assertProjectRootPath(resolvedHostRoot, hostRootReal, manifest.projectRoot);
    const designSystemPath = assertDesignSystemPath(resolvedHostRoot, hostRootReal, manifest.designSystemPath);
    validatePagePathInputs(resolvedHostRoot, projectRootPath, manifest.pages);

    const sourcePathValue = manifest.source?.path;
    const sourceArtifact = isNonEmptyString(sourcePathValue)
        ? validateOptionalLocalArtifact(resolvedHostRoot, hostRootReal, sourcePathValue, 'manifest source path')
        : { absolute: null, real: null, display: '' };
    const sourcePathDisplay = sourceArtifact.real
        ? normalizeForDisplay(sourceArtifact.real)
        : normalizeSingleLine(sourcePathValue);
    const resolvedEvidencePaths = validatePreviewEvidence(
        resolvedHostRoot,
        hostRootReal,
        manifest.preview?.evidence
    );

    const validation = await validatePageDeliveryManifest(manifest, { hostRoot: resolvedHostRoot });
    if (!validation.ok) {
        throw new Error(`invalid confirmed page delivery manifest: ${validation.issues.join('; ')}`);
    }

    const resolvedFiles = validation.resolvedFiles.map((filePath, index) => {
        const label = `page file pages[${index}]`;
        if (!path.isAbsolute(filePath)) {
            throw new Error(`${label} must resolve to an absolute path`);
        }
        const realPath = realpathExistingContained(hostRootReal, path.resolve(filePath), label, 'file');
        assertLexicallyContained(projectRootReal, realPath, `${label} realpath`);
        return realPath;
    });

    const { ledger, ledgerPath } = requireLedger(resolvedHostRoot, hostRootReal);
    const brd = requireBrdSlug(resolvedHostRoot, hostRootReal);
    assertSlugAlignment(manifest, ledger, brd);

    const techStackDisplay = displayTechStackSource(resolvedHostRoot, hostRootReal, techStackSource);
    const { outputPath, content } = renderLegacyDelivery({
        manifest,
        hostRoot: resolvedHostRoot,
        manifestPath: manifestAbsolutePath,
        confirmationEvidence: confirmationEvidence.trim(),
        techStackSource: techStackDisplay,
        ledger,
        ledgerPath,
        brdPath: brd.brdPath,
        sourcePath: sourcePathDisplay,
        projectRoot: projectRootReal,
        designSystemPath,
        resolvedFiles,
        resolvedEvidencePaths
    });

    writeAtomically(outputPath, content);
    return {
        slug: manifest.projectSlug,
        outputPath,
        content,
        resolvedFiles
    };
}

function parseArgs(argv) {
    const [subcommand, ...rest] = argv;
    const flags = {};
    for (let index = 0; index < rest.length; index += 1) {
        const value = rest[index];
        if (!value.startsWith('--')) continue;
        flags[value.slice(2)] = rest[index + 1] ?? null;
        index += 1;
    }
    return { subcommand, flags };
}

async function runCli() {
    const { subcommand, flags } = parseArgs(process.argv.slice(2));
    if (subcommand !== 'build') {
        process.stderr.write('Usage: node page-delivery-adapter.mjs build --manifest <path> --host-dir <path> --confirmation-evidence <text> --tech-stack-source <path-or-label>\n');
        process.exitCode = 2;
        return;
    }

    if (!flags.manifest || !flags['host-dir'] || !flags['confirmation-evidence'] || !flags['tech-stack-source']) {
        process.stderr.write('Missing required adapter flags: --manifest, --host-dir, --confirmation-evidence, --tech-stack-source\n');
        process.exitCode = 2;
        return;
    }

    try {
        const manifestPath = path.resolve(flags.manifest);
        const manifest = await loadPageDeliveryManifest(manifestPath);
        const result = await buildLegacyPageDelivery({
            manifest,
            hostRoot: flags['host-dir'],
            manifestPath,
            confirmationEvidence: flags['confirmation-evidence'],
            techStackSource: flags['tech-stack-source']
        });
        process.stdout.write(`${JSON.stringify({
            success: true,
            slug: result.slug,
            outputPath: result.outputPath,
            resolvedFiles: result.resolvedFiles
        }, null, 2)}\n`);
    } catch (error) {
        process.stderr.write(`${JSON.stringify({ success: false, error: 'adapter_failed', message: error.message }, null, 2)}\n`);
        process.exitCode = 1;
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await runCli();
}
