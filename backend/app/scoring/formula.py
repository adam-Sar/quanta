"""Deterministic quality scoring formula (Task 5).

The formula is intentionally simple, explainable, and pure. It takes a
tuple of Task 4 ``Finding`` rows for one profile run plus the total
column count of the dataset version and returns a ``DatasetQualityScore``
object containing the overall 0-100 score, a letter grade, and a
decomposable breakdown by kind, severity, and column.

The formula and the rationale are also documented in
``backend/docs/scoring.md``; keep that document in sync with this file.

Summary
-------

For every finding:

    detection_confidence = clamp((value - threshold) / max(threshold, eps), 0, 1)
    data_error_confidence = kind-specific heuristic in [0, 1]
    severity_weight      = SEVERITY_WEIGHTS[finding.severity]
    penalty              = severity_weight * detection_confidence * data_error_confidence

Aggregated:

    total_penalty        = sum(penalties)
    divisor              = max(column_count, 1)
    normalized_penalty   = min(1.0, total_penalty / divisor)
    score                = round(100 * (1 - normalized_penalty), 2)
    grade                = first GRADE_THRESHOLDS whose lower bound is <= score

When there are no findings, the score is 100.0 and the grade is A.

The two confidence concepts are documented in
``backend/docs/scoring.md`` and exposed in the ``components`` JSONB so
consumers (and Task 7 AI) can inspect them per finding without
recomputing.
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Final, cast

from app.detection.types import Finding, FindingKind, FindingSeverity
from app.scoring.types import (
    GRADE_THRESHOLDS,
    SCORING_FORMULA_VERSION,
    SEVERITY_WEIGHTS,
    DatasetQualityScore,
    FindingConfidence,
    QualityGrade,
    ScoreBreakdown,
    ScoreComponents,
    ScoredFinding,
)

# Small constant that protects the detection-confidence divisor from a
# zero threshold without fudging the math for typical inputs.
_EPS: Final[float] = 1e-9


def _clamp01(value: float) -> float:
    """Clamp ``value`` to the closed unit interval."""

    if value < 0.0:
        return 0.0
    if value > 1.0:
        return 1.0
    return value


def detection_confidence(value: float, threshold: float) -> float:
    """Confidence in the measured anomaly, derived from how far the
    observed value sits above the configured threshold.

    The result is clamped to ``[0, 1]``. A value exactly at the
    threshold yields 0.0; a value at ``2 * threshold`` yields 1.0;
    larger excess stays at 1.0. Threshold is clamped to ``max(threshold, eps)``
    so a zero threshold still produces a meaningful curve.
    """

    safe_threshold = threshold if threshold > _EPS else _EPS
    return _clamp01((value - safe_threshold) / safe_threshold)


# Kind-specific heuristics for ``data_error_confidence``. These are
# conservative defaults that err on the side of "more evidence
# required" rather than over-claiming errors. A later task may swap
# them for evidence-backed ratios (for example ``null_count /
# non_null_count``).
def data_error_confidence(kind: FindingKind, value: float) -> float:
    """Confidence that the anomaly is an actual data error.

    All heuristics return a value in ``[0, 1]``. They are deliberately
    monotonic in the observed value so they remain easy to reason about.
    """

    if kind is FindingKind.MISSINGNESS:
        # More missing values is more likely to be a real error; a tiny
        # rate past threshold is still suspicious but not conclusive.
        return _clamp01(0.55 + 0.45 * value)
    if kind is FindingKind.INVALID_VALUES:
        # Placeholder values (N/A, null, ...) are strong indicators of
        # dirty data.
        return _clamp01(0.75 + 0.25 * _clamp01(value / 5.0))
    if kind is FindingKind.OUTLIER:
        # Outliers may be legitimate; require a strong signal.
        return _clamp01(0.50 + 0.30 * _clamp01(value))
    if kind is FindingKind.DUPLICATES:
        # Duplicates may be intentional (history tables, slow-changing
        # dimensions). Treat as a moderate signal.
        return _clamp01(0.50 + 0.25 * _clamp01(value))
    if kind is FindingKind.CARDINALITY:
        # High cardinality is informational; require a strong signal
        # before calling it an error.
        return _clamp01(0.40 + 0.20 * _clamp01(value))
    # Unreachable for the current enum; kept as a safety net for future
    # detector additions before ``FindingKind`` is updated.
    return 0.5  # type: ignore[unreachable]


def confidence_for(finding: Finding) -> FindingConfidence:
    """Return the two confidence values for a single finding."""

    return FindingConfidence(
        detection_confidence=detection_confidence(finding.value, finding.threshold),
        data_error_confidence=data_error_confidence(finding.kind, finding.value),
    )


def _penalty_for(finding: Finding, confidence: FindingConfidence) -> float:
    """Return the penalty contribution for one scored finding."""

    weight = SEVERITY_WEIGHTS[finding.severity]
    return weight * confidence.detection_confidence * confidence.data_error_confidence


def _grade_for(score: float) -> QualityGrade:
    """Pick the letter grade for a 0-100 score."""

    for lower_bound, grade in GRADE_THRESHOLDS:
        if score >= lower_bound:
            return grade
    return QualityGrade.F


def _aggregate(
    entries: Iterable[tuple[str, float]],
    *,
    divisor: int,
) -> dict[str, ScoreBreakdown]:
    """Build a ``{key: ScoreBreakdown}`` mapping from raw penalty sums."""

    totals: dict[str, float] = {}
    counts: dict[str, int] = {}
    for key, penalty in entries:
        totals[key] = totals.get(key, 0.0) + penalty
        counts[key] = counts.get(key, 0) + 1
    safe_divisor = max(divisor, 1)
    return {
        key: ScoreBreakdown(
            count=counts[key],
            penalty_total=totals[key],
            penalty_normalized=min(1.0, totals[key] / safe_divisor),
        )
        for key in totals
    }


def compute_quality_score(
    *,
    dataset_id: object,
    dataset_version_id: object,
    profile_id: object,
    findings: Iterable[Finding],
    column_count: int,
) -> DatasetQualityScore:
    """Run the deterministic scoring formula over an immutable finding batch.

    Parameters
    ----------
    dataset_id, dataset_version_id, profile_id:
        Identifiers copied verbatim into the result so the persisted row
        can be traced back to its source. The ``object`` annotation lets
        callers pass UUIDs or any UUID-like value without coupling the
        formula to ``uuid.UUID``.
    findings:
        The Task 4 finding rows for this profile. Order does not matter.
    column_count:
        Number of columns in the dataset version. Used as the
        normalization divisor so that adding clean columns cannot dilute
        a critical anomaly's contribution and small datasets are not
        unfairly penalized.

    Returns
    -------
    DatasetQualityScore
        A frozen, fully decomposed score object ready to be persisted.
    """

    materialised = tuple(findings)
    divisor = max(int(column_count), 1)
    scored: list[ScoredFinding] = []
    by_kind: list[tuple[str, float]] = []
    by_severity: list[tuple[str, float]] = []
    by_column: list[tuple[str, float]] = []
    total_penalty = 0.0
    for finding in materialised:
        confidence = confidence_for(finding)
        penalty = _penalty_for(finding, confidence)
        scored.append(ScoredFinding(finding=finding, confidence=confidence, penalty=penalty))
        total_penalty += penalty
        by_kind.append((finding.kind, penalty))
        by_severity.append((finding.severity, penalty))
        column_key = finding.column_name or "<dataset>"
        by_column.append((column_key, penalty))

    overall_normalized = min(1.0, total_penalty / divisor)
    score_value = round(100.0 * (1.0 - overall_normalized), 2)
    grade = _grade_for(score_value)
    # ``_aggregate`` returns ``dict[str, ScoreBreakdown]``; we cast here
    # because we built the keys from real ``FindingKind`` /
    # ``FindingSeverity`` members and string column names.
    components = ScoreComponents(
        by_kind=cast(dict[FindingKind, ScoreBreakdown], _aggregate(by_kind, divisor=divisor)),
        by_severity=cast(
            dict[FindingSeverity, ScoreBreakdown], _aggregate(by_severity, divisor=divisor)
        ),
        by_column=_aggregate(by_column, divisor=divisor),
        overall_penalty_total=round(total_penalty, 6),
        overall_penalty_normalized=round(overall_normalized, 6),
        column_count=divisor,
    )

    return DatasetQualityScore(
        dataset_id=dataset_id,  # type: ignore[arg-type]
        dataset_version_id=dataset_version_id,  # type: ignore[arg-type]
        profile_id=profile_id,  # type: ignore[arg-type]
        finding_count=len(materialised),
        scored_findings=tuple(scored),
        score=score_value,
        grade=grade,
        components=components,
        formula_version=SCORING_FORMULA_VERSION,
    )


# Re-export so callers can grab the documented constants in one import.
__all__ = [
    "GRADE_THRESHOLDS",
    "SCORING_FORMULA_VERSION",
    "SEVERITY_WEIGHTS",
    "compute_quality_score",
    "confidence_for",
    "data_error_confidence",
    "detection_confidence",
]
