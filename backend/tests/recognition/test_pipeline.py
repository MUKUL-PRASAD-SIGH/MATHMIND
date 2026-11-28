"""T4.1 inside the image pipeline: low OCR confidence never reaches a verdict."""

from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.schemas.common import BBox
from app.services.jobs import stages
from app.services.recognition.service import recognize_region
from app.services.verification import verify_steps
from tests.conftest import API
from tests.recognition.test_recognition import fake_model, render, to_png

pytestmark = pytest.mark.integration


@pytest.fixture
def client(make_client: Callable[..., TestClient]) -> TestClient:
    # conftest's 1 s OCR timeout is too tight for a cold SymPy import inside the confidence scorer.
    return make_client(timeout_ocr=20)


def _use_ocr(model: object) -> None:
    def _recognize(png: bytes, region_bbox: BBox) -> list[stages.RecognizedLine]:
        return recognize_region(png, region_bbox, model=model)  # type: ignore[arg-type]

    stages.register_stage("recognize", _recognize)
    stages.register_stage("verify", verify_steps)


def _submit(client: TestClient, img: Image.Image) -> str:
    r = client.post(f"{API}/submissions/image", files={"file": ("crop.png", to_png(img), "image/png")})
    assert r.status_code == 202, r.text
    return str(r.json()["submission_id"])


def test_unstable_ocr_of_wrong_looking_maths_asks_for_confirmation(client: TestClient) -> None:
    # Reads as an arithmetic slip (x=4) but the OCR is unstable: no verdict until the learner confirms.
    outputs = iter(["3x+5=20", "3x+5=20", "3x+5=20", "x=4", "x=9", "x=5"])
    _use_ocr(fake_model(lambda img: next(outputs)))
    sid = _submit(client, render(["3x + 5 = 20", "x = 5"]))
    assert client.get(f"{API}/submissions/{sid}/status").json()["status"] == "awaiting_confirmation"
    pending = client.get(f"{API}/submissions/{sid}/review").json()
    assert pending["verification"] is None and pending["review"] is None  # no verdict exists yet


def test_confident_ocr_goes_straight_to_verification(client: TestClient) -> None:
    _use_ocr(fake_model({0: "3x+5=20", 1: "3x=15", 2: "x=5"}))
    sid = _submit(client, render(["3x + 5 = 20", "3x = 15", "x = 5"]))
    body = client.get(f"{API}/submissions/{sid}/review").json()
    assert body["status"] == "completed_without_ai"
    verification = body["verification"]
    assert isinstance(verification, dict)
    assert [s["verdict"] for s in verification["steps"]] == ["supported"] * 3
