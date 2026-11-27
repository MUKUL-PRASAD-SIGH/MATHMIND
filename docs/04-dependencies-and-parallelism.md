# 04 — Dependencies, Parallelism & Critical Path

This guide is for humans **and AI agents**. It answers three questions: *can I start this task now? what can run at the same time? what must not slip?*

## 1. Dependency graph

```mermaid
flowchart LR
    classDef crit fill:#fde2e2,stroke:#c0392b,color:#000
    classDef m4 fill:#e3f2fd,stroke:#1e88e5,color:#000
    classDef p1 fill:#eeeeee,stroke:#888,stroke-dasharray:4 3,color:#000

    T01[T0.1 repo]:::crit --> T02[T0.2 FE scaffold]:::crit
    T01 --> T03[T0.3 BE scaffold]:::crit
    T01 --> T06[T0.6 M4 onboarding]:::m4
    T03 --> T04[T0.4 API contract]:::crit
    T02 --> T07[T0.7 CI]
    T03 --> T07
    T05[T0.5 AI toolchain]

    %% frontend
    T02 --> T11[T1.1 IDB model]
    T02 --> T12[T1.2 ink canvas]:::crit
    T02 --> T16[T1.6 responsive]
    T12 --> T13[T1.3 tools+undo]:::crit
    T11 --> T14[T1.4 pages]
    T11 --> T15[T1.5 autosave]
    T13 --> T15
    T11 --> T17[T1.7 MathLive]
    T13 --> T18[T1.8 lasso+overlay]:::crit
    T18 --> T19[T1.9 image+crop]:::crit

    %% backend
    T04 --> T21[T2.1 DB models]:::crit
    T03 --> T21
    T21 --> T22[T2.2 notebook API]
    T21 --> T23[T2.3 submission API]:::crit
    T23 --> T24[T2.4 job runner]:::crit
    T22 --> T25[T2.5 FE client+sync]
    T15 --> T25

    %% math
    T05 --> T31[T3.1 parse]:::crit
    T31 --> T32[T3.2 verifier]:::crit
    T32 --> T33[T3.3 ext rules]
    T32 --> T34[T3.4 wire verify • Milestone A]:::crit
    T24 --> T34

    %% recognition
    T05 --> T41[T4.1 pix2tex]:::crit
    T31 --> T41
    T24 --> T42[T4.2 recog stage+confirm]:::crit
    T41 --> T42
    T19 --> T43[T4.3 OCR confirm UI]
    T42 --> T43

    %% AI
    T05 --> T51[T5.1 model bench]
    T32 --> T52[T5.2 prompt+schema]:::crit
    T51 --> T52
    T34 --> T53[T5.3 orchestrator]:::crit
    T42 --> T53
    T52 --> T53
    T18 --> T54[T5.4 review UI]:::crit
    T53 --> T54

    %% adaptive
    T06 --> T61[T6.1 concepts]:::m4
    T61 --> T62[T6.2 problems]:::m4
    T61 --> T63[T6.3 mastery]
    T34 --> T63
    T63 --> T64[T6.4 next action]
    T62 --> T64
    T64 --> T65[T6.5 learner API]
    T63 --> T65
    T65 --> T66[T6.6 progress page]:::m4
    T54 --> T67[T6.7 live assist ⭐]:::p1
    T42 --> T67

    %% testing
    T06 --> T71[T7.1 dataset]:::m4
    T71 --> T72[T7.2 eval harness]
    T53 --> T72
    T54 --> T73[T7.3 E2E]:::crit
    T54 --> T74[T7.4 device matrix]:::m4
    T72 --> T75[T7.5 R2/R3 evidence]:::crit
    T73 --> T75
    T53 --> T76[T7.6 perf]
    T23 --> T77[T7.7 security]
    T17 --> T78[T7.8 a11y]

    %% submission
    T53 --> T81[T8.1 docker]
    T75 --> T82[T8.2 docs final]:::m4
    T75 --> T84[T8.4 demo]:::crit
    T84 --> T85[T8.5 submit]:::crit
```

