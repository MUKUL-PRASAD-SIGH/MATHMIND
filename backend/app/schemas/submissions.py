from datetime import datetime
from enum import StrEnum

from pydantic import Field

from app.schemas.common import BBox, ContractModel
from app.schemas.notebooks import Id
from app.schemas.review import ReviewResult
from app.schemas.verification import VerificationResult


class InputMode(StrEnum):
    typed = "typed"
    image = "image"
    ink = "ink"


class SubmissionStatus(StrEnum):
    received = "received"
    recognizing = "recognizing"
    awaiting_confirmation = "awaiting_confirmation"
    verifying = "verifying"
    reasoning = "reasoning"
    completed = "completed"
    completed_without_ai = "completed_without_ai"
    failed_recognition = "failed_recognition"
    failed = "failed"


REVIEW_READY_STATUSES = frozenset({SubmissionStatus.completed, SubmissionStatus.completed_without_ai})


class AiStatus(StrEnum):
    ok = "ok"
    unavailable = "unavailable"
    invalid_output = "invalid_output"
    pending = "pending"


class TypedStep(ContractModel):
    latex: str = Field(min_length=1, max_length=2000)
    region_id: Id | None = None


class TypedSubmissionCreate(ContractModel):
    page_id: Id | None = None
    problem_id: Id | None = None
    steps: list[TypedStep] = Field(min_length=1, max_length=50)


class SubmissionAccepted(ContractModel):
    submission_id: Id
    status: SubmissionStatus


class SubmissionStatusResponse(ContractModel):
    submission_id: Id
    input_mode: InputMode
    status: SubmissionStatus
    message: str | None = None
    updated_at: datetime


class RecognizedRegion(ContractModel):
    id: Id
    submission_id: Id
    line_index: int = Field(ge=0)
    bbox: BBox
    latex: str
    confidence: float = Field(ge=0, le=1)
    confirmed: bool
    corrected_latex: str | None = None
    recognizer_version: str


class RegionConfirmation(ContractModel):
    id: Id
    confirmed: bool = True
    corrected_latex: str | None = Field(default=None, min_length=1, max_length=2000)


class ConfirmRequest(ContractModel):
    regions: list[RegionConfirmation] = Field(min_length=1, max_length=50)


class ReviewResponse(ContractModel):
    submission_id: Id
    status: SubmissionStatus
    verification: VerificationResult | None
    review: ReviewResult | None
    ai_status: AiStatus
    regions: list[RecognizedRegion]
    step_to_region: dict[str, str] = Field(
        default_factory=dict, description="1-based step index (as string) -> region id"
    )
