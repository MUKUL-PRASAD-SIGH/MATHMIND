"""Learner, concept and problem endpoints.

T6.5 wires these to M3's adaptive engine. Until then /next uses a transparent placeholder rule
(lowest-mastery concept, easiest unseen problem) and says so in `reason`.
"""

from fastapi import APIRouter, Query

from app.api.deps import SessionDep, UserDep
from app.core.errors import AppError
from app.models import utcnow
from app.repositories import learning as repo
from app.schemas.common import ErrorResponse
from app.schemas.learning import (
    Concept,
    ConfidenceLevel,
    Mastery,
    MasteryEntry,
    NextAction,
    Problem,
    Revision,
    RevisionItem,
)
from app.schemas.review import RecommendedAction

router = APIRouter(tags=["learning"])
ERRORS: dict[int | str, dict[str, object]] = {404: {"model": ErrorResponse}}


def confidence_level(attempts: int) -> ConfidenceLevel:
    if attempts < 3:
        return ConfidenceLevel.low
    if attempts <= 6:
        return ConfidenceLevel.medium
    return ConfidenceLevel.high


@router.get("/concepts", response_model=list[Concept])
def list_concepts(session: SessionDep) -> list[Concept]:
    return [
        Concept(id=c.id, name=c.name, domain=c.domain, description=c.description, prerequisites=pre)
        for c, pre in repo.list_concepts(session)
    ]


@router.get("/problems", response_model=list[Problem])
def list_problems(session: SessionDep, concept: str | None = Query(default=None, max_length=64)) -> list[Problem]:
    return [
        Problem(
            id=p.id,
            concept_id=p.concept_id,
            prompt_latex=p.prompt_latex,
            expected_answer_latex=p.expected_answer_latex,
            difficulty=p.difficulty,
        )
        for p in repo.list_problems(session, concept)
    ]


@router.get("/learners/me/mastery", response_model=Mastery)
def my_mastery(session: SessionDep, user: UserDep) -> Mastery:
    return Mastery(
        items=[
            MasteryEntry(
                concept_id=c.id,
                concept_name=c.name,
                mastery=m.mastery,
                attempts=m.attempts,
                confidence_level=confidence_level(m.attempts),
                last_practised_at=m.updated_at if m.attempts else None,
            )
            for m, c in repo.list_mastery(session, user.id)
        ]
    )


@router.get("/learners/me/revision", response_model=Revision)
def my_revision(session: SessionDep, user: UserDep) -> Revision:
    return Revision(
        items=[
            RevisionItem(concept_id=c.id, concept_name=c.name, due_at=r.due_at, reason=r.reason)
            for r, c in repo.list_due_revision(session, user.id, utcnow())
        ]
    )


@router.get("/learners/me/next", response_model=NextAction, responses=ERRORS)
def my_next(session: SessionDep, user: UserDep) -> NextAction:
    concepts = repo.list_concepts(session)
    if not concepts:
        raise AppError(404, "no_concepts", "No concepts loaded; run `python -m app.seed`")
    mastery = {m.concept_id: m.mastery for m, _ in repo.list_mastery(session, user.id)}
    # Placeholder: prefer concepts whose prerequisites are all present, lowest mastery first.
    target, _ = min(concepts, key=lambda cp: (len(cp[1]), mastery.get(cp[0].id, 0.3), cp[0].id))
    problems = repo.list_problems(session, target.id)
    return NextAction(
        action=RecommendedAction.ask_another_question,
        concept_id=target.id,
        problem_id=problems[0].id if problems else None,
        reason=f"Starter suggestion for {target.name} (adaptive engine arrives in T6.4).",
    )
