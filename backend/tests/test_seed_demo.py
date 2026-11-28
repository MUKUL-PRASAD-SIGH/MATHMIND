"""T8.4 step 1: scripts/seed_demo.py resets a DB to a demo state the real API can serve."""

import importlib.util
from collections.abc import Callable
from pathlib import Path
from types import ModuleType

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.db import make_engine
from app.schemas.privacy import LearnerExport
from tests.conftest import API

pytestmark = pytest.mark.integration

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "seed_demo.py"


def load_script() -> ModuleType:
    spec = importlib.util.spec_from_file_location("seed_demo", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def demo_settings(settings: Settings, tmp_path: Path) -> Settings:
    return settings.model_copy(
        update={"database_url": f"sqlite:///{(tmp_path / 'demo.db').as_posix()}", "upload_dir": tmp_path / "uploads"}
    )


def test_reset_loads_a_demo_the_api_can_serve(demo_settings: Settings, make_client: Callable[..., TestClient]) -> None:
    demo = load_script()
    stale = demo_settings.upload_dir / "old-sub"
    stale.mkdir(parents=True)
    (stale / "x.png").write_bytes(b"old")

    engine = make_engine(demo_settings.database_url)
    try:
        demo.reset_demo(engine, demo_settings)
        demo.reset_demo(engine, demo_settings)  # running it twice gives the same state
    finally:
        engine.dispose()
    assert list(demo_settings.upload_dir.iterdir()) == []

    client = make_client(
        database_url=demo_settings.database_url, upload_dir=demo_settings.upload_dir, seed_on_startup=False
    )
    notebooks = client.get(f"{API}/notebooks").json()
    assert [n["title"] for n in notebooks] == ["Algebra practice"]
    pages = client.get(f"{API}/notebooks/demo-notebook/pages").json()
    assert [p["title"] for p in pages] == ["Integers", "Brackets"]

    mastery = {m["concept_id"]: m for m in client.get(f"{API}/learners/me/mastery").json()["items"]}
    assert mastery["linear_equations"]["mastery"] == 0.35
    assert len(client.get(f"{API}/learners/me/revision").json()["items"]) == 1
    assert any(p["prompt_latex"] == demo.DEMO_PROBLEM for p in client.get(f"{API}/problems").json())

    export = LearnerExport.model_validate(client.get(f"{API}/learners/me/export").json())
    by_problem = {s.problem_id: s for s in export.submissions}
    slip = by_problem["demo-lin-r2b"]
    assert slip.steps == demo.DEMO_STEPS_WITH_ERROR
    assert slip.verification is not None and slip.verification.first_error_step == 2
    assert slip.review is not None and slip.review.first_error_step == 2  # agrees with the verifier

    # The live demo flow still works on top of the seeded state.
    r = client.post(f"{API}/submissions/typed", json={"steps": [{"latex": x} for x in demo.DEMO_STEPS_CORRECTED]})
    assert r.status_code == 202


def test_without_reset_nothing_is_touched(demo_settings: Settings, monkeypatch: pytest.MonkeyPatch) -> None:
    demo = load_script()
    monkeypatch.setattr(demo, "get_settings", lambda: demo_settings)
    assert demo.main([]) == 1
    assert not Path(demo_settings.database_url.removeprefix("sqlite:///")).exists()
    assert demo.main(["--database-url", "sqlite://", "--reset"]) == 2  # in-memory refused


def test_refuses_to_empty_a_folder_not_named_uploads(tmp_path: Path) -> None:
    demo = load_script()
    precious = tmp_path / "Documents"
    precious.mkdir()
    (precious / "thesis.docx").write_bytes(b"keep")
    with pytest.raises(SystemExit, match="refusing"):
        demo._empty_upload_dir(precious)
    assert (precious / "thesis.docx").exists()
