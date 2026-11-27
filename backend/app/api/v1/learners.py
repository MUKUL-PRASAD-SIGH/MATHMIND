"""Learner, concept and problem endpoints (T6.5), backed by M3's adaptive engine (app/services/adaptation).

The pipeline stores evidence (learning events, mastery, revision queue; app/services/jobs/learning.py); these
endpoints read it back. /next runs the next-action rule table on the same history.
"""

from fastapi import APIRouter, Query

from app.api.deps import SessionDep, UserDep
from app.core.errors import AppError
from app.models import utcnow
from app.repositories import learning as repo
from app.schemas.common import ErrorResponse
from app.schemas.learning import (
    Concept,
    Mastery,
    MasteryEntry,
    NextAction,
    Problem,
    Revision,
    RevisionItem,
)
from app.services.adaptation import confidence_level, due_revisions
from app.services.jobs import learning

router = APIRouter(tags=["learning"])
ERRORS: dict[int | str, dict[str, object]] = {404: {"model": ErrorResponse}}


@router.get("/concepts", response_model=list[Concept])
def list_concepts(session: SessionDep) -> list[Concept]:
    return learning.concept_graph(session)


@router.get("/problems", response_model=list[Problem])
def list_problems(session: SessionDep, concept: str | None = Query(default=None, max_length=64)) -> list[Problem]:
    return learning.problem_bank(session, concept)


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
                last_practised_at=learning.aware(m.updated_at) if m.attempts else None,
            )
            for m, c in repo.list_mastery(session, user.id)
        ]
    )


@router.get("/learners/me/revision", response_model=Revision)
def my_revision(session: SessionDep, user: UserDep) -> Revision:
    items = [
        RevisionItem(concept_id=c.id, concept_name=c.name, due_at=learning.aware(r.due_at), reason=r.reason)
        for r, c in repo.list_revision(session, user.id)
    ]
    return Revision(items=due_revisions(items, utcnow()))


@router.get("/learners/me/next", response_model=NextAction, responses=ERRORS)
def my_next(session: SessionDep, user: UserDep) -> NextAction:
    action = learning.recommend(session, user.id)
    if action is None:
        raise AppError(404, "no_concepts", "No concepts loaded; run `python -m app.seed`")
    return action
