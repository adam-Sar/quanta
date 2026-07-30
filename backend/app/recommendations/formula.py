"""Deterministic recommendation rule engine (Task 8).

The rule engine maps the immutable Task 4 finding rows to a small set
of structured, preview-only recommendations. It never re-profiles
data, never executes code on the dataset, and never calls an LLM.
The mapping is intentionally simple and explainable: each finding kind
is converted into one or more recommendations, with severity and
confidence derived from the source finding's deterministic fields.

Summary
-------

For every persisted finding bound to the latest profile, the engine
applies a per-kind rule:

* ``missingness`` with severity ``critical`` / ``high`` (or value ``>=
  0.8``)  -> ``DROP_COLUMN`` (the column is too sparse to be useful).
* ``missingness`` with severity ``medium``                  -> ``IMPUTE_MISSING``
  with ``strategy=mean|median|mode`` chosen from the column's
  physical type.
* ``missingness`` with severity ``low`` / ``info``           -> ``REVIEW``.
* ``duplicates`` of any severity                            -> ``DROP_DUPLICATES``.
* ``invalid_values`` of any severity                        -> ``CAST_TYPE`` (when
  the column type looks compatible) or ``REVIEW``.
* ``outlier`` with severity ``critical`` / ``high``         -> ``CAP_OUTLIERS``
  at the configured threshold.
* ``outlier`` with severity ``medium`` or lower             -> ``REVIEW``.
* ``cardinality`` of any severity                           -> ``GROUP_RARE_CATEGORICAL``.

Each recommendation carries:

* ``confidence`` = ``detection_confidence * data_error_confidence``
  using the documented Task 5 helpers, bounded to ``[0, 1]``.
* ``priority``   = an integer ordering signal derived from severity
  weight and confidence.
* ``affected_columns`` / ``supporting_finding_ids`` = source pointers
  that let consumers audit the recommendation.

The components JSONB stored alongside each run captures per-kind,
per-severity, and per-finding contributions so the recommendation
output is fully decomposable.

Thresholds and weights live as constants below. Bump
``RECOMMENDATION_FORMULA_VERSION`` whenever any of them change in a
non-backward-compatible way.
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Final
from uuid import UUID

from app.detection.types import Finding, FindingKind, FindingSeverity
from app.recommendations.types import (
    RECOMMENDATION_FORMULA_VERSION,
    OperationKind,
    Recommendation,
    RecommendationKind,
    RecommendationOperation,
    RecommendationRun,
    RecommendationSeverity,
)
from app.scoring.formula import (
    confidence_for,
)
from app.scoring.types import FindingConfidence

# Severity weight table used to derive ``priority``. Mirrors the Task 5
# scoring weights so the priority signal stays consistent with the
# existing 0-100 score.
SEVERITY_WEIGHTS: Final[dict[RecommendationSeverity, int]] = {
    RecommendationSeverity.CRITICAL: 100,
    RecommendationSeverity.HIGH: 75,
    RecommendationSeverity.MEDIUM: 45,
    RecommendationSeverity.LOW: 20,
    RecommendationSeverity.INFO: 5,
}

# Mapping from a Task 4 finding kind to the recommendation kind the
# rule engine produces. The keys mirror ``FindingKind.values``.
_KIND_MAP: Final[dict[FindingKind, RecommendationKind]] = {
    FindingKind.MISSINGNESS: RecommendationKind.MISSINGNESS_TREATMENT,
    FindingKind.DUPLICATES: RecommendationKind.DUPLICATE_REMOVAL,
    FindingKind.INVALID_VALUES: RecommendationKind.DATA_QUALITY_FIX,
    FindingKind.OUTLIER: RecommendationKind.OUTLIER_TREATMENT,
    FindingKind.CARDINALITY: RecommendationKind.CARDINALITY_REDUCTION,
}

# Mapping from a Task 4 finding severity to the recommendation
# severity the rule engine records.
_SEVERITY_MAP: Final[dict[FindingSeverity, RecommendationSeverity]] = {
    FindingSeverity.CRITICAL: RecommendationSeverity.CRITICAL,
    FindingSeverity.HIGH: RecommendationSeverity.HIGH,
    FindingSeverity.MEDIUM: RecommendationSeverity.MEDIUM,
    FindingSeverity.LOW: RecommendationSeverity.LOW,
    FindingSeverity.INFO: RecommendationSeverity.INFO,
}

# Tunable thresholds. All are documented in
# ``backend/docs/recommendations.md``.
MISSING_DROP_VALUE_THRESHOLD: Final[float] = 0.80
MISSING_DROP_SEVERITIES: Final[frozenset[RecommendationSeverity]] = frozenset(
    {RecommendationSeverity.CRITICAL, RecommendationSeverity.HIGH}
)
OUTLIER_CAP_SEVERITIES: Final[frozenset[RecommendationSeverity]] = frozenset(
    {RecommendationSeverity.CRITICAL, RecommendationSeverity.HIGH}
)

# Numeric ``metric`` substrings that strongly suggest the column holds
# numeric data and should be imputed with ``mean`` or ``median``.
_NUMERIC_METRICS: Final[frozenset[str]] = frozenset(
    {"mean", "median", "std", "min", "max", "sum"}
)


def _supporting_ids(finding: Finding) -> tuple[UUID, ...]:
    """Return ``(finding.id,)`` if the persisted UUID is set, else ``()``."""

    return (finding.id,) if finding.id is not None else ()


def _recommendation_severity_for(finding: Finding) -> RecommendationSeverity:
    severity = finding.severity
    if isinstance(severity, FindingSeverity):
        return _SEVERITY_MAP[severity]
    # Defensive fallback for non-enum values (should never happen for
    # persisted rows; kept for defensive unit tests).
    return _SEVERITY_MAP[FindingSeverity(str(severity))]  # type: ignore[unreachable]


def _confidence(finding: Finding) -> FindingConfidence:
    """Return the Task 5 confidence for a finding."""

    return confidence_for(finding)


def _impute_strategy(finding: Finding) -> str:
    """Pick an imputation strategy from the finding's metric column.

    Falls back to ``mode`` so the recommendation is always safe; mode
    imputation never produces out-of-range values.
    """

    metric = (finding.metric or "").lower()
    if metric in _NUMERIC_METRICS:
        return "mean"
    return "mode"


def _build_missingness_recommendation(
    finding: Finding,
    *,
    confidence: FindingConfidence,
    priority: int,
) -> Recommendation:
    severity = _recommendation_severity_for(finding)
    column = finding.column_name or "<dataset>"
    if severity in MISSING_DROP_SEVERITIES or finding.value >= MISSING_DROP_VALUE_THRESHOLD:
        operation_kind = OperationKind.DROP_COLUMN
        title = f"Drop sparse column '{column}'"
        rationale = (
            f"Column '{column}' has a null rate of {finding.value:.4f}, which is above the "
            f"safe operating threshold ({MISSING_DROP_VALUE_THRESHOLD:.2f}). Drop the column "
            "after confirming no downstream consumer depends on it."
        )
        operation = RecommendationOperation(
            kind=operation_kind,
            params={"column": column, "strategy": "drop"},
        )
        return Recommendation(
            kind=RecommendationKind.MISSINGNESS_TREATMENT,
            severity=severity,
            title=title,
            rationale=rationale,
            affected_columns=(column,),
            supporting_finding_ids=_supporting_ids(finding),
            confidence=round(confidence.detection_confidence * confidence.data_error_confidence, 4),
            priority=priority,
            operation=operation,
        )
    if severity is RecommendationSeverity.MEDIUM:
        strategy = _impute_strategy(finding)
        return Recommendation(
            kind=RecommendationKind.MISSINGNESS_TREATMENT,
            severity=severity,
            title=f"Impute missing values in '{column}'",
            rationale=(
                f"Column '{column}' has a null rate of {finding.value:.4f}, exceeding the "
                f"configured threshold ({finding.threshold:.4f}). Impute using '{strategy}' to "
                "preserve row coverage while keeping the column usable."
            ),
            affected_columns=(column,),
            supporting_finding_ids=_supporting_ids(finding),
            confidence=round(
                confidence.detection_confidence * confidence.data_error_confidence, 4
            ),
            priority=priority,
            operation=RecommendationOperation(
                kind=OperationKind.IMPUTE_MISSING,
                params={"column": column, "strategy": strategy},
            ),
        )
    return Recommendation(
        kind=RecommendationKind.MISSINGNESS_TREATMENT,
        severity=severity,
        title=f"Review null rate for '{column}'",
        rationale=(
            f"Column '{column}' has a null rate of {finding.value:.4f}. The signal is mild "
            "and may be intentional; review upstream sources before acting."
        ),
        affected_columns=(column,),
        supporting_finding_ids=_supporting_ids(finding),
        confidence=round(confidence.detection_confidence * confidence.data_error_confidence, 4),
        priority=priority,
        operation=RecommendationOperation(
            kind=OperationKind.REVIEW,
            params={"column": column, "reason": "low_severity_missingness"},
        ),
    )


def _build_duplicates_recommendation(
    finding: Finding,
    *,
    confidence: FindingConfidence,
    priority: int,
) -> Recommendation:
    severity = _recommendation_severity_for(finding)
    return Recommendation(
        kind=RecommendationKind.DUPLICATE_REMOVAL,
        severity=severity,
        title="Drop exact duplicate rows",
        rationale=(
            f"Duplicate rate of {finding.value:.4f} exceeds the configured threshold "
            f"({finding.threshold:.4f}). Drop exact duplicate rows in the new version "
            "after confirming the rows are not slow-changing dimensions."
        ),
        affected_columns=("<dataset>",),
        supporting_finding_ids=_supporting_ids(finding),
        confidence=round(confidence.detection_confidence * confidence.data_error_confidence, 4),
        priority=priority,
        operation=RecommendationOperation(
            kind=OperationKind.DROP_DUPLICATES,
            params={"scope": "exact_rows"},
        ),
    )


def _build_invalid_values_recommendation(
    finding: Finding,
    *,
    confidence: FindingConfidence,
    priority: int,
) -> Recommendation:
    severity = _recommendation_severity_for(finding)
    column = finding.column_name or "<dataset>"
    return Recommendation(
        kind=RecommendationKind.DATA_QUALITY_FIX,
        severity=severity,
        title=f"Cast or normalize column '{column}'",
        rationale=(
            f"Column '{column}' reports {finding.value:.4f} invalid values above the "
            f"configured threshold ({finding.threshold:.4f}). Cast to the documented "
            "physical type or replace placeholders with NULL before re-running detection."
        ),
        affected_columns=(column,),
        supporting_finding_ids=_supporting_ids(finding),
        confidence=round(confidence.detection_confidence * confidence.data_error_confidence, 4),
        priority=priority,
        operation=RecommendationOperation(
            kind=OperationKind.CAST_TYPE,
            params={"column": column, "reason": "invalid_values"},
        ),
    )


def _build_outlier_recommendation(
    finding: Finding,
    *,
    confidence: FindingConfidence,
    priority: int,
) -> Recommendation:
    severity = _recommendation_severity_for(finding)
    column = finding.column_name or "<dataset>"
    if severity in OUTLIER_CAP_SEVERITIES:
        return Recommendation(
            kind=RecommendationKind.OUTLIER_TREATMENT,
            severity=severity,
            title=f"Cap outliers in '{column}'",
            rationale=(
                f"Column '{column}' has an outlier signal of {finding.value:.4f}, above "
                f"the configured threshold ({finding.threshold:.4f}). Cap values beyond "
                f"the threshold to reduce variance while preserving row coverage."
            ),
            affected_columns=(column,),
            supporting_finding_ids=_supporting_ids(finding),
            confidence=round(
                confidence.detection_confidence * confidence.data_error_confidence, 4
            ),
            priority=priority,
            operation=RecommendationOperation(
                kind=OperationKind.CAP_OUTLIERS,
                params={"column": column, "threshold": float(finding.threshold)},
            ),
        )
    return Recommendation(
        kind=RecommendationKind.OUTLIER_TREATMENT,
        severity=severity,
        title=f"Review outliers in '{column}'",
        rationale=(
            f"Column '{column}' has a moderate outlier signal ({finding.value:.4f}). "
            "Outliers may be legitimate business values; review before capping."
        ),
        affected_columns=(column,),
        supporting_finding_ids=_supporting_ids(finding),
        confidence=round(confidence.detection_confidence * confidence.data_error_confidence, 4),
        priority=priority,
        operation=RecommendationOperation(
            kind=OperationKind.REVIEW,
            params={"column": column, "reason": "moderate_outliers"},
        ),
    )


def _build_cardinality_recommendation(
    finding: Finding,
    *,
    confidence: FindingConfidence,
    priority: int,
) -> Recommendation:
    severity = _recommendation_severity_for(finding)
    column = finding.column_name or "<dataset>"
    return Recommendation(
        kind=RecommendationKind.CARDINALITY_REDUCTION,
        severity=severity,
        title=f"Group rare categories in '{column}'",
        rationale=(
            f"Column '{column}' has a cardinality signal of {finding.value:.4f}, above "
            f"the configured threshold ({finding.threshold:.4f}). Group rare categorical "
            "values into an 'Other' bucket to stabilise downstream aggregates."
        ),
        affected_columns=(column,),
        supporting_finding_ids=_supporting_ids(finding),
        confidence=round(confidence.detection_confidence * confidence.data_error_confidence, 4),
        priority=priority,
        operation=RecommendationOperation(
            kind=OperationKind.GROUP_RARE_CATEGORICAL,
            params={"column": column, "min_count": 5},
        ),
    )


def _priority_for(severity: RecommendationSeverity, confidence_value: float) -> int:
    """Combine severity weight and confidence into a bounded integer priority."""

    base = SEVERITY_WEIGHTS[severity]
    bounded_confidence = max(0.0, min(1.0, confidence_value))
    return round(base * bounded_confidence)


def build_recommendation(finding: Finding) -> Recommendation:
    """Build a single deterministic recommendation for one finding.

    Pure function: callers may pass any ``Finding`` (including values
    outside the persisted envelope) and the output is fully explained
    by the source finding.
    """

    confidence = _confidence(finding)
    severity = _recommendation_severity_for(finding)
    confidence_value = confidence.detection_confidence * confidence.data_error_confidence
    priority = _priority_for(severity, confidence_value)
    kind = finding.kind
    if isinstance(kind, str):
        kind = FindingKind(kind)
    if kind is FindingKind.MISSINGNESS:
        return _build_missingness_recommendation(
            finding, confidence=confidence, priority=priority
        )
    if kind is FindingKind.DUPLICATES:
        return _build_duplicates_recommendation(
            finding, confidence=confidence, priority=priority
        )
    if kind is FindingKind.INVALID_VALUES:
        return _build_invalid_values_recommendation(
            finding, confidence=confidence, priority=priority
        )
    if kind is FindingKind.OUTLIER:
        return _build_outlier_recommendation(
            finding, confidence=confidence, priority=priority
        )
    if kind is FindingKind.CARDINALITY:
        return _build_cardinality_recommendation(
            finding, confidence=confidence, priority=priority
        )
    # Defensive default: unknown kinds are treated as review-only.
    # ``FindingKind`` is the only expected runtime value (Finding.kind
    # is typed ``FindingKind``) so mypy considers this branch
    # unreachable; keep it for future enum additions.
    return Recommendation(  # type: ignore[unreachable]
        kind=RecommendationKind.PIPELINE_REVIEW,
        severity=severity,
        title="Review unsupported finding",
        rationale=f"Finding kind '{finding.kind}' is not supported by the rule engine.",
        affected_columns=(finding.column_name or "<dataset>",),
        supporting_finding_ids=_supporting_ids(finding),
        confidence=round(confidence_value, 4),
        priority=priority,
        operation=RecommendationOperation(
            kind=OperationKind.REVIEW,
            params={"reason": "unsupported_finding_kind"},
        ),
    )


def compute_recommendation_run(
    *,
    dataset_id: object,
    profile_id: object,
    findings: Iterable[Finding],
    max_recommendations: int | None = None,
) -> RecommendationRun:
    """Run the deterministic rule engine over an immutable finding batch.

    The result is a frozen ``RecommendationRun`` ready for persistence.
    The function is pure: callers pass the finding ids verbatim and the
    engine produces a stable, explainable output.
    """

    materialised = tuple(findings)
    recommendations: list[Recommendation] = []
    by_kind: dict[str, int] = {}
    by_severity: dict[str, int] = {}
    for finding in materialised:
        rec = build_recommendation(finding)
        recommendations.append(rec)
        kind_value = rec.kind.value if hasattr(rec.kind, "value") else str(rec.kind)
        by_kind[kind_value] = by_kind.get(kind_value, 0) + 1
        severity_value = rec.severity.value if hasattr(rec.severity, "value") else str(rec.severity)
        by_severity[severity_value] = by_severity.get(severity_value, 0) + 1
    if max_recommendations is not None and len(recommendations) > max_recommendations:
        # Stable ordering: highest priority first, then original order.
        recommendations.sort(key=lambda item: (-item.priority, item.title))
        recommendations = recommendations[:max_recommendations]
    return RecommendationRun(
        dataset_id=dataset_id,  # type: ignore[arg-type]
        profile_id=profile_id,  # type: ignore[arg-type]
        recommendations=tuple(recommendations),
        recommendation_count=len(recommendations),
        by_kind=by_kind,
        by_severity=by_severity,
        formula_version=RECOMMENDATION_FORMULA_VERSION,
    )


__all__ = [
    "MISSING_DROP_SEVERITIES",
    "MISSING_DROP_VALUE_THRESHOLD",
    "OUTLIER_CAP_SEVERITIES",
    "SEVERITY_WEIGHTS",
    "build_recommendation",
    "compute_recommendation_run",
]