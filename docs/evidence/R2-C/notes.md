# R2-C

- **Captured:** 2026-11-28T11:15:15.282Z · commit `ea62773` · automated (Playwright, laptop 1440×900, keyboard only) against `docker compose`
- **Input steps:** `3x+5=20` → `3x=15` → `x=5`
- **Expected:** Same correct result each time
- **Result:** **PASS**

| Run | Status | AI | Step verdicts (SymPy) | First error | LLM error type | Next action |
|---|---|---|---|---|---|---|
| 1 | `completed_without_ai` | `unavailable` | supported, supported, supported | — | — | — |
| 2 | `completed` | `ok` | supported, supported, supported | — | — | increase_difficulty |
| 3 | `completed` | `ok` | supported, supported, supported | — | — | increase_difficulty |

AI text (explains only; SymPy decides):

- Run 1 explanation: Every step keeps the same solution. You correctly subtracted 5 from both sides and then divided by 3.
  Hint: Try a problem with brackets or with x on both sides next.
- Run 2 explanation: Every step keeps the same solution. You correctly subtracted 5 from both sides and then divided by 3.
  Hint: Try a problem with brackets or with x on both sides next.

**Reviewer note:** the deterministic result (SymPy verdicts, first error) is identical in all three runs, which is what
R2-C checks. Run 1's LLM call hit `TIMEOUT_LLM=120 s` while the model reloaded after `keep_alive` expiry, so that run
shows the "AI explanation unavailable" state; runs 2–3 include the AI text. Warm the model before a demo.

Screen recording (clip.mp4): _not recorded yet — record by hand for the video (T8.4)._
