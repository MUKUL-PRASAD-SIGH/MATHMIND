# Phase 0 — Setup & Contracts (Day 0 – Day 1 AM)

**Goal:** everyone can run an empty frontend and backend, the API contract exists so work can run in parallel against mocks, and the AI toolchain is confirmed working on the team's laptops.

---

## T0.1 — Monorepo scaffold & conventions

| Owner | Est | Prerequisites | Can run in parallel with | Unblocks |
|---|---|---|---|---|
| M1 | 2 h | — | T0.5 | T0.2, T0.3, T0.6 |

**External requirements:** GitHub repository with write access for all 4 members. Git installed.

**Steps**
1. Create the folder skeleton.
   1. Create `frontend/`, `backend/app/`, `ai/{prompts,evaluation,benchmarks}/`, `datasets/{concepts,problems,labelled_solutions,handwriting_samples}/`, `shared/contracts/schemas/`, `docs/` (exists).
   2. Add a `.gitkeep` to each empty folder.
2. Add root config files.
   1. `.gitignore`: Node (`node_modules`, `dist`), Python (`.venv`, `__pycache__`, `*.db`), OS files, `.env`, model caches, `test-results/`, `playwright-report/`.
   2. `.editorconfig`: 2-space indent for TS/JSON/MD, 4-space for Python, LF line endings.
   3. `.gitattributes`: `* text=auto eol=lf` (important on Windows).
   4. `.env.example` with `API_PORT=8000`, `OLLAMA_URL=http://localhost:11434`, `OLLAMA_MODEL=qwen2.5:3b`, `OCR_CONFIDENCE_THRESHOLD=0.75`, `DATABASE_URL=sqlite:///./mathmind.db`, `MAX_UPLOAD_MB=5`.
3. Set up repository rules.
   1. Protect `main`: require a PR, 1 approval, and passing CI (enable CI after T0.7).
   2. Create a PR template `.github/pull_request_template.md` (Task ID, summary, tests run, screenshots, AI-assisted? Y/N).
   3. Create issue labels: `M1`, `M2`, `M3`, `M4`, `blocked`, `P0`, `P1`, `bug`, `test`.
4. Choose the package manager (npm recommended for simplicity) and record it in `docs/07-conventions.md`.
5. Commit and push. Announce in the team channel.

**Tests:** fresh clone on a second machine works; `git status` is clean after the build steps.

**Done when**
- [ ] Skeleton pushed to `main`
- [ ] All 4 members have cloned the repo
- [ ] Branch protection on

---

## T0.2 — Frontend scaffold

| Owner | Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|---|
| M2 | 2 h | T0.1 | T0.3, T0.5 | T1.*, T0.7 |

**External:** Node 20 LTS, npm.

**Steps**
1. Scaffold the app.
   1. `npm create vite@latest frontend -- --template react-ts`
   2. Install: `tailwindcss`, `zustand`, `dexie`, `mathlive`, `katex`, `recharts`, `msw` (dev), `vitest`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`, `fake-indexeddb` (dev), `@playwright/test` (dev), `@axe-core/playwright` (dev), `eslint`, `prettier`, `openapi-typescript` (dev).
2. Configure tooling.
   1. Tailwind config + base CSS.
   2. ESLint (typescript-eslint, react-hooks) + Prettier.
   3. `tsconfig` strict mode on.
   4. Vitest with `jsdom` environment and `fake-indexeddb/auto` in the setup file.
   5. npm scripts: `dev`, `build`, `test`, `lint`, `typecheck`, `e2e`, `gen:types` (`openapi-typescript ../shared/contracts/openapi.yaml -o src/services/api/types.ts`).
3. Create the folder structure from `docs/02-architecture.md §2`.
4. Add a placeholder `App.tsx` showing "MathMind" and a dummy route.
5. Write one sample Vitest test and one Playwright smoke test that opens `/`.

**Tests:** `npm run test`, `npm run lint`, `npm run typecheck`, `npm run build` all pass.

**Done when**
- [ ] `npm run dev` serves on :5173
- [ ] All scripts pass
- [ ] PR merged

---

## T0.3 — Backend scaffold

| Owner | Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|---|
| M1 | 3 h | T0.1 | T0.2, T0.5 | T0.4, T2.*, T0.7 |

**External:** Python 3.11.

**Steps**
1. Create the environment.
   1. `python -m venv .venv` and activate it.
   2. `requirements.txt`: `fastapi`, `uvicorn[standard]`, `pydantic>=2`, `pydantic-settings`, `sqlmodel`, `python-multipart`, `httpx`, `sympy`, `antlr4-python3-runtime==4.11.*`, `pillow`, `filetype`.
   3. `requirements-dev.txt`: `pytest`, `pytest-asyncio`, `pytest-cov`, `hypothesis`, `ruff`, `mypy`, `schemathesis`, `bandit`, `pip-audit`.
   4. `requirements-ml.txt` (kept separate because it is heavy): `pix2tex`, `torch` (CPU build), `opencv-python-headless`.
2. Build the app skeleton.
   1. `app/main.py` with an app factory, CORS for `http://localhost:5173`, and `/api/v1/health`.
   2. `app/core/config.py` using `pydantic-settings` that reads `.env`.
   3. `app/core/errors.py` with a uniform error body `{error: {code, message, details}}`.
   4. `app/core/logging.py` with structured logging.
