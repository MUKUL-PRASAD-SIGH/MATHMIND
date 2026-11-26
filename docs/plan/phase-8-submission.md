# Phase 8 — Submission Readiness (Day 6–7)

**Goal:** anyone can run MathMind with one command. The docs are honest, the AI use is disclosed, and a 2–4 minute demo is recorded.

---

## T8.1 — docker-compose + one-command run (M1)

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 3 h | T5.3 | T7.4, T7.5 | T8.2 |

**External:** Docker Desktop (optional for users; the README must still document the non-Docker path).

**Steps**
1. `backend/Dockerfile` (python:3.11-slim) with build arg `WITH_ML=true|false`.
2. `frontend/Dockerfile`: a multi-stage build → static files served by `nginx` or `vite preview`.
3. `docker-compose.yml` with services `frontend`, `backend` and `ollama` (official image, volume for models, `profiles: ["ai"]` so it's optional).
4. `make`-style scripts (or `scripts/dev.ps1` + `scripts/dev.sh`) that start everything.
5. Test on a clean machine (M4's laptop is ideal).

**Tests:** `docker compose up` → health OK → the typed review works; `docker compose --profile ai up` → the AI review works.

---

## T8.2 — README & docs finalization (M4, M1 reviews)

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 3 h | T7.5 | T8.3 | T8.5 |

**Steps**
1. Update the README "Status" from planning to the *actual* state. Remove anything not built.
2. Add screenshots (from `docs/evidence/`) to the README.
3. Fill in "Tested on" with **only** the device/browser pairs that passed T7.4.
4. Copy the final metrics from the T7.2 report into `10-evaluation-plan.md` and summarize them in the README.
5. Update `08-risks-and-limitations.md` with anything learned (e.g. "pix2tex struggles with ...").
6. Check every link (VS Code "Markdown: check links" or `npx markdown-link-check`).
7. Ask M1 to review.

---

## T8.3 — AI disclosure log compilation (M4, all contribute)

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 2 h (plus 5 min/day from everyone) | continuous | T8.2 | T8.5 |

**Steps**
1. Every day at stand-up, remind everyone to add their rows to `docs/09-ai-disclosure-log.md`.
2. On Day 7: make sure every row has a human check and decision evidence, and merge duplicates.
3. Write the short summary at the top: tools used, what kind of work they helped with, how outputs were verified, and the runtime AI (local Ollama model + pix2tex).

---

## T8.4 — Demo script, dry runs, recording (M1 leads; all)

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 4 h | T7.5 | T8.2 | T8.5 |

**Demo script (target 3:00, hard max 4:00)**

| Time | Segment | Device | Speaker |
|---|---|---|---|
| 0:00–0:20 | Problem: final-answer tools miss *why* | slides/voice | M1 |
| 0:20–0:50 | Notebook: handwriting on a tablet, eraser, undo, autosave | tablet | M2 |
| 0:50–1:15 | Laptop: keyboard equation blocks, no touch | laptop | M2 |
| 1:15–2:00 | Review: select region → OCR confirm → SymPy verdicts → red outline at step 2 → hint | tablet | M3 |
| 2:00–2:25 | Correct the step → re-review → mastery bar rises → next activity + reason | tablet | M4 |
| 2:25–2:45 | Failure: stop Ollama → "AI unavailable", checks still shown | laptop | M1 |
| 2:45–3:00 | Local AI, SymPy as authority, limitations, zero paid APIs | voice | M1 |

**Steps**
1. Prepare a seeded demo notebook (a script resets the DB to a known state). *(Built: `scripts/seed_demo.py --reset`. Draft run sheet: [11-demo-script.md](../11-demo-script.md).)*
2. Dry run #1 on Day 6 PM: time it and list the problems.
3. Fix the problems, then dry run #2 on Day 7 AM.
4. Record (OBS; tablet via screen mirroring or a camera), make 2 takes, pick the best one, add captions.
5. Keep a backup recording of each live segment in case the live demo fails.

---

## T8.5 — Devpost description & submission (M1, M4 assists)

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 1 h | T8.4 | — | 🎉 |

**Steps:** write the description (problem, solution, how the AI is used, how it is verified, the metrics *as measured*, limitations, team), attach the video, add the repo link, and submit **at least 2 hours before the deadline**.