Red = critical path · Blue = M4 tasks · Dashed = P1 stretch

## 2. Prerequisite lookup table

| Task | Hard prerequisites (must be `done`) | Soft / mock-ok (can start against mock) |
|---|---|---|
| T0.1 | — | — |
| T0.2 | T0.1 | — |
| T0.3 | T0.1 | — |
| T0.4 | T0.3 | — |
| T0.5 | — | — |
| T0.6 | T0.1 | T0.2/T0.3 for "run locally" step |
| T0.7 | T0.2, T0.3 | — |
| T1.1 | T0.2 | T0.4 (draft types) |
| T1.2 | T0.2 | — |
| T1.3 | T1.2 | — |
| T1.4 | T1.1 | — |
| T1.5 | T1.1, T1.3 | — |
| T1.6 | T0.2 | — |
| T1.7 | T1.1 | T2.3 (use MSW mock for "Check steps") |
| T1.8 | T1.3 | — |
| T1.9 | T1.8 | — |
| T2.1 | T0.3, T0.4 | — |
| T2.2 | T2.1 | — |
| T2.3 | T2.1 | — |
| T2.4 | T2.3 | stub stages for M3 services |
| T2.5 | T2.2, T1.5 | — |
| T3.1 | T0.5 | — |
| T3.2 | T3.1 | — |
| T3.3 | T3.2 | — |
| T3.4 | T3.2, T2.4 | — |
| T4.1 | T0.5, T3.1 | — |
| T4.2 | T2.4, T4.1 | T4.1 can be mocked for endpoint work |
| T4.3 | T1.9 | T4.2 (MSW `awaiting_confirmation` example) |
| T5.1 | T0.5 | early dataset items (T7.1) helpful |
| T5.2 | T3.2, T5.1 | — |
| T5.3 | T3.4, T4.2, T5.2 | T5.2 can be stubbed to unblock the fallback path |
| T5.4 | T1.8 | T5.3 (MSW review examples) |
| T6.1 | T0.6 | — |
| T6.2 | T6.1 | — |
| T6.3 | T6.1, T3.4 | — |
| T6.4 | T6.3, T6.2 | — |
| T6.5 | T6.3, T6.4 | — |
| T6.6 | — | T6.5 (MSW `Mastery.json`, `NextAction.json`) |
| T6.7 | T5.4, T4.2 | — |
| T7.1 | T0.6 | — |
| T7.2 | T5.3, T7.1 (≥ 40 items) | — |
| T7.3 | T5.4 | individual specs can be written as features land |
| T7.4 | T5.4 | partial runs after T1.* |
| T7.5 | T7.2, T7.3 | — |
| T7.6 | T5.3 | — |
| T7.7 | T2.3 | — |
| T7.8 | T1.7 | — |
| T8.1 | T5.3 | — |
| T8.2 | T7.5 | — |
| T8.3 | — (continuous) | — |
| T8.4 | T7.5 | script draft from Day 5 |
| T8.5 | T8.4 | — |

## 3. Parallel lanes

Four people means at most four tasks in progress at once. Each lane is one person's sequence; lanes only touch at the **sync points**.

