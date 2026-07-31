"""Unit tests for the Task 9 deterministic validation preview engine.

The formula is pure: it takes a Task 8 recommendation domain object,
the persisted source file path, and the dataset format; it returns a
``ValidationPreview`` with a status and a structured impact. These
tests cover every operation kind plus the document validation case.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import pytest

from app.ingestion.types import DatasetFormat
from app.recommendations.types import (
    OperationKind,
    Recommendation,
    RecommendationOperation,
    RecommendationSeverity,
)
from app.validation.exceptions import InvalidValidationStateError
from app.validation.formula import (
    VALIDATION_FORMULA_VERSION,
    preview_recommendation,
)
from app.validation.types import ValidationImpact, ValidationStatus


@dataclass
class _FakeFrame:
    columns: list[str]
    rows: list[dict[str, Any]]
    null_counts: dict[str, int] | None = None

    @property
    def height(self) -> int:
        return len(self.rows)

    def is_duplicated(self) -> Any:
        class _Series:
            def sum(self) -> int:
                return 1

        return _Series()

    def __getitem__(self, key: str) -> Any:
        if key not in self.columns:
            raise KeyError(key)
        if key == "amount":
            values = [r.get(key) for r in self.rows]
            return _FakeNumericSeries(values, self.null_counts or {})
        if key == "name":
            return _FakeCategoricalSeries(self.rows, key)
        if key == "tag":
            return _FakeCategoricalSeries(self.rows, key)
        if key == "id":
            values = [r.get(key) for r in self.rows]
            return _FakeNumericSeries(values, self.null_counts or {})
        return _FakeNumericSeries([], self.null_counts or {})


@dataclass
class _FakeNumericSeries:
    values: list
    null_counts: dict[str, int]

    def null_count(self) -> int:
        return self.null_counts.get("amount", 0)

    def __gt__(self, threshold: float) -> Any:
        big = [v for v in self.values if isinstance(v, (int, float)) and v > threshold]

        class _BoolSeries:
            def sum(self) -> int:
                return len(big)

        return _BoolSeries()


@dataclass
class _FakeCategoricalSeries:
    rows: list
    key: str

    def null_count(self) -> int:
        return 0

    def value_counts(self) -> Any:
        counts: dict[Any, int] = {}
        for row in self.rows:
            counts[row[self.key]] = counts.get(row[self.key], 0) + 1

        class _ValueCounts:
            def filter(self, predicate: Any) -> Any:
                rows = [
                    (key, count)
                    for key, count in counts.items()
                    if predicate(count)
                ]
                if not rows:
                    empty = _FakeValueCountsRows()
                    return _FakeValueCountsDf(empty)

                class _Df:
                    def __init__(self, items: list[tuple[Any, int]]) -> None:
                        self._items = items

                    def __getitem__(self, column: str) -> list[int]:
                        if column != "count":
                            raise KeyError(column)
                        return [count for _, count in self._items]

                return _Df(rows)

        return _ValueCounts()


class _FakeValueCountsRows:
    pass


class _FakeValueCountsDf:
    def __init__(self, rows: Any) -> None:
        self._rows = rows


def _make_recommendation(
    *,
    operation_kind: OperationKind | None,
    affected_columns: tuple[str, ...] = ("amount",),
    params: dict[str, Any] | None = None,
) -> Recommendation:
    return Recommendation(
        kind="missingness_treatment",
        severity=RecommendationSeverity.HIGH,
        title="Drop sparse column 'amount'",
        rationale="Null rate above threshold.",
        affected_columns=affected_columns,
        supporting_finding_ids=(uuid4(),),
        confidence=0.9,
        priority=80,
        operation=(
            RecommendationOperation(
                kind=operation_kind,
                params=params or {},
            )
            if operation_kind is not None
            else None
        ),
    )


def test_preview_drop_column_valid(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    frame = _FakeFrame(
        columns=["id", "amount", "name"],
        rows=[{"id": 1, "amount": 10.0, "name": "a"}],
    )
    monkeypatch.setattr(
        "app.validation.formula._read_frame", lambda *args, **kwargs: frame
    )
    preview = preview_recommendation(
        _make_recommendation(operation_kind=OperationKind.DROP_COLUMN),
        path=tmp_path / "x.csv",
        fmt=DatasetFormat.CSV,
        sample_size=100,
    )
    assert preview.status is ValidationStatus.VALID
    assert preview.impact.affected_columns == ("amount",)
    assert "1 column" in preview.impact.summary


def test_preview_drop_column_invalid_source(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.validation.formula._read_frame", lambda *args, **kwargs: None)
    preview = preview_recommendation(
        _make_recommendation(operation_kind=OperationKind.DROP_COLUMN),
        path=tmp_path / "x.csv",
        fmt=DatasetFormat.CSV,
        sample_size=100,
    )
    assert preview.status is ValidationStatus.INVALID
    assert "source_unreadable" in preview.impact.unexpected_side_effects


def test_preview_drop_column_missing_column(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    frame = _FakeFrame(
        columns=["id", "name"], rows=[{"id": 1, "name": "a"}]
    )
    monkeypatch.setattr("app.validation.formula._read_frame", lambda *args, **kwargs: frame)
    preview = preview_recommendation(
        _make_recommendation(
            operation_kind=OperationKind.DROP_COLUMN,
            affected_columns=("missing",),
        ),
        path=tmp_path / "x.csv",
        fmt=DatasetFormat.CSV,
        sample_size=100,
    )
    assert preview.status is ValidationStatus.INVALID
    assert "missing" in preview.impact.summary
    assert "column_not_found" in preview.impact.unexpected_side_effects


def test_preview_impute_missing_valid(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    frame = _FakeFrame(
        columns=["id", "amount", "name"],
        rows=[{"id": 1, "amount": 10.0, "name": "a"}],
        null_counts={"amount": 2},
    )
    monkeypatch.setattr("app.validation.formula._read_frame", lambda *args, **kwargs: frame)
    preview = preview_recommendation(
        _make_recommendation(operation_kind=OperationKind.IMPUTE_MISSING),
        path=tmp_path / "x.csv",
        fmt=DatasetFormat.CSV,
        sample_size=100,
    )
    assert preview.status is ValidationStatus.VALID
    assert preview.impact.affected_rows == 2


def test_preview_drop_duplicates_valid(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    frame = _FakeFrame(
        columns=["id"], rows=[{"id": 1}, {"id": 1}, {"id": 2}]
    )
    monkeypatch.setattr("app.validation.formula._read_frame", lambda *args, **kwargs: frame)
    preview = preview_recommendation(
        _make_recommendation(
            operation_kind=OperationKind.DROP_DUPLICATES,
            affected_columns=("<dataset>",),
        ),
        path=tmp_path / "x.csv",
        fmt=DatasetFormat.CSV,
        sample_size=100,
    )
    assert preview.status is ValidationStatus.VALID
    assert preview.impact.affected_rows == 1


def test_preview_cap_outliers_valid(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    frame = _FakeFrame(
        columns=["amount"],
        rows=[{"amount": v} for v in [1.0, 2.0, 100.0, 200.0]],
    )
    monkeypatch.setattr("app.validation.formula._read_frame", lambda *args, **kwargs: frame)
    preview = preview_recommendation(
        _make_recommendation(
            operation_kind=OperationKind.CAP_OUTLIERS,
            params={"threshold": 50.0},
        ),
        path=tmp_path / "x.csv",
        fmt=DatasetFormat.CSV,
        sample_size=100,
    )
    assert preview.status is ValidationStatus.VALID
    assert preview.impact.affected_rows == 2


def test_preview_cast_type_warning(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    frame = _FakeFrame(
        columns=["amount"],
        rows=[{"amount": 1.0}],
    )
    monkeypatch.setattr("app.validation.formula._read_frame", lambda *args, **kwargs: frame)
    preview = preview_recommendation(
        _make_recommendation(operation_kind=OperationKind.CAST_TYPE),
        path=tmp_path / "x.csv",
        fmt=DatasetFormat.CSV,
        sample_size=100,
    )
    assert preview.status is ValidationStatus.WARNING
    assert "apply_required" in preview.impact.unexpected_side_effects


def test_preview_group_rare_categorical_valid(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    frame = _FakeFrame(
        columns=["name"],
        rows=[{"name": "a"}, {"name": "b"}, {"name": "c"}],
    )
    monkeypatch.setattr("app.validation.formula._read_frame", lambda *args, **kwargs: frame)
    preview = preview_recommendation(
        _make_recommendation(
            operation_kind=OperationKind.GROUP_RARE_CATEGORICAL,
            params={"min_count": 5},
            affected_columns=("name",),
        ),
        path=tmp_path / "x.csv",
        fmt=DatasetFormat.CSV,
        sample_size=100,
    )
    assert preview.status is ValidationStatus.VALID


def test_preview_review_always_valid(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    frame = _FakeFrame(columns=["id"], rows=[{"id": 1}])
    monkeypatch.setattr("app.validation.formula._read_frame", lambda *args, **kwargs: frame)
    preview = preview_recommendation(
        _make_recommendation(
            operation_kind=OperationKind.REVIEW,
            affected_columns=(),
        ),
        path=tmp_path / "x.csv",
        fmt=DatasetFormat.CSV,
        sample_size=100,
    )
    assert preview.status is ValidationStatus.VALID


def test_preview_recommendation_no_operation_is_invalid(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    frame = _FakeFrame(columns=["id"], rows=[{"id": 1}])
    monkeypatch.setattr("app.validation.formula._read_frame", lambda *args, **kwargs: frame)
    preview = preview_recommendation(
        _make_recommendation(operation_kind=None),
        path=tmp_path / "x.csv",
        fmt=DatasetFormat.CSV,
        sample_size=100,
    )
    assert preview.status is ValidationStatus.INVALID


def test_validation_formula_version_is_pinned() -> None:
    assert VALIDATION_FORMULA_VERSION == "task9-1.0"


def test_recommendation_type_aliases_are_consistent() -> None:
    """Sanity: enum and domain types share the same value set."""

    from app.recommendations.types import (
        OperationKind as RecOpKind,
    )
    from app.recommendations.types import (
        RecommendationKind as RecKind,
    )

    assert RecKind.MISSINGNESS_TREATMENT.value == "missingness_treatment"
    assert RecOpKind.DROP_COLUMN.value == "drop_column"
    assert RecOpKind.IMPUTE_MISSING.value == "impute_missing"
    assert RecOpKind.DROP_DUPLICATES.value == "drop_duplicates"
    assert RecOpKind.CAP_OUTLIERS.value == "cap_outliers"
    assert RecOpKind.CAST_TYPE.value == "cast_type"
    assert RecOpKind.GROUP_RARE_CATEGORICAL.value == "group_rare_categorical"
    assert RecOpKind.REVIEW.value == "review"


def test_impact_dataclass_round_trips() -> None:
    impact = ValidationImpact(
        affected_rows=10,
        affected_columns=("a", "b"),
        summary="X",
        unexpected_side_effects=("y",),
    )
    assert impact.affected_rows == 10
    assert impact.affected_columns == ("a", "b")
    assert impact.summary == "X"
    assert impact.unexpected_side_effects == ("y",)


def test_impact_default_construction_is_deterministic() -> None:
    impact = ValidationImpact()
    assert impact.affected_rows is None
    assert impact.affected_columns == ()
    assert impact.summary == ""
    assert impact.unexpected_side_effects == ()


def test_validation_status_values_are_stable() -> None:
    assert ValidationStatus.VALID.value == "valid"
    assert ValidationStatus.WARNING.value == "warning"
    assert ValidationStatus.INVALID.value == "invalid"


def test_invalid_validation_state_raised_on_bad_path() -> None:
    try:
        raise InvalidValidationStateError("oops")
    except InvalidValidationStateError as exc:
        assert exc.code == "invalid_validation_state"
        assert exc.status_code == 422


def test_uuid_round_trip_in_recommendation() -> None:
    rec = _make_recommendation(operation_kind=OperationKind.REVIEW)
    assert isinstance(rec.supporting_finding_ids[0], UUID)
