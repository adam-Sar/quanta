"""QualityScore ORM model (Task 5).

A ``QualityScore`` row is an immutable artifact that captures a single
deterministic scoring run over one profile's finding batch. Re-running
scoring creates a new row; existing rows are never mutated.

The ``components`` JSONB column stores the per-kind / per-severity /
per-column breakdown plus the per-finding detection and data-error
confidence values. The shape is owned by
``app.scoring.service.ScoringService`` and documented in
``backend/docs/scoring.md``.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    DateTime,
    Enum,
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
from app.scoring.types import QualityGrade

# JSONB on PostgreSQL, JSON elsewhere so the SQLite test suite works.
_ScoreComponents = JSON().with_variant(JSONB(), "postgresql")


class QualityScore(Base):
    """One scoring run over one detection batch (one profile)."""

    __tablename__ = "quality_scores"
    __table_args__ = (
        Index("ix_quality_scores_dataset_created", "dataset_id", "created_at"),
        Index("ix_quality_scores_profile", "profile_id"),
        Index("ix_quality_scores_grade", "grade"),
    )

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
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
    finding_count: Mapped[int] = mapped_column(Integer, nullable=False)
    score: Mapped[float] = mapped_column(Float, nullable=False)
    grade: Mapped[QualityGrade] = mapped_column(
        Enum(
            QualityGrade,
            name="quality_grade",
            values_callable=lambda members: [member.value for member in members],
            validate_strings=True,
        ),
        nullable=False,
    )
    formula_version: Mapped[str] = mapped_column(String(64), nullable=False)
    components: Mapped[dict[str, Any]] = mapped_column(
        _ScoreComponents, nullable=False, default=dict
    )
    # Python-side default gives microsecond precision so two consecutive
    # score runs can be ordered deterministically; ``server_default`` would
    # tie on SQLite's second-resolution timestamp.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )


__all__ = ["QualityScore"]
