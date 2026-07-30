"""Persistence models for logical datasets and immutable uploaded versions."""

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.ingestion.types import DatasetFormat, DatasetVersionStatus, LogicalDataType


class Dataset(Base):
    """Stable logical identity whose physical contents live in versions."""

    __tablename__ = "datasets"
    __table_args__ = (Index("ix_datasets_created_at", "created_at"),)

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    versions: Mapped[list["DatasetVersion"]] = relationship(
        back_populates="dataset",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="DatasetVersion.version_number",
        lazy="selectin",
    )


class DatasetVersion(Base):
    """Immutable file and structural metadata captured by one ingestion event."""

    __tablename__ = "dataset_versions"
    __table_args__ = (
        UniqueConstraint("dataset_id", "version_number", name="uq_dataset_versions_number"),
        Index("ix_dataset_versions_dataset_created", "dataset_id", "created_at"),
        Index("ix_dataset_versions_content_sha256", "content_sha256"),
    )

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    dataset_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        ForeignKey("datasets.id", ondelete="CASCADE"),
        nullable=False,
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    format: Mapped[DatasetFormat] = mapped_column(
        Enum(
            DatasetFormat,
            name="dataset_format",
            values_callable=lambda members: [member.value for member in members],
            validate_strings=True,
        ),
        nullable=False,
    )
    status: Mapped[DatasetVersionStatus] = mapped_column(
        Enum(
            DatasetVersionStatus,
            name="dataset_version_status",
            values_callable=lambda members: [member.value for member in members],
            validate_strings=True,
        ),
        nullable=False,
        default=DatasetVersionStatus.STORED,
    )
    original_filename: Mapped[str] = mapped_column(String(512), nullable=False)
    media_type: Mapped[str | None] = mapped_column(String(255), nullable=True)
    storage_key: Mapped[str] = mapped_column(String(512), nullable=False, unique=True)
    content_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    row_count: Mapped[int] = mapped_column(BigInteger, nullable=False)
    column_count: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    dataset: Mapped[Dataset] = relationship(back_populates="versions")
    columns: Mapped[list["DatasetColumn"]] = relationship(
        back_populates="dataset_version",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="DatasetColumn.ordinal_position",
        lazy="selectin",
    )


class DatasetColumn(Base):
    """Ordered schema metadata observed for one immutable dataset version."""

    __tablename__ = "dataset_columns"
    __table_args__ = (
        UniqueConstraint(
            "dataset_version_id", "ordinal_position", name="uq_dataset_columns_ordinal"
        ),
        UniqueConstraint("dataset_version_id", "name", name="uq_dataset_columns_name"),
        Index("ix_dataset_columns_version", "dataset_version_id"),
    )

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    dataset_version_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        ForeignKey("dataset_versions.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    ordinal_position: Mapped[int] = mapped_column(Integer, nullable=False)
    physical_type: Mapped[str] = mapped_column(String(128), nullable=False)
    logical_type: Mapped[LogicalDataType] = mapped_column(
        Enum(
            LogicalDataType,
            name="logical_data_type",
            values_callable=lambda members: [member.value for member in members],
            validate_strings=True,
        ),
        nullable=False,
    )
    nullable: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    dataset_version: Mapped[DatasetVersion] = relationship(back_populates="columns")
