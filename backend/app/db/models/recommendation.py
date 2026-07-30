"""Recommendation ORM model (Task 8).

A ``Recommendation`` row is an immutable artifact that captures one
structured, preview-only recommendation derived from the Task 4
finding rows bound to a profile. Re-running recommendations on the
same profile creates fresh rows; existing rows are never mutated.

The ``kind`` / ``severity`` / ``operation_kind`` columns preserve the
audit trail. The ``operation_params`` and ``components`` JSONB columns
carry the explainable breakdown so consumers do not have to recompute.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# JSONB on PostgreSQL, JSON elsewhere so the SQLite test suite works.
_RECJSON = JSON().with_variant(JSONB(), "postgresql")


class Recommendation(Base):
    """One deterministic, preview-only recommendation."""

    __tablename__ = "recommendations"
    __table_args__ = (
        Index(
            "ix_recommendations_dataset_created",
            "dataset_id",
            "created_at",
        ),
        Index("ix_recommendations_profile", "profile_id"),
        Index("ix_recommendations_kind_severity", "kind", "severity"),
        Index("ix_recommendations_formula", "formula_version"),
    )

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    dataset_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        ForeignKey("datasets.id", ondelete="CASCADE"),
        nullable=False,
    )
    profile_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        ForeignKey("dataset_profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    kind: Mapped[str] = mapped_column(String(64), nullable=False)
    severity: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    rationale: Mapped[str] = mapped_column(String(2000), nullable=False)
    affected_columns: Mapped[list[str]] = mapped_column(
        _RECJSON, nullable=False, default=list
    )
    supporting_finding_ids: Mapped[list[str]] = mapped_column(
        _RECJSON, nullable=False, default=list
    )
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    operation_kind: Mapped[str | None] = mapped_column(String(64), nullable=True)
    operation_params: Mapped[dict[str, Any]] = mapped_column(
        _RECJSON, nullable=False, default=dict
    )
    preview_only: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    formula_version: Mapped[str] = mapped_column(String(64), nullable=False)
    components: Mapped[dict[str, Any]] = mapped_column(
        _RECJSON, nullable=False, default=dict
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(__import__("datetime").timezone.utc),
    )


__all__ = ["Recommendation"]