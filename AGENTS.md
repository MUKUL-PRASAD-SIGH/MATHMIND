# AGENTS.md — Rules for AI coding agents in the MathMind repo

Read this file before every session. It applies to Claude Code, Cursor, Copilot, Codex and any other agent.

## 0. Start-of-session checklist

1. Ask (or read from the prompt) **which team member you are working for**: M1, M2, M3 or M4.
2. Open that member's guide in `docs/team/`:
   - M1 → `docs/team/M1-tech-lead.md`
   - M2 → `docs/team/M2-frontend.md`
   - M3 → `docs/team/M3-math-ai.md`
   - M4 → `docs/team/M4-junior-qa-content.md`
3. Open `docs/task-board.md` and find the member's **next task whose prerequisites are all `done`**.
4. Open the task's section in `docs/plan/phase-*.md` and follow its steps and sub-steps **in order**.
5. Check `docs/04-dependencies-and-parallelism.md` if you are unsure whether you may start a task.

## 1. Prerequisite rule (hard rule)

- **Do not start a task until all of its prerequisites are `done`**, unless its plan entry says it can start against a **mock** (marked `🟡 mock-ok`). In that case, use the mocks described in `docs/04-dependencies-and-parallelism.md#mocking-strategy`.
- If you are blocked, do not invent the missing piece inside another member's folder. Use the **"while blocked"** list in the member's guide instead.

## 2. Ownership boundaries

| Path | Owner | Others may… |
|---|---|---|
| `frontend/src/notebook/**`, `frontend/src/services/db/**` | M2 | read; open PR for review |
| `frontend/src/features/analytics/**` | M4 (mentor: M2) | review |
| `frontend/src/features/ai-review/**` | M2 | review |
| `backend/app/api/**`, `backend/app/models/**`, `backend/app/repositories/**`, `backend/app/core/**` | M1 | review |
| `backend/app/services/verification/**`, `recognition/**`, `reasoning/**`, `adaptation/**` | M3 | review |
| `ai/**` | M3 | M4 adds benchmark records |
| `datasets/**` | M4 (reviewer: M3) | review |
| `docs/**` | M4 compiles, everyone contributes | edit own sections |
| `shared/contracts/**` (OpenAPI + JSON Schemas + TS types) | M1 | **changes need M1 + one consumer approval** |

## 3. Contract-first

- API shapes are defined **once**, as Pydantic models in `backend/app/schemas/`. They are exported to
  `shared/contracts/openapi.yaml` + `shared/contracts/schemas/*.json` by `python scripts/export_contracts.py`
  (run from `backend/`). Mock payloads live in `shared/contracts/examples/` (`python scripts/make_examples.py`).
- CI fails if the exported files are stale (`export_contracts.py --check` + `tests/test_contracts.py`), so the contract diff
  is always visible in the PR. Contract changes need M1 + one consumer approval.
- Frontend: regenerate types with `npm run gen:types` after any contract change.

## 4. Non-negotiable product rules (from the spec)

- **No paid APIs** (OpenAI, Gemini, Anthropic, commercial OCR) in runtime code. Ever.
- **Never overwrite original strokes or images** with OCR output. Derived data is stored separately and linked by `region_id`.
- **Never mark learner maths `incorrect` when OCR confidence is low.** Ask for confirmation first.
- **SymPy decides correctness; the LLM only explains.** If verification is inconclusive, the review must say so.
- **Validate all LLM output** against the Pydantic `ReviewResult` schema. Never `eval`/`exec` model output.
- **Fail visibly.** If Ollama is down, return `ai_status: "unavailable"` and keep deterministic results.
- Core notebook features must work **offline**.

## 5. Definition of Done (every task)

- [ ] Steps in the plan entry completed; "Done when" criteria met.
- [ ] Tests listed under the task's **Tests** heading written and passing locally.
- [ ] Lint + type-check pass (`npm run lint && npm run typecheck` / `ruff check && mypy app`).
- [ ] No secrets committed; `.env.example` updated if new config was added.
- [ ] `docs/task-board.md` row updated (status, PR link) — **only your own rows**.
- [ ] If an AI agent generated significant code/prompt/schema → add a row to `docs/09-ai-disclosure-log.md`.
- [ ] PR opened against `main` following `docs/07-conventions.md`.

## 6. Commands

```bash
# frontend
npm run dev | test | lint | typecheck | build | gen:types
npx playwright test
# backend
uvicorn app.main:app --reload
pytest -q            # all
pytest -q -m unit    # fast
ruff check . && mypy app
# AI
python ai/evaluation/run_eval.py --dataset datasets/labelled_solutions
python ai/benchmarks/bench_models.py
```

## 7. When unsure

Prefer the smallest change that satisfies the plan. If a decision isn't covered by the docs, write it down as a question in the PR description rather than guessing silently.
