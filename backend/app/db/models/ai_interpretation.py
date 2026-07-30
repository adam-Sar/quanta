"""AIInterpretation ORM model (Task 7).

A ``AIInterpretation`` row is an immutable artifact that captures one
structured interpretation of the Task 4 findings bound to a profile.
Re-running interpretation on the same profile creates a new row;
existing rows are never mutated. The ``provider_name`` and
``model_name`` columns preserve the audit trail.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    DateTime,
    Float,
    ForeignKey,
    Index,
    String,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# JSONB on PostgreSQL, JSON elsewhere so the SQLite test suite works.
_AIJSON = JSON().with_variant(JSONB(), "postgresql")


class AIInterpretation(Base):
    """One deterministic AI interpretation of a profile's findings."""

    __tablename__ = "ai_interpretations"
    __table_args__ = (
        Index(
            "ix_ai_interpretations_dataset_created",
            "dataset_id",
            "created_at",
        ),
        Index("ix_ai_interpretations_profile", "profile_id"),
        Index("ix_ai_interpretations_formula", "formula_version"),
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
    provider_name: Mapped[str] = mapped_column(String(64), nullable=False)
    model_name: Mapped[str] = mapped_column(String(128), nullable=False)
    formula_version: Mapped[str] = mapped_column(String(64), nullable=False)
    summary: Mapped[str] = mapped_column(String(2000), nullable=False)
    overall_confidence: Mapped[float] = mapped_column(Float, nullable=False)
    input_finding_ids: Mapped[list[str]] = mapped_column(_AIJSON, nullable=False, default=list)
    hypotheses: Mapped[list[dict[str, Any]]] = mapped_column(_AIJSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(__import__("datetime").timezone.utc),
    )


__all__ = ["AIInterpretation"]
