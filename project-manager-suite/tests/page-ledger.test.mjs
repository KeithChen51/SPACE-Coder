import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TEST_FILE_PATH = fileURLToPath(import.meta.url);
const SUITE_ROOT = path.resolve(path.dirname(TEST_FILE_PATH), '..');
const PAGE_DESIGNER_SCRIPTS_DIR = path.join(SUITE_ROOT, 'skills', 'page-designer', 'scripts');

function makeTempDir(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(targetPath, content) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, content, 'utf8');
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function runCli(scriptName, ...args) {
    const scriptPath = path.join(PAGE_DESIGNER_SCRIPTS_DIR, scriptName);
    const stdout = execFileSync('node', [scriptPath, ...args], {
        cwd: SUITE_ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
    });
    return JSON.parse(stdout);
}

function runCliExpectFailure(scriptName, ...args) {
    const scriptPath = path.join(PAGE_DESIGNER_SCRIPTS_DIR, scriptName);
    try {
        execFileSync('node', [scriptPath, ...args], {
            cwd: SUITE_ROOT,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe']
        });
        assert.fail(`expected ${scriptName} to fail`);
    } catch (error) {
        if (error.stdout) {
            try {
                return JSON.parse(error.stdout);
            } catch {}
        }
        if (error.stderr) {
            try {
                return JSON.parse(error.stderr);
            } catch {}
        }
        throw error;
    }
}

function createHostWithBrd({
    slug = 'demo-project',
    timestamp = '20260416-0900',
    includeRootFallback = false
} = {}) {
    const hostRoot = makeTempDir('page-ledger-host-');
    const brdFilename = `BRD-${slug}-${timestamp}.md`;
    const brdPath = includeRootFallback
        ? path.join(hostRoot, brdFilename)
        : path.join(hostRoot, 'docs', 'brd', brdFilename);

    writeFile(
        brdPath,
        `# BRD\n\n- 项目名称：演示项目\n- 是否包含 C 端页面：是\n- slug：${slug}\n`
    );

    return { hostRoot, brdPath, slug };
}

function writeEntities(hostRoot, slug) {
    writeFile(
        path.join(hostRoot, 'page-preview', `page-spec-entities-${slug}.md`),
        '# Entities\n'
    );
}

function writeDelivery(hostRoot, slug) {
    writeFile(
        path.join(hostRoot, 'page-preview', `page-delivery-${slug}.md`),
        '# Delivery\n\n- 文件路径：/abs/path/demo\n'
    );
}

test('status returns exists false when ledger is absent', () => {
    const hostRoot = makeTempDir('page-ledger-empty-');
    const result = runCli('page-ledger-query.mjs', 'status', '--host-dir', hostRoot);

    assert.deepEqual(result, { exists: false });
});

test('boot creates a new ledger and screenshot directory from docs/brd input', () => {
    const { hostRoot, brdPath, slug } = createHostWithBrd();

    const result = runCli('page-ledger-mutate.mjs', 'boot', '--host-dir', hostRoot);

    assert.equal(result.action, 'created');
    assert.equal(result.phase, 0);
    assert.equal(result.path, null);
    assert.equal(result.loopRound, 0);
    assert.equal(result.screenshotAsked, false);
    assert.equal(result.brdFile, brdPath);

    const ledgerPath = path.join(hostRoot, 'page-preview', `page-ledger-${slug}.json`);
    const screenshotDir = path.join(hostRoot, 'page-preview', 'screenshots');
    const ledger = readJson(ledgerPath);

    assert.equal(result.ledgerPath, ledgerPath);
    assert.equal(ledger.slug, slug);
    assert.equal(ledger.phase, 0);
    assert.equal(ledger.path, null);
    assert.equal(ledger.screenshotDir, screenshotDir);
    assert.equal(fs.existsSync(screenshotDir), true);
});

test('boot resumes an existing ledger instead of creating a new one', () => {
    const { hostRoot } = createHostWithBrd();

    runCli('page-ledger-mutate.mjs', 'boot', '--host-dir', hostRoot);
    const resumed = runCli('page-ledger-mutate.mjs', 'boot', '--host-dir', hostRoot);

    assert.equal(resumed.action, 'resumed');
    assert.equal(resumed.phase, 0);
});

test('set-path is idempotent but rejects changing to a different path', () => {
    const { hostRoot } = createHostWithBrd();

    runCli('page-ledger-mutate.mjs', 'boot', '--host-dir', hostRoot);
    runCli('page-ledger-mutate.mjs', 'set-path', '--host-dir', hostRoot, '--path', 'C+B');
    const second = runCli('page-ledger-mutate.mjs', 'set-path', '--host-dir', hostRoot, '--path', 'C+B');
    const failure = runCliExpectFailure(
        'page-ledger-mutate.mjs',
        'set-path',
        '--host-dir',
        hostRoot,
        '--path',
        '纯B'
    );

    assert.equal(second.path, 'C+B');
    assert.equal(failure.error, 'path_locked');
});

test('advance to phase 1 requires path and screenshotAsked first', () => {
    const { hostRoot } = createHostWithBrd();

    runCli('page-ledger-mutate.mjs', 'boot', '--host-dir', hostRoot);
    const failure = runCliExpectFailure(
        'page-ledger-mutate.mjs',
        'advance',
        '--host-dir',
        hostRoot,
        '--to',
        '1'
    );

    assert.equal(failure.error, 'precondition_failed');
});

