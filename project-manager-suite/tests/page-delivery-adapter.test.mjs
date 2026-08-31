import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import childProcess from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { buildLegacyPageDelivery } from '../skills/03-02-page-designer/scripts/page-delivery-adapter.mjs';

const TEST_FILE_PATH = fileURLToPath(import.meta.url);
const SUITE_ROOT = path.resolve(path.dirname(TEST_FILE_PATH), '..');

function makeTempDir(prefix = 'page-delivery-adapter-') {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(filePath, content) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function makeManifest(hostRoot, {
    status = 'confirmed',
    projectSlug = 'demo',
    startCommand = 'node -e "sentinel-start-command"',
    confirmationEvidence = '用户于浏览器预览后确认方向',
    techStackSource = 'suite defaults: tech-stack.md'
} = {}) {
    const projectRoot = path.join(hostRoot, 'frontend-app');
    const pageFile = path.join(projectRoot, 'src', 'pages', 'Home.tsx');
    const designSystemPath = path.join(hostRoot, 'design-system', 'DESIGN.md');
    const manifestPath = path.join(hostRoot, 'design-system', 'page-delivery.json');

    writeFile(path.join(hostRoot, 'docs', 'brd', 'BRD-demo-20260812-1200.md'), '# BRD: demo\n');
    writeFile(designSystemPath, '# Design System\n');
    writeFile(pageFile, 'export default function Home() { return null; }\n');
    writeFile(path.join(hostRoot, 'evidence', 'desktop.png'), 'desktop evidence');
    writeFile(path.join(hostRoot, 'evidence', 'mobile.png'), 'mobile evidence');
    writeFile(
        path.join(hostRoot, 'src', 'frontend', 'page-preview', 'page-ledger-demo.json'),
        JSON.stringify({
            schemaVersion: '2.0.0',
            slug: 'demo',
            brdFile: path.join(hostRoot, 'docs', 'brd', 'BRD-demo-20260812-1200.md'),
            screenshotAsked: true,
            phase: 3,
            loopRound: 0,
            gapFilesConsumed: []
        }, null, 2)
    );

    const manifest = {
        schemaVersion: '1.0.0',
        status,
        projectSlug,
        source: { type: 'brd', path: 'docs/brd/BRD-demo-20260812-1200.md' },
        designSystemPath: 'design-system/DESIGN.md',
        projectRoot: 'frontend-app',
        pages: [
            {
                id: 'home',
                title: '首页',
                route: '/',
                file: path.relative(projectRoot, pageFile).replaceAll(path.sep, '/')
            }
        ],
        preview: {
            startCommand,
            baseUrl: 'http://127.0.0.1:4173/',
            startedBy: 'user',
            verification: 'passed',
            evidence: [
                {
                    type: 'browser',
                    result: 'passed',
                    url: 'http://127.0.0.1:4173/',
                    viewport: '1440x900',
                    path: 'evidence/desktop.png',
                    note: '桌面浏览器预览通过'
                },
                {
                    type: 'browser',
                    result: 'passed',
                    url: 'http://127.0.0.1:4173/',
                    viewport: '390x844',
                    path: 'evidence/mobile.png',
                    note: '移动浏览器预览通过'
                }
            ]
        },
        mockScope: [
            { id: 'home-records', description: '首页列表使用前端 mock 数据', affects: ['home'] }
        ],
        compositionKitId: 'CK-demo-home-001',
        commitmentIds: ['home-keyboard-navigation', 'home-responsive-layout']
    };

    writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    return { hostRoot, manifest, manifestPath, pageFile, designSystemPath };
}

function buildOptions(fixture, overrides = {}) {
    return {
        manifest: fixture.manifest,
        hostRoot: fixture.hostRoot,
        manifestPath: fixture.manifestPath,
        confirmationEvidence: '用户于浏览器预览后确认方向',
        techStackSource: 'suite defaults: tech-stack.md',
        ...overrides
    };
}

test('rejects draft manifests before writing a legacy delivery', async () => {
    const fixture = makeManifest(makeTempDir(), { status: 'draft' });

    await assert.rejects(
        () => buildLegacyPageDelivery(buildOptions(fixture)),
        /confirmed/i
    );

    assert.equal(
        fs.existsSync(path.join(fixture.hostRoot, 'src', 'frontend', 'page-preview', 'page-delivery-demo.md')),
        false
    );
});

test('rejects empty confirmation evidence', async () => {
    const fixture = makeManifest(makeTempDir());

    await assert.rejects(
        () => buildLegacyPageDelivery(buildOptions(fixture, { confirmationEvidence: '   ' })),
        /confirmation/i
    );
});

test('rejects a manifest whose slug does not match the phase-3 ledger', async () => {
    const fixture = makeManifest(makeTempDir(), { projectSlug: 'other-project' });

    await assert.rejects(
        () => buildLegacyPageDelivery(buildOptions(fixture)),
        /slug/i
    );
});

test('requires the existing ledger to be phase 3 and screenshot question to be recorded', async () => {
    const phaseFixture = makeManifest(makeTempDir());
    const phaseLedger = path.join(phaseFixture.hostRoot, 'src', 'frontend', 'page-preview', 'page-ledger-demo.json');
    const ledger = readJson(phaseLedger);
    ledger.phase = 1;
    fs.writeFileSync(phaseLedger, JSON.stringify(ledger, null, 2));
    await assert.rejects(
        () => buildLegacyPageDelivery(buildOptions(phaseFixture)),
        /phase.*3/i
    );

    const askedFixture = makeManifest(makeTempDir());
    const askedLedger = path.join(askedFixture.hostRoot, 'src', 'frontend', 'page-preview', 'page-ledger-demo.json');
    const asked = readJson(askedLedger);
    asked.screenshotAsked = false;
    fs.writeFileSync(askedLedger, JSON.stringify(asked, null, 2));
    await assert.rejects(
        () => buildLegacyPageDelivery(buildOptions(askedFixture)),
        /screenshot/i
    );
});

test('renders a confirmed manifest into the legacy delivery contract without executing preview startCommand', async () => {
    const fixture = makeManifest(makeTempDir());
    let commandInvoked = false;
    const execFileSyncMock = mock.method(childProcess, 'execFileSync', () => {
        commandInvoked = true;
        throw new Error('startCommand must not execute');
    });

    try {
        const first = await buildLegacyPageDelivery(buildOptions(fixture));
        const second = await buildLegacyPageDelivery(buildOptions(fixture));
        const output = fs.readFileSync(first.outputPath, 'utf8');

        assert.equal(commandInvoked, false);
        assert.equal(first.slug, 'demo');
        assert.equal(first.outputPath, path.join(fixture.hostRoot, 'src', 'frontend', 'page-preview', 'page-delivery-demo.md'));
        assert.deepEqual(first.resolvedFiles, [path.resolve(fixture.pageFile)]);
        assert.equal(output, first.content);
        assert.equal(second.content, first.content, 'same input must render deterministic content');

        assert.match(output, /> Skill: page-designer \(design-consultant v0\.11 adapter\)/);
        assert.match(output, /> Project Slug: demo/);
        assert.match(output, /> Adapter Source: design-system\/page-delivery\.json/);
        assert.match(output, /> Manifest Status: confirmed/);
        assert.match(output, /> 页面方向确认: 已确认/);
        assert.match(output, /> 确认证据: 用户于浏览器预览后确认方向/);
        assert.match(output, /> 技术栈来源: suite defaults: tech-stack\.md/);
        assert.match(output, /\| 页面 \| 路由 \| 文件路径 \| 状态 \|/);
        assert.match(output, /Home|首页/);
        assert.match(output, /\/ \|/);
        assert.match(output, new RegExp(`\\| ${path.resolve(fixture.pageFile).replaceAll('\\', '\\\\')} \\|`));
        assert.match(output, /http:\/\/127\.0\.0\.1:4173\//);
        assert.match(output, /启动者: user/);
        assert.match(output, /验证状态: passed/);
        assert.match(output, /browser.*passed/s);
        assert.match(output, /home-records.*前端 mock/);
        assert.match(output, /设计系统路径: .*design-system[\\/]DESIGN\.md/);
        assert.match(output, /Composition Kit: CK-demo-home-001/);
        assert.match(output, /home-keyboard-navigation/);
        assert.match(output, /home-responsive-layout/);
        assert.match(output, /仅记录，不执行/);
        assert.equal(output.includes('sentinel-start-command'), true, 'startCommand should be recorded as data');
    } finally {
        execFileSyncMock.mock.restore();
    }
});

test('requires a real project design-system path and non-empty tech-stack source', async () => {
    const designFixture = makeManifest(makeTempDir());
    fs.unlinkSync(designFixture.designSystemPath);
    await assert.rejects(
        () => buildLegacyPageDelivery(buildOptions(designFixture)),
        /design[- ]system/i
    );

    const techFixture = makeManifest(makeTempDir());
    await assert.rejects(
        () => buildLegacyPageDelivery(buildOptions(techFixture, { techStackSource: '' })),
        /tech[- ]stack/i
    );
});

test('does not mutate the phase-3 ledger when writing the delivery', async () => {
    const fixture = makeManifest(makeTempDir());
    const ledgerPath = path.join(fixture.hostRoot, 'src', 'frontend', 'page-preview', 'page-ledger-demo.json');
    const before = fs.readFileSync(ledgerPath, 'utf8');

    await buildLegacyPageDelivery(buildOptions(fixture));

    assert.equal(fs.readFileSync(ledgerPath, 'utf8'), before);
});

test('rejects absolute paths outside the host root for manifest, project, design system, and page files', async () => {
    const hostRoot = makeTempDir();
    const outsideRoot = makeTempDir('page-delivery-outside-');
    const fixture = makeManifest(hostRoot);
    const outsideManifestPath = path.join(outsideRoot, 'page-delivery.json');
    const outsideProjectRoot = path.join(outsideRoot, 'frontend-app');
    const outsidePageFile = path.join(outsideProjectRoot, 'src', 'pages', 'Home.tsx');
    const outsideDesignSystem = path.join(outsideRoot, 'DESIGN.md');
    writeFile(outsideManifestPath, JSON.stringify(fixture.manifest, null, 2));
    writeFile(outsidePageFile, 'export default function Home() { return null; }\n');
    writeFile(outsideDesignSystem, '# Outside\n');

    await assert.rejects(
        () => buildLegacyPageDelivery(buildOptions(fixture, { manifestPath: outsideManifestPath })),
        /manifest path.*host root|escapes host root/i
    );

    const projectFixture = makeManifest(makeTempDir());
    projectFixture.manifest.projectRoot = outsideProjectRoot;
    projectFixture.manifest.pages[0].file = 'src/pages/Home.tsx';
    await assert.rejects(
        () => buildLegacyPageDelivery(buildOptions(projectFixture)),
        /projectRoot.*host root|escapes host root/i
    );

    const designFixture = makeManifest(makeTempDir());
    designFixture.manifest.designSystemPath = outsideDesignSystem;
    await assert.rejects(
        () => buildLegacyPageDelivery(buildOptions(designFixture)),
        /design[- ]system.*host root|escapes host root/i
    );

    const pageFixture = makeManifest(makeTempDir());
    pageFixture.manifest.pages[0].file = outsidePageFile;
    await assert.rejects(
        () => buildLegacyPageDelivery(buildOptions(pageFixture)),
        /page file.*host root|escapes host root/i
    );
});

test('rejects parent traversal and missing or outside local preview evidence paths', async () => {
    const traversalFixture = makeManifest(makeTempDir());
    traversalFixture.manifest.projectRoot = '../outside-project';
    await assert.rejects(
        () => buildLegacyPageDelivery(buildOptions(traversalFixture)),
        /projectRoot.*parent traversal|must not contain \.\.|escapes host root/i
    );

    const missingEvidenceFixture = makeManifest(makeTempDir());
    missingEvidenceFixture.manifest.preview.evidence[0].path = 'evidence/missing.png';
    await assert.rejects(
        () => buildLegacyPageDelivery(buildOptions(missingEvidenceFixture)),
        /preview evidence path.*does not exist|missing.*evidence/i
    );

    const outsideEvidenceFixture = makeManifest(makeTempDir());
    const outsideEvidence = path.join(makeTempDir('page-delivery-outside-evidence-'), 'desktop.png');
    writeFile(outsideEvidence, 'outside evidence');
    outsideEvidenceFixture.manifest.preview.evidence[0].path = outsideEvidence;
    await assert.rejects(
        () => buildLegacyPageDelivery(buildOptions(outsideEvidenceFixture)),
        /preview evidence path.*host root|escapes host root/i
    );
});

test('rejects symlink escapes when the platform permits symlink creation', async (t) => {
    const hostRoot = makeTempDir();
    const outsideRoot = makeTempDir('page-delivery-symlink-outside-');
    const fixture = makeManifest(hostRoot);
    const outsidePage = path.join(outsideRoot, 'Home.tsx');
    const linkedPage = path.join(hostRoot, 'frontend-app', 'src', 'pages', 'Home.tsx');
    writeFile(outsidePage, 'export default function Home() { return null; }\n');

    try {
        fs.unlinkSync(linkedPage);
        fs.symlinkSync(outsidePage, linkedPage, 'file');
    } catch (error) {
        t.skip(`symlink creation unavailable on this platform: ${error.code ?? error.message}`);
        return;
    }

    await assert.rejects(
        () => buildLegacyPageDelivery(buildOptions(fixture)),
        /page file.*host root|symlink|escapes host root/i
    );
});

test('normalizes hostile strings and keeps one parseable safe machine-metadata comment', async () => {
    const fixture = makeManifest(makeTempDir(), {
        startCommand: 'npm run dev\n## injected <script>alert(1)</script> <!-- hostile -->'
    });
    const hostile = 'Title\n## injected | `ticks` <script>alert(1)</script> <!-- hostile -->';
    fixture.manifest.pages[0].title = hostile;
    fixture.manifest.pages[0].route = '/home|`ticks`<script>';
    fixture.manifest.preview.evidence[0].note = hostile;
    fixture.manifest.mockScope[0].description = hostile;
    fixture.manifest.commitmentIds = ['commitment|`ticks`<script>'];

    const result = await buildLegacyPageDelivery(buildOptions(fixture, {
        confirmationEvidence: hostile,
        techStackSource: hostile
    }));
    const output = result.content;
    const comments = output.match(/<!--[\s\S]*?-->/g) ?? [];

    assert.equal(comments.length, 1, 'hostile data must not add or close HTML comments');
    const metadataMatch = comments[0].match(/^<!-- page-delivery-adapter:v0\.11;base64:([A-Za-z0-9+/=]+) -->$/);
    assert.ok(metadataMatch, 'machine metadata must use the documented base64 record format');
    const metadata = JSON.parse(Buffer.from(metadataMatch[1], 'base64').toString('utf8'));
    assert.equal(metadata.adapterVersion, '0.11.0');
    assert.equal(metadata.confirmationEvidence, hostile.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim());

    assert.doesNotMatch(output, /^## injected$/m);
    assert.equal(output.includes('<script>'), false);
    assert.equal(output.includes('<!-- hostile -->'), false);
    assert.equal(output.includes('-->'), true, 'the static comment terminator remains present');
    assert.equal(output.includes('\\|'), true);
    assert.equal(output.includes('\\`'), true);
    assert.match(output, /&lt;script&gt;/);
});
