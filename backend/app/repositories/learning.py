"""Concepts, prerequisites, problems, mastery and revision queue."""

from datetime import datetime

from sqlmodel import Session, col, select

from app.models import (
    ConceptRow,
    EvaluationRow,
    LearningEventRow,
    MasteryProfileRow,
    PrerequisiteRow,
    ProblemRow,
    RevisionQueueRow,
    SubmissionRow,
    User,
)

# "revision" = an attempt made while a revision of that concept was due (rule 6 of the next-action table).
ATTEMPT_KINDS = ("attempt", "revision")


def get_or_create_default_user(session: Session) -> User:
    user = session.exec(select(User).order_by(col(User.created_at))).first()
    if user is None:
        user = User()
        session.add(user)
        session.commit()
        session.refresh(user)
    return user


def upsert_concept(session: Session, cid: str, name: str, domain: str, description: str) -> None:
    row = session.get(ConceptRow, cid) or ConceptRow(id=cid, name=name, domain=domain)
    row.name, row.domain, row.description = name, domain, description
    session.add(row)


def set_prerequisites(session: Session, cid: str, requires: list[str]) -> None:
    for old in session.exec(select(PrerequisiteRow).where(PrerequisiteRow.concept_id == cid)):
        session.delete(old)
    for req in requires:
        session.add(PrerequisiteRow(concept_id=cid, requires_concept_id=req))


def upsert_problem(session: Session, row: ProblemRow) -> None:
    existing = session.get(ProblemRow, row.id)
    if existing is None:
        session.add(row)
        return
    existing.concept_id = row.concept_id
    existing.prompt_latex = row.prompt_latex
    existing.expected_answer_latex = row.expected_answer_latex
    existing.difficulty = row.difficulty
    session.add(existing)


def list_concepts(session: Session) -> list[tuple[ConceptRow, list[str]]]:
    concepts = list(session.exec(select(ConceptRow).order_by(col(ConceptRow.id))))
    prereqs: dict[str, list[str]] = {}
    for p in session.exec(select(PrerequisiteRow)):
        prereqs.setdefault(p.concept_id, []).append(p.requires_concept_id)
    return [(c, sorted(prereqs.get(c.id, []))) for c in concepts]


def list_problems(session: Session, concept_id: str | None) -> list[ProblemRow]:
    stmt = select(ProblemRow)
    if concept_id:
        stmt = stmt.where(ProblemRow.concept_id == concept_id)
    return list(session.exec(stmt.order_by(col(ProblemRow.difficulty), col(ProblemRow.id))))


def list_mastery(session: Session, user_id: str) -> list[tuple[MasteryProfileRow, ConceptRow]]:
    stmt = (
        select(MasteryProfileRow, ConceptRow)
        .where(MasteryProfileRow.user_id == user_id, MasteryProfileRow.concept_id == ConceptRow.id)
        .order_by(col(ConceptRow.id))
    )
    return [(m, c) for m, c in session.exec(stmt)]


def list_due_revision(session: Session, user_id: str, now: datetime) -> list[tuple[RevisionQueueRow, ConceptRow]]:
    stmt = (
        select(RevisionQueueRow, ConceptRow)
        .where(
            RevisionQueueRow.user_id == user_id,
            RevisionQueueRow.concept_id == ConceptRow.id,
            col(RevisionQueueRow.due_at) <= now,
        )
        .order_by(col(RevisionQueueRow.due_at))
    )
    return [(r, c) for r, c in session.exec(stmt)]


def list_revision(session: Session, user_id: str) -> list[tuple[RevisionQueueRow, ConceptRow]]:
    """All queued items; which are due is decided by ``adaptation.due_revisions`` (timezone-safe)."""
    stmt = select(RevisionQueueRow, ConceptRow).where(
        RevisionQueueRow.user_id == user_id, RevisionQueueRow.concept_id == ConceptRow.id
    )
    return [(r, c) for r, c in session.exec(stmt)]


def get_mastery(session: Session, user_id: str, concept_id: str) -> MasteryProfileRow | None:
    return session.get(MasteryProfileRow, (user_id, concept_id))


def get_revision(session: Session, user_id: str, concept_id: str) -> RevisionQueueRow | None:
    return session.get(RevisionQueueRow, (user_id, concept_id))


def upsert_revision(session: Session, user_id: str, concept_id: str, due_at: datetime, reason: str) -> None:
    row = get_revision(session, user_id, concept_id) or RevisionQueueRow(
        user_id=user_id, concept_id=concept_id, due_at=due_at
    )
    row.due_at, row.reason = due_at, reason
    session.add(row)


def attempt_events(
    session: Session, user_id: str
) -> list[tuple[LearningEventRow, SubmissionRow | None, EvaluationRow | None]]:
    """Attempt events (oldest first) with their submission (problem id) and evaluation (verdicts)."""
    stmt = (
        select(LearningEventRow, SubmissionRow, EvaluationRow)
        .join(SubmissionRow, col(LearningEventRow.submission_id) == col(SubmissionRow.id), isouter=True)
        .join(EvaluationRow, col(LearningEventRow.submission_id) == col(EvaluationRow.submission_id), isouter=True)
        .where(LearningEventRow.user_id == user_id, col(LearningEventRow.kind).in_(ATTEMPT_KINDS))
        .order_by(col(LearningEventRow.at))
    )
    return [(e, sub, ev) for e, sub, ev in session.exec(stmt)]


def events_for_submission(session: Session, submission_id: str) -> list[LearningEventRow]:
    stmt = select(LearningEventRow).where(
        LearningEventRow.submission_id == submission_id, col(LearningEventRow.kind).in_(ATTEMPT_KINDS)
    )
    return list(session.exec(stmt))
