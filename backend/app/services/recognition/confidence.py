"""OCR confidence proxy (T4.1). pix2tex reports no calibrated confidence, so we combine three signals:

* parse_ok  (weight 0.4): the LaTeX parses with ``parse_step``
* stability (weight 0.4): share of runs (original + augmentations) that agree after normalization
* sanity    (weight 0.2): penalties for unbalanced braces, repeated tokens, output too long for the crop

Anything below ``OCR_CONFIDENCE_THRESHOLD`` (default 0.75) goes to the learner for confirmation; an
unparseable line can score at most 0.6, so it is always confirmed before any verdict.
"""

import itertools
import re
from dataclasses import dataclass

from app.services.verification.normalize import normalize_latex
from app.services.verification.parse import UnparseableStep, parse_step

W_PARSE, W_STABILITY, W_SANITY = 0.4, 0.4, 0.2
_TOKEN = re.compile(r"\\[a-zA-Z]+|\S")


@dataclass(frozen=True)
class ConfidenceParts:
    parse_ok: float
    stability: float
    sanity: float

    @property
    def score(self) -> float:
        return round(W_PARSE * self.parse_ok + W_STABILITY * self.stability + W_SANITY * self.sanity, 3)


def canonical(latex: str) -> str:
    return re.sub(r"\s+", "", normalize_latex(latex))


def parse_ok(latex: str) -> float:
    try:
        parse_step(latex)
    except UnparseableStep:
        return 0.0
    return 1.0


def stability(main: str, variants: list[str]) -> float:
    runs = [main, *variants]
    ref = canonical(main)
    return sum(canonical(r) == ref for r in runs) / len(runs)


def _braces_balanced(latex: str) -> bool:
    depth = 0
    for ch in latex.replace(r"\{", "").replace(r"\}", ""):
        depth += {"{": 1, "}": -1}.get(ch, 0)
        if depth < 0:
            return False
    return depth == 0


def _max_repeat(tokens: list[str]) -> int:
    best = run = 1
    for a, b in itertools.pairwise(tokens):
        run = run + 1 if a == b else 1
        best = max(best, run)
    return best if tokens else 0


def sanity(latex: str, crop_w: int, crop_h: int) -> float:
    tokens = _TOKEN.findall(latex)
    if not tokens:
        return 0.0
    score = 1.0
    if not _braces_balanced(latex):
        score -= 0.5
    if _max_repeat(tokens) >= 4:
        score -= 0.3
    # A handwritten glyph is roughly as wide as ~0.6 x the line height; allow generous slack (LaTeX markup).
    expected_glyphs = max(1.0, crop_w / max(1.0, 0.6 * crop_h))
    if len(tokens) > 4 * expected_glyphs + 8:
        score -= 0.3
    return max(0.0, score)


def score_line(latex: str, variants: list[str], crop_w: int, crop_h: int) -> ConfidenceParts:
    if not latex.strip():
        return ConfidenceParts(0.0, 0.0, 0.0)
    return ConfidenceParts(parse_ok(latex), stability(latex, variants), sanity(latex, crop_w, crop_h))
