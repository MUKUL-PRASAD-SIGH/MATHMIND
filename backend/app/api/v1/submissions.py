import json
import secrets
from typing import Annotated

from fastapi import APIRouter, File, Form, Path, UploadFile
from pydantic import TypeAdapter, ValidationError

from app.api.deps import RunnerDep, SessionDep, SettingsDep, UserDep
from app.core.errors import AppError
from app.core.uploads import validate_and_normalize_image
from app.models import RecognizedRegionRow, SubmissionRow
from app.repositories import submissions as repo
from app.schemas.common import BBox, ErrorResponse
from app.schemas.notebooks import Id
from app.schemas.review import ReviewResult
from app.schemas.submissions import (
    REVIEW_READY_STATUSES,
    AiStatus,
    ConfirmRequest,
    InputMode,
    RecognizedRegion,
    ReviewResponse,
    SubmissionAccepted,
    SubmissionStatus,
    SubmissionStatusResponse,
    TypedSubmissionCreate,
)
from app.schemas.verification import VerificationResult
from app.services.jobs.runner import Entry
from app.services.jobs.state_machine import can_transition

router = APIRouter(prefix="/submissions", tags=["submissions"])

IdPath = Annotated[str, Path(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")]
ERRORS: dict[int | str, dict[str, object]] = {s: {"model": ErrorResponse} for s in (404, 409, 413, 415, 422)}
_stroke_ids: TypeAdapter[list[str]] = TypeAdapter(list[Id])


def _accepted(sub: SubmissionRow) -> SubmissionAccepted:
    return SubmissionAccepted(submission_id=sub.id, status=SubmissionStatus(sub.status))


def _region(r: RecognizedRegionRow) -> RecognizedRegion:
    return RecognizedRegion(
        id=r.id,
        submission_id=r.submission_id,
        line_index=r.line_index,
        bbox=BBox(**r.bbox),
        latex=r.latex,
        confidence=r.confidence,
        confirmed=r.confirmed,
        corrected_latex=r.corrected_latex,
        recognizer_version=r.recognizer_version,
    )


@router.post("/typed", response_model=SubmissionAccepted, status_code=202, responses=ERRORS)
def submit_typed(
    body: TypedSubmissionCreate, session: SessionDep, user: UserDep, runner: RunnerDep
) -> SubmissionAccepted:
    sub = repo.create_submission(session, user.id, InputMode.typed, page_id=body.page_id, problem_id=body.problem_id)
    repo.replace_steps(session, sub.id, [(st.latex, st.region_id) for st in body.steps])
    accepted = _accepted(sub)
    runner.start(sub.id, "verify")
    return accepted


@router.post("/image", response_model=SubmissionAccepted, status_code=202, responses=ERRORS)
async def submit_image(
    session: SessionDep,
    user: UserDep,
    runner: RunnerDep,
    settings: SettingsDep,
    file: Annotated[UploadFile, File(description="PNG/JPEG/WebP crop of the selected region")],
    page_id: Annotated[str | None, Form(max_length=64, pattern=r"^[A-Za-z0-9_-]+$")] = None,
    problem_id: Annotated[str | None, Form(max_length=64, pattern=r"^[A-Za-z0-9_-]+$")] = None,
    bbox: Annotated[
        str | None, Form(description='Page-normalized JSON, e.g. {"x":0.1,"y":0.2,"w":0.5,"h":0.3}')
    ] = None,
    stroke_ids: Annotated[str | None, Form(description="JSON array of stroke ids in the region")] = None,
) -> SubmissionAccepted:
    try:
        region = BBox.model_validate_json(bbox) if bbox else BBox(x=0, y=0, w=1, h=1)
        strokes = _stroke_ids.validate_json(stroke_ids) if stroke_ids else None
    except (ValidationError, json.JSONDecodeError) as exc:
        raise AppError(422, "invalid_form_field", "bbox or stroke_ids is not valid JSON") from exc

    data = await file.read(settings.max_upload_bytes + 1)
    png, _, _ = validate_and_normalize_image(data, settings.max_upload_bytes, settings.max_image_pixels_side)

    sub = repo.create_submission(
        session,
        user.id,
        InputMode.image,
        page_id=page_id,
        problem_id=problem_id,
        region_bbox=region.model_dump(),
        stroke_ids=strokes,
    )
    # Never use the client's filename on disk.
    target = settings.upload_dir / sub.id / f"source-{secrets.token_hex(4)}.png"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(png)
    sub.source_image_path = str(target)
    session.add(sub)
    session.commit()

    accepted = _accepted(sub)
    runner.start(sub.id, "recognize")
    return accepted


@router.get("/{submission_id}/status", response_model=SubmissionStatusResponse, responses=ERRORS)
def get_status(session: SessionDep, user: UserDep, submission_id: IdPath) -> SubmissionStatusResponse:
    sub = repo.get_owned_submission(session, user.id, submission_id)
    return SubmissionStatusResponse(
        submission_id=sub.id,
        input_mode=InputMode(sub.input_mode),
        status=SubmissionStatus(sub.status),
        message=sub.message,
        updated_at=sub.updated_at,
    )


@router.post("/{submission_id}/confirm", response_model=SubmissionAccepted, status_code=202, responses=ERRORS)
def confirm(
    body: ConfirmRequest, session: SessionDep, user: UserDep, runner: RunnerDep, submission_id: IdPath
) -> SubmissionAccepted:
    """Confirm or correct recognized lines. confirmed=false drops a line. Original OCR text is kept."""
    sub = repo.get_owned_submission(session, user.id, submission_id)
    if sub.status not in (SubmissionStatus.awaiting_confirmation, SubmissionStatus.failed_recognition):
        raise AppError(
            409, "not_awaiting_confirmation", "This submission is not waiting for confirmation", {"status": sub.status}
        )

    regions = {r.id: r for r in repo.list_regions(session, sub.id)}
    foreign = [c.id for c in body.regions if c.id not in regions]
    if foreign:
        raise AppError(422, "unknown_region", "Region ids do not belong to this submission", {"region_ids": foreign})

    dropped: set[str] = set()
    for c in body.regions:
        r = regions[c.id]
        r.confirmed = c.confirmed
        r.corrected_latex = c.corrected_latex
        if not c.confirmed:
            dropped.add(r.id)
        session.add(r)

    steps: list[tuple[str, str | None]] = []
    needs_text: list[str] = []
    for r in sorted(regions.values(), key=lambda x: x.line_index):
        if r.id in dropped:
            continue
        text = (r.corrected_latex or r.latex).strip()
        if not text:
            needs_text.append(r.id)
        else:
            steps.append((text, r.id))
    if needs_text:
        session.rollback()
        raise AppError(422, "region_needs_text", "Type the expression for these regions", {"region_ids": needs_text})
    if not steps:
        session.rollback()
        raise AppError(422, "no_steps", "At least one line must be kept")

    session.commit()
    repo.replace_steps(session, sub.id, steps)
    accepted = SubmissionAccepted(submission_id=sub.id, status=SubmissionStatus.verifying)
    runner.start(sub.id, "verify")
    return accepted


@router.post("/{submission_id}/review", response_model=SubmissionAccepted, status_code=202, responses=ERRORS)
def start_review(session: SessionDep, user: UserDep, runner: RunnerDep, submission_id: IdPath) -> SubmissionAccepted:
    """(Re)run verification + reasoning, e.g. after a failure or restart."""
    sub = repo.get_owned_submission(session, user.id, submission_id)
    has_steps = bool(repo.list_steps(session, sub.id))
    entry: Entry = "verify" if has_steps else "recognize"
    target = SubmissionStatus.verifying if has_steps else SubmissionStatus.recognizing
    if entry == "recognize" and not sub.source_image_path:
        raise AppError(409, "nothing_to_review", "Submission has no steps or image")
    if not can_transition(sub.status, target):
        raise AppError(409, "review_not_allowed", "Review cannot start in the current state", {"status": sub.status})
    accepted = SubmissionAccepted(submission_id=sub.id, status=target)
    runner.start(sub.id, entry)
    return accepted


@router.get("/{submission_id}/review", response_model=ReviewResponse, responses=ERRORS)
def get_review(session: SessionDep, user: UserDep, submission_id: IdPath) -> ReviewResponse:
    sub = repo.get_owned_submission(session, user.id, submission_id)
    if sub.status not in REVIEW_READY_STATUSES:
        raise AppError(404, "review_not_ready", "Review is not ready yet", {"status": sub.status})
    ev = repo.get_evaluation(session, sub.id)
    steps = repo.list_steps(session, sub.id)
    return ReviewResponse(
        submission_id=sub.id,
        status=SubmissionStatus(sub.status),
        verification=VerificationResult.model_validate(ev.verification) if ev.verification else None,
        review=ReviewResult.model_validate(ev.review) if ev.review else None,
        ai_status=AiStatus(ev.ai_status),
        regions=[_region(r) for r in repo.list_regions(session, sub.id)],
        step_to_region={str(st.index): st.region_id for st in steps if st.region_id},
    )
