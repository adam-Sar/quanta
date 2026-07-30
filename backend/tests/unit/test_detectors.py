"""Unit tests for the Task 4 deterministic detectors."""

from __future__ import annotations

import pytest

from app.detection.detectors import (
    cardinality_detector,
    duplicates_detector,
    invalid_values_detector,
    missingness_detector,
    outlier_detector,
    run_all_detectors,
)
from app.detection.types import FindingKind
from app.profiling.types import (
    ColumnProfileResult,
    ColumnSamplingFlag,
    DatasetProfileResult,
    NumericColumnStats,
    StringLengthStats,
    TemporalColumnStats,
    ValueFrequency,
)


def _column(
    name: str,
    *,
    sample_size: int = 3,
    null_count: int = 0,
    distinct_count: int = 0,
    numeric: NumericColumnStats | None = None,
) -> ColumnProfileResult:
    non_null_count = sample_size - null_count
    return ColumnProfileResult(
        name=name,
        ordinal_position=1,
        physical_type="Int64",
        non_null_count=non_null_count,
        null_count=null_count,
        null_rate=(null_count / sample_size) if sample_size else 0.0,
        distinct_count=distinct_count,
        distinct_rate=(distinct_count / non_null_count) if non_null_count else 0.0,
        sample_size=sample_size,
        top_values=(),
        numeric=numeric or NumericColumnStats(),
        temporal=TemporalColumnStats(),
        string_length=StringLengthStats(),
    )


def test_missingness_detector_flags_above_threshold() -> None:
    column = _column("a", sample_size=10, null_count=6)
    result = missingness_detector([column], threshold=0.5)
    assert len(result.findings) == 1
    finding = result.findings[0]
    assert finding.kind is FindingKind.MISSINGNESS
    assert finding.column_name == "a"
    assert finding.value == pytest.approx(0.6)
    assert finding.threshold == 0.5


def test_missingness_detector_ignores_below_threshold() -> None:
    column = _column("a", sample_size=10, null_count=3)
    result = missingness_detector([column], threshold=0.5)
    assert result.findings == ()


def test_missingness_detector_skips_empty_sample() -> None:
    column = _column("a", sample_size=0, null_count=0)
    result = missingness_detector([column], threshold=0.5)
    assert result.findings == ()


def test_cardinality_detector_flags_essentially_unique() -> None:
    column = _column("a", sample_size=100, distinct_count=95)
    result = cardinality_detector([column])
    assert len(result.findings) == 1
    assert result.findings[0].kind is FindingKind.CARDINALITY


def test_cardinality_detector_ignores_low_cardinality() -> None:
    column = _column("status", sample_size=100, distinct_count=3)
    result = cardinality_detector([column])
    assert result.findings == ()


def test_duplicates_detector_flags_high_duplicate_rate() -> None:
    result = duplicates_detector([], full_row_count=10, distinct_count=3)
    assert len(result.findings) == 1
    assert result.findings[0].kind is FindingKind.DUPLICATES
    assert result.findings[0].value == pytest.approx(0.7)


def test_duplicates_detector_ignores_low_duplicate_rate() -> None:
    result = duplicates_detector([], full_row_count=10, distinct_count=10)
    assert result.findings == ()


def test_invalid_values_detector_flags_sentinels() -> None:
    column = _column("notes", sample_size=3, distinct_count=3)
    object.__setattr__(
        column,
        "top_values",
        (
            ValueFrequency(value="ok", count=4, frequency=0.4),
            ValueFrequency(value="N/A", count=2, frequency=0.2),
        ),
    )
    result = invalid_values_detector([column])
    assert len(result.findings) == 1
    assert result.findings[0].kind is FindingKind.INVALID_VALUES
    sentinels = result.findings[0].details["sentinels"]
    assert any(item["value"] == "N/A" for item in sentinels)


def test_outlier_detector_flags_skewed_mean() -> None:
    column = _column(
        "amount",
        sample_size=10,
        numeric=NumericColumnStats(
            min_value=0.0,
            max_value=1000.0,
            mean_value=100.0,
            median_value=20.0,
            std_deviation=30.0,
        ),
    )
    result = outlier_detector([column])
    assert len(result.findings) == 1
    assert result.findings[0].kind is FindingKind.OUTLIER


def test_run_all_detectors_returns_combined_findings() -> None:
    high_missing = _column("a", sample_size=10, null_count=8)
    profile = DatasetProfileResult(
        dataset_id=__import__("uuid").UUID("00000000-0000-0000-0000-000000000001"),
        dataset_version_id=__import__("uuid").UUID("00000000-0000-0000-0000-000000000002"),
        sample_size=10,
        sampled=ColumnSamplingFlag.FULL,
        started_at="",
        completed_at="",
        duration_ms=1,
        columns=(high_missing,),
    )
    findings = run_all_detectors(profile, missingness_threshold=0.5)
    kinds = {finding.kind for finding in findings}
    assert FindingKind.MISSINGNESS in kinds
