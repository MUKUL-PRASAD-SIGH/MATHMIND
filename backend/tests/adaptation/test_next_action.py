"""T6.4: one test per rule, a tie-break test, the revision queue and a simulated learner."""

from datetime import UTC, datetime, timedelta

import pytest

from app.schemas.learning import Concept, Problem
from app.schemas.review import ErrorType, RecommendedAction
from app.schemas.verification import Overall, StepVerdict, Verdict, VerificationResult
from app.services.adaptation.mastery import MasteryState, apply_evidence
from app.services.adaptation.next_action import (
    AttemptRecord,
    due_revisions,
    next_action,
    pick_problem,
    schedule_revision,
    target_difficulty,
)

pytestmark = pytest.mark.unit

A = RecommendedAction
C, I, Q = Overall.correct, Overall.incorrect, Overall.inconclusive  # noqa: E741 -- reads like a results table
LIN = "linear_equations"

GRAPH = [
    Concept(id="integer_arithmetic", name="Integer arithmetic", domain="arithmetic"),
    Concept(id="fractions", name="Fractions", domain="arithmetic"),
    Concept(id=LIN, name="Linear equations", domain="algebra", prerequisites=["integer_arithmetic", "fractions"]),
    Concept(id="quadratics", name="Quadratics", domain="algebra", prerequisites=[LIN]),
]
PROBLEMS = [
    Problem(id=f"{cid[:3]}-{d}{k}", concept_id=cid, prompt_latex="x=1", difficulty=d)
    for cid in ("integer_arithmetic", "fractions", LIN, "quadratics")
    for d in range(1, 6)
    for k in ("a", "b")
]


def att(outcome: Overall, pid: str | None = None, **kw: object) -> AttemptRecord:
    return AttemptRecord(concept_id=str(kw.pop("concept_id", LIN)), outcome=outcome, problem_id=pid, **kw)  # type: ignore[arg-type]


def profile(**m: float) -> dict[str, MasteryState]:
    return {k: MasteryState(mastery=v, attempts=5) for k, v in m.items()}


def act(history: list[AttemptRecord], prof: dict[str, MasteryState] | None = None):  # type: ignore[no-untyped-def]
    return next_action(prof or {}, history, GRAPH, PROBLEMS)


# ---- one test per rule -------------------------------------------------------------------------------


def test_rule1_few_attempts_asks_another_question() -> None:
    r = act([att(C, "lin-3a")], profile(linear_equations=0.9))
    assert r.action == A.ask_another_question
    assert r.concept_id == LIN and r.problem_id and r.problem_id != "lin-3a"
    assert r.reason


def test_rule1_inconclusive_evidence_makes_no_strong_claim() -> None:
    r = act([att(C), att(C), att(C), att(Q)], profile(linear_equations=0.9))
    assert r.action == A.ask_another_question
    assert "couldn't fully check" in r.reason


def test_rule2_three_correct_and_mastered_increases_difficulty() -> None:
    hist = [att(C, "lin-2a"), att(C, "lin-3a"), att(C, "lin-4a")]
    r = act(hist, profile(linear_equations=0.85))
    assert r.action == A.increase_difficulty and r.concept_id == LIN
    assert r.problem_id == "lin-5a"
    assert "3 linear equations problems in a row" in r.reason


def test_rule2_unlocks_next_concept_when_no_harder_problem_left() -> None:
    hist = [att(C, p) for p in ("lin-5a", "lin-5b", "lin-4a", "lin-4b")]
    r = act(hist, profile(linear_equations=0.9))
    assert r.action == A.increase_difficulty
    assert r.concept_id == "quadratics"


def test_rule2_needs_mastery_not_just_a_streak() -> None:
    r = act([att(C), att(C), att(C)], profile(linear_equations=0.7))
    assert r.action == A.continue_


def test_rule3_repeated_conceptual_errors_review_weakest_prerequisite() -> None:
    hist = [att(I, error_type=ErrorType.missing_prerequisite), att(C), att(I, error_type=ErrorType.formula_selection)]
    r = act(hist, profile(linear_equations=0.4, integer_arithmetic=0.5, fractions=0.35))
    assert r.action == A.prerequisite_review
    assert r.concept_id == "fractions"
    assert r.problem_id and r.problem_id.startswith("fra-")


def test_rule3_falls_through_when_prerequisites_are_strong() -> None:
    hist = [att(I, error_type=ErrorType.missing_prerequisite), att(I, error_type=ErrorType.formula_selection)]
    r = act(hist, profile(integer_arithmetic=0.9, fractions=0.8))
    assert r.action != A.prerequisite_review


