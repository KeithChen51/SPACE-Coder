#!/usr/bin/env node

/**
 * Traceability:
 * Rule sources:
 * - skills/ai-project-manager/SKILL.md
 * - skills/ai-project-manager/references/core/runtime.md
 * - skills/ai-project-manager/references/core/global-files-protocol.md
 * - skills/ai-project-manager/references/core/routing.md
 * Structured config:
 * - lib/ai-pm-protocol/*.js
 * - lib/bootstrap/index.js
 */
import fs from 'fs';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_SUITE_ROOT = path.resolve(__dirname, '..');

const PROTOCOL_DOCS = [
    'skills/ai-project-manager/SKILL.md',
    'skills/ai-project-manager/references/core/runtime.md',
    'skills/ai-project-manager/references/core/global-files-protocol.md',
    'skills/ai-project-manager/references/core/routing.md'
];

const STRUCTURED_ROOTS = ['lib/ai-pm-protocol', 'lib/bootstrap'];

function printUsage() {
    console.log('Usage: node project-manager-suite/tools/check-protocol-alignment.mjs [suite-root] [--json]');
}

function parseArgs(argv) {
    const args = argv.slice(2);
    const options = {
        suiteRoot: DEFAULT_SUITE_ROOT,
        json: false
    };

    for (const arg of args) {
        if (arg === '--json') {
            options.json = true;
            continue;
        }

        if (options.suiteRoot === DEFAULT_SUITE_ROOT) {
            options.suiteRoot = path.resolve(process.cwd(), arg);
            continue;
        }

        throw new Error(`Unknown argument: ${arg}`);
    }

    return options;
}

function normalizeRelative(rootDir, targetPath) {
    return path.relative(rootDir, targetPath).split(path.sep).join('/');
}

function buildIssue(severity, code, message, details = {}) {
    return { severity, code, message, ...details };
}

function extractStructuredImplementations(docContent) {
    const lines = docContent.split('\n');
    const results = [];
    let inStructuredSection = false;

    for (const rawLine of lines) {
        const line = rawLine.trim();

        if (line === '- 结构化实现：') {
            inStructuredSection = true;
            continue;
        }

        if (!inStructuredSection) {
            continue;
        }

        if (line.startsWith('- 对应脚本：') || line.startsWith('- 平台注入入口：') || line === '维护原则：') {
            break;
        }

        const match = line.match(/^-\s+`(.+)`$/);
        if (match) {
            results.push(match[1]);
        }
    }

    return results;
}

