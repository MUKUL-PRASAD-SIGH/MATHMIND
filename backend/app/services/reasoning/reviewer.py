"""``reason`` stage (T5.2): verified evidence -> short explanation + hint from a local LLM.

SymPy decides; the LLM only explains. Flow: health check -> chat -> ``json.loads`` -> ``LlmReview`` validation ->
answer-leak check. One retry with the validation error appended, then ``ReviewUnavailable(invalid_output=True)``.
Disagreeing ``status`` / ``first_error_step`` are overwritten with the SymPy values (``overridden=True``).
Model output is only ever parsed as JSON. It is never evaluated or executed.
"""

import json
import logging
import re
import threading
from dataclasses import asdict
from functools import lru_cache
from typing import Any, Protocol

from pydantic import ValidationError

from app.core.config import REPO_ROOT, get_settings
from app.schemas.review import ReviewResult
from app.schemas.verification import Overall
from app.services.jobs.runner import enforce_sympy_authority
from app.services.jobs.stages import ReviewInput, ReviewUnavailable
from app.services.reasoning.client import OllamaClient
from app.services.reasoning.schema import LlmReview

log = logging.getLogger(__name__)

PROMPT_VERSION = "reviewer_v1"
PROMPTS_DIR = REPO_ROOT / "ai" / "prompts"
MAX_PRIOR_ERRORS = 3
MAX_ERROR_FEEDBACK = 600
UNSPECIFIED_CONCEPT = "unspecified"
INCONCLUSIVE_NOTE = "The checker could not confirm every step, so this is not a final verdict."


class ChatClient(Protocol):
    def health(self) -> bool: ...
    def chat(self, messages: list[dict[str, str]]) -> str: ...


@lru_cache
def load_prompt(version: str = PROMPT_VERSION) -> str:
    path = PROMPTS_DIR / f"{version}.md"
    try:
        return path.read_text(encoding="utf-8")
    except OSError as exc:
        raise ReviewUnavailable(f"Reviewer prompt {version!r} is missing") from exc


def build_input(data: ReviewInput) -> dict[str, Any]:
    return {
        "problem": asdict(data.problem) if data.problem else None,
        "steps": data.steps,
        "verification": data.verification.model_dump(mode="json", exclude={"verifier_version"}),
        "concept": data.concept_id,
        "prerequisites": data.prerequisites,
        "prior_errors": data.prior_errors[-MAX_PRIOR_ERRORS:],
        "ocr_corrections": {str(k): v for k, v in data.ocr_corrections.items()},
    }


def _squash(latex: str) -> str:
    return re.sub(r"[\s{}$\\]|\\left|\\right", "", latex).lower()


def _reveals_answer(hint: str, expected: str | None) -> bool:
    if not expected:
        return False
    answer = _squash(expected)
    return len(answer) >= 2 and answer in _squash(hint)


def parse_output(raw: str, data: ReviewInput) -> ReviewResult:
    """Strict parse of one model reply. Raises ValueError (incl. ValidationError) on anything wrong."""
    obj = json.loads(raw)
    if not isinstance(obj, dict):
        raise ValueError("reply must be a single JSON object")
    # The concept is known input, not model judgement: use ours. With no problem attached the model
    # often echoes `null`; that must not throw away an otherwise valid explanation.
    if data.concept_id:
        obj["concept"] = data.concept_id
    elif not isinstance(obj.get("concept"), str) or not obj["concept"].strip():
        obj["concept"] = UNSPECIFIED_CONCEPT
    review = LlmReview.model_validate(obj)
    expected = data.problem.expected_answer_latex if data.problem else None
    if _reveals_answer(review.hint, expected):
        raise ValueError("hint reveals the final answer; give a hint without it")
    result = review.to_review()
    if data.verification.overall == Overall.inconclusive and "could not" not in result.explanation.lower():
        explanation = f"{INCONCLUSIVE_NOTE} {result.explanation}"[:600]
        result = result.model_copy(update={"explanation": explanation})
    return result


def _feedback(exc: Exception) -> str:
    if isinstance(exc, ValidationError):
        parts = [f"{'.'.join(str(p) for p in e['loc']) or 'reply'}: {e['msg']}" for e in exc.errors()]
        text = "; ".join(parts)
    else:
        text = str(exc)
    return text[:MAX_ERROR_FEEDBACK]


class Reviewer:
    def __init__(self, client: ChatClient, system_prompt: str | None = None) -> None:
        self.client = client
        self.system_prompt = system_prompt if system_prompt is not None else load_prompt()

    def review(self, data: ReviewInput) -> ReviewResult:
        if not self.client.health():
            raise ReviewUnavailable("Local AI model is not running")
        messages = [
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": json.dumps(build_input(data), ensure_ascii=False)},
        ]
        last_error: Exception | None = None
        for attempt in (1, 2):
            raw = self.client.chat(messages)
            try:
                result = parse_output(raw, data)
            except ValueError as exc:
                last_error = exc
                log.warning("reviewer output invalid (attempt %d): %s", attempt, _feedback(exc))
                messages += [
                    {"role": "assistant", "content": raw[:2000]},
                    {
                        "role": "user",
                        "content": f"That reply was invalid: {_feedback(exc)}. "
                        "Reply again with one JSON object only, exactly matching the required keys.",
                    },
                ]
                continue
            return enforce_sympy_authority(result, data.verification)
        raise ReviewUnavailable(f"AI output failed validation twice ({type(last_error).__name__})", invalid_output=True)


_default: Reviewer | None = None
_default_lock = threading.Lock()


def default_reviewer() -> Reviewer:
    global _default
    with _default_lock:
        if _default is None:
            s = get_settings()
            _default = Reviewer(OllamaClient(s.ollama_url, s.ollama_model, timeout=s.timeout_llm))
        return _default


def review(data: ReviewInput) -> ReviewResult:
    """The registered ``reason`` stage."""
    return default_reviewer().review(data)
