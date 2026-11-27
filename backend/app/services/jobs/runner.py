"""In-process job runner that drives a submission through its pipeline.

typed : received -> verifying -> reasoning -> completed | completed_without_ai
image : received -> recognizing -> (awaiting_confirmation -> /confirm) -> verifying -> reasoning -> ...

Every stage call has a timeout. Failures never lose work: partial results are persisted and the
submission ends in a defined state (see state_machine.TRANSITIONS).
"""

import logging
from collections.abc import Callable
from concurrent.futures import Future, ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from pathlib import Path
from typing import Any, Literal, TypeVar

from sqlalchemy import Engine
from sqlmodel import Session, select

from app.core.config import Settings
from app.models import PrerequisiteRow, ProblemRow, RecognizedRegionRow, SolutionStepRow, SubmissionRow
from app.repositories import submissions as repo
from app.schemas.common import BBox
from app.schemas.review import ErrorType, ReviewResult
from app.schemas.submissions import AiStatus
from app.schemas.submissions import SubmissionStatus as S
from app.schemas.verification import Overall, StepVerdict, Verdict, VerificationResult
from app.services.jobs import learning, stages
from app.services.jobs.completeness import mark_unfinished
from app.services.jobs.state_machine import NON_TERMINAL, check_transition

log = logging.getLogger(__name__)
T = TypeVar("T")
Entry = Literal["recognize", "verify"]

