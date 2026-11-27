"""T7.7 step 2: property-based fuzzing of every endpoint in the OpenAPI schema (schemathesis).

Generates valid and invalid requests from the exported contract and checks that the API never
returns a 5xx, that responses match the documented schema and status codes, and that invalid input
is rejected. Runs against an in-memory DB with all AI stages stubbed.
"""

import tempfile
from collections.abc import Iterator
from pathlib import Path

import pytest
import schemathesis
from fastapi.testclient import TestClient
from hypothesis import HealthCheck, settings

from app.core.config import Settings
from app.main import create_app

pytestmark = [pytest.mark.integration, pytest.mark.slow]

_tmp = Path(tempfile.mkdtemp(prefix="mathmind-fuzz-"))
_app = create_app(
    Settings(
        database_url="sqlite://",
        upload_dir=_tmp / "uploads",
        datasets_dir=_tmp / "no-datasets",
        seed_on_startup=False,
        ollama_url="http://127.0.0.1:1",
        timeout_ocr=1,
        timeout_verify=1,
        timeout_llm=1,
    ),
    synchronous_jobs=True,
)
schema = schemathesis.openapi.from_asgi("/openapi.json", _app)


@pytest.fixture(scope="module", autouse=True)
def _lifespan() -> Iterator[None]:
    """Start the app's lifespan (DB, runner) once; schemathesis then calls the same app object."""
    with TestClient(_app):
        yield


@schema.parametrize()
@settings(max_examples=30, deadline=None, suppress_health_check=list(HealthCheck))
def test_api_survives_fuzzing(case: schemathesis.Case) -> None:
    # positive_data_acceptance is excluded on purpose: some schema-valid inputs are refused by design
    # (DELETE /learners/me/data?confirm=false; JSON-in-form fields `bbox`/`stroke_ids` that OpenAPI can
    # only describe as strings). Every other check, including "no 5xx", stays on.
    case.call_and_validate(excluded_checks=[schemathesis.checks.positive_data_acceptance])
