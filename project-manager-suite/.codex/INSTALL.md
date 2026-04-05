# Installing Project Manager Suite for Codex

通过 symlink 把 skills 挂载到 Codex 的技能目录，实现自动发现。

## Prerequisites

- Git

## Installation

1. **Clone the project-manager-suite repository:**
   ```bash
   git clone <your-repo-url> ~/.codex/project-manager-suite
   ```

2. **Create the skills symlink:**
   ```bash
   mkdir -p ~/.agents/skills
   ln -s ~/.codex/project-manager-suite/skills ~/.agents/skills/project-manager-suite
   ```

   **Windows (PowerShell):**
   ```powershell
   New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.agents\skills"
   cmd /c mklink /J "$env:USERPROFILE\.agents\skills\project-manager-suite" "$env:USERPROFILE\.codex\project-manager-suite\skills"
   ```

3. **Restart Codex** (quit and relaunch the CLI) to discover the skills.

## Verify

```bash
ls -la ~/.agents/skills/project-manager-suite
```

You should see a symlink pointing to your project-manager-suite skills directory.

## Tool Mapping

When skills reference Claude Code tools, substitute Codex equivalents:
- `TodoWrite` → `update_plan`
- `Task` with subagents → Codex subagent syntax
- `Skill` tool → Codex native skill tool
- `Read`, `Write`, `Edit`, `Bash` → Native tools

## Updating

```bash
cd ~/.codex/project-manager-suite && git pull
```

Skills update instantly through the symlink.

## Uninstalling

```bash
rm ~/.agents/skills/project-manager-suite
```

Optionally delete the clone: `rm -rf ~/.codex/project-manager-suite`.
