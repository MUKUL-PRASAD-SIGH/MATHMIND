# MathMind Documentation Index

Everything needed to plan, build, test and present MathMind lives here.

## Reading order

| # | Doc | Audience | Purpose |
|---|---|---|---|
| 1 | [01-product-overview.md](01-product-overview.md) | everyone | What we are building and why; scope boundaries |
| 2 | [02-architecture.md](02-architecture.md) | M1, M2, M3 (M4 skim) | Modules, data model, API, pipelines, sequence diagrams |
| 3 | [03-team-roles.md](03-team-roles.md) | everyone | Who owns what, workload balance, mentoring |
| 4 | [plan/README.md](plan/README.md) | everyone | Phased plan: every task → steps → sub-steps |
| 5 | [04-dependencies-and-parallelism.md](04-dependencies-and-parallelism.md) | everyone + AI agents | Prerequisites, parallel lanes, critical path, mocks |
| 6 | [05-testing-strategy.md](05-testing-strategy.md) | everyone | Test types, when they run, who owns them |
| 7 | [06-external-requirements.md](06-external-requirements.md) | everyone (Day 0) | Software, models, hardware, devices, accounts, licences |
| 8 | [07-conventions.md](07-conventions.md) | everyone | Git, PRs, code style, naming |
| 9 | [08-risks-and-limitations.md](08-risks-and-limitations.md) | M1, M3 | Risk register |
| 10 | [09-ai-disclosure-log.md](09-ai-disclosure-log.md) | everyone | Log of AI-assisted work (hackathon A4) |
| 11 | [10-evaluation-plan.md](10-evaluation-plan.md) | M3, M4 | Dataset, metrics, R2/R3 evidence |
| 12 | [11-demo-script.md](11-demo-script.md) | M1, all | Demo run sheet, pre-flight, fallbacks (draft) |
| — | [task-board.md](task-board.md) | everyone + AI agents | Live status tracker |

## Personal guides (paste into your AI agent)

| Member | Guide |
|---|---|
| M1 — Tech Lead & Backend/Integration | [team/M1-tech-lead.md](team/M1-tech-lead.md) |
| M2 — Frontend / Notebook | [team/M2-frontend.md](team/M2-frontend.md) |
| M3 — Math & AI | [team/M3-math-ai.md](team/M3-math-ai.md) |
| M4 — Junior: QA, Content & Docs | [team/M4-junior-qa-content.md](team/M4-junior-qa-content.md) |

## Plan files

| Phase | Days | File |
|---|---|---|
| 0 — Setup & contracts | Day 0–1 AM | [plan/phase-0-setup.md](plan/phase-0-setup.md) |
| 1 — Notebook foundation | Day 1–2 | [plan/phase-1-notebook.md](plan/phase-1-notebook.md) |
| 2 — Backend core | Day 1–2 | [plan/phase-2-backend.md](plan/phase-2-backend.md) |
| 3 — Math verification | Day 2–3 | [plan/phase-3-math.md](plan/phase-3-math.md) |
| 4 — Handwriting recognition | Day 3 | [plan/phase-4-recognition.md](plan/phase-4-recognition.md) |
| 5 — AI review | Day 3–4 | [plan/phase-5-ai-review.md](plan/phase-5-ai-review.md) |
| 6 — Adaptive learning | Day 1–5 (data early) | [plan/phase-6-adaptive.md](plan/phase-6-adaptive.md) |
| 7 — Testing & evaluation | Day 2–6 (continuous) | [plan/phase-7-testing.md](plan/phase-7-testing.md) |
| 8 — Submission readiness | Day 6–7 | [plan/phase-8-submission.md](plan/phase-8-submission.md) |

## Task ID convention

`T<phase>.<number>`, e.g. `T3.2` = Phase 3, task 2. IDs are stable. Use them in branch names, commits, PR titles and the task board.
