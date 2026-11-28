"""T7.7: data export, data deletion, and 404 for objects owned by someone else."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.models import NotebookRow, PageRow, SubmissionRow, User
from app.repositories import privacy as privacy_repo
from app.repositories import submissions as submission_repo
from app.schemas.privacy import LearnerExport
from tests.conftest import API, png_bytes
from tests.test_health_and_notebooks import stroke
from tests.test_submissions_typed import submit

pytestmark = pytest.mark.integration


def make_page(client: TestClient, title: str = "Algebra") -> tuple[str, str]:
    nb = client.post(f"{API}/notebooks", json={"title": title}).json()["id"]
    r = client.put(f"{API}/notebooks/{nb}/pages/p1", json={"order": 0, "version": 0, "strokes": [stroke("p1")]})
    assert r.status_code == 200, r.text
    return nb, "p1"


def upload_image(client: TestClient) -> str:
    r = client.post(f"{API}/submissions/image", files={"file": ("x.png", png_bytes(), "image/png")})
    assert r.status_code == 202, r.text
    return str(r.json()["submission_id"])


def other_users_data(client: TestClient) -> dict[str, str]:
    """A second learner's notebook, page and submission, created straight in the DB."""
    engine = client.app.state.engine  # type: ignore[attr-defined]
    with Session(engine) as s:
        other = User(display_name="Someone else")
        s.add(other)
        s.flush()
        nb = NotebookRow(owner_id=other.id, title="Private")
        s.add(nb)
        s.flush()
        s.add(PageRow(id="their-page", notebook_id=nb.id))
        sub = submission_repo.create_submission(s, other.id, "typed", status="completed")
        submission_repo.replace_steps(s, sub.id, [("x=1", None)])
        s.commit()
        return {"user": other.id, "notebook": nb.id, "submission": sub.id}


# --- export -------------------------------------------------------------------------------------------


def test_export_contains_everything_and_matches_contract(client: TestClient) -> None:
    nb, _ = make_page(client)
    sid = submit(client, ["x+1=2", "x=1"])
    image_sid = upload_image(client)

    r = client.get(f"{API}/learners/me/export")
    assert r.status_code == 200, r.text
    data = LearnerExport.model_validate(r.json())

    assert data.format_version == 1
    assert [n.id for n in data.notebooks] == [nb]
    page = data.notebooks[0].pages[0]
    assert page.id == "p1" and page.stroke_count == 1 and page.strokes[0].points == [[0.1, 0.1], [0.2, 0.25]]

    by_id = {s.id: s for s in data.submissions}
    assert by_id[sid].steps == ["x+1=2", "x=1"]
    assert by_id[sid].verification is not None  # stub verifier ran: all inconclusive
    assert by_id[image_sid].has_source_image is True
    assert len(by_id[image_sid].regions) == 1  # typeable placeholder from the OCR stub
    assert "source_image_path" not in r.text  # server file paths never leak


def test_export_excludes_other_users(client: TestClient) -> None:
    make_page(client)
    theirs = other_users_data(client)
    body = client.get(f"{API}/learners/me/export").text
    assert theirs["notebook"] not in body and theirs["submission"] not in body


# --- delete -------------------------------------------------------------------------------------------


def test_delete_requires_confirmation(client: TestClient) -> None:
    make_page(client)
    r = client.delete(f"{API}/learners/me/data")
    assert r.status_code == 400 and r.json()["error"]["code"] == "confirmation_required"
    assert len(client.get(f"{API}/notebooks").json()) == 1


