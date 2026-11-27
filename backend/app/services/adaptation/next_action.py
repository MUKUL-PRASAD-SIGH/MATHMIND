"""Adaptive next action (T6.4): the rule table of 02-architecture.md §9 as ordered rules. The first match wins.

| # | Evidence (current concept)                                  | Action                                       |
|---|-------------------------------------------------------------|----------------------------------------------|
| 1 | < 2 attempts, or the last result was inconclusive           | ask_another_question (no strong claim)       |
| 2 | last 3 correct and M >= 0.8                                 | increase_difficulty (or unlock next concept) |
| 3 | >= 2 conceptual errors in the last 5                        | prerequisite_review on the weakest prereq    |
| 4 | arithmetic_slip after step 1 (method otherwise right)       | targeted_practice, same concept              |
| 5 | correct, but only after >= 2 hints                          | schedule_revision (due in 1 day)             |
| 6 | correct after a revision, having struggled before           | continue: new problem (transfer test)        |
| - | otherwise                                                   | continue at the learner's level              |

Every result carries a ``reason`` the learner reads.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from app.schemas.learning import Concept, NextAction, Problem, RevisionItem
from app.schemas.review import ErrorType, RecommendedAction
from app.schemas.verification import Overall
from app.services.adaptation.mastery import INITIAL_MASTERY, MasteryState

MASTERED = 0.8
WEAK_PREREQ = 0.6
CONCEPTUAL_ERRORS = {ErrorType.missing_prerequisite, ErrorType.formula_selection, ErrorType.algebraic_transformation}
REVISION_DELAY = timedelta(days=1)


@dataclass(frozen=True)
class AttemptRecord:
    concept_id: str
    outcome: Overall
    problem_id: str | None = None
    error_type: ErrorType | None = None
    first_error_step: int | None = None
    hints_used: int = 0
    after_revision: bool = False


@dataclass(frozen=True)
class _Ctx:
    concept: Concept
    mastery: float
    attempts: list[AttemptRecord]
    profile: Mapping[str, MasteryState]
    graph: Sequence[Concept]
    problems: Sequence[Problem]
    attempted: set[str]


def target_difficulty(mastery: float) -> int:
    return min(5, max(1, round(1 + 4 * mastery)))


def pick_problem(problems: Sequence[Problem], concept_id: str, attempted: set[str], target: int) -> Problem | None:
    """An unattempted problem nearest the target difficulty; ties -> easier, then by id."""
    pool = [p for p in problems if p.concept_id == concept_id]
    fresh = [p for p in pool if p.id not in attempted] or pool
    return min(fresh, key=lambda p: (abs(p.difficulty - target), p.difficulty, p.id), default=None)


def _m(profile: Mapping[str, MasteryState], cid: str) -> float:
    state = profile.get(cid)
    return state.mastery if state else INITIAL_MASTERY


def _action(ctx: _Ctx, action: RecommendedAction, concept_id: str, reason: str, target: int) -> NextAction:
    problem = pick_problem(ctx.problems, concept_id, ctx.attempted, target)
    return NextAction(action=action, concept_id=concept_id, problem_id=problem.id if problem else None, reason=reason)


# ---- rules ------------------------------------------------------------------------------------------


def _rule_uncertain(ctx: _Ctx) -> NextAction | None:
    if len(ctx.attempts) < 2 or ctx.attempts[-1].outcome == Overall.inconclusive:
        why = (
            "We couldn't fully check your last answer"
            if ctx.attempts and ctx.attempts[-1].outcome == Overall.inconclusive
            else "We need a little more practice to see how you're doing"
        )
        return _action(
            ctx,
            RecommendedAction.ask_another_question,
            ctx.concept.id,
            f"{why} with {ctx.concept.name.lower()}. Try this one.",
            target_difficulty(ctx.mastery),
        )
    return None


def _rule_increase(ctx: _Ctx) -> NextAction | None:
    last3 = ctx.attempts[-3:]
    if len(last3) < 3 or any(a.outcome != Overall.correct for a in last3) or ctx.mastery < MASTERED:
        return None
    harder = min(5, target_difficulty(ctx.mastery) + 1)
    fresh = (p for p in ctx.problems if p.concept_id == ctx.concept.id and p.id not in ctx.attempted)
    if any(p.difficulty >= harder for p in fresh):
        return _action(
            ctx,
            RecommendedAction.increase_difficulty,
            ctx.concept.id,
            f"You solved 3 {ctx.concept.name.lower()} problems in a row. Let's try a harder one.",
            harder,
        )
    for nxt in ctx.graph:
        if ctx.concept.id in nxt.prerequisites and _m(ctx.profile, nxt.id) < MASTERED:
            return _action(
                ctx,
                RecommendedAction.increase_difficulty,
                nxt.id,
                f"You've got the hang of {ctx.concept.name.lower()}. Next up: {nxt.name.lower()}.",
                target_difficulty(_m(ctx.profile, nxt.id)),
            )
    return None


def _rule_prerequisite(ctx: _Ctx) -> NextAction | None:
    conceptual = [a for a in ctx.attempts[-5:] if a.error_type in CONCEPTUAL_ERRORS]
    if len(conceptual) < 2:
        return None
    by_id = {c.id: (i, c) for i, c in enumerate(ctx.graph)}
    weak = [
        (_m(ctx.profile, pid), by_id[pid][0], by_id[pid][1])
        for pid in ctx.concept.prerequisites
        if pid in by_id and _m(ctx.profile, pid) < WEAK_PREREQ
    ]
    if not weak:
        return None
    mastery, _, prereq = min(weak, key=lambda t: (t[0], t[1]))
    return _action(
        ctx,
        RecommendedAction.prerequisite_review,
        prereq.id,
        f"The same kind of mistake came up {len(conceptual)} times recently. A quick review of "
        f"{prereq.name.lower()} should help with {ctx.concept.name.lower()}.",
        target_difficulty(mastery),
    )


def _rule_arithmetic_slip(ctx: _Ctx) -> NextAction | None:
    last = ctx.attempts[-1]
    if last.error_type != ErrorType.arithmetic_slip or not last.first_error_step or last.first_error_step <= 1:
        return None
    return _action(
        ctx,
        RecommendedAction.targeted_practice,
        ctx.concept.id,
        f"Your method was right; a small arithmetic slip in step {last.first_error_step} changed the answer. "
        "Here's another one to practise careful working.",
        target_difficulty(ctx.mastery),
    )


def _rule_hints(ctx: _Ctx) -> NextAction | None:
    last = ctx.attempts[-1]
    if last.outcome != Overall.correct or last.hints_used < 2:
        return None
    return _action(
        ctx,
        RecommendedAction.schedule_revision,
        ctx.concept.id,
        f"You got there with {last.hints_used} hints. We'll come back to {ctx.concept.name.lower()} tomorrow "
        "to make it stick.",
        target_difficulty(ctx.mastery),
    )


def _rule_improved_after_revision(ctx: _Ctx) -> NextAction | None:
    last = ctx.attempts[-1]
    struggled = any(a.outcome == Overall.incorrect or a.hints_used >= 2 for a in ctx.attempts[:-1])
    if not (last.after_revision and last.outcome == Overall.correct and struggled):
        return None
    return _action(
        ctx,
        RecommendedAction.continue_,
        ctx.concept.id,
        "You improved after revising. Here's a new problem to check it sticks.",
        target_difficulty(ctx.mastery),
    )


RULES = (
    _rule_uncertain,
    _rule_increase,
    _rule_prerequisite,
    _rule_arithmetic_slip,
    _rule_hints,
    _rule_improved_after_revision,
)


def next_action(
    profile: Mapping[str, MasteryState],
    history: Sequence[AttemptRecord],
    concept_graph: Sequence[Concept],
    problems: Sequence[Problem],
    concept_id: str | None = None,
) -> NextAction:
    """Recommend what to do next for ``concept_id`` (default: the concept of the most recent attempt)."""
    if not concept_graph:
        raise ValueError("concept graph is empty")
    by_id = {c.id: c for c in concept_graph}
    cid = concept_id or (history[-1].concept_id if history else None)
    concept = by_id.get(cid) if cid else None
    if concept is None:
        concept = next((c for c in concept_graph if not c.prerequisites), concept_graph[0])
    ctx = _Ctx(
        concept=concept,
        mastery=_m(profile, concept.id),
        attempts=[a for a in history if a.concept_id == concept.id],
        profile=profile,
        graph=concept_graph,
        problems=problems,
        attempted={a.problem_id for a in history if a.problem_id},
    )
    for rule in RULES:
        result = rule(ctx)
        if result is not None:
            return result
    return _action(
        ctx,
        RecommendedAction.continue_,
        concept.id,
        f"Keep going with {concept.name.lower()}: here's a problem at your level.",
        target_difficulty(ctx.mastery),
    )


# ---- revision queue -------------------------------------------------------------------------------------


def schedule_revision(concept: Concept, now: datetime | None = None, reason: str | None = None) -> RevisionItem:
    now = now or datetime.now(UTC)
    return RevisionItem(
        concept_id=concept.id,
        concept_name=concept.name,
        due_at=now + REVISION_DELAY,
        reason=reason or f"Revisit {concept.name.lower()} to make it stick.",
    )


def due_revisions(items: Sequence[RevisionItem], now: datetime | None = None) -> list[RevisionItem]:
    now = now or datetime.now(UTC)
    return sorted((i for i in items if i.due_at <= now), key=lambda i: (i.due_at, i.concept_id))
