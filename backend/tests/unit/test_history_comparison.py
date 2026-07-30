"""Unit tests for the deterministic schema comparison (Task 6)."""

from __future__ import annotations

from typing import cast

from app.history.comparison import ColumnLike, compare_schema


def _column(name: str, physical_type: str, logical_type: str) -> ColumnLike:
    """Build a ColumnLike-compatible record for the tests."""

    record: ColumnLike = cast(
        ColumnLike,
        {"name": name, "physical_type": physical_type, "logical_type": logical_type},
    )
    return record


def test_no_changes_returns_empty_diff() -> None:
    base = [_column("id", "Int64", "integer"), _column("name", "String", "string")]
    diff = compare_schema(base, base)
    assert diff.is_empty
    assert diff.added == ()
    assert diff.removed == ()
    assert diff.type_changes == ()


def test_added_and_removed_columns_are_detected() -> None:
    base = [_column("id", "Int64", "integer"), _column("old", "String", "string")]
    target = [_column("id", "Int64", "integer"), _column("new", "String", "string")]
    diff = compare_schema(base, target)
    assert diff.added == ("new",)
    assert diff.removed == ("old",)
    assert diff.type_changes == ()


def test_type_change_records_before_and_after_types() -> None:
    base = [_column("amount", "Int64", "integer")]
    target = [_column("amount", "Float64", "float")]
    diff = compare_schema(base, target)
    assert diff.added == ()
    assert diff.removed == ()
    assert len(diff.type_changes) == 1
    change = diff.type_changes[0]
    assert change.name == "amount"
    assert change.change == "type_changed"
    assert change.base_physical_type == "Int64"
    assert change.target_physical_type == "Float64"
    assert change.base_logical_type == "integer"
    assert change.target_logical_type == "float"


def test_logical_type_only_change_also_triggers_diff() -> None:
    base = [_column("amount", "Int64", "integer")]
    target = [_column("amount", "Int64", "decimal")]
    diff = compare_schema(base, target)
    assert len(diff.type_changes) == 1
    assert diff.type_changes[0].change == "type_changed"
