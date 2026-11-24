# Implementation Plan — Master Overview

The plan covers **7 days plus a half-day setup (Day 0)** for **4 people** (M1, M2, M3, M4). Each task has an ID, an owner, an estimate, its prerequisites, external requirements, steps and sub-steps, tests, and a "Done when" checklist. These details live in the phase files linked below.

Legend: 🟢 can start immediately after prerequisites · 🟡 **mock-ok** (can start early against mocks/contract) · 🔴 on critical path · ⭐ P1 stretch

## Master task table

| ID | Task | Owner | Support | Est (h) | Prerequisites | Flags | Day |
|---|---|---|---|---|---|---|---|
| **Phase 0 — Setup** |
| T0.1 | Monorepo scaffold & conventions | M1 | — | 2 | — | 🔴 | 0 |
| T0.2 | Frontend scaffold (Vite/React/TS/Tailwind/Vitest) | M2 | — | 2 | T0.1 | 🔴 | 0 |
| T0.3 | Backend scaffold (FastAPI/SQLModel/pytest) | M1 | — | 3 | T0.1 | 🔴 | 0 |
| T0.4 | API contract v0 (OpenAPI + JSON Schemas + TS types + mocks) | M1 | M3 review | 4 | T0.3 | 🔴 | 1 |
| T0.5 | Local AI toolchain smoke test (SymPy, pix2tex, Ollama) | M3 | — | 3 | — | 🟢 | 0 |
| T0.6 | Junior onboarding + dataset formats | M4 | M1 | 3 | T0.1 | 🟢 | 0–1 |
| T0.7 | CI pipeline (lint, typecheck, tests) | M1 | — | 2 | T0.2, T0.3 | 🟢 | 1 |
| **Phase 1 — Notebook (frontend)** |
| T1.1 | Notebook data model + IndexedDB (Dexie) | M2 | — | 4 | T0.2 | 🟡 | 1 |
| T1.2 | Ink canvas: Pointer Events capture & render | M2 | — | 6 | T0.2 | 🔴 | 1 |
| T1.3 | Drawing tools + undo/redo | M2 | — | 4 | T1.2 | 🔴 | 2 |
| T1.4 | Notebooks/chapters/pages navigation + backgrounds | M2 | — | 4 | T1.1 | 🟢 | 2 |
| T1.5 | Autosave & restore | M2 | — | 3 | T1.1, T1.3 | 🟢 | 2 |
| T1.6 | Responsive shell + device capability modes | M2 | — | 3 | T0.2 | 🟢 | 1 |
| T1.7 | MathLive equation blocks + symbol palette | M2 | — | 5 | T1.1 | 🟢 | 3 |
| T1.8 | Lasso selection, SVG overlay, expandable workspace | M2 | — | 5 | T1.3 | 🔴 | 3 |
| T1.9 | Image import/camera + region crop export | M2 | — | 4 | T1.8 | 🔴 | 4 |
| **Phase 2 — Backend core** |
| T2.1 | DB models + repositories (SQLite) | M1 | — | 4 | T0.3, T0.4 | 🔴 | 1 |
| T2.2 | Notebook/page endpoints | M1 | — | 3 | T2.1 | 🟢 | 2 |
| T2.3 | Submission endpoints (typed/image/status) + upload validation | M1 | — | 4 | T2.1 | 🔴 | 2 |
| T2.4 | Job runner + status state machine | M1 | — | 4 | T2.3 | 🔴 | 3 |
| T2.5 | Frontend API client + page sync | M1+M2 | — | 3 | T2.2, T1.5 | 🟢 | 3 |
| **Phase 3 — Math verification** |
| T3.1 | LaTeX normalization & parsing to SymPy | M3 | — | 4 | T0.5 | 🔴 | 1 |
| T3.2 | Step verifier — linear equations & expressions | M3 | — | 5 | T3.1 | 🔴 | 2 |
| T3.3 | Extended rules: quadratics, domain checks, inconclusive | M3 | — | 5 | T3.2 | 🟢 | 3 |
| T3.4 | Wire verifier into typed-submission pipeline (**Milestone A**) | M3 | M1 | 3 | T3.2, T2.4 | 🔴 | 3 |
| **Phase 4 — Recognition** |
| T4.1 | pix2tex service + line split + confidence proxy | M3 | — | 5 | T0.5, T3.1 | 🔴 | 3 |
| T4.2 | Recognition in job runner + `/confirm` endpoint | M1 | — | 3 | T2.4, T4.1 | 🔴 | 3–4 |
| T4.3 | OCR confirmation UI | M2 | — | 3 | T1.9, T4.2 | 🟡 | 4 |
| **Phase 5 — AI review** |
| T5.1 | Local model benchmark & selection | M3 | M4 records | 4 | T0.5 | 🟢 | 1–2 |
| T5.2 | Reviewer prompt + Pydantic schema + validation/retry | M3 | — | 5 | T3.2, T5.1 | 🔴 | 4 |
| T5.3 | Review orchestrator + LLM-unavailable fallback | M1 | M3 | 6 | T3.4, T4.2, T5.2 | 🔴 | 4 |
| T5.4 | Review panel + annotations linked to regions | M2 | — | 5 | T1.8, T5.3 | 🟡🔴 | 4–5 |
| **Phase 6 — Adaptive learning** |
| T6.1 | Concept graph seed data | M4 | M3 | 3 | T0.6 | 🟢 | 1 |
| T6.2 | Problem bank seed data | M4 | M3 | 4 | T6.1 | 🟢 | 2 |
| T6.3 | Mastery update service | M3 | — | 3 | T6.1, T3.4 | 🟢 | 4 |
| T6.4 | Adaptive next-action engine | M3 | — | 4 | T6.3, T6.2 | 🟢 | 5 |
| T6.5 | Learner endpoints (mastery/revision/next/concepts/problems) | M1 | — | 3 | T6.3, T6.4 | 🟢 | 5 |
| T6.6 | Progress page (Recharts) | M4 | M2 | 5 | T0.4 (mock), T6.5 | 🟡 | 4–5 |
| T6.7 | Live assistance (debounced hints) | M2 | M3 | 4 | T5.4, T4.2 | ⭐ | 6 |
| **Phase 7 — Testing & evaluation** |
| T7.1 | Labelled evaluation dataset (100–150 items) | M4 | M3 | 8 | T0.6 | 🟢 | 2–4 |
| T7.2 | Evaluation harness + metrics report | M3 | — | 5 | T7.1 (≥40 items), T5.3 | 🟢 | 5–6 |
| T7.3 | Automated E2E (Playwright, 3 viewports) | M1+M2 | — | 4 | T5.4 | 🔴 | 5–6 |
| T7.4 | Cross-device manual test matrix | M4 | M2 | 4 | T5.4 | 🟢 | 6 |
| T7.5 | R2/R3 evidence capture | M4+M1 | — | 3 | T7.2, T7.3 | 🔴 | 6 |
| T7.6 | Performance & resource benchmarks | M3 | — | 3 | T5.3 | 🟢 | 6 |
| T7.7 | Security & privacy checks | M1 | — | 3 | T2.3 | 🟢 | 4 |
| T7.8 | Accessibility & keyboard-only audit | M2 | M4 | 2 | T1.7 | 🟢 | 6 |
| **Phase 8 — Submission** |
| T8.1 | docker-compose + one-command run | M1 | — | 3 | T5.3 | 🟢 | 6 |
| T8.2 | README & docs finalization | M4 | M1 | 3 | T7.5 | 🟢 | 7 |
| T8.3 | AI disclosure log compilation | M4 | all | 2 | continuous | 🟢 | 7 |
| T8.4 | Demo script, dry runs, recording | M1 | all | 4 | T7.5 | 🔴 | 6–7 |
| T8.5 | Devpost description & submission | M1 | M4 | 1 | T8.4 | 🔴 | 7 |

