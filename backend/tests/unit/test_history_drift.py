"""Unit tests for the deterministic drift detectors (Task 6)."""

from __future__ import annotations

import math

import pytest

from app.history.drift import (
    _CategoricalView,
    _NumericView,
    _ScoreView,
    compare_categorical,
    compare_distribution,
    compare_numeric,
    compare_scores,
)


def test_numeric_relative_change_uses_safe_divisor() -> None:
    base = [_NumericView(name="age", metrics={"mean": 10.0})]
    target = [_NumericView(name="age", metrics={"mean": 30.0})]
    [drift] = compare_numeric(base, target)
    assert drift.metric == "mean"
    assert drift.base_value == 10.0
    assert drift.target_value == 30.0
    assert drift.absolute_change == pytest.approx(20.0)
    assert drift.relative_change == pytest.approx(2.0)


def test_numeric_handles_missing_values() -> None:
    base = [_NumericView(name="age", metrics={"mean": 10.0, "median": None})]
    target = [_NumericView(name="age", metrics={"mean": 12.0, "median": 14.0})]
    drifts = compare_numeric(base, target)
    metrics = {d.metric: d for d in drifts}
    assert "mean" in metrics
    # ``median`` only has a target value; drift is still recorded with
    # ``None`` for the missing side so the consumer sees the gap.
    assert "median" in metrics
    assert metrics["median"].base_value is None
    assert metrics["median"].target_value == pytest.approx(14.0)
    assert metrics["mean"].relative_change == pytest.approx(0.2)


def test_categorical_psi_zero_when_identical() -> None:
    base = [_CategoricalView(name="country", top_values=(("US", 50), ("CA", 30)))]
    target = [_CategoricalView(name="country", top_values=(("US", 50), ("CA", 30)))]
    [drift] = compare_categorical(base, target)
    assert drift.psi == pytest.approx(0.0, abs=1e-9)


def test_categorical_psi_increases_on_distribution_shift() -> None:
    base = [_CategoricalView(name="country", top_values=(("US", 80), ("CA", 20)))]
    target = [_CategoricalView(name="country", top_values=(("US", 20), ("CA", 80)))]
    [drift] = compare_categorical(base, target)
    # The PSI of a perfect 50/50 swap with non-zero counts should be > 0.5.
    assert drift.psi > 0.5
    assert drift.base_top_values == (("US", 80), ("CA", 20))


def test_distribution_dispatch_routes_by_shape() -> None:
    base = [
        _NumericView(name="age", metrics={"mean": 10.0}),
        _CategoricalView(name="country", top_values=(("US", 1),)),
    ]
    target = [
        _NumericView(name="age", metrics={"mean": 12.0}),
        _CategoricalView(name="country", top_values=(("US", 2),)),
    ]
    distribution = compare_distribution(
        base_columns=base,  # type: ignore[arg-type]
        target_columns=target,  # type: ignore[arg-type]
    )
    assert len(distribution.numeric) == 1
    assert len(distribution.categorical) == 1


def test_score_drift_reports_delta_and_grade_change() -> None:
    drift = compare_scores(
        _ScoreView(score=80.0, grade="B"),
        _ScoreView(score=70.0, grade="C"),
    )
    assert drift.delta == pytest.approx(-10.0)
    assert drift.absolute_delta == pytest.approx(10.0)
    assert drift.grade_changed is True


def test_score_drift_handles_missing_sides() -> None:
    drift = compare_scores(None, _ScoreView(score=75.0, grade="B"))
    assert drift.base_score is None
    assert drift.target_score == 75.0
    assert drift.delta is None
    assert drift.grade_changed is False


def test_score_drift_keeps_grade_change_only_when_both_sides_known() -> None:
    drift = compare_scores(None, _ScoreView(score=75.0, grade="B"))
    assert drift.grade_changed is False
    drift = compare_scores(_ScoreView(score=75.0, grade="B"), None)
    assert drift.grade_changed is False


def test_psi_calculation_is_finite_with_zero_proportion() -> None:
    # Add an outlier category that disappears between runs; PSI stays finite.
    base = [_CategoricalView(name="tag", top_values=(("a", 10), ("b", 5), ("c", 1)))]
    target = [_CategoricalView(name="tag", top_values=(("a", 10), ("b", 5)))]
    [drift] = compare_categorical(base, target)
    assert math.isfinite(drift.psi)
    assert drift.psi > 0.0