3. Set up testing.
   1. `pytest.ini` with markers `unit`, `integration`, `slow`, `ml`, `llm`.
   2. `tests/conftest.py` with a `TestClient` fixture and an in-memory SQLite fixture.
   3. Write `test_health.py`.
4. Configure lint: `ruff.toml`, and `mypy.ini` (strict on `app/core`, `app/schemas`).

**Tests:** `pytest -q` passes; `ruff check .` and `mypy app` are clean.

**Done when**
- [ ] `uvicorn app.main:app --reload` → `GET /api/v1/health` returns 200
- [ ] PR merged

---

## T0.4 — API contract v0 + mocks  🔴

| Owner | Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|---|
| M1 (M3 reviews schemas) | 4 h | T0.3 | T1.2, T1.6, T3.1 | T2.1, mock-based work for M2 and M4 |

**Why it matters:** this contract is what lets M2 and M4 build UI before the backend works.

**Steps**
1. Write the JSON Schemas in `shared/contracts/schemas/`.
   1. `Stroke.json`, `Page.json`, `Notebook.json`.
   2. `Submission.json` (incl. `status` enum from `02-architecture.md §5`).
   3. `RecognizedRegion.json` (`id`, `bbox{x,y,w,h}` normalized, `latex`, `confidence`, `confirmed`, `corrected_latex`).
   4. `VerificationResult.json`: `steps[{index, latex, verdict: supported|incorrect|inconclusive, reason, domain_warning?}]`, `first_error_step|null`, `overall`.
   5. `ReviewResult.json` (from `02-architecture.md §8`, with enums).
   6. `Mastery.json`, `NextAction.json` (`action`, `concept_id`, `problem_id?`, `reason`).
2. Write `shared/contracts/openapi.yaml` for every endpoint in `02-architecture.md §5`, using the `$ref` schemas.
3. Generate the types. *(As built: Pydantic models in `backend/app/schemas/` are the single definition;
   `python scripts/export_contracts.py` writes `openapi.yaml` + `schemas/*.json`, and CI checks they are in sync.)*
   1. Frontend: `npm run gen:types`.
   2. Backend: `python scripts/export_contracts.py` after changing any model.
4. Create mock data.
   1. `shared/contracts/examples/*.json`: one example per schema, including `incorrect` and `completed_without_ai` cases.
   2. `frontend/src/mocks/handlers.ts` (MSW) serving the examples, enabled by `VITE_USE_MOCKS=true`.
5. Have M3 review the `VerificationResult`/`ReviewResult` schemas and M2 review the stroke/page schemas, then merge.

**Tests**
- Contract test: every example JSON validates against its schema (pytest using `jsonschema`).
- Backend Pydantic models parse every example.
- `npm run typecheck` passes with the generated types.

**Done when**
- [ ] Contract merged and tagged `contract-v0`
- [ ] MSW mocks run with `VITE_USE_MOCKS=true npm run dev`

---

## T0.5 — Local AI toolchain smoke test

| Owner | Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|---|
| M3 | 3 h | — | everything in Phase 0 | T3.1, T4.1, T5.1 |

