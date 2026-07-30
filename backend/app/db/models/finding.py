"""Finding ORM model (Task 4).

Each Finding row is an immutable record produced by a deterministic
detector. A new detection run creates a new set of rows; existing
rows are not mutated.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.detection.types import FindingKind, FindingSeverity

# JSONB on PostgreSQL, JSON elsewhere so the SQLite test suite works.
_FindingDetails = JSON().with_variant(JSONB(), "postgresql")


class Finding(Base):
    """A single quality finding produced by a Task 4 detector."""

    __tablename__ = "findings"
    __table_args__ = (
        Index("ix_findings_dataset_version", "dataset_id", "dataset_version_id"),
        Index("ix_findings_profile", "profile_id"),
        Index("ix_findings_kind_severity", "kind", "severity"),
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
    kind: Mapped[FindingKind] = mapped_column(
        Enum(
            FindingKind,
            name="finding_kind",
            values_callable=lambda members: [member.value for member in members],
            validate_strings=True,
        ),
        nullable=False,
    )
    severity: Mapped[FindingSeverity] = mapped_column(
        Enum(
            FindingSeverity,
            name="finding_severity",
            values_callable=lambda members: [member.value for member in members],
            validate_strings=True,
        ),
        nullable=False,
    )
    column_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    metric: Mapped[str] = mapped_column(String(64), nullable=False)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    threshold: Mapped[float] = mapped_column(Float, nullable=False)
    description: Mapped[str] = mapped_column(String(1024), nullable=False)
    details: Mapped[dict[str, Any]] = mapped_column(_FindingDetails, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
