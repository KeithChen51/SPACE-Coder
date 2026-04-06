#!/usr/bin/env node

/**
 * Traceability:
 * Rule sources:
 * - skills/ai-project-manager/references/core/routing.md
 * - skills/ai-project-manager/references/core/global-files-protocol.md
 * Structured config:
 * - lib/ai-pm-protocol/routing.js
 * - lib/ai-pm-protocol/rules-sync.js
 * Related tools:
 * - tools/validate-global-files.mjs
 * - tools/generate-host-rules.mjs
 */
import fs from 'fs';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';
import { FILE_ROLE_IDS, STAGE_IDS, fieldPackages, fileContracts } from '../lib/ai-pm-protocol/index.js';
import { generateHostRules } from './generate-host-rules.mjs';
import { validateGlobalFiles } from './validate-global-files.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const suiteRoot = path.resolve(__dirname, '..');
const templatesDir = path.join(suiteRoot, 'skills', 'ai-project-manager', 'assets', 'global-files');

function printUsage() {
    console.log(
        'Usage: node project-manager-suite/tools/bootstrap-host.mjs <host-project-root> [--project-name NAME] [--target-stage S3|S4] [--container-root] [--dry-run] [--json] [--force-rules] [--interview-complete] [--interview-json FILE] [--create-profile-file] [--create-rules-file] [--create-plan-file]'
    );
}

function parseArgs(argv) {
    const args = argv.slice(2);
    const options = {
        hostRoot: '',
        projectName: '',
        targetStage: '',
        containerRoot: false,
        dryRun: false,
        json: false,
        forceRules: false,
        interviewComplete: false,
        interviewJsonPath: '',
        createProfileFile: false,
        createRulesFile: false,
        createPlanFile: false
    };

    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];

        if (arg === '--container-root') {
            options.containerRoot = true;
            continue;
        }

        if (arg === '--dry-run') {
            options.dryRun = true;
            continue;
        }

        if (arg === '--json') {
            options.json = true;
            continue;
        }

        if (arg === '--force-rules') {
            options.forceRules = true;
            continue;
        }

        if (arg === '--interview-complete') {
            options.interviewComplete = true;
            continue;
        }

        if (arg === '--interview-json') {
            options.interviewJsonPath = args[i + 1] || '';
            if (!options.interviewJsonPath) {
                throw new Error('Missing value for --interview-json');
            }
            i += 1;
            continue;
        }

        if (arg === '--create-profile-file') {
            options.createProfileFile = true;
            continue;
        }

        if (arg === '--create-rules-file') {
            options.createRulesFile = true;
            continue;
        }

        if (arg === '--create-plan-file') {
            options.createPlanFile = true;
            continue;
        }

        if (arg === '--project-name') {
            options.projectName = args[i + 1] || '';
            if (!options.projectName) {
                throw new Error('Missing value for --project-name');
            }
            i += 1;
            continue;
        }

        if (arg === '--target-stage') {
            options.targetStage = (args[i + 1] || '').toUpperCase();
            if (!options.targetStage) {
                throw new Error('Missing value for --target-stage');
            }
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

    if (options.targetStage && ![STAGE_IDS.S3, STAGE_IDS.S4].includes(options.targetStage) && !Object.values(STAGE_IDS).includes(options.targetStage)) {
        throw new Error(`Unsupported target stage: ${options.targetStage}`);
    }

    return options;
}

const profileFieldLabels = new Map(
    fileContracts[FILE_ROLE_IDS.PROFILE].map((item) => [item.key, item.label])
);

function hasMeaningfulValue(value) {
    if (typeof value === 'string') {
        return value.trim().length > 0;
    }

    return value !== null && value !== undefined;
}

function loadInterviewInput(options) {
    if (!options.interviewJsonPath) {
        return {
            provided: false,
            path: '',
            answers: {},
            missingKeys: []
        };
    }

    const resolvedPath = path.resolve(process.cwd(), options.interviewJsonPath);
    if (!safeExists(resolvedPath)) {
        throw new Error(`Interview JSON not found: ${resolvedPath}`);
    }

    let parsed;
    try {
        parsed = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
    } catch (error) {
        throw new Error(`Interview JSON is invalid: ${resolvedPath}`);
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`Interview JSON must contain an object: ${resolvedPath}`);
    }

    const answers =
        parsed.startupMinimum && typeof parsed.startupMinimum === 'object' && !Array.isArray(parsed.startupMinimum)
            ? parsed.startupMinimum
            : parsed;

    const missingKeys = fieldPackages.startupMinimum.filter((key) => !hasMeaningfulValue(answers[key]));

    return {
        provided: true,
        path: resolvedPath,
        answers,
        missingKeys
    };
}

