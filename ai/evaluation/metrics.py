"""Pure metric functions for the T7.2 evaluation harness (spec §14.2). No I/O, no model calls.

Each function takes plain values so it can be unit-tested on tiny fixtures (test_metrics.py).
A metric that has no data returns None, and the report prints "not measured", never a made-up number.
"""

from __future__ import annotations

import csv
import math
import re
from collections import Counter
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ItemOutcome:
    """What the pipeline concluded for one labelled item, next to its labels."""

    id: str
    concept_id: str
    expected_correct: bool
    expected_first_error: int | None
    expected_error_type: str | None
    overall: str  # SymPy: correct | incorrect | inconclusive
    first_error: int | None  # SymPy first_error_step
    step_verdicts: tuple[str, ...]
    llm_error_type: str | None = None
    llm_valid: bool | None = None  # None = LLM not run for this item
    llm_overridden: bool | None = None
    llm_explanation: str | None = None  # kept for human rating (T7.2 step 4)
    llm_hint: str | None = None


def ratio(num: int, den: int) -> float | None:
    return None if den == 0 else num / den


# --- verification -------------------------------------------------------------------------------


def first_error_accuracy(items: Sequence[ItemOutcome]) -> float | None:
    """Share of items with a labelled first error whose SymPy first_error_step matches it exactly."""
    labelled = [i for i in items if i.expected_first_error is not None]
    return ratio(sum(i.first_error == i.expected_first_error for i in labelled), len(labelled))


def incorrect_precision(items: Sequence[ItemOutcome]) -> float | None:
    """Of the items SymPy called `incorrect`, how many really contain an error. Must be ~1.0."""
    flagged = [i for i in items if i.overall == "incorrect"]
    return ratio(sum(not i.expected_correct for i in flagged), len(flagged))


def false_incorrect(items: Sequence[ItemOutcome]) -> list[str]:
    """Ids of correct solutions that were called incorrect: the worst failure. Listed in the report."""
    return [i.id for i in items if i.expected_correct and i.overall == "incorrect"]


def step_false_incorrect(items: Sequence[ItemOutcome]) -> int:
    """Steps marked incorrect at a position other than the labelled first error (wrongly blamed steps)."""
    n = 0
    for i in items:
        for k, v in enumerate(i.step_verdicts, start=1):
            if v == "incorrect" and k != i.expected_first_error:
                n += 1
    return n


def incorrect_recall(items: Sequence[ItemOutcome]) -> float | None:
    """Of the items that contain a step error, how many SymPy called incorrect."""
    erroneous = [i for i in items if i.expected_first_error is not None]
    return ratio(sum(i.overall == "incorrect" for i in erroneous), len(erroneous))


def inconclusive_rate(items: Sequence[ItemOutcome]) -> float | None:
    """Share of items whose overall verdict is inconclusive."""
    return ratio(sum(i.overall == "inconclusive" for i in items), len(items))


def step_inconclusive_rate(items: Sequence[ItemOutcome]) -> float | None:
    steps = [v for i in items for v in i.step_verdicts]
    return ratio(sum(v == "inconclusive" for v in steps), len(steps))


def correct_accuracy(items: Sequence[ItemOutcome]) -> float | None:
    """Share of correct solutions that SymPy fully confirmed (overall == correct)."""
    good = [i for i in items if i.expected_correct]
    return ratio(sum(i.overall == "correct" for i in good), len(good))


# --- LLM ----------------------------------------------------------------------------------------


def error_type_accuracy(items: Sequence[ItemOutcome]) -> float | None:
    """LLM error_type vs label, over items with a labelled error type and a valid LLM reply."""
    scored = [i for i in items if i.expected_error_type and i.llm_valid]
    return ratio(sum(i.llm_error_type == i.expected_error_type for i in scored), len(scored))


