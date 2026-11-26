"""SQLModel tables (docs/02-architecture.md section 4).

Source artifacts (strokes, uploaded images) are immutable inputs; recognition, steps and
evaluations are *derived* records linked by submission_id / region_id.
"""

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


def new_id() -> str:
    return uuid.uuid4().hex


def utcnow() -> datetime:
    return datetime.now(UTC)


class User(SQLModel, table=True):
    __tablename__ = "users"
    id: str = Field(default_factory=new_id, primary_key=True)
    display_name: str = "Local learner"
    settings: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    created_at: datetime = Field(default_factory=utcnow)


class NotebookRow(SQLModel, table=True):
    __tablename__ = "notebooks"
    id: str = Field(default_factory=new_id, primary_key=True)
    owner_id: str = Field(foreign_key="users.id", index=True)
    title: str
    domain: str | None = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class PageRow(SQLModel, table=True):
    __tablename__ = "pages"
    id: str = Field(primary_key=True)
    notebook_id: str = Field(foreign_key="notebooks.id", index=True)
    chapter: str | None = None
    order: int = 0
    title: str | None = None
    background: str = "ruled"
    bookmarked: bool = False
    version: int = 0
    updated_at: datetime = Field(default_factory=utcnow)


class StrokeRow(SQLModel, table=True):
    __tablename__ = "strokes"
    id: str = Field(primary_key=True)
    page_id: str = Field(foreign_key="pages.id", index=True)
    points: list[list[float]] = Field(sa_column=Column(JSON, nullable=False))
    pressure: list[float] | None = Field(default=None, sa_column=Column(JSON))
    timestamps: list[float] | None = Field(default=None, sa_column=Column(JSON))
    tool: str
    color: str
    width: float
    bbox: dict[str, float] = Field(sa_column=Column(JSON, nullable=False))
    deleted: bool = False


class ObjectRow(SQLModel, table=True):
    __tablename__ = "objects"
    id: str = Field(default_factory=new_id, primary_key=True)
    page_id: str = Field(foreign_key="pages.id", index=True)
    kind: str  # text | equation | shape | image | annotation
    bbox: dict[str, float] = Field(sa_column=Column(JSON, nullable=False))
    payload: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))


class ConceptRow(SQLModel, table=True):
    __tablename__ = "concepts"
    id: str = Field(primary_key=True)
    name: str
    domain: str
    description: str = ""


class PrerequisiteRow(SQLModel, table=True):
    __tablename__ = "prerequisites"
    concept_id: str = Field(foreign_key="concepts.id", primary_key=True)
    requires_concept_id: str = Field(foreign_key="concepts.id", primary_key=True)


class ProblemRow(SQLModel, table=True):
    __tablename__ = "problems"
    id: str = Field(primary_key=True)
    concept_id: str = Field(foreign_key="concepts.id", index=True)
    prompt_latex: str
    expected_answer_latex: str | None = None
    difficulty: int = 1


class SubmissionRow(SQLModel, table=True):
    __tablename__ = "submissions"
    id: str = Field(default_factory=new_id, primary_key=True)
    owner_id: str = Field(foreign_key="users.id", index=True)
    page_id: str | None = Field(default=None, index=True)
    problem_id: str | None = None
    input_mode: str
    status: str = "received"
    message: str | None = None
    source_image_path: str | None = None
    region_bbox: dict[str, float] | None = Field(default=None, sa_column=Column(JSON))
    stroke_ids: list[str] | None = Field(default=None, sa_column=Column(JSON))
    previous_submission_id: str | None = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class RecognizedRegionRow(SQLModel, table=True):
    __tablename__ = "recognized_regions"
    id: str = Field(default_factory=new_id, primary_key=True)
    submission_id: str = Field(foreign_key="submissions.id", index=True)
    line_index: int
    bbox: dict[str, float] = Field(sa_column=Column(JSON, nullable=False))
    latex: str  # original OCR output — never overwritten
    confidence: float
    confirmed: bool = False
    corrected_latex: str | None = None
    recognizer_version: str


class SolutionStepRow(SQLModel, table=True):
    __tablename__ = "solution_steps"
    id: str = Field(default_factory=new_id, primary_key=True)
    submission_id: str = Field(foreign_key="submissions.id", index=True)
    region_id: str | None = None
    index: int  # 1-based
    latex: str


class EvaluationRow(SQLModel, table=True):
    __tablename__ = "evaluations"
    submission_id: str = Field(foreign_key="submissions.id", primary_key=True)
    verification: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))
    review: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))
    ai_status: str = "pending"
    model_version: str | None = None
    prompt_version: str | None = None
    updated_at: datetime = Field(default_factory=utcnow)


class MasteryProfileRow(SQLModel, table=True):
    __tablename__ = "mastery_profiles"
    user_id: str = Field(foreign_key="users.id", primary_key=True)
    concept_id: str = Field(foreign_key="concepts.id", primary_key=True)
    mastery: float = 0.3
    attempts: int = 0
    updated_at: datetime = Field(default_factory=utcnow)


class LearningEventRow(SQLModel, table=True):
    __tablename__ = "learning_events"
    id: str = Field(default_factory=new_id, primary_key=True)
    user_id: str = Field(foreign_key="users.id", index=True)
    concept_id: str | None = None
    submission_id: str | None = None
    kind: str  # attempt | hint | review | revision
    score: float | None = None
    hints_used: int = 0
    error_type: str | None = None
    at: datetime = Field(default_factory=utcnow)


class RevisionQueueRow(SQLModel, table=True):
    __tablename__ = "revision_queue"
    user_id: str = Field(foreign_key="users.id", primary_key=True)
    concept_id: str = Field(foreign_key="concepts.id", primary_key=True)
    due_at: datetime
    reason: str = ""
