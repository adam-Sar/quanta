"""Finding API schemas (Task 4)."""

from __future__ import annotations

from typing import Any, Literal
from uuid import UUID

from pydantic import Field

from app.schemas.common import ApiModel
from app.schemas.datasets import Pagination

FindingKind = Literal["missingness", "duplicates", "invalid_values", "outlier", "cardinality"]
FindingSeverity = Literal["info", "low", "medium", "high", "critical"]


class FindingResponse(ApiModel):
    finding_id: UUID
    dataset_id: UUID
    dataset_version_id: UUID
    profile_id: UUID
    kind: FindingKind
    severity: FindingSeverity
    column_name: str | None
    metric: str
    value: float
    threshold: float
    description: str
    details: dict[str, Any] = Field(default_factory=dict)


class FindingListResponse(ApiModel):
    items: list[FindingResponse]
    pagination: Pagination


class DetectionRunResponse(ApiModel):
    dataset_id: UUID
    profile_id: UUID
    finding_count: int
    findings: list[FindingResponse]
