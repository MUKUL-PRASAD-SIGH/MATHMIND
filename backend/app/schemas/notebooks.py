from datetime import datetime
from enum import StrEnum
from typing import Annotated

from pydantic import Field

from app.schemas.common import BBox, ContractModel

Id = Annotated[str, Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")]
Point = Annotated[list[float], Field(min_length=2, max_length=2)]


class Background(StrEnum):
    ruled = "ruled"
    squared = "squared"
    blank = "blank"


class Tool(StrEnum):
    pen = "pen"
    pencil = "pencil"
    highlighter = "highlighter"


class NotebookCreate(ContractModel):
    title: str = Field(min_length=1, max_length=200)
    domain: str | None = Field(default=None, max_length=64)


class Notebook(ContractModel):
    id: Id
    title: str
    domain: str | None
    created_at: datetime
    updated_at: datetime


class Stroke(ContractModel):
    id: Id
    page_id: Id
    points: list[Point] = Field(min_length=1, max_length=20000, description="[x, y] page-normalized 0..1")
    pressure: list[float] | None = None
    timestamps: list[float] | None = None
    tool: Tool
    color: str = Field(pattern=r"^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$")
    width: float = Field(gt=0, le=100)
    bbox: BBox
    deleted: bool = False


class PageUpsert(ContractModel):
    """Client sends the version it last saw (0 for a new page). Mismatch -> 409."""

    chapter: str | None = Field(default=None, max_length=200)
    order: int = Field(ge=0)
    title: str | None = Field(default=None, max_length=200)
    background: Background = Background.ruled
    bookmarked: bool = False
    version: int = Field(ge=0)
    strokes: list[Stroke] | None = Field(default=None, max_length=5000)


class Page(ContractModel):
    id: Id
    notebook_id: Id
    chapter: str | None
    order: int
    title: str | None
    background: Background
    bookmarked: bool
    version: int
    stroke_count: int
