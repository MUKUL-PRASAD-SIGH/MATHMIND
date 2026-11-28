# 09 — AI-Assisted Development Disclosure Log

This log is required by the hackathon rubric (A4). **Everyone adds rows as they go.** M4 compiles and cleans it up in T8.3.

## Summary (filled in T8.3)

_Draft by M1 (2026-11-28); M4 finalises in T8.3._

- **Development tools used:** Claude Code (an AI coding assistant), commits marked with a `Co-Authored-By: Claude` trailer.
- **Kinds of help:** backend and frontend code, Docker setup, the evaluation harness, the reviewer prompt, Playwright
  tests and evidence capture, and docs.
- **How outputs were verified:** pytest / Vitest / Playwright suites in CI, axe accessibility checks, the labelled
  evaluation (120 items), screenshots inspected by a person, and AI explanations read against the maths. Each row below
  lists what the check found and what changed.
- **Runtime AI in the product:** Ollama + `qwen2.5:3b` (local explanations, prompt `reviewer_v2`) and pix2tex (local
  OCR, optional install). No paid APIs. SymPy is the correctness authority; model output is schema-validated and never
  executed.

## Log

| Date | Member | Task | AI tool | What the AI produced | Human check performed | Decision & evidence |
|---|---|---|---|---|---|---|
| 2026-__-__ | M3 | T3.1 | _tool_ | LaTeX normalization function | Ran 40 table-driven cases + Hypothesis round-trip | Found 3 failures (`\dfrac`, unicode minus, `\left(`); fixed; PR #__ |
| 2026-11-25 | M1 | T0.1, T0.3, T0.4, T0.7, T2.1–T2.4 | AI coding assistant | Backend scaffold, contract export, DB models/repos, routers, job runner, CI workflow, 85 tests | Full test suite + ruff + mypy + bandit + live uvicorn smoke test; contract drift check | Tests caught 3 real bugs (shared `Path()` param bound wrong id; FK insert-order bug exposed by enabling SQLite FK pragma; in-memory SQLite unsafe across threads), all fixed. Needs human review: branch `feat/M1-foundation` |
| 2026-11-26 | M1 | T7.7 | AI coding assistant | Export/delete endpoints, ownership tests, schemathesis fuzz test, local-only Ollama guard | Full suite (126 tests), mutation check on the ownership test (removed the owner check, test failed), fuzzing | Fuzzing found 2 real bugs (405 without a correct `Allow` header; undocumented 400), both fixed with regression tests |
| 2026-11-27 | M1 | — (while blocked) | AI coding assistant | 14 integration tests for `/problems`, `/learners/me/mastery`, `/revision`, `/next` with real data | Full suite + ruff + mypy; mutation checks: confidence boundary `< 3` → `<= 3` and revision filter widened by 7 days, both made a test fail | Kept. Did not pin `/next` ranking by prerequisite count (looks unintended; flagged for T6.4). Branch `test/M1-learner-endpoints` |
| 2026-11-28 | M1 | T8.1 | AI coding assistant | Dockerfiles, nginx config, `docker-compose.yml` (Ollama under `profiles: [ai]`), `scripts/dev.{sh,ps1}` | Ran `docker compose up` and `--profile ai` on Docker Desktop: health, R2-B typed review, real qwen2.5:3b review | Found the 60 s LLM timeout too short for a cold model load in Docker (~2 min); compose now defaults `TIMEOUT_LLM=120` and documents warming the model |
| 2026-11-28 | M1 / M3 | T4.2, T5.2 | AI coding assistant | `GET /review` regions while awaiting confirmation; reviewer takes `concept` from the input | Backend suite + contract drift; live compose run against qwen2.5:3b | The live run found every review without a problem failed validation (`concept: null`) → always `invalid_output`. Fixed with regression tests |
| 2026-11-28 | M2 | T4.3, T5.4 | AI coding assistant | Check-recognition panel, review stepper, feedback panel, SVG annotations, review store | Component tests (MSW), Playwright on laptop/tablet/phone, axe | Playwright found the phone header overflowing (layout viewport 504 px → hidden title, panel buttons off-screen) and a missing `min-h-0` on panel scroll areas; axe found 4 label/name mismatches. All fixed |
| 2026-11-28 | M3 | T7.2 | AI coding assistant | `ai/evaluation/` harness, metric functions, unit tests, first reports | 9 unit tests on tiny fixtures; ran on all 120 labelled items | Tests caught the threshold-tuning rounding back onto the misread confidence (would let that line skip confirmation); changed to the next observed confidence |
| 2026-11-28 | M4 / M1 | T6.6, T7.7, T7.3 | AI coding assistant | Progress page, practise-this-problem flow, export/delete-my-data UI, 25 Playwright specs | Component tests; real-backend E2E (practise → solve → attempts +1) | Building the mastery E2E showed there was no way in the UI to attach a problem to a solution block, so mastery could never change; added the practise flow |
| 2026-11-28 | M1 | T7.5 | AI coding assistant | Playwright evidence capture (`r2r3.evidence.spec.ts`), evidence notes | Ran against docker compose; screenshots inspected by eye; AI explanations read against the maths | Human check of R2-D found a wrong LLM explanation (verdict correct) — recorded, not hidden. Capturing R3-1 exposed a revoked blob URL in the confirm panel; fixed. Two test bugs (bare `/` reopens the last notebook; `count()` not waiting after reload) fixed |
| 2026-11-28 | M1 | T8.4 | AI coding assistant | Automated demo dry run (`e2e/demo.evidence.spec.ts`), run-sheet findings, seed script in the image | Ran against docker compose; timings and screenshots checked | Found the AI text wrong on the demo problem, review 30–114 s vs a 45 s slot, the seeded notebook invisible in the browser and mastery not moving from a free block; run sheet changed for each |
| 2026-11-28 | M1 / M3 | T5.2 | AI coding assistant | `reviewer_v2` prompt + `checker_facts` (SymPy-expanded steps) and unit tests | 5 unit tests; live check on R2-B / R2-D; 40-item re-evaluation | R2-B explanation correct 2/2 (was wrong); R2-D vague but no longer wrong. 40-item re-run: error-type accuracy unchanged (52.2 %, no label changed), so the claim is limited to explanation text. v1 kept for reproducibility. Needs M3 review |
| 2026-11-28 | M1 | T8.2 | AI coding assistant | README status / measured results / quick start, risks update | Every number checked against the linked report; relative links checked by script | Removed planning-only wording; device claims limited to what was tested |
| | | | | | | |

### Categories to cover (from spec §14.5)

| AI-assisted contribution | Required human check | Evidence to record |
|---|---|---|
| Generated parser or transformation code | Test against known expressions and edge cases | Errors found; changed or kept |
| Generated evaluation prompt / schema | Run against labelled examples; inspect outputs | Schema failures, inaccurate explanations, prompt revisions |
| Generated UI component | Browser interaction + accessibility checks | Layout/interaction issues and fixes |
| Generated tests | Mutation check: break the code, confirm the test fails | Test caught / didn't catch |
| Generated docs | Fact-check against the actual implementation | Corrections made |
