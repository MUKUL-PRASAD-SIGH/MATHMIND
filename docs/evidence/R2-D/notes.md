# R2-D

- **Captured:** 2026-11-28T09:04:49.390Z · commit `df7b802` · automated (Playwright, laptop 1440×900, keyboard only) against `docker compose`
- **Input steps:** `x^2-5x+6=0` → `(x-2)(x+3)=0` → `x=2,x=-3`
- **Expected:** First supported error located (step 2); relevant intervention
- **Result:** **PASS**

| Run | Status | AI | Step verdicts (SymPy) | First error | LLM error type | Next action |
|---|---|---|---|---|---|---|
| 1 | `completed` | `ok` | supported, incorrect, supported | 2 | algebraic_transformation | targeted_practice |

AI text (explains only; SymPy decides):

- Run 1 explanation: In step 2, you incorrectly switched the signs of one solution. The correct factorization should have been \((x-2)(x+3)=0\).
  Hint: When expanding brackets, remember to apply the distributive property correctly.

**Reviewer note (human check of the AI text):** the SymPy result is right (step 2 `(x-2)(x+3)=0` does not follow; first error = step 2).
The LLM explanation is **wrong**: it calls the learner's own factorisation "the correct" one (the right one is `(x-2)(x-3)`).
This is the failure mode the design guards against: correctness comes only from SymPy, and the AI text is labelled as
explanation. Logged for prompt tuning (pass the expected factorisation / SymPy counter-example to the reviewer prompt).

Screen recording (clip.mp4): _not recorded yet — record by hand for the video (T8.4)._
