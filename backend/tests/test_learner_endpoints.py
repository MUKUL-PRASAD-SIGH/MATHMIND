"""Learner, concept and problem endpoints with real data in the DB.

`test_runner_and_seed.py` covers an empty learner. These tests insert mastery, revision and learning-event rows
so the mapping, filtering and ordering rules and the wiring to M3's adaptive engine (T6.5) are pinned down.
"""

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.models import (
    ConceptRow,
    EvaluationRow,
    LearningEventRow,
    MasteryProfileRow,
    RevisionQueueRow,
    SubmissionRow,
    User,
    utcnow,
)
from app.repositories import learning as repo
from app.services.jobs import stages
from app.services.verification import verify_steps
from tests.conftest import API
from tests.test_contracts import assert_valid

pytestmark = pytest.mark.integration


def me(client: TestClient) -> str:
    """The id of the default learner that every request runs as."""
    with Session(client.app.state.engine) as s:  # type: ignore[attr-defined]
        return repo.get_or_create_default_user(s).id


def add_rows(client: TestClient, *rows: object) -> None:
    with Session(client.app.state.engine) as s:  # type: ignore[attr-defined]
        for row in rows:
            s.add(row)
        s.commit()


# --- /problems ----------------------------------------------------------------------------------------


def test_problems_are_ordered_by_difficulty_then_id(client: TestClient) -> None:
    assert [p["id"] for p in client.get(f"{API}/problems").json()] == ["int-001", "lin-001"]


def test_problems_for_unknown_concept_is_empty_not_404(client: TestClient) -> None:
    r = client.get(f"{API}/problems", params={"concept": "calculus"})
    assert r.status_code == 200 and r.json() == []


def test_problems_concept_filter_is_length_limited(client: TestClient) -> None:
    assert client.get(f"{API}/problems", params={"concept": "x" * 65}).status_code == 422


# --- /learners/me/mastery -----------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("attempts", "level"),
    [(0, "low"), (2, "low"), (3, "medium"), (6, "medium"), (7, "high")],
)
def test_mastery_confidence_level_boundaries(client: TestClient, attempts: int, level: str) -> None:
    add_rows(client, MasteryProfileRow(user_id=me(client), concept_id="linear_equations", attempts=attempts))
    [item] = client.get(f"{API}/learners/me/mastery").json()["items"]
    assert item["confidence_level"] == level


def test_mastery_maps_rows_and_hides_last_practised_when_never_attempted(client: TestClient) -> None:
    uid = me(client)
    add_rows(
        client,
        MasteryProfileRow(user_id=uid, concept_id="linear_equations", mastery=0.72, attempts=4),
        MasteryProfileRow(user_id=uid, concept_id="integer_arithmetic", mastery=0.3, attempts=0),
    )
    items = client.get(f"{API}/learners/me/mastery").json()["items"]
    assert [i["concept_id"] for i in items] == ["integer_arithmetic", "linear_equations"]  # ordered by id
    untouched, practised = items
    assert untouched["last_practised_at"] is None
    assert practised["concept_name"] == "Linear equations"
    assert practised["mastery"] == pytest.approx(0.72)
    assert practised["attempts"] == 4
    assert practised["last_practised_at"] is not None


def test_mastery_excludes_other_learners(client: TestClient) -> None:
    me(client)  # the default learner must exist first, or the other user would become the default
    other = User(display_name="Someone else")
    other_id = other.id  # read before the commit expires the instance
    add_rows(client, other)
    add_rows(client, MasteryProfileRow(user_id=other_id, concept_id="linear_equations", mastery=0.9))
    assert client.get(f"{API}/learners/me/mastery").json() == {"items": []}


# --- /learners/me/revision ----------------------------------------------------------------------------


def test_revision_lists_only_due_items_oldest_first(client: TestClient) -> None:
    uid = me(client)
    now = utcnow()
    add_rows(
        client,
        RevisionQueueRow(user_id=uid, concept_id="linear_equations", due_at=now - timedelta(hours=1), reason="b"),
        RevisionQueueRow(user_id=uid, concept_id="integer_arithmetic", due_at=now - timedelta(days=2), reason="a"),
    )
    items = client.get(f"{API}/learners/me/revision").json()["items"]
    assert [(i["concept_id"], i["reason"]) for i in items] == [("integer_arithmetic", "a"), ("linear_equations", "b")]
    assert items[0]["concept_name"] == "Integer arithmetic"


def test_revision_hides_items_not_yet_due(client: TestClient) -> None:
    add_rows(
        client,
        RevisionQueueRow(user_id=me(client), concept_id="linear_equations", due_at=utcnow() + timedelta(days=1)),
    )
    assert client.get(f"{API}/learners/me/revision").json() == {"items": []}


