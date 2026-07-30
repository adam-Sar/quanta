"""Recommendation API schemas (Task 8)."""

from __future__ import annotations

from typing import Any, Literal
from uuid import UUID

from pydantic import Field

from app.schemas.common import ApiModel
from app.schemas.datasets import Pagination

RecommendationKindLiteral = Literal[
    "data_quality_fix",
    "duplicate_removal",
    "outlier_treatment",
    "schema_normalization",
    "cardinality_reduction",
    "missingness_treatment",
    "pipeline_review",
]

RecommendationSeverityLiteral = Literal["info", "low", "medium", "high", "critical"]

OperationKindLiteral = Literal[
    "impute_missing",
    "drop_column",
    "drop_duplicates",
    "cap_outliers",
    "cast_type",
    "group_rare_categorical",
    "review",
]


class RecommendationOperationResponse(ApiModel):
    kind: OperationKindLiteral
    params: dict[str, Any] = Field(default_factory=dict)
    preview_only: bool = True


class RecommendationResponse(ApiModel):
    recommendation_id: UUID
    dataset_id: UUID
    profile_id: UUID
    kind: RecommendationKindLiteral
    severity: RecommendationSeverityLiteral
    title: str
    rationale: str
    affected_columns: list[str] = Field(default_factory=list)
    supporting_finding_ids: list[UUID] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)
    priority: int = Field(ge=0)
    operation: RecommendationOperationResponse | None = None
    formula_version: str
    components: dict[str, Any] = Field(default_factory=dict)
    created_at: str


class RecommendationListResponse(ApiModel):
    items: list[RecommendationResponse]
    pagination: Pagination


__all__ = [
    "OperationKindLiteral",
    "RecommendationKindLiteral",
    "RecommendationListResponse",
    "RecommendationOperationResponse",
    "RecommendationResponse",
    "RecommendationSeverityLiteral",
]