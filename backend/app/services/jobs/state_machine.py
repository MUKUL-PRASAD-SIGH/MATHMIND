"""Explicit submission status transitions (docs/02-architecture.md section 5)."""

from app.schemas.submissions import SubmissionStatus as S


class IllegalTransition(Exception):
    def __init__(self, current: str, new: str) -> None:
        super().__init__(f"illegal transition {current} -> {new}")
        self.current = current
        self.new = new


TRANSITIONS: dict[S, frozenset[S]] = {
    S.received: frozenset({S.recognizing, S.verifying, S.failed}),
    S.recognizing: frozenset({S.awaiting_confirmation, S.verifying, S.failed_recognition, S.failed}),
    S.awaiting_confirmation: frozenset({S.verifying, S.failed}),
    S.failed_recognition: frozenset({S.awaiting_confirmation, S.verifying, S.failed}),
    S.verifying: frozenset({S.reasoning, S.failed}),
    S.reasoning: frozenset({S.completed, S.completed_without_ai, S.failed}),
    # Re-review (POST /review) restarts verification from a finished submission.
    S.completed: frozenset({S.verifying}),
    S.completed_without_ai: frozenset({S.verifying}),
    S.failed: frozenset({S.verifying, S.recognizing}),
}

NON_TERMINAL: frozenset[S] = frozenset({S.received, S.recognizing, S.verifying, S.reasoning})


def can_transition(current: str, new: str) -> bool:
    return S(new) in TRANSITIONS.get(S(current), frozenset())


def check_transition(current: str, new: str) -> None:
    if not can_transition(current, new):
        raise IllegalTransition(current, new)