```mermaid
gantt
    title MathMind — 7.5-day plan (lanes per member)
    dateFormat  YYYY-MM-DD
    axisFormat  %H:%M
    section M1 Lead/Backend
    T0.1 repo             :crit, m1a, 2026-01-01, 2h
    T0.3 BE scaffold      :crit, m1b, after m1a, 2h
    T0.4 contract         :crit, m1c, after m1b, 4h
    T0.7 CI               :m1d, after m1c, 2h
    T2.1 DB               :crit, m1e, after m1d, 4h
    T2.2 notebook API     :m1f, after m1e, 3h
    T2.3 submission API   :crit, m1g, after m1f, 4h
    T2.4 job runner       :crit, m1h, after m1g, 4h
    T2.5 client (pair)    :m1i, after m1h, 3h
    T4.2 recog stage      :crit, m1j, after m1i, 3h
    T5.3 orchestrator     :crit, m1k, after m1j, 6h
    T7.7 security         :m1l, after m1k, 3h
    T6.5 learner API      :m1m, after m1l, 3h
    T7.3 E2E              :crit, m1n, after m1m, 4h
    T7.5 evidence         :crit, m1o, after m1n, 3h
    T8.1 docker           :m1p, after m1o, 3h
    T8.4 demo             :crit, m1q, after m1p, 4h
    T8.5 submit           :crit, m1r, after m1q, 2h
    section M2 Frontend
    T0.2 FE scaffold      :crit, m2a, 2026-01-01, 2h
    T1.2 ink              :crit, m2b, after m2a, 6h
    T1.6 responsive       :m2c, after m2b, 3h
    T1.1 IDB              :m2d, after m2c, 4h
    T1.3 tools            :crit, m2e, after m2d, 4h
    T1.4 pages            :m2f, after m2e, 4h
    T1.5 autosave         :m2g, after m2f, 3h
    T2.5 client (pair)    :m2h, after m2g, 3h
    T1.7 MathLive         :m2i, after m2h, 5h
    T1.8 lasso/overlay    :crit, m2j, after m2i, 5h
    T1.9 image/crop       :crit, m2k, after m2j, 4h
    T4.3 OCR confirm UI   :m2l, after m2k, 3h
    T5.4 review UI        :crit, m2m, after m2l, 6h
    T7.3 E2E              :crit, m2n, after m2m, 4h
    T7.8 a11y             :m2o, after m2n, 2h
    T6.7 live assist ⭐    :m2p, after m2o, 4h
    section M3 Math/AI
    T0.5 toolchain        :m3a, 2026-01-01, 3h
    T3.1 parse            :crit, m3b, after m3a, 4h
    T5.1 model bench      :m3c, after m3b, 4h
    T3.2 verifier         :crit, m3d, after m3c, 5h
    T3.4 wire verify      :crit, m3e, after m3d, 3h
    T4.1 pix2tex          :crit, m3f, after m3e, 5h
    T3.3 ext rules        :m3g, after m3f, 5h
    T5.2 prompt/schema    :crit, m3h, after m3g, 5h
    T6.3 mastery          :m3i, after m3h, 3h
    T6.4 next action      :m3j, after m3i, 4h
    T7.2 eval harness     :m3k, after m3j, 5h
    T7.6 perf             :m3l, after m3k, 3h
    section M4 Junior
    T0.6 onboarding       :m4a, 2026-01-01, 5h
    T6.1 concepts         :m4b, after m4a, 3h
    T6.2 problems         :m4c, after m4b, 4h
    T7.1 dataset          :m4d, after m4c, 13h
    T6.6 progress page    :m4e, after m4d, 6h
    T7.4 device matrix    :m4f, after m4e, 4h
    T7.5 evidence         :m4g, after m4f, 3h
    T8.3 AI log           :m4h, after m4g, 2h
    T8.2 docs final       :m4i, after m4h, 3h
```

> The Gantt shows **relative order and effort in hours** (one working day is about 8 h). The calendar start date is a placeholder; use the day-by-day table in `plan/README.md` for actual days.

### What can always run in parallel (no shared files)

| Group | Tasks | Why it's safe |
|---|---|---|
| A | Frontend ink (T1.2–T1.5) ‖ Backend core (T2.1–T2.4) ‖ Math (T3.1–T3.3) ‖ M4 data (T6.1, T6.2, T7.1) | Different folders; the contract (T0.4) is the only shared surface |
| B | T4.1 pix2tex ‖ T1.9 image crop | Agree only on "PNG + bbox" (already in the contract) |
| C | T5.2 prompt/schema ‖ T4.2 confirm endpoint ‖ T4.3 confirm UI | Linked only through the contract |
| D | T6.3/T6.4 engine ‖ T5.4 review UI ‖ T6.6 progress page (mock) | Different modules; MSW mocks |
| E | T7.2 eval ‖ T7.3 E2E ‖ T7.4 manual ‖ T7.6 perf ‖ T7.7 security | Read-only against the built system |

