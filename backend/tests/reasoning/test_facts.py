"""checker_facts: SymPy-expanded steps around the first error, for reviewer_v2."""

import pytest

from app.services.jobs.stages import ProblemContext, ReviewInput
from app.services.reasoning.facts import checker_facts
from app.services.reasoning.reviewer import build_input
from app.services.verification import verify_steps

pytestmark = pytest.mark.unit


def _facts(steps: list[str]) -> dict[str, str]:
    return checker_facts(steps, verify_steps(steps, None))


def test_bracket_not_expanded_gives_the_expanded_previous_step() -> None:
    facts = _facts(["2(x-3)=10", "2x-3=10", "2x=13", "x=6.5"])
    assert facts == {"previous_step_expanded": "2 x - 6 = 10"}


def test_wrong_factorisation_gives_the_expanded_error_step() -> None:
    facts = _facts(["x^2-5x+6=0", "(x-2)(x+3)=0", "x=2,x=-3"])
    assert facts == {"error_step_expanded": "x^{2} + x - 6 = 0"}


def test_no_facts_without_an_error_or_when_expansion_changes_nothing() -> None:
    assert _facts(["3x+5=20", "3x=15", "x=5"]) == {}
    assert _facts(["3x+5=20", "3x=16", "x=16/3"]) == {}


def test_unparseable_steps_give_no_facts_instead_of_failing() -> None:
    steps = ["2(x-3)=10", "x+?=", "x=1"]
    v = verify_steps(steps, None)
    assert isinstance(checker_facts(steps, v), dict)


def test_facts_are_in_the_reviewer_input() -> None:
    steps = ["2(x-3)=10", "2x-3=10"]
    problem = ProblemContext("p", "linear_equations", "2(x-3)=10", "x=8")
    data = ReviewInput(problem, steps, verify_steps(steps, problem), "linear_equations")
    assert build_input(data)["checker_facts"] == {"previous_step_expanded": "2 x - 6 = 10"}
