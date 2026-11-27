"""Data export and deletion (spec section 13.3, T7.7 step 5).

The export is the learner's own copy of everything the server holds about them. Uploaded images are
not inlined (they can be large); `has_source_image` says whether one exists.
"""

from datetime import datetime
from typing import Any, Literal

from pydantic import Field

from app.schemas.common import BBox, ContractModel
from app.schemas.learning import MasteryEntry
from app.schemas.notebooks import Id, Notebook, Page, Stroke
from app.schemas.review import ReviewResult
from app.schemas.submissions import AiStatus, InputMode, RecognizedRegion, SubmissionStatus
from app.schemas.verification import VerificationResult

EXPORT_FORMAT_VERSION: Literal[1] = 1


class ExportedObject(ContractModel):
    id: Id
    kind: str
    bbox: BBox
    payload: dict[str, Any]


class ExportedPage(Page):
    strokes: list[Stroke] = Field(description="Includes soft-deleted strokes (deleted=true)")
    objects: list[ExportedObject]


class ExportedNotebook(Notebook):
    pages: list[ExportedPage]


class ExportedSubmission(ContractModel):
    id: Id
    page_id: str | None
    problem_id: str | None
    input_mode: InputMode
    status: SubmissionStatus
    created_at: datetime
    has_source_image: bool
    steps: list[str]
    regions: list[RecognizedRegion]
    verification: VerificationResult | None
    review: ReviewResult | None
    ai_status: AiStatus


class ExportedLearningEvent(ContractModel):
    id: Id
    kind: str
    concept_id: str | None
    submission_id: str | None
    score: float | None
    hints_used: int
    error_type: str | None
    at: datetime


class LearnerExport(ContractModel):
    format_version: Literal[1] = EXPORT_FORMAT_VERSION
    app_version: str
    exported_at: datetime
    notebooks: list[ExportedNotebook]
    submissions: list[ExportedSubmission]
    mastery: list[MasteryEntry]
    learning_events: list[ExportedLearningEvent]


class DeletionSummary(ContractModel):
    deleted: dict[str, int] = Field(description="Rows removed per table, plus `upload_files`")
