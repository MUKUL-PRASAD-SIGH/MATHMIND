# Evaluation (T7.2)

`run_eval.py` runs the **production** verifier — and optionally the local reviewer and OCR — on
`datasets/labelled_solutions/` and writes `reports/<date>-<label>.md` plus a `.json` copy.

```bash
# from the repo root, with the backend virtualenv active
python ai/evaluation/run_eval.py --dataset datasets/labelled_solutions                     # SymPy only
python ai/evaluation/run_eval.py --dataset datasets/labelled_solutions --model qwen2.5:3b  # + reviewer
python ai/evaluation/run_eval.py --dataset datasets/labelled_solutions --mode image        # + pix2tex
python ai/evaluation/run_eval.py ... --ratings ai/evaluation/ratings.csv                   # + human ratings
```

| Metric (spec §14.2) | Where |
|---|---|
| First-error localization accuracy | `metrics.first_error_accuracy` |
| Precision of `incorrect` (false "incorrect" is the worst failure) | `incorrect_precision`, `false_incorrect`, `step_false_incorrect` |
| Inconclusive rate (items / steps) | `inconclusive_rate`, `step_inconclusive_rate` |
| Error classification accuracy + confusion matrix | `error_type_accuracy`, `confusion_matrix` |
| Schema-valid rate, override rate | `schema_valid_rate`, `override_rate` |
| Expression recognition (exact / SymPy-equivalent) | `exact_match_rate`, `run_image` |
| `OCR_CONFIDENCE_THRESHOLD` tuning | `tune_threshold` |
| Latency p50 / p95 per stage | `latency_summary` |
| Human ratings (validity, hint usefulness, 1–3) | `aggregate_ratings` |

Anything that cannot run (Ollama down, pix2tex not installed, no handwriting PNGs) is reported as
**not measured** with the reason — the harness never fills in numbers.

**Ratings CSV:** `item_id,rater,validity,hint_usefulness` (each 1–3, blank = not rated). M1 and M4
each rate 30 explanations from an LLM report's JSON (`items[]`).

**Image mode** scores `datasets/handwriting_samples/<item id>.png` against that item's `learner_attempt`.

Tests: `cd backend && pytest ../ai/evaluation -q` (also run in CI).
