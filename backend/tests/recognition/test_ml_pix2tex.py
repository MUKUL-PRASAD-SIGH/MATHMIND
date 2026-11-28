"""`-m ml`: real pix2tex on datasets/handwriting_samples. Records the exact-match rate; no pass threshold (T7.2)."""

import json
import time
from pathlib import Path

import pytest

from app.core.config import REPO_ROOT
from app.schemas.common import BBox
from app.services.recognition import engine
from app.services.recognition.confidence import canonical
from app.services.recognition.service import recognize_region

pytestmark = pytest.mark.ml
SAMPLES = REPO_ROOT / "datasets" / "handwriting_samples"
LABELS = REPO_ROOT / "datasets" / "labelled_solutions"


def _truth(sample_id: str) -> list[str] | None:
    for f in LABELS.glob(f"*/{sample_id}.json"):
        return list(json.loads(f.read_text(encoding="utf-8"))["learner_attempt"])
    return None


@pytest.mark.skipif(not engine.is_installed(), reason="pix2tex not installed (requirements-ml.txt)")
def test_pix2tex_exact_match_rate_on_handwriting_samples() -> None:
    images = sorted(SAMPLES.glob("*.png"))[:10]
    if not images:
        pytest.skip("no images in datasets/handwriting_samples yet (T7.1)")
    matched = total = 0
    timings: list[float] = []
    for path in images:
        truth = _truth(path.stem)
        start = time.perf_counter()
        lines = recognize_region(Path(path).read_bytes(), BBox(x=0, y=0, w=1, h=1))
        timings.append((time.perf_counter() - start) / max(1, len(lines)))
        if truth is None:
            continue
        for got, want in zip(lines, truth, strict=False):
            total += 1
            matched += canonical(got.latex) == canonical(want)
    rate = matched / total if total else float("nan")
    median = sorted(timings)[len(timings) // 2]
    print(f"\npix2tex exact-match {matched}/{total} = {rate:.2%}; median s/line {median:.2f}")
