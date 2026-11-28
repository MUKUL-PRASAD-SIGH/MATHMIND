# 10 — Evaluation & Evidence Plan

The hackathon rubric rewards **practical value, a justified AI design, observed functionality and design quality**. Every claim in the submission needs evidence from this doc.

## 1. Dataset

- **Target:** 120 labelled solutions (range 100–150), with ~30 also in handwritten image form.
- **Location:** `datasets/labelled_solutions/<concept>/<id>.json`, images in `datasets/handwriting_samples/`.
- **Owner:** M4 (author) · M3 (reviewer).
- Mix and schema: see [plan/phase-7-testing.md#t71](plan/phase-7-testing.md) and `datasets/labelled_solutions/SCHEMA.md`.

## 2. Metrics

| Metric | Definition | Target (aspirational; report actuals honestly) |
|---|---|---|
| Expression recognition accuracy | % lines where OCR LaTeX is SymPy-equivalent to the truth (image subset) | measure |
| Confirmation rate | % lines sent to the learner for confirmation | measure (lower is nicer, but safety first) |
| **False-incorrect rate** | % correct solutions labelled `incorrect` by the system | **0% target**; any case is a bug |
| First-error localization | % error items where `first_error_step` matches the label | ≥ 80% on typed input |
| Inconclusive rate | % steps returned `inconclusive` | report |
| Error classification accuracy | LLM `error_type` vs label | report + confusion matrix |
| Schema-valid rate | % LLM responses passing validation on first try / after retry | ≥ 95% after retry |
| Override rate | % LLM status disagreeing with SymPy | report |
| Explanation validity (human) | mean 1–3 rating, 2 raters, 30 items | ≥ 2.3 |
| Hint usefulness (human) | mean 1–3, and "does not reveal the answer" % | ≥ 2.3; ≥ 90% |
| Latency | p50 / p95 per stage and end-to-end on the demo laptop | p50 end-to-end < 20 s |
| Resource use | peak RAM / CPU% with model loaded | report |
| Cost per evaluation | incremental cost under local execution | $0 (hardware/electricity disclosed) |

## 3. R2 — Functionality test cases

| Case | Input | Expected | Evidence | Status |
|---|---|---|---|---|
| R2-A | Correct linear equation, e.g. `3x + 5 = 20 → 3x = 15 → x = 5` | All steps supported; accepted result | `docs/evidence/R2-A/` | ✅ pass |
| R2-B | Different problem with an algebraic error, e.g. `2(x-3)=10 → 2x-3=10 → …` | First incorrect = step 2; red annotation on that region; hint | `docs/evidence/R2-B/` | ✅ pass |
| R2-C | Repeat R2-A ×3 | Same correct result each time | `docs/evidence/R2-C/` | ✅ pass |
| R2-D | Multi-step quadratic with an inserted mistake, e.g. `x^2-5x+6=0 → (x-2)(x+3)=0 → …` | First supported error located; relevant intervention | `docs/evidence/R2-D/` | ✅ pass (AI text wrong, see notes) |

## 4. R3 — Failure demonstrations

| Case | How to trigger | Expected | Evidence | Status |
|---|---|---|---|---|
| R3-1 OCR uncertainty | Upload a messy handwriting sample | "Check recognition" panel; original kept; correct/retry path works; **no incorrect verdict before confirmation** | `docs/evidence/R3-1/` | 🟡 mock OCR only |
| R3-2 Model unavailable | Stop Ollama (`ollama stop` / kill the service) and submit | Work preserved; "AI explanation unavailable"; SymPy checks still shown | `docs/evidence/R3-2/` | ✅ pass |

## 5. Evidence folder format

```
docs/evidence/<case-id>/
├── notes.md          # input, expected, observed, PASS/FAIL, date, commit hash, device
├── screenshot-1.png
└── clip.mp4          # or clip-link.txt if > 20 MB
```

## 6. Results (filled in T7.2 / T8.2)

| Metric | Value | Dataset size | Model | Date | Report link |
|---|---|---|---|---|---|
| | | | | | |
