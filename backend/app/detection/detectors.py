"""Deterministic detectors built on the immutable profile artifacts.

Each detector receives the in-memory profile result (or a set of
column profile results) and returns a tuple of Finding objects.

The detectors are intentionally simple and threshold-driven. They do
not fit statistical distributions, do not use ML, and do not call into
the LLM. AI, scoring aggregation, and history comparison live in
later tasks.
"""

from __future__ import annotations

from collections.abc import Iterable

from app.detection.types import (
    DetectorResult,
    Finding,
    FindingKind,
    FindingSeverity,
)
from app.profiling.types import (
    ColumnProfileResult,
    DatasetProfileResult,
    DatasetVersionProfile,
)


def _severity_for_missingness(rate: float, threshold: float) -> FindingSeverity:
    """Bucket the missingness rate into a deterministic severity band."""

    if rate >= 0.9:
        return FindingSeverity.CRITICAL
    if rate >= max(threshold, 0.5):
        return FindingSeverity.HIGH
    if rate >= threshold:
        return FindingSeverity.MEDIUM
    return FindingSeverity.LOW


def missingness_detector(
    columns: Iterable[ColumnProfileResult],
    *,
    threshold: float,
) -> DetectorResult:
    """Flag columns whose null rate exceeds the configured threshold.

    The threshold comes from ``Settings.profile_null_threshold`` (default
    0.5). Empty samples (``sample_size == 0``) are skipped.
    """

    findings: list[Finding] = []
    for column in columns:
        if column.sample_size == 0:
            continue
        rate = column.null_rate
        if rate < threshold:
            continue
        findings.append(
            Finding(
                kind=FindingKind.MISSINGNESS,
                severity=_severity_for_missingness(rate, threshold),
                column_name=column.name,
                metric="null_rate",
                value=rate,
                threshold=threshold,
                description=(
                    f"Column '{column.name}' has {column.null_count} null values "
                    f"({rate:.1%}) which is above the threshold "
                    f"({threshold:.1%})."
                ),
                details={
                    "null_count": column.null_count,
                    "non_null_count": column.non_null_count,
                    "sample_size": column.sample_size,
                },
            )
        )
    return DetectorResult(kind=FindingKind.MISSINGNESS, findings=tuple(findings))


def _cardinality_severity(distinct_rate: float, sample_size: int) -> FindingSeverity:
    """Map a high-cardinality column to a severity band.

    Distinct rate is ``distinct / non_null_count``; for sampled profiles
    the threshold drops to 80% of non-null.
    """

    if sample_size < 100:
        return FindingSeverity.INFO
    if distinct_rate >= 0.95:
        return FindingSeverity.HIGH
    if distinct_rate >= 0.8:
        return FindingSeverity.MEDIUM
    return FindingSeverity.LOW


def cardinality_detector(
    columns: Iterable[ColumnProfileResult],
) -> DetectorResult:
    """Flag columns that look unique (likely primary keys or free text)."""

    findings: list[Finding] = []
    for column in columns:
        if column.sample_size == 0 or column.non_null_count == 0:
            continue
        rate = column.distinct_count / column.non_null_count
        # Only flag columns that are essentially unique AND have a meaningful
        # sample size; high cardinality on short columns is expected.
        if rate < 0.8:
            continue
        findings.append(
            Finding(
                kind=FindingKind.CARDINALITY,
                severity=_cardinality_severity(rate, column.sample_size),
                column_name=column.name,
                metric="distinct_rate",
                value=rate,
                threshold=0.8,
                description=(
                    f"Column '{column.name}' has {column.distinct_count} distinct "
                    f"values across {column.non_null_count} non-null rows "
                    f"({rate:.1%}); it may be a primary key or free-form text."
                ),
                details={
                    "distinct_count": column.distinct_count,
                    "non_null_count": column.non_null_count,
                },
            )
        )
    return DetectorResult(kind=FindingKind.CARDINALITY, findings=tuple(findings))


