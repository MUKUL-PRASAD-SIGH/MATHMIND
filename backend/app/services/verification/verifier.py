"""Deterministic step verifier (T3.2, T3.3). SymPy decides; when it can't, the verdict is ``inconclusive``.

Consecutive steps are compared:

* equation/inequality -> equation/inequality: compare ``solveset`` solution sets over the reals
  (equal -> supported; changed -> incorrect; roots *added* by squaring / multiplying by an expression ->
  supported with a ``domain_warning``; roots *lost* by dividing by an expression -> incorrect with a warning)
* expression -> expression: ``simplify(a-b) == 0`` -> supported; otherwise a numeric spot-check at 5
  rational points; a clear mismatch -> incorrect; otherwise inconclusive

Anything outside ``SUPPORTED_SCOPE.md`` (trig, calculus, several variables in an equation, ...) is
``inconclusive`` with the reason "outside supported scope". Never guess.
"""

import random
from dataclasses import dataclass

import sympy
from sympy import (
    Abs,
    And,
    ConditionSet,
    Dummy,
    FiniteSet,
    Interval,
    Or,
    Rational,
    S,
    Symbol,
    Union,
    exp,
    log,
)
from sympy.core.relational import Relational

from app.schemas.verification import Overall, StepVerdict, Verdict, VerificationResult
from app.services.jobs.stages import ProblemContext
from app.services.verification.parse import SympyTimeout, UnparseableStep, parse_step, with_timeout

VERIFIER_VERSION = f"sympy-{sympy.__version__}/verifier-1"
STEP_TIMEOUT_S = 2.0
OUT_OF_SCOPE = "outside supported scope"
_UNSUPPORTED = (sympy.Integral, sympy.Derivative, sympy.Limit, sympy.Sum, sympy.Product)
_SPOT_POINTS = 5
_TOL = 1e-9


@dataclass(frozen=True)
class Comparison:
    verdict: Verdict
    reason: str
    domain_warning: str | None = None


def _supported(reason: str, warning: str | None = None) -> Comparison:
    return Comparison(Verdict.supported, reason, warning)


def _incorrect(reason: str, warning: str | None = None) -> Comparison:
    return Comparison(Verdict.incorrect, reason, warning)


def _inconclusive(reason: str) -> Comparison:
    return Comparison(Verdict.inconclusive, reason)


# ---- helpers --------------------------------------------------------------------------------


def _is_statement(obj: sympy.Basic) -> bool:
    return isinstance(obj, Relational | And | Or)


def _is_solved_form(obj: sympy.Basic) -> bool:
    """``x=5`` or ``x=2 or x=3``: a variable alone on the left, numbers on the right."""
    eqs = obj.args if isinstance(obj, Or) else (obj,)
    return all(isinstance(e, sympy.Equality) and isinstance(e.lhs, Symbol) and e.rhs.is_number for e in eqs)


def _scope_problem(obj: sympy.Basic) -> str | None:
    if obj.has(*_UNSUPPORTED):
        return f"{OUT_OF_SCOPE} (calculus)"
    for fn in obj.atoms(sympy.Function):
        if not isinstance(fn, log | exp | Abs):
            return f"{OUT_OF_SCOPE} ({type(fn).__name__})"
    if obj.has(sympy.I, sympy.zoo, sympy.nan):
        return f"{OUT_OF_SCOPE} (complex or undefined value)"
    return None


def _fmt_num(v: sympy.Basic) -> str:
    if v is S.Infinity:
        return "inf"
    if v is S.NegativeInfinity:
        return "-inf"
    return sympy.sstr(v)


def fmt_set(s: sympy.Set) -> str:
    if s is S.EmptySet:
        return "no solution"
    if s is S.Reals:
        return "all real numbers"
    if isinstance(s, FiniteSet):
        return "{" + ", ".join(_fmt_num(v) for v in sorted(s.args, key=sympy.default_sort_key)) + "}"
    if isinstance(s, Interval):
        lo = "(" if s.left_open else "["
        hi = ")" if s.right_open else "]"
        return f"{lo}{_fmt_num(s.start)}, {_fmt_num(s.end)}{hi}"
    if isinstance(s, Union):
        return " or ".join(fmt_set(a) for a in s.args)
    return sympy.sstr(s)


