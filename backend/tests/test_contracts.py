"""Contract tests (docs/05-testing-strategy.md #6).

1. shared/contracts is in sync with the FastAPI app (no drift).
2. Every example validates against its exported JSON Schema AND its Pydantic model.
3. Live API responses validate against the exported schemas.
"""

import json
import sys
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

from tests.conftest import API

pytestmark = pytest.mark.unit

BACKEND = Path(__file__).resolve().parents[1]
CONTRACTS = BACKEND.parent / "shared" / "contracts"
sys.path.insert(0, str(BACKEND / "scripts"))

import export_contracts  # noqa: E402


def _registry() -> Registry:
    resources = []
    for f in (CONTRACTS / "schemas").glob("*.json"):
        doc = json.loads(f.read_text(encoding="utf-8"))
        resources.append((doc["$id"], Resource.from_contents(doc)))
    return Registry().with_resources(resources)


REGISTRY = _registry()


def validator(name: str) -> Draft202012Validator:
    schema = json.loads((CONTRACTS / "schemas" / f"{name}.json").read_text(encoding="utf-8"))
    return Draft202012Validator(schema, registry=REGISTRY)


def assert_valid(name: str, data: Any) -> None:
    errors = sorted(validator(name).iter_errors(data), key=lambda e: list(e.path))
    assert not errors, f"{name}: " + "; ".join(f"{list(e.path)} {e.message}" for e in errors)


def test_exported_contract_is_up_to_date() -> None:
    for rel, content in export_contracts.build().items():
        path = CONTRACTS / rel
        assert path.exists(), f"missing {rel}; run python scripts/export_contracts.py"
        assert path.read_text(encoding="utf-8") == content, f"{rel} is stale; run python scripts/export_contracts.py"


EXAMPLES = sorted((CONTRACTS / "examples").glob("*.json"))


def test_examples_exist() -> None:
    assert len(EXAMPLES) >= 15


@pytest.mark.parametrize("path", EXAMPLES, ids=lambda p: p.stem)
def test_example_matches_schema_and_model(path: Path) -> None:
    import app.schemas.common as common
    import app.schemas.learning as learning
    import app.schemas.notebooks as notebooks
    import app.schemas.review as review
    import app.schemas.submissions as submissions
    import app.schemas.verification as verification

    name = path.name.split(".")[0]
    data = json.loads(path.read_text(encoding="utf-8"))
    assert_valid(name, data)
    model = next(
        getattr(m, name) for m in (common, learning, notebooks, review, submissions, verification) if hasattr(m, name)
    )
    model.model_validate(data)


@pytest.mark.parametrize(
    "bad",
    [
        {
            "status": "incorrect",
            "first_error_step": 2,
            "concept": "x",
            "explanation": "e",
            "hint": "h",
            "confidence": 1.5,
            "recommended_action": "targeted_practice",
        },
        {
            "status": "incorrect",
            "first_error_step": 2,
            "concept": "x",
            "explanation": "e",
            "hint": "h",
            "confidence": 0.5,
            "recommended_action": "run_shell",
        },
        {
            "status": "incorrect",
            "first_error_step": 2,
            "concept": "x",
            "explanation": "e",
            "hint": "h",
            "confidence": 0.5,
            "recommended_action": "continue",
            "execute": "rm -rf /",
        },
    ],
)
def test_review_schema_rejects_bad_llm_output(bad: dict[str, Any]) -> None:
    assert list(validator("ReviewResult").iter_errors(bad))


@pytest.mark.integration
def test_live_responses_match_schemas(client: TestClient) -> None:
    assert_valid("Health", client.get(f"{API}/health").json())
    nb = client.post(f"{API}/notebooks", json={"title": "Contract"}).json()
    assert_valid("Notebook", nb)
    page = client.put(f"{API}/notebooks/{nb['id']}/pages/p1", json={"order": 0, "version": 0}).json()
    assert_valid("Page", page)
    acc = client.post(f"{API}/submissions/typed", json={"steps": [{"latex": "x=1"}]}).json()
    assert_valid("SubmissionAccepted", acc)
    assert_valid("SubmissionStatusResponse", client.get(f"{API}/submissions/{acc['submission_id']}/status").json())
    assert_valid("ReviewResponse", client.get(f"{API}/submissions/{acc['submission_id']}/review").json())
    for c in client.get(f"{API}/concepts").json():
        assert_valid("Concept", c)
    assert_valid("Mastery", client.get(f"{API}/learners/me/mastery").json())
    assert_valid("NextAction", client.get(f"{API}/learners/me/next").json())
    err = client.get(f"{API}/submissions/nope/status").json()
    assert_valid("ErrorResponse", err)
