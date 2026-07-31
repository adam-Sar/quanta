"""Validation ORM model (Task 9).

A ``Validation`` row is an immutable artifact that captures the
deterministic preview of a Task 8 recommendation against the source
file. Re-running a validation creates a new row; existing rows are
never mutated.

The ``status`` is a bounded string (``valid`` / ``warning`` /
``invalid``). The ``impact`` JSONB column carries the deterministic
projected impact; the ``components`` JSONB column carries the source
pointers (recommendation id, profile id, dataset version id) so the
validation can be audited.
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
_ValidationJSON = JSON().with_variant(JSONB(), "postgresql")


class Validation(Base):
    """One deterministic validation preview result."""

    __tablename__ = "validations"
    __table_args__ = (
        Index("ix_validations_dataset_created", "dataset_id", "created_at"),
        Index("ix_validations_recommendation", "recommendation_id"),
        Index("ix_validations_status", "status"),
        Index("ix_validations_formula", "formula_version"),
    )

    id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    dataset_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        ForeignKey("datasets.id", ondelete="CASCADE"),
        nullable=False,
    )
    dataset_version_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        ForeignKey("dataset_versions.id", ondelete="CASCADE"),
        nullable=False,
    )
    profile_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        ForeignKey("dataset_profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    recommendation_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        ForeignKey("recommendations.id", ondelete="CASCADE"),
        nullable=False,
    )
    operation_kind: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    rationale: Mapped[str] = mapped_column(String(2000), nullable=False)
    impact: Mapped[dict[str, Any]] = mapped_column(
        _ValidationJSON, nullable=False, default=dict
    )
    components: Mapped[dict[str, Any]] = mapped_column(
        _ValidationJSON, nullable=False, default=dict
    )
    formula_version: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(__import__("datetime").timezone.utc),
    )


__all__ = ["Validation"]