def test_rule4_arithmetic_slip_inside_a_solution_is_targeted_practice() -> None:
    r = act([att(C), att(I, error_type=ErrorType.arithmetic_slip, first_error_step=3)])
    assert r.action == A.targeted_practice and r.concept_id == LIN
    assert "step 3" in r.reason


def test_rule5_correct_after_two_hints_schedules_revision() -> None:
    r = act([att(I), att(C, hints_used=2)])
    assert r.action == A.schedule_revision and r.concept_id == LIN
    assert "tomorrow" in r.reason


def test_rule6_improved_after_revision_returns_to_topic() -> None:
    r = act([att(I), att(C, hints_used=2), att(C, "lin-2a", after_revision=True)])
    assert r.action == A.continue_ and r.concept_id == LIN
    assert "improved after revising" in r.reason
    assert r.problem_id != "lin-2a"


def test_default_continue_at_level() -> None:
    r = act([att(I), att(I)], profile(linear_equations=0.5))
    assert r.action == A.continue_
    assert r.problem_id == "lin-3a"  # round(1 + 4*0.5) = 3


def test_first_match_wins_uncertain_before_everything() -> None:
    hist = [att(I, error_type=ErrorType.missing_prerequisite)]
    assert act(hist, profile(fractions=0.1)).action == A.ask_another_question


def test_empty_history_starts_at_a_root_concept() -> None:
    r = act([])
    assert r.action == A.ask_another_question and r.concept_id == "integer_arithmetic"


# ---- tie-breaks and helpers -------------------------------------------------------------------------------


def test_tie_break_prerequisites_by_graph_order_and_problems_by_difficulty_then_id() -> None:
    hist = [att(I, error_type=ErrorType.algebraic_transformation)] * 2
    r = act(hist, profile(integer_arithmetic=0.4, fractions=0.4))
    assert r.concept_id == "integer_arithmetic"  # equal mastery -> first in the graph
    probs = [p for p in PROBLEMS if p.concept_id == LIN]
    assert pick_problem(probs, LIN, set(), target=3) is not None
    assert pick_problem(probs, LIN, set(), target=3).id == "lin-3a"  # type: ignore[union-attr]
    assert pick_problem(probs, LIN, {"lin-3a", "lin-3b"}, target=3).id == "lin-2a"  # type: ignore[union-attr]


def test_target_difficulty() -> None:
    assert [target_difficulty(m) for m in (0.0, 0.3, 0.5, 0.8, 1.0)] == [1, 2, 3, 4, 5]


def test_revision_queue() -> None:
    now = datetime(2026, 1, 1, 9, tzinfo=UTC)
    item = schedule_revision(GRAPH[2], now)
    assert item.due_at == now + timedelta(days=1)
    assert due_revisions([item], now) == []
    assert due_revisions([item], now + timedelta(days=1, minutes=1)) == [item]


# ---- simulated learner ---------------------------------------------------------------------------------------


def _verification(outcome: Overall) -> VerificationResult:
    first = 2 if outcome == I else None
    steps = [StepVerdict(index=i, latex="x", verdict=Verdict.supported, reason="") for i in (1, 2, 3)]
    return VerificationResult(steps=steps, first_error_step=first, overall=outcome)


def test_simulated_learner_sequence() -> None:
    script: list[tuple[Overall, dict[str, object]]] = [
        (C, {}),
        (I, {"error_type": ErrorType.arithmetic_slip, "first_error_step": 3}),
        (C, {"hints_used": 2}),
        (C, {"after_revision": True}),
        (C, {}),
        (C, {}),
    ]
    expected = [
        A.ask_another_question,  # 1 attempt: no strong claim (M 0.72)
        A.targeted_practice,  # arithmetic slip (M 0.50)
        A.schedule_revision,  # correct with 2 hints (M 0.53)
        A.continue_,  # improved after revision -> transfer problem (M 0.67)
        A.continue_,  # 3 correct in a row but M 0.77 < 0.8
        A.increase_difficulty,  # 3 in a row and M 0.84 >= 0.8
    ]
    prof: dict[str, MasteryState] = {LIN: MasteryState(mastery=0.6)}
    history: list[AttemptRecord] = []
    actions = []
    for outcome, extra in script:
        rec = next_action(prof, history, GRAPH, PROBLEMS, concept_id=LIN)
        hints = int(extra.get("hints_used", 0))  # type: ignore[call-overload]
        history.append(AttemptRecord(LIN, outcome, problem_id=rec.problem_id, **extra))  # type: ignore[arg-type]
        prof[LIN] = apply_evidence(prof[LIN], _verification(outcome), hints_used=hints)
        actions.append(next_action(prof, history, GRAPH, PROBLEMS).action)
    assert actions == expected
    assert prof[LIN].mastery >= 0.8
