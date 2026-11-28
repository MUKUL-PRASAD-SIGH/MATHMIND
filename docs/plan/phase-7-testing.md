# Phase 7 — Testing & Evaluation (Day 2–6, continuous)

**Goal:** produce evidence for every claim: the AI metrics, the R2 functionality cases, the R3 failure demos, cross-device behaviour, accessibility, performance and security. Test *types* and *timing* are defined in [../05-testing-strategy.md](../05-testing-strategy.md). This phase holds the dedicated testing tasks.

---

## T7.1 — Labelled evaluation dataset (M4, reviewer M3)

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 8 h, spread over Day 2–4 | T0.6 | everything | T7.2 (needs ≥ 40 items to start, ≥ 100 by Day 5) |

**Steps**
1. Read `datasets/labelled_solutions/SCHEMA.md` (written in T0.6).
2. Plan the mix (targets):

   | Concept | Correct | With error | Total |
   |---|---|---|---|
   | linear_equations | 15 | 25 | 40 |
   | quadratic_equations | 10 | 20 | 30 |
   | fractions / arithmetic | 8 | 12 | 20 |
   | factorization | 6 | 9 | 15 |
   | exponents | 6 | 9 | 15 |
   | **Total** | **45** | **75** | **120** |

3. For each item:
   1. Write the problem and a correct reference solution (3–6 steps).
   2. For error items: copy the reference and introduce **one** realistic error (sign error, dropped term, wrong distribution, arithmetic slip, dividing by a variable, wrong formula).
   3. Label `expected_correct`, `first_error_step` (1-based), `error_type` (from the allowed list), and `expected_intervention`.
   4. Save it as one JSON file per item: `datasets/labelled_solutions/<concept>/<id>.json`.
4. Handwriting subset: hand-write 30 of the items on paper or a tablet (vary pen and neatness), photograph them, and save them as `datasets/handwriting_samples/<id>.png`. Ask the 3 other teammates to write 5 each for variety.
5. Run `python datasets/validate.py labelled` after every 10 items.
6. Open a PR every 20 items. M3 reviews 1 in 5 items in detail.

**Tests:** the validation script; M3 spot-review; check that every `first_error_step` agrees with SymPy when run through `verify_steps` (M3 runs this). Disagreements mean either the label or the verifier is wrong, so investigate them.

---

## T7.2 — Evaluation harness + metrics report (M3)

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 5 h | T7.1 (≥ 40 items), T5.3 | T7.3 | T7.5, `10-evaluation-plan.md` results |

**Steps**
1. `ai/evaluation/run_eval.py --dataset … --mode typed|image --model …`
2. Metrics (spec §14.2):
   1. **Expression recognition accuracy** (image mode): normalized exact match and SymPy-equivalence match per line.
   2. **First-error localization accuracy.**
   3. **Error classification accuracy** (LLM `error_type` vs label), with a confusion matrix.
   4. **Verdict precision for `incorrect`**, which must be high: false "incorrect" verdicts are the worst failure.
   5. **Inconclusive rate.**
   6. **Schema-valid rate** and **override rate** (LLM disagreeing with SymPy).
   7. **Latency** p50/p95 per stage.
3. Write the output to `ai/evaluation/reports/<date>-<model>.md` plus a JSON copy.
4. Human ratings: M4 and M1 each rate 30 explanations for **validity** and **hint usefulness** (1–3 scale) in a CSV; the harness aggregates the ratings.
5. Tune `OCR_CONFIDENCE_THRESHOLD`: pick the value that keeps false-incorrect verdicts from OCR errors at 0 on the dataset while minimizing confirmation prompts.

**Tests:** unit-test each metric function on tiny fixtures.

---

## T7.3 — Automated E2E with Playwright (M1 + M2)

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 4 h | T5.4 | T7.2, T7.4 | T7.5 |

