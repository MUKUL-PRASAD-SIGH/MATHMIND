"""T3.4 (Milestone A): the real verifier inside the typed pipeline."""

import pytest
from fastapi.testclient import TestClient

from app.services.jobs import stages
from app.services.verification import verify_steps
from tests.conftest import API
from tests.test_contracts import assert_valid

pytestmark = pytest.mark.integration


def _review(client: TestClient, steps: list[str], **extra: object) -> dict[str, object]:
    r = client.post(f"{API}/submissions/typed", json={"steps": [{"latex": s} for s in steps], **extra})
    assert r.status_code == 202, r.text
    body = client.get(f"{API}/submissions/{r.json()['submission_id']}/review")
    assert body.status_code == 200, body.text
    return dict(body.json())


def test_install_registers_the_real_verifier() -> None:
    assert stages.is_stub("verify")
    stages.install_real_stages()
    assert stages.get_stage("verify") is verify_steps
    assert not stages.is_stub("recognize")
    assert not stages.is_stub("reason")


def test_r2a_typed_submission_all_supported_without_ai(client: TestClient) -> None:
    stages.register_stage("verify", verify_steps)
    body = _review(client, ["3x+5=20", "3x=15", "x=5"], problem_id="lin-001")
    assert body["status"] == "completed_without_ai"
    assert body["ai_status"] == "unavailable"
    verification = body["verification"]
    assert isinstance(verification, dict)
    assert [s["verdict"] for s in verification["steps"]] == ["supported"] * 3
    assert verification["overall"] == "correct"
    assert_valid("ReviewResponse", body)


def test_r2b_typed_submission_first_error_at_step_2(client: TestClient) -> None:
    stages.register_stage("verify", verify_steps)
    body = _review(client, ["2(x-3)=10", "2x-3=10", "2x=13", "x=6.5"])
    verification = body["verification"]
    assert isinstance(verification, dict)
    assert verification["first_error_step"] == 2
    assert verification["overall"] == "incorrect"
    assert [s["after_error"] for s in verification["steps"]] == [False, False, True, True]
