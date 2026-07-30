"""Deterministic lineage traversal (Task 6).

A dataset's lineage is the ordered chain of its immutable versions,
linked from the earlier version to the later one. Edges are derived
from ``DatasetVersion.version_number`` and ``created_at``; no
separate table is required because the underlying rows are already
immutable.
"""

from __future__ import annotations

from collections.abc import Iterable
from itertools import pairwise
from typing import Any

from app.history.types import LineageEdge


def _lineage_version_view(obj: Any) -> Any:
    """Project any record with ``id``, ``version_number`` and ``created_at``
    into the three attributes the lineage traversal needs.

    Returns the object unchanged for ``DatasetVersion`` rows and for
    the lightweight test NamedTuples defined in the unit tests.
    """

    return obj


def lineage_chain(
    dataset_id: Any,
    versions: Iterable[Any],
) -> tuple[LineageEdge, ...]:
    """Return the ordered lineage edges for the given versions.

    Versions are sorted by ``version_number`` ascending. The function
    is pure: it does not touch the database and is safe to call with
    ORM ``DatasetVersion`` rows or lightweight test stubs.
    """

    sorted_versions = sorted(versions, key=lambda v: v.version_number)
    edges: list[LineageEdge] = []
    for prev, curr in pairwise(sorted_versions):
        edges.append(
            LineageEdge(
                dataset_id=dataset_id,
                from_version_id=prev.id,
                from_version_number=prev.version_number,
                from_created_at=prev.created_at,
                to_version_id=curr.id,
                to_version_number=curr.version_number,
                to_created_at=curr.created_at,
            )
        )
    return tuple(edges)


__all__ = ["_lineage_version_view", "lineage_chain"]
