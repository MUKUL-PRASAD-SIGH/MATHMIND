"""T7.2 evaluation harness: run the production verifier (and optionally the local reviewer / OCR) on the
labelled dataset and write a metrics report.

    # from the repo root, with the backend virtualenv
    python ai/evaluation/run_eval.py --dataset datasets/labelled_solutions
    python ai/evaluation/run_eval.py --dataset datasets/labelled_solutions --model qwen2.5:3b
    python ai/evaluation/run_eval.py --dataset datasets/labelled_solutions --mode image   # needs pix2tex + PNGs
    python ai/evaluation/run_eval.py ... --ratings ai/evaluation/ratings.csv

Writes ai/evaluation/reports/<date>-<model|sympy-only>[-image].md and a .json copy.
Anything that could not be measured (Ollama down, pix2tex missing, no images) is reported as
"not measured" with the reason. The script never invents numbers.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import asdict
from datetime import date
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
sys.path.insert(0, str(REPO / "backend"))
sys.path.insert(0, str(HERE))

import metrics as m  # noqa: E402

from app.services.jobs.stages import ProblemContext, ReviewInput, ReviewUnavailable  # noqa: E402
from app.services.reasoning.reviewer import PROMPT_VERSION  # noqa: E402
from app.services.verification import verify_steps  # noqa: E402


def load_items(dataset: Path) -> list[dict[str, Any]]:
    items = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(dataset.rglob("*.json"))]
    if not items:
        raise SystemExit(f"no labelled items under {dataset}")
    return items


def problem_of(item: dict[str, Any]) -> ProblemContext:
    ref = item.get("reference_solution") or []
    return ProblemContext(item["id"], item["concept_id"], item["problem_latex"], ref[-1] if ref else None)


def make_reviewer(model: str, url: str, timeout: float) -> tuple[Any, str | None]:
    from app.services.reasoning.client import OllamaClient
    from app.services.reasoning.reviewer import Reviewer

    client = OllamaClient(url, model, timeout=timeout)
    if not client.health():
        return None, f"Ollama at {url} is not running or does not have {model}"
    return Reviewer(client), None


def run_typed(items: list[dict[str, Any]], reviewer: Any, latency: dict[str, list[float]]) -> list[m.ItemOutcome]:
    out: list[m.ItemOutcome] = []
    for n, item in enumerate(items, 1):
        problem = problem_of(item)
        steps = list(item["learner_attempt"])
        t0 = time.perf_counter()
        v = verify_steps(steps, problem)
        latency["verify"].append(time.perf_counter() - t0)

        llm_type: str | None = None
        llm_valid: bool | None = None
        overridden: bool | None = None
        explanation: str | None = None
        hint: str | None = None
        if reviewer is not None:
            t0 = time.perf_counter()
            try:
                r = reviewer.review(ReviewInput(problem, steps, v, item["concept_id"]))
                llm_valid, overridden = True, r.overridden
                llm_type = r.error_type.value if r.error_type else None
                explanation, hint = r.explanation, r.hint
            except ReviewUnavailable:
                llm_valid = False
            latency["llm"].append(time.perf_counter() - t0)
            print(f"  [{n}/{len(items)}] {item['id']}", file=sys.stderr)

        out.append(
            m.ItemOutcome(
                id=item["id"],
                concept_id=item["concept_id"],
                expected_correct=bool(item["expected_correct"]),
                expected_first_error=item.get("first_error_step"),
                expected_error_type=item.get("error_type"),
                overall=v.overall.value,
                first_error=v.first_error_step,
                step_verdicts=tuple(s.verdict.value for s in v.steps),
                llm_error_type=llm_type,
                llm_valid=llm_valid,
                llm_overridden=overridden,
                llm_explanation=explanation,
                llm_hint=hint,
            )
        )
    return out


def run_image(items: list[dict[str, Any]], latency: dict[str, list[float]]) -> dict[str, Any]:
    """OCR each labelled item that has a handwriting PNG; score lines against learner_attempt."""
    images = REPO / "datasets" / "handwriting_samples"
    todo = [(i, images / f"{i['id']}.png") for i in items]
    todo = [(i, p) for i, p in todo if p.exists()]
    if not todo:
        return {"skipped": f"no PNGs in {images.relative_to(REPO)} matching labelled item ids"}
    try:
        from app.services.recognition.service import recognize_region
    except ImportError as exc:  # pragma: no cover - depends on optional ML deps
        return {"skipped": f"recognition unavailable ({exc})"}

    from app.schemas.common import BBox

    pairs: list[tuple[str, str]] = []
    equivalent = 0
    conf_ok: list[tuple[float, bool]] = []
    missing_lines = 0
    for item, png in todo:
        t0 = time.perf_counter()
        try:
            lines = recognize_region(png.read_bytes(), BBox(x=0, y=0, w=1, h=1))
        except Exception as exc:  # one bad image must not stop the run
            print(f"  {item['id']}: recognition failed ({type(exc).__name__})", file=sys.stderr)
            missing_lines += len(item["learner_attempt"])
            continue
        latency["ocr"].append(time.perf_counter() - t0)
        gold = list(item["learner_attempt"])
        missing_lines += max(0, len(gold) - len(lines))
        for g, line in zip(gold, lines, strict=False):
            pairs.append((g, line.latex))
            same = verify_steps([g, line.latex], None).steps[-1].verdict.value == "supported"
            equivalent += same
            conf_ok.append((line.confidence, same))
    scored = len(pairs) + missing_lines
    return {
        "images": len(todo),
        "lines_scored": scored,
        "exact_match": m.ratio(sum(m.normalize_for_match(g) == m.normalize_for_match(p) for g, p in pairs), scored),
        "sympy_equivalent_match": m.ratio(equivalent, scored),
        "threshold": m.tune_threshold(conf_ok),
    }


def summarize(items: list[m.ItemOutcome]) -> dict[str, Any]:
    by_concept: dict[str, list[m.ItemOutcome]] = {}
    for i in items:
        by_concept.setdefault(i.concept_id, []).append(i)
    return {
        "items": len(items),
        "with_error": sum(i.expected_first_error is not None for i in items),
        "first_error_accuracy": m.first_error_accuracy(items),
        "incorrect_precision": m.incorrect_precision(items),
        "incorrect_recall": m.incorrect_recall(items),
        "false_incorrect_items": m.false_incorrect(items),
        "steps_wrongly_blamed": m.step_false_incorrect(items),
        "correct_confirmed": m.correct_accuracy(items),
        "inconclusive_rate": m.inconclusive_rate(items),
        "step_inconclusive_rate": m.step_inconclusive_rate(items),
        "schema_valid_rate": m.schema_valid_rate(items),
        "override_rate": m.override_rate(items),
        "error_type_accuracy": m.error_type_accuracy(items),
        "confusion_matrix": m.confusion_matrix(items),
        "per_concept": {
            c: {
                "items": len(v),
                "first_error_accuracy": m.first_error_accuracy(v),
                "incorrect_precision": m.incorrect_precision(v),
                "inconclusive_rate": m.inconclusive_rate(v),
            }
            for c, v in sorted(by_concept.items())
        },
    }


def fmt(v: Any) -> str:
    if v is None:
        return "not measured"
    if isinstance(v, float):
        return f"{v:.1%}" if 0 <= v <= 1 else f"{v:.3f}"
    return str(v)


def secs(v: float | None) -> str:
    return "—" if v is None else f"{v * 1000:.0f} ms" if v < 1 else f"{v:.1f} s"


def render_md(report: dict[str, Any]) -> str:
    s = report["summary"]
    lines = [
        f"# Evaluation report — {report['date']} — {report['label']}",
        "",
        f"Dataset: `{report['dataset']}` ({s['items']} items, {s['with_error']} with a step error). "
        f"Verifier: `{report['verifier_version']}`. LLM: {report['llm'] or 'not run'}"
        + (f" (prompt `{report['prompt_version']}`)" if report.get("prompt_version") else "")
        + ".",
        "",
    ]
    if report.get("llm_note"):
        lines += [f"> LLM metrics not measured: {report['llm_note']}.", ""]
    lines += [
        "## Verification (SymPy decides)",
        "",
        "| Metric | Value |",
        "|---|---|",
        f"| First-error localization accuracy | {fmt(s['first_error_accuracy'])} |",
        f"| Precision of `incorrect` (must be ~100%) | {fmt(s['incorrect_precision'])} |",
        f"| Recall of `incorrect` | {fmt(s['incorrect_recall'])} |",
        f"| Correct solutions fully confirmed | {fmt(s['correct_confirmed'])} |",
        f"| Inconclusive rate (items) | {fmt(s['inconclusive_rate'])} |",
        f"| Inconclusive rate (steps) | {fmt(s['step_inconclusive_rate'])} |",
        f"| Steps marked incorrect away from the labelled error | {s['steps_wrongly_blamed']} |",
        "",
        "False `incorrect` on a correct solution: "
        + (", ".join(f"`{x}`" for x in s["false_incorrect_items"]) or "**none**")
        + ".",
        "",
        "### Per concept",
        "",
        "| Concept | Items | First-error acc. | `incorrect` precision | Inconclusive |",
        "|---|---|---|---|---|",
    ]
    for c, v in s["per_concept"].items():
        lines.append(
            f"| {c} | {v['items']} | {fmt(v['first_error_accuracy'])} | {fmt(v['incorrect_precision'])} "
            f"| {fmt(v['inconclusive_rate'])} |"
        )
    lines += [
        "",
        "## LLM reviewer",
        "",
        "| Metric | Value |",
        "|---|---|",
        f"| Schema-valid rate (after one retry) | {fmt(s['schema_valid_rate'])} |",
        f"| Override rate (LLM disagreed with SymPy) | {fmt(s['override_rate'])} |",
        f"| Error-type accuracy | {fmt(s['error_type_accuracy'])} |",
        "",
    ]
    if s["confusion_matrix"]:
        labels = sorted({p for row in s["confusion_matrix"].values() for p in row})
        lines += [
            "Confusion matrix (rows = label, columns = LLM):",
            "",
            "| label \\ predicted | " + " | ".join(labels) + " |",
            "|---|" + "---|" * len(labels),
        ]
        for label, row in s["confusion_matrix"].items():
            lines.append(f"| {label} | " + " | ".join(str(row.get(p, 0)) for p in labels) + " |")
        lines.append("")
    img = report.get("image")
    lines += ["## Recognition (image mode)", ""]
    if not img:
        lines += ["Not run (use `--mode image`).", ""]
    elif "skipped" in img:
        lines += [f"Not measured: {img['skipped']}.", ""]
    else:
        t = img["threshold"]
        lines += [
            "| Metric | Value |",
            "|---|---|",
            f"| Images / lines scored | {img['images']} / {img['lines_scored']} |",
            f"| Exact match (normalized) | {fmt(img['exact_match'])} |",
            f"| SymPy-equivalent match | {fmt(img['sympy_equivalent_match'])} |",
            f"| Suggested `OCR_CONFIDENCE_THRESHOLD` | {fmt(t['threshold'])} |",
            f"| Lines that would ask for confirmation | {fmt(t['confirm_rate'])} |",
            "",
        ]
    lines += ["## Latency", "", "| Stage | n | p50 | p95 |", "|---|---|---|---|"]
    for stage, v in report["latency"].items():
        if v["n"]:
            lines.append(f"| {stage} | {int(v['n'])} | {secs(v['p50'])} | {secs(v['p95'])} |")
    ratings = report.get("ratings")
    lines += ["", "## Human ratings (1-3)", ""]
    if ratings:
        lines += [
            f"{ratings['ratings']} ratings from {ratings['raters']} raters: validity "
            f"{fmt(ratings['validity_mean'])}, hint usefulness {fmt(ratings['hint_usefulness_mean'])}.",
        ]
    else:
        lines += ["Not collected yet (pass `--ratings ratings.csv`: item_id,rater,validity,hint_usefulness)."]
    lines += ["", f"_Generated by `ai/evaluation/run_eval.py` in {report['seconds']:.1f} s._", ""]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dataset", type=Path, default=REPO / "datasets" / "labelled_solutions")
    ap.add_argument("--mode", choices=["typed", "image"], default="typed")
    ap.add_argument("--model", help="Ollama model for the reviewer (omit for SymPy-only)")
    ap.add_argument("--ollama-url", default="http://localhost:11434")
    ap.add_argument("--timeout", type=float, default=120.0)
    ap.add_argument("--ratings", type=Path, help="CSV of human ratings to aggregate")
    ap.add_argument("--limit", type=int, help="only the first N items (smoke runs)")
    ap.add_argument("--out-dir", type=Path, default=HERE / "reports")
    args = ap.parse_args(argv)

    started = time.perf_counter()
    items = load_items(args.dataset)[: args.limit]
    latency: dict[str, list[float]] = {"verify": [], "llm": [], "ocr": []}

    reviewer, llm_note = (None, None)
    if args.model:
        reviewer, llm_note = make_reviewer(args.model, args.ollama_url.rstrip("/"), args.timeout)
        if llm_note:
            print(f"warning: {llm_note}; LLM metrics will be 'not measured'", file=sys.stderr)

    outcomes = run_typed(items, reviewer, latency)
    image = run_image(items, latency) if args.mode == "image" else None

    from app.services.verification.verifier import VERIFIER_VERSION

    label = (args.model if reviewer else "sympy-only").replace(":", "-").replace("/", "-")
    report: dict[str, Any] = {
        "date": date.today().isoformat(),
        "label": label + ("-image" if args.mode == "image" else ""),
        "dataset": args.dataset.resolve().relative_to(REPO).as_posix()
        if args.dataset.resolve().is_relative_to(REPO)
        else str(args.dataset),
        "verifier_version": VERIFIER_VERSION,
        "llm": args.model if reviewer else None,
        "prompt_version": PROMPT_VERSION if reviewer else None,
        "llm_note": llm_note,
        "summary": summarize(outcomes),
        "image": image,
        "latency": m.latency_summary(latency),
        "ratings": m.aggregate_ratings(args.ratings) if args.ratings else None,
        "items": [asdict(o) for o in outcomes],
    }
    report["seconds"] = time.perf_counter() - started

    args.out_dir.mkdir(parents=True, exist_ok=True)
    # Not Path.with_suffix: a label like "qwen2.5-3b" would lose ".5-3b" as if it were an extension.
    stem = f"{report['date']}-{report['label']}"
    md_path, json_path = args.out_dir / f"{stem}.md", args.out_dir / f"{stem}.json"
    json_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    md_path.write_text(render_md(report), encoding="utf-8")
    s = report["summary"]
    print(
        f"{s['items']} items | first-error {fmt(s['first_error_accuracy'])} | incorrect precision "
        f"{fmt(s['incorrect_precision'])} | inconclusive {fmt(s['inconclusive_rate'])} | "
        f"schema-valid {fmt(s['schema_valid_rate'])}"
    )
    print(f"wrote {md_path.relative_to(REPO) if md_path.is_relative_to(REPO) else md_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
