"""Write shared/contracts/examples/<Schema>.<variant>.json — mock payloads for MSW (M2/M4).

Built through the Pydantic models so every example is valid by construction; tests/test_contracts.py
additionally validates each file against the exported JSON Schemas.

    python scripts/make_examples.py
"""

import json
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from pydantic import BaseModel  # noqa: E402

from app.schemas.common import Health  # noqa: E402
from app.schemas.learning import Concept, Mastery, NextAction, Problem, Revision  # noqa: E402
from app.schemas.notebooks import Notebook, Page, Stroke  # noqa: E402
from app.schemas.review import ReviewResult  # noqa: E402
from app.schemas.submissions import (  # noqa: E402
    ConfirmRequest,
    RecognizedRegion,
    ReviewResponse,
    SubmissionAccepted,
    SubmissionStatusResponse,
    TypedSubmissionCreate,
)
from app.schemas.verification import VerificationResult  # noqa: E402

OUT = BACKEND.parent / "shared" / "contracts" / "examples"
T = "2026-01-01T10:00:00Z"
SID = "sub_r2b_typed"

# R2-B: 2(x-3)=10 with a distribution error at step 2.
R2B_STEPS = ["2(x-3)=10", "2x-3=10", "2x=13", "x=6.5"]
verification_incorrect = {
    "steps": [
        {"index": 1, "latex": R2B_STEPS[0], "verdict": "supported", "reason": "Problem statement"},
        {
            "index": 2,
            "latex": R2B_STEPS[1],
            "verdict": "incorrect",
            "reason": "Solution set changed from {8} to {13/2}",
        },
        {
            "index": 3,
            "latex": R2B_STEPS[2],
            "verdict": "supported",
            "reason": "Equivalent to previous step",
            "after_error": True,
        },
        {
            "index": 4,
            "latex": R2B_STEPS[3],
            "verdict": "supported",
            "reason": "Equivalent to previous step",
            "after_error": True,
        },
    ],
    "first_error_step": 2,
    "overall": "incorrect",
    "verifier_version": "sympy-1.14",
}
verification_correct = {
    "steps": [
        {"index": 1, "latex": "3x+5=20", "verdict": "supported", "reason": "Problem statement"},
        {"index": 2, "latex": "3x=15", "verdict": "supported", "reason": "Equivalent to previous step"},
        {"index": 3, "latex": "x=5", "verdict": "supported", "reason": "Equivalent to previous step"},
    ],
    "first_error_step": None,
    "overall": "correct",
    "verifier_version": "sympy-1.14",
}
review_incorrect = {
    "status": "incorrect",
    "first_error_step": 2,
    "concept": "linear_equations",
    "error_type": "algebraic_transformation",
    "explanation": "When expanding 2(x-3), the 2 multiplies both x and -3, giving 2x-6.",
    "hint": "Multiply every term inside the bracket by 2.",
    "confidence": 0.72,
    "recommended_action": "targeted_practice",
}
region = {
    "submission_id": "sub_r2b_image",
    "bbox": {"x": 0.1, "y": 0.2, "w": 0.6, "h": 0.08},
    "corrected_latex": None,
    "recognizer_version": "pix2tex-0.1.2",
}