test('can-advance explains why phase 1 cannot be entered yet', () => {
    const { hostRoot } = createHostWithBrd();

    runCli('page-ledger-mutate.mjs', 'boot', '--host-dir', hostRoot);
    const result = runCli('page-ledger-query.mjs', 'can-advance', '--host-dir', hostRoot, '--to', '1');

    assert.equal(result.canAdvance, false);
    assert.match(result.reason, /path/i);
});

test('C+B flow can advance through delivery and then start a loop', () => {
    const { hostRoot, slug } = createHostWithBrd();

    runCli('page-ledger-mutate.mjs', 'boot', '--host-dir', hostRoot);
    runCli('page-ledger-mutate.mjs', 'set-path', '--host-dir', hostRoot, '--path', 'C+B');
    runCli('page-ledger-mutate.mjs', 'mark-asked', '--host-dir', hostRoot, '--field', 'screenshot');
    runCli('page-ledger-mutate.mjs', 'advance', '--host-dir', hostRoot, '--to', '1');
    runCli('page-ledger-mutate.mjs', 'advance', '--host-dir', hostRoot, '--to', '3');

    const phase4Failure = runCliExpectFailure(
        'page-ledger-mutate.mjs',
        'advance',
        '--host-dir',
        hostRoot,
        '--to',
        '4'
    );
    assert.equal(phase4Failure.error, 'precondition_failed');

    writeEntities(hostRoot, slug);
    runCli('page-ledger-mutate.mjs', 'advance', '--host-dir', hostRoot, '--to', '4');
    runCli('page-ledger-mutate.mjs', 'advance', '--host-dir', hostRoot, '--to', '5');

    const phase6Failure = runCliExpectFailure(
        'page-ledger-mutate.mjs',
        'advance',
        '--host-dir',
        hostRoot,
        '--to',
        '6'
    );
    assert.equal(phase6Failure.error, 'precondition_failed');

    writeDelivery(hostRoot, slug);
    runCli('page-ledger-mutate.mjs', 'advance', '--host-dir', hostRoot, '--to', '6');

    const loop = runCli(
        'page-ledger-mutate.mjs',
        'start-loop',
        '--host-dir',
        hostRoot,
        '--gap-files',
        `${path.join(hostRoot, 'page-preview', `explainer-c-gap-${slug}.md`)},${path.join(hostRoot, 'page-preview', `explainer-b-gap-${slug}.md`)}`
    );

    assert.equal(loop.phase, 1);
    assert.equal(loop.loopRound, 1);

    const ledger = readJson(path.join(hostRoot, 'page-preview', `page-ledger-${slug}.json`));
    assert.equal(ledger.phase, 1);
    assert.equal(ledger.loopRound, 1);
    assert.equal(ledger.path, 'C+B');
    assert.equal(ledger.gapFilesConsumed.length, 2);
});

test('pure B flow delivers at phase 4 and rejects premature loop start', () => {
    const { hostRoot, slug } = createHostWithBrd({ slug: 'ops-console' });

    runCli('page-ledger-mutate.mjs', 'boot', '--host-dir', hostRoot);
    runCli('page-ledger-mutate.mjs', 'set-path', '--host-dir', hostRoot, '--path', '纯B');
    runCli('page-ledger-mutate.mjs', 'mark-asked', '--host-dir', hostRoot, '--field', 'screenshot');
    runCli('page-ledger-mutate.mjs', 'advance', '--host-dir', hostRoot, '--to', '1');
    runCli('page-ledger-mutate.mjs', 'advance', '--host-dir', hostRoot, '--to', '3');

    const loopFailure = runCliExpectFailure(
        'page-ledger-mutate.mjs',
        'start-loop',
        '--host-dir',
        hostRoot,
        '--gap-files',
        path.join(hostRoot, 'page-preview', `explainer-b-gap-${slug}.md`)
    );
    assert.equal(loopFailure.error, 'invalid_loop_start');

    writeDelivery(hostRoot, slug);
    const delivered = runCli('page-ledger-mutate.mjs', 'advance', '--host-dir', hostRoot, '--to', '4');

    assert.equal(delivered.phase, 4);
});

test('page-designer and page-chief docs reference the ledger protocol', () => {
    const pageDesignerSkill = fs.readFileSync(path.join(SUITE_ROOT, 'skills', 'page-designer', 'SKILL.md'), 'utf8');
    const pageChiefSkill = fs.readFileSync(path.join(SUITE_ROOT, 'skills', 'page-chief', 'SKILL.md'), 'utf8');
    const pipeline = fs.readFileSync(path.join(SUITE_ROOT, 'PIPELINE.md'), 'utf8');

    assert.match(pageDesignerSkill, /page-ledger-mutate\.mjs boot/);
    assert.match(pageDesignerSkill, /page-ledger-query\.mjs status/);
    assert.match(pageDesignerSkill, /loopRound/);

    assert.match(pageChiefSkill, /page-ledger-query\.mjs status/);
    assert.match(pageChiefSkill, /loopRound/);
    assert.match(pageChiefSkill, /page-ledger-<slug>\.json/);

    assert.match(pipeline, /page-ledger-<slug>\.json/);
});
