# 08 — Risks & Known Limitations

## 1. Product / technical risk register (from spec Appendix B, extended)

| # | Risk | Likelihood | Impact | Mitigation | Owner | Trigger to act |
|---|---|---|---|---|---|---|
| R1 | OCR misreads symbols, superscripts or layout | High | High | Region crops, line split, confidence proxy, **mandatory confirmation below the threshold**, varied handwriting samples | M3 | Recognition accuracy < 60% on samples by Day 4 → push the typed + confirm path harder in the demo |
| R2 | Mixed-content pages (prose, arrows, crossed-out work) | High | Medium | MVP reviews only **selected regions** with clearly written sequences | M2/M3 | — |
| R3 | Symbolic checks can't validate every transformation | Medium | High | Explicit supported scope; `inconclusive` outside it; `SUPPORTED_SCOPE.md` | M3 | False-incorrect seen in eval → add a rule or a scope restriction |
| R4 | Local model too slow or heavy on target laptops | Medium | Medium | Benchmark (T5.1), low-RAM fallback model, deterministic results first, "AI unavailable" path | M3 | p50 > 20 s → switch to the smaller model |
| R5 | LLM gives plausible but wrong explanations | High | High | SymPy override, schema validation, short outputs, human-rated evaluation | M3 | Validity < 2/3 average → tighten the prompt and give less freedom |
| R6 | Free hosting limits | Low | Low | Local execution is the dependable path | M1 | — |
| R7 | Mastery score ≠ real understanding | Certain | Low | Label it an **estimate**, show confidence level, reassess after revision | M3 | — |
| R8 | Pointer/palm behaviour differs across browsers | Medium | Medium | Pointer Events + "ignore touch when pen" setting; real-device test (T7.4) | M2 | — |
| R9 | Camera needs HTTPS on phones | Medium | Medium | `vite --https` (basic-ssl), or file import fallback | M2 | — |
| R10 | SymPy/antlr version mismatch breaks `parse_latex` | Medium | High | Pin `antlr4-python3-runtime==4.11.*`; T0.5 smoke test | M3 | — |
| R11 | Windows path / line-ending issues | Medium | Low | `.gitattributes`, `pathlib`, CI on ubuntu + one Windows dev | M1 | — |

## 2. Delivery / team risks

| # | Risk | Mitigation | Owner |
|---|---|---|---|
| D1 | Critical-path slip (contract, runner, verifier, review UI) | Mocks for parallel work, daily integration check, scope-cut ladder | M1 |
| D2 | Integration surprises late | Milestone A (Day 3) and B (Day 5), contract tests in CI | M1 |
| D3 | Junior member blocked | Buddy per task, 45-minute escalation rule, off critical path | M1 |
| D4 | Large model downloads fail at the venue | Download on Day 0; copy to USB | M3 |
| D5 | Demo machine failure | Backup recording of each segment; second laptop prepared | M1 |
| D6 | Over-claiming in the submission | Only claim measured metrics and tested devices (T8.2 check) | M4 + M1 |

## 3. Known limitations (to state publicly)

- Handwriting recognition works on **selected, clearly written expression regions**, not arbitrary full pages.
- Verification covers **the scope listed in `backend/app/services/verification/SUPPORTED_SCOPE.md`**. Everything else is `inconclusive`.
- AI explanations come from a small local model. They may be imperfect and are constrained by symbolic checks.
- Mastery uses a simple heuristic (`0.7/0.3` weighted update) and is an estimate.
- Device compatibility is claimed only for the combinations listed in the README "Tested on" table.
- Running the local LLM needs a capable computer. Without one, MathMind runs without AI explanations.

*(M4 updates this section with real findings in T8.2.)*
