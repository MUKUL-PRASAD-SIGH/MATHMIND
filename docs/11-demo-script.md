# 11 — Demo script (draft)

> **Owner:** M1 · **Status:** draft, updated after automated dry run #1 (2026-11-28, see §0). Human dry run #2 still to do.
> Plan: [phase-8 T8.4](plan/phase-8-submission.md#t84--demo-script-dry-runs-recording-m1-leads-all). Evidence it must show: [10-evaluation-plan §3–4](10-evaluation-plan.md) (R2-B, R3-1, R3-2).

**Target 3:00, hard max 4:00.** One problem carries the whole story: **`2(x-3)=10`**, the R2-B case.

| Version | Steps |
|---|---|
| With the error | `2(x-3)=10` → `2x-3=10` → `2x=13` → `x=6.5` |
| Corrected | `2(x-3)=10` → `2x-6=10` → `2x=16` → `x=8` |

---

## 0. Dry run #1 findings (automated, 2026-11-28)

Walked segments 2–5 with Playwright against `docker compose --profile ai` on the dev laptop (typed steps instead of
handwriting, no talking). Notes and screenshots: [evidence/demo-dryrun](evidence/demo-dryrun/notes.md).
Re-run: `E2E_BASE_URL=http://localhost:8080 npx playwright test demo` from `frontend/`.

| # | Finding | Impact | Fix / decision | Owner |
|---|---|---|---|---|
| 1 | **The AI explanation is wrong on the demo problem**: "the −3 inside the bracket should have been divided by 2" (the error is not multiplying −3 by 2). R2-D had a wrong explanation too. SymPy verdicts were right both times | The judges read this text in the key segment | Before recording: give the reviewer prompt SymPy's facts (e.g. the expected expansion `2x-6`) and re-run `ai/evaluation`. Until then **do not read the explanation aloud**; point at the red ✗ and the verdict line | M3 |
| 2 | Review took **114 s** in run 1 (low free RAM) and **30–32 s** per review in run 2 with the model warm; three reviews in segments 4–5 ≈ 95 s of waiting against ~70 s of budget | Live demo stalls | Recording: cut the wait (keep the stepper on screen for 2 s). Live: say "SymPy checks every step; the local model writes the explanation" while the stepper runs. Warm the model at T−5 min | M1 |
| 3 | The seeded notebook "Algebra practice" lives only on the server; the browser keeps notebooks in IndexedDB and never pulls them | "Open Algebra practice → Brackets" can't work | Pre-flight: create the notebook in the browser (step 5 below) | M1 |
| 4 | A free solution block has no problem attached, so **mastery does not move**; the progress page said "No practice yet" (stack not seeded) | Segment 5 shows nothing | Seed, then do segment 5 from **Progress → Practise this problem**, which links the block to the problem. Run 2 (seeded): practised `lin-002` → Linear equations **0.35 → 0.545**, attempts 2 → 3 ✔ | M1 / M4 |
| 5 | `ollama run` via `docker exec` hung; first model load ≈ 64–117 s | Cold first review times out (`TIMEOUT_LLM`) → "AI unavailable" | Warm with the HTTP call in pre-flight step 2 | M1 |
| 6 | pix2tex not installed on the dev laptop | Health shows `pix2tex: not_installed`; segment 4 handwriting impossible | Build backend with `WITH_ML=1` on the demo machine, or use the typed fallback (§4) | M1 |

---

## 1. Pre-flight (T−30 min)

Run these on the **demo laptop**, in order. Tick each one.

```bash
# Docker (recommended). Pick free ports if 8000/8080 are taken: BACKEND_HOST_PORT / WEB_HOST_PORT
docker compose --profile ai up -d --build          # WITH_ML=1 build arg for pix2tex
# 1. Clean state (inside the backend container; it uses the compose volume DB)
docker compose exec backend python /app/scripts/seed_demo.py --reset
docker compose restart backend
# 2. Warm the model (`ollama run` in docker exec can hang; use the HTTP API)
docker compose exec backend python -c "import httpx;print(httpx.post('http://ollama:11434/api/generate',json={'model':'qwen2.5:3b','prompt':'hi','stream':False,'keep_alive':'60m'},timeout=300).status_code)"
# 3. Health
curl http://localhost:8080/api/v1/health    # ollama: "up", pix2tex: "loaded" (or "not_installed" → typed fallback)
# 4. Browser: open http://localhost:8080, create notebook "Algebra practice" (finding 3)
```

Without Docker: `backend/.venv/Scripts/python scripts/seed_demo.py --reset`, `ollama run qwen2.5:3b "hi"`,
`uvicorn app.main:app --port 8000` in `backend/`, `npm run dev` in `frontend/`.

- [ ] `seed_demo.py --reset` printed "Demo state loaded"
- [ ] Health shows `ollama: up` and `pix2tex: loaded`
- [ ] Tablet on the same Wi-Fi, app open at `http://<laptop-ip>:5173`, pen paired
- [ ] Wi-Fi to the internet **off** on the laptop (proves "fully local"; LAN stays on for the tablet)
- [ ] Notifications off, battery > 60 %, screen recording running (backup, T8.4 step 5)
- [ ] Backup clips for segments 3–6 are on the desktop

## 2. Run sheet

| Time | Segment | Device | Who | Do | Say (short) | Viewer must see |
|---|---|---|---|---|---|---|
| 0:00–0:20 | Problem | voice | M1 | Title slide | "Answer checkers say *wrong*. They don't say *where* or *why*." | — |
| 0:20–0:50 | Notebook | tablet | M2 | Open **Algebra practice → Brackets**. Write a line, erase a word, undo, close and reopen the tab | "Ink feels like paper, and it's saved on the device as you write." | Strokes come back after reopening |
| 0:50–1:15 | Laptop | laptop | M2 | Same notebook; insert an equation block, type `2x-6=10` | "No pen? Type maths with the keyboard." | Equation renders |
| 1:15–2:00 | Review | tablet | M3 | Handwrite the **error version**, lasso it → *Check my work* → confirm one low-confidence line → wait | "It reads my handwriting, asks when it isn't sure, then SymPy checks every step." | Confirm panel; steps 1 ✓, **step 2 ✗** outlined in red; hint about the bracket |
| 2:00–2:25 | Fix & learn | tablet | M4 | Progress → **Practise this problem** (linked block, finding 4) → solve correctly → re-review → back to Progress | "Fix one line, check again. The mastery estimate moves and the next exercise explains why." | All ✓; *Linear equations* bar goes up from 0.35; next activity + reason |
| 2:25–2:45 | Failure | laptop | M1 | Quit Ollama (tray icon → Quit, or `taskkill /IM ollama.exe`), submit again | "If the local model is down, nothing is lost and the maths checks still run." | "AI explanation unavailable" banner, verdicts still shown |
| 2:45–3:00 | Close | voice | M1 | Architecture slide | "Everything runs on this laptop: pix2tex, SymPy, a 3B model in Ollama. Zero paid APIs. SymPy decides; the model only explains. Limitations: …" | — |

⏳ Replace the "Say" lines with the exact sentences after dry run #1. Keep each one under 2 lines.

## 3. Fallbacks (decide fast, don't debug live)

| If this happens | Do this | Time cost |
|---|---|---|
| OCR misreads a line | That *is* R3-1: correct it in the confirm panel and say "it asked instead of guessing" | +5 s |
| Review spins > 10 s | Say "the first call loads the model", wait to 20 s, then play backup clip 4 | +20 s |
| Tablet won't connect | Do segment 3 on the laptop with the mouse; skip pen claims | 0 s |
| Wrong verdict appears | Play backup clip 4; note the input for the post-mortem | +10 s |
| Anything else breaks | Play the backup clip for that segment and move on | — |
| Need a clean start mid-session | Stop the API → `scripts/seed_demo.py --reset` → start the API (≈ 15 s) | 15 s |

## 4. What depends on what (so we know what to cut)

| Segment | Needs | Owner | Cut if late |
|---|---|---|---|
| Notebook, laptop | T1.2–T1.7 | M2 | Never: core |
| Review (typed) | T3.4 verifier wired, T5.4 panel | M3, M2 | Never: Milestone A |
| Review (handwriting) | T4.1 pix2tex, T4.3 confirm UI | M3, M2 | Fall back to typed input in segment 4 |
| Fix & learn | T6.3–T6.6 | M3, M4 | Show the review only; drop the mastery bar |
| Failure | T5.3 fallback (backend already returns `completed_without_ai`) | M1 | Never: R3-2 evidence |

## 5. Recording checklist (T8.4 step 4)

- [ ] OBS: laptop screen + tablet mirror (or a phone camera on a stand) side by side, 1080p, 30 fps
- [ ] 2 full takes; pick the better one; captions added
- [ ] Under 4:00; the R2-B red outline is on screen ≥ 3 s
- [ ] No personal data, names or notifications visible
