"""Minimal Ollama client (T5.2): local ``/api/chat`` in JSON mode, with timeouts and a cached health check.

Only localhost-style URLs from settings are used; there is no paid or remote API here.
"""

import threading
import time
from typing import Any

import httpx

from app.services.jobs.stages import ReviewUnavailable

HEALTH_TTL_S = 10.0
HEALTH_TIMEOUT_S = 2.0
TEMPERATURE = 0.2


class OllamaClient:
    def __init__(
        self,
        url: str,
        model: str,
        timeout: float = 60.0,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.url = url.rstrip("/")
        self.model = model
        self.timeout = timeout
        self._http = httpx.Client(transport=transport)
        self._health: tuple[float, bool] | None = None
        self._lock = threading.Lock()

    def health(self) -> bool:
        """True if Ollama answers and has the model. Cached for 10 s so a dead server costs one probe."""
        now = time.monotonic()
        with self._lock:
            if self._health and now - self._health[0] < HEALTH_TTL_S:
                return self._health[1]
        try:
            r = self._http.get(f"{self.url}/api/tags", timeout=HEALTH_TIMEOUT_S)
            models = [m.get("name") for m in r.json().get("models", [])] if r.status_code == 200 else []
            ok = self.model in models or f"{self.model}:latest" in models
        except (httpx.HTTPError, ValueError):
            ok = False
        with self._lock:
            self._health = (now, ok)
        return ok

    def chat(self, messages: list[dict[str, str]]) -> str:
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "stream": False,
            "format": "json",
            "options": {"temperature": TEMPERATURE},
        }
        try:
            r = self._http.post(f"{self.url}/api/chat", json=payload, timeout=self.timeout)
            r.raise_for_status()
            content = r.json()["message"]["content"]
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            with self._lock:
                self._health = None
            raise ReviewUnavailable(f"Ollama request failed ({type(exc).__name__})") from exc
        if not isinstance(content, str):
            raise ReviewUnavailable("Ollama returned no text", invalid_output=True)
        return content
