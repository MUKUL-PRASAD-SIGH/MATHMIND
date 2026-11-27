# Task Board

> **Rule:** each person edits **only their own rows**. Status: `todo` · `in-progress` · `review` · `done` · `blocked: <reason>`.
> AI agents: check prerequisites in [04-dependencies-and-parallelism.md §2](04-dependencies-and-parallelism.md#2-prerequisite-lookup-table) before moving a row to `in-progress`.

## Team

| ID | Name / handle | Role |
|---|---|---|
| M1 | _fill in_ (**team lead**) | Tech Lead · Backend · Integration |
| M2 | _fill in_ | Frontend · Notebook |
| M3 | _fill in_ | Math & AI |
| M4 | _fill in_ | Junior · QA, Content & Docs |

## Milestones

| Milestone | Target | Status |
|---|---|---|
| Contract freeze v0 | Day 1 noon | ready for review (`shared/contracts/`) |
| Milestone A — typed review E2E | Day 3 EOD | todo |
| Milestone B — full review + mastery | Day 5 EOD | todo |
| Feature freeze + dry run #1 | Day 6 PM | todo |
| Release `v0.1.0` + video | Day 7 noon | todo |
| Submitted | Day 7 (≥ 2 h before deadline) | todo |

## M1 — Tech Lead · Backend · Integration

| Task | Title | Prereqs | Status | Branch / PR |
|---|---|---|---|---|
| T0.1 | Monorepo scaffold | — | review (branch protection + labels set) | `feat/M1-foundation` |
| T0.3 | Backend scaffold | T0.1 | review | `feat/M1-foundation` |
| T0.4 | API contract v0 + mocks | T0.3 | review (MSW handlers wait for T0.2) | `feat/M1-foundation` |
| T0.7 | CI pipeline | T0.2, T0.3 | review (backend job live; frontend job auto-enables at T0.2) | `feat/M1-foundation` |
| T2.1 | DB models + repos | T0.3, T0.4 | review | `feat/M1-foundation` |
| T2.2 | Notebook/page API | T2.1 | review | `feat/M1-foundation` |
| T2.3 | Submission API + upload validation | T2.1 | review | `feat/M1-foundation` |
| T2.4 | Job runner + state machine | T2.3 | review | `feat/M1-foundation` |
| T2.5 | FE API client + sync (with M2) | T2.2, T1.5 | blocked: needs T1.5 (M2) | |
| T4.2 | Recognition stage + /confirm | T2.4, T4.1 | in-progress (stage + /confirm built on stubs; swap in T4.1) | `feat/M1-foundation` |
| T5.3 | Review orchestrator + fallback | T3.4, T4.2, T5.2 | todo | |
| T6.5 | Learner endpoints | T6.3, T6.4 | todo | |
| T7.3 | E2E Playwright (with M2) | T5.4 | todo | |
| T7.5 | R2/R3 evidence (with M4) | T7.2, T7.3 | todo | |
| T7.7 | Security & privacy checks | T2.3 | in-progress (backend done; npm audit, KaTeX, DevTools check wait for frontend) | `feat/T7.7-security` |
| T8.1 | docker-compose | T5.3 | todo | |
| T8.4 | Demo script + recording | T7.5 | in-progress (early prep: `seed_demo.py` + draft run sheet; dry runs wait for T7.5) | `feat/T8.4-demo-seed` |
| T8.5 | Devpost submission | T8.4 | todo | |

## M2 — Frontend · Notebook

| Task | Title | Prereqs | Status | Branch / PR |
|---|---|---|---|---|
| T0.2 | Frontend scaffold | T0.1 | todo | |
| T1.1 | Data model + IndexedDB | T0.2 | todo | |
| T1.2 | Ink canvas | T0.2 | todo | |
| T1.3 | Tools + undo/redo | T1.2 | todo | |
| T1.4 | Notebooks/pages/backgrounds | T1.1 | todo | |
| T1.5 | Autosave & restore | T1.1, T1.3 | todo | |
| T1.6 | Responsive + device modes | T0.2 | todo | |
| T1.7 | MathLive equation blocks | T1.1 | todo | |
| T1.8 | Lasso, overlay, workspace | T1.3 | todo | |
| T1.9 | Image import + region crop | T1.8 | todo | |
| T2.5 | FE API client + sync (with M1) | T2.2, T1.5 | todo | |
| T4.3 | OCR confirmation UI | T1.9 (+T4.2 mock-ok) | todo | |
| T5.4 | Review panel + annotations | T1.8 (+T5.3 mock-ok) | todo | |
| T6.7 | ⭐ Live assistance | T5.4, T4.2 | todo | |
| T7.3 | E2E Playwright (with M1) | T5.4 | todo | |
| T7.8 | Accessibility audit | T1.7 | todo | |

## M3 — Math & AI

| Task | Title | Prereqs | Status | Branch / PR |
|---|---|---|---|---|
| T0.5 | AI toolchain smoke | — | todo | |
| T3.1 | LaTeX parse | T0.5 | todo | |
| T3.2 | Step verifier (linear) | T3.1 | todo | |
| T3.3 | Extended rules | T3.2 | todo | |
| T3.4 | Wire verifier (Milestone A) | T3.2, T2.4 | todo | |
| T4.1 | pix2tex + confidence | T0.5, T3.1 | todo | |
| T5.1 | Model benchmark | T0.5 | todo | |
| T5.2 | Prompt + schema + validation | T3.2, T5.1 | todo | |
| T6.3 | Mastery service | T6.1, T3.4 | todo | |
| T6.4 | Next-action engine | T6.3, T6.2 | todo | |
| T7.2 | Eval harness + report | T7.1 (≥40), T5.3 | todo | |
| T7.6 | Performance benchmarks | T5.3 | todo | |

## M4 — Junior · QA, Content & Docs

| Task | Title | Prereqs | Mentor | Status | Branch / PR |
|---|---|---|---|---|---|
| T0.6 | Onboarding + dataset formats | T0.1 | M1 / M3 | todo | |
| T5.1 (assist) | Record benchmark results | T0.5 | M3 | todo | |
| T6.1 | Concept graph seed | T0.6 | M3 | todo | |
| T6.2 | Problem bank seed | T6.1 | M3 | todo | |
| T7.1 | Labelled dataset (120) | T0.6 | M3 | todo | |
| T6.6 | Progress page | mock-ok; T6.5 for real | M2 | todo | |
| T7.4 | Cross-device manual matrix | T5.4 | M2 | todo | |
| T7.5 | R2/R3 evidence (with M1) | T7.2, T7.3 | M1 | todo | |
| T8.3 | AI disclosure log | continuous | M1 | todo | |
| T8.2 | README & docs final | T7.5 | M1 | todo | |