def test_delete_removes_my_data_and_uploads_but_keeps_others_and_content(client: TestClient, settings) -> None:  # type: ignore[no-untyped-def]
    make_page(client)
    submit(client, ["x+1=2", "x=1"])
    upload_image(client)
    theirs = other_users_data(client)
    assert len(list(Path(settings.upload_dir).iterdir())) == 1

    r = client.delete(f"{API}/learners/me/data", params={"confirm": "true"})
    assert r.status_code == 200, r.text
    deleted = r.json()["deleted"]
    assert deleted["notebooks"] == 1 and deleted["pages"] == 1 and deleted["strokes"] == 1
    assert deleted["submissions"] == 2 and deleted["upload_files"] == 1

    assert client.get(f"{API}/notebooks").json() == []
    export = client.get(f"{API}/learners/me/export").json()
    assert export["notebooks"] == [] and export["submissions"] == []
    assert list(Path(settings.upload_dir).iterdir()) == []
    assert len(client.get(f"{API}/concepts").json()) == 2  # shared content stays

    with Session(client.app.state.engine) as s:  # type: ignore[attr-defined]
        assert s.get(NotebookRow, theirs["notebook"]) is not None
        assert s.get(SubmissionRow, theirs["submission"]) is not None

    # Idempotent: a second call deletes nothing and still succeeds.
    again = client.delete(f"{API}/learners/me/data", params={"confirm": "true"}).json()["deleted"]
    assert sum(again.values()) == 0


def test_delete_refused_while_a_job_is_running(client: TestClient) -> None:
    sid = submit(client, ["x+1=2", "x=1"])
    with Session(client.app.state.engine) as s:  # type: ignore[attr-defined]
        row = s.get(SubmissionRow, sid)
        assert row is not None
        row.status = "verifying"
        s.add(row)
        s.commit()
    r = client.delete(f"{API}/learners/me/data", params={"confirm": "true"})
    assert r.status_code == 409 and r.json()["error"]["details"]["submission_ids"] == [sid]


def test_upload_removal_refuses_paths_outside_upload_dir(tmp_path: Path) -> None:
    upload_dir = tmp_path / "uploads"
    upload_dir.mkdir()
    outside = tmp_path / "important.txt"
    outside.write_text("keep me")
    (upload_dir / "sub1").mkdir()
    inside = upload_dir / "sub1" / "a.png"
    inside.write_bytes(b"x")

    assert privacy_repo._remove_upload(str(outside), upload_dir) is False
    assert outside.exists()
    assert privacy_repo._remove_upload(str(upload_dir / ".." / "important.txt"), upload_dir) is False
    assert outside.exists()
    assert privacy_repo._remove_upload(str(inside), upload_dir) is True
    assert not inside.exists() and not inside.parent.exists()  # empty per-submission folder removed too
    assert upload_dir.exists()


# --- ownership: someone else's ids look exactly like missing ones ---------------------------------------


def test_other_users_objects_return_404_everywhere(client: TestClient) -> None:
    theirs = other_users_data(client)
    nb, sub = theirs["notebook"], theirs["submission"]
    page_body = {"order": 0, "version": 0}

    responses = {
        "list pages": client.get(f"{API}/notebooks/{nb}/pages"),
        "upsert page": client.put(f"{API}/notebooks/{nb}/pages/new-page", json=page_body),
        "status": client.get(f"{API}/submissions/{sub}/status"),
        "get review": client.get(f"{API}/submissions/{sub}/review"),
        "re-review": client.post(f"{API}/submissions/{sub}/review"),
        "confirm": client.post(
            f"{API}/submissions/{sub}/confirm", json={"regions": [{"id": "r1", "corrected_latex": "x=1"}]}
        ),
    }
    for name, r in responses.items():
        assert r.status_code == 404, f"{name}: {r.status_code} {r.text}"
        assert r.json()["error"]["code"] == "not_found", name

    assert theirs["notebook"] not in client.get(f"{API}/notebooks").text


def test_page_id_owned_by_another_notebook_is_404(client: TestClient) -> None:
    other_users_data(client)  # owns page "their-page"
    mine = client.post(f"{API}/notebooks", json={"title": "Mine"}).json()["id"]
    r = client.put(f"{API}/notebooks/{mine}/pages/their-page", json={"order": 0, "version": 0})
    assert r.status_code == 404
