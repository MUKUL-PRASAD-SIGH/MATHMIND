"""T5.3: verify -> reason orchestration, Ollama up/down/timeout, unfinished attempts, learning events."""

import json
from collections.abc import Callable
from datetime import timedelta
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models import EvaluationRow, LearningEventRow, MasteryProfileRow, RevisionQueueRow, utcnow
from app.repositories import learning as learning_repo
from app.schemas.learning import NextAction
from app.schemas.review import RecommendedAction
from app.services.jobs import learning, stages
from app.services.jobs.completeness import mark_unfinished, unfinished_reason
from app.services.reasoning import PROMPT_VERSION, OllamaClient, Reviewer
from app.services.verification import verify_steps
from tests.conftest import API
from tests.test_contracts import assert_valid

pytestmark = pytest.mark.integration

LIN = stages.ProblemContext("lin-001", "linear_equations", "3x+5=20", "x=5")
CORRECT_REVIEW: dict[str, Any] = {
    "status": "correct",
    "first_error_step": None,
    "concept": "linear_equations",
    "error_type": None,
    "explanation": "Each step keeps the same solution.",
    "hint": "Check your answer by substituting it back.",
    "confidence": 0.8,
    "recommended_action": "continue",
}


def ollama(chat: Callable[[httpx.Request], httpx.Response]) -> Reviewer:
    """The real reviewer + Ollama client, with the HTTP layer mocked."""

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/tags":
            return httpx.Response(200, json={"models": [{"name": "qwen2.5:3b"}]})
        return chat(request)

    client = OllamaClient("http://127.0.0.1:11434", "qwen2.5:3b", timeout=1, transport=httpx.MockTransport(handler))
    return Reviewer(client, system_prompt="explain")


def replying(payload: dict[str, Any]) -> Callable[[httpx.Request], httpx.Response]:
    return lambda request: httpx.Response(200, json={"message": {"content": json.dumps(payload)}})


def submit(client: TestClient, steps: list[str], **extra: object) -> str:
    r = client.post(f"{API}/submissions/typed", json={"steps": [{"latex": s} for s in steps], **extra})
    assert r.status_code == 202, r.text
    return str(r.json()["submission_id"])


def review(client: TestClient, sid: str) -> dict[str, Any]:
    r = client.get(f"{API}/submissions/{sid}/review")
    assert r.status_code == 200, r.text
    body = dict(r.json())
    assert_valid("ReviewResponse", body)
    return body


def evaluation(client: TestClient, sid: str) -> EvaluationRow:
    with Session(client.app.state.engine) as s:  # type: ignore[attr-defined]
        row = s.get(EvaluationRow, sid)
        assert row is not None
        return row


def events(client: TestClient) -> list[LearningEventRow]:
    with Session(client.app.state.engine) as s:  # type: ignore[attr-defined]
        return list(s.exec(select(LearningEventRow)))


def mastery(client: TestClient, concept_id: str = "linear_equations") -> MasteryProfileRow | None:
    with Session(client.app.state.engine) as s:  # type: ignore[attr-defined]
        return s.get(MasteryProfileRow, (learning_repo.get_or_create_default_user(s).id, concept_id))


@pytest.fixture(autouse=True)
def _real_verifier() -> None:
    stages.register_stage("verify", verify_steps)


# ---- Ollama up / down / timeout ---------------------------------------------------------------------


def test_ollama_up_completes_and_stores_prompt_and_model_version(client: TestClient) -> None:
    stages.register_stage("reason", ollama(replying(CORRECT_REVIEW)).review)
    sid = submit(client, ["3x+5=20", "3x=15", "x=5"], problem_id="lin-001")
    body = review(client, sid)
    assert (body["status"], body["ai_status"]) == ("completed", "ok")
    assert body["verification"]["overall"] == "correct"
    assert body["review"]["status"] == "correct"
    ev = evaluation(client, sid)
    assert (ev.prompt_version, ev.model_version) == (PROMPT_VERSION, "qwen2.5:3b")


