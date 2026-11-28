"""T3.2 / T3.3: step verifier. The bar: correct work is never called incorrect."""

import pytest
import sympy
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.schemas.verification import Overall, Verdict, VerificationResult
from app.services.jobs.stages import ProblemContext
from app.services.verification.verifier import verify_steps
from tests.test_contracts import assert_valid

pytestmark = pytest.mark.unit

R2A = ["3x+5=20", "3x=15", "x=5"]
R2B = ["2(x-3)=10", "2x-3=10", "2x=13", "x=6.5"]
R2D = ["x^2-5x+6=0", "(x-2)(x-4)=0", "x=2 \\text{ or } x=4"]
LIN = ProblemContext("lin-001", "linear_equations", "3x+5=20", "x=5")


def verdicts(r: VerificationResult) -> list[str]:
    return [s.verdict.value for s in r.steps]


# ---- T3.2 ---------------------------------------------------------------------------------------


def test_r2a_correct_linear_chain_all_supported() -> None:
    r = verify_steps(R2A, LIN)
    assert verdicts(r) == ["supported"] * 3
    assert r.overall == Overall.correct
    assert r.first_error_step is None


def test_r2b_sign_error_at_step_2() -> None:
    r = verify_steps(R2B, None)
    assert r.first_error_step == 2
    assert r.overall == Overall.incorrect
    step2 = r.steps[1]
    assert step2.verdict == Verdict.incorrect
    assert "from {8} to {13/2}" in step2.reason
    # later steps are still checked relative to each other, and flagged
    assert [s.verdict for s in r.steps[2:]] == [Verdict.supported, Verdict.supported]
    assert all(s.after_error for s in r.steps[2:])
    assert not r.steps[0].after_error


def test_arithmetic_slip_is_incorrect() -> None:
    r = verify_steps(["2x=10", "x=4"], None)
    assert verdicts(r) == ["supported", "incorrect"]
    assert r.first_error_step == 2


def test_reordered_equivalent_expression_supported() -> None:
    r = verify_steps(["2(x+1)+3x", "2x+2+3x", "5x+2", "2+5x"], None)
    assert verdicts(r) == ["supported"] * 4


def test_wrong_expression_rewrite_is_incorrect() -> None:
    r = verify_steps(["2(x+1)+3x", "5x+1"], None)
    assert r.steps[1].verdict == Verdict.incorrect
    assert "Not equal" in r.steps[1].reason


def test_numeric_expression_problem() -> None:
    problem = ProblemContext("int-001", "integer_arithmetic", "7-12", "-5")
    assert verify_steps(["7-12", "-5"], problem).overall == Overall.correct
    assert verify_steps(["7-12", "5"], problem).first_error_step == 2


def test_step_one_is_checked_against_the_problem() -> None:
    r = verify_steps(["3x+5=21", "3x=16"], LIN)
    assert r.first_error_step == 1
    assert "Differs from the problem" in r.steps[0].reason


def test_final_answer_checked_against_expected() -> None:
    problem = ProblemContext("p", "linear_equations", "Solve the equation", "x=5")
    r = verify_steps(["3x+5=21", "3x=16", "x=\\frac{16}{3}"], problem)
    assert r.first_error_step == 3
    assert "expected answer" in r.steps[2].reason


def test_expected_answer_as_bare_number() -> None:
    problem = ProblemContext("p", "linear_equations", "3x+5=20", "5")
    assert verify_steps(R2A, problem).overall == Overall.correct


def test_unreadable_step_is_inconclusive_and_neighbours_still_checked() -> None:
    r = verify_steps(["3x+5=20", "3x=", "x=5"], None)
    assert verdicts(r) == ["supported", "inconclusive", "supported"]
    assert r.overall == Overall.inconclusive


def test_error_across_an_unreadable_step_is_not_blamed() -> None:
    r = verify_steps(["3x+5=20", "3x=(", "x=4"], None)
    assert r.steps[2].verdict == Verdict.inconclusive
    assert r.first_error_step is None


def test_equation_vs_expression_inconclusive() -> None:
    r = verify_steps(["3x+5=20", "3x"], None)
    assert r.steps[1].verdict == Verdict.inconclusive


def test_empty_steps() -> None:
    r = verify_steps([], None)
    assert r.steps == [] and r.overall == Overall.inconclusive


@pytest.mark.parametrize("steps", [R2A, R2B, R2D, ["\\sin x=0"], ["x=(", "x=1"]])
def test_contract_output_validates_against_json_schema(steps: list[str]) -> None:
    assert_valid("VerificationResult", verify_steps(steps, None).model_dump(mode="json"))


# ---- property-based -----------------------------------------------------------------------------

X = sympy.Symbol("x", real=True)
nonzero = st.integers(-12, 12).filter(lambda n: n != 0)
small = st.integers(-30, 30)


def _chain(a: int, b: int, c: int, bump: tuple[int, int] = (0, 0)) -> list[str]:
    """ax+b=c -> ax=c-b -> x=(c-b)/a, with ``bump=(step, delta)`` adding delta to one coefficient."""
    step, d = bump
    eqs = [
        sympy.Eq(a * X + b + (d if step == 1 else 0), c, evaluate=False),
        sympy.Eq(a * X, c - b + (d if step == 2 else 0), evaluate=False),
        sympy.Eq(X, sympy.Rational(c - b, a) + (d if step == 3 else 0), evaluate=False),
    ]
    return [sympy.latex(e) for e in eqs]


@settings(max_examples=25, deadline=None, suppress_health_check=[HealthCheck.too_slow])
@given(nonzero, small, small)
def test_canonical_linear_chain_always_supported(a: int, b: int, c: int) -> None:
    steps = _chain(a, b, c)
    r = verify_steps(steps, ProblemContext("p", "linear_equations", steps[0], None))
    assert verdicts(r) == ["supported"] * 3, r


@settings(max_examples=25, deadline=None, suppress_health_check=[HealthCheck.too_slow])
@given(nonzero, small, small, st.integers(1, 3), nonzero)
def test_mutating_one_coefficient_is_incorrect_at_that_step(a: int, b: int, c: int, step: int, d: int) -> None:
    original = _chain(a, b, c)[0]
    r = verify_steps(_chain(a, b, c, (step, d)), ProblemContext("p", "linear_equations", original, None))
    assert r.first_error_step == step, r
    assert all(s.verdict == Verdict.supported for s in r.steps[: step - 1])
