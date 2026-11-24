# M4 — Junior · QA, Content & Docs

Welcome! Your tasks are **important but not on the critical path**, so you have time to learn while you work. Each task is split into small steps. Every task has a **mentor** who reviews your work and helps when you're stuck.

> **Stuck for more than 45 minutes?** Post in the team chat: *what you tried, the exact error, and a screenshot*. Asking quickly is part of the job.

## 🤖 Paste this block into your AI agent at the start of every session

```text
You are assisting M4 (Junior team member: QA, Content & Docs) on the MathMind repo.
Read AGENTS.md first, then this file (docs/team/M4-junior-qa-content.md).
I am less experienced, so: explain each step briefly before doing it, prefer simple solutions,
show me the exact commands to run, and never make large changes at once.
My folders: datasets/ (concepts, problems, labelled_solutions, handwriting_samples), docs/,
docs/test-reports/, docs/evidence/, frontend/src/features/analytics/ (progress page; mentor M2).
Do NOT edit backend code or other members' frontend folders.
Pick my next task from docs/task-board.md (M4 section) whose prerequisites are done
(docs/04-dependencies-and-parallelism.md §2), then follow the step list in THIS file for that task.
Before finishing: run the validation script or tests listed for the task, update my task-board row,
and remind me to open a PR and tag my mentor.
For datasets: every maths answer must be double-checked (by hand and with SymPy).
```

## Your tasks at a glance

| Order | Task | When | Est | Mentor | Prereqs |
|---|---|---|---|---|---|
| 1 | T0.6 Onboarding + dataset formats | Day 0–1 | 3 h | M1 (setup), M3 (formats) | T0.1 |
| 2 | T6.1 Concept graph | Day 1 | 3 h | M3 | T0.6 |
| 3 | T5.1 (assist) Record model benchmarks | Day 1–2 | 2 h | M3 | T0.5 |
| 4 | T6.2 Problem bank | Day 2 | 4 h | M3 | T6.1 |
| 5 | T7.1 Labelled dataset (120 items) | Day 2–4 | 8 h | M3 | T0.6 |
| 6 | T6.6 Progress page | Day 4–5 | 5 h | M2 | mock data → T6.5 |
| 7 | T7.4 Cross-device manual testing | Day 6 | 4 h | M2 | T5.4 |
| 8 | T7.5 R2/R3 evidence (with M1) | Day 6 | 3 h | M1 | T7.2, T7.3 |
| 9 | T8.3 AI disclosure log | Day 7 (+ daily reminders) | 2 h | M1 | — |
| 10 | T8.2 README & docs final | Day 7 | 3 h | M1 | T7.5 |

---

## Git cheat-sheet (use for every task)

```bash
git checkout main && git pull                 # 1. get latest
git checkout -b data/T6.1-concepts            # 2. new branch: <type>/<task>-<slug>
# ... make changes ...
git status                                    # 3. see what changed
git add datasets/concepts/concepts.json       # 4. stage specific files
git commit -m "data(T6.1): add 7 MVP concepts"  # 5. commit
git push -u origin data/T6.1-concepts         # 6. push
# 7. open a PR on GitHub, title "[T6.1] Concept graph", tag your mentor
```

If `git pull` shows a conflict, **stop** and ask your mentor. Don't force-push.

---

## T0.6 — Onboarding + dataset formats

**Steps**
1. Install the tools (see [06-external-requirements.md](../06-external-requirements.md)): Git, Node 20, Python 3.11, VS Code + extensions.
2. Check them: `git --version`, `node -v`, `python --version`.
3. Clone the repo and open it in VS Code.
4. Read `README.md` → `docs/01-product-overview.md` → this file → `docs/05-testing-strategy.md` (about 45 min).
5. First PR: add your name to `docs/task-board.md` → commit → push → PR → M1 approves.
6. Once M1/M2 merge the scaffolds, follow README "Run locally" and confirm the app opens.
7. Create the three schema docs below by copying them **exactly**, then ask M3 to review.

### `datasets/concepts/SCHEMA.md`
```markdown
# Concept file format
File: datasets/concepts/concepts.json — a JSON array.
Each item:
{
  "id": "linear_equations",          // snake_case, unique
  "name": "Linear equations",
  "domain": "algebra",               // arithmetic | algebra | geometry | trigonometry | calculus | ...
  "description": "Equations of the form ax + b = c.",
  "prerequisites": ["algebraic_expressions", "fractions"]   // ids that exist in this file; [] if none
}
Rules: ids unique · prerequisites must exist · no cycles.
```