def test_ollama_down_keeps_verification(client: TestClient) -> None:
    def refused(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)

    down = OllamaClient("http://127.0.0.1:11434", "qwen2.5:3b", transport=httpx.MockTransport(refused))
    stages.register_stage("reason", Reviewer(down, system_prompt="explain").review)
    sid = submit(client, ["3x+5=20", "3x=16", "x=16/3"], problem_id="lin-001")
    body = review(client, sid)
    assert (body["status"], body["ai_status"], body["review"]) == ("completed_without_ai", "unavailable", None)
    assert body["verification"]["first_error_step"] == 2
    assert evaluation(client, sid).prompt_version is None  # the model was never asked


def test_ollama_timeout_keeps_verification(client: TestClient) -> None:
    def slow(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("timed out", request=request)

    stages.register_stage("reason", ollama(slow).review)
    body = review(client, submit(client, ["3x+5=20", "3x=15", "x=5"]))
    assert (body["status"], body["ai_status"]) == ("completed_without_ai", "unavailable")
    assert body["verification"]["overall"] == "correct"


def test_r3_failure_demo_work_is_preserved_and_labelled(client: TestClient) -> None:
    """R3: Ollama stopped (the test settings point at a dead port) -> work kept, deterministic result shown."""
    stages.register_stage("reason", Reviewer(OllamaClient("http://127.0.0.1:1", "qwen2.5:3b", timeout=1)).review)
    steps = ["2(x-3)=10", "2x-3=10", "2x=13", "x=6.5"]
    sid = submit(client, steps)
    body = review(client, sid)
    assert body["ai_status"] == "unavailable"
    assert [s["latex"] for s in body["verification"]["steps"]] == steps
    assert body["verification"]["first_error_step"] == 2
    status = client.get(f"{API}/submissions/{sid}/status").json()
    assert "AI explanation unavailable" in status["message"]


# ---- unfinished attempts -----------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("steps", "problem", "unfinished"),
    [
        (["2x+3=13", "2x=10"], None, True),
        (["2x+3=13", "2x=10", "x=5"], None, False),
        (["2x+3=13", "2x=10", "5=x"], None, False),
        (["3x+5=20", "3x=15"], LIN, True),
        (["x^{2}-5x+6=0", "(x-2)(x-3)=0"], None, True),
        (["x^{2}-5x+6=0", r"x=2 \text{ or } x=3"], None, False),
        (["2x+1>7", "2x>6"], None, True),
        (["2x+1>7", "x>3"], None, False),
        (["x^{2}-5x+6"], stages.ProblemContext("f", "factorization", "x^{2}-5x+6", "(x-2)(x-3)"), True),
        (["(x-2)(x-3)"], stages.ProblemContext("f", "factorization", "x^{2}-5x+6", "(x-2)(x-3)"), False),
        (["7-12", "-5"], stages.ProblemContext("i", "integer_arithmetic", "7-12", "-5"), False),
        (["3x+6"], None, False),  # an expression with no target form: nothing to say
        (["\\unparseable{"], LIN, False),
    ],
)
def test_unfinished_reason(steps: list[str], problem: stages.ProblemContext | None, unfinished: bool) -> None:
    assert (unfinished_reason(steps, problem) is not None) is unfinished


def test_mark_unfinished_only_downgrades_correct() -> None:
    wrong = verify_steps(["2x+3=13", "2x=16"], None)
    assert mark_unfinished(wrong, ["2x+3=13", "2x=16"], None) == (wrong, False)
    done, flagged = mark_unfinished(verify_steps(["2x+3=13", "2x=10"], None), ["2x+3=13", "2x=10"], None)
    assert flagged and done.overall == "incorrect" and done.first_error_step is None
    assert {s.verdict for s in done.steps} == {"supported"}  # no step is wrong


def test_unfinished_attempt_is_never_called_correct_without_ai(client: TestClient) -> None:
    body = review(client, submit(client, ["2x+3=13", "2x=10"]))
    v = body["verification"]
    assert body["ai_status"] == "unavailable"
    assert v["overall"] == "incorrect" and v["first_error_step"] is None
    assert [s["verdict"] for s in v["steps"]] == ["supported", "supported"]
    assert "not yet solved for x" in v["steps"][-1]["reason"]


def test_unfinished_attempt_overrides_an_llm_that_says_correct(client: TestClient) -> None:
    stages.register_stage("reason", ollama(replying(CORRECT_REVIEW)).review)
    sid = submit(client, ["3x+5=20", "3x=15"], problem_id="lin-001")
    rv = review(client, sid)["review"]
    assert rv["status"] == "incorrect" and rv["error_type"] == "incomplete" and rv["overridden"] is True
    [event] = events(client)
    assert (event.error_type, event.score) == ("incomplete", learning.UNFINISHED_SCORE)
    m = mastery(client)
    assert m is not None and m.mastery == pytest.approx(0.3) and m.attempts == 1  # 0.7*0.3 + 0.3*0.3


