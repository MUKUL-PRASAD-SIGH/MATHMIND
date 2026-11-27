"""T3.3: quadratics, domain warnings, inequalities, out-of-scope -> inconclusive."""

import pytest

from app.schemas.verification import Overall, Verdict
from app.services.verification.parse import parse_step
from app.services.verification.verifier import verify_steps

pytestmark = pytest.mark.unit


@pytest.mark.parametrize("roots", ["x=2 \\text{ or } x=3", "x \\in \\{2,3\\}", "x=2, x=3", "x=3 \\text{ or } x=2"])
def test_root_notations_all_mean_the_same_set(roots: str) -> None:
    r = verify_steps(["x^2-5x+6=0", "(x-2)(x-3)=0", roots], None)
    assert [s.verdict for s in r.steps] == [Verdict.supported] * 3
    assert r.overall == Overall.correct


def test_root_notations_parse_identically() -> None:
    forms = ["x=2 \\text{ or } x=3", "x \\in \\{2,3\\}", "x=2, x=3"]
    assert len({parse_step(f) for f in forms}) == 1


def test_r2d_quadratic_with_inserted_mistake() -> None:
    r = verify_steps(["x^2-5x+6=0", "(x-2)(x-4)=0", "x=2 \\text{ or } x=4"], None)
    assert r.first_error_step == 2
    assert "from {2, 3} to {2, 4}" in r.steps[1].reason
    assert r.steps[2].verdict == Verdict.supported and r.steps[2].after_error


def test_division_by_variable_flags_lost_root() -> None:
    r = verify_steps(["x^2=3x", "x=3"], None)
    step = r.steps[1]
    assert step.verdict == Verdict.incorrect
    assert step.domain_warning is not None
    assert "possible division by zero" in step.domain_warning
    assert "lost solution x=0" in step.domain_warning


def test_squaring_introduces_extraneous_root_warning_not_error() -> None:
    r = verify_steps(["\\sqrt{x+2}=x", "x+2=x^2"], None)
    step = r.steps[1]
    assert step.verdict == Verdict.supported  # squaring is a valid step...
    assert step.domain_warning and "extraneous solution introduced" in step.domain_warning
    assert "x=-1" in step.domain_warning


def test_keeping_the_extraneous_root_in_the_final_answer_is_incorrect() -> None:
    r = verify_steps(["\\sqrt{x+2}=x", "x+2=x^2", "x^2-x-2=0", "x=-1 \\text{ or } x=2"], None)
    assert r.first_error_step == 4
    assert "does not satisfy the original equation" in r.steps[3].reason


def test_rejecting_the_extraneous_root_is_correct() -> None:
    r = verify_steps(["\\sqrt{x+2}=x", "x+2=x^2", "x^2-x-2=0", "x=2"], None)
    # x^2-x-2=0 -> x=2 drops x=-1, which is right: x=-1 does not satisfy the original equation.
    assert r.steps[3].verdict == Verdict.supported
    assert "extraneous" in r.steps[3].reason
    assert r.overall == Overall.correct


def test_sqrt_domain_restricts_solutions() -> None:
    # sqrt(x) = -1 has no real solution; squaring to x=1 is a valid step but x=1 is not an answer.
    r = verify_steps(["\\sqrt{x}=-1", "x=1"], None)
    assert r.steps[1].verdict == Verdict.incorrect
    assert "does not satisfy the original equation" in r.steps[1].reason


def test_log_domain() -> None:
    r = verify_steps(["\\ln x = 0", "x=1"], None)
    assert [s.verdict for s in r.steps] == [Verdict.supported, Verdict.supported]


def test_inequality_sign_flip_detected() -> None:
    r = verify_steps(["-2x>4", "x>-2"], None)
    assert r.first_error_step == 2
    assert verify_steps(["-2x>4", "x<-2"], None).overall == Overall.correct


def test_compound_inequality() -> None:
    assert verify_steps(["3<2x+1\\le 7", "2<2x\\le 6", "1<x\\le 3"], None).overall == Overall.correct


@pytest.mark.parametrize(
    "steps",
    [
        ["\\sin^2 x+\\cos^2 x", "1"],
        ["\\sin x = 0", "x = 0"],
        ["x+y=3", "x=3-y"],
        ["\\int x dx", "\\frac{x^2}{2}"],
    ],
)
def test_outside_scope_is_inconclusive_never_a_guess(steps: list[str]) -> None:
    r = verify_steps(steps, None)
    assert r.steps[1].verdict == Verdict.inconclusive
    assert "outside supported scope" in r.steps[1].reason
    assert r.overall == Overall.inconclusive


def test_multiplying_by_expression_adds_root_with_warning() -> None:
    r = verify_steps(["x=2", "x(x-1)=2(x-1)"], None)
    assert r.steps[1].verdict == Verdict.supported
    assert r.steps[1].domain_warning and "extraneous" in r.steps[1].domain_warning


def test_adding_a_root_without_squaring_is_incorrect() -> None:
    assert verify_steps(["2x=10", "x=5, x=7"], None).first_error_step == 2
