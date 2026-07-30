"""Deterministic Noop LLM provider (Task 7).

The Noop provider is the default when ``LLM_PROVIDER`` is unset or
explicitly set to ``noop``. It produces a stable, schema-valid
``InterpretationResponseSchema`` that summarises the input context
without invoking any external service. This keeps tests fast and
deterministic, and gives operators a safe default that can be
replaced with a real provider without changing call sites.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from app.ai.prompts import (
    InterpretationHypothesisSchema,
    InterpretationResponseSchema,
)
from app.ai.types import HypothesisCategory, ProviderKind


class NoopProvider:
    """Deterministic offline LLM stand-in."""

    name: str = ProviderKind.NOOP.value

    def complete(
        self,
        *,
        prompt: str,
        response_model: type[BaseModel],
        context: dict[str, Any] | None = None,
    ) -> BaseModel:
        if response_model is not InterpretationResponseSchema:
            raise ValueError(
                f"NoopProvider only supports InterpretationResponseSchema, "
                f"got {response_model.__name__}"
            )
        context = context or {}
        findings = context.get("findings") or []
        hypotheses: list[InterpretationHypothesisSchema] = []
        if findings:
            for item in findings[:3]:
                hypotheses.append(
                    InterpretationHypothesisSchema(
                        category=(
                            HypothesisCategory.DATA_QUALITY
                            if item.get("kind") in {"missingness", "outlier"}
                            else HypothesisCategory.SCHEMA_DRIFT
                            if item.get("kind") in {"type_changed", "cardinality"}
                            else HypothesisCategory.OTHER
                        ),
                        summary=(
                            "NoopProvider deterministic placeholder: investigate "
                            f"finding {item.get('finding_id', '?')} on column "
                            f"{item.get('column') or '<dataset>'}."
                        ),
                        affected_columns=[
                            col for col in [item.get("column")] if isinstance(col, str)
                        ],
                        supporting_finding_ids=[
                            fid for fid in [item.get("finding_id")] if isinstance(fid, str)
                        ],
                        confidence=0.1,
                    )
                )
        dataset_name = context.get("dataset_name", "unknown")
        return InterpretationResponseSchema(
            summary=(
                f"NoopProvider placeholder interpretation for dataset "
                f"'{dataset_name}' with {len(findings)} finding(s). "
                f"Configure LLM_PROVIDER to a real adapter for production."
            ),
            overall_confidence=0.0,
            hypotheses=hypotheses,
        )


__all__ = ["NoopProvider"]
