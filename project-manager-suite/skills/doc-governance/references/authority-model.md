# Authority Model

Use this model to decide which file should own a rule.

## Core principle

Each rule family should have one unique authority source.

Other files may keep only:

- a boundary note
- a navigation note
- a short summary that does not recreate the full rule

## File role taxonomy

### 1. Entry file

Typical contents:

- what this package or skill is
- when to use it
- when not to use it
- high-level red lines
- where to read detailed rules

Good examples:

- `SKILL.md`
- human-facing entry documents

Do not put here:

- full execution order
- field contracts
- scaffold implementation details

### 2. Runtime file

Typical contents:

- execution order
- decision flow
- stage gating
- handoff conditions
- runtime red flags

Good examples:

- `runtime.md`
- runbook-like execution protocols

Do not put here:

- detailed field schema ownership
- template creation policy details
- installation or scaffold directory specifics unless runtime truly owns them

### 3. Protocol file

Typical contents:

- field contracts
- read/write responsibility
- lifecycle of artifacts
- default writeback carrier
- template creation prerequisites

Good examples:

- `global-files-protocol.md`
- API or data contract docs

Do not put here:

- full runtime order
- routing target matrix

### 4. Routing or scaffold file

Typical contents:

- capability mapping
- target skill mapping
- directory scaffold
- host integration path
- install and bootstrap strategy

Good examples:

- `routing.md`
- scaffold or bootstrap rule docs

Do not put here:

- full stage execution rules
- repeated S2 or other stage-specific runtime workflows

### 5. Human overview file

Typical contents:

- product explanation
- reading index
- quick start
- reading path by audience

Good examples:

- `README.md`

Do not put here:

- deep protocol or runtime rules

## Anti-patterns

Treat these as governance smells:

- the same stage rule appears in 2 or more authority files
- the same file answers more than 2 role categories
- one change would require keeping 2 files in sync
- a routing file explains runtime order
- a runtime file explains scaffold installation strategy
- an entry file restates full protocol details

## Decision test

For any rule, ask:

1. If this rule changes, which file should be edited first?
2. Would a maintainer be surprised if that file owned the rule?
3. Does another file only need to point at it rather than restate it?

If question 1 has more than one answer, the boundary is still unclear.

## Refactor actions

Use these labels in proposals:

- `Keep`: content already belongs here
- `Move`: content belongs in another authority file
- `Delete`: duplicated copy with no value
- `Navigate`: replace with short pointer to authority file

## Recommended review order

1. Decide the file roles
2. Identify duplicated rule families
3. Choose one authority source per family
4. Edit authority file first
5. Replace secondary copies with navigation
6. Re-scan for residual overlap
