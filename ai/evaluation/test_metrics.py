# ruff: noqa: S101
"""Unit tests for the T7.2 metric functions on tiny fixtures.

cd backend && pytest ../ai/evaluation -q
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

import metrics as m


def item(
    id: str,
    *,
    correct: bool,
    first: int | None = None,
    overall: str = "correct",
    found: int | None = None,
    verdicts: tuple[str, ...] = ("supported",),
    label_type: str | None = None,
    llm_type: str | None = None,
    valid: bool | None = None,
    overridden: bool | None = None,
) -> m.ItemOutcome:
    return m.ItemOutcome(
        id=id,
        concept_id="c",
        expected_correct=correct,
        expected_first_error=first,
        expected_error_type=label_type,
        overall=overall,
        first_error=found,
        step_verdicts=verdicts,
        llm_error_type=llm_type,
        llm_valid=valid,
        llm_overridden=overridden,
    )


GOOD = item("good", correct=True, verdicts=("supported", "supported"))
CAUGHT = item("caught", correct=False, first=2, overall="incorrect", found=2, verdicts=("supported", "incorrect"))
MISPLACED = item("misplaced", correct=False, first=2, overall="incorrect", found=3,
                 verdicts=("supported", "supported", "incorrect"))  # fmt: skip
FALSE_ALARM = item("false", correct=True, overall="incorrect", found=1, verdicts=("incorrect",))
UNSURE = item("unsure", correct=False, first=2, overall="inconclusive", verdicts=("supported", "inconclusive"))


def test_first_error_accuracy_only_counts_labelled_errors() -> None:
    assert m.first_error_accuracy([GOOD, CAUGHT, MISPLACED]) == 0.5
    assert m.first_error_accuracy([GOOD]) is None


def test_incorrect_precision_and_false_alarms() -> None:
    assert m.incorrect_precision([CAUGHT, MISPLACED]) == 1.0
    assert m.incorrect_precision([CAUGHT, FALSE_ALARM]) == 0.5
    assert m.false_incorrect([GOOD, CAUGHT, FALSE_ALARM]) == ["false"]
    assert m.incorrect_precision([GOOD]) is None


def test_steps_blamed_away_from_the_labelled_error() -> None:
    assert m.step_false_incorrect([CAUGHT]) == 0
    assert m.step_false_incorrect([MISPLACED, FALSE_ALARM]) == 2


def test_recall_inconclusive_and_confirmed_rates() -> None:
    assert m.incorrect_recall([CAUGHT, UNSURE]) == 0.5
    assert m.inconclusive_rate([GOOD, UNSURE]) == 0.5
    assert m.step_inconclusive_rate([GOOD, UNSURE]) == 0.25
    assert m.correct_accuracy([GOOD, FALSE_ALARM]) == 0.5


def test_llm_metrics_and_confusion_matrix() -> None:
    a = item("a", correct=False, first=2, label_type="sign_error", llm_type="sign_error", valid=True, overridden=False)
    b = item("b", correct=False, first=2, label_type="sign_error", llm_type="arithmetic_slip", valid=True,
             overridden=True)  # fmt: skip
    c = item("c", correct=False, first=2, label_type="sign_error", valid=False)
    d = item("d", correct=True)  # LLM not run
    assert m.schema_valid_rate([a, b, c, d]) == pytest.approx(2 / 3)
    assert m.override_rate([a, b, c]) == 0.5
    assert m.error_type_accuracy([a, b, c]) == 0.5
    assert m.confusion_matrix([a, b, c]) == {"sign_error": {"sign_error": 1, "arithmetic_slip": 1}}
    assert m.schema_valid_rate([d]) is None


def test_percentiles_nearest_rank() -> None:
    values = [0.1, 0.2, 0.3, 0.4, 10.0]
    assert m.percentile(values, 50) == 0.3
    assert m.percentile(values, 95) == 10.0
    assert m.percentile([], 50) is None
    assert m.latency_summary({"verify": [1.0, 2.0]})["verify"] == {"n": 2.0, "p50": 1.0, "p95": 2.0}


def test_exact_match_ignores_spacing_and_braces() -> None:
    assert m.normalize_for_match("2 x \\cdot 3 = \\left( 6 \\right)") == m.normalize_for_match("2x*3=(6)")
    assert m.exact_match_rate([("x=5", "x = 5"), ("x=5", "x=S")]) == 0.5
    assert m.exact_match_rate([]) is None


def test_threshold_sits_just_above_the_most_confident_misread() -> None:
    lines = [(0.95, True), (0.9, True), (0.6, False), (0.7, True), (0.4, False)]
    t = m.tune_threshold(lines)
    assert t["threshold"] == 0.7
    assert t["confirm_rate"] == 0.4  # 0.6 and 0.4 must be confirmed; nothing misread slips through
    assert m.tune_threshold([(0.8, True)]) == {"threshold": 0.0, "confirm_rate": 0.0}
    assert m.tune_threshold([]) == {"threshold": None, "confirm_rate": None}


def test_ratings_aggregate_and_reject_out_of_range(tmp_path: Path) -> None:
    f = tmp_path / "r.csv"
    f.write_text("item_id,rater,validity,hint_usefulness\nx,M1,3,2\ny,M4,2,\n", encoding="utf-8")
    assert m.aggregate_ratings(f) == {
        "ratings": 2,
        "raters": 2,
        "validity_mean": 2.5,
        "hint_usefulness_mean": 2.0,
    }
    f.write_text("item_id,rater,validity,hint_usefulness\nx,M1,4,2\n", encoding="utf-8")
    with pytest.raises(ValueError, match="outside 1-3"):
        m.aggregate_ratings(f)
