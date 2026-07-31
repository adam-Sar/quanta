"""Job ORM model (Task 10).

A ``Job`` row is an immutable artifact that records one durable
analysis run. The ``jobs`` table wraps the existing Task 2-9
operations (``profile``, ``detect``, ``score``, ``history``,
``recommendations``, ``validations``) so consumers can poll a single
endpoint for status and fetch the resulting Task 2-9 row via the
``result`` JSONB payload.

The ``status`` column is a bounded string (``pending``, ``running``,
``succeeded``, ``failed``). The ``parameters`` and ``result`` JSONB
columns capture the structured inputs and outputs of the wrapped
service method. The ``error`` JSONB column is populated on failure.

Re-running a job (Task 11 may add an explicit rerun endpoint) will
create a fresh ``Job`` row; existing rows are never mutated.
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
_JobJSON = JSON().with_variant(JSONB(), "postgresql")


class Job(Base):
    """One durable analysis job record."""

    __tablename__ = "jobs"
    __table_args__ = (
        Index("ix_jobs_dataset_created", "dataset_id", "created_at"),
        Index("ix_jobs_profile", "profile_id"),
        Index("ix_jobs_status", "status"),
        Index("ix_jobs_kind", "kind"),
    )

    id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    dataset_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        ForeignKey("datasets.id", ondelete="CASCADE"),
        nullable=False,
    )
    profile_id: Mapped[UUID | None] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        ForeignKey("dataset_profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    kind: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    parameters: Mapped[dict[str, Any]] = mapped_column(
        _JobJSON, nullable=False, default=dict
    )
    result: Mapped[dict[str, Any]] = mapped_column(
        _JobJSON, nullable=False, default=dict
    )
    error: Mapped[dict[str, Any]] = mapped_column(
        _JobJSON, nullable=False, default=dict
    )
    formula_version: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(__import__("datetime").timezone.utc),
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


__all__ = ["Job"]
