---
name: coding-standards
description: Load the project coding standards and route Claude to the right rule document before writing, modifying, reviewing, or refactoring Java, Vue, SQL, API, or test-related artifacts. Use this skill only after the task has clearly entered an implementation activity such as code changes, database schema work, REST API design, automated tests, or test case document maintenance, even if the user does not explicitly mention "standards" or "规范".
---

# Coding Standards Router

Use this skill as the entry point for the repository engineering rules. Do not invent style rules from memory when the skill already has a matching standards document.

The authority source is this skill's private reference library under `references/`. This skill routes Claude to the right document inside the skill package.

Boundary note:
- This skill is **not** the entry point for project kickoff, requirements clarification, stage routing, project profile maintenance, or scaffold setup.
- If the user intent is to start a new project or determine the next project stage, route through `ai-project-manager` first.
- Load this skill only after the main entry has determined that the current round is performing implementation work.

Current scope note:
- The repository currently contains **9 active standards documents**: `01` to `09`.
- `10-testing.md` and `11-test-case-design.md` are **not currently present** under `references/`.
- For test-related work, first check whether those files have been added later; if not, do not pretend they exist.

## What to do

1. Identify the main task type before editing files.
2. Load only the 1-2 most relevant standards documents.
3. Apply the loaded rules while coding, reviewing, or rewriting.
4. If the task spans multiple areas, prioritize the primary implementation area first and then load one supporting document.
5. If no mapping is obvious, open `references/README.md` and choose the closest match.

## Routing table

| Task pattern | Load |
| --- | --- |
| Java class, method, field, DTO, VO, entity naming | `references/01-java-naming.md` |
| Java formatting, comments, whitespace, line breaks | `references/02-java-formatting.md` |
| Java OOP design, collections, concurrency | `references/03-java-oop.md` |
| Java exception handling, logging | `references/04-java-exception-log.md` |
| MySQL table creation, schema change, indexes | `references/05-mysql-table.md` |
| SQL writing, query optimization, MyBatis mapping | `references/06-mysql-sql-orm.md` |
| Vue 3 component, page, frontend interaction | `references/07-vue-frontend.md` |
| Layering, package structure, domain model, module boundaries | `references/08-engineering.md` |
| REST endpoint design, request or response schema, pagination | `references/09-api-design.md` |
| Swagger / OpenAPI annotation, @Operation, @Schema, @Tag, API doc | `references/09-api-design.md` |
| Unit tests, integration tests, automated test code | `Not currently available in references/; check before loading` |
| Test case document, acceptance matrix, regression case maintenance | `Not currently available in references/; check before loading` |

## Multi-area selection rules

Use at most 2 documents for one task unless the user explicitly asks for a broad standards audit.

Apply this priority order when multiple areas are involved:

1. Language or framework implementation rule
2. API or engineering structure rule
3. Testing or test-case rule

Use these combinations as defaults:

- Java service or controller refactor: `01-java-naming.md` or `03-java-oop.md`, plus `08-engineering.md` if structure changes
- Java exception or log cleanup: `04-java-exception-log.md`, plus `02-java-formatting.md` only if formatting is part of the task
- New table plus SQL changes: `05-mysql-table.md` and `06-mysql-sql-orm.md`
- REST API change with backend implementation: `09-api-design.md`, plus the main Java rule document that matches the implementation
- Vue page plus backend API integration: `07-vue-frontend.md`, plus `09-api-design.md` if the API contract also changes
- Feature delivery with tests: load the main implementation document first, then check whether `10-testing.md` exists before loading it
- Automated tests plus test case document update: first check whether `10-testing.md` and `11-test-case-design.md` exist; if not, do not route to missing files

## Operating rules

- Do not read all standards files at once.
- Do not cite generic best practices when a project-specific rule exists.
- Do not treat this router as the source of truth; the source of truth is the referenced document.
- If you need a full index inside this skill, start from `references/README.md`.
- Treat any duplicate copy under project `docs/` as a human-facing mirror, not the primary source for this skill.
- Do not route to `10-testing.md` or `11-test-case-design.md` unless those files actually exist in `references/`.

## Quick examples

Example: "Add a new Spring Boot API for device trace history and update the mapper SQL."
Load `09-api-design.md` and `06-mysql-sql-orm.md`. If the task also changes service layering, swap in or add `08-engineering.md` only when necessary.

Example: "Refactor this Vue page and keep the request and response fields consistent."
Load `07-vue-frontend.md`. If the task changes the backend contract, also load `09-api-design.md`.

Example: "补单测并补充测试用例文档。"
Check whether `10-testing.md` and `11-test-case-design.md` exist first. If they do not exist, fall back to the closest active standards file and explicitly note the gap.