def confusion_matrix(items: Sequence[ItemOutcome]) -> dict[str, dict[str, int]]:
    """label -> predicted -> count, for items with a labelled error type and a valid LLM reply."""
    m: dict[str, Counter[str]] = {}
    for i in items:
        if i.expected_error_type and i.llm_valid:
            m.setdefault(i.expected_error_type, Counter())[i.llm_error_type or "none"] += 1
    return {k: dict(v) for k, v in sorted(m.items())}


def schema_valid_rate(items: Sequence[ItemOutcome]) -> float | None:
    ran = [i for i in items if i.llm_valid is not None]
    return ratio(sum(bool(i.llm_valid) for i in ran), len(ran))


def override_rate(items: Sequence[ItemOutcome]) -> float | None:
    """Share of valid LLM replies whose status/first error disagreed with SymPy and were overwritten."""
    valid = [i for i in items if i.llm_valid]
    return ratio(sum(bool(i.llm_overridden) for i in valid), len(valid))


# --- latency ------------------------------------------------------------------------------------


def percentile(values: Sequence[float], p: float) -> float | None:
    """Nearest-rank percentile (p in 0..100). None for no data."""
    if not values:
        return None
    s = sorted(values)
    k = max(1, math.ceil(p / 100 * len(s)))
    return s[k - 1]


def latency_summary(per_stage: dict[str, list[float]]) -> dict[str, dict[str, float | None]]:
    return {
        stage: {"n": float(len(v)), "p50": percentile(v, 50), "p95": percentile(v, 95)}
        for stage, v in per_stage.items()
    }


# --- recognition --------------------------------------------------------------------------------

_SPACE = re.compile(r"\s+|\\[,;:! ]|\\left|\\right")


def normalize_for_match(latex: str) -> str:
    """Loose textual normal form for exact-match scoring: no spaces/spacing commands, unified symbols."""
    s = _SPACE.sub("", latex)
    s = s.replace("\\cdot", "*").replace("\\times", "*").replace("\\dfrac", "\\frac")
    s = s.replace("{", "").replace("}", "")
    return s


def exact_match_rate(pairs: Iterable[tuple[str, str]]) -> float | None:
    """(gold, predicted) line pairs; share equal after normalize_for_match."""
    pairs = list(pairs)
    return ratio(sum(normalize_for_match(g) == normalize_for_match(p) for g, p in pairs), len(pairs))


def tune_threshold(lines: Sequence[tuple[float, bool]]) -> dict[str, float | None]:
    """Pick the OCR confidence threshold from (confidence, read_correctly) per line.

    The threshold is the lowest value such that every line at or above it was read correctly, so a
    misread line can never skip confirmation (no false "incorrect" from OCR). Returns the threshold
    and the share of lines that would ask the learner to confirm.
    """
    if not lines:
        return {"threshold": None, "confirm_rate": None}
    wrong = [c for c, ok in lines if not ok]
    if not wrong:
        t = 0.0
    else:
        worst = max(wrong)
        above = [c for c, _ in lines if c > worst]
        # The next observed confidence above the most confident misread, else just above it.
        t = min(above) if above else math.ceil((worst + 1e-4) * 1e4) / 1e4
    asked = sum(c < t for c, _ in lines)
    return {"threshold": t, "confirm_rate": asked / len(lines)}


# --- human ratings ------------------------------------------------------------------------------


def aggregate_ratings(path: Path) -> dict[str, float | int | None]:
    """CSV with columns item_id,rater,validity,hint_usefulness (1-3). Means per dimension."""
    validity: list[int] = []
    usefulness: list[int] = []
    raters: set[str] = set()
    with path.open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            raters.add(row["rater"].strip())
            for key, bucket in (("validity", validity), ("hint_usefulness", usefulness)):
                value = row.get(key, "").strip()
                if value:
                    v = int(value)
                    if not 1 <= v <= 3:
                        raise ValueError(f"{key}={v} for {row['item_id']} is outside 1-3")
                    bucket.append(v)
    return {
        "ratings": len(validity),
        "raters": len(raters),
        "validity_mean": sum(validity) / len(validity) if validity else None,
        "hint_usefulness_mean": sum(usefulness) / len(usefulness) if usefulness else None,
    }
