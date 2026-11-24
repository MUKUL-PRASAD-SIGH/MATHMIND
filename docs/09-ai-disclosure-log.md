# 09 — AI-Assisted Development Disclosure Log

This log is required by the hackathon rubric (A4). **Everyone adds rows as they go.** M4 compiles and cleans it up in T8.3.

## Summary (filled in T8.3)

- **Development tools used:** _e.g. Claude Code, Copilot, Cursor_
- **Kinds of help:** _scaffolding, parser code, test generation, prompt drafting, UI components, docs_
- **How outputs were verified:** _unit/property tests, manual review, labelled evaluation, browser checks_
- **Runtime AI in the product:** pix2tex (local OCR), Ollama + `<model>` (local explanations). No paid APIs. SymPy is the correctness authority.

## Log

| Date | Member | Task | AI tool | What the AI produced | Human check performed | Decision & evidence |
|---|---|---|---|---|---|---|
| 2026-__-__ | M3 | T3.1 | _tool_ | LaTeX normalization function | Ran 40 table-driven cases + Hypothesis round-trip | Found 3 failures (`\dfrac`, unicode minus, `\left(`); fixed; PR #__ |
| | | | | | | |

### Categories to cover (from spec §14.5)

| AI-assisted contribution | Required human check | Evidence to record |
|---|---|---|
| Generated parser or transformation code | Test against known expressions and edge cases | Errors found; changed or kept |
| Generated evaluation prompt / schema | Run against labelled examples; inspect outputs | Schema failures, inaccurate explanations, prompt revisions |
| Generated UI component | Browser interaction + accessibility checks | Layout/interaction issues and fixes |
| Generated tests | Mutation check: break the code, confirm the test fails | Test caught / didn't catch |
| Generated docs | Fact-check against the actual implementation | Corrections made |
