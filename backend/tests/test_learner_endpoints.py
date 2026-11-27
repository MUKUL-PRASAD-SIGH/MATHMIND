"""Learner, concept and problem endpoints with real data in the DB.

`test_runner_and_seed.py` covers an empty learner. These tests insert mastery and revision rows so the
mapping, filtering and ordering rules are pinned down before T6.5 swaps in M3's adaptive engine.
"""

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.models import ConceptRow, MasteryProfileRow, RevisionQueueRow, User, utcnow
from app.repositories import learning as repo
from tests.conftest import API

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


# --- /learners/me/next (placeholder rule until T6.4) ----------------------------------------------------


def test_next_picks_lowest_mastery_among_root_concepts(client: TestClient) -> None:
    uid = me(client)
    add_rows(client, ConceptRow(id="fractions", name="Fractions", domain="arithmetic"))
    add_rows(client, MasteryProfileRow(user_id=uid, concept_id="fractions", mastery=0.1, attempts=2))
    nxt = client.get(f"{API}/learners/me/next").json()
    assert nxt["concept_id"] == "fractions"
    assert nxt["problem_id"] is None  # no problems seeded for it: still a valid suggestion
    assert nxt["action"] == "ask_another_question"
    assert "Fractions" in nxt["reason"]


def test_next_breaks_full_ties_by_concept_id(client: TestClient) -> None:
    add_rows(client, ConceptRow(id="a_counting", name="Counting", domain="arithmetic"))
    assert client.get(f"{API}/learners/me/next").json()["concept_id"] == "a_counting"
