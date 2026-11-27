"""Privacy endpoints (T7.7 step 5): download my data, delete my data.

M2 builds the "Export notebook (JSON)" and "Delete all my data" buttons on top of these.
"""

from fastapi import APIRouter, Query

from app.api.deps import SessionDep, SettingsDep, UserDep
from app.api.v1.learners import confidence_level
from app.api.v1.notebooks import _notebook
from app.api.v1.submissions import _region
from app.core.errors import AppError
from app.models import utcnow
from app.repositories import learning as learning_repo
from app.repositories import notebooks as notebook_repo
from app.repositories import privacy as repo
from app.repositories import submissions as submission_repo
from app.schemas.common import BBox, ErrorResponse
from app.schemas.learning import MasteryEntry
from app.schemas.notebooks import Background, Stroke, Tool
from app.schemas.privacy import (
    DeletionSummary,
    ExportedLearningEvent,
    ExportedNotebook,
    ExportedObject,
    ExportedPage,
    ExportedSubmission,
    LearnerExport,
)
from app.schemas.review import ReviewResult
from app.schemas.submissions import AiStatus, InputMode, SubmissionStatus
from app.schemas.verification import VerificationResult
from app.services.jobs.state_machine import NON_TERMINAL

router = APIRouter(prefix="/learners/me", tags=["privacy"])
ERRORS: dict[int | str, dict[str, object]] = {s: {"model": ErrorResponse} for s in (400, 409)}


def _export_notebooks(session: SessionDep, user_id: str) -> list[ExportedNotebook]:
    out = []
    for nb in repo.owned_notebooks(session, user_id):
        pages = [
            ExportedPage(
                id=p.id,
                notebook_id=p.notebook_id,
                chapter=p.chapter,
                order=p.order,
                title=p.title,
                background=Background(p.background),
                bookmarked=p.bookmarked,
                version=p.version,
                stroke_count=notebook_repo.stroke_count(session, p.id),
                strokes=[
                    Stroke(
                        id=s.id,
                        page_id=s.page_id,
                        points=s.points,
                        pressure=s.pressure,
                        timestamps=s.timestamps,
                        tool=Tool(s.tool),
                        color=s.color,
                        width=s.width,
                        bbox=BBox(**s.bbox),
                        deleted=s.deleted,
                    )
                    for s in repo.strokes_of(session, p.id)
                ],
                objects=[
                    ExportedObject(id=o.id, kind=o.kind, bbox=BBox(**o.bbox), payload=o.payload)
                    for o in repo.objects_of(session, p.id)
                ],
            )
            for p in repo.pages_of(session, nb.id)
        ]
        out.append(ExportedNotebook(**_notebook(nb).model_dump(), pages=pages))
    return out


def _export_submissions(session: SessionDep, user_id: str) -> list[ExportedSubmission]:
    out = []
    for sub in repo.owned_submissions(session, user_id):
        ev = submission_repo.get_evaluation(session, sub.id)
        out.append(
            ExportedSubmission(
                id=sub.id,
                page_id=sub.page_id,
                problem_id=sub.problem_id,
                input_mode=InputMode(sub.input_mode),
                status=SubmissionStatus(sub.status),
                created_at=sub.created_at,
                has_source_image=bool(sub.source_image_path),
                steps=[s.latex for s in submission_repo.list_steps(session, sub.id)],
                regions=[_region(r) for r in submission_repo.list_regions(session, sub.id)],
                verification=VerificationResult.model_validate(ev.verification) if ev.verification else None,
                review=ReviewResult.model_validate(ev.review) if ev.review else None,
                ai_status=AiStatus(ev.ai_status),
            )
        )
    return out


@router.get("/export", response_model=LearnerExport)
def export_my_data(session: SessionDep, settings: SettingsDep, user: UserDep) -> LearnerExport:
    """Everything the server stores about the current learner, as one JSON document."""
    return LearnerExport(
        app_version=settings.app_version,
        exported_at=utcnow(),
        notebooks=_export_notebooks(session, user.id),
        submissions=_export_submissions(session, user.id),
        mastery=[
            MasteryEntry(
                concept_id=c.id,
                concept_name=c.name,
                mastery=m.mastery,
                attempts=m.attempts,
                confidence_level=confidence_level(m.attempts),
                last_practised_at=m.updated_at if m.attempts else None,
            )
            for m, c in learning_repo.list_mastery(session, user.id)
        ],
        learning_events=[
            ExportedLearningEvent(
                id=e.id,
                kind=e.kind,
                concept_id=e.concept_id,
                submission_id=e.submission_id,
                score=e.score,
                hints_used=e.hints_used,
                error_type=e.error_type,
                at=e.at,
            )
            for e in repo.learning_events(session, user.id)
        ],
    )


@router.delete("/data", response_model=DeletionSummary, responses=ERRORS)
def delete_my_data(
    session: SessionDep,
    settings: SettingsDep,
    user: UserDep,
    confirm: bool = Query(default=False, description="Must be true. Guards against an accidental call."),
) -> DeletionSummary:
    """Permanently delete the learner's notebooks, submissions, uploads and progress.

    Concepts and problems are shared content and stay. Refused while a submission is still processing,
    so a background job never writes into rows that were just deleted.
    """
    if not confirm:
        raise AppError(400, "confirmation_required", "Pass ?confirm=true to delete all your data")
    running = [s.id for s in repo.owned_submissions(session, user.id) if SubmissionStatus(s.status) in NON_TERMINAL]
    if running:
        raise AppError(
            409, "jobs_running", "Wait for submissions to finish processing, then retry", {"submission_ids": running}
        )
    return DeletionSummary(deleted=repo.delete_user_data(session, user.id, settings.upload_dir))