def duplicates_detector(
    columns: Iterable[ColumnProfileResult],
    *,
    full_row_count: int,
    distinct_count: int,
) -> DetectorResult:
    """Flag when the dataset's distinct-row ratio is low.

    We approximate duplicate rows using the dataset's overall sample
    size and the row count reported in the profile. This is an upper
    bound: it only counts exact duplicates across the sampled frame.
    """

    if full_row_count <= 0 or distinct_count <= 0:
        return DetectorResult(kind=FindingKind.DUPLICATES, findings=())
    duplicate_count = max(full_row_count - distinct_count, 0)
    if duplicate_count == 0:
        return DetectorResult(kind=FindingKind.DUPLICATES, findings=())
    rate = duplicate_count / full_row_count
    if rate < 0.05:
        return DetectorResult(kind=FindingKind.DUPLICATES, findings=())
    severity = (
        FindingSeverity.HIGH
        if rate >= 0.5
        else FindingSeverity.MEDIUM
        if rate >= 0.2
        else FindingSeverity.LOW
    )
    finding = Finding(
        kind=FindingKind.DUPLICATES,
        severity=severity,
        column_name=None,
        metric="duplicate_rate",
        value=rate,
        threshold=0.05,
        description=(
            f"Approximately {duplicate_count} of {full_row_count} rows "
            f"({rate:.1%}) are exact duplicates in the sampled frame."
        ),
        details={
            "duplicate_count": duplicate_count,
            "row_count": full_row_count,
            "distinct_count": distinct_count,
        },
    )
    return DetectorResult(kind=FindingKind.DUPLICATES, findings=(finding,))


def invalid_values_detector(
    columns: Iterable[ColumnProfileResult],
) -> DetectorResult:
    """Flag string columns whose top values include obvious sentinels.

    We use a small, opinionated set of placeholder values that should
    not appear in clean data. This is intentionally simple; richer
    type-aware validation lives in later tasks.
    """

    sentinels = {"", "n/a", "na", "null", "none", "undefined", "-"}
    findings: list[Finding] = []
    for column in columns:
        if not column.top_values:
            continue
        sentinel_hits: list[dict[str, object]] = []
        for entry in column.top_values:
            if entry.value.lower() in sentinels:
                sentinel_hits.append(
                    {
                        "value": entry.value,
                        "count": entry.count,
                        "frequency": entry.frequency,
                    }
                )
        if not sentinel_hits:
            continue
        findings.append(
            Finding(
                kind=FindingKind.INVALID_VALUES,
                severity=FindingSeverity.MEDIUM,
                column_name=column.name,
                metric="placeholder_top_value_count",
                value=float(len(sentinel_hits)),
                threshold=0.0,
                description=(
                    f"Column '{column.name}' contains placeholder values "
                    f"(e.g. 'N/A', 'null') in its top entries."
                ),
                details={"sentinels": sentinel_hits},
            )
        )
    return DetectorResult(kind=FindingKind.INVALID_VALUES, findings=tuple(findings))


def outlier_detector(
    columns: Iterable[ColumnProfileResult],
) -> DetectorResult:
    """Flag numeric columns where the mean is far from the median.

    We use a robust mean-vs-median ratio. A large absolute difference
    suggests heavy tails or mistakes in the data. The detector is
    threshold-driven; statistical tests are intentionally out of scope
    for Task 4.
    """

    findings: list[Finding] = []
    for column in columns:
        stats = column.numeric
        if stats.min_value is None or stats.max_value is None:
            continue
        if stats.mean_value is None or stats.median_value is None:
            continue
        if stats.std_deviation is None or stats.std_deviation == 0:
            continue
        if abs(stats.median_value) < 1e-9:
            continue
        relative_skew = abs(stats.mean_value - stats.median_value) / (
            abs(stats.median_value) + abs(stats.std_deviation)
        )
        if relative_skew < 0.1:
            continue
        severity = FindingSeverity.HIGH if relative_skew >= 0.5 else FindingSeverity.MEDIUM
        findings.append(
            Finding(
                kind=FindingKind.OUTLIER,
                severity=severity,
                column_name=column.name,
                metric="mean_median_skew",
                value=relative_skew,
                threshold=0.1,
                description=(
                    f"Numeric column '{column.name}' shows a large "
                    f"mean-vs-median skew ({relative_skew:.2f}), which often "
                    f"indicates outliers."
                ),
                details={
                    "mean": stats.mean_value,
                    "median": stats.median_value,
                    "std_deviation": stats.std_deviation,
                    "min_value": stats.min_value,
                    "max_value": stats.max_value,
                },
            )
        )
    return DetectorResult(kind=FindingKind.OUTLIER, findings=tuple(findings))