# ---- learning events -> mastery / revision ------------------------------------------------------------


def test_correct_attempt_updates_mastery_once_even_after_rereview(client: TestClient) -> None:
    sid = submit(client, ["3x+5=20", "3x=15", "x=5"], problem_id="lin-001")
    m = mastery(client)
    assert m is not None and m.mastery == pytest.approx(0.51) and m.attempts == 1  # 0.7*0.3 + 0.3*1.0
    assert client.post(f"{API}/submissions/{sid}/review").status_code == 202
    assert review(client, sid)["status"] == "completed_without_ai"
    m = mastery(client)
    assert m is not None and m.attempts == 1
    assert len(events(client)) == 1


def test_repeat_attempt_on_the_same_problem_scores_like_a_hint(client: TestClient) -> None:
    submit(client, ["3x+5=20", "3x=16"], problem_id="lin-001")
    submit(client, ["3x+5=20", "3x=15", "x=5"], problem_id="lin-001")
    assert [e.score for e in sorted(events(client), key=lambda e: e.at)] == [0.0, 0.8]


def test_inconclusive_attempt_logs_the_event_but_keeps_mastery(client: TestClient) -> None:
    stages.reset_stages()  # stub verifier: everything inconclusive
    submit(client, ["3x+5=20", "x=5"], problem_id="lin-001")
    [event] = events(client)
    assert event.score is None and event.concept_id == "linear_equations"
    assert mastery(client) is None


def test_attempt_without_a_problem_has_no_concept_to_update(client: TestClient) -> None:
    submit(client, ["2x+3=13", "2x=10", "x=5"])
    [event] = events(client)
    assert event.concept_id is None and event.score == 1.0


def test_correct_attempt_on_a_due_revision_clears_it(client: TestClient) -> None:
    with Session(client.app.state.engine) as s:  # type: ignore[attr-defined]
        uid = learning_repo.get_or_create_default_user(s).id
        s.add(RevisionQueueRow(user_id=uid, concept_id="linear_equations", due_at=utcnow() - timedelta(hours=1)))
        s.commit()
    submit(client, ["3x+5=20", "3x=15", "x=5"], problem_id="lin-001")
    [event] = events(client)
    assert event.kind == "revision"
    assert client.get(f"{API}/learners/me/revision").json() == {"items": []}


def test_schedule_revision_recommendation_queues_the_concept(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    def recommend(s: Session, user_id: str, concept_id: str | None = None) -> NextAction:
        return NextAction(action=RecommendedAction.schedule_revision, concept_id="linear_equations", reason="r")

    monkeypatch.setattr(learning, "recommend", recommend)
    before = utcnow()
    submit(client, ["3x+5=20", "3x=15", "x=5"], problem_id="lin-001")
    with Session(client.app.state.engine) as s:  # type: ignore[attr-defined]
        [item] = s.exec(select(RevisionQueueRow)).all()
    assert learning.aware(item.due_at) - before >= timedelta(hours=23)
    assert client.get(f"{API}/learners/me/revision").json() == {"items": []}  # not due until tomorrow


def test_review_input_carries_concept_context(client: TestClient) -> None:
    seen: list[stages.ReviewInput] = []

    def spy(data: stages.ReviewInput) -> Any:
        seen.append(data)
        raise stages.ReviewUnavailable()

    stages.register_stage("reason", spy)
    stages.register_stage("verify", lambda steps, problem: verify_steps(["3x+5=20", "3x=16"], problem))
    submit(client, ["3x+5=20", "3x=16"], problem_id="lin-001")
    with Session(client.app.state.engine) as s:  # type: ignore[attr-defined]
        [event] = s.exec(select(LearningEventRow)).all()
        event.error_type = "sign_error"  # as if the reviewer had classified the first attempt
        s.add(event)
        s.commit()
    submit(client, ["3x+5=20", "3x=16"], problem_id="lin-001")
    assert seen[-1].prerequisites == ["integer_arithmetic"]
    assert seen[-1].prior_errors == ["sign_error"]