function formatMissingInterviewFields(missingKeys) {
    return missingKeys
        .map((key) => `${key} (${profileFieldLabels.get(key) || key})`)
        .join(', ');
}

function normalizeRelative(root, target) {
    return path.relative(root, target).split(path.sep).join('/') || '.';
}

function safeExists(targetPath) {
    return fs.existsSync(targetPath);
}

function detectContainerDirectory(hostRoot) {
    const evidence = [];
    const checks = [
        'project-profile.md',
        'project-rules.md',
        'docs',
        'logs',
        'src',
        'package.json',
        'README.md'
    ];

    for (const item of checks) {
        if (safeExists(path.join(hostRoot, item))) {
            evidence.push(item);
        }
    }

    return {
        isContainerLike: evidence.length === 0,
        evidence
    };
}

function resolveEffectiveRoot(hostRoot, options) {
    const resolvedHostRoot = path.resolve(process.cwd(), options.hostRoot);
    const containerCheck = detectContainerDirectory(resolvedHostRoot);

    if ((options.containerRoot || containerCheck.isContainerLike) && options.projectName) {
        return {
            inputRoot: resolvedHostRoot,
            effectiveRoot: path.join(resolvedHostRoot, options.projectName),
            rootMode: 'container',
            detectionEvidence: containerCheck.evidence
        };
    }

    return {
        inputRoot: resolvedHostRoot,
        effectiveRoot: resolvedHostRoot,
        rootMode: 'project',
        detectionEvidence: containerCheck.evidence
    };
}

function ensureDirectory(targetPath, options, results) {
    if (safeExists(targetPath)) {
        results.directories.skipped.push(targetPath);
        return;
    }

    if (!options.dryRun) {
        fs.mkdirSync(targetPath, { recursive: true });
    }

    results.directories.created.push(targetPath);
}

function copyTemplateIfNeeded({ effectiveRoot, relativePath, templateName, options, results }) {
    const targetPath = path.join(effectiveRoot, relativePath);
    if (safeExists(targetPath)) {
        results.files.skipped.push({
            path: targetPath,
            reason: 'already_exists'
        });
        return;
    }

    const templatePath = path.join(templatesDir, templateName);
    const content = fs.readFileSync(templatePath, 'utf8');

    if (!options.dryRun) {
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, content, 'utf8');
    }

    results.files.created.push(targetPath);
}

function shouldCreatePlanFile(options) {
    return options.createPlanFile || options.targetStage === STAGE_IDS.S3 || options.targetStage === STAGE_IDS.S4;
}

function buildEmptyValidationState(effectiveRoot) {
    return {
        hostRoot: effectiveRoot,
        authority: {
            project_profile: null,
            global_rules: null,
            execution_plan: null,
            project_devlog: null
        }
    };
}

