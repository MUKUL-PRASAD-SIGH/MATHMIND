# Phase 3 — Mathematical Verification (Day 1–3) · Owner: M3

**Goal:** deterministic, tested step verification that returns `supported | incorrect | inconclusive`, never a false verdict.

---

## T3.1 — LaTeX normalization & parsing  🔴

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 4 h | T0.5 | T2.1, T1.* | T3.2, T4.1 |

**External:** `sympy`, `antlr4-python3-runtime==4.11.*` (the version must match SymPy's generated parser).

**Steps**
1. `services/verification/normalize.py`
   1. Strip `\left`/`\right`, `\,`, `\!`, `\displaystyle`, trailing `.`/`,`.
   2. Map `\cdot`, `\times` → `*`; `\div` → `/`; `−` (unicode) → `-`.
   3. Collapse whitespace and normalize `\dfrac` → `\frac`.
2. `parse.py`
   1. `parse_step(latex) → Equation | Expr | Relational`, splitting on a top-level `=` or `\le`/`\ge`/`<`/`>`.
   2. Wrap `parse_latex` in a 2 s timeout; raise `UnparseableStep(reason)` on failure.
   3. Symbol policy: single letters are real symbols, with `e` and `\pi` recognised as constants.
3. Fallback: if `parse_latex` fails, try `sympy.parsing.sympy_parser.parse_expr` with `implicit_multiplication_application` on a light LaTeX→text conversion.

**Tests**
- Unit, table-driven: ≥ 40 LaTeX strings → expected SymPy objects (fractions, powers, roots, implicit multiplication `2x`, `x^2`, `\sqrt{x+1}`, `\frac{a}{b}`).
- Unparseable inputs raise `UnparseableStep`, not a crash.
- **Property-based (Hypothesis):** generate random polynomial expressions → `latex()` → `parse_step` → `simplify(orig - parsed) == 0` (round-trip).

---

## T3.2 — Step verifier: linear equations & expressions  🔴

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 5 h | T3.1 | T2.3, T2.4 | T3.3, T3.4, T5.2 |

**Steps**
1. `verifier.py`, `verify_steps(steps: list[str], problem: Problem | None, domain=S.Reals) → VerificationResult`.
2. Equation → equation: compare `solveset(lhs-rhs, var, domain)` for consecutive steps.
   1. Equal sets → `supported`.
   2. Different sets → `incorrect`, with the reason "solution set changed from {…} to {…}".
   3. `ConditionSet`, timeout, or multiple variables without a declared target → `inconclusive`.
3. Expression → expression: `simplify(a-b)==0` → `supported`. If simplify is inconclusive, spot-check numerically at 5 random rational points; a mismatch → `incorrect`; otherwise `inconclusive`.
4. Final answer check: if `problem.expected_answer` is set, compare it with the last step.
5. `first_error_step` = the index of the first `incorrect` step. Steps after it are still verified *relative to each other* but flagged `after_error=True`.
6. Return a result matching the `VerificationResult` contract exactly.

**Tests**
- Unit: R2-A (correct linear chain → all supported), R2-B (sign error at step 2 → first_error_step=2).
- Unit: an equivalent but reordered expression → supported; an arithmetic slip `2x=10 → x=4` → incorrect.
- **Property-based:** for random linear equations `ax+b=c`, the canonical solution chain is always fully supported; mutating one coefficient gives `incorrect` at exactly that step.
- Contract: output validates against the JSON Schema.

---

## T3.3 — Extended rules: quadratics, domain checks, inconclusive

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 5 h | T3.2 | T4.1 | R2-D test case |

**Steps**
1. Quadratics: factorized form ↔ expanded form ↔ roots (`x=2 \text{ or } x=3`, `x \in \{2,3\}`, and `x=2, x=3` all parse to the same root set).
2. Domain warnings.
   1. Division by a symbolic expression: if a step divides both sides by `g(x)` and the solution set loses the roots of `g`, attach `domain_warning: "possible division by zero; lost solution x=…"`.
   2. Squaring both sides: extra roots → `domain_warning: "extraneous solution introduced"`.
   3. `\sqrt`, `\log`: restrict the domain and verify within it.
3. Inequalities: compare `solveset` intervals; a sign flip when multiplying by a negative is detected as `incorrect`.
4. Anything involving trig identities, multiple variables or unsupported functions → `inconclusive` with the reason "outside supported scope". **Never guess.**
5. Keep a `SUPPORTED_SCOPE.md` in `services/verification/` that lists exactly what is supported (this feeds the limitations doc).

**Tests**
- Unit: R2-D (quadratic with an inserted mistake), the division-by-x lost-root case, the squaring extraneous-root case, an inequality sign flip, a trig step → inconclusive.
- Regression: every bug found later becomes a test in `tests/verification/test_regressions.py`.

---

## T3.4 — Wire the verifier into the typed pipeline (**Milestone A**)  🔴

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 3 h | T3.2, T2.4 | T4.1 | T5.3, T6.3 |

**Steps**
1. Register `verify` as a stage in the job runner (M1 reviews).
2. Persist `solution_steps` and `evaluations.verification_json`.
3. Until T5.3 lands, the `reason` stage is a stub that sets `ai_status="unavailable"`, so the end-to-end flow already demonstrates graceful degradation.
4. Pair with M2: the "Check these steps" button (T1.7) shows per-step ✓ / ✗ / ? icons.

**Tests**
- Integration: `POST /submissions/typed` with the R2-A steps → poll → `completed_without_ai` with all steps supported.
- E2E smoke (M1 adds to Playwright): type 3 steps on the laptop layout → icons appear.

**Done when (Milestone A):** demoed live at the end of Day 3.