### What must be sequential

| Chain | Reason |
|---|---|
| T0.1 → T0.3 → T0.4 → T2.1 | The contract defines the DB shapes |
| T1.2 → T1.3 → T1.8 → T1.9 | Each builds on the canvas/tool system |
| T3.1 → T3.2 → T3.4 | The verifier needs the parser; wiring needs the verifier |
| T2.3 → T2.4 → T3.4 / T4.2 → T5.3 | The pipeline needs the runner, which needs submissions |
| T7.2 + T7.3 → T7.5 → T8.4 → T8.5 | Evidence needs working tests; the demo needs evidence |

## 4. Critical path

```
T0.1 → T0.3 → T0.4 → T2.1 → T2.3 → T2.4 → T3.4 → T5.3 → T5.4 → T7.3 → T7.5 → T8.4 → T8.5
                                        ↑            ↑      ↑
                          T3.1 → T3.2 ──┘   T5.1 → T5.2┘   T1.2 → T1.3 → T1.8
                                         T4.1 → T4.2 ─┘
```

**Slack:** ≈ 0.5 day overall. If any red task slips by more than half a day, M1 triggers the scope-cut ladder (`plan/README.md`).

## 5. Sync points

| When | Sync | Participants | Exit criteria |
|---|---|---|---|
| Day 1 noon | **Contract freeze v0** (T0.4) | M1, M2, M3 | Schemas merged; mocks run |
| Day 3 EOD | **Milestone A** | all | Typed steps → SymPy verdicts in UI |
| Day 4 noon | **OCR contract check** | M1, M2, M3 | Image → regions → confirm works with the real pix2tex |
| Day 5 EOD | **Milestone B** | all | Full review incl. AI + annotation + mastery; scope cuts decided |
| Day 6 PM | **Feature freeze + dry run #1** | all | Only bug fixes after this |
| Day 7 noon | **Release tag `v0.1.0`** | M1 | Evidence complete; video recorded |

## 6. Mocking strategy

These mocks let people work in parallel without waiting for each other.

| Consumer | Needs | Mock | Provided by | Available |
|---|---|---|---|---|
| M2 (T1.7, T4.3, T5.4) | Submission/review API | MSW handlers serving `shared/contracts/examples/*.json`; toggle `VITE_USE_MOCKS=true` | M1 (T0.4) | Day 1 noon |
| M4 (T6.6) | Mastery / next-action API | Same MSW, `Mastery.json`, `NextAction.json` | M1 (T0.4) | Day 1 noon |
| M1 (T2.4, T4.2) | Verify / recognize / reason services | Stub stage functions returning fixture results | M1 (T2.4) | Day 3 |
| M1 (T5.3 fallback path) | Ollama down/up | `respx`/`httpx.MockTransport` in tests; run with `OLLAMA_URL=http://localhost:1` for "down" | M1 | Day 4 |
| M3 (T5.2 tests) | LLM output | Fixture JSON strings (valid, malformed, hostile) | M3 | Day 4 |
| M3 (T4.1 tests) | pix2tex | Monkeypatch `LatexOCR.__call__` | M3 | Day 3 |

**Mock rule:** a mock may only return shapes that exist in the contract. If you need a new field, change the contract first (M1 approves).

## 7. Rules for AI agents choosing work

1. Read `docs/task-board.md`. Filter to *your member's* rows with status `todo`.
2. For each one, look up §2 above. If all hard prerequisites are `done` → eligible. If only soft ones are missing → eligible **with mocks**.
3. Pick the eligible task with the **lowest ID on the critical path** first, otherwise the lowest ID.
4. Set the status to `in-progress` with your branch name **before** starting.
5. If nothing is eligible, do the member's **"while blocked"** list (in their guide). Don't start someone else's task.
6. When finished: status `review`, PR link. After merge, the owner sets `done`.
