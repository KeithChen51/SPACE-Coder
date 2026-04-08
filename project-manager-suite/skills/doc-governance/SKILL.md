---
name: doc-governance
description: Audit rule documents, protocol documents, SKILL files, runbooks, and prompt-like governance files when the user asks where content should live, which file should be the single source of truth, whether multiple files overlap, how to split or deduplicate them, or whether a single long file should add an index, reorder sections, or fold low-frequency detail. This skill is advisory only: it gives governance recommendations and does not directly edit the governed files.
---

# Document Governance

Use this skill when the task is to govern a documentation or rule system rather than to execute the business workflow described by that system.

This skill helps Claude:

- decide which file should be the unique authority source for a rule
- identify overlap, drift, and misplaced content across multiple docs
- propose Keep / Move / Delete / Navigate refactors
- propose explicit authority-source statements and cross-file navigation
- evaluate whether a single long document should add an index, reorder sections, use folds, or split by role
- optionally run a lightweight keyword and heading scan before proposing changes

## When to use it

Load this skill when the user asks questions such as:

- "这几份文档是不是重复了"
- "这条规则到底该放哪一份"
- "帮我做 single source of truth"
- "这个 README / runtime / routing 太长了，怎么拆"
- "这个文件太长了，要不要加目录索引"
- "这个文档怎么提高阅读效率"
- "这些 skill 文档怎么分层"
- "帮我做文档治理 / 规则治理 / authority source 治理"

Do not use this skill as the execution source for the governed workflow itself.

This skill is advisory only:

- it audits
- it classifies
- it proposes
- it does not directly edit the governed files

Once governance decisions are accepted, route back to the actual runtime / protocol / routing / implementation file and edit there.

## Operating model

1. Inventory the files in scope and their apparent roles.
2. Classify each file using the authority model in `references/authority-model.md`.
3. Mark overlap as one of:
   - legitimate navigation
   - boundary statement
   - duplicated rule
   - misplaced content
4. If the issue is single-file overload, classify it as one or more of:
   - missing reading index
   - poor section ordering
   - low-frequency detail blocking high-frequency reading
   - mixed audiences in one file
5. Produce an action matrix:
   - Keep here
   - Move to another authority file
   - Delete duplicated copy
   - Replace with navigation
   - Add index
   - Reorder sections
   - Fold low-frequency detail
   - Split only if single-file optimization is no longer enough

This skill stops at the proposal layer. It does not execute the file edits itself.

## Default output format

When auditing, use this structure:

1. Findings
2. Proposed authority map
3. Action plan
4. Residual risks

When the main issue is single-file overload, prefer this structure:

1. Reading pain points
2. Lowest-cost improvement
3. Recommended index or section order
4. Optional next step if the file keeps growing

## Proposal rules

- Prefer one unique authority source per rule family.
- Secondary files may keep only:
  - a short boundary note
  - a short navigation note
  - a short summary that does not recreate the full rule
- If a rule change would require editing more than one file, re-evaluate whether the authority boundary is wrong.
- If a file answers more than two distinct governance questions, split or downscope it.
- If a single file is long but still has one clear role, prefer `index + reorder + fold` before proposing a split.
- Only propose a split when single-file optimization is no longer enough to restore reading efficiency.
- Do not directly modify the governed files while using this skill; return recommendations only.

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
