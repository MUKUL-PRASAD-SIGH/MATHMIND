# M2 — Frontend · Notebook Engineer

## 🤖 Paste this block into your AI agent at the start of every session

```text
You are assisting M2 (Frontend / Notebook Engineer) on the MathMind repo.
Read AGENTS.md first, then this file (docs/team/M2-frontend.md).
Stack: React + TypeScript (strict) + Vite + Tailwind + Zustand + Dexie (IndexedDB) + MathLive + KaTeX.
My folders: frontend/src/{notebook,features/ai-review,features/learning,services/db,services/device,components},
frontend/src/mocks/, frontend/e2e/ (shared with M1). I mentor M4 on frontend/src/features/analytics/.
Rules: stored coordinates are page-normalized (0..1); original strokes/images are never mutated;
annotations are separate SVG objects; no dangerouslySetInnerHTML; KaTeX trust:false;
the notebook must work offline (IndexedDB is the source of truth).
Use generated API types from src/services/api/types.ts and MSW mocks (VITE_USE_MOCKS=true)
when the backend isn't ready.
Pick my next task from docs/task-board.md (M2 section) whose prerequisites are done
(docs/04-dependencies-and-parallelism.md §2). Follow its steps in docs/plan/phase-*.md.
Before finishing: the task's tests pass, npm run lint && npm run typecheck && npm run test clean,
task-board row updated, AI disclosure row added if applicable.
```

## Mission

Build a notebook that **feels natural** on a tablet with a stylus, is **fully usable from the keyboard** on a non-touch laptop, and **never loses work**. Then attach review results to the learner's own ink.

## Your tasks in order

| Order | Task | Prereqs | Est | Critical? | Notes |
|---|---|---|---|---|---|
| 1 | T0.2 Frontend scaffold | T0.1 | 2 h | 🔴 | |
| 2 | T1.2 Ink canvas | T0.2 | 6 h | 🔴 | Start immediately; doesn't need the contract |
| 3 | T1.6 Responsive + device modes | T0.2 | 3 h | | Parallel-friendly with T1.2 |
| 4 | T1.1 Data model + IndexedDB | T0.2 (T0.4 preferred) | 4 h | | Align types with contract v0 |
| 5 | T1.3 Tools + undo/redo | T1.2 | 4 h | 🔴 | |
| 6 | T1.4 Notebooks/pages/backgrounds | T1.1 | 4 h | | |
| 7 | T1.5 Autosave & restore | T1.1, T1.3 | 3 h | | |
| 8 | T2.5 API client + sync (pair with M1) | T2.2, T1.5 | 3 h | | |
| 9 | T1.7 MathLive equation blocks | T1.1 | 5 h | | Needed for **Milestone A** (Day 3) |
| 10 | T1.8 Lasso, overlay, workspace | T1.3 | 5 h | 🔴 | |
| 11 | T1.9 Image import + region crop | T1.8 | 4 h | 🔴 | |
| 12 | T4.3 OCR confirmation UI | T1.9 (T4.2 mock-ok) | 3 h | | |
| 13 | T5.4 Review panel + annotations | T1.8 (T5.3 mock-ok) | 5 h | 🔴 | Start on mocks Day 4 |
| 14 | T7.3 E2E (with M1) | T5.4 | 4 h | 🔴 | |
| 15 | T7.8 Accessibility audit | T1.7 | 2 h | | M4 assists |
| 16 | T6.7 ⭐ Live assistance | T5.4, T4.2 | 4 h | P1 | Only if Milestone B is on time |

Plan details: [phase-1](../plan/phase-1-notebook.md), [phase-4 T4.3](../plan/phase-4-recognition.md), [phase-5 T5.4](../plan/phase-5-ai-review.md), [phase-6 T6.7](../plan/phase-6-adaptive.md), [phase-7](../plan/phase-7-testing.md).

## Handoffs

| You give | To | By |
|---|---|---|
| "Check these steps" button (typed submit) | M1/M3 for Milestone A | Day 3 |
| `exportRegion(bbox) → PNG` + bbox/stroke ids | M1 (upload), M3 (OCR) | Day 4 |
| Empty `ProgressPage.tsx` + route + first test example | **M4** | **Day 4 AM** |
| Device test build reachable on LAN (`npm run dev -- --host`) | M4 | Day 6 |

| You receive | From | By |
|---|---|---|
| Contract types + MSW mocks | M1 | Day 1 noon |
| Typed / image / confirm / review endpoints | M1 | Day 2–4 |

## Mentoring M4 (T6.6 progress page)

1. Day 4 AM (30 min): create `features/analytics/ProgressPage.tsx` with the route, fetch hook and one passing test. Walk M4 through it.
2. Point M4 to the Recharts BarChart example and the mock JSON.
3. Review M4's PR within 2 h. Explain changes rather than rewriting them.

## Tests you own

- Unit: geometry (normalize, bbox, point-in-polygon, eraser hit-test), smoothing, history stack, debounce, device mode derivation, zoom transform.
- Component: toolbar, page nav, solution block, confirm panel, review panel, autosave banner.
- Failure injection: IDB write failure → banner + retry.
- E2E (with M1): notebook persistence, image review, OCR-uncertain, offline, a11y, visual snapshots across 3 viewports.
- Manual: ink feel on a real tablet; palm rejection.

## Performance budgets

| Metric | Budget |
|---|---|
| Ink frame time during a fast stroke | < 16 ms |
| Page open with 500 strokes | < 300 ms |
| Bundle (gzipped, initial) | < 500 KB (lazy-load MathLive/Recharts) |

## While blocked, do this

1. Write component tests for merged UI.
2. Build the UI against MSW mocks for the next task.
3. Polish touch targets and responsive layouts.
4. Write E2E specs against mocks.
5. Review M4's PRs.