def _column_views(
    profile: DatasetProfileResult | DatasetVersionProfile,
) -> list[ColumnProfileResult]:
    """Normalise ``profile.columns`` to ``ColumnProfileResult`` views.

    The persisted ``DatasetVersionProfile`` carries a different
    dataclass, but the JSONB ``metrics`` dict on each column has the
    same shape that the in-memory ``_result_to_metrics`` produces, so we
    rebuild the lightweight ``ColumnProfileResult`` here without touching
    the database.
    """
    views: list[ColumnProfileResult] = []
    for column in profile.columns:
        # In-memory ``ColumnProfileResult`` already carries every typed
        # stat; only the persisted ``PersistedColumnProfile`` requires a
        # conversion from the JSONB ``metrics`` dict.
        if isinstance(column, ColumnProfileResult):
            views.append(column)
            continue
        metrics = column.metrics  # type: ignore[union-attr]
        numeric = metrics.get("numeric") if metrics else None
        temporal = metrics.get("temporal") if metrics else None
        string_length = metrics.get("string_length") if metrics else None
        from app.profiling.types import (
            NumericColumnStats,
            StringLengthStats,
            TemporalColumnStats,
            ValueFrequency,
        )

        if numeric is None:
            numeric_stats = NumericColumnStats()
        else:
            numeric_stats = NumericColumnStats(
                min_value=numeric.get("min"),
                max_value=numeric.get("max"),
                mean_value=numeric.get("mean"),
                median_value=numeric.get("median"),
                std_deviation=numeric.get("std"),
                sum_value=numeric.get("sum"),
            )
        if temporal is None:
            temporal_stats = TemporalColumnStats()
        else:
            temporal_stats = TemporalColumnStats(
                min_value=temporal.get("min"),
                max_value=temporal.get("max"),
            )
        if string_length is None:
            string_stats = StringLengthStats()
        else:
            string_stats = StringLengthStats(
                min_length=string_length.get("min"),
                max_length=string_length.get("max"),
                mean_length=string_length.get("mean"),
            )
        top_values = tuple(
            ValueFrequency(
                value=item["value"],
                count=int(item["count"]),
                frequency=float(item["frequency"]),
            )
            for item in (metrics.get("top_values") or [])
        )
        views.append(
            ColumnProfileResult(
                name=column.name,  # type: ignore[attr-defined]
                ordinal_position=column.ordinal_position,  # type: ignore[attr-defined]
                physical_type=metrics.get("physical_type", "") if metrics else "",
                non_null_count=int(metrics.get("non_null_count", 0)) if metrics else 0,
                null_count=int(metrics.get("null_count", 0)) if metrics else 0,
                null_rate=float(metrics.get("null_rate", 0.0)) if metrics else 0.0,
                distinct_count=int(metrics.get("distinct_count", 0)) if metrics else 0,
                distinct_rate=float(metrics.get("distinct_rate", 0.0)) if metrics else 0.0,
                sample_size=int(metrics.get("sample_size", 0)) if metrics else 0,
                top_values=top_values,
                numeric=numeric_stats,
                temporal=temporal_stats,
                string_length=string_stats,
            )
        )
    return views


def run_all_detectors(
    profile: DatasetProfileResult | DatasetVersionProfile,
    *,
    missingness_threshold: float,
) -> tuple[Finding, ...]:
    """Run every Task 4 detector against a profile and merge the results."""

    columns = _column_views(profile)
    detectors: list[DetectorResult] = [
        missingness_detector(columns, threshold=missingness_threshold),
        cardinality_detector(columns),
        duplicates_detector(
            columns,
            full_row_count=profile.sample_size,
            distinct_count=_approx_distinct_row_count(columns),
        ),
        invalid_values_detector(columns),
        outlier_detector(columns),
    ]
    merged: list[Finding] = []
    for detector in detectors:
        merged.extend(detector.findings)
    return tuple(merged)


def _approx_distinct_row_count(columns: list[ColumnProfileResult]) -> int:
    """Use the smallest non-null distinct count as a row-level proxy.

    This is an upper bound, not a true distinct-row count. With a single
    column we cannot recover exact row uniqueness, but reporting 0 is
    misleading and the downstream ``duplicates_detector`` clamps to
    ``max(row - distinct, 0)``.
    """

    if not columns:
        return 0
    distincts = [c.distinct_count for c in columns if c.sample_size > 0]
    return min(distincts) if distincts else 0
