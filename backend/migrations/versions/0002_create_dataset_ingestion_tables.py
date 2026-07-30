"""Create dataset ingestion tables.

Revision ID: 0002_dataset_ingestion
Revises: 0001_foundation
Create Date: 2026-07-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002_dataset_ingestion"
down_revision: str | None = "0001_foundation"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_DATASET_FORMAT_VALUES = ("csv", "parquet")
_VERSION_STATUS_VALUES = ("stored",)
_LOGICAL_TYPE_VALUES = (
    "boolean",
    "integer",
    "float",
    "decimal",
    "string",
    "date",
    "datetime",
    "time",
    "duration",
    "binary",
    "list",
    "struct",
    "unknown",
)


def upgrade() -> None:
    """Create immutable dataset/version metadata and ordered columns."""

    bind = op.get_bind()
    dataset_format = postgresql.ENUM(*_DATASET_FORMAT_VALUES, name="dataset_format")
    version_status = postgresql.ENUM(*_VERSION_STATUS_VALUES, name="dataset_version_status")
    logical_type = postgresql.ENUM(*_LOGICAL_TYPE_VALUES, name="logical_data_type")
    dataset_format.create(bind, checkfirst=False)
    version_status.create(bind, checkfirst=False)
    logical_type.create(bind, checkfirst=False)

    op.create_table(
        "datasets",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_datasets")),
    )
    op.create_index("ix_datasets_created_at", "datasets", ["created_at"], unique=False)

    op.create_table(
        "dataset_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("dataset_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column(
            "format",
            postgresql.ENUM(*_DATASET_FORMAT_VALUES, name="dataset_format", create_type=False),
            nullable=False,
        ),
        sa.Column(
            "status",
            postgresql.ENUM(
                *_VERSION_STATUS_VALUES, name="dataset_version_status", create_type=False
            ),
            nullable=False,
        ),
        sa.Column("original_filename", sa.String(length=512), nullable=False),
        sa.Column("media_type", sa.String(length=255), nullable=True),
        sa.Column("storage_key", sa.String(length=512), nullable=False),
        sa.Column("content_sha256", sa.String(length=64), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("row_count", sa.BigInteger(), nullable=False),
        sa.Column("column_count", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["dataset_id"],
            ["datasets.id"],
            name=op.f("fk_dataset_versions_dataset_id_datasets"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_dataset_versions")),
        sa.UniqueConstraint("dataset_id", "version_number", name="uq_dataset_versions_number"),
        sa.UniqueConstraint("storage_key", name=op.f("uq_dataset_versions_storage_key")),
    )
    op.create_index(
        "ix_dataset_versions_content_sha256",
        "dataset_versions",
        ["content_sha256"],
        unique=False,
    )
    op.create_index(
        "ix_dataset_versions_dataset_created",
        "dataset_versions",
        ["dataset_id", "created_at"],
        unique=False,
    )

    op.create_table(
        "dataset_columns",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("dataset_version_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("ordinal_position", sa.Integer(), nullable=False),
        sa.Column("physical_type", sa.String(length=128), nullable=False),
        sa.Column(
            "logical_type",
            postgresql.ENUM(*_LOGICAL_TYPE_VALUES, name="logical_data_type", create_type=False),
            nullable=False,
        ),
        sa.Column("nullable", sa.Boolean(), nullable=True),
        sa.ForeignKeyConstraint(
            ["dataset_version_id"],
            ["dataset_versions.id"],
            name=op.f("fk_dataset_columns_dataset_version_id_dataset_versions"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_dataset_columns")),
        sa.UniqueConstraint("dataset_version_id", "name", name="uq_dataset_columns_name"),
        sa.UniqueConstraint(
            "dataset_version_id", "ordinal_position", name="uq_dataset_columns_ordinal"
        ),
    )
    op.create_index(
        "ix_dataset_columns_version",
        "dataset_columns",
        ["dataset_version_id"],
        unique=False,
    )


def downgrade() -> None:
    """Remove ingestion metadata and its PostgreSQL enum types."""

    op.drop_index("ix_dataset_columns_version", table_name="dataset_columns")
    op.drop_table("dataset_columns")
    op.drop_index("ix_dataset_versions_dataset_created", table_name="dataset_versions")
    op.drop_index("ix_dataset_versions_content_sha256", table_name="dataset_versions")
    op.drop_table("dataset_versions")
    op.drop_index("ix_datasets_created_at", table_name="datasets")
    op.drop_table("datasets")

    bind = op.get_bind()
    postgresql.ENUM(name="logical_data_type").drop(bind, checkfirst=False)
    postgresql.ENUM(name="dataset_version_status").drop(bind, checkfirst=False)
    postgresql.ENUM(name="dataset_format").drop(bind, checkfirst=False)