FULL_PAGE = {"x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0}


class StageTimeout(Exception):
    pass


def crop_to_page(line_bbox: BBox, region: dict[str, float]) -> dict[str, float]:
    """Recognizers return crop-relative bboxes; store page-normalized ones."""
    return {
        "x": region["x"] + line_bbox.x * region["w"],
        "y": region["y"] + line_bbox.y * region["h"],
        "w": line_bbox.w * region["w"],
        "h": line_bbox.h * region["h"],
    }


def all_inconclusive(steps: list[str], reason: str) -> VerificationResult:
    return VerificationResult(
        steps=[
            StepVerdict(index=i, latex=s, verdict=Verdict.inconclusive, reason=reason)
            for i, s in enumerate(steps, start=1)
        ],
        first_error_step=None,
        overall=Overall.inconclusive,
        verifier_version="fallback",
    )


def enforce_sympy_authority(review: ReviewResult, verification: VerificationResult) -> ReviewResult:
    """The LLM explains; SymPy decides. Overwrite disagreeing verdict fields."""
    if review.status == verification.overall and review.first_error_step == verification.first_error_step:
        return review
    log.warning(
        "LLM disagreed with verifier (llm=%s/%s, sympy=%s/%s); overriding",
        review.status,
        review.first_error_step,
        verification.overall,
        verification.first_error_step,
    )
    return review.model_copy(
        update={
            "status": verification.overall,
            "first_error_step": verification.first_error_step,
            "overridden": True,
        }
    )


class JobRunner:
    def __init__(self, engine: Engine, settings: Settings, synchronous: bool = False) -> None:
        self.engine = engine
        self.settings = settings
        self.synchronous = synchronous
        self._jobs = ThreadPoolExecutor(max_workers=settings.job_workers, thread_name_prefix="job")
        # Separate pool so a stage timing out can't starve the job workers.
        self._calls = ThreadPoolExecutor(max_workers=settings.job_workers * 2, thread_name_prefix="stage")

    # ---- public API ---------------------------------------------------------------------------

    def start(self, submission_id: str, entry: Entry) -> Future[None] | None:
        if self.synchronous:
            self._run(submission_id, entry)
            return None
        return self._jobs.submit(self._run, submission_id, entry)

    def recover_interrupted(self) -> int:
        """On startup, submissions left mid-pipeline are marked failed (retryable via POST /review)."""
        with Session(self.engine) as s:
            stuck = repo.list_by_status(s, [str(st) for st in NON_TERMINAL])
            for sub in stuck:
                repo.set_status(s, sub, S.failed, "Interrupted by a server restart; retry with POST /review")
            return len(stuck)

    def shutdown(self) -> None:
        self._jobs.shutdown(wait=False, cancel_futures=True)
        self._calls.shutdown(wait=False, cancel_futures=True)

    # ---- internals ----------------------------------------------------------------------------

    def _call(self, fn: Callable[..., T], timeout: float, *args: Any) -> T:
        fut = self._calls.submit(fn, *args)
        try:
            return fut.result(timeout=timeout)
        except FutureTimeout as exc:
            fut.cancel()
            raise StageTimeout(f"{getattr(fn, '__name__', 'stage')} exceeded {timeout}s") from exc

    def _move(self, s: Session, sub: SubmissionRow, new: S, message: str | None = None) -> None:
        check_transition(sub.status, new)
        repo.set_status(s, sub, new, message)

    def _run(self, submission_id: str, entry: Entry) -> None:
        with Session(self.engine) as s:
            sub = s.get(SubmissionRow, submission_id)
            if sub is None:
                log.error("submission %s vanished", submission_id)
                return
            try:
                if entry == "recognize" and not self._recognize(s, sub):
                    return
                self._verify_and_reason(s, sub)
            except Exception as exc:  # last-resort guard: never crash the worker
                log.exception("pipeline crashed for %s", submission_id)
                s.rollback()
                sub = s.get(SubmissionRow, submission_id)
                if sub is not None and sub.status != S.failed:
                    repo.set_status(s, sub, S.failed, f"Internal error: {type(exc).__name__}")

    def _recognize(self, s: Session, sub: SubmissionRow) -> bool:
        """Returns True if the pipeline should continue straight to verification."""
        self._move(s, sub, S.recognizing)
        region = sub.region_bbox or FULL_PAGE
        try:
            png = Path(sub.source_image_path or "").read_bytes()
            lines: list[stages.RecognizedLine] = self._call(
                stages.get_stage("recognize"), self.settings.timeout_ocr, png, BBox(**region)
            )
            if not lines:
                raise stages.RecognitionUnavailable("No mathematical lines found in the selected region")
        except Exception as exc:
            # Keep the image; give the learner one editable placeholder region to type into.
            repo.add_regions(
                s,
                [
                    RecognizedRegionRow(
                        submission_id=sub.id,
                        line_index=0,
                        bbox=region,
                        latex="",
                        confidence=0.0,
                        recognizer_version="none",
                    )
                ],
            )
            self._move(
                s, sub, S.failed_recognition, f"We couldn't read this region ({exc}). Type it instead or re-crop."
            )
            return False

        rows = [
            RecognizedRegionRow(
                submission_id=sub.id,
                line_index=line.line_index,
                bbox=crop_to_page(line.bbox, region),
                latex=line.latex,
                confidence=line.confidence,
                recognizer_version=line.recognizer_version,
            )
            for line in sorted(lines, key=lambda ln: ln.line_index)
        ]
        repo.add_regions(s, rows)

        if any(r.confidence < self.settings.ocr_confidence_threshold for r in rows):
            self._move(s, sub, S.awaiting_confirmation, "We're not sure we read this correctly. Please check.")
            return False

        repo.replace_steps(s, sub.id, [(r.latex, r.id) for r in rows])
        return True

    def _verify_and_reason(self, s: Session, sub: SubmissionRow) -> None:
        self._move(s, sub, S.verifying)
        step_rows = repo.list_steps(s, sub.id)
        steps = [st.latex for st in step_rows]
        problem = self._problem(s, sub.problem_id)

        try:
            verification: VerificationResult = self._call(
                stages.get_stage("verify"), self.settings.timeout_verify, steps, problem
            )
        except Exception as exc:
            log.warning("verification failed for %s: %s", sub.id, exc)
            verification = all_inconclusive(steps, f"Verification could not complete ({type(exc).__name__})")
        unfinished = False
        try:
            verification, unfinished = self._call(
                mark_unfinished, self.settings.timeout_verify, verification, steps, problem
            )
        except Exception as exc:  # the check only ever downgrades "correct"; without it, keep the verdicts
            log.warning("completeness check failed for %s: %s", sub.id, exc)
        repo.save_evaluation(
            s,
            sub.id,
            verification=verification.model_dump(mode="json"),
            review=None,
            ai_status=AiStatus.pending,
            model_version=None,
            prompt_version=None,
        )

        self._move(s, sub, S.reasoning)
        concept_id = problem.concept_id if problem else None
        review_input = self._review_input(s, sub, problem, steps, step_rows, verification)
        review: ReviewResult | None = None
        try:
            review = self._call(stages.get_stage("reason"), self.settings.timeout_llm, review_input)
            review = ReviewResult.model_validate(review.model_dump())  # re-validate at the boundary
            review = enforce_sympy_authority(review, verification)
            if unfinished and review.error_type != ErrorType.incomplete:
                review = review.model_copy(update={"error_type": ErrorType.incomplete})
        except stages.ReviewUnavailable as exc:
            ai_status = AiStatus.invalid_output if exc.invalid_output else AiStatus.unavailable
        except Exception as exc:
            log.warning("reasoning failed for %s: %s", sub.id, exc)
            ai_status = AiStatus.unavailable
        else:
            ai_status = AiStatus.ok

        if review is not None and ai_status == AiStatus.ok:
            repo.save_evaluation(
                s,
                sub.id,
                review=review.model_dump(mode="json"),
                ai_status=ai_status,
                model_version=self.settings.ollama_model,
                prompt_version=self._prompt_version(),
            )
            self._move(s, sub, S.completed)
        else:
            prompt_version = self._prompt_version() if ai_status == AiStatus.invalid_output else None
            repo.save_evaluation(s, sub.id, ai_status=ai_status, prompt_version=prompt_version)
            self._move(s, sub, S.completed_without_ai, "AI explanation unavailable; showing verified checks only.")

        error_type = ErrorType.incomplete if unfinished else (review.error_type if review is not None else None)
        try:
            learning.record_attempt(s, sub, concept_id, verification, error_type, unfinished)
        except Exception:  # the review is stored and shown; mastery bookkeeping must not undo that
            log.exception("could not record the learning event for %s", sub.id)
            s.rollback()

    @staticmethod
    def _prompt_version() -> str:
        from app.services.reasoning import PROMPT_VERSION  # lazy: the reasoning package imports this module

        return PROMPT_VERSION

    @staticmethod
    def _review_input(
        s: Session,
        sub: SubmissionRow,
        problem: stages.ProblemContext | None,
        steps: list[str],
        step_rows: list[SolutionStepRow],
        verification: VerificationResult,
    ) -> stages.ReviewInput:
        concept_id = problem.concept_id if problem else None
        prerequisites: list[str] = []
        prior: list[str] = []
        if concept_id:
            prerequisites = [
                r.requires_concept_id
                for r in s.exec(select(PrerequisiteRow).where(PrerequisiteRow.concept_id == concept_id))
            ]
            prior = learning.prior_errors(s, sub.owner_id, concept_id)
        corrected = {r.id: r.corrected_latex for r in repo.list_regions(s, sub.id) if r.corrected_latex}
        return stages.ReviewInput(
            problem=problem,
            steps=steps,
            verification=verification,
            concept_id=concept_id,
            prerequisites=sorted(prerequisites),
            prior_errors=prior,
            ocr_corrections={st.index: corrected[st.region_id] for st in step_rows if st.region_id in corrected},
        )

    @staticmethod
    def _problem(s: Session, problem_id: str | None) -> stages.ProblemContext | None:
        if not problem_id:
            return None
        p = s.get(ProblemRow, problem_id)
        if p is None:
            return None
        return stages.ProblemContext(p.id, p.concept_id, p.prompt_latex, p.expected_answer_latex)
