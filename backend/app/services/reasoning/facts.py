"""Deterministic facts for the reviewer prompt (reviewer_v2).

A 3B model given only "solution set changed from {8} to {13/2}" guessed the wrong cause on the demo problem
(R2-B, R2-D evidence). These facts are computed by SymPy, never by the model: the step before the first error and
the error step with brackets multiplied out. They are included only when expanding actually changes the step, so the
model sees e.g. ``2x - 6 = 10`` next to the learner's ``2x-3=10``.
"""

import re

import sympy

from app.schemas.verification import VerificationResult
from app.services.verification.parse import parse_step, with_timeout

FACT_TIMEOUT = 1.0


def _expanded(latex: str) -> str | None:
    """The step with products and powers multiplied out, as LaTeX; None if that changes nothing or fails."""
    try:
        obj = with_timeout(parse_step, FACT_TIMEOUT, latex)
    except Exception:  # facts are optional: an unparseable or slow step just gets none
        return None
    if isinstance(obj, sympy.Equality):
        out: sympy.Basic = sympy.Eq(sympy.expand(obj.lhs), sympy.expand(obj.rhs), evaluate=False)
    elif isinstance(obj, sympy.Expr):
        out = sympy.expand(obj)
    else:
        return None
    text = str(sympy.latex(out))
    # SymPy distributes 2(x-3) while parsing, so compare with what the learner wrote, not with the parsed object.
    if _squash(text) == _squash(latex):
        return None
    return text


def _squash(latex: str) -> str:
    return re.sub(r"\\left|\\right|\\cdot|[\s{}]", "", latex)


def checker_facts(steps: list[str], verification: VerificationResult) -> dict[str, str]:
    k = verification.first_error_step
    if k is None or k < 2 or k > len(steps):
        return {}
    facts: dict[str, str] = {}
    before = _expanded(steps[k - 2])
    if before:
        facts["previous_step_expanded"] = before
    at = _expanded(steps[k - 1])
    if at:
        facts["error_step_expanded"] = at
    return facts
