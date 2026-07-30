"""AI domain types (Task 7).

Frozen dataclasses describe the structured interpretation that the
reasoning layer produces. They are deliberately separate from the
SQLAlchemy model and the Pydantic API schemas.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import UUID

# Documented schema version. Bump when the interpretation JSON
# payload shape changes in a non-backward-compatible way.
INTERPRETATION_FORMULA_VERSION: str = "task7-1.0"


class HypothesisCategory(StrEnum):
    """Coarse categories used to bucket the LLM's hypotheses.

    These are intentionally limited so the API and the persistence
    layer can stay simple. A later task may add more nuanced labels.
    """

    SCHEMA_DRIFT = "schema_drift"
    DATA_QUALITY = "data_quality"
    PIPELINE = "pipeline"
    UPSTREAM_SOURCE = "upstream_source"
    OTHER = "other"


class ProviderKind(StrEnum):
    """Provider identifiers persisted on every interpretation row."""

    NOOP = "noop"
    OPENAI_COMPATIBLE = "openai_compatible"
    LOCAL = "local"


@dataclass(frozen=True, slots=True)
class Hypothesis:
    """A single structured hypothesis produced by the reasoning layer."""

    category: HypothesisCategory
    summary: str
    affected_columns: tuple[str, ...] = field(default_factory=tuple)
    supporting_finding_ids: tuple[UUID, ...] = field(default_factory=tuple)
    confidence: float = 0.0


@dataclass(frozen=True, slots=True)
class InterpretationRequest:
    """Inputs the reasoning layer consumes."""

    dataset_id: UUID
    profile_id: UUID
    finding_ids: tuple[UUID, ...] = field(default_factory=tuple)


@dataclass(frozen=True, slots=True)
class InterpretationResult:
    """The full structured output of one reasoning call."""

    dataset_id: UUID
    profile_id: UUID
    provider_name: ProviderKind
    model_name: str
    formula_version: str
    summary: str
    hypotheses: tuple[Hypothesis, ...] = field(default_factory=tuple)
    overall_confidence: float = 0.0
    created_at: datetime = field(
        default_factory=lambda: datetime.now(__import__("datetime").timezone.utc)
    )


@dataclass(frozen=True, slots=True)
class PersistedInterpretation:
    """Domain shape of an ``ai_interpretations`` row loaded from PostgreSQL."""

    interpretation_id: UUID
    dataset_id: UUID
    profile_id: UUID
    provider_name: str
    model_name: str
    formula_version: str
    summary: str
    hypotheses: tuple[dict[str, Any], ...] = field(default_factory=tuple)
    overall_confidence: float = 0.0
    input_finding_ids: tuple[UUID, ...] = field(default_factory=tuple)
    created_at: datetime = field(
        default_factory=lambda: datetime.now(__import__("datetime").timezone.utc)
    )


__all__ = [
    "INTERPRETATION_FORMULA_VERSION",
    "Hypothesis",
    "HypothesisCategory",
    "InterpretationRequest",
    "InterpretationResult",
    "PersistedInterpretation",
    "ProviderKind",
]
