"""Every verifier/parser bug found becomes a test here (T3.3)."""

import pytest

from app.schemas.verification import Overall, Verdict
from app.services.verification.parse import parse_step
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


def test_dropping_an_extraneous_root_after_squaring_is_not_an_error() -> None:
    r = verify_steps(["\\sqrt{x+2}=x", "x+2=x^2", "x=2"], None)
    assert r.first_error_step is None
    assert r.steps[2].verdict == Verdict.supported