**Steps**
1. Projects: `phone` (iPhone 13 device descriptor), `tablet` (iPad Pro 11, `hasTouch`), `laptop` (Desktop Chrome 1440×900, no touch). Optionally add `firefox-laptop` and `webkit-tablet`.
2. Specs:
   1. `notebook.spec.ts`: create notebook → draw (synthesized pointer events) → undo/redo → reload → strokes persist.
   2. `typed-review.spec.ts` (laptop, **keyboard only**): R2-A and R2-B with typed steps.
   3. `image-review.spec.ts`: upload a fixture image → confirm the low-confidence line → annotation visible.
   4. `ai-unavailable.spec.ts`: backend started with `OLLAMA_URL` pointing at a dead port → banner + verification shown (R3).
   5. `ocr-uncertain.spec.ts`: low-confidence fixture → "Check recognition" panel (R3).
   6. `offline.spec.ts`: `context.setOffline(true)` → draw → reload → data present; save indicator OK.
   7. `a11y.spec.ts`: `@axe-core/playwright` on the main screens, with no serious or critical violations.
   8. `mastery.spec.ts`: solve a problem → the progress page bar changes.
3. Visual snapshots of the main screens per viewport (`toHaveScreenshot`) for regression.
4. CI: run on the nightly/manual workflow with the LLM disabled. Run LLM-enabled specs locally only (tag `@llm`).

---

## T7.4 — Cross-device manual test matrix (M4, mentor M2)

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 4 h | T5.4 | T7.3 | T7.5, compatibility claims |

**External:** at least 1 real tablet (with stylus if possible), 1 real phone, 1 non-touch laptop, and both servers reachable on the LAN (`vite --host`, backend on `0.0.0.0`).

