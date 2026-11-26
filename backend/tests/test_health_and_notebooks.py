import pytest
from fastapi.testclient import TestClient

from tests.conftest import API

pytestmark = pytest.mark.integration


def stroke(page_id: str, sid: str = "s1", deleted: bool = False) -> dict[str, object]:
    return {
        "id": sid,
        "page_id": page_id,
        "points": [[0.1, 0.1], [0.2, 0.25]],
        "pressure": [0.5, 0.6],
        "tool": "pen",
        "color": "#112233",
        "width": 2,
        "bbox": {"x": 0.1, "y": 0.1, "w": 0.1, "h": 0.15},
        "deleted": deleted,
    }


def test_health_reports_ollama_down_without_failing(client: TestClient) -> None:
    body = client.get(f"{API}/health").json()
    assert body["status"] == "ok"
    assert body["ollama"] == "down"
    assert body["pix2tex"] in {"not_installed", "not_loaded"}


def test_create_and_list_notebooks(client: TestClient) -> None:
    r = client.post(f"{API}/notebooks", json={"title": "Algebra", "domain": "algebra"})
    assert r.status_code == 201
    nb = r.json()
    assert nb["title"] == "Algebra"
    assert [n["id"] for n in client.get(f"{API}/notebooks").json()] == [nb["id"]]


def test_notebook_rejects_unknown_fields_and_empty_title(client: TestClient) -> None:
    assert client.post(f"{API}/notebooks", json={"title": ""}).status_code == 422
    r = client.post(f"{API}/notebooks", json={"title": "x", "owner_id": "hacker"})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "validation_error"


def test_page_upsert_versions_and_strokes(client: TestClient) -> None:
    nb = client.post(f"{API}/notebooks", json={"title": "N"}).json()
    url = f"{API}/notebooks/{nb['id']}/pages/p1"

    r = client.put(url, json={"order": 0, "version": 0, "background": "squared", "strokes": [stroke("p1")]})
    assert r.status_code == 200, r.text
    assert r.json()["version"] == 1
    assert r.json()["stroke_count"] == 1

    # stale version -> 409 with the expected version in details
    r = client.put(url, json={"order": 0, "version": 0})
    assert r.status_code == 409
    assert r.json()["error"]["details"]["expected_version"] == 1

    # soft-delete the stroke (undo-friendly), bump version
    r = client.put(
        url, json={"order": 0, "version": 1, "background": "squared", "strokes": [stroke("p1", deleted=True)]}
    )
    assert r.json()["version"] == 2
    assert r.json()["stroke_count"] == 0

    pages = client.get(f"{API}/notebooks/{nb['id']}/pages").json()
    assert [p["id"] for p in pages] == ["p1"]
    assert pages[0]["background"] == "squared"


def test_stroke_for_other_page_rejected(client: TestClient) -> None:
    nb = client.post(f"{API}/notebooks", json={"title": "N"}).json()
    r = client.put(f"{API}/notebooks/{nb['id']}/pages/p1", json={"order": 0, "version": 0, "strokes": [stroke("p2")]})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "stroke_page_mismatch"


def test_stroke_coordinates_must_be_normalized(client: TestClient) -> None:
    nb = client.post(f"{API}/notebooks", json={"title": "N"}).json()
    bad = stroke("p1")
    bad["bbox"] = {"x": 2, "y": 0, "w": 0.1, "h": 0.1}
    r = client.put(f"{API}/notebooks/{nb['id']}/pages/p1", json={"order": 0, "version": 0, "strokes": [bad]})
    assert r.status_code == 422


def test_unknown_notebook_is_404(client: TestClient) -> None:
    r = client.put(f"{API}/notebooks/nope/pages/p1", json={"order": 0, "version": 0})
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "not_found"


def test_path_ids_are_restricted(client: TestClient) -> None:
    assert client.get(f"{API}/notebooks/..%2F..%2Fetc/pages").status_code in {404, 422}


def test_405_lists_every_method_on_the_path(client: TestClient) -> None:
    # GET and POST /notebooks are separate routes; Starlette alone would answer `Allow: POST` or `Allow: GET`.
    r = client.delete(f"{API}/notebooks")
    assert r.status_code == 405
    assert r.headers["allow"] == "GET, POST"
    assert r.json()["error"]["code"] == "http_error"


def test_unparseable_body_is_a_documented_400(client: TestClient) -> None:
    not_utf8 = b"\x80"
    r = client.post(f"{API}/notebooks", content=not_utf8, headers={"content-type": "application/json"})
    assert r.status_code == 400
    assert "400" in client.get("/openapi.json").json()["paths"]["/api/v1/notebooks"]["post"]["responses"]
