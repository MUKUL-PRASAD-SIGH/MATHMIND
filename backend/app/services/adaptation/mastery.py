"""Concept mastery estimate (T6.3). ``M_new = 0.7 * M_old + 0.3 * S``, clamped to 0..1, starting at 0.3.

Evidence score S from one verified attempt:
correct, no hints -> 1.0 | correct after 1 hint -> 0.8 | after >= 2 hints -> 0.6 |
partial (first error late in the solution) -> 0.3 | incorrect -> 0.0 | inconclusive -> no update.
A repeat attempt on the same problem counts like one extra hint.
"""

from dataclasses import dataclass, replace
from datetime import datetime

from app.schemas.learning import ConfidenceLevel
from app.schemas.verification import Overall, VerificationResult

INITIAL_MASTERY = 0.3
DECAY = 0.7
LATE_ERROR_MIN_STEP = 3


def score_from_evidence(verification: VerificationResult, hints_used: int = 0, attempts: int = 1) -> float | None:
    if verification.overall == Overall.inconclusive:
        return None
    if verification.overall == Overall.correct:
        help_used = max(0, hints_used) + max(0, attempts - 1)
        return 1.0 if help_used == 0 else 0.8 if help_used == 1 else 0.6
    first = verification.first_error_step
    n = len(verification.steps)
    if first is not None and first >= LATE_ERROR_MIN_STEP and first > n / 2:
        return 0.3  # partial: most of the method was right
    return 0.0


def update_mastery(m_old: float, s: float) -> float:
    return min(1.0, max(0.0, DECAY * m_old + (1 - DECAY) * s))


def confidence_level(attempts: int) -> ConfidenceLevel:
    if attempts < 3:
        return ConfidenceLevel.low
    if attempts <= 6:
        return ConfidenceLevel.medium
    return ConfidenceLevel.high


@dataclass(frozen=True)
class MasteryState:
    mastery: float = INITIAL_MASTERY
    attempts: int = 0
    last_practised_at: datetime | None = None

    @property
    def confidence_level(self) -> ConfidenceLevel:
        return confidence_level(self.attempts)


def apply_evidence(
    state: MasteryState,
    verification: VerificationResult,
    hints_used: int = 0,
    attempts: int = 1,
    now: datetime | None = None,
) -> MasteryState:
    """What the ``learning_event`` consumer stores. Inconclusive evidence changes nothing (the event is still
    logged by the caller)."""
    s = score_from_evidence(verification, hints_used, attempts)
    if s is None:
        return state
    return replace(
        state,
        mastery=update_mastery(state.mastery, s),
        attempts=state.attempts + 1,
        last_practised_at=now or state.last_practised_at,
    )
