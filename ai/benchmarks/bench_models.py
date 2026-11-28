"""T5.1 local model benchmark: run the reviewer prompt on 15 fixed items against each Ollama model.

    python ai/benchmarks/bench_models.py [--models qwen2.5:3b qwen2.5:7b llama3.2:3b phi3.5]
                                         [--ollama-url http://localhost:11434] [--json out.json]

Per model it reports: JSON-valid rate (first reply), schema-valid rate (after the one retry), agreement with the
SymPy first_error_step/status (LLM not overridden), median latency per item, tokens/s and the memory Ollama reports
for the loaded model (/api/ps). Copy the table into ai/benchmarks/results.md.

It uses the production path (backend Reviewer + prompt + validation), so run it with the backend virtualenv.
If Ollama is not reachable it says so and exits with code 2. It never invents numbers.
"""

import argparse
import json
import statistics
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx

BACKEND = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(BACKEND))

from app.services.jobs.stages import ProblemContext, ReviewInput, ReviewUnavailable
from app.services.reasoning.reviewer import PROMPT_VERSION, Reviewer
from app.services.verification import verify_steps

DEFAULT_MODELS = ["qwen2.5:3b", "qwen2.5:7b", "llama3.2:3b", "phi3.5"]

# (problem id, concept, prompt, expected answer, learner steps): a mix of correct and incorrect solutions.
ITEMS: list[tuple[str, str, str, str | None, list[str]]] = [
    ("lin-c-001", "linear_equations", "3x+5=20", "x=5", ["3x+5=20", "3x=15", "x=5"]),
    (
        "lin-e-001",
        "linear_equations",
        "2(x-3)=10",
        "x=8",
        ["2(x-3)=10", "2x-3=10", "2x=13", "x=6.5"],
    ),
    ("lin-e-002", "linear_equations", "2x=10", "x=5", ["2x=10", "x=4"]),
    (
        "lin-c-002",
        "linear_equations",
        "5x-7=3x+9",
        "x=8",
        ["5x-7=3x+9", "2x-7=9", "2x=16", "x=8"],
    ),
    ("lin-e-003", "linear_equations", "4-x=10", "x=-6", ["4-x=10", "-x=6", "x=6"]),
    (
        "lin-c-003",
        "linear_equations",
        "\\frac{x}{3}+2=5",
        "x=9",
        ["\\frac{x}{3}+2=5", "\\frac{x}{3}=3", "x=9"],
    ),
    (
        "quad-c-001",
        "quadratics",
        "x^2-5x+6=0",
        None,
        ["x^2-5x+6=0", "(x-2)(x-3)=0", "x=2, x=3"],
    ),
    (
        "quad-e-001",
        "quadratics",
        "x^2-5x+6=0",
        None,
        ["x^2-5x+6=0", "(x-2)(x-4)=0", "x=2, x=4"],
    ),
    ("quad-e-002", "quadratics", "x^2=3x", None, ["x^2=3x", "x=3"]),
    (
        "quad-c-002",
        "quadratics",
        "x^2-9=0",
        None,
        ["x^2-9=0", "(x-3)(x+3)=0", "x=3, x=-3"],
    ),
    ("ineq-e-001", "linear_inequalities", "-2x>4", None, ["-2x>4", "x>-2"]),
    (
        "ineq-c-001",
        "linear_inequalities",
        "3x-1\\le 8",
        None,
        ["3x-1\\le 8", "3x\\le 9", "x\\le 3"],
    ),
    (
        "expr-c-001",
        "expanding_brackets",
        "2(x+1)+3x",
        "5x+2",
        ["2(x+1)+3x", "2x+2+3x", "5x+2"],
    ),
    (
        "expr-e-001",
        "expanding_brackets",
        "3(x-2)-x",
        "2x-6",
        ["3(x-2)-x", "3x-2-x", "2x-2"],
    ),
    (
        "frac-e-001",
        "fractions",
        "\\frac{1}{2}+\\frac{1}{3}",
        "\\frac{5}{6}",
        ["\\frac{1}{2}+\\frac{1}{3}", "\\frac{2}{5}"],
    ),
]


