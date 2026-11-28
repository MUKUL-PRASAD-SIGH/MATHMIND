"""Image pipeline, OCR confirmation and upload security (spec 8.3, 13.2)."""

import functools
import io
import json
from collections.abc import Callable
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.schemas.common import BBox
from app.services.jobs import stages
from app.services.recognition import recognize_region
from app.services.verification import verify_steps
from tests.conftest import API, png_bytes
from tests.recognition.test_recognition import LINES, render
from tests.recognition.test_recognition import to_png as png_bytes_of

pytestmark = pytest.mark.integration


def upload(client: TestClient, data: bytes, name: str = "crop.png", **form: str) -> object:
    return client.post(f"{API}/submissions/image", files={"file": (name, data, "image/png")}, data=form)


def lines(*items: tuple[str, float]) -> stages.RecognizeFn:
    def _recognize(png: bytes, region_bbox: BBox) -> list[stages.RecognizedLine]:
        n = len(items)
        return [
            stages.RecognizedLine(i, BBox(x=0, y=i / n, w=1, h=1 / n), latex, conf, "fake-ocr")
            for i, (latex, conf) in enumerate(items)
        ]

    return _recognize


def status(client: TestClient, sid: str) -> str:
    return str(client.get(f"{API}/submissions/{sid}/status").json()["status"])


def regions_of(client: TestClient, sid: str) -> list[dict[str, object]]:
    from sqlmodel import Session

    from app.repositories.submissions import list_regions

    with Session(client.app.state.engine) as s:  # type: ignore[attr-defined]
        return [r.model_dump() for r in list_regions(s, sid)]


# ---- security -----------------------------------------------------------------------------


def test_rejects_non_image_disguised_as_png(client: TestClient) -> None:
    r = upload(client, b"MZ\x90\x00" + b"\x00" * 200, name="evil.png")
    assert r.status_code == 415  # type: ignore[attr-defined]


def test_rejects_oversized_file(make_client) -> None:  # type: ignore[no-untyped-def]
    c = make_client(max_upload_mb=0.001)
    r = upload(c, png_bytes((400, 400), "black") + b"\x00" * 2000)
    assert r.status_code == 413


def test_rejects_huge_dimensions(make_client) -> None:  # type: ignore[no-untyped-def]
    c = make_client(max_image_pixels_side=100)
    r = upload(c, png_bytes((300, 50)))
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "image_too_large"


def test_rejects_bad_bbox_json(client: TestClient) -> None:
    r = upload(client, png_bytes(), bbox="{not json")
    assert r.status_code == 422  # type: ignore[attr-defined]


def test_stored_file_ignores_client_filename_and_strips_exif(client: TestClient, settings) -> None:  # type: ignore[no-untyped-def]
    img = Image.new("RGB", (40, 20), "white")
    exif = Image.Exif()
    exif[0x010E] = "secret description"
    buf = io.BytesIO()
    img.save(buf, format="JPEG", exif=exif.tobytes())
    r = upload(client, buf.getvalue(), name="../../etc/passwd.jpg")
    assert r.status_code == 202  # type: ignore[attr-defined]
    sid = r.json()["submission_id"]  # type: ignore[attr-defined]
    stored = list((Path(settings.upload_dir) / sid).iterdir())
    assert len(stored) == 1
    assert stored[0].name.startswith("source-") and stored[0].suffix == ".png"
    assert b"secret description" not in stored[0].read_bytes()


# ---- pipeline -----------------------------------------------------------------------------


