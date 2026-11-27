import time

import httpx
from fastapi import APIRouter

from app.api.deps import SettingsDep
from app.schemas.common import Health, OcrState, ServiceState
from app.services.recognition import engine

router = APIRouter(tags=["health"])

_cache: dict[str, tuple[float, ServiceState]] = {}


def ollama_state(url: str, ttl: float = 10.0) -> ServiceState:
    now = time.monotonic()
    hit = _cache.get(url)
    if hit and now - hit[0] < ttl:
        return hit[1]
    try:
        r = httpx.get(f"{url.rstrip('/')}/api/tags", timeout=1.0)
        state = ServiceState.up if r.status_code == 200 else ServiceState.down
    except httpx.HTTPError:
        state = ServiceState.down
    _cache[url] = (now, state)
    return state


@router.get("/health", response_model=Health)
def health(settings: SettingsDep) -> Health:
    if not engine.is_installed():
        ocr = OcrState.not_installed
    else:
        # "loaded" only once the weights are in memory (lazy load or PRELOAD_OCR=true), not merely installed.
        ocr = OcrState.loaded if engine.is_loaded() else OcrState.not_loaded
    return Health(
        version=settings.app_version,
        ollama=ollama_state(settings.ollama_url),
        ollama_model=settings.ollama_model,
        pix2tex=ocr,
    )
