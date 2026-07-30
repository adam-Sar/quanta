"""Deterministic distribution and score drift (Task 6).

The drift detectors consume the persisted JSONB profile metrics and
the persisted Task 5 ``QualityScore`` rows. Numeric drift uses
relative change on min/max/mean/median/std; categorical drift uses the
population-stability index (PSI) over the union of the top values;
score drift reports the delta and whether the letter grade changed.

The module is pure-functional: it does not touch the database. The
service layer reads the ORM rows, projects them into the lightweight
named-tuple shapes this module expects, and feeds the result into
JSONB for the ``HistoryComparison`` row.
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Mapping, Sequence
from typing import NamedTuple

from app.history.types import (
    CategoricalDrift,
    DistributionDrift,
    NumericDrift,
    ScoreDrift,
)

_NUMERIC_METRICS: tuple[str, ...] = ("mean", "median", "std", "min", "max")


class _NumericView(NamedTuple):
    name: str
    metrics: Mapping[str, float | None]


class _CategoricalView(NamedTuple):
    name: str
    top_values: Sequence[tuple[str, int]]


class _ScoreView(NamedTuple):
    score: float | None
    grade: str | None


def _relative_change(base: float | None, target: float | None) -> tuple[float | None, float | None]:
    """Return ``(absolute_change, relative_change)`` for two numeric values.

    Relative change uses ``max(|base|, 1.0)`` as the divisor to avoid
    explosions when both values are tiny or when ``base`` is zero.
    """

    if base is None or target is None:
        return None, None
    absolute = target - base
    divisor = max(abs(base), 1.0)
    return absolute, abs(absolute) / divisor


def _psi(base_freqs: Mapping[str, int], target_freqs: Mapping[str, int]) -> float:
    """Compute the population-stability index over the union of keys.

    Both mappings are converted to proportions of their respective
    total mass. A zero proportion in one side contributes a
    convention: we treat ``p == 0`` as ``eps`` so the logarithm stays
    finite. The total mass is renormalized to the union so the
    statistic stays in ``[0, +inf)``.
    """

    eps = 1e-9
    base_total = sum(base_freqs.values())
    target_total = sum(target_freqs.values())
    keys = set(base_freqs) | set(target_freqs)
    if not keys or base_total <= 0 or target_total <= 0:
        return 0.0
    psi = 0.0
    for key in keys:
        p_base = base_freqs.get(key, 0) / base_total
        p_target = target_freqs.get(key, 0) / target_total
        if p_target <= 0.0:
            p_target = eps
        if p_base <= 0.0:
            p_base = eps
        psi += (p_target - p_base) * math.log(p_target / p_base)
    return psi


def compare_numeric(
    base_columns: Iterable[_NumericView],
    target_columns: Iterable[_NumericView],
) -> tuple[NumericDrift, ...]:
    """Compare two ``NumericView`` iterables by column name."""

    base_by_name = {col.name: col for col in base_columns}
    target_by_name = {col.name: col for col in target_columns}
    common = sorted(set(base_by_name) & set(target_by_name))
    out: list[NumericDrift] = []
    for name in common:
        base_metrics = base_by_name[name].metrics
        target_metrics = target_by_name[name].metrics
        for metric in _NUMERIC_METRICS:
            base_value = base_metrics.get(metric)
            target_value = target_metrics.get(metric)
            absolute, relative = _relative_change(base_value, target_value)
            if base_value is None and target_value is None:
                continue
            out.append(
                NumericDrift(
                    column=name,
                    metric=metric,  # type: ignore[arg-type]
                    base_value=base_value,
                    target_value=target_value,
                    absolute_change=absolute,
                    relative_change=relative,
                )
            )
    return tuple(out)


def compare_categorical(
    base_columns: Iterable[_CategoricalView],
    target_columns: Iterable[_CategoricalView],
) -> tuple[CategoricalDrift, ...]:
    """Compare two ``CategoricalView`` iterables by column name."""

    base_by_name = {col.name: col for col in base_columns}
    target_by_name = {col.name: col for col in target_columns}
    common = sorted(set(base_by_name) & set(target_by_name))
    out: list[CategoricalDrift] = []
    for name in common:
        base_top = base_by_name[name].top_values
        target_top = target_by_name[name].top_values
        base_freqs = {value: count for value, count in base_top}
        target_freqs = {value: count for value, count in target_top}
        psi_value = _psi(base_freqs, target_freqs)
        out.append(
            CategoricalDrift(
                column=name,
                metric="psi",
                psi=psi_value,
                base_top_values=tuple(base_top),
                target_top_values=tuple(target_top),
            )
        )
    return tuple(out)


def compare_distribution(
    *,
    base_columns: Iterable[_NumericView | _CategoricalView],
    target_columns: Iterable[_NumericView | _CategoricalView],
) -> DistributionDrift:
    """Dispatch each column to the appropriate drift detector."""

    numeric_base = [c for c in base_columns if isinstance(c, _NumericView)]
    numeric_target = [c for c in target_columns if isinstance(c, _NumericView)]
    categorical_base = [c for c in base_columns if isinstance(c, _CategoricalView)]
    categorical_target = [c for c in target_columns if isinstance(c, _CategoricalView)]
    return DistributionDrift(
        numeric=compare_numeric(numeric_base, numeric_target),
        categorical=compare_categorical(categorical_base, categorical_target),
    )


def compare_scores(
    base: _ScoreView | None,
    target: _ScoreView | None,
) -> ScoreDrift:
    """Return the deterministic delta between two score snapshots."""

    base_score = base.score if base else None
    target_score = target.score if target else None
    base_grade = base.grade if base else None
    target_grade = target.grade if target else None
    delta: float | None = None
    absolute_delta: float | None = None
    if base_score is not None and target_score is not None:
        delta = round(target_score - base_score, 4)
        absolute_delta = round(abs(delta), 4)
    return ScoreDrift(
        base_score=base_score,
        target_score=target_score,
        delta=delta,
        absolute_delta=absolute_delta,
        base_grade=base_grade,
        target_grade=target_grade,
        grade_changed=(base_grade != target_grade)
        and (base_grade is not None)
        and (target_grade is not None),
    )


__all__ = [
    "compare_categorical",
    "compare_distribution",
    "compare_numeric",
    "compare_scores",
]
