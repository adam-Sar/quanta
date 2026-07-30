"""Unit tests for the Task 5 deterministic scoring formula."""

from __future__ import annotations

from uuid import UUID

import pytest

from app.detection.types import (
    Finding,
    FindingKind,
    FindingSeverity,
)
from app.scoring.formula import (
    SCORING_FORMULA_VERSION,
    compute_quality_score,
    confidence_for,
    data_error_confidence,
    detection_confidence,
)
from app.scoring.types import SEVERITY_WEIGHTS, QualityGrade

_DATASET_ID = UUID("11111111-1111-1111-1111-111111111111")
_VERSION_ID = UUID("22222222-2222-2222-2222-222222222222")
_PROFILE_ID = UUID("33333333-3333-3333-3333-333333333333")


def _finding(
    *,
    kind: FindingKind = FindingKind.MISSINGNESS,
    severity: FindingSeverity = FindingSeverity.MEDIUM,
    column_name: str = "col",
    value: float = 0.6,
    threshold: float = 0.5,
) -> Finding:
    return Finding(
        kind=kind,
        severity=severity,
        column_name=column_name,
        metric="null_rate",
        value=value,
        threshold=threshold,
        description=f"test {kind.value}",
        details={},
    )


def test_detection_confidence_zero_at_threshold() -> None:
    assert detection_confidence(0.5, 0.5) == pytest.approx(0.0)


def test_detection_confidence_one_at_double_threshold() -> None:
    assert detection_confidence(1.0, 0.5) == pytest.approx(1.0)


def test_detection_confidence_clamps_above() -> None:
    assert detection_confidence(5.0, 0.5) == pytest.approx(1.0)


def test_detection_confidence_clamps_below() -> None:
    assert detection_confidence(0.1, 0.5) == pytest.approx(0.0)


def test_detection_confidence_zero_threshold_safe() -> None:
    # Should not crash on a degenerate zero threshold; result clamps to 1.
    assert detection_confidence(0.5, 0.0) == pytest.approx(1.0)


def test_data_error_confidence_monotonic_in_value() -> None:
    low = data_error_confidence(FindingKind.MISSINGNESS, 0.5)
    high = data_error_confidence(FindingKind.MISSINGNESS, 0.95)
    assert low < high <= 1.0


def test_data_error_confidence_handles_every_kind() -> None:
    for kind in FindingKind:
        value = data_error_confidence(kind, 0.7)
        assert 0.0 <= value <= 1.0


def test_confidence_for_combines_both() -> None:
    finding = _finding(value=0.8, threshold=0.5)
    conf = confidence_for(finding)
    assert 0.0 <= conf.detection_confidence <= 1.0
    assert 0.0 <= conf.data_error_confidence <= 1.0


def test_severity_weights_match_documented_values() -> None:
    assert SEVERITY_WEIGHTS[FindingSeverity.CRITICAL] == pytest.approx(1.0)
    assert SEVERITY_WEIGHTS[FindingSeverity.HIGH] == pytest.approx(0.75)
    assert SEVERITY_WEIGHTS[FindingSeverity.MEDIUM] == pytest.approx(0.45)
    assert SEVERITY_WEIGHTS[FindingSeverity.LOW] == pytest.approx(0.20)
    assert SEVERITY_WEIGHTS[FindingSeverity.INFO] == pytest.approx(0.05)


def test_compute_quality_score_clean_dataset_is_a() -> None:
    score = compute_quality_score(
        dataset_id=_DATASET_ID,
        dataset_version_id=_VERSION_ID,
        profile_id=_PROFILE_ID,
        findings=(),
        column_count=5,
    )
    assert score.score == pytest.approx(100.0)
    assert score.grade is QualityGrade.A
    assert score.finding_count == 0
    assert score.formula_version == SCORING_FORMULA_VERSION


def test_compute_quality_score_single_critical_pulls_toward_f() -> None:
    finding = _finding(
        kind=FindingKind.MISSINGNESS,
        severity=FindingSeverity.CRITICAL,
        value=0.99,
        threshold=0.5,
    )
    score = compute_quality_score(
        dataset_id=_DATASET_ID,
        dataset_version_id=_VERSION_ID,
        profile_id=_PROFILE_ID,
        findings=(finding,),
        column_count=1,
    )
    assert score.finding_count == 1
    assert score.score < 50.0
    assert score.grade in {QualityGrade.D, QualityGrade.F}
    assert score.components.column_count == 1
    assert "missingness" in score.components.by_kind
    assert score.components.by_kind[FindingKind.MISSINGNESS].count == 1