@dataclass
class Recorder:
    """A Reviewer client that talks to Ollama directly so it can record per-call stats."""

    url: str
    model: str
    timeout: float
    latencies: list[float] = field(default_factory=list)
    tokens_per_s: list[float] = field(default_factory=list)
    first_reply_json_ok: list[bool] = field(default_factory=list)
    _first: bool = True

    def health(self) -> bool:
        return True

    def chat(self, messages: list[dict[str, str]]) -> str:
        t0 = time.perf_counter()
        r = httpx.post(
            f"{self.url}/api/chat",
            json={
                "model": self.model,
                "messages": messages,
                "stream": False,
                "format": "json",
                "options": {"temperature": 0.2},
            },
            timeout=self.timeout,
        )
        r.raise_for_status()
        body = r.json()
        self.latencies.append(time.perf_counter() - t0)
        if body.get("eval_duration"):
            self.tokens_per_s.append(
                body.get("eval_count", 0) / (body["eval_duration"] / 1e9)
            )
        content = str(body["message"]["content"])
        if self._first:
            try:
                json.loads(content)
                self.first_reply_json_ok.append(True)
            except ValueError:
                self.first_reply_json_ok.append(False)
            self._first = False
        return content


def _model_memory_gb(url: str, model: str) -> float | None:
    try:
        for m in httpx.get(f"{url}/api/ps", timeout=5).json().get("models", []):
            if m.get("name") == model:
                return round(m.get("size", 0) / 1e9, 2)
    except (httpx.HTTPError, ValueError):
        pass
    return None


def bench(url: str, model: str, timeout: float) -> dict[str, Any]:
    rec = Recorder(url, model, timeout)
    reviewer = Reviewer(rec)
    schema_ok = agree = 0
    item_seconds: list[float] = []
    for pid, concept, prompt, expected, steps in ITEMS:
        problem = ProblemContext(pid, concept, prompt, expected)
        data = ReviewInput(problem, steps, verify_steps(steps, problem), concept)
        rec._first = True
        t0 = time.perf_counter()
        try:
            result = reviewer.review(data)
            schema_ok += 1
            agree += not result.overridden
        except ReviewUnavailable as exc:
            print(
                f"  {pid}: {'invalid output' if exc.invalid_output else exc}",
                file=sys.stderr,
            )
        except httpx.HTTPError as exc:
            print(f"  {pid}: HTTP error {type(exc).__name__}", file=sys.stderr)
        item_seconds.append(time.perf_counter() - t0)
    n = len(ITEMS)
    return {
        "model": model,
        "prompt_version": PROMPT_VERSION,
        "items": n,
        "json_valid_rate": round(sum(rec.first_reply_json_ok) / n, 3),
        "schema_valid_rate": round(schema_ok / n, 3),
        "sympy_agreement_rate": round(agree / n, 3),
        "median_latency_s": round(statistics.median(item_seconds), 2),
        "tokens_per_s": round(statistics.median(rec.tokens_per_s), 1)
        if rec.tokens_per_s
        else None,
        "model_memory_gb": _model_memory_gb(url, model),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", nargs="+", default=DEFAULT_MODELS)
    ap.add_argument("--ollama-url", default="http://localhost:11434")
    ap.add_argument("--timeout", type=float, default=120.0)
    ap.add_argument("--json", type=Path, help="also write the results to this file")
    args = ap.parse_args()
    url = args.ollama_url.rstrip("/")

    try:
        pulled = {
            m["name"]
            for m in httpx.get(f"{url}/api/tags", timeout=3).json().get("models", [])
        }
    except (httpx.HTTPError, ValueError) as exc:
        print(
            f"Ollama is not reachable at {url} ({type(exc).__name__}). Nothing was benchmarked."
        )
        print("Install Ollama, `ollama pull qwen2.5:3b`, and run this again.")
        return 2

    rows = []
    for model in args.models:
        if model not in pulled:
            print(f"skip {model}: not pulled (ollama pull {model})", file=sys.stderr)
            continue
        print(f"benchmarking {model} on {len(ITEMS)} items...", file=sys.stderr)
        rows.append(bench(url, model, args.timeout))
    if not rows:
        print("No candidate model is pulled. Nothing was benchmarked.")
        return 2

    cols = list(rows[0])
    print("| " + " | ".join(cols) + " |")
    print("|" + "---|" * len(cols))
    for row in rows:
        print(
            "| "
            + " | ".join("" if row[c] is None else str(row[c]) for c in cols)
            + " |"
        )
    if args.json:
        args.json.write_text(json.dumps(rows, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
