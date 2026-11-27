"""T6.3: mastery formula, evidence scores, clamping and properties."""

from datetime import UTC, datetime

import pytest
from hypothesis import given
from hypothesis import strategies as st

from app.schemas.learning import ConfidenceLevel
from app.schemas.verification import Overall, StepVerdict, Verdict, VerificationResult
from app.services.adaptation.mastery import (
    INITIAL_MASTERY,
    MasteryState,
    apply_evidence,
    confidence_level,
    score_from_evidence,
    update_mastery,
)

pytestmark = pytest.mark.unit


def result(overall: Overall, n_steps: int = 4, first_error: int | None = None) -> VerificationResult:
    steps = [
        StepVerdict(
            index=i, latex="x=1", verdict=Verdict.incorrect if i == first_error else Verdict.supported, reason=""
        )
        for i in range(1, n_steps + 1)
    ]
    return VerificationResult(steps=steps, first_error_step=first_error, overall=overall)


@pytest.mark.parametrize(
    ("verification", "hints", "attempts", "expected"),
    [
        (result(Overall.correct), 0, 1, 1.0),
        (result(Overall.correct), 1, 1, 0.8),
        (result(Overall.correct), 2, 1, 0.6),
        (result(Overall.correct), 5, 1, 0.6),
        (result(Overall.correct), 0, 2, 0.8),  # a second try counts like one hint
        (result(Overall.incorrect, 4, first_error=4), 0, 1, 0.3),  # partial: error late
        (result(Overall.incorrect, 6, first_error=5), 0, 1, 0.3),
        (result(Overall.incorrect, 4, first_error=2), 0, 1, 0.0),
        (result(Overall.incorrect, 3, first_error=2), 0, 1, 0.0),
        (result(Overall.inconclusive), 0, 1, None),
    ],
)
def test_score_from_evidence(
    verification: VerificationResult, hints: int, attempts: int, expected: float | None
) -> None:
    assert score_from_evidence(verification, hints, attempts) == expected


def test_update_formula() -> None:
    assert update_mastery(0.3, 1.0) == pytest.approx(0.51)
    assert update_mastery(0.5, 0.0) == pytest.approx(0.35)
    assert INITIAL_MASTERY == 0.3


def test_update_is_clamped() -> None:
    assert update_mastery(1.5, 1.0) == 1.0
    assert update_mastery(-1.0, 0.0) == 0.0


def test_inconclusive_leaves_mastery_unchanged() -> None:
    state = MasteryState(mastery=0.42, attempts=3)
    assert apply_evidence(state, result(Overall.inconclusive)) == state


def test_apply_evidence_counts_attempts_and_time() -> None:
    now = datetime(2026, 1, 1, tzinfo=UTC)
    state = apply_evidence(MasteryState(), result(Overall.correct), now=now)
    assert state.mastery == pytest.approx(0.51)
    assert state.attempts == 1 and state.last_practised_at == now


@pytest.mark.parametrize(
    ("attempts", "level"),
    [(0, "low"), (2, "low"), (3, "medium"), (6, "medium"), (7, "high")],
)
def test_confidence_level(attempts: int, level: str) -> None:
    assert confidence_level(attempts) == ConfidenceLevel(level)
    assert MasteryState(attempts=attempts).confidence_level == ConfidenceLevel(level)


scores = st.sampled_from([0.0, 0.3, 0.6, 0.8, 1.0]) | st.floats(0, 1)


@given(st.floats(0, 1), st.lists(scores, max_size=60))
def test_mastery_stays_in_unit_interval(m0: float, seq: list[float]) -> None:
    m = m0
    for s in seq:
        m = update_mastery(m, s)
        assert 0.0 <= m <= 1.0


@given(st.floats(0, 0.99), st.integers(1, 80))
def test_repeated_success_converges_to_one_monotonically(m0: float, n: int) -> None:
    m, prev = m0, m0
    for _ in range(n):
        m = update_mastery(m, 1.0)
        assert m >= prev
        prev = m
    assert 1 - m <= (1 - m0) * 0.7**n + 1e-12
