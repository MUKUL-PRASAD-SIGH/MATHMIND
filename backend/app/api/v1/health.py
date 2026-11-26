import importlib.util
import time

import httpx
from fastapi import APIRouter

from app.api.deps import SettingsDep
from app.schemas.common import Health, OcrState, ServiceState
from app.services.jobs import stages

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
    if importlib.util.find_spec("pix2tex") is None:
        ocr = OcrState.not_installed
    else:
        ocr = OcrState.not_loaded if stages.is_stub("recognize") else OcrState.loaded
    return Health(
        version=settings.app_version,
        ollama=ollama_state(settings.ollama_url),
        ollama_model=settings.ollama_model,
        pix2tex=ocr,
    )
