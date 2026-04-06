#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const suiteRoot = path.resolve(__dirname, '..');
const manifestFileName = '.install-manifest.json';

const excludedNames = new Set([
    '.DS_Store',
    '.git',
    '__pycache__',
    manifestFileName,
    'coverage',
    'node_modules'
]);

function printUsage() {
    console.log(
        'Usage: node project-manager-suite/tools/install-suite-into-host.mjs <host-project-root> [--force] [--move] [--dry-run] [--json]'
    );
}

function parseArgs(argv) {
    const args = argv.slice(2);
    const options = {
        hostRoot: '',
        force: false,
        move: false,
        dryRun: false,
        json: false
    };

    for (const arg of args) {
        if (arg === '--force') {
            options.force = true;
            continue;
        }

        if (arg === '--move') {
            options.move = true;
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

        if (!options.hostRoot) {
            options.hostRoot = arg;
            continue;
        }

        throw new Error(`Unknown argument: ${arg}`);
    }

    if (!options.hostRoot) {
        throw new Error('Missing host project root.');
    }

    return options;
}

function normalizeRelative(root, target) {
    return path.relative(root, target).split(path.sep).join('/') || '.';
}

function safeExists(targetPath) {
    return fs.existsSync(targetPath);
}

function isSamePath(left, right) {
    return path.resolve(left) === path.resolve(right);
}

function isSubPath(parentPath, candidatePath) {
    const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
    return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function detectTargetState(targetRoot) {
    if (!safeExists(targetRoot)) {
        return 'absent';
    }

    const manifestPath = path.join(targetRoot, manifestFileName);
    const bootstrapPath = path.join(targetRoot, 'tools', 'bootstrap-host.mjs');
    const aiPmSkillPath = path.join(targetRoot, 'skills', 'ai-project-manager', 'SKILL.md');

    if (safeExists(manifestPath) || (safeExists(bootstrapPath) && safeExists(aiPmSkillPath))) {
        return 'installed_suite';
    }

    return 'occupied_unknown';
}

function shouldExcludeEntry(entryName) {
    if (excludedNames.has(entryName)) {
        return true;
    }

    return entryName.endsWith('.pyc');
}

function ensureDirectory(targetPath, options, result) {
    if (safeExists(targetPath)) {
        result.directories.reused.push(targetPath);
        return;
    }

    if (!options.dryRun) {
        fs.mkdirSync(targetPath, { recursive: true });
    }

    result.directories.created.push(targetPath);
}

function removeTargetDirectory(targetRoot, options, result) {
    if (!safeExists(targetRoot)) {
        return;
    }

    if (!options.dryRun) {
        fs.rmSync(targetRoot, { recursive: true, force: true });
    }

    result.target.cleaned = true;
}

function copyDirectoryRecursive(sourceDir, targetDir, options, result) {
    ensureDirectory(targetDir, options, result);

    const entries = fs.readdirSync(sourceDir, { withFileTypes: true }).sort((left, right) =>
        left.name.localeCompare(right.name)
    );

    for (const entry of entries) {
        if (shouldExcludeEntry(entry.name)) {
            result.files.skipped.push(path.join(targetDir, entry.name));
            continue;
        }

        const sourcePath = path.join(sourceDir, entry.name);
        const targetPath = path.join(targetDir, entry.name);

        if (entry.isDirectory()) {
            copyDirectoryRecursive(sourcePath, targetPath, options, result);
            continue;
        }

        if (!entry.isFile()) {
            result.files.skipped.push(targetPath);
            continue;
        }

        const exists = safeExists(targetPath);

        if (!options.dryRun) {
            fs.mkdirSync(path.dirname(targetPath), { recursive: true });
            fs.copyFileSync(sourcePath, targetPath);
        }

        if (exists) {
            result.files.overwritten.push(targetPath);
        } else {
            result.files.created.push(targetPath);
        }
    }
}

function buildManifestContent({ sourceSuiteRoot, targetSuiteRoot, installMode }) {
    return {
        install_mode: installMode,
        installed_at: new Date().toISOString(),
        source_suite_root: sourceSuiteRoot,
        target_suite_root: targetSuiteRoot,
        installed_by: 'tools/install-suite-into-host.mjs'
    };
}

function writeManifest(targetSuiteRoot, manifestContent, options, result) {
    const manifestPath = path.join(targetSuiteRoot, manifestFileName);
    const exists = safeExists(manifestPath);

    if (!options.dryRun) {
        fs.mkdirSync(targetSuiteRoot, { recursive: true });
        fs.writeFileSync(manifestPath, `${JSON.stringify(manifestContent, null, 2)}\n`, 'utf8');
    }

    if (exists) {
        result.files.overwritten.push(manifestPath);
    } else {
        result.files.created.push(manifestPath);
    }
}

function removeSourceSuite(options, result) {
    if (!options.move || options.dryRun || isSamePath(result.sourceSuiteRoot, result.targetSuiteRoot)) {
        return;
    }

    fs.rmSync(result.sourceSuiteRoot, { recursive: true, force: true });
    result.sourceRemoved = true;
}

function formatTextReport(result) {
    const lines = [
        `Host root: ${result.hostRoot}`,
        `Source suite: ${result.sourceSuiteRoot}`,
        `Target suite: ${result.targetSuiteRoot}`,
        `Install mode: ${result.installMode}`,
        `Target state: ${result.target.initialState}`,
        `Directories created: ${result.directories.created.length}`,
        `Files created: ${result.files.created.length}`,
        `Files overwritten: ${result.files.overwritten.length}`,
        `Files skipped: ${result.files.skipped.length}`
    ];

    if (result.installMode === 'already_installed') {
        lines.push('No changes were required because the suite is already running from the host path.');
        return lines.join('\n');
    }

    if (result.target.cleaned) {
        lines.push('Target directory was cleaned before installation.');
    }

    if (result.directories.created.length > 0) {
        lines.push('', 'Created directories:');
        for (const dirPath of result.directories.created) {
            lines.push(`- ${normalizeRelative(result.hostRoot, dirPath)}`);
        }
    }

    if (result.files.created.length > 0) {
        lines.push('', 'Created files:');
        for (const filePath of result.files.created) {
            lines.push(`- ${normalizeRelative(result.hostRoot, filePath)}`);
        }
    }

    if (result.files.overwritten.length > 0) {
        lines.push('', 'Overwritten files:');
        for (const filePath of result.files.overwritten) {
            lines.push(`- ${normalizeRelative(result.hostRoot, filePath)}`);
        }
    }

    if (result.moveSourceRequested) {
        lines.push('', 'Source suite removal was requested. After installation, future commands should use the host-installed suite path.');
    }

    if (result.sourceRemoved) {
        lines.push('Source suite directory was removed after installation.');
    }

    return lines.join('\n');
}

function installSuiteIntoHost({ hostRoot, force = false, move = false, dryRun = false, json = false }) {
    const resolvedHostRoot = path.resolve(process.cwd(), hostRoot);
    const targetAgentRoot = path.join(resolvedHostRoot, '.agent');
    const targetSuiteRoot = path.join(targetAgentRoot, 'project-manager-suite');

    if (!safeExists(resolvedHostRoot)) {
        throw new Error(`Host root does not exist: ${resolvedHostRoot}`);
    }

    if (isSubPath(suiteRoot, targetSuiteRoot) && !isSamePath(suiteRoot, targetSuiteRoot)) {
        throw new Error(`Target suite path cannot be nested inside the source suite: ${targetSuiteRoot}`);
    }

    const result = {
        hostRoot: resolvedHostRoot,
        sourceSuiteRoot: suiteRoot,
        targetSuiteRoot,
        installMode: 'install',
        moveSourceRequested: move,
        target: {
            initialState: detectTargetState(targetSuiteRoot),
            cleaned: false
        },
        directories: {
            created: [],
            reused: []
        },
        files: {
            created: [],
            overwritten: [],
            skipped: []
        },
        notes: [],
        sourceRemoved: false
    };

    if (isSamePath(suiteRoot, targetSuiteRoot)) {
        result.installMode = 'already_installed';
        result.notes.push('suite_already_running_from_host');
        return result;
    }

    if (result.target.initialState === 'occupied_unknown' && !force) {
        throw new Error(
            `Target path is occupied by an unknown directory: ${targetSuiteRoot}. Pass --force to replace it.`
        );
    }

    ensureDirectory(targetAgentRoot, { dryRun, json }, result);

    if (force && result.target.initialState !== 'absent') {
        removeTargetDirectory(targetSuiteRoot, { dryRun, json }, result);
        result.installMode = move ? 'move' : 'install';
        result.target.initialState = 'absent';
    } else if (result.target.initialState === 'installed_suite') {
        result.installMode = move ? 'move' : 'upgrade';
    } else {
        result.installMode = move ? 'move' : 'install';
    }

    copyDirectoryRecursive(suiteRoot, targetSuiteRoot, { dryRun, json }, result);

    writeManifest(
        targetSuiteRoot,
        buildManifestContent({
            sourceSuiteRoot: suiteRoot,
            targetSuiteRoot,
            installMode: result.installMode
        }),
        { dryRun, json },
        result
    );

    result.notes.push('future_commands_should_use_host_installed_suite');
    removeSourceSuite({ move, dryRun, json }, result);

    return result;
}

function main() {
    const options = parseArgs(process.argv);
    const result = installSuiteIntoHost(options);

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

export { installSuiteIntoHost, formatTextReport, detectTargetState };