function extractTraceabilityRuleSources(fileContent) {
    const match = fileContent.match(/\/\*\*([\s\S]*?)\*\//);
    if (!match || !match[1].includes('Traceability:')) {
        return [];
    }

    const lines = match[1].split('\n').map((line) => line.replace(/^\s*\*\s?/, '').trim());
    const sources = [];
    let inRuleSources = false;

    for (const line of lines) {
        if (line === 'Rule sources:') {
            inRuleSources = true;
            continue;
        }

        if (!inRuleSources) {
            continue;
        }

        if (/^[A-Za-z][A-Za-z ]+:$/.test(line)) {
            break;
        }

        const sourceMatch = line.match(/^-\s+(.+)$/);
        if (sourceMatch) {
            sources.push(sourceMatch[1].trim());
        }
    }

    return sources;
}

function collectStructuredFiles(suiteRoot) {
    const files = [];

    for (const relativeRoot of STRUCTURED_ROOTS) {
        const absoluteRoot = path.join(suiteRoot, relativeRoot);
        if (!fs.existsSync(absoluteRoot)) {
            continue;
        }

        for (const entry of fs.readdirSync(absoluteRoot, { withFileTypes: true })) {
            if (entry.isFile() && entry.name.endsWith('.js')) {
                files.push(path.join(absoluteRoot, entry.name));
            }
        }
    }

    return files.sort();
}

function checkProtocolAlignment({ suiteRoot = DEFAULT_SUITE_ROOT }) {
    const resolvedSuiteRoot = path.resolve(suiteRoot);
    const issues = [];
    const protocolMap = {};

    for (const relativeDocPath of PROTOCOL_DOCS) {
        const absoluteDocPath = path.join(resolvedSuiteRoot, relativeDocPath);
        if (!fs.existsSync(absoluteDocPath)) {
            issues.push(
                buildIssue('error', 'missing_protocol_doc', `Protocol doc not found: ${relativeDocPath}`, {
                    docPath: relativeDocPath
                })
            );
            continue;
        }

        const content = fs.readFileSync(absoluteDocPath, 'utf8');
        const structuredImplementations = extractStructuredImplementations(content);
        protocolMap[relativeDocPath] = structuredImplementations;

        if (structuredImplementations.length === 0) {
            issues.push(
                buildIssue('error', 'missing_structured_mapping', `No structured implementation mapping found in ${relativeDocPath}`, {
                    docPath: relativeDocPath
                })
            );
        }

        for (const relativeStructuredPath of structuredImplementations) {
            const absoluteStructuredPath = path.join(resolvedSuiteRoot, relativeStructuredPath);
            if (!fs.existsSync(absoluteStructuredPath)) {
                issues.push(
                    buildIssue(
                        'error',
                        'missing_structured_file',
                        `${relativeDocPath} references missing structured file ${relativeStructuredPath}`,
                        {
                            docPath: relativeDocPath,
                            structuredPath: relativeStructuredPath
                        }
                    )
                );
                continue;
            }

            const sources = extractTraceabilityRuleSources(fs.readFileSync(absoluteStructuredPath, 'utf8'));
            if (sources.length === 0) {
                issues.push(
                    buildIssue(
                        'error',
                        'missing_traceability_header',
                        `Structured file ${relativeStructuredPath} is missing Traceability rule sources`,
                        {
                            docPath: relativeDocPath,
                            structuredPath: relativeStructuredPath
                        }
                    )
                );
                continue;
            }

            if (!sources.includes(relativeDocPath)) {
                issues.push(
                    buildIssue(
                        'error',
                        'missing_reverse_link',
                        `Structured file ${relativeStructuredPath} does not point back to ${relativeDocPath}`,
                        {
                            docPath: relativeDocPath,
                            structuredPath: relativeStructuredPath,
                            traceabilitySources: sources
                        }
                    )
                );
            }
        }
    }

    const structuredFiles = collectStructuredFiles(resolvedSuiteRoot);
    for (const absoluteStructuredPath of structuredFiles) {
        const relativeStructuredPath = normalizeRelative(resolvedSuiteRoot, absoluteStructuredPath);
        const sources = extractTraceabilityRuleSources(fs.readFileSync(absoluteStructuredPath, 'utf8'));

        if (sources.length === 0) {
            continue;
        }

        for (const sourceDocPath of sources) {
            if (!PROTOCOL_DOCS.includes(sourceDocPath)) {
                continue;
            }

            const mappedFiles = protocolMap[sourceDocPath] || [];
            if (!mappedFiles.includes(relativeStructuredPath)) {
                issues.push(
                    buildIssue(
                        'error',
                        'missing_forward_link',
                        `Protocol doc ${sourceDocPath} does not list structured file ${relativeStructuredPath}`,
                        {
                            docPath: sourceDocPath,
                            structuredPath: relativeStructuredPath
                        }
                    )
                );
            }
        }
    }

    const summary = {
        errors: issues.filter((item) => item.severity === 'error').length,
        warnings: issues.filter((item) => item.severity === 'warning').length,
        infos: issues.filter((item) => item.severity === 'info').length
    };

    return {
        suiteRoot: resolvedSuiteRoot,
        protocolDocs: PROTOCOL_DOCS,
        protocolMap,
        scannedStructuredFiles: structuredFiles.map((item) => normalizeRelative(resolvedSuiteRoot, item)),
        issues,
        summary
    };
}

function formatTextReport(result) {
    const lines = [
        `Suite root: ${result.suiteRoot}`,
        `Protocol docs checked: ${result.protocolDocs.length}`,
        `Structured files scanned: ${result.scannedStructuredFiles.length}`,
        `Errors: ${result.summary.errors}`,
        `Warnings: ${result.summary.warnings}`,
        `Info: ${result.summary.infos}`
    ];

    lines.push('', 'Mappings:');
    for (const [docPath, structuredFiles] of Object.entries(result.protocolMap)) {
        lines.push(`- ${docPath}: ${structuredFiles.length > 0 ? structuredFiles.join(', ') : 'none'}`);
    }

    lines.push('', 'Issues:');
    if (result.issues.length === 0) {
        lines.push('- none');
    } else {
        for (const issue of result.issues) {
            lines.push(`- [${issue.severity}] ${issue.code}: ${issue.message}`);
        }
    }

    return lines.join('\n');
}

function main() {
    const options = parseArgs(process.argv);
    const result = checkProtocolAlignment(options);

    if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
    }

    console.log(formatTextReport(result));

    if (result.summary.errors > 0) {
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

export { checkProtocolAlignment, formatTextReport };
