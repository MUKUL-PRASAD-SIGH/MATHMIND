# Problem file format
File: datasets/problems/<concept_id>.json — a JSON array.
Each item:
{
  "id": "lin-001",                    // <concept short>-<3 digits>, unique
  "concept_id": "linear_equations",
  "prompt_latex": "3x + 5 = 20",
  "expected_answer_latex": "x = 5",
  "difficulty": 1                     // 1 (easy) .. 5 (hard)
}
Rules: answer checked by hand AND with SymPy.

## Conventions
- Concept short names: `int` integer_arithmetic · `frac` fractions · `alg` algebraic_expressions · `exp` exponents ·
  `lin` linear_equations · `fact` factorization · `quad` quadratic_equations.
- `prompt_latex` is the bare expression or equation; the task (simplify / factorise / solve for x) follows from the concept.
- An answer with several roots is written `x=2 \text{ or } x=3`.
