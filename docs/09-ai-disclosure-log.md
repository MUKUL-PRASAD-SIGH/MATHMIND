# 09 — AI-Assisted Development Disclosure Log

This log is required by the hackathon rubric (A4). **Everyone adds rows as they go.** M4 compiles and cleans it up in T8.3.

## Summary (filled in T8.3)

- **Development tools used:** _e.g. Claude Code, Copilot, Cursor_
- **Kinds of help:** _scaffolding, parser code, test generation, prompt drafting, UI components, docs_
- **How outputs were verified:** _unit/property tests, manual review, labelled evaluation, browser checks_
- **Runtime AI in the product:** pix2tex (local OCR), Ollama + `<model>` (local explanations). No paid APIs. SymPy is the correctness authority.

## Log

| Date | Member | Task | AI tool | What the AI produced | Human check performed | Decision & evidence |
|---|---|---|---|---|---|---|
| 2026-__-__ | M3 | T3.1 | _tool_ | LaTeX normalization function | Ran 40 table-driven cases + Hypothesis round-trip | Found 3 failures (`\dfrac`, unicode minus, `\left(`); fixed; PR #__ |
| 2026-11-25 | M1 | T0.1, T0.3, T0.4, T0.7, T2.1–T2.4 | AI coding assistant | Backend scaffold, contract export, DB models/repos, routers, job runner, CI workflow, 85 tests | Full test suite + ruff + mypy + bandit + live uvicorn smoke test; contract drift check | Tests caught 3 real bugs (shared `Path()` param bound wrong id; FK insert-order bug exposed by enabling SQLite FK pragma; in-memory SQLite unsafe across threads), all fixed. Needs human review: branch `feat/M1-foundation` |
| 2026-11-26 | M1 | T7.7 | AI coding assistant | Export/delete endpoints, ownership tests, schemathesis fuzz test, local-only Ollama guard | Full suite (126 tests), mutation check on the ownership test (removed the owner check, test failed), fuzzing | Fuzzing found 2 real bugs (405 without a correct `Allow` header; undocumented 400), both fixed with regression tests |
| 2026-11-27 | M1 | — (while blocked) | AI coding assistant | 14 integration tests for `/problems`, `/learners/me/mastery`, `/revision`, `/next` with real data | Full suite + ruff + mypy; mutation checks: confidence boundary `< 3` → `<= 3` and revision filter widened by 7 days, both made a test fail | Kept. Did not pin `/next` ranking by prerequisite count (looks unintended; flagged for T6.4). Branch `test/M1-learner-endpoints` |
| | | | | | | |

### Categories to cover (from spec §14.5)

| AI-assisted contribution | Required human check | Evidence to record |
|---|---|---|
| Generated parser or transformation code | Test against known expressions and edge cases | Errors found; changed or kept |
| Generated evaluation prompt / schema | Run against labelled examples; inspect outputs | Schema failures, inaccurate explanations, prompt revisions |
| Generated UI component | Browser interaction + accessibility checks | Layout/interaction issues and fixes |
| Generated tests | Mutation check: break the code, confirm the test fails | Test caught / didn't catch |
| Generated docs | Fact-check against the actual implementation | Corrections made |
