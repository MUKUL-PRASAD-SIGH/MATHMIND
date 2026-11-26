"""Reset the local database to a known demo state (T8.4 step 1).

    backend/.venv/Scripts/python scripts/seed_demo.py --reset      # Windows
    backend/.venv/bin/python scripts/seed_demo.py --reset          # macOS / Linux

Without --reset it only prints what it would do. With --reset it DROPS EVERY TABLE in the configured
database (DATABASE_URL, default backend/data/mathmind.db) and empties UPLOAD_DIR, then loads:

- concepts/problems from datasets/ (plus the two demo concepts if the datasets don't have them yet)
- one learner, one notebook with two pages
- a short practice history (two reviewed submissions, mastery, learning events, one revision item)
  so the progress page and "next activity" have something real to show

The live demo then starts from the R2-B problem `2(x-3)=10` (printed at the end).
Records are tagged "demo" in their messages so they're recognizable in an export.
"""

import argparse
import shutil
import sys
from datetime import timedelta
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND))

from sqlalchemy import Engine  # noqa: E402
from sqlmodel import Session, SQLModel  # noqa: E402

from app.core.config import Settings, get_settings  # noqa: E402
from app.core.db import init_db, make_engine  # noqa: E402
from app.models import (  # noqa: E402
    ConceptRow,
    LearningEventRow,
    MasteryProfileRow,
    NotebookRow,
    PageRow,
    ProblemRow,
    RevisionQueueRow,
    User,
    utcnow,
)
from app.repositories import learning  # noqa: E402
from app.repositories import submissions as subs  # noqa: E402
from app.schemas.review import ReviewResult  # noqa: E402
from app.schemas.verification import Overall, StepVerdict, Verdict, VerificationResult  # noqa: E402
from app.seed import seed  # noqa: E402

DEMO_PROBLEM = "2(x-3)=10"
DEMO_STEPS_WITH_ERROR = ["2(x-3)=10", "2x-3=10", "2x=13", "x=6.5"]
DEMO_STEPS_CORRECTED = ["2(x-3)=10", "2x-6=10", "2x=16", "x=8"]

# Used only when datasets/ doesn't define them yet (M4 owns the real concept graph, T6.1).
FALLBACK_CONCEPTS = [
    ("integer_arithmetic", "Integer arithmetic", "arithmetic", "Adding, subtracting and multiplying integers", []),
    ("linear_equations", "Linear equations", "algebra", "Solving ax + b = c", ["integer_arithmetic"]),
]
FALLBACK_PROBLEMS = [
    ("demo-int-001", "integer_arithmetic", "7-12", "-5", 1),
    ("demo-lin-r2b", "linear_equations", DEMO_PROBLEM, "x=8", 2),
]


def _verdicts(steps: list[str], first_error: int | None) -> VerificationResult:
    out = []
    for i, latex in enumerate(steps, start=1):
        wrong = first_error == i
        out.append(
            StepVerdict(
                index=i,
                latex=latex,
                verdict=Verdict.incorrect if wrong else Verdict.supported,
                reason="solution set changed" if wrong else "equivalent to the previous step",
                after_error=first_error is not None and i > first_error,
            )
        )
    return VerificationResult(
        steps=out,
        first_error_step=first_error,
        overall=Overall.incorrect if first_error else Overall.correct,
        verifier_version="demo-seed",
    )


def _ensure_demo_content(s: Session) -> None:
    for cid, name, domain, desc, prereqs in FALLBACK_CONCEPTS:
        if s.get(ConceptRow, cid) is None:
            learning.upsert_concept(s, cid, name, domain, desc)
            s.flush()
            learning.set_prerequisites(s, cid, prereqs)
    for pid, cid, prompt, answer, difficulty in FALLBACK_PROBLEMS:
        if s.get(ProblemRow, pid) is None:
            learning.upsert_problem(
                s,
                ProblemRow(
                    id=pid, concept_id=cid, prompt_latex=prompt, expected_answer_latex=answer, difficulty=difficulty
                ),
            )
    s.commit()


