"""Stage registry: the seam between M1's pipeline and M3's services.

M3 replaces the stubs by calling ``register_stage`` (e.g. from app/services/verification/__init__.py
via ``install_real_stages()`` in app/main.py). The stubs are deliberately *safe*:

* verify  -> every step ``inconclusive`` (never a false "incorrect")
* recognize -> raises RecognitionUnavailable (pipeline offers manual typing)
* reason  -> raises ReviewUnavailable (pipeline returns completed_without_ai)
"""

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, Protocol

from app.schemas.common import BBox
from app.schemas.review import ReviewResult
from app.schemas.verification import Overall, StepVerdict, Verdict, VerificationResult


class RecognitionUnavailable(Exception):
    """OCR engine missing or failed."""


class ReviewUnavailable(Exception):
    """LLM down, timed out, or produced invalid output twice."""

    def __init__(self, message: str = "AI review unavailable", invalid_output: bool = False) -> None:
        super().__init__(message)
        self.invalid_output = invalid_output


@dataclass(frozen=True)
class RecognizedLine:
    line_index: int
    bbox: BBox  # relative to the submitted crop (0..1); the runner converts to page coordinates
    latex: str
    confidence: float
    recognizer_version: str


@dataclass(frozen=True)
class ProblemContext:
    id: str
    concept_id: str
    prompt_latex: str
    expected_answer_latex: str | None


@dataclass(frozen=True)
class ReviewInput:
    problem: ProblemContext | None
    steps: list[str]
    verification: VerificationResult
    concept_id: str | None
    prerequisites: list[str] = field(default_factory=list)
    prior_errors: list[str] = field(default_factory=list)
    ocr_corrections: dict[int, str] = field(default_factory=dict)


class RecognizeFn(Protocol):
    def __call__(self, png: bytes, region_bbox: BBox) -> list[RecognizedLine]: ...


class VerifyFn(Protocol):
    def __call__(self, steps: list[str], problem: ProblemContext | None) -> VerificationResult: ...


class ReasonFn(Protocol):
    def __call__(self, data: ReviewInput) -> ReviewResult: ...


# ---- safe stubs ---------------------------------------------------------------------------


def stub_recognize(png: bytes, region_bbox: BBox) -> list[RecognizedLine]:
    raise RecognitionUnavailable("Handwriting recognition is not installed yet (T4.1)")


def stub_verify(steps: list[str], problem: ProblemContext | None) -> VerificationResult:
    return VerificationResult(
        steps=[
            StepVerdict(index=i, latex=s, verdict=Verdict.inconclusive, reason="Verifier not available yet (T3.2)")
            for i, s in enumerate(steps, start=1)
        ],
        first_error_step=None,
        overall=Overall.inconclusive,
        verifier_version="stub-0",
    )


def stub_reason(data: ReviewInput) -> ReviewResult:
    raise ReviewUnavailable("AI reviewer not available yet (T5.2)")


# ---- registry -------------------------------------------------------------------------------

_DEFAULTS: dict[str, Callable[..., Any]] = {
    "recognize": stub_recognize,
    "verify": stub_verify,
    "reason": stub_reason,
}
_STAGES: dict[str, Callable[..., Any]] = dict(_DEFAULTS)


def register_stage(name: str, fn: Callable[..., Any]) -> None:
    if name not in _DEFAULTS:
        raise KeyError(f"unknown stage {name!r}; expected one of {sorted(_DEFAULTS)}")
    _STAGES[name] = fn


def get_stage(name: str) -> Callable[..., Any]:
    return _STAGES[name]


def reset_stages() -> None:
    _STAGES.clear()
    _STAGES.update(_DEFAULTS)


def is_stub(name: str) -> bool:
    return _STAGES[name] is _DEFAULTS[name]
