"""Quality score API schemas (Task 5)."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import Field

from app.schemas.common import ApiModel
from app.schemas.datasets import Pagination

QualityGrade = Literal["A", "B", "C", "D", "F"]


class ScoreComponentBucket(ApiModel):
    count: int = Field(ge=0)
    penalty_total: float = Field(ge=0.0)
    penalty_normalized: float = Field(ge=0.0, le=1.0)


class PerFindingScore(ApiModel):
    kind: Literal["missingness", "duplicates", "invalid_values", "outlier", "cardinality"]
    severity: Literal["info", "low", "medium", "high", "critical"]
    column_name: str | None
    metric: str
    value: float
    threshold: float
    detection_confidence: float = Field(ge=0.0, le=1.0)
    data_error_confidence: float = Field(ge=0.0, le=1.0)
    penalty: float = Field(ge=0.0)


class ScoreComponents(ApiModel):
    by_kind: dict[str, ScoreComponentBucket]
    by_severity: dict[str, ScoreComponentBucket]
    by_column: dict[str, ScoreComponentBucket]
    overall_penalty_total: float = Field(ge=0.0)
    overall_penalty_normalized: float = Field(ge=0.0, le=1.0)
    column_count: int = Field(ge=0)
    per_finding: list[PerFindingScore] = Field(default_factory=list)


class QualityScoreResponse(ApiModel):
    score_id: UUID
    dataset_id: UUID
    dataset_version_id: UUID
    profile_id: UUID
    finding_count: int = Field(ge=0)
    score: float = Field(ge=0.0, le=100.0)
    grade: QualityGrade
    formula_version: str
    components: ScoreComponents
    created_at: str


class QualityScoreListResponse(ApiModel):
    items: list[QualityScoreResponse]
    pagination: Pagination


# Re-export a couple of types so callers have a single import surface.
__all__ = [
    "PerFindingScore",
    "QualityGrade",
    "QualityScoreListResponse",
    "QualityScoreResponse",
    "ScoreComponentBucket",
    "ScoreComponents",
]
