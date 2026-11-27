"""Idempotent loader for datasets/concepts/*.json and datasets/problems/*.json.

Usage:  python -m app.seed  [--datasets PATH]
Formats: datasets/*/SCHEMA.md (written by M4 in T0.6). Missing files are skipped.
"""

import argparse
import json
import logging
from pathlib import Path

from sqlalchemy import Engine
from sqlmodel import Session

from app.core.config import get_settings
from app.core.db import init_db, make_engine
from app.models import ProblemRow
from app.repositories import learning

log = logging.getLogger(__name__)


def _read_array(path: Path) -> list[dict[str, object]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError(f"{path} must contain a JSON array")
    return data


def seed(engine: Engine, datasets_dir: Path) -> tuple[int, int]:
    concepts: list[dict[str, object]] = []
    concept_file = datasets_dir / "concepts" / "concepts.json"
    if concept_file.exists():
        concepts = _read_array(concept_file)

    problems: list[dict[str, object]] = []
    problem_dir = datasets_dir / "problems"
    if problem_dir.exists():
        for f in sorted(problem_dir.glob("*.json")):
            problems.extend(_read_array(f))

    ids = {str(c["id"]) for c in concepts}
    with Session(engine) as s:
        for c in concepts:
            learning.upsert_concept(s, str(c["id"]), str(c["name"]), str(c["domain"]), str(c.get("description", "")))
        s.flush()
        for c in concepts:
            prereqs = [str(p) for p in c.get("prerequisites", [])]  # type: ignore[attr-defined]
            missing = [p for p in prereqs if p not in ids]
            if missing:
                raise ValueError(f"concept {c['id']} has unknown prerequisites {missing}")
            learning.set_prerequisites(s, str(c["id"]), prereqs)
        for p in problems:
            learning.upsert_problem(
                s,
                ProblemRow(
                    id=str(p["id"]),
                    concept_id=str(p["concept_id"]),
                    prompt_latex=str(p["prompt_latex"]),
                    expected_answer_latex=(str(p["expected_answer_latex"]) if p.get("expected_answer_latex") else None),
                    difficulty=int(p.get("difficulty", 1)),  # type: ignore[call-overload]
                ),
            )
        s.commit()
    return len(concepts), len(problems)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    settings = get_settings()
    parser.add_argument("--datasets", type=Path, default=settings.datasets_dir)
    args = parser.parse_args()
    engine = make_engine(settings.database_url)
    init_db(engine)
    n_c, n_p = seed(engine, args.datasets)
    print(f"seeded {n_c} concepts, {n_p} problems from {args.datasets}")


if __name__ == "__main__":
    main()
