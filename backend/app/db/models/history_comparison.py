"""HistoryComparison ORM model (Task 6).

A ``HistoryComparison`` row is an immutable artifact that captures one
deterministic comparison between two dataset versions. Re-running
the comparison creates a new row; existing rows are never mutated.

The ``schema_diff``, ``distribution_drift``, and ``score_drift`` JSONB
columns carry the documented shape from
``backend/docs/history.md``. The model deliberately keeps the three
payloads separate so each can grow its own structure without churn in
the others.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    Index,
    String,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# JSONB on PostgreSQL, JSON elsewhere so the SQLite test suite works.
_HistoryJSON = JSON().with_variant(JSONB(), "postgresql")


class HistoryComparison(Base):
    """One deterministic history comparison between two dataset versions."""

    __tablename__ = "history_comparisons"
    __table_args__ = (
        Index(
            "ix_history_comparisons_dataset_created",
            "dataset_id",
            "created_at",
        ),
        Index("ix_history_comparisons_versions", "base_version_id", "target_version_id"),
        Index("ix_history_comparisons_formula", "formula_version"),
    )

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    dataset_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        ForeignKey("datasets.id", ondelete="CASCADE"),
        nullable=False,
    )
    base_version_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        ForeignKey("dataset_versions.id", ondelete="CASCADE"),
        nullable=False,
    )
    target_version_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        ForeignKey("dataset_versions.id", ondelete="CASCADE"),
        nullable=False,
    )
    schema_diff: Mapped[dict[str, Any]] = mapped_column(_HistoryJSON, nullable=False, default=dict)
    distribution_drift: Mapped[dict[str, Any]] = mapped_column(
        _HistoryJSON, nullable=False, default=dict
    )
    score_drift: Mapped[dict[str, Any]] = mapped_column(_HistoryJSON, nullable=False, default=dict)
    formula_version: Mapped[str] = mapped_column(String(64), nullable=False)
    # Python-side default gives microsecond precision so two consecutive
    # comparison runs can be ordered deterministically.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(__import__("datetime").timezone.utc),
    )


__all__ = ["HistoryComparison"]
