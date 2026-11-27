# 07 — Conventions

## Git

- **Default branch:** `main` (protected; PR + 1 approval + green CI).
- **Branch names:** `<type>/<taskId>-<short-slug>`, e.g. `feat/T1.2-ink-canvas`, `fix/T3.2-sign-flip`, `docs/T6.1-concepts`, `test/T7.3-e2e-typed`.
- **Commits:** Conventional Commits with the task ID as the scope:
  - `feat(T1.2): capture coalesced pointer events`
  - `fix(T3.2): treat ConditionSet as inconclusive`
  - `test(T5.2): add hostile LLM output fixtures`
  - `docs(T8.2): update tested-on table`
- **Small PRs:** aim for under 400 changed lines. Split large tasks.
- **Rebase, don't merge `main` into your branch.** Squash-merge PRs.
- **Never commit:** `.env`, model weights, `*.db`, `node_modules`, uploads, large videos (link them instead).

## Pull requests

PR title: `[T1.2] Ink canvas with pointer events`. The template includes:

```markdown
## Task
T1.2 — Ink canvas (docs/plan/phase-1-notebook.md#t12)

## What changed
-

## Tests
- [ ] unit  - [ ] component  - [ ] integration  - [ ] e2e  - [ ] manual (device: …)

## Screenshots / recordings

## AI-assisted?
- [ ] No  - [ ] Yes → row added to docs/09-ai-disclosure-log.md

## Contract change?
- [ ] No  - [ ] Yes → shared/contracts updated + types regenerated + consumer approved
```

**Review SLA:** within 2 hours during the working day. M4's PRs are reviewed by their mentor first.

## Tooling

| What | Choice | Notes |
|---|---|---|
| JS package manager | **npm** | Commit `package-lock.json`; CI uses `npm ci`. Don't mix in yarn/pnpm lockfiles. |
| Node | 20 LTS | Same version as CI. |
| Python | 3.11 | venv at `backend/.venv` (`py -3.11 -m venv .venv` on Windows). |
| Python deps | pip + `requirements*.txt` | `requirements.txt` (runtime), `-dev` (tests/lint), `-ml` (pix2tex, optional). |
| Issue labels | `M1`–`M4`, `blocked`, `P0`, `P1`, `bug`, `test` | Owner label + priority on every issue. |

## Code style

### TypeScript / React
- `strict: true`. No `any` without an `// eslint-disable-next-line` comment that gives a reason.
- Function components and hooks. Zustand for global state; component state stays local.
- File names: `PascalCase.tsx` for components, `camelCase.ts` for utilities.
- Coordinates: **always page-normalized (0..1)** in stored data; convert at the render boundary.
- No `dangerouslySetInnerHTML`. Render maths with KaTeX `trust: false`.

### Python
- Python 3.11, `ruff` (lint + format), `mypy` strict on `core/`, `schemas/` and `services/verification/`.
- Pydantic v2 models for every request/response. `extra="forbid"` on external inputs and LLM output.
- Services are pure where possible (no FastAPI imports inside `services/`).
- Timeouts on every external call (OCR, LLM, solve).

### Naming
- API JSON uses `snake_case`. TS types are generated, so the frontend also uses `snake_case` for API objects and `camelCase` internally.
- Enum values are lowercase snake: `completed_without_ai`, `algebraic_transformation`.
- Concept IDs are snake_case nouns: `linear_equations`.

## Task board etiquette

- Update **only your own rows** in `docs/task-board.md` (avoids merge conflicts).
- Status values: `todo` → `in-progress` → `review` → `done` (or `blocked: <reason>`).

## Definition of Done

See [AGENTS.md §5](../AGENTS.md#5-definition-of-done-every-task).
