"""Profile ORM models.

Task 3 introduces immutable profile artifacts bound to a dataset version.
A `DatasetProfile` row stores the run-level metadata; the per-column
JSONB statistics live in `ColumnProfile.metrics`. A second profile run
creates a new row rather than mutating an existing one.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    BigInteger,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.profiling.types import ColumnSamplingFlag


class DatasetProfile(Base):
    """One profile run over one dataset version."""

    __tablename__ = "dataset_profiles"
    __table_args__ = (
        Index("ix_dataset_profiles_version_created", "dataset_version_id", "created_at"),
        Index("ix_dataset_profiles_dataset", "dataset_id"),
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
    sample_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    sampled: Mapped[ColumnSamplingFlag] = mapped_column(
        Enum(
            ColumnSamplingFlag,
            name="column_sampling_flag",
            values_callable=lambda members: [member.value for member in members],
            validate_strings=True,
        ),
        nullable=False,
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    completed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    columns: Mapped[list["ColumnProfile"]] = relationship(
        back_populates="dataset_profile",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ColumnProfile.ordinal_position",
        lazy="selectin",
    )


class ColumnProfile(Base):
    """Per-column profile metrics. Values are stored as JSONB for
    forward compatibility with the Task 4+ detection engine.
    """

    __tablename__ = "column_profiles"
    __table_args__ = (
        UniqueConstraint(
            "dataset_profile_id", "ordinal_position", name="uq_column_profiles_ordinal"
        ),
        UniqueConstraint("dataset_profile_id", "name", name="uq_column_profiles_name"),
        Index("ix_column_profiles_dataset_profile", "dataset_profile_id"),
    )

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    dataset_profile_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        ForeignKey("dataset_profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    ordinal_position: Mapped[int] = mapped_column(Integer, nullable=False)
    metrics: Mapped[dict] = mapped_column(JSONB, nullable=False)

    dataset_profile: Mapped[DatasetProfile] = relationship(back_populates="columns")
