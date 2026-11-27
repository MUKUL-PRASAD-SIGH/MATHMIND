# Phase 6 — Adaptive Learning (Day 1–6)

**Goal:** evidence from reviews updates the concept-level mastery estimates, and the system recommends a next action with a reason the learner can read.

> M4's data tasks (T6.1, T6.2) start **early (Day 1–2)** so the engine has real content by Day 4.

---

## T6.1 — Concept graph seed data (M4, reviewer M3)

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 3 h | T0.6 | everything | T6.2, T6.3, T2.1 seed |

**Steps**
1. Copy the template from `datasets/concepts/SCHEMA.md` into `datasets/concepts/concepts.json`.
2. Add the 7 MVP concepts from `docs/01-product-overview.md §5` (id, name, domain, short description, prerequisites).
3. Check by hand:
   1. Every prerequisite id exists in the file.
   2. There are no cycles (draw the graph on paper or with Mermaid in the PR description).
4. Run the validation script `python datasets/validate.py concepts` (M3 provides it; until then, use an online JSON validator).
5. Open a PR → M3 reviews.

**Tests:** the validation script passes (schema, ids unique, prerequisites exist, no cycles).

---

## T6.2 — Problem bank seed data (M4, reviewer M3)

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 4 h | T6.1 | T7.1 | T6.4 |

**Steps**
1. For each concept, write **5 problems** (35 in total) with difficulties 1–5 in `datasets/problems/<concept_id>.json`.
2. Each problem has `id`, `concept_id`, `prompt_latex`, `expected_answer_latex` and `difficulty`.
3. Check every answer twice: once by hand and once in a SymPy shell (M3 shows you how in 10 minutes).
4. Validate → PR → M3 reviews.

**Tests:** validation script; M3 spot-checks 10 answers.

---

## T6.3 — Mastery update service (M3)

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 3 h | T6.1, T3.4 | T5.3 | T6.4, T6.5 |

**Steps**
1. `services/adaptation/mastery.py`, `score_from_evidence(verification, hints_used, attempts) → S`
   - correct with no hints → 1.0; correct after 1 hint → 0.8; after ≥ 2 hints → 0.6; partial (first error late) → 0.3; incorrect → 0.0; inconclusive → **no update** (record the event only).
2. `update(M_old, S) = 0.7*M_old + 0.3*S`, clamped to 0..1, with an initial `M = 0.3`.
3. A consumer on `learning_event` updates `mastery_profiles` and `attempts`.
4. Expose `confidence_level`: `low` (< 3 attempts), `medium` (3–6) or `high` (> 6). The UI uses this to avoid strong claims.

**Tests**
- Unit: the formula; clamping; inconclusive leaves M unchanged.
- **Property-based:** M stays within [0,1] for any sequence of S values; repeated S=1 converges towards 1 monotonically.

---

## T6.4 — Adaptive next-action engine (M3)

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 4 h | T6.3, T6.2 | T5.4 | T6.5 |

**Steps**
1. `services/adaptation/next_action.py` implements the rule table in `02-architecture.md §9` as ordered, testable rules (first match wins).
2. Prerequisite choice: the prerequisite with the lowest mastery that is still below 0.6.
3. Problem choice: an unattempted problem in the target concept at a difficulty near `round(1 + 4*M)`.
4. Revision queue: `schedule_revision` sets `due_at = now + 1 day`; `GET /revision` returns due items.
5. Every result includes `reason` (e.g. "You solved 3 linear equations in a row — trying a harder one.").

**Tests**
- Unit: one test per rule row (6+), plus a tie-break test.
- Scenario test: a simulated learner (scripted sequence of outcomes) → the expected sequence of actions.

---

## T6.5 — Learner endpoints (M1)

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 3 h | T6.3, T6.4 | T7.3 | T6.6 |

**Steps:** `GET /learners/me/mastery`, `/revision`, `/next`, `GET /concepts`, `GET /problems?concept=`. Each response must match the contract.

**Tests:** integration plus contract validation.

---

## T6.6 — Progress page with Recharts (M4, mentor M2)  🟡

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 5 h | T0.4 (use mock data first), T6.5 for real data | T5.4 | demo |

**Steps** (M2 creates the empty component file and route first)
1. Open `frontend/src/features/analytics/ProgressPage.tsx` (skeleton from M2).
2. Fetch `/learners/me/mastery` with the API client. With `VITE_USE_MOCKS=true` you get `shared/contracts/examples/Mastery.json`.
3. Show a **bar chart**: one bar per concept, mastery 0–100%, and the label "estimate".
   1. Copy the basic `BarChart` example from the Recharts docs.
   2. Map the data to `{name: concept.name, mastery: Math.round(m*100)}`.
4. Below the chart, a **table**: concept, attempts, confidence level, last practised.
5. A "Next up" card from `/learners/me/next` showing the action, concept and `reason`.
6. Empty state: "No practice yet — try a problem to see your progress."
7. Make it responsive: the chart shrinks on phone, and the table scrolls horizontally inside its own box.
8. Write 2 tests (M2 shows you the first one):
   1. It renders bars for the mock data.
   2. It shows the empty state when the list is empty.

**Tests:** 2 component tests; check by eye in all 3 viewports.

---

## T6.7 — Live assistance ⭐ P1 (M2, M3 advises)

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 4 h | T5.4, T4.2 | T7.* | — |

**Steps**
1. Off by default; a toggle in the toolbar.
2. Trigger: 2.5 s of pen inactivity **and** the latest strokes form a new line cluster. Never on every stroke.
3. Run recognize + verify only (**no LLM**) on the last 2 lines. If the transformation is `incorrect` *and* confidence is high, show a small dismissible dot next to the line ("Want to check this step?"). If confidence is low → show nothing.
4. Rate limit: at most 1 request per 5 s; cancel in-flight requests on new ink.

**Tests:** unit for the debounce and trigger logic; manual on a tablet; check that the LLM is never called (spy on it).