def test_ocr_unavailable_gives_typeable_placeholder(client: TestClient) -> None:
    sid = upload(client, png_bytes(), bbox=json.dumps({"x": 0.1, "y": 0.2, "w": 0.5, "h": 0.3})).json()["submission_id"]  # type: ignore[attr-defined]
    assert status(client, sid) == "failed_recognition"
    regs = regions_of(client, sid)
    assert len(regs) == 1 and regs[0]["latex"] == ""
    assert regs[0]["bbox"] == {"x": 0.1, "y": 0.2, "w": 0.5, "h": 0.3}

    # confirming without text is refused; with text, verification runs
    r = client.post(f"{API}/submissions/{sid}/confirm", json={"regions": [{"id": regs[0]["id"]}]})
    assert r.status_code == 422 and r.json()["error"]["code"] == "region_needs_text"
    r = client.post(
        f"{API}/submissions/{sid}/confirm", json={"regions": [{"id": regs[0]["id"], "corrected_latex": "x=5"}]}
    )
    assert r.status_code == 202
    body = client.get(f"{API}/submissions/{sid}/review").json()
    assert body["status"] == "completed_without_ai"
    assert body["step_to_region"] == {"1": regs[0]["id"]}


def test_confident_recognition_goes_straight_to_verification(client: TestClient) -> None:
    stages.register_stage("recognize", lines(("3x+5=20", 0.95), ("x=5", 0.9)))
    sid = upload(client, png_bytes(), bbox=json.dumps({"x": 0.5, "y": 0.5, "w": 0.4, "h": 0.2})).json()["submission_id"]  # type: ignore[attr-defined]
    body = client.get(f"{API}/submissions/{sid}/review").json()
    assert body["status"] == "completed_without_ai"
    assert [s["latex"] for s in body["verification"]["steps"]] == ["3x+5=20", "x=5"]
    # crop-relative line boxes are converted to page coordinates
    second = body["regions"][1]["bbox"]
    assert second == pytest.approx({"x": 0.5, "y": 0.6, "w": 0.4, "h": 0.1})


def test_low_confidence_waits_for_learner_and_never_judges_first(client: TestClient) -> None:
    calls: list[list[str]] = []

    def spy_verify(steps: list[str], problem: object) -> object:
        calls.append(steps)
        return stages.stub_verify(steps, None)

    stages.register_stage("verify", spy_verify)
    stages.register_stage("recognize", lines(("3x+5=20", 0.95), ("x=S", 0.4)))
    sid = upload(client, png_bytes()).json()["submission_id"]  # type: ignore[attr-defined]
    assert status(client, sid) == "awaiting_confirmation"
    assert calls == []  # spec 8.3: no maths verdict before confirmation
    assert client.get(f"{API}/submissions/{sid}/review").status_code == 404

    regs = regions_of(client, sid)
    r = client.post(
        f"{API}/submissions/{sid}/confirm",
        json={
            "regions": [
                {"id": regs[0]["id"]},
                {"id": regs[1]["id"], "corrected_latex": "x=5"},
            ]
        },
    )
    assert r.status_code == 202
    assert calls == [["3x+5=20", "x=5"]]
    # original OCR text is preserved for evaluation
    regs = regions_of(client, sid)
    assert regs[1]["latex"] == "x=S" and regs[1]["corrected_latex"] == "x=5"


def test_confirm_can_drop_a_line(client: TestClient) -> None:
    stages.register_stage("recognize", lines(("3x=15", 0.4), ("scribble", 0.2)))
    sid = upload(client, png_bytes()).json()["submission_id"]  # type: ignore[attr-defined]
    regs = regions_of(client, sid)
    client.post(
        f"{API}/submissions/{sid}/confirm",
        json={"regions": [{"id": regs[0]["id"]}, {"id": regs[1]["id"], "confirmed": False}]},
    )
    steps = client.get(f"{API}/submissions/{sid}/review").json()["verification"]["steps"]
    assert [s["latex"] for s in steps] == ["3x=15"]


def test_confirm_rejects_foreign_regions_and_wrong_state(client: TestClient) -> None:
    stages.register_stage("recognize", lines(("x=1", 0.3)))
    sid = upload(client, png_bytes()).json()["submission_id"]  # type: ignore[attr-defined]
    r = client.post(f"{API}/submissions/{sid}/confirm", json={"regions": [{"id": "someone-elses"}]})
    assert r.status_code == 422 and r.json()["error"]["code"] == "unknown_region"

    typed = client.post(f"{API}/submissions/typed", json={"steps": [{"latex": "x=1"}]}).json()["submission_id"]
    r = client.post(f"{API}/submissions/{typed}/confirm", json={"regions": [{"id": "x"}]})
    assert r.status_code == 409


