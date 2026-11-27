"""``recognize`` stage (T4.1): region image -> recognized lines with a confidence proxy.

The original image is never modified; the runner stores these lines separately (``recognized_regions``).
The runner, not this module, decides what happens below ``OCR_CONFIDENCE_THRESHOLD``
(``awaiting_confirmation``), so low-confidence OCR can never produce an "incorrect" verdict on its own.
"""

import io

from PIL import Image, UnidentifiedImageError

from app.schemas.common import BBox
from app.services.jobs.stages import RecognitionUnavailable, RecognizedLine
from app.services.recognition import engine
from app.services.recognition.confidence import score_line
from app.services.recognition.lines import segment_lines


def augmentations(img: Image.Image) -> list[Image.Image]:
    """Light perturbations for the stability signal: +2 degree rotation and a 0.95 scale."""
    rotated = img.rotate(2, resample=Image.Resampling.BICUBIC, expand=True, fillcolor="white")
    w, h = img.size
    scaled = img.resize((max(1, round(w * 0.95)), max(1, round(h * 0.95))), Image.Resampling.LANCZOS)
    return [rotated, scaled]


def recognize_region(png: bytes, region_bbox: BBox, *, model: engine.OcrModel | None = None) -> list[RecognizedLine]:
    """Recognize each line of a cropped region. ``bbox`` of each line is relative to the crop (0..1)."""
    try:
        with Image.open(io.BytesIO(png)) as raw:
            img = raw.convert("RGB")
    except (UnidentifiedImageError, OSError) as exc:
        raise RecognitionUnavailable("The image could not be opened") from exc

    crops = segment_lines(img)
    if not crops:
        return []
    ocr = model or engine.get_model()
    version = engine.recognizer_version() if model is None else getattr(model, "version", "custom")

    out = []
    for i, crop in enumerate(crops):
        try:
            latex = engine.run(ocr, crop.image).strip()
            variants = [engine.run(ocr, aug).strip() for aug in augmentations(crop.image)]
        except RecognitionUnavailable:
            raise
        except Exception as exc:
            raise RecognitionUnavailable(f"Recognition failed on line {i + 1} ({type(exc).__name__})") from exc
        parts = score_line(latex, variants, *crop.image.size)
        out.append(
            RecognizedLine(
                line_index=i,
                bbox=BBox(x=crop.x, y=crop.y, w=crop.w, h=crop.h),
                latex=latex,
                confidence=parts.score,
                recognizer_version=version,
            )
        )
    return out
