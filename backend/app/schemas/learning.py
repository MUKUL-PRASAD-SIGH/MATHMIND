from datetime import datetime
from enum import StrEnum

from pydantic import Field

from app.schemas.common import ContractModel
from app.schemas.notebooks import Id
from app.schemas.review import RecommendedAction


class Concept(ContractModel):
    id: Id
    name: str
    domain: str
    description: str = ""
    prerequisites: list[str] = Field(default_factory=list)


class Problem(ContractModel):
    id: Id
    concept_id: Id
    prompt_latex: str
    expected_answer_latex: str | None = None
    difficulty: int = Field(ge=1, le=5)


class ConfidenceLevel(StrEnum):
    low = "low"
    medium = "medium"
    high = "high"


class MasteryEntry(ContractModel):
    concept_id: Id
    concept_name: str
    mastery: float = Field(ge=0, le=1, description="Estimate, not a guaranteed measure")
    attempts: int = Field(ge=0)
    confidence_level: ConfidenceLevel
    last_practised_at: datetime | None = None


class Mastery(ContractModel):
    items: list[MasteryEntry]


class RevisionItem(ContractModel):
    concept_id: Id
    concept_name: str
    due_at: datetime
    reason: str


class Revision(ContractModel):
    items: list[RevisionItem]


class NextAction(ContractModel):
    action: RecommendedAction
    concept_id: Id
    problem_id: Id | None = None
    reason: str