def _is_simple(s: sympy.Set) -> bool:
    if s is S.EmptySet or s is S.Reals:
        return True
    if isinstance(s, FiniteSet):
        return all(v.is_number and v.is_real for v in s.args)
    if isinstance(s, Interval):
        return bool(s.start.is_number and s.end.is_number)
    if isinstance(s, Union):
        return all(_is_simple(a) for a in s.args)
    return False


def _roots_text(var: sympy.Basic, s: sympy.Set) -> str:
    if isinstance(s, FiniteSet):
        return ", ".join(f"{var}={_fmt_num(v)}" for v in sorted(s.args, key=sympy.default_sort_key))
    return f"{var} in {fmt_set(s)}"


def _solution_set(obj: sympy.Basic, var: sympy.Symbol, domain: sympy.Set) -> sympy.Set:
    if isinstance(obj, Or):
        return Union(*(_solution_set(a, var, domain) for a in obj.args))
    if isinstance(obj, And):
        out = domain
        for a in obj.args:
            out = out.intersect(_solution_set(a, var, domain))
        return out
    if isinstance(obj, sympy.Equality):
        return sympy.solveset(obj.lhs - obj.rhs, var, domain)
    return sympy.solveset(obj, var, domain)


def _equation_poly(obj: sympy.Basic) -> sympy.Expr | None:
    if isinstance(obj, sympy.Equality):
        return sympy.together(obj.lhs - obj.rhs)
    return None


def _degree(obj: sympy.Basic, var: sympy.Symbol) -> int | None:
    f = _equation_poly(obj)
    if f is None:
        return None
    try:
        return int(sympy.degree(sympy.numer(f), var))
    except Exception:
        return None


def _has_radical_or_abs(obj: sympy.Basic) -> bool:
    if obj.has(Abs):
        return True
    return any(p.exp.is_Rational and not p.exp.is_Integer for p in obj.atoms(sympy.Pow))


# ---- comparisons ----------------------------------------------------------------------------


def _single_variable(*objs: sympy.Basic) -> sympy.Symbol | str:
    """The one variable shared by the steps, a Dummy if there is none, or an error reason (str)."""
    syms: set[sympy.Basic] = set()
    for o in objs:
        syms |= o.free_symbols
    if len(syms) > 1:
        return f"{OUT_OF_SCOPE} (more than one variable)"
    if not syms:
        return Dummy("t", real=True)
    (var,) = syms
    assert isinstance(var, Symbol)  # noqa: S101
    return var


def compare_statements(prev: sympy.Basic, cur: sympy.Basic, domain: sympy.Set = S.Reals) -> Comparison:
    var = _single_variable(prev, cur)
    if isinstance(var, str):
        return _inconclusive(var)
    try:
        a = with_timeout(_solution_set, STEP_TIMEOUT_S, prev, var, domain)
        b = with_timeout(_solution_set, STEP_TIMEOUT_S, cur, var, domain)
    except SympyTimeout:
        return _inconclusive("took too long to check")
    if isinstance(a, ConditionSet) or isinstance(b, ConditionSet):
        return _inconclusive("SymPy could not solve this step exactly")
    if a == b:
        return _supported(f"Same solution set: {fmt_set(a)}")
    if not (_is_simple(a) and _is_simple(b)):
        return _inconclusive("could not compare the solution sets exactly")

    lost = sympy.Complement(a, b)
    gained = sympy.Complement(b, a)
    if lost is S.EmptySet and gained is S.EmptySet:
        return _supported(f"Same solution set: {fmt_set(a)}")
    changed = f"Solution set changed from {fmt_set(a)} to {fmt_set(b)}"

    if lost is S.EmptySet and gained is not S.EmptySet:
        deg_a, deg_b = _degree(prev, var), _degree(cur, var)
        raised = deg_a is not None and deg_b is not None and deg_b > deg_a
        if _has_radical_or_abs(prev) or raised:
            return _supported(
                "Valid step, but it can add solutions",
                f"extraneous solution introduced ({_roots_text(var, gained)}); check answers in the original",
            )
        return _incorrect(changed)

    if gained is S.EmptySet and lost is not S.EmptySet:
        fa, fb = _equation_poly(prev), _equation_poly(cur)
        if fa is not None and fb is not None and fb != 0:
            g = sympy.cancel(fa / fb)
            if g.has(var):
                return _incorrect(
                    changed,
                    f"possible division by zero (dividing by {sympy.sstr(sympy.factor(g))}); "
                    f"lost solution {_roots_text(var, lost)}",
                )
    return _incorrect(changed)