function bootstrapHost(options) {
    const interviewInput = loadInterviewInput(options);
    const rootResolution = resolveEffectiveRoot(options.hostRoot, options);
    const effectiveRoot = rootResolution.effectiveRoot;
    const results = {
        rootResolution,
        directories: {
            created: [],
            skipped: []
        },
        files: {
            created: [],
            skipped: [],
            deferred: []
        },
        rulesSync: null,
        postValidation: null
    };

    if (!safeExists(rootResolution.inputRoot)) {
        throw new Error(`Input root does not exist: ${rootResolution.inputRoot}`);
    }

    if (rootResolution.rootMode === 'container') {
        ensureDirectory(effectiveRoot, options, results);
    }

    ensureDirectory(path.join(effectiveRoot, 'docs'), options, results);
    ensureDirectory(path.join(effectiveRoot, 'docs', 'plans'), options, results);
    ensureDirectory(path.join(effectiveRoot, 'logs'), options, results);
    ensureDirectory(path.join(effectiveRoot, '.agent'), options, results);
    ensureDirectory(path.join(effectiveRoot, '.agent', 'skills'), options, results);

    const validationBefore =
        safeExists(effectiveRoot) && fs.statSync(effectiveRoot).isDirectory()
            ? validateGlobalFiles({ hostRoot: effectiveRoot })
            : buildEmptyValidationState(effectiveRoot);

    if (!validationBefore.authority.project_profile) {
        if (options.createProfileFile && options.interviewComplete) {
            if (!interviewInput.provided) {
                throw new Error(
                    'Creating project-profile.md requires --interview-json with the startup minimum interview fields.'
                );
            }

            if (interviewInput.missingKeys.length > 0) {
                throw new Error(
                    `Interview JSON is missing required startup fields: ${formatMissingInterviewFields(interviewInput.missingKeys)}`
                );
            }

            copyTemplateIfNeeded(
                {
                    effectiveRoot,
                    relativePath: 'project-profile.md',
                    templateName: 'project-profile.md',
                    options,
                    results
                }
            );
        } else if (options.createProfileFile && !options.interviewComplete) {
            throw new Error(
                'Creating project-profile.md requires completed interview confirmation. Pass --interview-complete only after the main entry finishes the startup interview.'
            );
        } else {
            results.files.deferred.push({
                path: path.join(effectiveRoot, 'project-profile.md'),
                reason: options.createProfileFile
                    ? 'profile_requires_interview_complete'
                    : 'profile_creation_not_requested'
            });
        }
    }

    if (!validationBefore.authority.global_rules) {
        if (options.createRulesFile) {
            copyTemplateIfNeeded(
                {
                    effectiveRoot,
                    relativePath: 'project-rules.md',
                    templateName: 'project-rules.md',
                    options,
                    results
                }
            );
        } else {
            results.files.deferred.push({
                path: path.join(effectiveRoot, 'project-rules.md'),
                reason: 'rules_file_creation_not_requested'
            });
        }
    }

    if (!validationBefore.authority.execution_plan) {
        if (shouldCreatePlanFile(options)) {
            copyTemplateIfNeeded(
                {
                    effectiveRoot,
                    relativePath: 'docs/plans/execution-plan.md',
                    templateName: 'execution-plan.md',
                    options,
                    results
                }
            );
        } else {
            results.files.deferred.push({
                path: path.join(effectiveRoot, 'docs/plans/execution-plan.md'),
                reason: 'plan_creation_requires_s3_or_s4_or_explicit_flag'
            });
        }
    }

    results.rulesSync = generateHostRules({
        hostRoot: effectiveRoot,
        force: options.forceRules,
        dryRun: options.dryRun
    });

    if (!options.dryRun) {
        results.postValidation = validateGlobalFiles({ hostRoot: effectiveRoot });
    }

    return results;
}

function formatTextReport(result) {
    const effectiveRoot = result.rootResolution.effectiveRoot;
    const inputRoot = result.rootResolution.inputRoot;

    const lines = [
        `Input root: ${inputRoot}`,
        `Effective root: ${effectiveRoot}`,
        `Root mode: ${result.rootResolution.rootMode}`,
        `Directories created: ${result.directories.created.length}`,
        `Files created: ${result.files.created.length}`,
        `Files deferred: ${result.files.deferred.length}`,
        `Rules created: ${result.rulesSync.results.created.length}`,
        `Rules overwritten: ${result.rulesSync.results.overwritten.length}`,
        `Rules skipped: ${result.rulesSync.results.skipped.length}`
    ];

    if (result.directories.created.length > 0) {
        lines.push('', 'Created directories:');
        for (const dir of result.directories.created) {
            lines.push(`- ${normalizeRelative(effectiveRoot, dir)}`);
        }
    }

    if (result.files.created.length > 0) {
        lines.push('', 'Created files:');
        for (const filePath of result.files.created) {
            lines.push(`- ${normalizeRelative(effectiveRoot, filePath)}`);
        }
    }

    if (result.files.deferred.length > 0) {
        lines.push('', 'Deferred files:');
        for (const item of result.files.deferred) {
            lines.push(`- ${normalizeRelative(effectiveRoot, item.path)} (${item.reason})`);
        }
    }

    lines.push('', 'Rules sync summary:');
    for (const filePath of result.rulesSync.results.created) {
        lines.push(`- CREATE ${normalizeRelative(effectiveRoot, filePath)}`);
    }
    for (const filePath of result.rulesSync.results.overwritten) {
        lines.push(`- OVERWRITE ${normalizeRelative(effectiveRoot, filePath)}`);
    }
    for (const filePath of result.rulesSync.results.skipped) {
        lines.push(`- SKIP ${normalizeRelative(effectiveRoot, filePath)}`);
    }

    if (result.postValidation) {
        lines.push(
            '',
            `Post validation: errors=${result.postValidation.summary.errors}, warnings=${result.postValidation.summary.warnings}, infos=${result.postValidation.summary.infos}`
        );
    }

    return lines.join('\n');
}

function main() {
    const options = parseArgs(process.argv);
    const result = bootstrapHost(options);

    if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
    }

    console.log(formatTextReport(result));
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

export { bootstrapHost, formatTextReport };
