"""pix2tex model holder (T4.1): a lazy, thread-safe singleton.

pix2tex + torch are optional heavy dependencies (``requirements-ml.txt``). Without them, or if the weights
fail to load, every call raises ``RecognitionUnavailable`` and the pipeline offers manual typing instead.
"""

import contextlib
import importlib.metadata
import importlib.util
import logging
import threading
from typing import Protocol

from PIL import Image

from app.services.jobs.stages import RecognitionUnavailable

log = logging.getLogger(__name__)


class OcrModel(Protocol):
    def __call__(self, img: Image.Image) -> str: ...


_model: OcrModel | None = None
_load_error: str | None = None
_load_lock = threading.Lock()
_call_lock = threading.Lock()  # pix2tex is not documented as thread-safe


def is_installed() -> bool:
    return importlib.util.find_spec("pix2tex") is not None


def is_loaded() -> bool:
    return _model is not None


def recognizer_version() -> str:
    try:
        return f"pix2tex-{importlib.metadata.version('pix2tex')}"
    except importlib.metadata.PackageNotFoundError:
        return "pix2tex-unknown"


def _load() -> OcrModel:
    from pix2tex.cli import LatexOCR  # heavy import: torch + weights download on first run

    model: OcrModel = LatexOCR()
    return model


def get_model() -> OcrModel:
    global _model, _load_error
    if _model is not None:
        return _model
    if not is_installed():
        raise RecognitionUnavailable("Handwriting recognition (pix2tex) is not installed on this server")
    with _load_lock:
        if _model is None:
            try:
                _model = _load()
                _load_error = None
                log.info("pix2tex loaded (%s)", recognizer_version())
            except Exception as exc:
                _load_error = f"{type(exc).__name__}: {exc}"
                log.exception("pix2tex failed to load")
                raise RecognitionUnavailable(f"Handwriting recognition failed to load ({type(exc).__name__})") from exc
    return _model


def run(model: OcrModel, img: Image.Image) -> str:
    with _call_lock:
        return model(img)


def preload_in_background() -> threading.Thread | None:
    """Warm the model at startup (PRELOAD_OCR=true) so the first learner doesn't wait for it."""
    if not is_installed():
        return None

    def _warm() -> None:
        with contextlib.suppress(RecognitionUnavailable):  # already logged; requests will report it
            get_model()

    t = threading.Thread(target=_warm, name="ocr-preload", daemon=True)
    t.start()
    return t
