import io
import json
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.core.config import Settings
from app.main import create_app
from app.services.jobs import stages

SAMPLE_CONCEPTS = [
    {
        "id": "integer_arithmetic",
        "name": "Integer arithmetic",
        "domain": "arithmetic",
        "description": "",
        "prerequisites": [],
    },
    {
        "id": "linear_equations",
        "name": "Linear equations",
        "domain": "algebra",
        "description": "ax+b=c",
        "prerequisites": ["integer_arithmetic"],
    },
]
SAMPLE_PROBLEMS = [
    {
        "id": "lin-001",
        "concept_id": "linear_equations",
        "prompt_latex": "3x+5=20",
        "expected_answer_latex": "x=5",
        "difficulty": 2,
    },
    {
        "id": "int-001",
        "concept_id": "integer_arithmetic",
        "prompt_latex": "7-12",
        "expected_answer_latex": "-5",
        "difficulty": 1,
    },
]


@pytest.fixture
def datasets_dir(tmp_path: Path) -> Path:
    root = tmp_path / "datasets"
    (root / "concepts").mkdir(parents=True)
    (root / "problems").mkdir()
    (root / "concepts" / "concepts.json").write_text(json.dumps(SAMPLE_CONCEPTS), encoding="utf-8")
    (root / "problems" / "mixed.json").write_text(json.dumps(SAMPLE_PROBLEMS), encoding="utf-8")
    return root


@pytest.fixture
def settings(tmp_path: Path, datasets_dir: Path) -> Settings:
    return Settings(
        database_url="sqlite://",
        upload_dir=tmp_path / "uploads",
        datasets_dir=datasets_dir,
        seed_on_startup=True,
        ollama_url="http://127.0.0.1:1",  # guaranteed dead port: tests never touch a real model
        timeout_ocr=1,
        timeout_verify=1,
        timeout_llm=1,
    )


@pytest.fixture(autouse=True)
def _reset_stages() -> Iterator[None]:
    stages.reset_stages()
    yield
    stages.reset_stages()


@pytest.fixture
def make_client(settings: Settings) -> Iterator[Callable[..., TestClient]]:
    clients: list[TestClient] = []

    def _make(synchronous: bool = True, **overrides: Any) -> TestClient:
        s = settings.model_copy(update=overrides)
        client = TestClient(create_app(s, synchronous_jobs=synchronous))
        client.__enter__()
        clients.append(client)
        return client

    yield _make
    for c in clients:
        c.__exit__(None, None, None)


@pytest.fixture
def client(make_client: Callable[..., TestClient]) -> TestClient:
    return make_client()


def png_bytes(size: tuple[int, int] = (64, 32), color: str = "white") -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format="PNG")
    return buf.getvalue()


API = "/api/v1"