### `datasets/problems/SCHEMA.md`
```markdown
# Problem file format
File: datasets/problems/<concept_id>.json — a JSON array.
Each item:
{
  "id": "lin-001",                    // <concept short>-<3 digits>, unique
  "concept_id": "linear_equations",
  "prompt_latex": "3x + 5 = 20",
  "expected_answer_latex": "x = 5",
  "difficulty": 1                     // 1 (easy) .. 5 (hard)
}
Rules: answer checked by hand AND with SymPy.
```

### `datasets/labelled_solutions/SCHEMA.md`
```markdown
# Labelled solution format
File: datasets/labelled_solutions/<concept_id>/<id>.json — one item per file.
{
  "id": "lin-e-007",                  // <concept short>-<c|e>-<3 digits>  (c = correct, e = has error)
  "concept_id": "linear_equations",
  "problem_latex": "2(x-3) = 10",
  "reference_solution": ["2(x-3)=10", "2x-6=10", "2x=16", "x=8"],
  "learner_attempt":    ["2(x-3)=10", "2x-3=10", "2x=13", "x=6.5"],
  "expected_correct": false,
  "first_error_step": 2,              // 1-based index into learner_attempt; null if correct
  "error_type": "algebraic_transformation",
  "expected_intervention": "targeted_practice",
  "has_handwriting_image": false,     // true if datasets/handwriting_samples/<id>.png exists
  "notes": "Distributed 2 only to x."
}
error_type ∈ arithmetic_slip | algebraic_transformation | sign_error | formula_selection |
             domain_violation | missing_prerequisite | incomplete | other
expected_intervention ∈ continue | increase_difficulty | targeted_practice | prerequisite_review |
                        worked_example | schedule_revision | ask_another_question
```

**Done when:** the app runs on your laptop, your first PR is merged, and M3 has approved the 3 schema docs.

---

## T6.1 — Concept graph (mentor M3)

**Steps**
1. Branch: `data/T6.1-concepts`.
2. Create `datasets/concepts/concepts.json` containing the 7 concepts from `docs/01-product-overview.md §5`.
   1. Start with the one that has no prerequisites (`integer_arithmetic`).
   2. Add the others one at a time. Write a one-sentence description for each.
3. Check:
   1. Every id in `prerequisites` exists → ✅
   2. No loops (A needs B, B needs A) → draw it:
      ```mermaid
      flowchart LR
        integer_arithmetic --> fractions
        integer_arithmetic --> algebraic_expressions
        integer_arithmetic --> exponents
        algebraic_expressions --> linear_equations
        fractions --> linear_equations
        algebraic_expressions --> factorization
        factorization --> quadratic_equations
        linear_equations --> quadratic_equations
      ```