EXAMPLES: dict[str, BaseModel] = {
    "Health.ok": Health(version="0.1.0", ollama="up", ollama_model="qwen2.5:3b", pix2tex="loaded"),
    "Health.ai_down": Health(version="0.1.0", ollama="down", ollama_model="qwen2.5:3b", pix2tex="not_installed"),
    "Notebook.algebra": Notebook(
        id="nb_algebra", title="Algebra practice", domain="algebra", created_at=T, updated_at=T
    ),
    "Page.ruled": Page(
        id="pg_1",
        notebook_id="nb_algebra",
        chapter="Linear equations",
        order=0,
        title="Day 1",
        background="ruled",
        bookmarked=False,
        version=3,
        stroke_count=42,
    ),
    "Stroke.pen": Stroke(
        id="st_1",
        page_id="pg_1",
        points=[[0.10, 0.20], [0.11, 0.21], [0.13, 0.21]],
        pressure=[0.4, 0.55, 0.6],
        timestamps=[0, 8, 16],
        tool="pen",
        color="#1f2937",
        width=2,
        bbox={"x": 0.10, "y": 0.20, "w": 0.03, "h": 0.01},
    ),
    "TypedSubmissionCreate.r2b": TypedSubmissionCreate(
        page_id="pg_1", problem_id="lin-003", steps=[{"latex": s} for s in R2B_STEPS]
    ),
    "SubmissionAccepted.received": SubmissionAccepted(submission_id=SID, status="received"),
    "SubmissionStatusResponse.verifying": SubmissionStatusResponse(
        submission_id=SID, input_mode="typed", status="verifying", updated_at=T
    ),
    "SubmissionStatusResponse.awaiting_confirmation": SubmissionStatusResponse(
        submission_id="sub_r2b_image",
        input_mode="image",
        status="awaiting_confirmation",
        message="We're not sure we read this correctly. Please check.",
        updated_at=T,
    ),
    "SubmissionStatusResponse.failed_recognition": SubmissionStatusResponse(
        submission_id="sub_messy",
        input_mode="image",
        status="failed_recognition",
        message="We couldn't read this region. Type it instead or re-crop.",
        updated_at=T,
    ),
    "RecognizedRegion.uncertain": RecognizedRegion(
        id="rg_2",
        line_index=1,
        latex="2x-3=1O",
        confidence=0.41,
        confirmed=False,
        **{**region, "bbox": {"x": 0.1, "y": 0.29, "w": 0.6, "h": 0.08}},
    ),
    "ConfirmRequest.corrected": ConfirmRequest(
        regions=[{"id": "rg_1", "confirmed": True}, {"id": "rg_2", "confirmed": True, "corrected_latex": "2x-3=10"}]
    ),
    "VerificationResult.incorrect": VerificationResult.model_validate(verification_incorrect),
    "VerificationResult.correct": VerificationResult.model_validate(verification_correct),
    "ReviewResult.incorrect": ReviewResult.model_validate(review_incorrect),
    "ReviewResponse.completed_incorrect": ReviewResponse(
        submission_id="sub_r2b_image",
        status="completed",
        verification=verification_incorrect,
        review=review_incorrect,
        ai_status="ok",
        regions=[
            RecognizedRegion(
                id=f"rg_{i + 1}",
                line_index=i,
                latex=s,
                confidence=0.9,
                confirmed=True,
                **{**region, "bbox": {"x": 0.1, "y": 0.2 + 0.09 * i, "w": 0.6, "h": 0.08}},
            )
            for i, s in enumerate(R2B_STEPS)
        ],
        step_to_region={str(i + 1): f"rg_{i + 1}" for i in range(4)},
    ),
    "ReviewResponse.completed_without_ai": ReviewResponse(
        submission_id="sub_r2a_typed",
        status="completed_without_ai",
        verification=verification_correct,
        review=None,
        ai_status="unavailable",
        regions=[],
        step_to_region={},
    ),
    "Concept.linear_equations": Concept(
        id="linear_equations",
        name="Linear equations",
        domain="algebra",
        description="Equations of the form ax + b = c.",
        prerequisites=["algebraic_expressions", "fractions"],
    ),
    "Problem.lin-003": Problem(
        id="lin-003", concept_id="linear_equations", prompt_latex="2(x-3)=10", expected_answer_latex="x=8", difficulty=3
    ),
    "Mastery.some_progress": Mastery(
        items=[
            {
                "concept_id": "integer_arithmetic",
                "concept_name": "Integer arithmetic",
                "mastery": 0.82,
                "attempts": 9,
                "confidence_level": "high",
                "last_practised_at": T,
            },
            {
                "concept_id": "linear_equations",
                "concept_name": "Linear equations",
                "mastery": 0.46,
                "attempts": 4,
                "confidence_level": "medium",
                "last_practised_at": T,
            },
            {
                "concept_id": "quadratic_equations",
                "concept_name": "Quadratic equations",
                "mastery": 0.3,
                "attempts": 1,
                "confidence_level": "low",
                "last_practised_at": T,
            },
        ]
    ),
    "Mastery.empty": Mastery(items=[]),
    "Revision.one_due": Revision(
        items=[
            {
                "concept_id": "fractions",
                "concept_name": "Fractions",
                "due_at": T,
                "reason": "Solved after 2 hints yesterday; quick reinforcement.",
            }
        ]
    ),
    "NextAction.targeted_practice": NextAction(
        action="targeted_practice",
        concept_id="linear_equations",
        problem_id="lin-004",
        reason="You distributed only to the first term twice this week; let's practise brackets.",
    ),
}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.json"):
        old.unlink()
    for name, model in EXAMPLES.items():
        data = model.model_dump(mode="json", exclude_none=False)
        (OUT / f"{name}.json").write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(f"wrote {len(EXAMPLES)} examples to {OUT}")


if __name__ == "__main__":
    main()
