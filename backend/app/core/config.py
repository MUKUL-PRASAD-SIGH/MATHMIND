"""Application settings, read from environment / .env (see .env.example)."""

import ipaddress
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_ROOT.parent


def is_local_host(url: str) -> bool:
    """True for loopback, private-network IPs and single-label names (e.g. the docker-compose `ollama` service)."""
    host = urlsplit(url).hostname or ""
    if host == "localhost" or (host and "." not in host and ":" not in host):
        return True
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return False
    return ip.is_loopback or ip.is_private


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(REPO_ROOT / ".env", BACKEND_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_version: str = "0.1.0"
    database_url: str = f"sqlite:///{(BACKEND_ROOT / 'data' / 'mathmind.db').as_posix()}"
    upload_dir: Path = BACKEND_ROOT / "data" / "uploads"
    datasets_dir: Path = REPO_ROOT / "datasets"
    seed_on_startup: bool = True

    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])

    max_upload_mb: float = 5
    max_image_pixels_side: int = 4096

    ocr_confidence_threshold: float = 0.75
    preload_ocr: bool = False

    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5:3b"
    # Learner work is sent to Ollama. Off-machine hosts are refused unless this is set on purpose.
    allow_remote_ollama: bool = False

    timeout_ocr: float = 20
    timeout_verify: float = 5
    timeout_llm: float = 60

    job_workers: int = 2

    @model_validator(mode="after")
    def _keep_ai_local(self) -> "Settings":
        if not self.allow_remote_ollama and not is_local_host(self.ollama_url):
            raise ValueError(
                f"OLLAMA_URL={self.ollama_url!r} is not a local host; learner work must stay on this machine. "
                "Use localhost / a LAN address, or set ALLOW_REMOTE_OLLAMA=true deliberately."
            )
        return self

    @property
    def max_upload_bytes(self) -> int:
        return int(self.max_upload_mb * 1024 * 1024)


@lru_cache
def get_settings() -> Settings:
    return Settings()
