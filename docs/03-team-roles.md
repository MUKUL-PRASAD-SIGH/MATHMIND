# 03 — Team Roles & Ownership

The team is 4 people. **M4 is less experienced**, so M4 gets fewer tasks, every task broken into small explicit sub-steps, a named mentor on each task, and nothing on the critical path alone.

## 1. Roles

| ID | Role | Strengths needed | Primary folders | Mentor for |
|---|---|---|---|---|
| **M1** | Tech Lead · Backend · Integration | FastAPI, API design, Git, CI, debugging across stack | `backend/app/{api,core,models,repositories,services/jobs}`, `shared/contracts`, CI, `docker-compose.yml` | M4 (docs, evidence) |
| **M2** | Frontend · Notebook Engineer | React/TS, Canvas, Pointer Events, IndexedDB, CSS | `frontend/src/{notebook,features/ai-review,services}` | M4 (progress page) |
| **M3** | Math & AI Engineer | Python, SymPy, ML tooling, prompting, evaluation | `backend/app/services/{verification,recognition,reasoning,adaptation}`, `ai/` | M4 (datasets) |
| **M4** | Junior · QA, Content & Docs | Careful, organised, basic Git/JSON/React | `datasets/`, `frontend/src/features/analytics`, `docs/`, manual test reports | — |

## 2. Workload balance

| Member | # Tasks | Est. effort (h) | On critical path? |
|---|---|---|---|
| M1 | 15 | ~50 | **Yes** — contract, job runner, orchestrator, E2E, demo |
| M2 | 14 | ~52 | **Yes** — ink, review UI |
| M3 | 13 | ~50 | **Yes** — verifier, reviewer |
| M4 | 9 (+2 assists) | ~32 | **No** — all M4 tasks have slack ≥ ½ day |

## 3. Task allocation (summary)

| Phase | M1 | M2 | M3 | M4 |
|---|---|---|---|---|
| 0 Setup | T0.1, T0.3, T0.4, T0.7 | T0.2 | T0.5 | T0.6 |
| 1 Notebook | — | T1.1–T1.9 | — | — |
| 2 Backend | T2.1–T2.4, T2.5 (with M2) | T2.5 (with M1) | — | — |
| 3 Math | — | — | T3.1–T3.4 | — |
| 4 Recognition | T4.2 | T4.3 | T4.1 | — |
| 5 AI review | T5.3 | T5.4 | T5.1, T5.2 | assist T5.1 (record benchmarks) |
| 6 Adaptive | T6.5 | T6.7 (P1) | T6.3, T6.4 | T6.1, T6.2, T6.6 |
| 7 Testing | T7.3 (with M2), T7.7 | T7.3, T7.8 | T7.2, T7.6 | T7.1, T7.4, T7.5 (with M1) |
| 8 Submission | T8.1, T8.4, T8.5 | assist T8.4 | assist T8.4 | T8.2, T8.3, assist T8.5 |

Full detail is in [plan/README.md](plan/README.md). Personal step-by-step guides are in [team/](team/).

## 4. M4 support model

- **Buddy per task:** each M4 task names a mentor who reviews it within 2 hours of the PR going up.
- **Daily 15-min pairing** with the relevant mentor at the start of each day.
- **Templates provided:** dataset JSON schema, test report template, progress page skeleton.
- **No critical-path ownership:** if an M4 task slips, nothing downstream breaks for a day.
- **Escalation rule:** if M4 is stuck for > 45 min, post in the team channel with what was tried.

## 5. Ceremonies

| When | What | Who | Length |
|---|---|---|---|
| Daily 09:30 | Stand-up: done / next / blocked (task IDs) | all | 15 min |
| Daily 09:45 | M4 pairing | M4 + mentor of the day | 15 min |
| Daily 18:00 | Integration check: `main` builds, smoke test passes | M1 (all attend async) | 15 min |
| End of Day 3 | **Milestone A review**: typed → verify → result works end-to-end | all | 30 min |
| End of Day 5 | **Milestone B review**: full review + mastery works | all | 30 min |
| Day 6 PM | Demo dry run #1 | all | 30 min |
| Day 7 AM | Demo dry run #2 + record | all | 1 h |

## 6. Decision rights

| Decision | Owner | Consulted |
|---|---|---|
| API contract changes | M1 | consumer (M2 or M3) |
| UI/UX layout | M2 | M1, M4 (as test user) |
| Verification rules, model choice, prompt | M3 | M1 |
| Concept list, problem set | M4 | M3 approves |
| Cut scope (drop P1) | M1 | all — decide at Milestone B |