# ---- T4.2 with M3's real recognize stage (pix2tex replaced by a fake model) ----------------------------


def real_recognizer(outputs: Callable[[int], str]) -> stages.RecognizeFn:
    """recognize_region with a fake OCR model; outputs(n) is the reply to the n-th model call (3 per line)."""
    calls = iter(range(10_000))
    return functools.partial(recognize_region, model=lambda img: outputs(next(calls)))


def test_real_recognizer_confident_lines_are_verified_straight_away(client: TestClient) -> None:
    stages.register_stage("verify", verify_steps)
    stages.register_stage("recognize", real_recognizer(lambda n: ["3x+5=20", "3x=15", "x=5"][n // 3]))
    sid = upload(client, png_bytes_of(render(LINES)), problem_id="lin-001").json()["submission_id"]  # type: ignore[attr-defined]
    body = client.get(f"{API}/submissions/{sid}/review").json()
    assert body["verification"]["overall"] == "correct"
    assert len(body["regions"]) == 3 and all(r["confidence"] >= 0.75 for r in body["regions"])
    assert body["step_to_region"] == {str(i + 1): r["id"] for i, r in enumerate(body["regions"])}


def test_real_recognizer_low_confidence_never_reaches_a_verdict(client: TestClient) -> None:
    """The misread middle line would be 'incorrect' (3x=16) — it must be confirmed first, never judged."""
    verified: list[list[str]] = []
    seen: list[stages.ReviewInput] = []

    def spy_verify(steps: list[str], problem: stages.ProblemContext | None) -> object:
        verified.append(steps)
        return verify_steps(steps, problem)

    def spy_reason(data: stages.ReviewInput) -> object:
        seen.append(data)
        raise stages.ReviewUnavailable()

    unstable = {3: "3x=16", 4: "3x=15", 5: "8x=16"}  # line 2 reads differently on every augmentation
    stages.register_stage("verify", spy_verify)
    stages.register_stage("reason", spy_reason)
    stages.register_stage("recognize", real_recognizer(lambda n: unstable.get(n, ["3x+5=20", "", "x=5"][n // 3])))
    sid = upload(client, png_bytes_of(render(LINES)), problem_id="lin-001").json()["submission_id"]  # type: ignore[attr-defined]
    assert status(client, sid) == "awaiting_confirmation"
    assert verified == []
    assert client.get(f"{API}/submissions/{sid}/review").status_code == 404

    regs = regions_of(client, sid)
    assert regs[1]["latex"] == "3x=16" and float(regs[1]["confidence"]) < 0.75  # type: ignore[arg-type]
    r = client.post(
        f"{API}/submissions/{sid}/confirm",
        json={"regions": [{"id": regs[1]["id"], "corrected_latex": "3x=15"}]},
    )
    assert r.status_code == 202
    body = client.get(f"{API}/submissions/{sid}/review").json()
    assert body["verification"]["overall"] == "correct"
    assert regions_of(client, sid)[1]["latex"] == "3x=16"  # original OCR output kept
    assert seen[-1].ocr_corrections == {2: "3x=15"}


def test_ocr_crash_keeps_the_image_and_allows_typing(client: TestClient, settings) -> None:  # type: ignore[no-untyped-def]
    def crash(n: int) -> str:
        raise RuntimeError("model exploded")

    stages.register_stage("verify", verify_steps)
    stages.register_stage("recognize", real_recognizer(crash))
    sid = upload(client, png_bytes_of(render(LINES))).json()["submission_id"]  # type: ignore[attr-defined]
    assert status(client, sid) == "failed_recognition"
    assert len(list((Path(settings.upload_dir) / sid).glob("source-*.png"))) == 1
    [reg] = regions_of(client, sid)
    r = client.post(f"{API}/submissions/{sid}/confirm", json={"regions": [{"id": reg["id"], "corrected_latex": "x=5"}]})
    assert r.status_code == 202
    assert client.get(f"{API}/submissions/{sid}/review").json()["verification"]["steps"][0]["latex"] == "x=5"
