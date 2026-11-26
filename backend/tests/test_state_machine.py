import pytest

from app.schemas.submissions import SubmissionStatus as S
from app.services.jobs.state_machine import TRANSITIONS, IllegalTransition, can_transition, check_transition

pytestmark = pytest.mark.unit

LEGAL = [
    (S.received, S.verifying),
    (S.received, S.recognizing),
    (S.recognizing, S.awaiting_confirmation),
    (S.recognizing, S.verifying),
    (S.recognizing, S.failed_recognition),
    (S.awaiting_confirmation, S.verifying),
    (S.failed_recognition, S.verifying),
    (S.verifying, S.reasoning),
    (S.reasoning, S.completed),
    (S.reasoning, S.completed_without_ai),
    (S.completed, S.verifying),
    (S.failed, S.verifying),
]
ILLEGAL = [
    (S.received, S.completed),
    (S.recognizing, S.reasoning),
    (S.awaiting_confirmation, S.completed),
    (S.verifying, S.completed),  # must pass through reasoning
    (S.completed, S.awaiting_confirmation),
    (S.completed_without_ai, S.reasoning),
]


@pytest.mark.parametrize(("a", "b"), LEGAL)
def test_legal(a: S, b: S) -> None:
    assert can_transition(a, b)
    check_transition(a, b)


@pytest.mark.parametrize(("a", "b"), ILLEGAL)
def test_illegal(a: S, b: S) -> None:
    assert not can_transition(a, b)
    with pytest.raises(IllegalTransition):
        check_transition(a, b)


def test_every_status_has_an_entry() -> None:
    assert set(TRANSITIONS) == set(S)


def test_every_non_terminal_state_can_fail() -> None:
    for st in (S.received, S.recognizing, S.verifying, S.reasoning, S.awaiting_confirmation):
        assert can_transition(st, S.failed)
