from enum import StrEnum

from pydantic import Field

from app.schemas.common import ContractModel


class Verdict(StrEnum):
    supported = "supported"
    incorrect = "incorrect"
    inconclusive = "inconclusive"


class Overall(StrEnum):
    correct = "correct"
    incorrect = "incorrect"
    inconclusive = "inconclusive"


class StepVerdict(ContractModel):
    index: int = Field(ge=1, description="1-based step index")
    latex: str
    verdict: Verdict
    reason: str
    domain_warning: str | None = None
    after_error: bool = False


class VerificationResult(ContractModel):
    steps: list[StepVerdict]
    first_error_step: int | None = Field(default=None, ge=1)
    overall: Overall
    verifier_version: str = "stub-0"
