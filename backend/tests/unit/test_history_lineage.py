"""Unit tests for the deterministic lineage traversal (Task 6)."""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace

from app.history.lineage import lineage_chain


def _v(version_id: str, number: int) -> SimpleNamespace:
    return SimpleNamespace(
        id=version_id,
        version_number=number,
        created_at=datetime(2026, 1, number, tzinfo=UTC),
    )


def test_lineage_empty_when_no_versions() -> None:
    assert lineage_chain("dataset-1", []) == ()


def test_lineage_no_edges_when_single_version() -> None:
    assert lineage_chain("dataset-1", [_v("v1", 1)]) == ()


def test_lineage_orders_edges_by_version_number() -> None:
    versions = [_v("v3", 3), _v("v1", 1), _v("v2", 2)]
    edges = lineage_chain("dataset-1", versions)
    assert [edge.from_version_number for edge in edges] == [1, 2]
    assert [edge.to_version_number for edge in edges] == [2, 3]
    assert edges[0].from_version_id == "v1"
    assert edges[0].to_version_id == "v2"
    assert edges[1].from_version_id == "v2"
    assert edges[1].to_version_id == "v3"
