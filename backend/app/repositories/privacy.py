"""Export and delete everything owned by one learner. Shared content (concepts, problems) is untouched."""

import logging
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from sqlmodel import Session, col, delete, select

from app.models import (
    EvaluationRow,
    LearningEventRow,
    MasteryProfileRow,
    NotebookRow,
    ObjectRow,
    PageRow,
    RecognizedRegionRow,
    RevisionQueueRow,
    SolutionStepRow,
    StrokeRow,
    SubmissionRow,
)

log = logging.getLogger(__name__)


def owned_notebooks(session: Session, user_id: str) -> list[NotebookRow]:
    stmt = select(NotebookRow).where(NotebookRow.owner_id == user_id).order_by(col(NotebookRow.created_at))
    return list(session.exec(stmt))


def pages_of(session: Session, notebook_id: str) -> list[PageRow]:
    stmt = select(PageRow).where(PageRow.notebook_id == notebook_id).order_by(col(PageRow.order), col(PageRow.id))
    return list(session.exec(stmt))


def strokes_of(session: Session, page_id: str) -> list[StrokeRow]:
    return list(session.exec(select(StrokeRow).where(StrokeRow.page_id == page_id).order_by(col(StrokeRow.id))))


def objects_of(session: Session, page_id: str) -> list[ObjectRow]:
    return list(session.exec(select(ObjectRow).where(ObjectRow.page_id == page_id).order_by(col(ObjectRow.id))))


def owned_submissions(session: Session, user_id: str) -> list[SubmissionRow]:
    stmt = select(SubmissionRow).where(SubmissionRow.owner_id == user_id).order_by(col(SubmissionRow.created_at))
    return list(session.exec(stmt))


def learning_events(session: Session, user_id: str) -> list[LearningEventRow]:
    stmt = select(LearningEventRow).where(LearningEventRow.user_id == user_id).order_by(col(LearningEventRow.at))
    return list(session.exec(stmt))


def _delete_where(session: Session, model: Any, column: Any, values: Sequence[str]) -> int:
    if not values:
        return 0
    result = session.exec(delete(model).where(col(column).in_(values)))  # type: ignore[call-overload]
    return int(result.rowcount or 0)


def _remove_upload(path_str: str, upload_dir: Path) -> bool:
    """Delete an uploaded file (and its now-empty per-submission folder), only if it lives under upload_dir."""
    try:
        root = upload_dir.resolve()
        path = Path(path_str).resolve()
        if not path.is_relative_to(root) or path == root:
            log.warning("refusing to delete file outside upload dir: %s", path)
            return False
        path.unlink(missing_ok=True)
        if path.parent != root and not any(path.parent.iterdir()):
            path.parent.rmdir()
        return True
    except OSError:
        log.exception("could not delete upload %s", path_str)
        return False


def delete_user_data(session: Session, user_id: str, upload_dir: Path) -> dict[str, int]:
    """Remove the learner's notebooks, submissions, progress and uploads. Children first (FK order)."""
    notebook_ids = [n.id for n in owned_notebooks(session, user_id)]
    page_ids = list(session.exec(select(PageRow.id).where(col(PageRow.notebook_id).in_(notebook_ids))))
    submissions = owned_submissions(session, user_id)
    submission_ids = [s.id for s in submissions]
    image_paths = [s.source_image_path for s in submissions if s.source_image_path]

    counts = {
        "strokes": _delete_where(session, StrokeRow, StrokeRow.page_id, page_ids),
        "objects": _delete_where(session, ObjectRow, ObjectRow.page_id, page_ids),
        "pages": _delete_where(session, PageRow, PageRow.id, page_ids),
        "notebooks": _delete_where(session, NotebookRow, NotebookRow.id, notebook_ids),
        "recognized_regions": _delete_where(
            session, RecognizedRegionRow, RecognizedRegionRow.submission_id, submission_ids
        ),
        "solution_steps": _delete_where(session, SolutionStepRow, SolutionStepRow.submission_id, submission_ids),
        "evaluations": _delete_where(session, EvaluationRow, EvaluationRow.submission_id, submission_ids),
        "submissions": _delete_where(session, SubmissionRow, SubmissionRow.id, submission_ids),
        "mastery_profiles": _delete_where(session, MasteryProfileRow, MasteryProfileRow.user_id, [user_id]),
        "learning_events": _delete_where(session, LearningEventRow, LearningEventRow.user_id, [user_id]),
        "revision_queue": _delete_where(session, RevisionQueueRow, RevisionQueueRow.user_id, [user_id]),
    }
    session.commit()
    # Files go after the commit: a failed DB delete must not leave rows pointing at missing images.
    counts["upload_files"] = sum(_remove_upload(p, upload_dir) for p in image_paths)
    return counts
