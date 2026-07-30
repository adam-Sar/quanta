"""Detection domain types.

These dataclasses are produced by the deterministic detectors and
consumed by the detection service. They are deliberately separate from
the SQLAlchemy model and the Pydantic API schemas.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any
from uuid import UUID


class FindingKind(StrEnum):
    """The category of quality issue that produced the finding."""

    MISSINGNESS = "missingness"
    DUPLICATES = "duplicates"
    INVALID_VALUES = "invalid_values"
    OUTLIER = "outlier"
    CARDINALITY = "cardinality"


class FindingSeverity(StrEnum):
    """Deterministic severity band. AI severity is a later task."""

    INFO = "info"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass(frozen=True, slots=True)
class Finding:
    """A single quality finding produced by one detector for one column.

    Findings are immutable. Re-running detection creates a new set of
    Finding rows; existing rows are not mutated.

    ``id`` is optional because the domain dataclass is also produced by
    pure code paths that do not have a persisted UUID (for example,
    the Task 8 recommendation rule engine). Service layers that read
    a persisted ``Finding`` row populate ``id`` from the ORM row.
    """

    id: UUID | None = None
    kind: FindingKind = FindingKind.MISSINGNESS
    severity: FindingSeverity = FindingSeverity.INFO
    column_name: str | None = None
    metric: str = ""
    value: float = 0.0
    threshold: float = 0.0
    description: str = ""
    details: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class DetectorResult:
    """The output of a single detector run over one DatasetProfile."""

    kind: FindingKind
    findings: tuple[Finding, ...]


@dataclass(frozen=True, slots=True)
class DatasetDetectionResult:
    """Domain container for the per-profile detection run."""

    dataset_id: UUID
    dataset_version_id: UUID
    profile_id: UUID
    findings: tuple[Finding, ...]


@dataclass(frozen=True, slots=True)
class PersistedFinding:
    """Domain shape of a finding row loaded from PostgreSQL."""

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
    details: dict[str, Any]
