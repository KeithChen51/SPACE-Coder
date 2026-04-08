---
name: doc-governance
description: Audit and refactor rule documents, protocol documents, SKILL files, runbooks, and prompt-like governance files when the user asks where content should live, which file should be the single source of truth, whether multiple files overlap, or how to split, deduplicate, or add navigation across a documentation system. Use this skill whenever the task is about content layering, authority boundaries, duplicate rules, document drift, or "which file should own this rule", even if the user does not explicitly mention governance.
---

# Document Governance

Use this skill when the task is to govern a documentation or rule system rather than to execute the business workflow described by that system.

This skill helps Claude:

- decide which file should be the unique authority source for a rule
- identify overlap, drift, and misplaced content across multiple docs
- propose and apply Keep / Move / Delete / Navigate refactors
- add explicit authority-source statements and cross-file navigation
- optionally run a lightweight keyword and heading scan before editing

## When to use it

Load this skill when the user asks questions such as:

- "这几份文档是不是重复了"
- "这条规则到底该放哪一份"
- "帮我做 single source of truth"
- "这个 README / runtime / routing 太长了，怎么拆"
- "这些 skill 文档怎么分层"
- "帮我做文档治理 / 规则治理 / authority source 治理"

Do not use this skill as the execution source for the governed workflow itself. Once governance decisions are made, route back to the actual runtime / protocol / routing / implementation file and edit there.

## Operating model

1. Inventory the files in scope and their apparent roles.
2. Classify each file using the authority model in `references/authority-model.md`.
3. Mark overlap as one of:
   - legitimate navigation
   - boundary statement
   - duplicated rule
   - misplaced content
4. Produce an action matrix:
   - Keep here
   - Move to another authority file
   - Delete duplicated copy
   - Replace with navigation
5. If editing, update the authority file first, then replace secondary copies with short navigation statements.

## Default output format

When auditing, use this structure:

1. Findings
2. Proposed authority map
3. Action plan
4. Residual risks

When executing refactors, keep the output concise and grouped by:

- authority decision
- file edits
- remaining drift if any

## Editing rules

- Prefer one unique authority source per rule family.
- Secondary files may keep only:
  - a short boundary note
  - a short navigation note
  - a short summary that does not recreate the full rule
- If a rule change would require editing more than one file, stop and re-evaluate whether the authority boundary is wrong.
- If a file answers more than two distinct governance questions, split or downscope it.

## Use the reference

Read `references/authority-model.md` before proposing a refactor when the authority boundary is ambiguous.

## Use the script

Use `scripts/scan-authority-overlap.mjs` when:

- more than 2 files are in scope
- you suspect repeated keywords or headings across files
- you want a quick pre-edit scan before proposing moves

Default usage:

```bash
node project-manager-suite/skills/doc-governance/scripts/scan-authority-overlap.mjs \
  --files file-a.md,file-b.md,file-c.md \
  --patterns "docs/rules,S2 页面先行协议,project-status\\.md"
```

What the script does:

- reports repeated headings across the input files
- reports matching lines for the supplied patterns
- helps confirm whether overlap is real before editing

## Authority rule

If a rule could plausibly belong to multiple files, choose the file whose primary job is closest to the change. All other files should point to it instead of re-explaining it.
