"""What the LLM must return (T5.2), validated before anything else sees it.

``LlmReview`` mirrors the contract ``ReviewResult`` (``app/schemas/review.py``, ``extra="forbid"``, enums, length
caps) minus ``overridden``, which only the server sets. Text fields are sanitized: markdown, code, HTML and URLs are
stripped and each field is cut to 2 sentences. Text that tries to talk to the system ("ignore previous
instructions") or carries active HTML (``<script>``) is rejected outright, which triggers the retry.
"""

import re

from pydantic import Field, field_validator

from app.schemas.common import ContractModel
from app.schemas.review import ErrorType, RecommendedAction, ReviewResult
from app.schemas.verification import Overall

MAX_SENTENCES = 2

_CODE_BLOCK = re.compile(r"```.*?(```|$)", re.S)
_HTML = re.compile(r"<[^>]{0,200}>")
_URL = re.compile(r"\b(?:https?|ftp|file|javascript|data):\S*|\bwww\.\S+", re.I)
_MD = re.compile(r"[*_`#>|\[\]]+")
_INJECTION = re.compile(
    r"ignore (?:all |any )?(?:the )?(?:previous|prior|above) instructions|system prompt|you are now|as an ai", re.I
)
_ACTIVE_HTML = re.compile(r"<\s*/?\s*(?:script|style|iframe|object|embed|svg)\b", re.I)
_SENTENCE_END = re.compile(r"(?<=[.!?])\s+")
_CONCEPT = re.compile(r"[^a-z0-9_]+")


def sanitize_text(text: str) -> str:
    if _INJECTION.search(text):
        raise ValueError("text contains instructions aimed at the system")
    if _ACTIVE_HTML.search(text):
        raise ValueError("text contains active HTML")
    t = _CODE_BLOCK.sub(" ", text)
    t = _HTML.sub(" ", t)
    t = _URL.sub(" ", t)
    t = _MD.sub("", t)
    t = re.sub(r"\s+", " ", t).strip()
    sentences = _SENTENCE_END.split(t)
    return " ".join(sentences[:MAX_SENTENCES]).strip()


class LlmReview(ContractModel):
    status: Overall
    first_error_step: int | None = Field(default=None, ge=1)
    concept: str = Field(min_length=1, max_length=64)
    error_type: ErrorType | None = None
    explanation: str = Field(min_length=1, max_length=600)
    hint: str = Field(max_length=400)
    confidence: float = Field(ge=0, le=1)
    recommended_action: RecommendedAction

    @field_validator("explanation", "hint", mode="after")
    @classmethod
    def _clean(cls, v: str) -> str:
        return sanitize_text(v)

    @field_validator("explanation", mode="after")
    @classmethod
    def _not_empty(cls, v: str) -> str:
        if not v:
            raise ValueError("explanation is empty after removing markup")
        return v

    @field_validator("concept", mode="after")
    @classmethod
    def _concept(cls, v: str) -> str:
        cleaned = _CONCEPT.sub("_", v.strip().lower()).strip("_")
        if not cleaned:
            raise ValueError("concept is empty")
        return cleaned[:64]

    def to_review(self) -> ReviewResult:
        return ReviewResult(**self.model_dump(), overridden=False)