**Steps**
1. Copy `docs/templates/manual-test-report.md` (see M4's guide) to `docs/test-reports/<date>-<device>.md`.
2. Run the checklist on each device and browser:

   | # | Check | Tablet | Phone | Laptop (no touch) |
   |---|---|---|---|---|
   | 1 | Create notebook, add page | ☐ | ☐ | ☐ |
   | 2 | Pen/finger writing feels smooth | ☐ | ☐ (short) | n/a |
   | 3 | Palm resting doesn't draw (stylus) | ☐ | n/a | n/a |
   | 4 | Eraser, undo, redo | ☐ | ☐ | ☐ |
   | 5 | Equation block via keyboard only | ☐ (virtual kbd) | ☐ | ☐ |
   | 6 | Lasso/rectangle select | ☐ | ☐ | ☐ |
   | 7 | Camera capture / image import | ☐ | ☐ | ☐ (import) |
   | 8 | OCR confirm panel usable | ☐ | ☐ | ☐ |
   | 9 | Review annotations positioned correctly after zoom | ☐ | ☐ | ☐ |
   | 10 | AI-unavailable banner | ☐ | ☐ | ☐ |
   | 11 | Reload → work restored | ☐ | ☐ | ☐ |
   | 12 | Airplane mode → notebook still works | ☐ | ☐ | ☐ |
   | 13 | Progress page readable | ☐ | ☐ | ☐ |
   | 14 | Text readable, buttons ≥ 44 px on touch | ☐ | ☐ | n/a |

3. For every failure: take a screenshot or screen recording, open a GitHub issue labelled `bug` + device, and link it in the report.
4. Re-test the fixed issues on Day 7 morning.

**Done when:** a report exists per device, and the compatibility statement in the README only lists combinations that passed.

---

## T7.5 — R2/R3 evidence capture (M4 + M1)

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 3 h | T7.2, T7.3 | T8.1 | T8.2, T8.4 |

**Steps**
1. For each case in `10-evaluation-plan.md` (R2-A…D, R3-1, R3-2):
   1. M1 runs it on the demo machine; M4 records the screen (OBS or the OS recorder) and takes screenshots.
   2. Save to `docs/evidence/<case-id>/` with `screenshot-*.png`, `clip.mp4` (or a link if it is large) and `notes.md` (input, expected, observed, pass/fail, timestamp, commit hash).
2. R2-C repeat check: run R2-A 3 times and record the results.
3. Fill the evidence table in `10-evaluation-plan.md`.

---

## T7.6 — Performance & resource benchmarks (M3)

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 3 h | T5.3 | T7.3 | limitations doc, demo hardware note |

**Steps**
1. Backend: time each stage over 30 runs → p50/p95, and record peak RSS (`psutil`) with the model loaded.
2. Frontend: measure ink latency in the Chrome Performance panel on a tablet (frame time during a fast stroke), and measure page load with 500 strokes.
3. Load: 5 concurrent typed submissions should give no errors (a simple `httpx` async script).
4. Write the results to `ai/benchmarks/performance.md`, including the hardware specs and the "cost per evaluation = ₹0/$0 incremental; hardware + electricity are external" statement.

---

## T7.7 — Security & privacy checks (M1)

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 3 h | T2.3 | T5.3 | release |

**Steps**
1. `bandit -r app`, `pip-audit`, `npm audit --omit=dev`: fix highs or document them.
2. Upload tests (already in T2.3) plus a fuzz test with `schemathesis run openapi.yaml`.
3. Check that model output is never passed to `eval`, `exec`, `dangerouslySetInnerHTML` or shell (grep + code review). Check that KaTeX runs with `trust: false`.
4. Check that IDs not owned by the user return 404.
5. Privacy: confirm no network calls other than localhost (DevTools Network tab during a full flow). Add **Export notebook (JSON)** and **Delete all my data** buttons (M2 builds the UI, M1 builds the endpoint).
6. Secrets scan: `git log -p | grep -i "key\|token\|secret"` sanity check, or use `gitleaks`.

**Status (M1, 2026-11-26), backend half done on `feat/T7.7-security`:**
- Step 1: `bandit` clean, `pip-audit` no known vulnerabilities. `npm audit` waits for `frontend/` (T0.2).
- Step 2: `tests/test_fuzz_api.py` fuzzes every operation (schemathesis). It found and we fixed: missing/incomplete `Allow` header on 405, undocumented 400 for non-UTF-8 bodies.
- Step 3: no `eval`/`exec`/shell in `app/` (the `session.exec` hits are SQLModel queries). KaTeX `trust: false` is checked when M2 adds it.
- Step 4: `tests/test_privacy_and_ownership.py` checks every id-taking endpoint returns 404 for another learner's id (mutation-checked).
- Step 5: endpoints `GET /learners/me/export` and `DELETE /learners/me/data?confirm=true` built; contract examples ready for M2's buttons. `OLLAMA_URL` must be a local/LAN host unless `ALLOW_REMOTE_OLLAMA=true`. The DevTools network check needs the frontend.
- Step 6: history scanned, no secrets or `.env` files ever committed.

**Status (M1, 2026-11-28), frontend half done on `feat/M1-integration`:**
- Step 1: `npm audit --omit=dev` → **0 vulnerabilities** after upgrading KaTeX 0.16 → 0.19.1
  (GHSA-238p-pmpm-9mq7, low: trust bypass via pre-existing prototype pollution). Dev-only findings remain
  (vitest 4 / tinypool critical, glob / minimatch moderate). They only affect the local test runner, which is never
  shipped or exposed. vitest 5 does not install cleanly against the current plugins yet, so the upgrade waits.
- Step 3: no `dangerouslySetInnerHTML`, `eval` or `new Function` in `frontend/src`; KaTeX renders with
  `trust: false` (`components/KatexMath.tsx`); LLM text is rendered as plain React text only.
- Step 5: **Export my data (JSON)** and **Delete all my data** (in-page confirmation, no browser dialog) on the
  progress page (`features/privacy/`). Both act on IndexedDB *and* the backend and say plainly when the backend
  could not be reached. Network check is automated: `e2e/typed-review.spec.ts` fails on any non-localhost request
  during a full typed review.

---

## T7.8 — Accessibility & keyboard-only audit (M2, M4 assists)

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 2 h | T1.7 | T7.3 | — |

**Steps**
1. Keyboard-only run of the laptop flow: visible focus ring everywhere, logical tab order, no traps.
2. Screen-reader spot check (NVDA on Windows / VoiceOver): toolbar buttons and review results are announced.
3. Colour: the review colours are not the *only* signal (icons ✓ ✗ ? as well); contrast ≥ 4.5:1.
4. `prefers-reduced-motion` respected.
5. Fix the issues and re-run axe.
