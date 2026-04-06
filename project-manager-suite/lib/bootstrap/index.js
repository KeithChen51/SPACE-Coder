/**
 * Traceability:
 * Rule sources:
 * - skills/ai-project-manager/SKILL.md
 * - lib/ai-pm-protocol/bootstrap.js
 * Platform adapters:
 * - hooks/session-start
 * - .opencode/plugins/project-manager-suite.js
 */
import fs from 'fs';
import path from 'path';
import { extractAndStripFrontmatter } from '../skills-core.js';

function getAiProjectManagerSkillPath(suiteRoot) {
    return path.join(suiteRoot, 'skills', 'ai-project-manager', 'SKILL.md');
}

function readAiProjectManagerSkillBody(suiteRoot) {
    const skillPath = getAiProjectManagerSkillPath(suiteRoot);
    if (!fs.existsSync(skillPath)) {
        return null;
    }

    const fullContent = fs.readFileSync(skillPath, 'utf8');
    const { content } = extractAndStripFrontmatter(fullContent);
    return content.trim();
}

function buildCoreBootstrap({ suiteRoot, introText, extraText = '' }) {
    const skillBody = readAiProjectManagerSkillBody(suiteRoot);
    if (!skillBody) {
        return null;
    }

    const chunks = [
        '你已加载项目经理套件。',
        '',
        introText,
        '',
        skillBody
    ];

    if (extraText) {
        chunks.push('', extraText);
    }

    return `<EXTREMELY_IMPORTANT>\n${chunks.join('\n')}\n</EXTREMELY_IMPORTANT>`;
}

function buildClaudeHookBootstrap(suiteRoot) {
    return buildCoreBootstrap({
        suiteRoot,
        introText: '**以下是 ai-project-manager skill 的核心正文，作为项目域默认第一入口。**'
    });
}

function buildClaudeHookPayload(suiteRoot) {
    const bootstrap = buildClaudeHookBootstrap(suiteRoot);
    if (!bootstrap) {
        return {
            additional_context: '',
            hookSpecificOutput: {
                hookEventName: 'SessionStart',
                additionalContext: ''
            }
        };
    }

    return {
        additional_context: bootstrap,
        hookSpecificOutput: {
            hookEventName: 'SessionStart',
            additionalContext: bootstrap
        }
    };
}

function buildOpenCodeToolMapping(configDir) {
    return `**Tool Mapping for OpenCode:**
When skills reference tools you don't have, substitute OpenCode equivalents:
- \`TodoWrite\` → \`update_plan\`
- \`Task\` tool with subagents → Use OpenCode's subagent system (@mention)
- \`Skill\` tool → OpenCode's native \`skill\` tool
- \`Read\`, \`Write\`, \`Edit\`, \`Bash\` → Your native tools

**Skills location:**
Project Manager Suite skills are in \`${configDir}/skills/project-manager-suite/\`
Use OpenCode's native \`skill\` tool to list and load skills.`;
}

function buildOpenCodeBootstrap({ suiteRoot, configDir }) {
    return buildCoreBootstrap({
        suiteRoot,
        introText:
            '**以下是 ai-project-manager skill 的核心正文，作为项目域默认第一入口。该 skill 已自动加载，无需再次手动加载。**',
        extraText: buildOpenCodeToolMapping(configDir)
    });
}

export {
    getAiProjectManagerSkillPath,
    readAiProjectManagerSkillBody,
    buildCoreBootstrap,
    buildClaudeHookBootstrap,
    buildClaudeHookPayload,
    buildOpenCodeToolMapping,
    buildOpenCodeBootstrap
};