def _add_history(s: Session, user_id: str) -> None:
    now = utcnow()

    nb = NotebookRow(id="demo-notebook", owner_id=user_id, title="Algebra practice", domain="algebra")
    s.add(nb)
    s.flush()
    s.add(PageRow(id="demo-page-1", notebook_id=nb.id, chapter="Warm-up", order=0, title="Integers", version=1))
    s.add(
        PageRow(id="demo-page-2", notebook_id=nb.id, chapter="Linear equations", order=1, title="Brackets", version=1)
    )
    s.commit()

    # Yesterday: an integer problem done right.
    ok = subs.create_submission(
        s, user_id, "typed", page_id="demo-page-1", problem_id="demo-int-001", status="completed", message="demo"
    )
    ok_steps = ["7-12", "=-(12-7)", "=-5"]
    subs.replace_steps(s, ok.id, [(x, None) for x in ok_steps])
    subs.save_evaluation(
        s,
        ok.id,
        verification=_verdicts(ok_steps, None).model_dump(mode="json"),
        review=None,
        ai_status="unavailable",
    )

    # Earlier today: the classic bracket slip, reviewed with a hint.
    slip = subs.create_submission(
        s, user_id, "typed", page_id="demo-page-2", problem_id="demo-lin-r2b", status="completed", message="demo"
    )
    subs.replace_steps(s, slip.id, [(x, None) for x in DEMO_STEPS_WITH_ERROR])
    review = ReviewResult(
        status=Overall.incorrect,
        first_error_step=2,
        concept="linear_equations",
        error_type="algebraic_transformation",
        explanation="When expanding 2(x-3), the 2 multiplies both x and -3, giving 2x-6.",
        hint="Multiply every term inside the bracket by 2.",
        confidence=0.72,
        recommended_action="targeted_practice",
    )
    subs.save_evaluation(
        s,
        slip.id,
        verification=_verdicts(DEMO_STEPS_WITH_ERROR, 2).model_dump(mode="json"),
        review=review.model_dump(mode="json"),
        ai_status="ok",
        model_version="demo-seed",
    )

    s.add(
        MasteryProfileRow(
            user_id=user_id,
            concept_id="integer_arithmetic",
            mastery=0.72,
            attempts=5,
            updated_at=now - timedelta(days=1),
        )
    )
    s.add(
        MasteryProfileRow(
            user_id=user_id,
            concept_id="linear_equations",
            mastery=0.35,
            attempts=2,
            updated_at=now - timedelta(hours=2),
        )
    )
    s.add(
        LearningEventRow(
            user_id=user_id,
            concept_id="integer_arithmetic",
            submission_id=ok.id,
            kind="attempt",
            score=1.0,
            at=now - timedelta(days=1),
        )
    )
    s.add(
        LearningEventRow(
            user_id=user_id,
            concept_id="linear_equations",
            submission_id=slip.id,
            kind="attempt",
            score=0.25,
            hints_used=1,
            error_type="algebraic_transformation",
            at=now - timedelta(hours=2),
        )
    )
    s.add(
        RevisionQueueRow(
            user_id=user_id,
            concept_id="integer_arithmetic",
            due_at=now - timedelta(hours=1),
            reason="Last practised yesterday; a quick check keeps it fresh.",
        )
    )
    s.commit()


def _empty_upload_dir(upload_dir: Path) -> None:
    if not upload_dir.exists():
        return
    if upload_dir.name != "uploads":  # guard against a misconfigured UPLOAD_DIR pointing somewhere important
        raise SystemExit(f"refusing to empty {upload_dir}: UPLOAD_DIR must be a folder named 'uploads'")
    for child in upload_dir.iterdir():
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()


def reset_demo(engine: Engine, settings: Settings) -> dict[str, int]:
    SQLModel.metadata.drop_all(engine)
    init_db(engine)
    _empty_upload_dir(settings.upload_dir)
    n_concepts, n_problems = seed(engine, settings.datasets_dir)
    with Session(engine) as s:
        user = User(display_name="Demo learner")
        s.add(user)
        s.commit()
        _ensure_demo_content(s)
        _add_history(s, user.id)
    return {"concepts_from_datasets": n_concepts, "problems_from_datasets": n_problems}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--reset", action="store_true", help="really drop all tables and load the demo state")
    parser.add_argument("--database-url", help="override DATABASE_URL")
    args = parser.parse_args(argv)

    settings = get_settings()
    if args.database_url:
        settings = settings.model_copy(update={"database_url": args.database_url})
    if settings.database_url in ("sqlite://", "sqlite:///:memory:"):
        print("refusing: an in-memory database would vanish when this script exits", file=sys.stderr)
        return 2

    print(f"database : {settings.database_url}")
    print(f"uploads  : {settings.upload_dir}")
    print(f"datasets : {settings.datasets_dir}")
    if not args.reset:
        print("\nDry run. This would DELETE ALL DATA in the database above and load the demo state.")
        print("Stop the API server first, then re-run with --reset.")
        return 1

    engine = make_engine(settings.database_url)
    try:
        counts = reset_demo(engine, settings)
    finally:
        engine.dispose()
    print(
        f"\nDemo state loaded ({counts['concepts_from_datasets']} concepts / "
        f"{counts['problems_from_datasets']} problems from datasets, plus demo fallbacks)."
    )
    print("Notebook 'Algebra practice' -> page 'Brackets'. Live demo problem:", DEMO_PROBLEM)
    print("  with the error :", " | ".join(DEMO_STEPS_WITH_ERROR))
    print("  corrected      :", " | ".join(DEMO_STEPS_CORRECTED))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
