"""`-m llm`: the real local model on 5 items. Records the schema-valid rate; skips when Ollama is not running."""

import pytest

from app.core.config import get_settings
from app.services.jobs.stages import ProblemContext, ReviewInput, ReviewUnavailable
from app.services.reasoning import OllamaClient, Reviewer
from app.services.verification import verify_steps

pytestmark = pytest.mark.llm

ITEMS = [
    (ProblemContext("lin-001", "linear_equations", "3x+5=20", "x=5"), ["3x+5=20", "3x=15", "x=5"]),
    (ProblemContext("lin-002", "linear_equations", "2(x-3)=10", "x=8"), ["2(x-3)=10", "2x-3=10", "2x=13", "x=6.5"]),
    (ProblemContext("lin-003", "linear_equations", "2x=10", "x=5"), ["2x=10", "x=4"]),
    (ProblemContext("quad-001", "quadratics", "x^2-5x+6=0", None), ["x^2-5x+6=0", "(x-2)(x-4)=0", "x=2, x=4"]),
    (ProblemContext("ineq-001", "linear_inequalities", "-2x>4", None), ["-2x>4", "x>-2"]),
]


def test_real_model_schema_valid_rate() -> None:
    s = get_settings()
    client = OllamaClient(s.ollama_url, s.ollama_model, timeout=s.timeout_llm)
    if not client.health():
        pytest.skip(f"Ollama with {s.ollama_model} is not running at {s.ollama_url}")
    rv = Reviewer(client)
    valid = 0
    for problem, steps in ITEMS:
        verification = verify_steps(steps, problem)
        try:
            result = rv.review(ReviewInput(problem, steps, verification, problem.concept_id))
        except ReviewUnavailable:
            continue
        valid += 1
        assert result.status == verification.overall  # SymPy authority holds
    print(f"\nschema-valid after retry: {valid}/{len(ITEMS)} with {s.ollama_model}")