4. Validate: `python datasets/validate.py concepts` (if M3 hasn't written it yet, paste your JSON into jsonlint.com).
5. Commit → PR → tag M3, and paste the diagram in the PR description.

---

## T5.1 (assist) — Record model benchmarks (mentor M3)

**Steps**
1. Ask M3 which models to pull. Run `ollama pull <model>` for each (big downloads, so use good Wi-Fi).
2. Run `python ai/benchmarks/bench_models.py --model <model>` for each model.
3. Copy the output into `ai/benchmarks/results.md` using this table:

```markdown
| Date | Laptop (CPU / RAM / GPU) | Model | JSON valid % | Schema valid % | Agrees with SymPy % | p50 latency (s) | Peak RAM (GB) | Notes |
|---|---|---|---|---|---|---|---|---|
```
4. Also add your laptop's specs to `ai/benchmarks/ENVIRONMENT.md`.
5. PR → tag M3.

---

## T6.2 — Problem bank (mentor M3)

**Steps**
1. Branch `data/T6.2-problems`.
2. For **each** of the 7 concepts, create `datasets/problems/<concept_id>.json` with **5 problems**, one at each difficulty 1 to 5.
   - Example difficulty ladder for `linear_equations`: `x+3=7` (1) → `3x+5=20` (2) → `2(x-3)=10` (3) → `\frac{x}{3}+2=5` (4) → `3(x+1)-2(x-4)=17` (5).
3. **Check every answer twice:**
   1. Solve it on paper.
   2. Check it in Python:
      ```bash
      python -c "from sympy import *; x=symbols('x'); print(solveset(Eq(3*(x+1)-2*(x-4),17), x))"
      ```
   3. If the two disagree, ask M3.
4. Validate: `python datasets/validate.py problems`.
5. PR → tag M3.

---

## T7.1 — Labelled dataset, 120 items (mentor M3)

This is your biggest task. It is spread over 3 days, and you open a PR every 20 items.

**Target mix**

| Concept | Correct (c) | With error (e) | Total |
|---|---|---|---|
| linear_equations | 15 | 25 | 40 |
| quadratic_equations | 10 | 20 | 30 |
| fractions / integer_arithmetic | 8 | 12 | 20 |
| factorization | 6 | 9 | 15 |
| exponents | 6 | 9 | 15 |

**Daily targets:** Day 2: 20 · Day 3: 40 (M3 needs ≥ 40 to start) · Day 4: 100 · Day 5: 120.

**For each item**
1. Pick a problem (reuse ones from T6.2 or invent new ones).
2. Write the `reference_solution` as a list of steps, one equation per step, 3–6 steps.
3. **Correct items:** `learner_attempt` = the reference solution (or a different valid route), `expected_correct: true`, `first_error_step: null`, `error_type: null`, `expected_intervention: "continue"`.
4. **Error items:** copy the reference and introduce **exactly one** mistake, then carry it forward realistically. Use a variety of mistakes:

   | Mistake | Example | error_type |
   |---|---|---|
   | Sign error moving a term | `x+5=12 → x=12+5` | `sign_error` |
   | Distribute to only one term | `2(x-3) → 2x-3` | `algebraic_transformation` |
   | Arithmetic slip | `2x=16 → x=7` | `arithmetic_slip` |
   | Divide only one side | `2x+4=10 → x+4=5` | `algebraic_transformation` |
   | Wrong factorization | `x^2-5x+6 → (x-2)(x+3)` | `algebraic_transformation` |
   | Wrong quadratic formula | sign of `b` dropped | `formula_selection` |
   | Divide by a variable, lose a root | `x^2=3x → x=3` | `domain_violation` |
   | Fraction addition | `\frac12+\frac13=\frac25` | `missing_prerequisite` |
   | Stop early | `2x=16` (no final step) | `incomplete` |

5. Set `first_error_step` to the **1-based** position of the first wrong step in `learner_attempt`.
6. Pick an `expected_intervention`. Most single slips → `targeted_practice`; fraction or prerequisite mistakes → `prerequisite_review`.
7. Save as `datasets/labelled_solutions/<concept_id>/<id>.json`.
8. Every 10 items: `python datasets/validate.py labelled`.
9. Every 20 items: commit → PR → tag M3.

**Handwriting subset (30 items)**
1. Choose 30 items (mix of correct and error).
2. Write the `learner_attempt` steps by hand, one step per line, on white paper or a tablet. Vary your pen and neatness.
3. Ask M1, M2 and M3 to write 5 each so the handwriting varies.
4. Photograph in good light, from directly above, then crop to just the working.
5. Save as `datasets/handwriting_samples/<id>.png` and set `"has_handwriting_image": true` in the JSON.

**When M3 sends you disagreements** (SymPy disagrees with your label), re-check that item. Either your label is wrong (fix it) or the verifier is wrong (tell M3, because that is a valuable bug report).

---

## T6.6 — Progress page (mentor M2)

**Prereq:** M2 has created `frontend/src/features/analytics/ProgressPage.tsx` with a route and one test.

**Steps**
1. Branch `feat/T6.6-progress-page`.
2. Start with mocks: `VITE_USE_MOCKS=true npm run dev` (in `frontend/`). Open the progress route.
3. Fetch the data. Use the hook M2 wrote, or the API client: `api.get('/learners/me/mastery')`.
4. **Bar chart:**
   ```tsx
   import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
   const data = mastery.map(m => ({ name: m.concept_name, mastery: Math.round(m.mastery * 100) }));
   <ResponsiveContainer width="100%" height={260}>
     <BarChart data={data}>
       <XAxis dataKey="name" />
       <YAxis domain={[0, 100]} unit="%" />
       <Tooltip />
       <Bar dataKey="mastery" />
     </BarChart>
   </ResponsiveContainer>
   ```
   Add a small caption: "Mastery is an estimate based on your recent practice."
5. **Table** under the chart with the columns Concept · Attempts · Confidence (low/medium/high) · Last practised. Wrap it in `<div className="overflow-x-auto">` for phones.
6. **Next up card:** call `/learners/me/next` and show the `action` as friendly text ("Try a harder problem"), the concept name and the `reason`.
7. **Empty state:** if the list is empty, show "No practice yet — try a problem to see your progress."
8. **Tests:** copy M2's example test and write:
   1. "renders one bar per concept from mock data"
   2. "shows empty state when there is no data"
   Then run `npm run test`.
9. Check by eye at phone, tablet and laptop width (Chrome DevTools → device toolbar).
10. `npm run lint && npm run typecheck` → PR → tag M2.
11. When T6.5 is merged, retest with `VITE_USE_MOCKS=false` and the backend running.

---

## T7.4 — Cross-device manual testing (mentor M2)

**Steps**
1. Ask M2 to start the dev servers with LAN access and give you the URL (e.g. `https://192.168.1.20:5173`).
2. For each device (tablet, phone, non-touch laptop):
   1. Copy `docs/templates/manual-test-report.md` → `docs/test-reports/<date>-<device>.md`.
   2. Fill in the header (device, OS, browser, commit).
   3. Do each of the 14 checks. Mark ✅, ❌ or n/a.
   4. For each ❌: take a screenshot, write the steps to reproduce, then open a GitHub issue (label `bug` + device name) and link it.
3. For check #10, ask M1 or M3 to stop Ollama first.
4. For check #12, turn on airplane mode **after** the page has loaded.
5. PR with all reports → tag M2.
6. On Day 7 morning, re-test the issues that were fixed and update the reports.

---

## T7.5 — R2/R3 evidence (with M1)

**Steps**
1. Sit with M1 at the demo machine. Open OBS or the OS screen recorder.
2. For each case in `docs/10-evaluation-plan.md` (R2-A, R2-B, R2-C, R2-D, R3-1, R3-2):
   1. Create the folder `docs/evidence/<case>/`.
   2. Start recording → M1 performs the case → stop.
   3. Take 1–3 screenshots of the key moments.
   4. Write `notes.md`:
      ```markdown
      # R2-B
      - Date/time:
      - Commit: (git rev-parse --short HEAD)
      - Device/browser:
      - Input:
      - Expected:
      - Observed:
      - Result: PASS / FAIL
      ```
3. For R2-C, record 3 runs.
4. Fill the "Status" column in `10-evaluation-plan.md`.
5. Large videos (> 20 MB): upload them to the team Drive and put the link in `clip-link.txt`.

---

## T8.3 — AI disclosure log

**Steps**
1. **Daily, at stand-up:** "Did anyone use AI to generate code, prompts or docs yesterday? Please add a row to `docs/09-ai-disclosure-log.md`."
2. Day 7: read every row and make sure each has *what was generated*, *how it was checked* and *what was decided*. Ask the owner about any missing parts.
3. Fill the Summary section at the top.
4. PR → tag M1.

---

## T8.2 — README & docs final (mentor M1)

**Steps**
1. Read the README top to bottom. For every feature, ask: *is it actually built and working?* If not, remove it or mark it "planned".
2. Change the **Status** line to the real state.
3. Add 2–4 screenshots from `docs/evidence/` (`![Review annotation](docs/evidence/R2-B/screenshot-1.png)`).
4. Add a **Tested on** table using **only** the devices that PASSED in your T7.4 reports.
5. Copy the final metrics from `ai/evaluation/reports/` into `docs/10-evaluation-plan.md §6` and a short summary into the README.
6. Update `docs/08-risks-and-limitations.md §3` with real limitations found during testing.
7. Check all links: `npx markdown-link-check README.md docs/**/*.md`.
8. PR → tag M1.

---

## Your testing responsibilities (summary)

| Type | What you do |
|---|---|
| Data validation | Run `datasets/validate.py` on every dataset change |
| Component tests | 2 tests for the progress page |
| Manual cross-device | T7.4 checklist on 3 devices |
| Human evaluation | Rate 30 AI explanations (validity, hint usefulness, 1–3) in the CSV M3 provides |
| Evidence | R2/R3 recordings and notes |
| Docs accuracy | Make sure the README claims only what was tested |

## While blocked, do this

1. Add more labelled dataset items (T7.1). There's always more to do here.
2. Collect handwriting samples from teammates.
3. Proofread the docs and fix typos and broken links.
4. Try the app as a "new learner" and write down anything confusing, then share it with M2.
