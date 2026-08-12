import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_FILE_PATH = fileURLToPath(import.meta.url);
const SUITE_ROOT = path.resolve(path.dirname(TEST_FILE_PATH), '..');
const PACKAGE_ROOT = path.join(SUITE_ROOT, 'skills', 'design-consultant');
const LOCK_PATH = path.join(
    SUITE_ROOT,
    'skills',
    '03-02-page-designer',
    'references',
    'design-consultant-lock.json'
);
const EXPECTED_RELEASE_MANIFEST_SHA256 =
    'f3c99b18370308047cc0a86572ccbc991a74fe475125fd74fc89985efe10d675';
const EXPECTED_SOURCE_COMMIT = '0f9c9f5dbe3aca26513be1466f8a4fea5cf1eb3f';
const EXPECTED_RELEASE_FILE_COUNT = 167;
const EXPECTED_RELEASE_BYTES = 5431127;
const EXPECTED_CONSUMER_FAMILIES = new Set([
    'consumer-navigation',
    'discovery-card',
    'media-gallery',
    'price-summary',
    'rating-summary',
    'step-progress'
]);

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function listFiles(root) {
    if (!fs.existsSync(root)) return [];
    const files = [];
    const visit = (current) => {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const absolute = path.join(current, entry.name);
            if (entry.isDirectory()) visit(absolute);
            else files.push(absolute);
        }
    };
    visit(root);
    return files;
}

test('v0.11 suite package is locked to the finalized upstream release', () => {
    assert.ok(fs.existsSync(LOCK_PATH), `missing package lock: ${LOCK_PATH}`);
    const lock = readJson(LOCK_PATH);

    assert.equal(lock.schemaVersion, 1);
    assert.equal(lock.skill, 'design-consultant');
    assert.equal(lock.version, '0.11.0');
    assert.equal(lock.sourceRepository, 'KeithChen51/universal-design-components-and-skills');
    assert.ok(/^[0-9a-f]{40}$/.test(lock.sourceCommit));
    assert.equal(lock.sourceCommit, EXPECTED_SOURCE_COMMIT);
    assert.ok(/^[0-9a-f]{64}$/.test(lock.releaseManifestSha256));
    assert.equal(lock.releaseManifestSha256, EXPECTED_RELEASE_MANIFEST_SHA256);
    assert.equal(lock.importedPath, 'project-manager-suite/skills/design-consultant');
    assert.equal(lock.fileCount, EXPECTED_RELEASE_FILE_COUNT);
    assert.ok(Array.isArray(lock.files), 'lock must include the release digest map');
    assert.equal(lock.files.length, lock.fileCount);
    assert.deepEqual(
        lock.files.map((entry) => entry.path),
        [...lock.files].map((entry) => entry.path).sort()
    );
    assert.equal(new Set(lock.files.map((entry) => entry.path)).size, lock.files.length);

    const manifestMetadata = lock.releaseManifest;
    assert.ok(manifestMetadata && typeof manifestMetadata === 'object');
    const embeddedManifest = {
        schemaVersion: manifestMetadata.schemaVersion,
        skill: manifestMetadata.skill,
        source: manifestMetadata.source,
        output: manifestMetadata.output,
        generatedBy: manifestMetadata.generatedBy,
        policy: manifestMetadata.policy,
        files: lock.files,
        summary: manifestMetadata.summary
    };
    assert.equal(sha256(`${JSON.stringify(embeddedManifest, null, 2)}\n`), lock.releaseManifestSha256);
    assert.equal(embeddedManifest.summary.fileCount, lock.fileCount);
    assert.equal(embeddedManifest.summary.bytes, EXPECTED_RELEASE_BYTES);

    for (const relativePath of [
        'SKILL.md',
        'references/consumer-product-routing.md',
        'references/page-production-contract.md',
        'templates/consumer-product-manifest.json',
        'templates/page-delivery-manifest.schema.json',
        'scripts/page-delivery-contract.mjs'
    ]) {
        assert.ok(
            fs.existsSync(path.join(PACKAGE_ROOT, relativePath)),
            `missing release file: ${relativePath}`
        );
    }

    const packageFiles = listFiles(PACKAGE_ROOT);
    assert.equal(packageFiles.length, lock.fileCount);
    const actualPaths = packageFiles
        .map((filePath) => path.relative(PACKAGE_ROOT, filePath).replaceAll(path.sep, '/'))
        .sort();
    const expectedPaths = lock.files.map((entry) => entry.path).sort();
    assert.deepEqual(actualPaths, expectedPaths, 'imported package path set must match the checked-in release map');

    for (const entry of lock.files) {
        const relativePath = entry.path.replaceAll('/', path.sep);
        const filePath = path.join(PACKAGE_ROOT, relativePath);
        const bytes = fs.readFileSync(filePath);
        assert.equal(bytes.byteLength, entry.bytes, `${entry.path} byte length drifted`);
        assert.equal(sha256(bytes), entry.sha256, `${entry.path} SHA-256 drifted`);
    }

    const forbiddenPath = /(^|[\\/])evals?([\\/]|$)|(^|[\\/])review\.html$|benchmark|grading\.json|(^|[\\/])raw([\\/]|$)|design-consultant-s2-upgrade|page-ledger|page-chief|route[-_]?target|route[-_]?state|ai-project-manager/i;
    const forbiddenFiles = packageFiles
        .map((filePath) => path.relative(PACKAGE_ROOT, filePath).replaceAll(path.sep, '/'))
        .filter((relativePath) => forbiddenPath.test(relativePath));
    assert.deepEqual(forbiddenFiles, [], `release contains forbidden artifacts: ${forbiddenFiles.join(', ')}`);

    const componentManifest = readJson(path.join(PACKAGE_ROOT, 'templates', 'component-manifest.json'));
    const consumerFamilies = componentManifest.families.filter(
        (family) => family.optional_module === 'consumer-product'
    );
    assert.equal(consumerFamilies.length, EXPECTED_CONSUMER_FAMILIES.size);
    assert.deepEqual(
        new Set(consumerFamilies.map((family) => family.id)),
        EXPECTED_CONSUMER_FAMILIES
    );
    for (const family of consumerFamilies) {
        assert.equal(family.availability, 'contract-only', `${family.id} must remain contract-only`);
        assert.ok(
            typeof family.adoption_boundary === 'string' && family.adoption_boundary.trim(),
            `${family.id} must declare a non-empty adapter boundary`
        );
    }
});
