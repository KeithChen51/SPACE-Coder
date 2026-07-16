import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'node:url';

import { syncSuiteVersion, parseChangelog, majorMinor } from '../tools/sync-suite-version.mjs';

const TEST_FILE_PATH = fileURLToPath(import.meta.url);
const SUITE_ROOT = path.resolve(path.dirname(TEST_FILE_PATH), '..');

function makeFixtureSuite({ readmeVersion = '2.0', packageVersion = '2.0.0' } = {}) {
    const suiteRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-suite-version-'));
    fs.writeFileSync(
        path.join(suiteRoot, 'CHANGELOG.md'),
        `# Changelog

## [Unreleased]

- 未发布的演示变更

## [2.0] - 2026-07-10

演示摘要段落。

- 细节一
`,
        'utf8'
    );
    fs.writeFileSync(
        path.join(suiteRoot, 'README.md'),
        `# Demo Suite

> **当前版本：${readmeVersion}**（2026-07-10）。变更摘要见 [版本历史](#版本历史)。

## 版本历史

<!-- version-history:begin -->
| 版本 | 日期 | 变更摘要 |
|------|------|---------|
| **2.0** | 2026-07-10 | 演示摘要段落。 |
<!-- version-history:end -->
`,
        'utf8'
    );
    fs.writeFileSync(
        path.join(suiteRoot, 'package.json'),
        `${JSON.stringify({ name: 'demo', version: packageVersion, private: true }, null, 2)}\n`,
        'utf8'
    );
    return suiteRoot;
}

// 这一条就是“稳定触发”的兜底门禁：真实仓库三处版本漂移时，npm run test:ai-pm 直接红
test('GATE: the real suite CHANGELOG / README / package.json versions are consistent', () => {
    const result = syncSuiteVersion({ suiteRoot: SUITE_ROOT, check: true });
    assert.equal(result.passed, true, result.errors.join('; '));
});

test('parseChangelog extracts unreleased and released entries with summaries', () => {
    const suiteRoot = makeFixtureSuite();
    const parsed = parseChangelog(fs.readFileSync(path.join(suiteRoot, 'CHANGELOG.md'), 'utf8'));
    assert.equal(parsed.unreleased.bullets.length, 1);
    assert.equal(parsed.latest.version, '2.0');
    assert.equal(parsed.latest.date, '2026-07-10');
    assert.equal(parsed.latest.summary, '演示摘要段落。');
});

test('check mode fails when README version drifts from CHANGELOG', () => {
    const suiteRoot = makeFixtureSuite({ readmeVersion: '1.9' });
    const result = syncSuiteVersion({ suiteRoot, check: true });
    assert.equal(result.passed, false);
});

test('check mode fails when package.json version drifts', () => {
    const suiteRoot = makeFixtureSuite({ packageVersion: '1.0.0' });
    const result = syncSuiteVersion({ suiteRoot, check: true });
    assert.equal(result.passed, false);
    assert.match(result.errors.join(' '), /package\.json/);
});

test('sync mode rewrites README and package.json from CHANGELOG', () => {
    const suiteRoot = makeFixtureSuite({ readmeVersion: '1.9', packageVersion: '1.0.0' });
    const result = syncSuiteVersion({ suiteRoot });
    assert.ok(result.actions.length >= 2, JSON.stringify(result.actions));

    const readme = fs.readFileSync(path.join(suiteRoot, 'README.md'), 'utf8');
    assert.match(readme, /当前版本：2\.0/);
    const pkg = JSON.parse(fs.readFileSync(path.join(suiteRoot, 'package.json'), 'utf8'));
    assert.equal(majorMinor(pkg.version), '2.0');

    const recheck = syncSuiteVersion({ suiteRoot, check: true });
    assert.equal(recheck.passed, true, recheck.errors.join('; '));
});

test('release mode freezes Unreleased into a dated version entry and syncs everything', () => {
    const suiteRoot = makeFixtureSuite();
    const result = syncSuiteVersion({ suiteRoot, release: '2.1' });
    assert.equal(result.latest.version, '2.1');

    const changelog = fs.readFileSync(path.join(suiteRoot, 'CHANGELOG.md'), 'utf8');
    assert.match(changelog, /## \[2\.1\] - \d{4}-\d{2}-\d{2}/);
    assert.match(changelog, /## \[Unreleased\]\n\n（暂无未发布变更）/);

    const readme = fs.readFileSync(path.join(suiteRoot, 'README.md'), 'utf8');
    assert.match(readme, /当前版本：2\.1/);
    assert.match(readme, /\| \*\*2\.1\*\* \|/);
    const pkg = JSON.parse(fs.readFileSync(path.join(suiteRoot, 'package.json'), 'utf8'));
    assert.equal(pkg.version, '2.1.0');

    const recheck = syncSuiteVersion({ suiteRoot, check: true });
    assert.equal(recheck.passed, true, recheck.errors.join('; '));
});

test('release mode refuses to release an empty Unreleased section', () => {
    const suiteRoot = makeFixtureSuite();
    syncSuiteVersion({ suiteRoot, release: '2.1' });
    assert.throws(() => syncSuiteVersion({ suiteRoot, release: '2.2' }), /没有任何变更条目|没有可发版/);
});