## Day-by-day schedule

| Day | M1 | M2 | M3 | M4 |
|---|---|---|---|---|
| **0 (½ day)** | T0.1 → T0.3 | T0.2 | T0.5 | T0.6 (install + read docs) |
| **1** | T0.4 → T0.7 → T2.1 | T1.2 ‖ T1.6 → T1.1 | T3.1, T5.1 start | T0.6 finish → T6.1 |
| **2** | T2.2 → T2.3 | T1.3 → T1.4 → T1.5 | T3.2, T5.1 finish | T6.2 → T7.1 start |
| **3** | T2.4 → T2.5 → T4.2 start | T2.5 ‖ T1.7 → T1.8 | T3.4 → T4.1 → T3.3 | T7.1 (target ≥ 40 items) |
| *End D3* | **Milestone A:** typed LaTeX → SymPy verdicts visible in UI |
| **4** | T4.2 finish → T5.3 → T7.7 | T1.9 → T4.3 → T5.4 (mock) | T5.2 → T6.3 | T7.1 (≥ 100) · T6.6 (mock data) |
| **5** | T6.5 → T7.3 | T5.4 (real API) | T6.4 → T7.2 | T6.6 (real API) |
| *End D5* | **Milestone B:** image → confirm → verify → AI review → annotation → mastery update |
| **6** | T7.3 → T7.5 → T8.1 → dry run #1 | T7.3 → T7.8 → T6.7 ⭐ | T7.2 → T7.6 | T7.4 → T7.5 |
| **7** | T8.4 → T8.5 | bug-fix + polish | bug-fix + eval write-up | T8.3 → T8.2 |

`→` = sequential · `‖` = in parallel

## Phase files

- [phase-0-setup.md](phase-0-setup.md)
- [phase-1-notebook.md](phase-1-notebook.md)
- [phase-2-backend.md](phase-2-backend.md)
- [phase-3-math.md](phase-3-math.md)
- [phase-4-recognition.md](phase-4-recognition.md)
- [phase-5-ai-review.md](phase-5-ai-review.md)
- [phase-6-adaptive.md](phase-6-adaptive.md)
- [phase-7-testing.md](phase-7-testing.md)
- [phase-8-submission.md](phase-8-submission.md)

## Scope-cut ladder (if behind schedule)

Cut from the top first. Decide at Milestone B.

1. T6.7 Live assistance (P1)
2. Notebook bookmarks, chapters (keep flat page list)
3. Shapes tool, pencil/highlighter variants (keep pen + eraser)
4. Camera capture (keep file import)
5. Progress charts → plain table (T6.6 simplified)
6. **Never cut:** typed verification, OCR confirmation, LLM-unavailable fallback, autosave, region-linked annotation. These are what the R2/R3 evidence requires.