def _spot_points(n_vars: int) -> list[list[Rational]]:
    rng = random.Random(20260101)  # noqa: S311 -- deterministic sample points, not security
    points = []
    for _ in range(_SPOT_POINTS):
        points.append([Rational(rng.choice([-1, 1]) * rng.randint(1, 40), rng.randint(2, 9)) for _ in range(n_vars)])
    return points


def compare_expressions(prev: sympy.Expr, cur: sympy.Expr) -> Comparison:
    try:
        diff = with_timeout(sympy.simplify, STEP_TIMEOUT_S, prev - cur)
        if diff == 0:
            return _supported("Equivalent expression")
    except SympyTimeout:
        pass
    syms = sorted(prev.free_symbols | cur.free_symbols, key=sympy.default_sort_key)
    for point in _spot_points(len(syms)) if syms else [[]]:
        subs = dict(zip(syms, point, strict=True))
        va = sympy.N(prev.xreplace(subs), 30)
        vb = sympy.N(cur.xreplace(subs), 30)
        if not (va.is_real and vb.is_real and va.is_finite and vb.is_finite):
            continue
        if abs(va - vb) > _TOL * max(1, abs(va)):
            where = ", ".join(f"{s}={p}" for s, p in subs.items())
            at = f" at {where}" if where else ""
            return _incorrect(
                f"Not equal to the previous step{at}: {sympy.sstr(prev.xreplace(subs))} vs "
                f"{sympy.sstr(cur.xreplace(subs))}"
            )
    return _inconclusive("could not confirm the two expressions are equal")


def compare(prev: sympy.Basic, cur: sympy.Basic, domain: sympy.Set = S.Reals) -> Comparison:
    for obj in (prev, cur):
        scope = _scope_problem(obj)
        if scope:
            return _inconclusive(scope)
    try:
        if _is_statement(prev) and _is_statement(cur):
            return compare_statements(prev, cur, domain)
        if isinstance(prev, sympy.Expr) and isinstance(cur, sympy.Expr):
            return compare_expressions(prev, cur)
    except Exception as exc:  # SymPy raises many exception types on edge cases
        return _inconclusive(f"could not check this step ({type(exc).__name__})")
    return _inconclusive("cannot compare an equation with an expression")


# ---- public entry point -----------------------------------------------------------------------


def _try_parse(latex: str | None) -> sympy.Basic | None:
    if not latex:
        return None
    try:
        return parse_step(latex)
    except UnparseableStep:
        return None


def _as_comparable(expected: sympy.Basic, last: sympy.Basic) -> sympy.Basic:
    """Expected answer ``5`` against a final ``x=5``: turn it into ``x=5``."""
    if isinstance(expected, sympy.Expr) and _is_statement(last) and len(last.free_symbols) == 1:
        (var,) = last.free_symbols
        return sympy.Eq(var, expected, evaluate=False)
    return expected


