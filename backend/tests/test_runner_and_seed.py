import time
from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import Settings
from app.core.db import init_db, make_engine
from app.models import ConceptRow, ProblemRow, SubmissionRow, User
from app.seed import seed
from app.services.jobs.runner import JobRunner
from tests.conftest import API


@pytest.mark.integration
def test_background_mode_completes_and_is_pollable(make_client: Callable[..., TestClient], tmp_path) -> None:  # type: ignore[no-untyped-def]
    # Real file DB: in-memory SQLite shares one connection across threads, which isn't how we run.
    client = make_client(synchronous=False, database_url=f"sqlite:///{(tmp_path / 'bg.db').as_posix()}")
    sid = client.post(f"{API}/submissions/typed", json={"steps": [{"latex": "x=1"}]}).json()["submission_id"]
    deadline = time.monotonic() + 10
    st = ""
    while time.monotonic() < deadline:
        st = client.get(f"{API}/submissions/{sid}/status").json()["status"]
        if st == "completed_without_ai":
            break
        time.sleep(0.05)
    assert st == "completed_without_ai"


@pytest.mark.integration
def test_restart_recovery_marks_stuck_jobs_failed(settings: Settings) -> None:
    engine = make_engine("sqlite://")
    init_db(engine)
    with Session(engine) as s:
        user = User()
        s.add(user)
        s.commit()
        for st in ("received", "recognizing", "verifying", "reasoning", "awaiting_confirmation", "completed"):
            s.add(SubmissionRow(id=st, owner_id=user.id, input_mode="typed", status=st))
        s.commit()
    runner = JobRunner(engine, settings, synchronous=True)
    assert runner.recover_interrupted() == 4
    with Session(engine) as s:
        assert s.get(SubmissionRow, "verifying").status == "failed"  # type: ignore[union-attr]
        assert s.get(SubmissionRow, "awaiting_confirmation").status == "awaiting_confirmation"  # type: ignore[union-attr]
        assert s.get(SubmissionRow, "completed").status == "completed"  # type: ignore[union-attr]
    runner.shutdown()


@pytest.mark.integration
def test_other_users_submissions_are_invisible(client: TestClient) -> None:
    engine = client.app.state.engine  # type: ignore[attr-defined]
    with Session(engine) as s:
        other = User(display_name="someone else")
        s.add(other)
        s.commit()
        s.add(SubmissionRow(id="foreign", owner_id=other.id, input_mode="typed", status="completed"))
        s.commit()
    assert client.get(f"{API}/submissions/foreign/status").status_code == 404
    assert client.get(f"{API}/submissions/foreign/review").status_code == 404


@pytest.mark.unit
def test_seed_is_idempotent(datasets_dir) -> None:  # type: ignore[no-untyped-def]
    engine = make_engine("sqlite://")
    init_db(engine)
    assert seed(engine, datasets_dir) == (2, 2)
    assert seed(engine, datasets_dir) == (2, 2)
    with Session(engine) as s:
        from sqlmodel import select

        assert len(list(s.exec(select(ConceptRow)))) == 2
        assert len(list(s.exec(select(ProblemRow)))) == 2


@pytest.mark.unit
def test_seed_rejects_unknown_prerequisite(tmp_path) -> None:  # type: ignore[no-untyped-def]
    (tmp_path / "concepts").mkdir()
    (tmp_path / "concepts" / "concepts.json").write_text(
        '[{"id":"a","name":"A","domain":"algebra","prerequisites":["ghost"]}]', encoding="utf-8"
    )
    engine = make_engine("sqlite://")
    init_db(engine)
    with pytest.raises(ValueError, match="ghost"):
        seed(engine, tmp_path)


@pytest.mark.unit
def test_seed_with_no_datasets_is_noop(tmp_path) -> None:  # type: ignore[no-untyped-def]
    engine = make_engine("sqlite://")
    init_db(engine)
    assert seed(engine, tmp_path / "missing") == (0, 0)


@pytest.mark.integration
def test_learner_endpoints(client: TestClient) -> None:
    concepts = client.get(f"{API}/concepts").json()
    assert {c["id"] for c in concepts} == {"integer_arithmetic", "linear_equations"}
    lin = next(c for c in concepts if c["id"] == "linear_equations")
    assert lin["prerequisites"] == ["integer_arithmetic"]
    assert [p["id"] for p in client.get(f"{API}/problems", params={"concept": "linear_equations"}).json()] == [
        "lin-001"
    ]
    assert client.get(f"{API}/learners/me/mastery").json() == {"items": []}
    assert client.get(f"{API}/learners/me/revision").json() == {"items": []}
    nxt = client.get(f"{API}/learners/me/next").json()
    assert nxt["concept_id"] == "integer_arithmetic"
    assert nxt["problem_id"] == "int-001"
    assert "T6.4" in nxt["reason"]


@pytest.mark.integration
def test_next_without_concepts_is_404(make_client: Callable[..., TestClient]) -> None:
    client = make_client(seed_on_startup=False)
    assert client.get(f"{API}/learners/me/next").status_code == 404
