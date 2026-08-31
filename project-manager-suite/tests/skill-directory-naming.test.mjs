import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSkillPath } from '../lib/skills-core.js';

const TEST_FILE_PATH = fileURLToPath(import.meta.url);
const SUITE_ROOT = path.resolve(path.dirname(TEST_FILE_PATH), '..');
const SKILLS_ROOT = path.join(SUITE_ROOT, 'skills');
const DIRECTORY_PATTERN = /^(?<prefix>\d{2}-\d{2})-(?<skillName>[a-z0-9]+(?:-[a-z0-9]+)*)$/;

function writeSkill(root, directory, skillName) {
    const skillDirectory = path.join(root, directory);
    fs.mkdirSync(skillDirectory, { recursive: true });
    fs.writeFileSync(path.join(skillDirectory, 'SKILL.md'), `---\nname: ${skillName}\n---\n`, 'utf8');
}

test('every top-level suite skill directory uses a unique NN-NN prefix and matches its skill name', () => {
    const directories = fs
        .readdirSync(SKILLS_ROOT, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();

    assert.ok(directories.length > 0, 'suite must contain at least one skill directory');

    const invalidDirectories = directories.filter((directory) => !DIRECTORY_PATTERN.test(directory));
    assert.deepEqual(
        invalidDirectories,
        [],
        `top-level suite skill directories must use NN-NN-kebab-case: ${invalidDirectories.join(', ')}`
    );

    const prefixes = directories.map((directory) => directory.match(DIRECTORY_PATTERN).groups.prefix);
    assert.equal(new Set(prefixes).size, prefixes.length, 'top-level suite skill prefixes must be unique');

    const skillNames = directories.map((directory) => directory.match(DIRECTORY_PATTERN).groups.skillName);
    assert.equal(new Set(skillNames).size, skillNames.length, 'top-level suite skill names must be unique');

    for (const directory of directories) {
        const { skillName } = directory.match(DIRECTORY_PATTERN).groups;
        const skillFile = path.join(SKILLS_ROOT, directory, 'SKILL.md');
        assert.ok(fs.existsSync(skillFile), `${directory} must contain SKILL.md`);

        const content = fs.readFileSync(skillFile, 'utf8');
        const frontmatterName = content.match(/^name:\s*([a-z0-9]+(?:-[a-z0-9]+)*)\s*$/m)?.[1];
        assert.ok(frontmatterName, `${directory}/SKILL.md must declare a kebab-case frontmatter name`);
        assert.equal(
            frontmatterName,
            skillName,
            `${directory} suffix must match SKILL.md frontmatter name`
        );

        const resolved = resolveSkillPath(frontmatterName, SKILLS_ROOT, null);
        assert.equal(resolved?.sourceType, 'project-manager-suite');
        assert.equal(resolved?.skillPath, directory, `${frontmatterName} must resolve to ${directory}`);
    }
});

test('suite resolution prefers the numbered skill while project overrides still prefer the bare name', () => {
    const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-suite-skill-resolution-'));
    const suiteSkillsRoot = path.join(testRoot, 'suite-skills');
    const projectSkillsRoot = path.join(testRoot, 'project-skills');

    writeSkill(suiteSkillsRoot, 'design-consultant', 'design-consultant');
    writeSkill(suiteSkillsRoot, '00-05-design-consultant', 'design-consultant');
    writeSkill(projectSkillsRoot, 'design-consultant', 'design-consultant');

    const suiteResolution = resolveSkillPath('design-consultant', suiteSkillsRoot, null);
    assert.equal(suiteResolution?.sourceType, 'project-manager-suite');
    assert.equal(suiteResolution?.skillPath, '00-05-design-consultant');

    const projectResolution = resolveSkillPath('design-consultant', suiteSkillsRoot, projectSkillsRoot);
    assert.equal(projectResolution?.sourceType, 'project');
    assert.equal(projectResolution?.skillPath, 'design-consultant');

    const forcedSuiteResolution = resolveSkillPath(
        'project-manager-suite:design-consultant',
        suiteSkillsRoot,
        projectSkillsRoot
    );
    assert.equal(forcedSuiteResolution?.sourceType, 'project-manager-suite');
    assert.equal(forcedSuiteResolution?.skillPath, '00-05-design-consultant');
});
