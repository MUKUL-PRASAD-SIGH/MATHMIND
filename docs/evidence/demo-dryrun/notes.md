# Demo dry run (automated, laptop)

- **Run:** 2026-11-28T11:34:02.445Z · commit `b0dc6c4` · Playwright, Chromium 1440×900, against `docker compose --profile ai`
- Machine time only (no talking, no pen); a human run is slower. Segments 1 and 7 are slides; 6 is R3-2.

| Segment | Budget | Took | | Observed |
|---|---|---|---|---|
| 2 Notebook: ink, undo, reopen | 30 s | 3.5 s | ok | created in the browser (the seeded server notebook is not pulled into IndexedDB) |
| 3 Laptop: keyboard equation block | 25 s | 0.6 s | ok | typed the 4 error-version steps (stands in for handwriting + OCR confirm) |
| 4 Review: verdicts + step-2 mark + hint | 45 s | 31.6 s | ok | completed; first error = step 2 |
| 5a Fix step 2 → re-review | 15 s | 32 s | **over** | completed; verdicts supported, supported, supported, supported (a free block: no problem attached, so mastery does not move) |
| 5b Progress → practise → mastery moves | 15 s | 29.2 s | **over** | practised lin-002 (`3x+5=20`): mastery linear_equations 0.35 → 0.545 |
