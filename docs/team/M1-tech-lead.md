# M1 — Tech Lead · Backend · Integration

## 🤖 Paste this block into your AI agent at the start of every session

```text
You are assisting M1 (Tech Lead, Backend & Integration) on the MathMind repo.
Read AGENTS.md first, then this file (docs/team/M1-tech-lead.md).
My folders: backend/app/{api,core,models,repositories,services/jobs}, shared/contracts/,
.github/, docker-compose.yml, scripts/, frontend/src/services/api/ (shared with M2), frontend/e2e/ (shared with M2).
Do NOT edit M3's services (verification, recognition, reasoning, adaptation) — call them through their
public functions or stub them in services/jobs/stages.py.
Pick my next task from docs/task-board.md (M1 section) whose prerequisites are done
(see docs/04-dependencies-and-parallelism.md §2). Follow its steps in docs/plan/phase-*.md exactly.
Contract first: any API shape change goes into shared/contracts and needs consumer approval.
Before finishing: tests listed in the task pass, ruff + mypy clean, task-board row updated,
AI disclosure row added if you generated significant code.
```

## Mission

Keep the team unblocked. You own the **contract**, the **backend skeleton**, the **job pipeline** that connects everyone's work, **CI**, **E2E**, **security**, and the **demo**. Most red critical-path tasks are yours, so finish them before anything optional.

## Your tasks in order

| Order | Task | Prereqs | Est | Critical? | Plan link |
|---|---|---|---|---|---|
| 1 | T0.1 Monorepo scaffold | — | 2 h | 🔴 | [phase-0](../plan/phase-0-setup.md) |
| 2 | T0.3 Backend scaffold | T0.1 | 3 h | 🔴 | [phase-0](../plan/phase-0-setup.md) |
| 3 | T0.4 API contract v0 + mocks | T0.3 | 4 h | 🔴 | [phase-0](../plan/phase-0-setup.md) |
| 4 | T0.7 CI | T0.2, T0.3 | 2 h | | [phase-0](../plan/phase-0-setup.md) |
| 5 | T2.1 DB models + repos | T0.3, T0.4 | 4 h | 🔴 | [phase-2](../plan/phase-2-backend.md) |
| 6 | T2.2 Notebook/page API | T2.1 | 3 h | | phase-2 |
| 7 | T2.3 Submission API + validation | T2.1 | 4 h | 🔴 | phase-2 |
| 8 | T2.4 Job runner + state machine | T2.3 | 4 h | 🔴 | phase-2 |
| 9 | T2.5 FE client + sync (pair with M2) | T2.2, T1.5 | 3 h | | phase-2 |
| 10 | T4.2 Recognition stage + /confirm | T2.4, T4.1 | 3 h | 🔴 | [phase-4](../plan/phase-4-recognition.md) |
| 11 | T5.3 Review orchestrator + fallback | T3.4, T4.2, T5.2 | 6 h | 🔴 | [phase-5](../plan/phase-5-ai-review.md) |
| 12 | T7.7 Security & privacy checks | T2.3 | 3 h | | [phase-7](../plan/phase-7-testing.md) |
| 13 | T6.5 Learner endpoints | T6.3, T6.4 | 3 h | | [phase-6](../plan/phase-6-adaptive.md) |
| 14 | T7.3 E2E (with M2) | T5.4 | 4 h | 🔴 | phase-7 |
| 15 | T7.5 R2/R3 evidence (with M4) | T7.2, T7.3 | 3 h | 🔴 | phase-7 |
| 16 | T8.1 docker-compose | T5.3 | 3 h | | [phase-8](../plan/phase-8-submission.md) |
| 17 | T8.4 Demo + recording | T7.5 | 4 h | 🔴 | phase-8 |
| 18 | T8.5 Devpost submission | T8.4 | 1 h | 🔴 | phase-8 |

## Handoffs

| You give | To | By | Format |
|---|---|---|---|
| Repo skeleton | all | Day 0 | `main` branch |
| Contract v0 + MSW mocks | M2, M3, M4 | **Day 1 noon** | `shared/contracts/` tagged `contract-v0` |
| Stage registry with stubs | M3 | Day 3 AM | `services/jobs/stages.py` with a `register_stage(name, fn)` API |
| `/confirm` working | M2 | Day 4 AM | endpoint + example |
| Learner endpoints | M4, M2 | Day 5 | endpoints |
| Seeded demo DB script | all | Day 6 | `scripts/seed_demo.py` |

| You receive | From | By |
|---|---|---|
| `verify_steps()` | M3 | Day 3 |
| `recognize_region()` | M3 | Day 3–4 |
| `review()` + `ReviewUnavailable` | M3 | Day 4 |
| `mastery.update()`, `next_action()` | M3 | Day 4–5 |
| Concept/problem JSON | M4 | Day 1–2 |

## Tests you own

- Contract tests (examples ↔ schemas ↔ Pydantic), schemathesis fuzz.
- API integration tests for all endpoints.
- State-machine unit tests (legal and illegal transitions).
- Failure injection: stage exception, stage timeout, Ollama down/timeout.
- Upload security tests (type spoofing, size, dimensions, path traversal).
- E2E specs: notebook, typed-review, ai-unavailable, mastery (shared with M2).
- Daily smoke test at 18:00.

## While blocked, do this (in order)

1. Review open PRs (yours to review: all backend PRs, M4's docs PRs).
2. Write integration tests for endpoints that are already merged.
3. Draft E2E specs against mocks.
4. Draft the demo script and the seed-demo script.
5. Update the risk register.

## Lead duties (daily)

- [ ] 09:30 stand-up: check the task board for `blocked` rows
- [ ] Unblock M4 first if they're stuck > 45 min
- [ ] 18:00: pull `main` → run the smoke test → post 🟢/🔴 in chat
- [ ] Watch the critical path; if a red task slips > ½ day → propose a scope cut
