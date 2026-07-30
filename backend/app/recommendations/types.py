"""Recommendation domain types (Task 8).

These frozen dataclasses describe the structured recommendations that
the deterministic rule engine produces. They are deliberately separate
from the SQLAlchemy model and the Pydantic API schemas.

The taxonomy of recommendation kinds and operations is intentionally
small. Each recommendation is a **constrained, preview-only operation**
- the rule engine never executes code on the dataset and the apply
step lands in a later task (Task 9 validation).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import UUID

# Documented schema version. Bump when the recommendation payload
# shape or the rule engine changes in a non-backward-compatible way.
RECOMMENDATION_FORMULA_VERSION: str = "task8-1.0"

# Convenience tuple so callers can iterate every supported operation.
OPERATION_KINDS: tuple[OperationKind, ...]  # type: ignore[valid-type]


class RecommendationKind(StrEnum):
    """Coarse classification of what a recommendation suggests.

    The kinds map 1:1 to Task 4 finding kinds, plus a small handful of
    cross-cutting advisory categories. They are intentionally limited
    so the API and the persistence layer can stay simple.
    """

    DATA_QUALITY_FIX = "data_quality_fix"
    DUPLICATE_REMOVAL = "duplicate_removal"
    OUTLIER_TREATMENT = "outlier_treatment"
    SCHEMA_NORMALIZATION = "schema_normalization"
    CARDINALITY_REDUCTION = "cardinality_reduction"
    MISSINGNESS_TREATMENT = "missingness_treatment"
    PIPELINE_REVIEW = "pipeline_review"


class RecommendationSeverity(StrEnum):
    """Severity band derived from the underlying finding severity."""

    INFO = "info"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class OperationKind(StrEnum):
    """The constrained operation a recommendation proposes.

    All operations are **preview-only** in Task 8. They never mutate
    the original file or the database. The apply step lands in Task 9.
    """

    IMPUTE_MISSING = "impute_missing"
    DROP_COLUMN = "drop_column"
    DROP_DUPLICATES = "drop_duplicates"
    CAP_OUTLIERS = "cap_outliers"
    CAST_TYPE = "cast_type"
    GROUP_RARE_CATEGORICAL = "group_rare_categorical"
    REVIEW = "review"


# Populate the convenience tuple now that the enums exist.
OPERATION_KINDS = tuple(OperationKind)

# Mapping from Task 4 finding kinds to the recommendation kinds the
# rule engine produces. Kept here so the formula module and the API
# schema both reference the same source of truth.
RECOMMENDATION_KIND_BY_FINDING: dict[str, RecommendationKind] = {
    "missingness": RecommendationKind.MISSINGNESS_TREATMENT,
    "duplicates": RecommendationKind.DUPLICATE_REMOVAL,
    "invalid_values": RecommendationKind.DATA_QUALITY_FIX,
    "outlier": RecommendationKind.OUTLIER_TREATMENT,
    "cardinality": RecommendationKind.CARDINALITY_REDUCTION,
}


@dataclass(frozen=True, slots=True)
class RecommendationOperation:
    """A constrained, preview-only operation proposed by a recommendation."""

    kind: OperationKind
    params: dict[str, Any] = field(default_factory=dict)
    preview_only: bool = True


@dataclass(frozen=True, slots=True)
class Recommendation:
    """A single structured recommendation produced by the rule engine.

    The fields are deliberately self-contained so consumers can render
    them without re-reading the source rows. ``confidence`` is bounded
    to ``[0, 1]``; ``priority`` is an integer ordering signal derived
    from severity, confidence, and the number of supporting findings.
    """

    kind: RecommendationKind
    severity: RecommendationSeverity
    title: str
    rationale: str
    affected_columns: tuple[str, ...] = field(default_factory=tuple)
    supporting_finding_ids: tuple[UUID, ...] = field(default_factory=tuple)
    confidence: float = 0.0
    priority: int = 0
    operation: RecommendationOperation | None = None


@dataclass(frozen=True, slots=True)
class RecommendationRequest:
    """Inputs the recommendation service consumes."""

    dataset_id: UUID
    profile_id: UUID
    finding_ids: tuple[UUID, ...] = field(default_factory=tuple)


@dataclass(frozen=True, slots=True)
class RecommendationRun:
    """The full structured output of one recommendation call.

    ``recommendations`` is the deterministic, explainable list of
    suggested actions; ``by_kind`` / ``by_severity`` are small
    JSONB-safe breakdowns that capture per-recommendation contributions
    so consumers can audit the run without re-reading source rows.
    """

    dataset_id: UUID
    profile_id: UUID
    recommendations: tuple[Recommendation, ...] = field(default_factory=tuple)
    recommendation_count: int = 0
    by_kind: dict[str, int] = field(default_factory=dict)
    by_severity: dict[str, int] = field(default_factory=dict)
    formula_version: str = RECOMMENDATION_FORMULA_VERSION
    created_at: datetime = field(
        default_factory=lambda: datetime.now(__import__("datetime").timezone.utc)
    )


# Re-export a couple of aliases so callers have a single import surface.
RecommendationComponents = dict[str, Any]


@dataclass(frozen=True, slots=True)
class PersistedRecommendation:
    """Domain shape of a ``recommendations`` row loaded from PostgreSQL."""

    recommendation_id: UUID
    dataset_id: UUID
    profile_id: UUID
    kind: str
    severity: str
    title: str
    rationale: str
    affected_columns: tuple[str, ...]
    supporting_finding_ids: tuple[UUID, ...]
    confidence: float
    priority: int
    operation_kind: str
    operation_params: dict[str, Any]
    preview_only: bool
    formula_version: str
    created_at: datetime


__all__ = [
    "OPERATION_KINDS",
    "RECOMMENDATION_FORMULA_VERSION",
    "RECOMMENDATION_KIND_BY_FINDING",
    "OperationKind",
    "PersistedRecommendation",
    "Recommendation",
    "RecommendationComponents",
    "RecommendationKind",
    "RecommendationOperation",
    "RecommendationRequest",
    "RecommendationRun",
    "RecommendationSeverity",
]