def verify_steps(steps: list[str], problem: ProblemContext | None, domain: sympy.Set = S.Reals) -> VerificationResult:
    parsed: list[sympy.Basic | None] = []
    verdicts: list[StepVerdict] = []
    first_error: int | None = None
    start = _try_parse(problem.prompt_latex) if problem else None
    if start is not None and _scope_problem(start):
        start = None
    prev: sympy.Basic | None = start
    prev_index = 0  # 0 = the problem statement
    extraneous = False

    for i, latex in enumerate(steps, start=1):
        try:
            cur = parse_step(latex)
        except UnparseableStep as exc:
            parsed.append(None)
            verdicts.append(
                StepVerdict(
                    index=i,
                    latex=latex,
                    verdict=Verdict.inconclusive,
                    reason=f"Could not read this step: {exc.reason}",
                    after_error=first_error is not None,
                )
            )
            continue
        parsed.append(cur)

        if prev is None:
            scope = _scope_problem(cur)
            result = _inconclusive(scope) if scope else _supported("Starting point")
        else:
            result = compare(prev, cur, domain)
            if prev_index == 0 and result.verdict == Verdict.supported:
                result = Comparison(result.verdict, f"Matches the problem. {result.reason}", result.domain_warning)
            elif prev_index == 0 and result.verdict == Verdict.incorrect:
                result = Comparison(result.verdict, f"Differs from the problem. {result.reason}", result.domain_warning)
            if prev_index < i - 1 and result.verdict == Verdict.incorrect:
                result = _inconclusive(f"Something changed after step {prev_index}, but step {i - 1} could not be read")
            if result.verdict == Verdict.incorrect and extraneous and first_error is None:
                result = _check_rejected_extraneous(result, parsed, start, cur, domain)

        if result.domain_warning and "extraneous" in result.domain_warning:
            extraneous = True
        verdicts.append(
            StepVerdict(
                index=i,
                latex=latex,
                verdict=result.verdict,
                reason=result.reason,
                domain_warning=result.domain_warning,
                after_error=first_error is not None,
            )
        )
        if result.verdict == Verdict.incorrect and first_error is None:
            first_error = i
        prev, prev_index = cur, i

    if first_error is None and verdicts and parsed and parsed[-1] is not None:
        first_error = _check_final(verdicts, parsed, problem, start, extraneous, domain)

    if any(v.verdict == Verdict.incorrect for v in verdicts):
        overall = Overall.incorrect
    elif not verdicts or any(v.verdict == Verdict.inconclusive for v in verdicts):
        overall = Overall.inconclusive
    else:
        overall = Overall.correct
    return VerificationResult(
        steps=verdicts, first_error_step=first_error, overall=overall, verifier_version=VERIFIER_VERSION
    )


def _origin(parsed: list[sympy.Basic | None], start: sympy.Basic | None) -> sympy.Basic | None:
    return start if start is not None else next((p for p in parsed if p is not None), None)


def _check_rejected_extraneous(
    result: Comparison,
    parsed: list[sympy.Basic | None],
    start: sympy.Basic | None,
    cur: sympy.Basic,
    domain: sympy.Set,
) -> Comparison:
    """After squaring, dropping the extra root is correct if the set now matches the original equation."""
    origin = _origin(parsed, start)
    if origin is None or origin is cur or not (_is_statement(origin) and _is_statement(cur)):
        return result
    res = compare(origin, cur, domain)
    if res.verdict == Verdict.supported and not res.domain_warning:
        return _supported("Removes the extraneous solution; matches the original equation")
    return result


def _check_final(
    verdicts: list[StepVerdict],
    parsed: list[sympy.Basic | None],
    problem: ProblemContext | None,
    start: sympy.Basic | None,
    extraneous: bool,
    domain: sympy.Set,
) -> int | None:
    """Final-answer checks. Mutates the last verdict when the answer is definitely wrong."""
    last = parsed[-1]
    assert last is not None  # noqa: S101
    idx = len(verdicts)
    expected = _try_parse(problem.expected_answer_latex) if problem else None

    reason: str | None = None
    warning: str | None = None
    if expected is not None:
        res = compare(_as_comparable(expected, last), last, domain)
        if res.verdict == Verdict.incorrect and (_is_solved_form(last) or isinstance(last, sympy.Expr)):
            reason = "The final answer does not match the expected answer"
    if reason is None and extraneous and _is_solved_form(last):
        origin = _origin(parsed, start)
        if origin is not None and _is_statement(origin):
            res = compare(origin, last, domain)
            if res.domain_warning and "extraneous" in res.domain_warning:
                reason = "The final answer includes a value that does not satisfy the original equation"
                warning = res.domain_warning
    if reason is None:
        return None
    old = verdicts[-1]
    verdicts[-1] = old.model_copy(
        update={"verdict": Verdict.incorrect, "reason": reason, "domain_warning": warning or old.domain_warning}
    )
    return idx
