"""Prompt construction for the AI reasoning layer (Task 7).

The prompt deliberately carries a bounded, structured context:
Task 4 finding summaries plus a small slice of the Task 3
profile metrics. It never embeds raw dataset rows. The expected
response shape is a Pydantic model that the provider must
materialize; free-form text output is rejected.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from app.ai.types import HypothesisCategory, ProviderKind

# Maximum payload size in characters; the service truncates any
# single field that would push the prompt past this budget. The
# default is intentionally conservative; a later task may tune it.
DEFAULT_PROMPT_CHAR_BUDGET: int = 8_000


class InterpretationHypothesisSchema(BaseModel):
    """Structured hypothesis returned by the LLM provider."""

    category: HypothesisCategory
    summary: str = Field(min_length=1, max_length=500)
    affected_columns: list[str] = Field(default_factory=list)
    supporting_finding_ids: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)


class InterpretationResponseSchema(BaseModel):
    """Pydantic response model the LLM provider must populate."""

    summary: str = Field(min_length=1, max_length=2000)
    overall_confidence: float = Field(ge=0.0, le=1.0)
    hypotheses: list[InterpretationHypothesisSchema] = Field(default_factory=list, max_length=10)


def build_interpretation_prompt(
    *,
    dataset_name: str,
    profile_id: str,
    score: float | None,
    grade: str | None,
    findings: list[dict[str, Any]],
) -> str:
    """Return the deterministic prompt the LLM provider receives.

    The prompt is plain text so any provider can consume it. The
    expected response is ``InterpretationResponseSchema``.
    """

    header = (
        "You are a deterministic data quality analyst. Read the\n"
        "structured context below and produce a short, evidence-based\n"
        "interpretation. Do not invent findings; only reference the\n"
        "finding ids provided. Return JSON matching the\n"
        "InterpretationResponseSchema. Keep the summary under 2000\n"
        "characters. Prefer fewer, higher-confidence hypotheses over\n"
        "many speculative ones.\n"
    )
    context_lines = [
        f"dataset_name: {dataset_name}",
        f"profile_id: {profile_id}",
        f"current_score: {score if score is not None else 'unknown'}",
        f"current_grade: {grade if grade is not None else 'unknown'}",
        f"finding_count: {len(findings)}",
    ]
    if findings:
        context_lines.append("findings:")
        for item in findings:
            context_lines.append(
                "  - id={finding_id} kind={kind} severity={severity} "
                "column={column} value={value} threshold={threshold} "
                "summary={summary}".format(
                    finding_id=item.get("finding_id", "n/a"),
                    kind=item.get("kind", "n/a"),
                    severity=item.get("severity", "n/a"),
                    column=item.get("column") or "<dataset>",
                    value=item.get("value", "n/a"),
                    threshold=item.get("threshold", "n/a"),
                    summary=item.get("summary", ""),
                )
            )
    return header + "\n".join(context_lines)


def build_noop_prompt(
    *,
    dataset_name: str,
    profile_id: str,
) -> str:
    """A noop-style prompt kept for the deterministic NoopProvider."""

    return (
        "noop-interpret "
        f"dataset={dataset_name} profile={profile_id} "
        f"provider={ProviderKind.NOOP.value}"
    )


__all__ = [
    "DEFAULT_PROMPT_CHAR_BUDGET",
    "InterpretationHypothesisSchema",
    "InterpretationResponseSchema",
    "build_interpretation_prompt",
    "build_noop_prompt",
]
