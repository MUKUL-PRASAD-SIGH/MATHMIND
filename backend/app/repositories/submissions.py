"""Submission aggregate: submission + recognized regions + solution steps + evaluation."""

from typing import Any

from sqlmodel import Session, col, select

from app.core.errors import not_found
from app.models import (
    EvaluationRow,
    RecognizedRegionRow,
    SolutionStepRow,
    SubmissionRow,
    utcnow,
)


def create_submission(session: Session, owner_id: str, input_mode: str, **fields: Any) -> SubmissionRow:
    row = SubmissionRow(owner_id=owner_id, input_mode=input_mode, **fields)
    session.add(row)
    session.flush()  # parent first: FK from evaluations -> submissions
    session.add(EvaluationRow(submission_id=row.id))
    session.commit()
    session.refresh(row)
    return row


def get_owned_submission(session: Session, owner_id: str, submission_id: str) -> SubmissionRow:
    row = session.get(SubmissionRow, submission_id)
    if row is None or row.owner_id != owner_id:
        raise not_found("Submission", submission_id)
    return row


def set_status(session: Session, row: SubmissionRow, status: str, message: str | None = None) -> None:
    row.status = status
    row.message = message
    row.updated_at = utcnow()
    session.add(row)
    session.commit()


def replace_steps(session: Session, submission_id: str, steps: list[tuple[str, str | None]]) -> None:
    """steps: [(latex, region_id)] in order; stored 1-based."""
    for old in session.exec(select(SolutionStepRow).where(SolutionStepRow.submission_id == submission_id)):
        session.delete(old)
    for i, (latex, region_id) in enumerate(steps, start=1):
        session.add(SolutionStepRow(submission_id=submission_id, index=i, latex=latex, region_id=region_id))
    session.commit()


def list_steps(session: Session, submission_id: str) -> list[SolutionStepRow]:
    stmt = (
        select(SolutionStepRow)
        .where(SolutionStepRow.submission_id == submission_id)
        .order_by(col(SolutionStepRow.index))
    )
    return list(session.exec(stmt))


def add_regions(session: Session, regions: list[RecognizedRegionRow]) -> None:
    for r in regions:
        session.add(r)
    session.commit()


def list_regions(session: Session, submission_id: str) -> list[RecognizedRegionRow]:
    stmt = (
        select(RecognizedRegionRow)
        .where(RecognizedRegionRow.submission_id == submission_id)
        .order_by(col(RecognizedRegionRow.line_index))
    )
    return list(session.exec(stmt))


def get_evaluation(session: Session, submission_id: str) -> EvaluationRow:
    row = session.get(EvaluationRow, submission_id)
    if row is None:
        row = EvaluationRow(submission_id=submission_id)
        session.add(row)
        session.commit()
        session.refresh(row)
    return row


def save_evaluation(session: Session, submission_id: str, **fields: Any) -> EvaluationRow:
    row = get_evaluation(session, submission_id)
    for key, value in fields.items():
        setattr(row, key, value)
    row.updated_at = utcnow()
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def list_by_status(session: Session, statuses: list[str]) -> list[SubmissionRow]:
    return list(session.exec(select(SubmissionRow).where(col(SubmissionRow.status).in_(statuses))))
