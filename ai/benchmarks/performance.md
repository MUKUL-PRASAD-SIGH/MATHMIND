# Performance & resource benchmarks (T7.6)

Measured 2026-11-28 on the dev laptop. Re-run with the commands below on the demo machine before the demo.

**Hardware:** Intel Core Ultra 5 125U (14 logical CPUs), 15.4 GB RAM, Windows 11, no GPU used.
Docker Desktop VM: 14 CPUs, 7.5 GB RAM. Python 3.11, Chromium (Playwright 1.65), Ollama in Docker, CPU only.

**Cost per evaluation: ₹0 / $0 incremental.** Everything runs locally (SymPy, pix2tex, Ollama); there are no paid
APIs. Hardware and electricity are external costs.

## Backend stages

| Stage | Runs | p50 | p95 | Notes |
|---|---|---|---|---|
| verify (SymPy, in-process) | 30 | 81–84 ms | 129–136 ms | 4 mixed problems (linear, quadratic, fractions); first parse warmed up |
| verify (eval harness, 120 labelled items) | 120 | 134 ms | 380 ms | from `ai/evaluation/reports/2026-11-28-sympy-only.md` |
| reason (qwen2.5:3b via Ollama in Docker, CPU) | 40 | 40.3 s | 97.4 s | from the 40-item LLM eval; includes the one validation retry when needed |
| recognize (pix2tex) | — | — | — | **not measured**: pix2tex is not installed on this machine (`requirements-ml.txt`) |
| model cold load (qwen2.5:3b in Docker) | 1 | ~117 s | — | first call after `compose up`; warm it before a demo |

Peak RSS of the backend code in-process during the verify benchmark: **97 MB**. Ollama holds the
qwen2.5:3b weights in its own process (~1.8 GB CPU buffer, from the Ollama load log).

## Concurrency

| Setup | Submissions at once | Errors | p50 | p95 | End states |
|---|---|---|---|---|---|
| AI off (verification only) | 5 | 0 | 4.0 s | 4.3 s | `completed_without_ai` |
| AI off (verification only) | 20 | 0 | 3.9 s | 5.1 s | `completed_without_ai` |
| AI on (qwen2.5:3b, one Ollama, 2 job workers) | 5 | 0 | 76.5 s | 152 s | all `completed` (AI explanation included) |

With AI on, reviews queue behind the single Ollama model: the 5th of 5 simultaneous reviews took ~2.5 min. The UI
shows "This is taking longer than usual" after 90 s and keeps the SymPy result if the LLM times out
(`TIMEOUT_LLM`), so a burst degrades to slower feedback, never to errors. For a classroom you would want a GPU or
a smaller model.

## Frontend (Playwright, Chromium, headless)

| Measurement | Laptop 1440×900 | Tablet (iPad Pro 11 emulation) |
|---|---|---|
| Fast stroke, frame time p50 / p95 / max | 16.7 / 33.3 / 100–200 ms | 16.7 / 33.3 / 83–100 ms |
| Page with 500 strokes: reload → ink visible | 1.8–2.4 s | 1.8–2.0 s |
| Same reload: DOMContentLoaded | 0.8–1.3 s | 0.5–1.3 s |

Frame times come from a `requestAnimationFrame` loop while Playwright sends 240 pointer moves. They show the
canvas keeps up with input (p50 = one 60 Hz frame). They are **not** a substitute for the Chrome Performance panel
on a real tablet with a pen, which the plan asks for and which still needs doing by hand on the T7.4 device.

## How to re-run

```bash
# backend (repo root, backend venv)
python ai/benchmarks/perf_bench.py --runs 30 --ocr
python ai/benchmarks/perf_bench.py --ollama-url http://localhost:11434 --model qwen2.5:3b --llm-runs 5
python ai/benchmarks/perf_bench.py --api http://localhost:8000 --concurrent 5
# evaluation-harness latency (all stages it runs)
python ai/evaluation/run_eval.py --dataset datasets/labelled_solutions --model qwen2.5:3b
# frontend
cd frontend && PERF=1 npx playwright test perf --project=laptop --project=tablet
```