def test_compute_quality_score_breakdown_sums_match_total() -> None:
    findings = (
        _finding(kind=FindingKind.MISSINGNESS, severity=FindingSeverity.HIGH, value=0.8),
        _finding(
            kind=FindingKind.INVALID_VALUES,
            severity=FindingSeverity.MEDIUM,
            value=2.0,
            threshold=0.0,
        ),
        _finding(
            kind=FindingKind.OUTLIER,
            severity=FindingSeverity.LOW,
            value=0.2,
            threshold=0.1,
        ),
    )
    score = compute_quality_score(
        dataset_id=_DATASET_ID,
        dataset_version_id=_VERSION_ID,
        profile_id=_PROFILE_ID,
        findings=findings,
        column_count=10,
    )
    by_kind_total = sum(b.penalty_total for b in score.components.by_kind.values())
    by_severity_total = sum(b.penalty_total for b in score.components.by_severity.values())
    by_column_total = sum(b.penalty_total for b in score.components.by_column.values())
    assert by_kind_total == pytest.approx(score.components.overall_penalty_total, abs=1e-6)
    assert by_severity_total == pytest.approx(score.components.overall_penalty_total, abs=1e-6)
    assert by_column_total == pytest.approx(score.components.overall_penalty_total, abs=1e-6)


def test_compute_quality_score_grade_thresholds() -> None:
    # Build findings that drive the score to roughly the boundary values.
    base_finding = _finding(
        kind=FindingKind.MISSINGNESS,
        severity=FindingSeverity.MEDIUM,
        value=0.6,
        threshold=0.5,
    )
    # No findings → A (100).
    clean = compute_quality_score(
        dataset_id=_DATASET_ID,
        dataset_version_id=_VERSION_ID,
        profile_id=_PROFILE_ID,
        findings=(),
        column_count=10,
    )
    assert clean.grade is QualityGrade.A

    # A single medium finding over a 10-column dataset should still be in
    # the B/C range (penalty is much less than the divisor).
    mild = compute_quality_score(
        dataset_id=_DATASET_ID,
        dataset_version_id=_VERSION_ID,
        profile_id=_PROFILE_ID,
        findings=(base_finding,),
        column_count=10,
    )
    assert mild.grade in {QualityGrade.A, QualityGrade.B}


def test_components_to_dict_is_json_safe() -> None:
    finding = _finding(value=0.9, threshold=0.5)
    score = compute_quality_score(
        dataset_id=_DATASET_ID,
        dataset_version_id=_VERSION_ID,
        profile_id=_PROFILE_ID,
        findings=(finding,),
        column_count=3,
    )
    payload = score.components.to_dict()
    assert "by_kind" in payload
    assert "by_severity" in payload
    assert "by_column" in payload
    assert "overall_penalty_total" in payload
    assert "overall_penalty_normalized" in payload
    assert "column_count" in payload


def test_column_count_zero_is_safe() -> None:
    # Should not divide by zero.
    score = compute_quality_score(
        dataset_id=_DATASET_ID,
        dataset_version_id=_VERSION_ID,
        profile_id=_PROFILE_ID,
        findings=(_finding(value=0.8, threshold=0.5),),
        column_count=0,
    )
    assert score.components.column_count == 1
    assert score.score >= 0.0


def test_score_is_bounded_between_zero_and_hundred() -> None:
    findings = tuple(
        _finding(
            kind=FindingKind.MISSINGNESS,
            severity=FindingSeverity.CRITICAL,
            value=1.0,
            threshold=0.01,
            column_name=f"col_{i}",
        )
        for i in range(20)
    )
    score = compute_quality_score(
        dataset_id=_DATASET_ID,
        dataset_version_id=_VERSION_ID,
        profile_id=_PROFILE_ID,
        findings=findings,
        column_count=5,
    )
    assert 0.0 <= score.score <= 100.0


def test_dataset_level_finding_uses_dataset_bucket() -> None:
    finding = Finding(
        kind=FindingKind.DUPLICATES,
        severity=FindingSeverity.MEDIUM,
        column_name=None,
        metric="duplicate_rate",
        value=0.3,
        threshold=0.05,
        description="duplicates",
        details={},
    )
    score = compute_quality_score(
        dataset_id=_DATASET_ID,
        dataset_version_id=_VERSION_ID,
        profile_id=_PROFILE_ID,
        findings=(finding,),
        column_count=3,
    )
    assert "<dataset>" in score.components.by_column
    assert score.components.by_column["<dataset>"].count == 1
