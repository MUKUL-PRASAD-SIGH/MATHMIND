"""Owned by M3 — see docs/team/M3-math-ai.md. M1 calls this module via app/services/jobs/stages.py."""

from app.services.adaptation.mastery import (
    INITIAL_MASTERY,
    MasteryState,
    apply_evidence,
    confidence_level,
    score_from_evidence,
    update_mastery,
)
from app.services.adaptation.next_action import AttemptRecord, due_revisions, next_action, schedule_revision

__all__ = [
    "INITIAL_MASTERY",
    "AttemptRecord",
    "MasteryState",
    "apply_evidence",
    "confidence_level",
    "due_revisions",
    "next_action",
    "schedule_revision",
    "score_from_evidence",
    "update_mastery",
]
