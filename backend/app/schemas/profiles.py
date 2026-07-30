"""Profile API schemas (Task 3)."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import Field

from app.schemas.common import ApiModel
from app.schemas.datasets import Pagination

ColumnSamplingFlag = Literal["full", "sampled"]


class TopValueResponse(ApiModel):
    value: str
    count: int
    frequency: float


class NumericMetricsResponse(ApiModel):
    min: float | None = None
    max: float | None = None
    mean: float | None = None
    median: float | None = None
    std: float | None = None
    sum: float | None = None


class TemporalMetricsResponse(ApiModel):
    min: str | None = None
    max: str | None = None


class StringLengthMetricsResponse(ApiModel):
    min: int | None = None
    max: int | None = None
    mean: float | None = None


class ColumnProfileMetricsResponse(ApiModel):
    physical_type: str
    sample_size: int
    non_null_count: int
    null_count: int
    null_rate: float
    distinct_count: int
    distinct_rate: float
    top_values: list[TopValueResponse] = Field(default_factory=list)
    numeric: NumericMetricsResponse
    temporal: TemporalMetricsResponse
    string_length: StringLengthMetricsResponse


class ColumnProfileResponse(ApiModel):
    name: str
    ordinal_position: int = Field(ge=1)
    metrics: ColumnProfileMetricsResponse


class DatasetProfileResponse(ApiModel):
    profile_id: UUID
    dataset_id: UUID
    dataset_version_id: UUID
    sample_size: int
    sampled: ColumnSamplingFlag
    started_at: str
    completed_at: str
    duration_ms: int
    columns: list[ColumnProfileResponse]


class DatasetProfileListResponse(ApiModel):
    items: list[DatasetProfileResponse]
    pagination: Pagination
