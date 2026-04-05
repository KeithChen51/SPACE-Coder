# Installing Project Manager Suite for OpenCode

## Prerequisites

- [OpenCode.ai](https://opencode.ai) installed
- Git installed

## Installation Steps

### 1. Clone project-manager-suite

```bash
git clone <your-repo-url> ~/.config/opencode/project-manager-suite
```

### 2. Register the Plugin

Create a symlink so OpenCode discovers the plugin:

```bash
mkdir -p ~/.config/opencode/plugins
rm -f ~/.config/opencode/plugins/project-manager-suite.js
ln -s ~/.config/opencode/project-manager-suite/.opencode/plugins/project-manager-suite.js ~/.config/opencode/plugins/project-manager-suite.js
```

### 3. Symlink Skills

Create a symlink so OpenCode's native skill tool discovers project-manager-suite skills:

```bash
mkdir -p ~/.config/opencode/skills
rm -rf ~/.config/opencode/skills/project-manager-suite
ln -s ~/.config/opencode/project-manager-suite/skills ~/.config/opencode/skills/project-manager-suite
```

### 4. Restart OpenCode

Restart OpenCode. The plugin will automatically inject project manager context.

## Usage

### Loading the Skill

Use OpenCode's native `skill` tool:

```
use skill tool to load project-manager-suite/ai-project-manager
```

### Project Skills

Create project-specific skills in `.opencode/skills/` within your project.

**Skill Priority:** Project skills > Personal skills > Plugin skills

## Tool Mapping

When skills reference Claude Code tools:
- `TodoWrite` → `update_plan`
- `Task` with subagents → `@mention` syntax
- `Skill` tool → OpenCode's native `skill` tool
- File operations → your native tools

## Updating

```bash
cd ~/.config/opencode/project-manager-suite && git pull
```

## Troubleshooting

### Plugin not loading

1. Check plugin symlink: `ls -l ~/.config/opencode/plugins/project-manager-suite.js`
2. Check source exists: `ls ~/.config/opencode/project-manager-suite/.opencode/plugins/project-manager-suite.js`
3. Check OpenCode logs for errors

### Skills not found

1. Check skills symlink: `ls -l ~/.config/opencode/skills/project-manager-suite`
2. Verify it points to: `~/.config/opencode/project-manager-suite/skills`
3. Use `skill` tool to list what's discovered

## Uninstalling

```bash
rm ~/.config/opencode/plugins/project-manager-suite.js
rm -rf ~/.config/opencode/skills/project-manager-suite
rm -rf ~/.config/opencode/project-manager-suite
```
