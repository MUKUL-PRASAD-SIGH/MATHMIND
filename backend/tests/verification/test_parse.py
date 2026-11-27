"""T3.1: LaTeX normalization + parsing."""

from pathlib import Path
from typing import Any

import pytest
import sympy
import yaml
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from sympy import And, Or, Symbol

from app.services.verification.normalize import normalize_latex
from app.services.verification.parse import UnparseableStep, parse_expression, parse_step

pytestmark = pytest.mark.unit

CASES: dict[str, Any] = yaml.safe_load((Path(__file__).parent / "cases.yaml").read_text(encoding="utf-8"))
LETTERS = {c: Symbol(c, real=True) for c in "abcdfghjklmnpqrstuvwxyz"}


def _expected(text: str) -> sympy.Basic:
    return sympy.sympify(text, locals=LETTERS)


def _same(a: sympy.Basic, b: sympy.Basic) -> bool:
    if isinstance(a, Or | And):
        if type(a) is not type(b) or len(a.args) != len(b.args):
            return False
        return all(any(_same(x, y) for y in b.args) for x in a.args)
    if isinstance(a, sympy.core.relational.Relational):
        return type(a) is type(b) and sympy.simplify((a.lhs - a.rhs) - (b.lhs - b.rhs)) == 0
    return isinstance(b, sympy.Expr) and sympy.simplify(a - b) == 0


def test_case_table_is_big_enough() -> None:
    assert len(CASES["parse"]) >= 40


@pytest.mark.parametrize("case", CASES["parse"], ids=lambda c: c["latex"])
def test_parse_table(case: dict[str, str]) -> None:
    got = parse_step(case["latex"])
    want = _expected(case["expected"])
    assert _same(got, want), f"{case['latex']!r} -> {got} (expected {want})"


@pytest.mark.parametrize("latex", CASES["unparseable"])
def test_unparseable_raises_cleanly(latex: str) -> None:
    with pytest.raises(UnparseableStep) as info:
        parse_step(latex)
    assert info.value.reason


def test_symbols_are_real_and_e_is_eulers_number() -> None:
    expr = parse_expression("x+e")
    (x,) = expr.free_symbols
    assert x.is_real
    assert expr.has(sympy.E)


@pytest.mark.parametrize(
    ("raw", "clean"),
    [
        ("\\left( x \\right)", "( x )"),
        ("2\\,x\\!+\\;1", "2 x + 1"),
        ("\\dfrac{1}{2}.", "\\frac{1}{2}"),
        ("3 \\cdot 4 \\times 5 \\div 6", "3 * 4 * 5 / 6"),
        (chr(0x2212) + "x", "-x"),
        ("  x   =  1 ,", "x = 1"),
        ("\\scriptstyle 3x=15", "3x=15"),  # pix2tex emits sizing commands
    ],
)
def test_normalize(raw: str, clean: str) -> None:
    assert normalize_latex(raw) == clean


# ---- property-based round trip ------------------------------------------------------------------

X, Y = Symbol("x", real=True), Symbol("y", real=True)
coeff = st.integers(min_value=-9, max_value=9)


@st.composite
def polynomials(draw: st.DrawFn) -> sympy.Expr:
    terms = draw(st.lists(st.tuples(coeff, st.integers(0, 4), st.integers(0, 2)), min_size=1, max_size=4))
    return sympy.Add(*(c * X**i * Y**j for c, i, j in terms))


@settings(max_examples=60, deadline=None, suppress_health_check=[HealthCheck.too_slow])
@given(polynomials())
def test_round_trip_latex(poly: sympy.Expr) -> None:
    parsed = parse_step(sympy.latex(poly))
    assert isinstance(parsed, sympy.Expr)
    assert sympy.simplify(poly - parsed) == 0
