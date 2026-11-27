# Phase 2 — Backend Core (Day 1–3) · Owner: M1

**Goal:** persistent API for notebooks and submissions, a job runner with a status state machine, and a typed frontend client.

---

## T2.1 — DB models + repositories (SQLite)  🔴

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 4 h | T0.3, T0.4 | T1.*, T3.1 | T2.2, T2.3 |

**Steps**
1. Write SQLModel tables for every entity in `02-architecture.md §4`. Store JSON columns as `TEXT` with Pydantic (de)serialization.
2. `app/core/db.py`: engine, session dependency, `create_all` on startup (Alembic is optional and can come later).
3. Repositories with one module per aggregate: `notebooks`, `submissions` (incl. regions, steps, evaluation), `learning` (concepts, mastery, events, revision).
4. Single-user MVP: create a default local user on first start, and have `current_user` return it. Still pass `owner_id` everywhere so ownership checks are real.
5. Seed loader: `python -m app.seed` loads `datasets/concepts/*.json` and `datasets/problems/*.json` (formats from T0.6) and is idempotent.

**Tests**
- Unit: each repository's CRUD against in-memory SQLite.
- Integration: the seed loader runs twice with no duplicates.

**Done when:** all tables are created; the repos are tested; the seed works with M4's sample file.

---

## T2.2 — Notebook / page endpoints

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 3 h | T2.1 | T2.3 | T2.5 |

**Steps**
1. `POST /notebooks`, `GET /notebooks`, `PUT /notebooks/{id}/pages/{page_id}` (upsert page metadata plus optional stroke batch).
2. Ownership check: a 404 (not 403) when the notebook isn't owned by the current user.
3. Optimistic concurrency: `version` field; return 409 on a mismatch.
4. Response models must match the contract exactly.

**Tests**
- Integration (TestClient): create → list → upsert page → version conflict returns 409.
- Contract: response bodies validate against `shared/contracts/schemas`.

---

## T2.3 — Submission endpoints + upload validation  🔴

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 4 h | T2.1 | T2.2 | T2.4, T7.7 |

**Steps**
1. `POST /submissions/typed`, body `{page_id?, problem_id?, steps: [{latex, region_id?}]}`. Creates a submission with `status=received` and returns 202 `{submission_id, status}`.
2. `POST /submissions/image`, multipart: `file`, `page_id`, `bbox` JSON, `stroke_ids?`.
   1. Check magic bytes with `filetype` (PNG/JPEG/WebP only).
   2. Size ≤ `MAX_UPLOAD_MB`; open with Pillow and check dimensions ≤ 4096²; strip EXIF.
   3. Store under `data/uploads/{submission_id}/source.png` with a random filename (never the user's filename).
3. `GET /submissions/{id}/status` returns `{status, progress?, message?}`.
4. `GET /submissions/{id}/review` returns 404 until the job is complete, then `{verification, review, ai_status, regions}`.

**Tests**
- Integration: typed submit returns 202; status returns `received`.
- **Security tests:** a `.exe` renamed to `.png` → 415; a 6 MB file → 413; 5000×5000 px → 422; a path-traversal filename is ignored.
- Contract: schemathesis run against `openapi.yaml` (T7.3 extends this).

---

## T2.4 — Job runner + status state machine  🔴

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 4 h | T2.3 | T3.2 | T3.4, T4.2, T5.3 |

**Steps**
1. `app/services/jobs/runner.py`: an in-process `ThreadPoolExecutor(max_workers=2)` (a queue is enough for the MVP; no Celery).
2. `state_machine.py`: an explicit transitions table (see the status diagram). `transition(sub, new)` raises on an illegal transition.
3. A pipeline registry: `typed → [verify, reason]`, `image → [recognize, (await_confirm), verify, reason]`. Each stage is a callable registered by M3's services, with stubs until they exist.
4. Per-stage timeouts (OCR 20 s, verify 5 s, LLM 60 s). On timeout, go to the defined failure state and **persist partial results**.
5. On startup, recover submissions stuck in non-terminal states by marking them failed and retryable.

**Tests**
- Unit: every legal and illegal transition.
- Integration: a typed submission with **stub** verify and reason stages reaches `completed`.
- Failure injection: a stage that raises → `failed_*`, not a crash; a stage that sleeps past its timeout → the timeout state.

**Done when:** the pipeline runs end-to-end with stubs; M3 can plug in real stages.

---

## T2.5 — Frontend API client + page sync (M1 + M2 pair)

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 3 h | T2.2, T1.5 | T1.7 | T4.3, T5.4 |

**Steps**
1. `src/services/api/client.ts`: a typed `fetch` wrapper using the generated types, `baseUrl` from env, and errors mapped to `ApiError`.
2. A `pollStatus(id)` helper: interval 1 s → backoff to 3 s, stops on a terminal state, and is cancellable with `AbortController`.
3. Page sync: after an IDB save, queue `PUT /pages` (best effort). Offline → keep queued and retry when the `online` event fires. **IDB stays the source of truth.**
4. A `VITE_USE_MOCKS` switch so MSW still works.

**Tests**
- Unit: polling stops on terminal states and backoff timing (fake timers).
- Integration (MSW): sync queue flushes after an online event.
- Offline E2E (T7.3): `context.setOffline(true)` → drawing still saves locally.
