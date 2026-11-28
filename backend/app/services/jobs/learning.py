"""Learning events -> mastery, revision queue and next action (T5.3 step 4, T6.5), using M3's adaptation engine.

``record_attempt`` is the ``learning_event`` consumer: the runner calls it once a review finishes. It logs the event,
updates ``mastery_profiles`` with ``apply_evidence`` (inconclusive evidence: event only, no update) and keeps the
revision queue in step with ``next_action``. The learner endpoints use the same inputs, so ``/next`` explains the
same evidence the pipeline stored.
"""

import logging
from datetime import UTC, datetime

from sqlmodel import Session

from app.models import LearningEventRow, MasteryProfileRow, SubmissionRow, utcnow
from app.repositories import learning as repo
from app.schemas.learning import Concept, NextAction, Problem
from app.schemas.review import ErrorType, RecommendedAction
from app.schemas.verification import Overall, VerificationResult
from app.services.adaptation import (
    AttemptRecord,
    MasteryState,
    apply_evidence,
    next_action,
    schedule_revision,
    score_from_evidence,
    update_mastery,
)
from app.services.adaptation.mastery import INITIAL_MASTERY

log = logging.getLogger(__name__)

# Every step valid but no final answer: "partially correct" in 02-architecture.md section 9.
UNFINISHED_SCORE = 0.3
CORRECT_MIN_SCORE = 0.6  # the lowest score apply_evidence gives a correct attempt


def aware(dt: datetime) -> datetime:
    """SQLite drops the timezone; every stored time is UTC."""
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def _error_type(value: str | None) -> ErrorType | None:
    try:
        return ErrorType(value) if value else None
    except ValueError:
        return None


def _outcome(event: LearningEventRow, verification: dict[str, object] | None) -> Overall:
    if verification and verification.get("overall") in set(Overall):
        return Overall(str(verification["overall"]))
    if event.score is None:
        return Overall.inconclusive
    return Overall.correct if event.score >= CORRECT_MIN_SCORE else Overall.incorrect


def history(s: Session, user_id: str) -> list[AttemptRecord]:
    out: list[AttemptRecord] = []
    for event, sub, ev in repo.attempt_events(s, user_id):
        if not event.concept_id:
            continue
        verification = ev.verification if ev else None
        first = verification.get("first_error_step") if verification else None
        out.append(
            AttemptRecord(
                concept_id=event.concept_id,
                outcome=_outcome(event, verification),
                problem_id=sub.problem_id if sub else None,
                error_type=_error_type(event.error_type),
                first_error_step=first if isinstance(first, int) else None,
                hints_used=event.hints_used,
                after_revision=event.kind == "revision",
            )
        )
    return out


def profile(s: Session, user_id: str) -> dict[str, MasteryState]:
    return {
        m.concept_id: MasteryState(mastery=m.mastery, attempts=m.attempts, last_practised_at=aware(m.updated_at))
        for m, _ in repo.list_mastery(s, user_id)
    }


def concept_graph(s: Session) -> list[Concept]:
    return [
        Concept(id=c.id, name=c.name, domain=c.domain, description=c.description, prerequisites=pre)
        for c, pre in repo.list_concepts(s)
    ]


def problem_bank(s: Session, concept_id: str | None = None) -> list[Problem]:
    return [
        Problem(
            id=p.id,
            concept_id=p.concept_id,
            prompt_latex=p.prompt_latex,
            expected_answer_latex=p.expected_answer_latex,
            difficulty=p.difficulty,
        )
        for p in repo.list_problems(s, concept_id)
    ]


def recommend(s: Session, user_id: str, concept_id: str | None = None) -> NextAction | None:
    graph = concept_graph(s)
    if not graph:
        return None
    return next_action(profile(s, user_id), history(s, user_id), graph, problem_bank(s), concept_id)


def prior_errors(s: Session, user_id: str, concept_id: str, limit: int = 3) -> list[str]:
    errors = [str(a.error_type) for a in history(s, user_id) if a.concept_id == concept_id and a.error_type]
    return errors[-limit:]


def record_attempt(
    s: Session,
    sub: SubmissionRow,
    concept_id: str | None,
    verification: VerificationResult,
    error_type: ErrorType | None,
    unfinished: bool,
    now: datetime | None = None,
) -> LearningEventRow | None:
    """Store one learning event for a finished review and apply it. Re-reviews don't count twice."""
    now = now or utcnow()
    existing = repo.events_for_submission(s, sub.id)
    if any(e.score is not None for e in existing):
        log.info("submission %s already counted towards mastery; not counting the re-review", sub.id)
        return None
    for e in existing:  # an earlier inconclusive run only logged the event; replace it
        s.delete(e)

    hints_used = 0  # live hints arrive with T6.7; until then no hint is ever shown
    same_problem = 0
    if sub.problem_id:
        same_problem = sum(
            1 for _, other, _ in repo.attempt_events(s, sub.owner_id) if other and other.problem_id == sub.problem_id
        )
    revision = repo.get_revision(s, sub.owner_id, concept_id) if concept_id else None
    after_revision = revision is not None and aware(revision.due_at) <= now

    if unfinished:
        score: float | None = UNFINISHED_SCORE
    else:
        score = score_from_evidence(verification, hints_used, same_problem + 1)
    event = LearningEventRow(
        user_id=sub.owner_id,
        concept_id=concept_id,
        submission_id=sub.id,
        kind="revision" if after_revision else "attempt",
        score=score,
        hints_used=hints_used,
        error_type=str(error_type) if error_type else None,
        at=now,
    )
    s.add(event)

    if concept_id and score is not None:
        row = repo.get_mastery(s, sub.owner_id, concept_id) or MasteryProfileRow(
            user_id=sub.owner_id, concept_id=concept_id, mastery=INITIAL_MASTERY, attempts=0
        )
        state = MasteryState(mastery=row.mastery, attempts=row.attempts, last_practised_at=aware(row.updated_at))
        if unfinished:
            state = MasteryState(update_mastery(state.mastery, score), state.attempts + 1, now)
        else:
            state = apply_evidence(state, verification, hints_used, same_problem + 1, now)
        row.mastery, row.attempts, row.updated_at = state.mastery, state.attempts, now
        s.add(row)
        if after_revision and revision is not None and verification.overall == Overall.correct and not unfinished:
            s.delete(revision)  # revised successfully
    s.commit()

    if concept_id:
        _schedule_if_recommended(s, sub.owner_id, concept_id, now)
    return event


def _schedule_if_recommended(s: Session, user_id: str, concept_id: str, now: datetime) -> None:
    action = recommend(s, user_id, concept_id)
    if action is None or action.action != RecommendedAction.schedule_revision:
        return
    concept = next((c for c in concept_graph(s) if c.id == concept_id), None)
    if concept is None:
        return
    item = schedule_revision(concept, now)
    repo.upsert_revision(s, user_id, concept_id, item.due_at, item.reason)
    s.commit()
