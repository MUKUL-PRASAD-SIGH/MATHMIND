# Phase 5 — AI Review (Day 1–5)

**Goal:** a local LLM turns verified evidence into a short explanation and hint. The output is schema-validated, overridden by SymPy where they disagree, and the system falls back gracefully when the model is unavailable.

---

## T5.1 — Local model benchmark & selection (M3, M4 records)

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 4 h (M3) + 2 h (M4) | T0.5 | T3.1, T3.2 | T5.2 |

**External:** Ollama; 2–4 candidate models (e.g. `qwen2.5:3b`, `qwen2.5:7b`, `llama3.2:3b`, `phi3.5`). These are a few GB each, so download them on a good connection. **Check each model's licence** before committing to it.

**Steps**
1. M3 writes `ai/benchmarks/bench_models.py`.
   1. Use 15 fixed prompts built from early dataset items (a mix of correct and incorrect solutions).
   2. For each model, record JSON-valid rate, schema-valid rate, agreement with the SymPy `first_error_step`, median latency, tokens/s and peak RAM.
2. M4 runs the script on their own laptop as well and fills `ai/benchmarks/results.md` (a template is provided in M4's guide).
3. M3 picks the default model and a **low-RAM fallback** model, then records the decision and its reasons in `ai/benchmarks/DECISION.md` (latency budget: p50 < 15 s on the target laptop).

**Tests:** the benchmark itself is the test; results are committed.

---

## T5.2 — Reviewer prompt + Pydantic schema + validation/retry  🔴 (M3)

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 5 h | T3.2, T5.1 | T4.2, T1.9 | T5.3 |

**Steps**
1. `ai/prompts/reviewer_v1.md`, a system prompt:
   1. "You explain verified results. You do not decide correctness."
   2. The input is a JSON block (problem, steps, verdicts, concept, prerequisites, prior errors ≤ 3).
   3. The output is JSON only, matching the schema; the hint must not reveal the final answer; at most 2 sentences per field.
   4. Include 2 few-shot examples (one incorrect, one correct).
2. `services/reasoning/schema.py`: `ReviewResult` Pydantic model with `extra="forbid"`, enums for `status`, `error_type` and `recommended_action`, `confidence: float = Field(ge=0, le=1)`, and string length caps.
3. `services/reasoning/client.py`: an Ollama `/api/chat` client with `format: "json"`, `temperature: 0.2`, a 60 s timeout, and a health check.
4. `services/reasoning/reviewer.py`
   1. Build the structured input.
   2. Call → parse JSON → validate. On failure, retry once with the validation error appended, then raise `ReviewUnavailable`.
   3. **Consistency override:** if `status`/`first_error_step` disagree with SymPy, overwrite them with the SymPy values, set `overridden=True`, and log it.
   4. Strip any markdown, code or URLs from the text fields.
5. Version the prompt (`prompt_version` is stored in `evaluations`).

**Tests**
- Unit (mocked LLM): valid JSON → parsed; invalid JSON → retry → success; invalid twice → `ReviewUnavailable`.
- Unit: a disagreeing status is overridden by SymPy.
- **Robustness/fuzz:** feed 20 malformed or hostile LLM outputs (extra fields, wrong enums, 10 KB strings, `<script>`, "ignore previous instructions") → all rejected or sanitized.
- `@pytest.mark.llm` integration with the real model on 5 dataset items: schema-valid rate is recorded.

---

## T5.3 — Review orchestrator + LLM-unavailable fallback  🔴 (M1, M3 supports)

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 6 h | T3.4, T4.2, T5.2 | T6.3 | T5.4, T6.3 wiring, T7.2, T7.6, T8.1 |

**Steps**
1. Register the `reason` stage. Before calling the model, check Ollama health (cached 10 s). If it is down → `completed_without_ai` with `ai_status="unavailable"`.
2. `POST /submissions/{id}/review` (re)starts the review for an existing submission (e.g. after the learner corrects their work, which creates a new submission linked by `previous_submission_id`).
3. Assemble the response: `{verification, review|null, ai_status: ok|unavailable|invalid_output, regions: [...with bbox], step_to_region: {...}}`.
4. Emit a `learning_event` (consumed by T6.3) on completion.
5. Add a `/health` field `ollama: up|down` and the model name.

**Tests**
- Integration: Ollama mocked up → `completed`; mocked down (connection refused) → `completed_without_ai` with verification intact; mocked timeout → same.
- **R3 failure demo test:** stop the Ollama service → submit → work preserved, deterministic results shown, label present.
- Contract: the response validates against the schema.

---

## T5.4 — Review panel + annotations linked to regions  🟡🔴 (M2)

| Est | Prerequisites | Parallel with | Unblocks |
|---|---|---|---|
| 5 h | T1.8, T5.3 (mock-ok from T0.4) | T6.3, T6.4 | T6.7, T7.3, T7.4 |

**Steps**
1. "Review my solution" button: on the selection context menu, on the page toolbar, and on solution blocks.
2. Status UI: a stepper showing Recognizing → (Check recognition) → Verifying → Explaining, with cancel.
3. Annotations (SVG overlay)
   1. For each step with a `region_id`, draw an outline at the region bbox: green (supported), red (incorrect), grey dashed (inconclusive).
   2. Pin a marker at the first error with a small callout containing the hint.
   3. Annotations are separate objects: dismissible, recomputable, and **never modifying ink**.
4. Feedback panel: overall status, the first error step, the explanation, the hint (behind a "Show hint" button), and the recommended next action.
5. `ai_status=unavailable` banner: "AI explanation unavailable — showing verified checks only." Never show an empty spinner forever.
6. Cache the review in IDB (`reviews` table) so it shows offline after a reload.

**Tests**
- Component (MSW): every example (`completed`, `completed_without_ai`, incorrect at step 2) renders the correct colours and banner.
- Unit: bbox → SVG coordinate mapping at different zoom levels.
- E2E (T7.3): R2-B flow shows a red outline on the correct region.
