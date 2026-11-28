"""Unfinished-attempt check (T5.3): every step can be valid while the learner never reaches an answer.

``2x+3=13 -> 2x=10`` is correct so far, but it is not a solution, so the review must not call it ``correct``.
The verifier judges each step; this module only asks "did the work end in an answer?":

* equations / inequalities: the last line must be solved for a variable (``x=5``, ``x=2 or x=3``, ``x>3``);
* factorising: if the expected answer is a product, a last line that is still a sum is unfinished.

The check is deliberately conservative: when it cannot parse something it says nothing, so it can only ever
turn a ``correct`` into "not finished", never invent an error.
"""

import sympy
from sympy.logic.boolalg import And, Or

from app.schemas.verification import Overall, VerificationResult
from app.services.jobs.stages import ProblemContext
from app.services.verification import UnparseableStep, parse_step

INCOMPLETE_NOTE = "Correct so far, but the solution stops here"


def _parse(latex: str | None) -> sympy.Basic | None:
    if not latex:
        return None
    try:
        return parse_step(latex)
    except UnparseableStep:
        return None


def _is_statement(obj: sympy.Basic | None) -> bool:
    return isinstance(obj, sympy.core.relational.Relational | And | Or)


def _isolated(rel: sympy.Basic) -> bool:
    """One side is a lone variable and the other side does not contain it (``x=5``, ``7<x``, ``y=2x+1``)."""
    if not isinstance(rel, sympy.core.relational.Relational):
        return False
    lhs, rhs = rel.lhs, rel.rhs
    return (isinstance(lhs, sympy.Symbol) and not rhs.has(lhs)) or (isinstance(rhs, sympy.Symbol) and not lhs.has(rhs))


def is_solved_form(obj: sympy.Basic) -> bool:
    if isinstance(obj, Or | And):
        return all(is_solved_form(a) for a in obj.args)
    return _isolated(obj)


def _is_factored(obj: sympy.Basic) -> bool:
    return isinstance(obj, sympy.Mul) and any(isinstance(f, sympy.Add) for f in obj.args)


def unfinished_reason(steps: list[str], problem: ProblemContext | None) -> str | None:
    """A learner-facing reason if the work is valid but stops before an answer, else ``None``."""
    if not steps:
        return None
    last = _parse(steps[-1])
    if last is None:
        return None
    origin = _parse(problem.prompt_latex) if problem else None
    origin = origin if origin is not None else _parse(steps[0])
    expected = _parse(problem.expected_answer_latex) if problem else None

    if _is_statement(last) and (_is_statement(origin) or expected is not None) and not is_solved_form(last):
        names = sorted(str(s) for s in last.free_symbols)
        target = f"for {names[0]}" if len(names) == 1 else "for the unknown"
        return f"{INCOMPLETE_NOTE}: it is not yet solved {target}."
    if isinstance(last, sympy.Expr) and expected is not None and _is_factored(expected) and isinstance(last, sympy.Add):
        return f"{INCOMPLETE_NOTE}: the expression is not factorised yet."
    return None


def mark_unfinished(
    verification: VerificationResult, steps: list[str], problem: ProblemContext | None
) -> tuple[VerificationResult, bool]:
    """Turn an all-valid but unfinished attempt into a not-correct result.

    Expressed with the existing contract: ``overall`` becomes ``incorrect`` (the problem is not solved) while every
    step keeps its ``supported`` verdict, ``first_error_step`` stays ``null`` (no step is wrong) and the last step's
    ``reason`` says the work stops early. The review then carries ``error_type: "incomplete"``.
    """
    if verification.overall != Overall.correct or not verification.steps:
        return verification, False
    reason = unfinished_reason(steps, problem)
    if reason is None:
        return verification, False
    last = verification.steps[-1]
    steps_out = [
        *verification.steps[:-1],
        last.model_copy(update={"reason": f"{last.reason.rstrip('.')}. {reason}"[:600]}),
    ]
    return verification.model_copy(update={"steps": steps_out, "overall": Overall.incorrect}), True
