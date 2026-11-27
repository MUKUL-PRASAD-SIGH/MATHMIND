# MathMind backend

FastAPI + SQLModel (SQLite) + an in-process job runner. Owned by **M1**; M3's services plug in via
`app/services/jobs/stages.py`.

## Run

```bash
cd backend
py -3.11 -m venv .venv            # macOS/Linux: python3.11 -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
# open http://localhost:8000/docs
```

On startup the app creates `data/mathmind.db`, creates the local learner, seeds `../datasets/` (if present) and
marks any submission interrupted by a restart as `failed` (retry with `POST /review`).

## Check (same as CI)

```bash
ruff check . && ruff format --check .
mypy app
python scripts/export_contracts.py --check
pytest -m "not ml and not llm" --cov=app
bandit -q -r app
```

## Change the API

1. Edit the Pydantic model in `app/schemas/` (or the router).
2. `python scripts/export_contracts.py` → updates `../shared/contracts/`.
3. If mock payloads changed: `python scripts/make_examples.py`.
4. Commit the contract diff with your PR (CI fails otherwise).

## Layout

| Path | What |
|---|---|
| `app/main.py` | App factory, lifespan (DB init, seed, recovery), routers |
| `app/core/` | Settings, DB engine (WAL + FK pragmas), uniform errors, upload validation |
| `app/models/` | SQLModel tables (spec §11.1) |
| `app/schemas/` | **Contract** — request/response models |
| `app/repositories/` | DB access, owner-scoped |
| `app/api/v1/` | `health`, `notebooks`, `submissions`, `learners` routers |
| `app/services/jobs/` | `state_machine.py`, `stages.py` (seam for M3), `runner.py` (pipeline) |
| `app/services/{verification,recognition,reasoning,adaptation}/` | M3's modules (empty until Phase 3–6) |
| `scripts/` | `export_contracts.py`, `make_examples.py` |
| `tests/` | unit + integration + contract tests |