# --- /learners/me/next (M3's next-action rule table, T6.4) ---------------------------------------------


def events(client: TestClient, concept_id: str, *items: tuple[float | None, str | None]) -> None:
    """Attempt events (score, error_type), oldest first, without submissions: the outcome comes from the score."""
    uid, now = me(client), utcnow()
    n = len(items)
    add_rows(
        client,
        *(
            LearningEventRow(
                user_id=uid,
                concept_id=concept_id,
                kind="attempt",
                score=sc,
                error_type=et,
                at=now - timedelta(minutes=n - i),
            )
            for i, (sc, et) in enumerate(items)
        ),
    )


def test_next_without_history_starts_on_the_first_root_concept(client: TestClient) -> None:
    add_rows(client, ConceptRow(id="fractions", name="Fractions", domain="arithmetic"))
    nxt = client.get(f"{API}/learners/me/next").json()
    assert_valid("NextAction", nxt)
    assert nxt["concept_id"] == "fractions"  # first concept without prerequisites, by id
    assert nxt["problem_id"] is None  # no problems seeded for it: still a valid suggestion
    assert nxt["action"] == "ask_another_question"  # < 2 attempts: no strong claim
    assert "fractions" in nxt["reason"]


def test_next_follows_the_most_recent_attempt(client: TestClient) -> None:
    events(client, "linear_equations", (1.0, None))
    nxt = client.get(f"{API}/learners/me/next").json()
    assert (nxt["concept_id"], nxt["problem_id"], nxt["action"]) == (
        "linear_equations",
        "lin-001",
        "ask_another_question",
    )


def test_next_sends_repeated_conceptual_errors_to_the_weakest_prerequisite(client: TestClient) -> None:
    add_rows(client, MasteryProfileRow(user_id=me(client), concept_id="integer_arithmetic", mastery=0.4, attempts=3))
    events(client, "linear_equations", (0.0, "algebraic_transformation"), (0.0, "algebraic_transformation"))
    nxt = client.get(f"{API}/learners/me/next").json()
    assert_valid("NextAction", nxt)
    assert (nxt["action"], nxt["concept_id"], nxt["problem_id"]) == (
        "prerequisite_review",
        "integer_arithmetic",
        "int-001",
    )
    assert "2 times" in nxt["reason"]


def test_next_targets_an_arithmetic_slip_after_step_one(client: TestClient) -> None:
    uid = me(client)
    sub = SubmissionRow(owner_id=uid, input_mode="typed", problem_id="lin-001", status="completed")
    sub_id = sub.id
    add_rows(client, sub)
    add_rows(
        client,
        EvaluationRow(submission_id=sub_id, verification={"overall": "incorrect", "first_error_step": 3, "steps": []}),
    )
    events(client, "linear_equations", (1.0, None))
    add_rows(
        client,
        LearningEventRow(
            user_id=uid,
            concept_id="linear_equations",
            submission_id=sub_id,
            kind="attempt",
            score=0.0,
            error_type="arithmetic_slip",
        ),
    )
    nxt = client.get(f"{API}/learners/me/next").json()
    assert nxt["action"] == "targeted_practice"
    assert "step 3" in nxt["reason"]


# --- end to end: a reviewed submission feeds all three endpoints ------------------------------------------


def test_reviewed_submission_feeds_mastery_and_next(client: TestClient) -> None:
    stages.register_stage("verify", verify_steps)
    for steps in (["3x+5=20", "3x=15", "x=5"], ["3x+5=20", "3x=15", "x=5"]):
        r = client.post(
            f"{API}/submissions/typed", json={"problem_id": "lin-001", "steps": [{"latex": s} for s in steps]}
        )
        assert r.status_code == 202

    mastery = client.get(f"{API}/learners/me/mastery").json()
    assert_valid("Mastery", mastery)
    [item] = mastery["items"]
    # 0.3 -> 0.51 (correct) -> 0.597 (correct, but a repeat of the same problem scores 0.8)
    assert item["concept_id"] == "linear_equations" and item["mastery"] == pytest.approx(0.597)
    assert (item["attempts"], item["confidence_level"]) == (2, "low")
    assert item["last_practised_at"] is not None

    nxt = client.get(f"{API}/learners/me/next").json()
    assert_valid("NextAction", nxt)
    assert (nxt["action"], nxt["concept_id"]) == ("continue", "linear_equations")
    assert_valid("Revision", client.get(f"{API}/learners/me/revision").json())
