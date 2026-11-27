"""Every verifier/parser bug found becomes a test here (T3.3)."""

import pytest
import sympy

from app.schemas.verification import Overall, Verdict
from app.services.jobs.stages import ProblemContext
from app.services.verification.parse import UnparseableStep, parse_step
from app.services.verification.verifier import verify_steps

pytestmark = pytest.mark.unit


def test_implicit_product_before_bracket_is_not_a_function_call() -> None:
    # parse_latex reads x(x-2) as a call of an unknown function "x", which made factorised
    # quadratics look out of scope.
    assert str(parse_step("x(x-2)=0")) == "Eq(x*(x - 2), 0)"
    assert verify_steps(["x^2-2x=0", "x(x-2)=0", "x=0, x=2"], None).overall == Overall.correct


def test_lenient_parser_does_not_drop_trailing_tokens() -> None:
    # parse_latex(strict=False) silently read "2x+" as 2x, which could turn an OCR truncation into a verdict.
    r = verify_steps(["3x+5=20", "2x+"], None)
    assert r.steps[1].verdict == Verdict.inconclusive


# Quadratic-formula items from M4's labelled dataset (copied, not loaded from datasets/): the verifier read
# `\pm` as unparseable, so the error was missed at step 2 (inconclusive) or blamed on a later step.
PM_ITEMS = {
    "quad-e-006": (
        "x^{2}-4x-1=0",
        ["x^{2}-4x-1=0", "x=\\frac{-4\\pm\\sqrt{16+4}}{2}", "x=\\frac{-4\\pm\\sqrt{20}}{2}", "x=-2\\pm\\sqrt{5}"],
    ),
    "quad-e-007": (
        "x^{2}+x-12=0",
        ["x^{2}+x-12=0", "x=\\frac{1\\pm\\sqrt{1+48}}{2}", "x=\\frac{1\\pm 7}{2}", "x=4 \\text{ or } x=-3"],
    ),
    "quad-e-008": (
        "2x^{2}-7x+3=0",
        ["2x^{2}-7x+3=0", "x=\\frac{7\\pm\\sqrt{49-24}}{2}", "x=\\frac{7\\pm 5}{2}", "x=6 \\text{ or } x=1"],
    ),
    "quad-e-009": (
        "x^{2}-6x+4=0",
        ["x^{2}-6x+4=0", "x=\\frac{6\\pm\\sqrt{36+16}}{2}", "x=\\frac{6\\pm\\sqrt{52}}{2}", "x=3\\pm\\sqrt{13}"],
    ),
}
PM_REFERENCE = {
    "quad-e-006": [
        "x^{2}-4x-1=0",
        "x=\\frac{4\\pm\\sqrt{16+4}}{2}",
        "x=\\frac{4\\pm\\sqrt{20}}{2}",
        "x=2\\pm\\sqrt{5}",
        "x=2+\\sqrt{5} \\text{ or } x=2-\\sqrt{5}",
    ],
    "quad-e-007": ["x^{2}+x-12=0", "x=\\frac{-1\\pm\\sqrt{1+48}}{2}", "x=\\frac{-1\\pm 7}{2}", "x=3 \\text{ or } x=-4"],
    "quad-e-009": [
        "x^{2}-6x+4=0",
        "x=\\frac{6\\pm\\sqrt{36-16}}{2}",
        "x=\\frac{6\\pm\\sqrt{20}}{2}",
        "x=3\\pm\\sqrt{5}",
    ],
}


@pytest.mark.parametrize("item", sorted(PM_ITEMS))
def test_quadratic_formula_error_found_at_step_2(item: str) -> None:
    prompt, steps = PM_ITEMS[item]
    r = verify_steps(steps, ProblemContext(item, "quadratic_equations", prompt, None))
    assert r.first_error_step == 2, r
    assert r.steps[1].verdict == Verdict.incorrect


@pytest.mark.parametrize("item", sorted(PM_REFERENCE))
def test_correct_quadratic_formula_chain_is_never_incorrect(item: str) -> None:
    steps = PM_REFERENCE[item]
    r = verify_steps(steps, ProblemContext(item, "quadratic_equations", steps[0], None))
    assert [s.verdict for s in r.steps] == [Verdict.supported] * len(steps), r
    assert r.overall == Overall.correct


def _root_values(latex: str) -> set[sympy.Basic]:
    parsed = parse_step(latex)
    assert isinstance(parsed, sympy.Or)
    return {sympy.simplify(eq.rhs) for eq in parsed.args}


def test_pm_parses_as_two_branches() -> None:
    assert _root_values("x=\\frac{1\\pm 7}{2}") == _root_values("x=4 \\text{ or } x=-3")
    assert _root_values("x=\\pm 3") == _root_values("x=3, x=-3")
    assert _root_values("x=1" + chr(0x00B1) + "2") == _root_values("x=3 \\text{ or } x=-1")  # unicode ±
    assert _root_values("x=2\\pm\\sqrt{5} \\text{ or } x=0") == _root_values("x=2+\\sqrt{5}, x=2-\\sqrt{5}, x=0")


def test_pm_outside_an_answer_is_not_guessed() -> None:
    with pytest.raises(UnparseableStep):
        parse_step("1\\pm 7")


def test_dropping_an_extraneous_root_after_squaring_is_not_an_error() -> None:
    r = verify_steps(["\\sqrt{x+2}=x", "x+2=x^2", "x=2"], None)
    assert r.first_error_step is None
    assert r.steps[2].verdict == Verdict.supported
