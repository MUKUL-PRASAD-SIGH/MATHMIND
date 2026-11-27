"""T0.5 local AI toolchain smoke test: SymPy, pix2tex, Ollama -> PASS / FAIL / SKIP.

    python ai/benchmarks/smoke.py [--ollama-url http://localhost:11434] [--model qwen2.5:3b]

Missing optional tools (pix2tex, Ollama) are SKIP, not FAIL. Exit code is 1 only if something FAILs.
Run it with the backend virtualenv (it needs sympy + antlr4 + httpx + pillow).
"""

import argparse
import importlib.metadata
import importlib.util
import io
import platform
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SAMPLES = REPO / "datasets" / "handwriting_samples"


def check_sympy() -> tuple[str, str]:
    try:
        import sympy
        from sympy.parsing.latex import parse_latex

        t0 = time.perf_counter()
        result = parse_latex(r"\frac{2x+3}{5}=7")
        dt = time.perf_counter() - t0
        antlr = importlib.metadata.version("antlr4-python3-runtime")
        return (
            "PASS",
            f"sympy {sympy.__version__}, antlr4 {antlr}: {result} ({dt:.2f}s incl. parser load)",
        )
    except Exception as exc:  # noqa: BLE001 -- report any failure as FAIL
        return "FAIL", f"{type(exc).__name__}: {exc}"


def _printed_samples() -> list[tuple[str, bytes]]:
    from PIL import Image, ImageDraw, ImageFont

    out = []
    for text in ("3x + 5 = 20", "2(x - 3) = 10", "x = 5"):
        img = Image.new("RGB", (420, 90), "white")
        ImageDraw.Draw(img).text(
            (20, 20), text, fill="black", font=ImageFont.load_default(size=40)
        )
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        out.append((f"printed:{text}", buf.getvalue()))
    return out


def check_pix2tex() -> tuple[str, str]:
    if importlib.util.find_spec("pix2tex") is None:
        return (
            "SKIP",
            "pix2tex not installed (pip install -r backend/requirements-ml.txt)",
        )
    try:
        from PIL import Image
        from pix2tex.cli import LatexOCR

        t0 = time.perf_counter()
        model = LatexOCR()
        load = time.perf_counter() - t0
        samples = _printed_samples()
        samples += [
            (f"handwritten:{p.name}", p.read_bytes())
            for p in sorted(SAMPLES.glob("*.png"))[:3]
        ]
        lines = [
            f"pix2tex {importlib.metadata.version('pix2tex')}, model load {load:.1f}s"
        ]
        for name, data in samples:
            t0 = time.perf_counter()
            latex = model(Image.open(io.BytesIO(data)).convert("RGB"))
            lines.append(f"  {name} -> {latex!r} ({time.perf_counter() - t0:.2f}s)")
        return "PASS", "\n".join(lines)
    except Exception as exc:  # noqa: BLE001 -- report any failure as FAIL
        return "FAIL", f"{type(exc).__name__}: {exc}"


def check_ollama(url: str, model: str) -> tuple[str, str]:
    import httpx

    try:
        tags = httpx.get(f"{url}/api/tags", timeout=2.0)
        tags.raise_for_status()
    except httpx.HTTPError as exc:
        return (
            "SKIP",
            f"Ollama not reachable at {url} ({type(exc).__name__}); the app degrades to ai_status=unavailable",
        )
    names = [m.get("name") for m in tags.json().get("models", [])]
    if model not in names:
        return (
            "FAIL",
            f"Ollama is up but {model!r} is not pulled (have: {names}); run: ollama pull {model}",
        )
    try:
        t0 = time.perf_counter()
        r = httpx.post(
            f"{url}/api/generate",
            json={
                "model": model,
                "prompt": 'Reply with {"ok": true}',
                "stream": False,
                "format": "json",
            },
            timeout=120.0,
        )
        r.raise_for_status()
        body = r.json()
        dt = time.perf_counter() - t0
        tps = body.get("eval_count", 0) / max(1e-9, body.get("eval_duration", 0) / 1e9)
        return (
            "PASS",
            f"{model}: {body.get('response', '')!r} in {dt:.1f}s ({tps:.1f} tokens/s)",
        )
    except httpx.HTTPError as exc:
        return "FAIL", f"{type(exc).__name__}: {exc}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ollama-url", default="http://localhost:11434")
    ap.add_argument("--model", default="qwen2.5:3b")
    args = ap.parse_args()

    print(
        f"{platform.platform()} | Python {platform.python_version()} | {platform.processor()}"
    )
    results = {
        "sympy": check_sympy(),
        "pix2tex": check_pix2tex(),
        "ollama": check_ollama(args.ollama_url.rstrip("/"), args.model),
    }
    for name, (status, detail) in results.items():
        print(f"[{status}] {name}: {detail}")
    return 1 if any(status == "FAIL" for status, _ in results.values()) else 0


if __name__ == "__main__":
    raise SystemExit(main())
