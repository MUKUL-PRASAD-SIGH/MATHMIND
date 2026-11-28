"""T7.6 backend performance: per-stage latency (p50/p95 over N runs), peak RSS, and a concurrency check.

    # from the repo root, with the backend virtualenv
    python ai/benchmarks/perf_bench.py                       # verify stage, 30 runs, in-process
    python ai/benchmarks/perf_bench.py --ollama-url http://localhost:11434 --model qwen2.5:3b --llm-runs 5
    python ai/benchmarks/perf_bench.py --api http://localhost:8000 --concurrent 5   # load check on a running API

Prints a Markdown section to paste into ai/benchmarks/performance.md and writes --json if given.
Stages that cannot run (no Ollama, no pix2tex, no API) are reported as "not measured", never estimated.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import platform
import sys
import threading
import time
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
sys.path.insert(0, str(REPO / "backend"))
sys.path.insert(0, str(REPO / "ai" / "evaluation"))

import httpx  # noqa: E402
import psutil  # noqa: E402
from metrics import percentile  # noqa: E402

from app.services.jobs.stages import ProblemContext, ReviewInput, ReviewUnavailable  # noqa: E402
from app.services.verification import verify_steps  # noqa: E402

CASES: list[tuple[ProblemContext, list[str]]] = [
    (ProblemContext("lin-r2b", "linear_equations", "2(x-3)=10", "x=8"), ["2(x-3)=10", "2x-3=10", "2x=13", "x=6.5"]),
    (ProblemContext("lin-r2a", "linear_equations", "3x+5=20", "x=5"), ["3x+5=20", "3x=15", "x=5"]),
    (ProblemContext("quad-1", "quadratic_equations", "x^2-5x+6=0", None), ["x^2-5x+6=0", "(x-2)(x-3)=0", "x=2, x=3"]),
    (
        ProblemContext("frac-1", "fractions", "\\frac{1}{2}+\\frac{1}{3}", None),
        ["\\frac{1}{2}+\\frac{1}{3}", "\\frac{5}{6}"],
    ),
]


class PeakRss:
    """Samples this process's RSS every 50 ms in a thread; .peak_mb after stop()."""

    def __init__(self) -> None:
        self.proc = psutil.Process(os.getpid())
        self.peak = self.proc.memory_info().rss
        self._stop = threading.Event()
        self._t = threading.Thread(target=self._run, daemon=True)

    def _run(self) -> None:
        while not self._stop.is_set():
            self.peak = max(self.peak, self.proc.memory_info().rss)
            time.sleep(0.05)

    def __enter__(self) -> PeakRss:
        self._t.start()
        return self

    def __exit__(self, *exc: object) -> None:
        self._stop.set()
        self._t.join()

    @property
    def peak_mb(self) -> float:
        return round(self.peak / 2**20, 1)


def summarize(values: list[float]) -> dict[str, Any]:
    return {"n": len(values), "p50_s": percentile(values, 50), "p95_s": percentile(values, 95)}


def bench_verify(runs: int) -> dict[str, Any]:
    verify_steps(CASES[0][1], CASES[0][0])  # warm-up: first SymPy parse loads the grammar
    times: list[float] = []
    for i in range(runs):
        problem, steps = CASES[i % len(CASES)]
        t0 = time.perf_counter()
        verify_steps(steps, problem)
        times.append(time.perf_counter() - t0)
    return summarize(times)


def bench_llm(url: str, model: str, runs: int, timeout: float) -> dict[str, Any]:
    from app.services.reasoning.client import OllamaClient
    from app.services.reasoning.reviewer import Reviewer

    client = OllamaClient(url, model, timeout=timeout)
    if not client.health():
        return {"skipped": f"Ollama at {url} is not running or lacks {model}"}
    reviewer = Reviewer(client)
    times: list[float] = []
    invalid = 0
    for i in range(runs):
        problem, steps = CASES[i % len(CASES)]
        data = ReviewInput(problem, steps, verify_steps(steps, problem), problem.concept_id)
        t0 = time.perf_counter()
        try:
            reviewer.review(data)
        except ReviewUnavailable:
            invalid += 1
        times.append(time.perf_counter() - t0)
    ollama_mb = None
    try:
        for m in httpx.get(f"{url}/api/ps", timeout=5).json().get("models", []):
            if m.get("name") == model:
                ollama_mb = round(m.get("size", 0) / 2**20)
    except (httpx.HTTPError, ValueError):
        pass
    return {**summarize(times), "invalid_or_unavailable": invalid, "ollama_model_mb": ollama_mb}


