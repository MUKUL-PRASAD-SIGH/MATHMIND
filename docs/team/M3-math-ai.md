# M3 — Math & AI Engineer

## 🤖 Paste this block into your AI agent at the start of every session

```text
You are assisting M3 (Math & AI Engineer) on the MathMind repo.
Read AGENTS.md first, then this file (docs/team/M3-math-ai.md).
Stack: Python 3.11, SymPy (+antlr4-python3-runtime 4.11), pix2tex, Ollama (local LLM), Pydantic v2, pytest, Hypothesis.
My folders: backend/app/services/{verification,recognition,reasoning,adaptation}/, ai/, backend/tests for those modules,
datasets/validate.py. I review M4's datasets.
Services must be pure Python (no FastAPI imports); M1 wires them into the job runner.
Hard rules: SymPy decides correctness, the LLM only explains; return 'inconclusive' rather than guess;
never mark maths incorrect when OCR confidence is low; validate LLM output with Pydantic extra='forbid';
never eval/exec model output; no paid APIs; every external call has a timeout.
Pick my next task from docs/task-board.md (M3 section) whose prerequisites are done
(docs/04-dependencies-and-parallelism.md §2). Follow its steps in docs/plan/phase-*.md.
Before finishing: tests pass (pytest -m "not ml and not llm" in CI; ml/llm locally), ruff + mypy clean,
task-board row updated, AI disclosure row added if applicable.
```

## Mission

Make MathMind's judgements **trustworthy**. The verifier must never call correct work wrong. OCR uncertainty must always reach the learner. The LLM must stay inside the evidence. The adaptive engine must explain its choices.

## Your tasks in order

| Order | Task | Prereqs | Est | Critical? |
|---|---|---|---|---|
| 1 | T0.5 AI toolchain smoke | — | 3 h | |
| 2 | T3.1 LaTeX normalization & parse | T0.5 | 4 h | 🔴 |
| 3 | T5.1 Model benchmark (M4 records) | T0.5 | 4 h | |
| 4 | T3.2 Step verifier (linear) | T3.1 | 5 h | 🔴 |
| 5 | T3.4 Wire verifier → **Milestone A** | T3.2, T2.4 | 3 h | 🔴 |
| 6 | T4.1 pix2tex + line split + confidence | T0.5, T3.1 | 5 h | 🔴 |
| 7 | T3.3 Extended rules | T3.2 | 5 h | |
| 8 | T5.2 Prompt + schema + validation | T3.2, T5.1 | 5 h | 🔴 |
| 9 | T6.3 Mastery service | T6.1, T3.4 | 3 h | |
| 10 | T6.4 Next-action engine | T6.3, T6.2 | 4 h | |
| 11 | T7.2 Eval harness + report | T7.1 (≥40), T5.3 | 5 h | |
| 12 | T7.6 Performance benchmarks | T5.3 | 3 h | |

Plan details: [phase-3](../plan/phase-3-math.md), [phase-4](../plan/phase-4-recognition.md), [phase-5](../plan/phase-5-ai-review.md), [phase-6](../plan/phase-6-adaptive.md), [phase-7](../plan/phase-7-testing.md).

## Public interfaces you must provide (M1 depends on these)

```python
# services/verification
def verify_steps(steps: list[str], problem: Problem | None = None,
                 domain: Domain = "reals") -> VerificationResult: ...

# services/recognition
def recognize_region(png: bytes, stroke_hint: StrokeHint | None = None) -> list[RecognizedLine]: ...

# services/reasoning
class ReviewUnavailable(Exception): ...
def review(problem, steps, verification, concept, history) -> ReviewResult: ...   # may raise ReviewUnavailable
def ollama_healthy() -> bool: ...

# services/adaptation
def score_from_evidence(verification, hints_used: int, attempts: int) -> float | None: ...
def update_mastery(m_old: float, s: float) -> float: ...
def next_action(profile, history, concept_graph, problems) -> NextAction: ...
```

Agree on these signatures with M1 on **Day 1** and put the stubs in early so M1 can wire them.

## Supporting M4

| When | What |
|---|---|
| Day 0–1 | Review M4's 3 `SCHEMA.md` files (T0.6) |
| Day 1 | Write `datasets/validate.py` (validates concepts, problems and labelled items: schema, unique ids, prerequisite existence, no cycles) |
| Day 2 | 10-minute demo: checking an answer in a SymPy shell (`python -c "from sympy import *; x=symbols('x'); print(solveset(2*x+3-7, x))"`) |
| Day 2–4 | Review 1 in 5 dataset items in detail; run `verify_steps` across the dataset and send M4 the disagreements |
| Day 1–2 | Give M4 `ai/benchmarks/bench_models.py` and the results template |

## Tests you own

- Table-driven parser tests (≥ 40 cases) and property-based round-trip.
- Verifier: R2-A/B/D cases, domain cases, inequality sign flip, inconclusive scope, property-based mutation tests.
- Recognition: line segmentation on synthetic images; confidence scoring with a mocked OCR; `-m ml` real-image run.
- Reasoning: valid/invalid/retry; SymPy override; **hostile output fuzz**; `-m llm` real-model run.
- Adaptation: formula + clamping + property tests; one test per rule; simulated-learner scenario.
- Eval harness metric functions; performance timing script.

## Quality bar

| Metric | Bar |
|---|---|
| False-incorrect on correct dataset items | **0** |
| First-error localization (typed) | ≥ 80% |
| LLM schema-valid after retry | ≥ 95% |
| Verification time per step | < 2 s (timeout → inconclusive) |

## While blocked, do this

1. Add more parser and verifier cases from M4's dataset.
2. Expand `SUPPORTED_SCOPE.md`.
3. Run the model benchmarks on other laptops.
4. Tune the OCR confidence weights on the handwriting samples.
5. Review M4's dataset PRs.
