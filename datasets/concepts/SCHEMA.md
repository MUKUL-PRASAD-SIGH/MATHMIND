# Concept file format
File: datasets/concepts/concepts.json — a JSON array.
Each item:
{
  "id": "linear_equations",          // snake_case, unique
  "name": "Linear equations",
  "domain": "algebra",               // arithmetic | algebra | geometry | trigonometry | calculus | ...
  "description": "Equations of the form ax + b = c.",
  "prerequisites": ["algebraic_expressions", "fractions"]   // ids that exist in this file; [] if none
}
Rules: ids unique · prerequisites must exist · no cycles.
