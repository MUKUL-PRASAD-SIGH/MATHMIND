# Toolchain environment (T0.5)

Run `python ai/benchmarks/smoke.py` with the backend virtualenv and add one section per team laptop (M4 collects).

## Laptop 1 — M3 dev machine (2026-11-27)

| Item | Value |
|---|---|
| OS | Windows 11 Home 10.0.26300 |
| CPU | Intel Core Ultra 5 125U (14 logical processors) |
| RAM | 15.4 GB |
| GPU | Intel Graphics (integrated; not used — CPU torch) |
| Python | 3.11.9 |
| SymPy / antlr4 | 1.14.0 / 4.11.1 |
| torch / pix2tex | 2.15.0+cpu / 0.1.4 (separate venv from `backend/requirements-ml.txt`) |
| Ollama | **not installed** |

### Smoke results

| Tool | Result | Notes |
|---|---|---|
| SymPy | PASS | `parse_latex(r"\frac{2x+3}{5}=7")` → `Eq((2*x + 3)/5, 7)`; first call 0.6 s idle / 1.9 s under CPU load (parser load) |
| pix2tex | PASS | first `LatexOCR()` 94 s including the weight download, 23 s cold afterwards, 1.6 s warm |
| Ollama | SKIP | not installed on this machine; the backend reports `ai_status: "unavailable"` and keeps the SymPy results |

pix2tex on printed (PIL-rendered) lines, one OCR call each:

| Input | Output | Time |
|---|---|---|
| `3x + 5 = 20` | `3x+5=20` | 0.90 s |
| `2(x - 3) = 10` | `2(\chi-3)=\;10` | 0.70 s |
| `x = 5` | `\chi=5` | 0.61 s |

pix2tex often reads a handwritten-style `x` as `\chi`. The recognition service runs each line three times (original +
two augmentations) for the confidence proxy: **2.3–2.9 s per line** on this CPU. Misreads like the `\chi` lines score
0.33 (below the 0.75 threshold), so they go to the learner for confirmation. No handwritten samples exist in
`datasets/handwriting_samples/` yet (T7.1), so the `-m ml` exact-match test skips.

Weights: `weights.pth` 97.4 MB + `image_resizer.pth` 18.5 MB (116 MB total), downloaded on first run from the
LaTeX-OCR GitHub release `v0.0.1` into `<site-packages>/pix2tex/model/checkpoints/`. The repository licence is MIT. We
found no separate licence for the weights; confirm this in `docs/06-external-requirements.md` §7.

### Not measured here (needs Ollama)

- Ollama RAM use, time to first token and tokens/s for `qwen2.5:3b` and the other T5.1 candidates.
- `ai/benchmarks/bench_models.py` (T5.1) has **not been run**: there are no model numbers and no default-model decision yet.
  Run it on a laptop that has Ollama: `ollama pull qwen2.5:3b` and then `python ai/benchmarks/bench_models.py`.
