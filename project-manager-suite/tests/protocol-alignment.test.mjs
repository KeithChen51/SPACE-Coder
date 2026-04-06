import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { checkProtocolAlignment } from '../tools/check-protocol-alignment.mjs';

function makeTempDir(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(targetPath, content) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, content, 'utf8');
}

function buildProtocolDoc(structuredFiles) {
    const fileLines = structuredFiles.map((item) => `  - \`${item}\``).join('\n');
    return `# 示例协议

## 对应实现与执行入口

对应关系：

- 结构化实现：
${fileLines}
- 对应脚本：
  - \`tools/example.mjs\`
`;
}

function buildStructuredFile(ruleSources) {
    const sourceLines = ruleSources.map((item) => ` * - ${item}`).join('\n');
    return `/**
 * Traceability:
 * Rule sources:
${sourceLines}
 * Consumed by:
 * - tools/example.mjs
 */
export const example = true;
`;
}

test('check-protocol-alignment passes on the current suite', () => {
    const suiteRoot = path.resolve(process.cwd());
    const result = checkProtocolAlignment({ suiteRoot });

    assert.equal(result.summary.errors, 0);
});

test('check-protocol-alignment detects missing reverse link in a synthetic fixture', () => {
    const suiteRoot = makeTempDir('pm-suite-alignment-');
    const docPath = 'skills/ai-project-manager/references/core/runtime.md';
    const structuredPath = 'lib/ai-pm-protocol/stages.js';

    writeFile(path.join(suiteRoot, docPath), buildProtocolDoc([structuredPath]));
    writeFile(
        path.join(suiteRoot, 'skills/ai-project-manager/SKILL.md'),
        buildProtocolDoc(['lib/ai-pm-protocol/bootstrap.js'])
    );
    writeFile(
        path.join(suiteRoot, 'skills/ai-project-manager/references/core/global-files-protocol.md'),
        buildProtocolDoc(['lib/ai-pm-protocol/field-contracts.js'])
    );
    writeFile(
        path.join(suiteRoot, 'skills/ai-project-manager/references/core/routing.md'),
        buildProtocolDoc(['lib/ai-pm-protocol/routing.js'])
    );

    writeFile(path.join(suiteRoot, structuredPath), buildStructuredFile(['skills/ai-project-manager/references/core/routing.md']));
    writeFile(
        path.join(suiteRoot, 'lib/ai-pm-protocol/bootstrap.js'),
        buildStructuredFile(['skills/ai-project-manager/SKILL.md'])
    );
    writeFile(
        path.join(suiteRoot, 'lib/ai-pm-protocol/field-contracts.js'),
        buildStructuredFile(['skills/ai-project-manager/references/core/global-files-protocol.md'])
    );
    writeFile(
        path.join(suiteRoot, 'lib/ai-pm-protocol/routing.js'),
        buildStructuredFile(['skills/ai-project-manager/references/core/routing.md'])
    );

    const result = checkProtocolAlignment({ suiteRoot });

    assert.ok(result.summary.errors > 0);
    assert.ok(result.issues.some((item) => item.code === 'missing_reverse_link'));
});
