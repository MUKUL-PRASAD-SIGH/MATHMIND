# Labelled solution format
File: datasets/labelled_solutions/<concept_id>/<id>.json — one item per file.
{
  "id": "lin-e-007",                  // <concept short>-<c|e>-<3 digits>  (c = correct, e = has error)
  "concept_id": "linear_equations",
  "problem_latex": "2(x-3) = 10",
  "reference_solution": ["2(x-3)=10", "2x-6=10", "2x=16", "x=8"],
  "learner_attempt":    ["2(x-3)=10", "2x-3=10", "2x=13", "x=6.5"],
  "expected_correct": false,
  "first_error_step": 2,              // 1-based index into learner_attempt; null if correct
  "error_type": "algebraic_transformation",
  "expected_intervention": "targeted_practice",
  "has_handwriting_image": false,     // true if datasets/handwriting_samples/<id>.png exists
  "notes": "Distributed 2 only to x."
}
error_type ∈ arithmetic_slip | algebraic_transformation | sign_error | formula_selection |
             domain_violation | missing_prerequisite | incomplete | other
expected_intervention ∈ continue | increase_difficulty | targeted_practice | prerequisite_review |
                        worked_example | schedule_revision | ask_another_question

## Conventions
- Each step is one LaTeX equation (equation problems) or one expression equal to the problem (simplify /
  factorise problems). Step 1 of both lists restates `problem_latex`.
- Several roots: `x=2 \text{ or } x=3`. `\pm` may appear inside a step (`x=\frac{4\pm\sqrt{20}}{2}`).
- Juxtaposition is multiplication: `x(x-2)` means `x \cdot (x-2)`, not a function call.
- Error items contain exactly one mistake. Steps before `first_error_step` are equivalent to the problem
  (same real solution set, or same value), that step is not, and every later step follows validly from it.
- `incomplete` items: every step is valid but the learner stops before the answer, so `expected_correct` is
  false and `first_error_step` is null.
- Correct items use `error_type: null` and `expected_intervention: "continue"`.
