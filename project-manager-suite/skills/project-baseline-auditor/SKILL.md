---
name: project-baseline-auditor
description: Use when an existing or half-built host codebase is being adopted into the suite, especially when maintainability is poor because project-profile, BRD, page explainer, foundation, or PRD files are missing or stale.
---

# Project Baseline Auditor

This skill diagnoses an existing codebase before normal suite work continues. It builds or updates the shared `project-profile.md`, then writes a focused maintenance-document gap list for the main router.

## Scope

Use this skill for:
- Existing code moved under a host project.
- A half-built or finished project that lacks maintainable structured files.
- A user asking what BRD / page explainer / foundation / PRD files are missing.

Do not use it for:
- Test cases, test execution, or acceptance plans.
- New development planning or pending implementation tasks.
- Replacing `brd-writer`, `page-explainer`, `foundation-builder`, or `prd-writer`.

## Required Command

Run the scanner first:

```bash
node <suite-path>/skills/project-baseline-auditor/scripts/collect-baseline-gaps.mjs <hostRoot> --json
```

The script writes:
- `<host>/project-profile.md`
- `<host>/docs/baseline/baseline-audit-<slug>.json`
- `<host>/docs/baseline/baseline-audit-<slug>.md`

## Profile Rules

- Use the same `project-profile.md` filename as `ai-project-manager`.
- Preserve existing `【用户确认】` values.
- Fill code-derived values as `【系统推断】`.
- Fill stage judgment fields as `【主入口回写】`.
- Do not guess fields that code cannot prove; put them in `待确认`.

## Single-Focus Interview

If startup minimum fields are still missing, ask exactly one question: the highest-blocking question from `profile.next_questions[0]`.

You may summarize all findings first, but only one user-answerable question is allowed in the turn. This follows the same single-focus principle used by `brd-writer`.

## Gap List Rules

The audit scope is maintenance docs only:
- `PROJECT_PROFILE`
- `BRD`
- `PAGE_EXPLAINER`
- `FOUNDATION`
- `PRD`

Allowed recommended skills:
- `brd-writer`
- `page-explainer`
- `foundation-builder`
- `prd-writer`

Never recommend:
- `delivery-planner`
- `test-case-chief`
- `test-case-writer`
- `test-case-reviewer`
- `test-case-runner`

## Handoff

After the audit, tell `ai-project-manager` to read `docs/baseline/baseline-audit-<slug>.json` and route only by its maintenance-document gap list. The audit is evidence, not a final BRD/PRD/foundation/page specification.