**External:** Ollama installer, ~5–10 GB free disk, internet for the first model and weight downloads, pix2tex weights (auto-download on first run), the PyTorch CPU wheel.

**Steps**
1. SymPy.
   1. `pip install sympy antlr4-python3-runtime==4.11.*`
   2. Run `parse_latex(r"\frac{2x+3}{5}=7")` and confirm it parses. Record the version.
2. pix2tex.
   1. `pip install -r backend/requirements-ml.txt` (CPU torch: `--index-url https://download.pytorch.org/whl/cpu`).
   2. Run `LatexOCR()` on 3 sample images (printed + handwritten). Record the output and time per image.
   3. Note the weight file location and size, and check the licence.
3. Ollama.
   1. Install Ollama and run `ollama pull qwen2.5:3b` (plus 1–2 other candidates for T5.1).
   2. `curl http://localhost:11434/api/generate -d '{"model":"qwen2.5:3b","prompt":"Say OK","stream":false,"format":"json"}'`
   3. Record RAM used and time to first token.
4. Write `ai/benchmarks/ENVIRONMENT.md` covering OS, CPU, RAM, GPU, versions and timings for each team laptop. M4 collects the other members' numbers.

**Tests:** script `ai/benchmarks/smoke.py` runs all three tools and prints PASS/FAIL. It should skip, not fail, when Ollama is absent.

**Done when**
- [ ] Smoke script passes on at least 2 team laptops
- [ ] ENVIRONMENT.md committed

---

## T0.6 — Junior onboarding & dataset formats (M4)

| Owner | Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|---|
| M4 (mentor M1, data review M3) | 3 h | T0.1 | everything | T6.1, T7.1 |

**External:** Node, Python, Git, VS Code (+ extensions: ESLint, Prettier, Python, Tailwind CSS IntelliSense, Markdown Preview Mermaid Support), a GitHub account.

**Steps** (small on purpose)
1. Install the tools.
   1. Install Git, Node 20, Python 3.11 and VS Code (see `06-external-requirements.md`).
   2. Check each one: `git --version`, `node -v`, `python --version`.
2. Clone and run.
   1. `git clone …` then open the folder in VS Code.
   2. Once T0.2 and T0.3 are merged, follow README "Run locally" and confirm you see the "MathMind" page.
   3. If anything fails, copy the error into the team channel and tag M1.
3. Read, in this order: `README.md` → `docs/01-product-overview.md` → `docs/team/M4-junior-qa-content.md` → `docs/05-testing-strategy.md`.
4. Practise the Git flow once.
   1. `git checkout -b docs/T0.6-onboarding`
   2. Add your name/handle to the Team table in `docs/task-board.md`.
   3. Commit `docs(T0.6): add M4 to task board` → push → open a PR → M1 approves → merge.
5. Create the dataset format files (templates are given in your guide).
   1. `datasets/concepts/SCHEMA.md`
   2. `datasets/problems/SCHEMA.md`
   3. `datasets/labelled_solutions/SCHEMA.md`
   4. Ask M3 to review all three.

**Tests:** none (no code). Peer review only.

**Done when**
- [ ] App runs locally on M4's machine
- [ ] First PR merged
- [ ] 3 schema docs approved by M3

---

## T0.7 — CI pipeline

| Owner | Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|---|
| M1 | 2 h | T0.2, T0.3 | T1.*, T3.1 | quality gates for all PRs |

**External:** GitHub Actions (free for public repos; free minutes for private ones).

**Steps**
1. `.github/workflows/ci.yml` with 2 jobs:
   1. `frontend`: setup-node 20 → `npm ci` → `lint` → `typecheck` → `test` → `build`.
   2. `backend`: setup-python 3.11 → install base + dev requirements (**not** ML) → `ruff` → `mypy` → `pytest -m "not ml and not llm"`.
2. Cache npm and pip.
3. Add `.github/workflows/e2e.yml` (manual dispatch plus nightly): it installs Playwright browsers and runs E2E against both servers with `VITE_USE_MOCKS=false` and the LLM disabled.
4. Turn on "required status checks" for `main`.

**Tests:** open a dummy PR with a lint error, confirm CI fails, fix it, confirm CI passes.

**Done when**
- [ ] CI green on `main`
- [ ] Required checks on
