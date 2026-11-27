"""Typed pipeline: received -> verifying -> reasoning -> completed / completed_without_ai."""

import time

import pytest
from fastapi.testclient import TestClient

from app.schemas.review import ReviewResult
from app.schemas.verification import Overall, StepVerdict, Verdict, VerificationResult
from app.services.jobs import stages
from tests.conftest import API

pytestmark = pytest.mark.integration

R2B_STEPS = ["2(x-3)=10", "2x-3=10", "2x=13", "x=6.5"]


def fake_verify_error_at_2(steps: list[str], problem: stages.ProblemContext | None) -> VerificationResult:
    verdicts = [
        StepVerdict(
            index=i,
            latex=s,
            verdict=Verdict.supported if i != 2 else Verdict.incorrect,
            reason="ok" if i != 2 else "solution set changed",
            after_error=i > 2,
        )
        for i, s in enumerate(steps, start=1)
    ]
    return VerificationResult(steps=verdicts, first_error_step=2, overall=Overall.incorrect, verifier_version="fake")


def fake_review(status: str = "incorrect", first: int | None = 2) -> stages.ReasonFn:
    def _reason(data: stages.ReviewInput) -> ReviewResult:
        return ReviewResult(
            status=Overall(status),
            first_error_step=first,
            concept="linear_equations",
            error_type="algebraic_transformation",
            explanation="2 was not distributed to -3.",
            hint="Multiply every term inside the bracket.",
            confidence=0.7,
            recommended_action="targeted_practice",
        )

    return _reason


def submit(client: TestClient, steps: list[str], **extra: object) -> str:
    r = client.post(f"{API}/submissions/typed", json={"steps": [{"latex": s} for s in steps], **extra})
    assert r.status_code == 202, r.text
    return str(r.json()["submission_id"])


def review(client: TestClient, sid: str) -> dict[str, object]:
    r = client.get(f"{API}/submissions/{sid}/review")
    assert r.status_code == 200, r.text
    return dict(r.json())


def test_stubs_degrade_safely_never_incorrect(client: TestClient) -> None:
    sid = submit(client, ["3x+5=20", "3x=15", "x=5"])
    body = review(client, sid)
    assert body["status"] == "completed_without_ai"
    assert body["ai_status"] == "unavailable"
    verification = body["verification"]
    assert isinstance(verification, dict)
    assert {s["verdict"] for s in verification["steps"]} == {"inconclusive"}
    assert body["review"] is None


def test_full_pipeline_with_real_stages(client: TestClient) -> None:
    stages.register_stage("verify", fake_verify_error_at_2)
    stages.register_stage("reason", fake_review())
    body = review(client, submit(client, R2B_STEPS, problem_id="lin-001"))
    assert body["status"] == "completed"
    assert body["ai_status"] == "ok"
    assert body["verification"]["first_error_step"] == 2  # type: ignore[index]
    assert body["review"]["hint"].startswith("Multiply")  # type: ignore[index]
    assert body["review"]["overridden"] is False  # type: ignore[index]


def test_llm_disagreement_is_overridden_by_sympy(client: TestClient) -> None:
    stages.register_stage("verify", fake_verify_error_at_2)
    stages.register_stage("reason", fake_review(status="correct", first=None))
    rv = review(client, submit(client, R2B_STEPS))["review"]
    assert isinstance(rv, dict)
    assert rv["status"] == "incorrect"
    assert rv["first_error_step"] == 2
    assert rv["overridden"] is True


def test_invalid_llm_output_reports_invalid_output(client: TestClient) -> None:
    def bad(data: stages.ReviewInput) -> ReviewResult:
        raise stages.ReviewUnavailable("schema invalid twice", invalid_output=True)

    stages.register_stage("reason", bad)
    body = review(client, submit(client, ["x=1"]))
    assert body["status"] == "completed_without_ai"
    assert body["ai_status"] == "invalid_output"


def test_llm_timeout_keeps_verification(client: TestClient) -> None:
    def slow(data: stages.ReviewInput) -> ReviewResult:
        time.sleep(3)
        raise AssertionError("should have timed out")

    stages.register_stage("verify", fake_verify_error_at_2)
    stages.register_stage("reason", slow)
    body = review(client, submit(client, R2B_STEPS))
    assert body["status"] == "completed_without_ai"
    assert body["verification"]["first_error_step"] == 2  # type: ignore[index]


def test_verifier_crash_becomes_inconclusive_not_failure(client: TestClient) -> None:
    def boom(steps: list[str], problem: object) -> VerificationResult:
        raise RuntimeError("sympy exploded")

    stages.register_stage("verify", boom)
    body = review(client, submit(client, ["x=1", "x=2"]))
    assert body["status"] == "completed_without_ai"
    assert body["verification"]["overall"] == "inconclusive"  # type: ignore[index]


def test_problem_context_reaches_stages(client: TestClient) -> None:
    seen: dict[str, object] = {}

    def spy(steps: list[str], problem: stages.ProblemContext | None) -> VerificationResult:
        seen["problem"] = problem
        return stages.stub_verify(steps, problem)

    stages.register_stage("verify", spy)
    submit(client, ["3x+5=20"], problem_id="lin-001")
    problem = seen["problem"]
    assert isinstance(problem, stages.ProblemContext)
    assert problem.expected_answer_latex == "x=5"


def test_review_not_ready_and_rereview(client: TestClient) -> None:
    sid = submit(client, ["x=1"])
    assert client.post(f"{API}/submissions/{sid}/review").status_code == 202
    assert review(client, sid)["status"] == "completed_without_ai"


def test_validation_limits(client: TestClient) -> None:
    assert client.post(f"{API}/submissions/typed", json={"steps": []}).status_code == 422
    assert client.post(f"{API}/submissions/typed", json={"steps": [{"latex": ""}]}).status_code == 422
    too_many = {"steps": [{"latex": "x=1"}] * 51}
    assert client.post(f"{API}/submissions/typed", json=too_many).status_code == 422


def test_unknown_submission_404(client: TestClient) -> None:
    assert client.get(f"{API}/submissions/missing/status").status_code == 404
    assert client.get(f"{API}/submissions/missing/review").status_code == 404
