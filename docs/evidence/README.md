# R2 / R3 evidence (T7.5)

Captured 2026-11-28 on the dev laptop (Intel Core Ultra 5 125U, 15.4 GB RAM, Windows 11) against `docker compose`
(`--profile ai`, qwen2.5:3b on CPU), keyboard only, Chromium 1440×900. Each folder has `notes.md` (input, expected,
observed from the API, pass/fail, timestamp, commit) and screenshots. Screen recordings are still to be made by hand
for the demo video (T8.4).

| Case | Result | Notes |
|---|---|---|
| [R2-A](R2-A/notes.md) correct linear | **PASS** | all steps supported; AI text correct |
| [R2-B](R2-B/notes.md) error at step 2 | **PASS** | first error = step 2 + hint. First attempt hit the 120 s LLM timeout (cold model) and degraded to SymPy-only, as designed |
| [R2-C](R2-C/notes.md) R2-A ×3 | **PASS** | identical SymPy verdicts all 3 runs; run 1 had no AI text (cold model timeout) |
| [R2-D](R2-D/notes.md) quadratic mistake | **PASS** (verdict) | first error = step 2 by SymPy. **The AI explanation is wrong** (calls the learner's factorisation correct) — logged for prompt tuning |
| [R3-1](R3-1/notes.md) OCR uncertainty | **PARTIAL** | flow shown with mock OCR; real pix2tex run still needed |
| [R3-2](R3-2/notes.md) model unavailable | **PASS** | Ollama stopped → `completed_without_ai`, banner, SymPy checks, work kept after reload |

## Re-run

```bash
docker compose --profile ai up -d            # warm the model first (see docker-compose.yml)
cd frontend
E2E_BASE_URL=http://localhost:8080 EVIDENCE_COMMIT=$(git rev-parse --short HEAD) npx playwright test r2r3 -g "R2"
docker compose stop ollama
E2E_BASE_URL=http://localhost:8080 npx playwright test r2r3 -g "R3-2"
EVIDENCE=1 npx playwright test ocr-uncertain --project=laptop   # R3-1, mock OCR
```

Lessons for the demo: warm the model right before presenting (a cold load took ~117 s, longer than `TIMEOUT_LLM`),
and keep the R2-D AI text in view as the example of why SymPy, not the LLM, decides correctness.
