"""Deterministic schema comparison (Task 6).

The comparison is purely functional: it takes two ordered column lists
and returns a ``SchemaDiff``. There is no database access in this
module so it is straightforward to unit-test with synthetic inputs.
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class ColumnLike(Protocol):
    """Anything that quacks like a ``DatasetColumn`` row.

    Declared ``runtime_checkable`` so tests can use ``isinstance``
    checks if they want, and to give mypy a structural contract that
    matches against ORM rows, API schemas, and lightweight test
    NamedTuples alike.
    """

    name: str
    physical_type: str
    logical_type: str


class ColumnKey:
    """Hashable cache key for ``(physical_type, logical_type)``."""

    __slots__ = ("logical_type", "physical_type")

    def __init__(self, physical_type: str, logical_type: str) -> None:
        self.physical_type = physical_type
        self.logical_type = logical_type

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, ColumnKey):
            return NotImplemented
        return self.physical_type == other.physical_type and self.logical_type == other.logical_type

    def __hash__(self) -> int:
        return hash((self.physical_type, self.logical_type))


def _field(column: Any, name: str) -> Any:
    """Read ``name`` from either an attribute or a mapping."""

    if isinstance(column, dict):
        return column.get(name)
    return getattr(column, name)


def _by_name(columns: Iterable[Any]) -> dict[str, Any]:
    return {_field(col, "name"): col for col in columns}


def _column_key(column: Any) -> ColumnKey:
    return ColumnKey(_field(column, "physical_type"), _field(column, "logical_type"))


def compare_schema(
    base_columns: Iterable[ColumnLike],
    target_columns: Iterable[ColumnLike],
) -> SchemaDiff:
    """Return the schema diff between two sets of column records.

    Each record must expose ``name``, ``physical_type`` and
    ``logical_type`` attributes; ``DatasetColumn`` and the API schemas
    both satisfy this contract.
    """

    base = _by_name(base_columns)
    target = _by_name(target_columns)
    added = tuple(sorted(name for name in target if name not in base))
    removed = tuple(sorted(name for name in base if name not in target))
    type_changes: list[Any] = []
    for name in sorted(base.keys() & target.keys()):
        base_col = base[name]
        target_col = target[name]
        if _column_key(base_col) != _column_key(target_col):
            type_changes.append(_column_diff(name, base_col, target_col))
    return SchemaDiff(
        added=added,
        removed=removed,
        type_changes=tuple(type_changes),
    )


def _column_diff(name: str, base_col: Any, target_col: Any) -> Any:
    from app.history.types import ColumnDiff

    return ColumnDiff(
        name=name,
        change="type_changed",
        base_physical_type=_field(base_col, "physical_type"),
        target_physical_type=_field(target_col, "physical_type"),
        base_logical_type=_field(base_col, "logical_type"),
        target_logical_type=_field(target_col, "logical_type"),
    )


from app.history.types import SchemaDiff  # noqa: E402  (deferred for clarity)

__all__ = ["ColumnKey", "ColumnLike", "compare_schema"]
