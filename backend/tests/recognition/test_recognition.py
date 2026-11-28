"""T4.1: line segmentation, confidence proxy (OCR mocked) and the recognize stage."""

import io
from collections.abc import Callable

import pytest
from PIL import Image, ImageDraw, ImageFont

from app.core.config import Settings
from app.schemas.common import BBox
from app.services.jobs.stages import RecognitionUnavailable
from app.services.recognition import confidence, engine
from app.services.recognition.lines import segment_lines
from app.services.recognition.service import recognize_region

pytestmark = pytest.mark.unit
THRESHOLD = Settings().ocr_confidence_threshold
FULL = BBox(x=0, y=0, w=1, h=1)
LINES = ["3x + 5 = 20", "3x = 15", "x = 5"]


def render(lines: list[str], size: tuple[int, int] = (480, 360), font_px: int = 36) -> Image.Image:
    img = Image.new("RGB", size, "white")
    draw = ImageDraw.Draw(img)
    font = ImageFont.load_default(size=font_px)
    step = size[1] // (len(lines) + 1)
    for i, text in enumerate(lines, start=1):
        draw.text((30, i * step - font_px // 2), text, fill="black", font=font)
    return img


def to_png(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def fake_model(outputs: dict[int, str] | Callable[[Image.Image], str]) -> engine.OcrModel:
    """OCR stub keyed by the line's vertical position (lines are recognized top to bottom)."""
    calls: list[Image.Image] = []

    def _model(img: Image.Image) -> str:
        calls.append(img)
        if callable(outputs):
            return outputs(img)
        return outputs[(len(calls) - 1) // 3]  # 3 runs per line: original + 2 augmentations

    return _model


# ---- segmentation -------------------------------------------------------------------------------


def test_three_rendered_lines_give_three_ordered_bboxes() -> None:
    crops = segment_lines(render(LINES))
    assert len(crops) == 3
    ys = [c.y for c in crops]
    assert ys == sorted(ys)
    for c in crops:
        assert 0 <= c.x < 0.2 and 0 < c.w <= 1 and 0 < c.h < 0.34
        assert c.y + c.h <= 1


def test_bboxes_cover_the_ink() -> None:
    img = render(LINES)
    for crop in segment_lines(img):
        x0, y0 = round(crop.x * img.width), round(crop.y * img.height)
        assert crop.image.size == (round(crop.w * img.width), round(crop.h * img.height))
        assert img.crop((x0, y0, x0 + crop.image.width, y0 + crop.image.height)).tobytes() == crop.image.tobytes()


def test_exponent_and_fraction_bar_stay_on_one_line() -> None:
    img = Image.new("RGB", (300, 120), "white")
    d = ImageDraw.Draw(img)
    d.text((20, 40), "x", fill="black", font=ImageFont.load_default(size=36))
    d.text((45, 30), "2", fill="black", font=ImageFont.load_default(size=18))  # superscript overlaps the line
    assert len(segment_lines(img)) == 1


def test_blank_and_dark_background_images() -> None:
    assert segment_lines(Image.new("RGB", (200, 100), "white")) == []
    inverted = Image.eval(render(LINES), lambda p: 255 - p)
    assert len(segment_lines(inverted)) == 3


# ---- confidence (OCR mocked) ----------------------------------------------------------------------


def test_stable_parseable_line_is_confident() -> None:
    parts = confidence.score_line("3x+5=20", ["3x + 5 = 20", "3x+5=20"], 300, 60)
    assert parts == confidence.ConfidenceParts(1.0, 1.0, 1.0)
    assert parts.score >= THRESHOLD


def test_unstable_line_needs_confirmation() -> None:
    parts = confidence.score_line("3x+5=20", ["3x+5=26", "8x+5=20"], 300, 60)
    assert parts.stability == pytest.approx(1 / 3)
    assert parts.score < THRESHOLD


def test_unparseable_line_always_needs_confirmation() -> None:
    parts = confidence.score_line("3x+5=", ["3x+5=", "3x+5="], 300, 60)
    assert parts.parse_ok == 0.0
    assert parts.score < THRESHOLD


@pytest.mark.parametrize(
    ("latex", "w", "h"),
    [
        ("\\frac{1}{2", 300, 60),  # unbalanced braces
        ("1111111111", 300, 60),  # repeated tokens
        ("x+x+x+x+x+x+x+x+x+x+x+x+x+x+x+x+x+x", 40, 40),  # far too long for a tiny crop
    ],
)
def test_sanity_penalties(latex: str, w: int, h: int) -> None:
    assert confidence.sanity(latex, w, h) < 1.0


def test_empty_output_scores_zero() -> None:
    assert confidence.score_line("", ["", ""], 100, 40).score == 0.0


# ---- the recognize stage ----------------------------------------------------------------------------


def test_recognize_region_returns_lines_with_crop_relative_bboxes() -> None:
    model = fake_model({0: "3x+5=20", 1: "3x=15", 2: "x=5"})
    out = recognize_region(to_png(render(LINES)), FULL, model=model)
    assert [ln.latex for ln in out] == ["3x+5=20", "3x=15", "x=5"]
    assert [ln.line_index for ln in out] == [0, 1, 2]
    assert all(ln.confidence >= THRESHOLD for ln in out)
    assert all(0 <= ln.bbox.y <= 1 and ln.bbox.h > 0 for ln in out)
    assert out[0].bbox.y < out[1].bbox.y < out[2].bbox.y


def test_unstable_ocr_gives_low_confidence() -> None:
    outputs = iter(["3x+5=20", "3x+5=26", "8x+5=20"])
    out = recognize_region(to_png(render(["3x + 5 = 20"])), FULL, model=fake_model(lambda img: next(outputs)))
    assert out[0].confidence < THRESHOLD


def test_blank_region_returns_no_lines() -> None:
    assert recognize_region(to_png(Image.new("RGB", (100, 50), "white")), FULL, model=fake_model({})) == []


def test_model_crash_becomes_recognition_unavailable() -> None:
    def boom(img: Image.Image) -> str:
        raise RuntimeError("CUDA? on a laptop?")

    with pytest.raises(RecognitionUnavailable):
        recognize_region(to_png(render(LINES)), FULL, model=boom)


def test_garbage_bytes_become_recognition_unavailable() -> None:
    with pytest.raises(RecognitionUnavailable):
        recognize_region(b"not an image", FULL, model=fake_model({}))


def test_missing_pix2tex_is_reported_not_crashed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(engine, "_model", None)
    monkeypatch.setattr(engine, "is_installed", lambda: False)
    with pytest.raises(RecognitionUnavailable, match="not installed"):
        recognize_region(to_png(render(LINES)), FULL)
    assert engine.preload_in_background() is None


def test_model_load_failure_is_reported(monkeypatch: pytest.MonkeyPatch) -> None:
    def broken_load() -> engine.OcrModel:
        raise OSError("weights download failed")

    monkeypatch.setattr(engine, "_model", None)
    monkeypatch.setattr(engine, "is_installed", lambda: True)
    monkeypatch.setattr(engine, "_load", broken_load)
    with pytest.raises(RecognitionUnavailable, match="failed to load"):
        engine.get_model()
    assert not engine.is_loaded()
