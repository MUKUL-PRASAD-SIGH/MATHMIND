# 11 — Demo script (draft)

> **Owner:** M1 · **Status:** draft, written before the frontend and AI stages exist. Rewrite the lines marked ⏳ after dry run #1 (Day 6 PM).
> Plan: [phase-8 T8.4](plan/phase-8-submission.md#t84--demo-script-dry-runs-recording-m1-leads-all). Evidence it must show: [10-evaluation-plan §3–4](10-evaluation-plan.md) (R2-B, R3-1, R3-2).

**Target 3:00, hard max 4:00.** One problem carries the whole story: **`2(x-3)=10`**, the R2-B case.

| Version | Steps |
|---|---|
| With the error | `2(x-3)=10` → `2x-3=10` → `2x=13` → `x=6.5` |
| Corrected | `2(x-3)=10` → `2x-6=10` → `2x=16` → `x=8` |

---

## 1. Pre-flight (T−30 min)

Run these on the **demo laptop**, in order. Tick each one.

```bash
# 1. Clean state (stop the API first: it holds the DB open)
backend/.venv/Scripts/python scripts/seed_demo.py --reset

# 2. Local AI ready
ollama list                      # qwen2.5:3b (or the T5.1 pick) is listed
ollama run qwen2.5:3b "hi"       # warms the model so the first review isn't slow

# 3. Start the app
cd backend && .venv/Scripts/activate && uvicorn app.main:app --port 8000
cd frontend && npm run dev       # ⏳ until T0.2

# 4. Health
curl http://localhost:8000/api/v1/health   # ollama: "up", pix2tex: "loaded"
```

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
| 2:00–2:25 | Fix & learn | tablet | M4 | Rewrite step 2 as `2x-6=10` → re-review → open Progress | "Fix one line, check again. The mastery estimate moves and the next exercise explains why." | All ✓; *Linear equations* bar goes up from 0.35; next activity + reason |
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