def bench_ocr(runs: int) -> dict[str, Any]:
    try:
        from PIL import Image, ImageDraw

        from app.schemas.common import BBox
        from app.services.recognition.service import recognize_region
    except ImportError as exc:
        return {"skipped": f"recognition unavailable ({exc})"}
    img = Image.new("L", (480, 120), 255)
    ImageDraw.Draw(img).text((10, 40), "2x + 3 = 7", fill=0)
    from io import BytesIO

    buf = BytesIO()
    img.save(buf, format="PNG")
    png = buf.getvalue()
    times: list[float] = []
    try:
        for _ in range(runs):
            t0 = time.perf_counter()
            recognize_region(png, BBox(x=0, y=0, w=1, h=1))
            times.append(time.perf_counter() - t0)
    except Exception as exc:  # pix2tex missing at call time
        return {"skipped": f"recognition failed ({type(exc).__name__}: {exc})"}
    return summarize(times)


async def bench_concurrency(api: str, n: int, timeout: float) -> dict[str, Any]:
    steps = [{"latex": s} for s in CASES[0][1]]
    async with httpx.AsyncClient(base_url=api.rstrip("/"), timeout=30) as http:
        try:
            await http.get("/api/v1/health")
        except httpx.HTTPError as exc:
            return {"skipped": f"API at {api} not reachable ({type(exc).__name__})"}

        async def one() -> tuple[bool, float, str]:
            t0 = time.perf_counter()
            r = await http.post("/api/v1/submissions/typed", json={"steps": steps})
            if r.status_code != 202:
                return False, time.perf_counter() - t0, f"HTTP {r.status_code}"
            sid = r.json()["submission_id"]
            while time.perf_counter() - t0 < timeout:
                st = (await http.get(f"/api/v1/submissions/{sid}/status")).json()["status"]
                if st in ("completed", "completed_without_ai"):
                    return True, time.perf_counter() - t0, st
                if st.startswith("failed"):
                    return False, time.perf_counter() - t0, st
                await asyncio.sleep(0.25)
            return False, time.perf_counter() - t0, "timeout"

        results = await asyncio.gather(*(one() for _ in range(n)))
    return {
        "submissions": n,
        "errors": sum(not ok for ok, _, _ in results),
        "end_states": sorted({s for _, _, s in results}),
        **summarize([t for _, t, _ in results]),
    }


def hardware() -> dict[str, Any]:
    return {
        "cpu": platform.processor() or platform.machine(),
        "logical_cpus": psutil.cpu_count(),
        "ram_gb": round(psutil.virtual_memory().total / 2**30, 1),
        "os": platform.platform(),
        "python": platform.python_version(),
    }


def fmt_s(v: float | None) -> str:
    if v is None:
        return "—"
    return f"{v * 1000:.0f} ms" if v < 1 else f"{v:.1f} s"


def render(r: dict[str, Any]) -> str:
    out = ["| Stage | Runs | p50 | p95 | Notes |", "|---|---|---|---|---|"]
    for name in ("verify", "llm", "ocr", "concurrent"):
        v = r.get(name)
        if v is None:
            continue
        if "skipped" in v:
            out.append(f"| {name} | — | — | — | not measured: {v['skipped']} |")
            continue
        note = ""
        if name == "llm":
            note = f"{v['invalid_or_unavailable']} invalid/unavailable; model in Ollama ≈ {v['ollama_model_mb']} MB"
        if name == "concurrent":
            note = f"{v['submissions']} at once, {v['errors']} errors, end states {', '.join(v['end_states'])}"
        out.append(f"| {name} | {v['n']} | {fmt_s(v['p50_s'])} | {fmt_s(v['p95_s'])} | {note} |")
    out.append("")
    out.append(f"Peak RSS of the benchmark process (backend code in-process): **{r['peak_rss_mb']} MB**.")
    return "\n".join(out)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--runs", type=int, default=30)
    ap.add_argument("--ollama-url")
    ap.add_argument("--model", default="qwen2.5:3b")
    ap.add_argument("--llm-runs", type=int, default=5)
    ap.add_argument("--ocr", action="store_true", help="also time pix2tex (needs requirements-ml.txt)")
    ap.add_argument("--api", help="running API base URL for the concurrency check")
    ap.add_argument("--concurrent", type=int, default=5)
    ap.add_argument("--timeout", type=float, default=180.0)
    ap.add_argument("--json", type=Path)
    args = ap.parse_args(argv)

    result: dict[str, Any] = {"hardware": hardware()}
    with PeakRss() as rss:
        result["verify"] = bench_verify(args.runs)
        if args.ollama_url:
            result["llm"] = bench_llm(args.ollama_url.rstrip("/"), args.model, args.llm_runs, args.timeout)
        if args.ocr:
            result["ocr"] = bench_ocr(min(args.runs, 10))
    result["peak_rss_mb"] = rss.peak_mb
    if args.api:
        result["concurrent"] = asyncio.run(bench_concurrency(args.api, args.concurrent, args.timeout))

    hw = result["hardware"]
    print(f"Hardware: {hw['cpu']}, {hw['logical_cpus']} logical CPUs, {hw['ram_gb']} GB RAM, {hw['os']}\n")
    print(render(result))
    if args.json:
        args.json.write_text(json.dumps(result, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
