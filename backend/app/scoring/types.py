"""Scoring domain types (Task 5).

These dataclasses describe the deterministic scoring result. They are
deliberately separate from the SQLAlchemy model and the Pydantic API
schemas. All dataclasses are frozen so a score object cannot be
accidentally mutated after computation.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any
from uuid import UUID

from app.detection.types import Finding, FindingKind, FindingSeverity


class QualityGrade(StrEnum):
    """Letter grade derived from the deterministic 0-100 score."""

    A = "A"
    B = "B"
    C = "C"
    D = "D"
    F = "F"


# Documented severity weights (Task 5). Critical anomalies are weighted
# most heavily; INFO anomalies only nudge the score. See
# ``backend/docs/scoring.md`` for the full formula and rationale.
SEVERITY_WEIGHTS: dict[FindingSeverity, float] = {
    FindingSeverity.CRITICAL: 1.0,
    FindingSeverity.HIGH: 0.75,
    FindingSeverity.MEDIUM: 0.45,
    FindingSeverity.LOW: 0.20,
    FindingSeverity.INFO: 0.05,
}

# Grade thresholds (Task 5). Each grade includes the lower bound. A
# score of exactly 90.0 is an A; exactly 75.0 is a B; etc.
GRADE_THRESHOLDS: tuple[tuple[float, QualityGrade], ...] = (
    (90.0, QualityGrade.A),
    (75.0, QualityGrade.B),
    (60.0, QualityGrade.C),
    (40.0, QualityGrade.D),
    (0.0, QualityGrade.F),
)

# Documented formula version. Bump when severity weights or
# normalization change in a way that is not backward compatible.
SCORING_FORMULA_VERSION = "task5-1.0"


@dataclass(frozen=True, slots=True)
class FindingConfidence:
    """Two confidence concepts for a single finding.

    ``detection_confidence`` answers "how certain is the measured
    anomaly?" It grows as the observed value moves further past the
    configured threshold.

    ``data_error_confidence`` answers "how certain is it that this is
    actually wrong?" It is a heuristic that depends on the detector
    kind; a missing-value rate near 1.0 is almost certainly an error,
    while a moderate duplicate rate may be intentional.
    """

    detection_confidence: float
    data_error_confidence: float


@dataclass(frozen=True, slots=True)
class ScoredFinding:
    """One Task 4 finding annotated with its scoring contributions."""

    finding: Finding
    confidence: FindingConfidence
    penalty: float


@dataclass(frozen=True, slots=True)
class ScoreBreakdown:
    """A small aggregate over a set of scored findings."""

    count: int
    penalty_total: float
    penalty_normalized: float


@dataclass(frozen=True, slots=True)
class ScoreComponents:
    """Decomposable score breakdown.

    Every bucket has the same shape (``ScoreBreakdown``); the normalized
    penalty is computed against the same divisor (number of scored
    columns in the dataset, with at least 1 to avoid division by zero)
    so that the buckets sum to the overall penalty contribution.
    """

    by_kind: dict[FindingKind, ScoreBreakdown] = field(default_factory=dict)
    by_severity: dict[FindingSeverity, ScoreBreakdown] = field(default_factory=dict)
    by_column: dict[str, ScoreBreakdown] = field(default_factory=dict)
    overall_penalty_total: float = 0.0
    overall_penalty_normalized: float = 0.0
    column_count: int = 0

    def to_dict(self) -> dict[str, Any]:
        """Return a JSON-safe dict for the JSONB ``components`` column.

        Keys may be ``FindingKind`` / ``FindingSeverity`` enums or plain
        strings; both are accepted defensively so the JSONB column never
        stores unrenderable enum instances.
        """

        def _bucket(bucket: ScoreBreakdown) -> dict[str, Any]:
            return {
                "count": bucket.count,
                "penalty_total": bucket.penalty_total,
                "penalty_normalized": bucket.penalty_normalized,
            }

        def _key(value: object) -> str:
            return value.value if hasattr(value, "value") else str(value)

        return {
            "by_kind": {_key(kind): _bucket(b) for kind, b in self.by_kind.items()},
            "by_severity": {_key(sev): _bucket(b) for sev, b in self.by_severity.items()},
            "by_column": {_key(col): _bucket(b) for col, b in self.by_column.items()},
            "overall_penalty_total": self.overall_penalty_total,
            "overall_penalty_normalized": self.overall_penalty_normalized,
            "column_count": self.column_count,
        }


@dataclass(frozen=True, slots=True)
class DatasetQualityScore:
    """Deterministic 0-100 score plus its decomposition."""

    dataset_id: UUID
    dataset_version_id: UUID
    profile_id: UUID
    finding_count: int
    scored_findings: tuple[ScoredFinding, ...]
    score: float
    grade: QualityGrade
    components: ScoreComponents
    formula_version: str


@dataclass(frozen=True, slots=True)
class PersistedQualityScore:
    """Domain shape of a scoring row loaded from PostgreSQL."""

    score_id: UUID
    dataset_id: UUID
    dataset_version_id: UUID
    profile_id: UUID
    finding_count: int
    score: float
    grade: QualityGrade
    formula_version: str
    components: dict[str, Any]


__all__ = [
    "GRADE_THRESHOLDS",
    "SCORING_FORMULA_VERSION",
    "SEVERITY_WEIGHTS",
    "DatasetQualityScore",
    "FindingConfidence",
    "PersistedQualityScore",
    "QualityGrade",
    "ScoreBreakdown",
    "ScoreComponents",
    "ScoredFinding",
]
