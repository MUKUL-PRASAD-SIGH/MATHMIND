from enum import StrEnum

from pydantic import Field

from app.schemas.common import ContractModel
from app.schemas.verification import Overall


class ErrorType(StrEnum):
    arithmetic_slip = "arithmetic_slip"
    algebraic_transformation = "algebraic_transformation"
    sign_error = "sign_error"
    formula_selection = "formula_selection"
    domain_violation = "domain_violation"
    missing_prerequisite = "missing_prerequisite"
    incomplete = "incomplete"
    other = "other"


class RecommendedAction(StrEnum):
    continue_ = "continue"
    increase_difficulty = "increase_difficulty"
    targeted_practice = "targeted_practice"
    prerequisite_review = "prerequisite_review"
    worked_example = "worked_example"
    schedule_revision = "schedule_revision"
    ask_another_question = "ask_another_question"


class ReviewResult(ContractModel):
    """Validated LLM output. status/first_error_step are overridden by SymPy if they disagree."""

    status: Overall
    first_error_step: int | None = Field(default=None, ge=1)
    concept: str = Field(max_length=64)
    error_type: ErrorType | None = None
    explanation: str = Field(max_length=600)
    hint: str = Field(max_length=400)
    confidence: float = Field(ge=0, le=1)
    recommended_action: RecommendedAction
    overridden: bool = False
