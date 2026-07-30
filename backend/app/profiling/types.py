"""Profiling domain types.

These dataclasses are returned by the profile metrics module and consumed
by the ProfilingService. They are deliberately separate from the
SQLAlchemy models and the API schemas.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any
from uuid import UUID


class ColumnSamplingFlag(StrEnum):
    """Whether a profile was computed on the full file or a bounded sample."""

    FULL = "full"
    SAMPLED = "sampled"


@dataclass(frozen=True, slots=True)
class NumericColumnStats:
    """Summary statistics for numeric columns. Values are optional
    because non-numeric columns do not produce them.
    """

    min_value: float | None = None
    max_value: float | None = None
    mean_value: float | None = None
    median_value: float | None = None
    std_deviation: float | None = None
    sum_value: float | None = None


@dataclass(frozen=True, slots=True)
class TemporalColumnStats:
    """Date / datetime range summary for temporal columns."""

    min_value: str | None = None
    max_value: str | None = None


@dataclass(frozen=True, slots=True)
class StringLengthStats:
    """Length distribution summary for string columns."""

    min_length: int | None = None
    max_length: int | None = None
    mean_length: float | None = None


@dataclass(frozen=True, slots=True)
class ValueFrequency:
    """Single entry of a top-values frequency distribution."""

    value: str
    count: int
    frequency: float


@dataclass(frozen=True, slots=True)
class ColumnProfileResult:
    """Computed metrics for one column of a dataset version."""

    name: str
    ordinal_position: int
    physical_type: str
    non_null_count: int
    null_count: int
    null_rate: float
    distinct_count: int
    distinct_rate: float
    sample_size: int
    top_values: tuple[ValueFrequency, ...]
    numeric: NumericColumnStats = field(default_factory=NumericColumnStats)
    temporal: TemporalColumnStats = field(default_factory=TemporalColumnStats)
    string_length: StringLengthStats = field(default_factory=StringLengthStats)
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class DatasetProfileResult:
    """Result of a single profile run over one dataset version."""

    dataset_id: UUID
    dataset_version_id: UUID
    sample_size: int
    sampled: ColumnSamplingFlag
    started_at: str
    completed_at: str
    duration_ms: int
    columns: tuple[ColumnProfileResult, ...]


@dataclass(frozen=True, slots=True)
class DatasetVersionProfile:
    """Domain representation of a persisted profile artifact, with a
    stored `metadata` blob for the per-column JSONB metrics.
    """

    profile_id: UUID
    dataset_id: UUID
    dataset_version_id: UUID
    sample_size: int
    sampled: ColumnSamplingFlag
    started_at: str
    completed_at: str
    duration_ms: int
    columns: tuple["PersistedColumnProfile", ...]


@dataclass(frozen=True, slots=True)
class PersistedColumnProfile:
    """A column profile entry returned to the API."""

    name: str
    ordinal_position: int
    metrics: dict[str, Any]
