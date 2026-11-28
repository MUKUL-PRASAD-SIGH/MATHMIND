# 08 — Risks & Known Limitations

## 1. Product / technical risk register (from spec Appendix B, extended)

| # | Risk | Likelihood | Impact | Mitigation | Owner | Trigger to act |
|---|---|---|---|---|---|---|
| R1 | OCR misreads symbols, superscripts or layout | High | High | Region crops, line split, confidence proxy, **mandatory confirmation below the threshold**, varied handwriting samples | M3 | Recognition accuracy < 60% on samples by Day 4 → push the typed + confirm path harder in the demo |
| R2 | Mixed-content pages (prose, arrows, crossed-out work) | High | Medium | MVP reviews only **selected regions** with clearly written sequences | M2/M3 | — |
| R3 | Symbolic checks can't validate every transformation | Medium | High | Explicit supported scope; `inconclusive` outside it; `SUPPORTED_SCOPE.md` | M3 | False-incorrect seen in eval → add a rule or a scope restriction |
| R4 | Local model too slow or heavy on target laptops. **Seen 2026-11-28:** qwen2.5:3b on CPU p50 40 s, p95 97 s; cold load 64–117 s; a cold first review hit `TIMEOUT_LLM` and fell back to SymPy-only (R2-B, R2-C run 1) | **High** | Medium | Benchmark (T5.1), low-RAM fallback model, deterministic results first, "AI unavailable" path | M3 | p50 > 20 s → switch to the smaller model |
| R5 | LLM gives plausible but wrong explanations. **Seen 2026-11-28:** wrong text on R2-D and on the demo problem itself; error-type accuracy 52 % (`reviewer_v1`). `reviewer_v2` adds SymPy-expanded steps (R2-B explanation then correct 2/2) | **Certain** | High | SymPy override, schema validation, short outputs, human-rated evaluation | M3 | Validity < 2/3 average → tighten the prompt and give less freedom |
| R6 | Free hosting limits | Low | Low | Local execution is the dependable path | M1 | — |
| R7 | Mastery score ≠ real understanding | Certain | Low | Label it an **estimate**, show confidence level, reassess after revision | M3 | — |
| R8 | Pointer/palm behaviour differs across browsers | Medium | Medium | Pointer Events + "ignore touch when pen" setting; real-device test (T7.4) | M2 | — |
| R9 | Camera needs HTTPS on phones | Medium | Medium | `vite --https` (basic-ssl), or file import fallback | M2 | — |
| R10 | SymPy/antlr version mismatch breaks `parse_latex` | Medium | High | Pin `antlr4-python3-runtime==4.11.*`; T0.5 smoke test | M3 | — |
| R11 | Windows path / line-ending issues | Medium | Low | `.gitattributes`, `pathlib`, CI on ubuntu + one Windows dev | M1 | — |
| R12 | Unpinned backend deps change under us (seen: FastAPI 0.165 wraps included routers in a private class; Starlette deprecates `httpx` in `TestClient`) | Medium | Medium | Code uses public APIs only (the 405 `Allow` fix reads the OpenAPI doc, not router internals); CI catches breaks on every PR | M1 | CI goes red with no code change → pin the last good versions in a lock file and install the demo laptop from it |
| R14 | Laptop RAM: Ollama (≈1.8 GB) + Docker + browser on a 16 GB laptop with other containers left the machine at < 1 GB free; background jobs were killed | Medium | Medium | Stop unrelated containers and apps before the demo; warm the model at T−5 min | M1 | Free RAM < 2 GB in pre-flight → close apps or use the typed fallback with AI off |
| R13 | No authentication: single local learner. Anyone who can reach the API on the network can read or delete the data (incl. `DELETE /learners/me/data`) | Medium | High | Run on a private hotspot for the demo; API on `127.0.0.1` unless the tablet needs it; delete needs `?confirm=true`; stated as a limitation | M1 | Venue Wi-Fi is shared → use a phone hotspot |

## 2. Delivery / team risks

| # | Risk | Mitigation | Owner |
|---|---|---|---|
| D1 | Critical-path slip (contract, runner, verifier, review UI) | Mocks for parallel work, daily integration check, scope-cut ladder | M1 |
| D2 | Integration surprises late | Milestone A (Day 3) and B (Day 5), contract tests in CI | M1 |
| D3 | Junior member blocked | Buddy per task, 45-minute escalation rule, off critical path | M1 |
| D4 | Large model downloads fail at the venue | Download on Day 0; copy to USB | M3 |
| D5 | Demo machine failure | Backup recording of each segment; second laptop prepared | M1 |
| D6 | Over-claiming in the submission | Only claim measured metrics and tested devices (T8.2 check) | M4 + M1 |
| D7 | Review bottleneck: `main` needs 1 approval and M1's PRs are stacked (`feat/M1-foundation` ← `feat/T7.7-security` ← `feat/T8.4-demo-seed`) | Review PRs the same day; merge in order (squash); rebase the next branch onto `main` after each merge | M1 |

## 3. Known limitations (to state publicly)

- **Single-user and local:** there are no accounts or passwords. Run it on your own machine or a private network.
- Handwriting recognition works on **selected, clearly written expression regions**, not arbitrary full pages.
- Verification covers **the scope listed in `backend/app/services/verification/SUPPORTED_SCOPE.md`**. Everything else is `inconclusive`.
- AI explanations come from a small local model. They may be imperfect and are constrained by symbolic checks.
- Mastery uses a simple heuristic (`0.7/0.3` weighted update) and is an estimate.
- Device compatibility is claimed only for the combinations listed in the README "Tested on" table.
- Running the local LLM needs a capable computer. Without one, MathMind runs without AI explanations.

Found during testing (2026-11-28):

- The AI explanation can be **wrong even when the verdict is right** (seen on R2-D and on the demo problem with
  `reviewer_v1`). The UI labels it as an explanation; the ✓/✗ per step comes only from SymPy.
- On a CPU-only laptop an AI explanation takes **20–120 s**, and the first one after starting can time out; the
  SymPy result is still shown.
- **pix2tex has not been measured on real handwriting** (not installed on the test laptop). The confirm-before-judging
  flow is tested with mocked recognition only.
- Notebooks live in the browser (IndexedDB). Pages are copied to the backend for review, but notebooks created
  elsewhere (e.g. by `seed_demo.py`) do not appear in the browser.
- Mastery only changes when a solution is linked to a problem (Progress → Practise this problem); free-form
  solution blocks are reviewed but do not count as practice.
- Device claims: automated Chromium tests at laptop size and in iPad / iPhone emulation only (see README).
