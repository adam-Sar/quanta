"""History domain types (Task 6).

Frozen dataclasses describe the deterministic comparison between two
dataset versions. They are deliberately separate from the SQLAlchemy
model and the Pydantic API schemas.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Literal
from uuid import UUID

# Documented schema change taxonomy. ``type_changed`` covers both
# physical Polars types (for example ``Int64`` to ``Float64``) and
# Parquet logical types; the comparison only inspects the stored
# ``physical_type`` and ``logical_type`` strings.
SCHEMA_CHANGE_TYPES = ("added", "removed", "type_changed")


class DriftSeverity(StrEnum):
    """Documented drift severity bands.

    Numeric thresholds and the rationale live in
    ``backend/docs/history.md``. The bands are intentionally coarser
    than the Task 4 finding severities so consumers can quickly tell
    whether a comparison warrants attention.
    """

    INFO = "info"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


# Documented thresholds (Task 6). Bump ``HISTORY_FORMULA_VERSION`` when
# any of these change in a non-backward-compatible way.
DEFAULT_NUMERIC_RELATIVE_CHANGE_MEDIUM: float = 0.20
DEFAULT_NUMERIC_RELATIVE_CHANGE_HIGH: float = 0.50
DEFAULT_CATEGORICAL_PSI_LOW: float = 0.10
DEFAULT_CATEGORICAL_PSI_MEDIUM: float = 0.20
DEFAULT_SCORE_DELTA_LOW: float = 5.0
DEFAULT_SCORE_DELTA_MEDIUM: float = 10.0
DEFAULT_SCORE_DELTA_HIGH: float = 20.0


HISTORY_FORMULA_VERSION: str = "task6-1.0"


@dataclass(frozen=True, slots=True)
class ColumnDiff:
    """A single column-level schema change."""

    name: str
    change: Literal["added", "removed", "type_changed"]
    base_physical_type: str | None
    target_physical_type: str | None
    base_logical_type: str | None
    target_logical_type: str | None


@dataclass(frozen=True, slots=True)
class SchemaDiff:
    """Schema-level differences between two versions."""

    added: tuple[str, ...] = field(default_factory=tuple)
    removed: tuple[str, ...] = field(default_factory=tuple)
    type_changes: tuple[ColumnDiff, ...] = field(default_factory=tuple)

    @property
    def is_empty(self) -> bool:
        return not (self.added or self.removed or self.type_changes)


@dataclass(frozen=True, slots=True)
class NumericDrift:
    """A single numeric drift signal between two column profiles."""

    column: str
    metric: Literal["mean", "median", "std", "min", "max"]
    base_value: float | None
    target_value: float | None
    absolute_change: float | None
    relative_change: float | None


@dataclass(frozen=True, slots=True)
class CategoricalDrift:
    """A single categorical drift signal computed via PSI.

    PSI is the population-stability index: ``sum((p_target - p_base) *
    ln(p_target / p_base))``. We only consider the union of the top
    values from the two sides to keep the test bounded.
    """

    column: str
    metric: Literal["psi"]
    psi: float
    base_top_values: tuple[tuple[str, int], ...]
    target_top_values: tuple[tuple[str, int], ...]


@dataclass(frozen=True, slots=True)
class DistributionDrift:
    """All per-column distribution drift signals between two profiles."""

    numeric: tuple[NumericDrift, ...] = field(default_factory=tuple)
    categorical: tuple[CategoricalDrift, ...] = field(default_factory=tuple)

    @property
    def is_empty(self) -> bool:
        return not (self.numeric or self.categorical)


@dataclass(frozen=True, slots=True)
class ScoreDrift:
    """The change in the Task 5 0-100 score between two scoring runs."""

    base_score: float | None
    target_score: float | None
    delta: float | None
    absolute_delta: float | None
    base_grade: str | None
    target_grade: str | None
    grade_changed: bool

    @property
    def is_empty(self) -> bool:
        return self.base_score is None and self.target_score is None


@dataclass(frozen=True, slots=True)
class DatasetComparison:
    """A complete comparison between two dataset versions."""

    dataset_id: UUID
    base_version_id: UUID
    target_version_id: UUID
    schema_diff: SchemaDiff
    distribution_drift: DistributionDrift
    score_drift: ScoreDrift
    formula_version: str
    created_at: datetime

    @property
    def has_drift(self) -> bool:
        return (
            not self.schema_diff.is_empty
            or not self.distribution_drift.is_empty
            or not self.score_drift.is_empty
        )


@dataclass(frozen=True, slots=True)
class PersistedHistoryComparison:
    """Domain shape of a history comparison row loaded from PostgreSQL."""

    comparison_id: UUID
    dataset_id: UUID
    base_version_id: UUID
    target_version_id: UUID
    schema_diff: SchemaDiff
    distribution_drift: DistributionDrift
    score_drift: ScoreDrift
    formula_version: str
    created_at: datetime


@dataclass(frozen=True, slots=True)
class LineageEdge:
    """A directed edge in a dataset's version chain.

    ``to_version`` was created by uploading a new file in place of
    ``from_version``. Edges are derived from the version numbers; they
    are not persisted.
    """

    dataset_id: object  # ``UUID`` in production; loose to support tests.
    from_version_id: object  # ``UUID`` in production.
    from_version_number: int
    from_created_at: datetime
    to_version_id: object  # ``UUID`` in production.
    to_version_number: int
    to_created_at: datetime


__all__ = [
    "DEFAULT_CATEGORICAL_PSI_LOW",
    "DEFAULT_CATEGORICAL_PSI_MEDIUM",
    "DEFAULT_NUMERIC_RELATIVE_CHANGE_HIGH",
    "DEFAULT_NUMERIC_RELATIVE_CHANGE_MEDIUM",
    "DEFAULT_SCORE_DELTA_HIGH",
    "DEFAULT_SCORE_DELTA_LOW",
    "DEFAULT_SCORE_DELTA_MEDIUM",
    "HISTORY_FORMULA_VERSION",
    "SCHEMA_CHANGE_TYPES",
    "CategoricalDrift",
    "ColumnDiff",
    "DatasetComparison",
    "DistributionDrift",
    "DriftSeverity",
    "LineageEdge",
    "NumericDrift",
    "PersistedHistoryComparison",
    "SchemaDiff",
    "ScoreDrift",
]
