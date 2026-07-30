"""History API schemas (Task 6)."""

from __future__ import annotations

from typing import Any, Literal
from uuid import UUID

from pydantic import Field

from app.schemas.common import ApiModel
from app.schemas.datasets import Pagination

SchemaChangeType = Literal["added", "removed", "type_changed"]


class ColumnDiffResponse(ApiModel):
    name: str
    change: SchemaChangeType
    base_physical_type: str | None
    target_physical_type: str | None
    base_logical_type: str | None
    target_logical_type: str | None


class SchemaDiffResponse(ApiModel):
    added: list[str] = Field(default_factory=list)
    removed: list[str] = Field(default_factory=list)
    type_changes: list[ColumnDiffResponse] = Field(default_factory=list)


class NumericDriftResponse(ApiModel):
    column: str
    metric: Literal["mean", "median", "std", "min", "max"]
    base_value: float | None
    target_value: float | None
    absolute_change: float | None
    relative_change: float | None


class CategoricalDriftResponse(ApiModel):
    column: str
    metric: Literal["psi"]
    psi: float = Field(ge=0.0)
    base_top_values: list[dict[str, Any]] = Field(default_factory=list)
    target_top_values: list[dict[str, Any]] = Field(default_factory=list)


class DistributionDriftResponse(ApiModel):
    numeric: list[NumericDriftResponse] = Field(default_factory=list)
    categorical: list[CategoricalDriftResponse] = Field(default_factory=list)


class ScoreDriftResponse(ApiModel):
    base_score: float | None
    target_score: float | None
    delta: float | None
    absolute_delta: float | None
    base_grade: str | None
    target_grade: str | None
    grade_changed: bool


class HistoryComparisonRequest(ApiModel):
    base_version_id: UUID
    target_version_id: UUID


class HistoryComparisonResponse(ApiModel):
    comparison_id: UUID
    dataset_id: UUID
    base_version_id: UUID
    target_version_id: UUID
    formula_version: str
    schema_diff: SchemaDiffResponse
    distribution_drift: DistributionDriftResponse
    score_drift: ScoreDriftResponse
    created_at: str


class HistoryComparisonListResponse(ApiModel):
    items: list[HistoryComparisonResponse]
    pagination: Pagination


class LineageEdgeResponse(ApiModel):
    dataset_id: UUID
    from_version_id: UUID
    from_version_number: int = Field(ge=1)
    from_created_at: str
    to_version_id: UUID
    to_version_number: int = Field(ge=2)
    to_created_at: str


class LineageResponse(ApiModel):
    dataset_id: UUID
    edges: list[LineageEdgeResponse] = Field(default_factory=list)


__all__ = [
    "CategoricalDriftResponse",
    "ColumnDiffResponse",
    "DistributionDriftResponse",
    "HistoryComparisonListResponse",
    "HistoryComparisonRequest",
    "HistoryComparisonResponse",
    "LineageEdgeResponse",
    "LineageResponse",
    "NumericDriftResponse",
    "SchemaDiffResponse",
    "ScoreDriftResponse",
]
