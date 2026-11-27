"""T5.2 reviewer inside the typed pipeline (Ollama mocked or dead)."""

import pytest
from fastapi.testclient import TestClient

from app.services.jobs import stages
from app.services.reasoning import OllamaClient, Reviewer
from app.services.verification import verify_steps
from tests.conftest import API
from tests.reasoning.test_reviewer import FakeClient, j

pytestmark = pytest.mark.integration


def _review(client: TestClient, steps: list[str]) -> dict[str, object]:
    r = client.post(f"{API}/submissions/typed", json={"steps": [{"latex": s} for s in steps]})
    assert r.status_code == 202, r.text
    return dict(client.get(f"{API}/submissions/{r.json()['submission_id']}/review").json())


def test_completed_with_validated_review(client: TestClient) -> None:
    stages.register_stage("verify", verify_steps)
    stages.register_stage("reason", Reviewer(FakeClient("not json", j()), system_prompt="p").review)
    body = _review(client, ["2(x-3)=10", "2x-3=10", "2x=13", "x=6.5"])
    assert body["status"] == "completed"
    assert body["ai_status"] == "ok"
    review = body["review"]
    assert isinstance(review, dict)
    assert review["first_error_step"] == 2 and review["overridden"] is False


def test_dead_ollama_completes_without_ai_and_keeps_verification(client: TestClient) -> None:
    dead = OllamaClient("http://127.0.0.1:1", "qwen2.5:3b", timeout=1)
    stages.register_stage("verify", verify_steps)
    stages.register_stage("reason", Reviewer(dead).review)
    body = _review(client, ["3x+5=20", "3x=15", "x=5"])
    assert body["status"] == "completed_without_ai"
    assert body["ai_status"] == "unavailable"
    verification = body["verification"]
    assert isinstance(verification, dict) and verification["overall"] == "correct"


def test_invalid_output_twice_is_reported(client: TestClient) -> None:
    stages.register_stage("reason", Reviewer(FakeClient("{}", "[]"), system_prompt="p").review)
    body = _review(client, ["x=1"])
    assert body["status"] == "completed_without_ai"
    assert body["ai_status"] == "invalid_output"
