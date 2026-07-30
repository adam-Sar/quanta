"""Create dataset profile tables (Task 3).

Revision ID: 0003_create_dataset_profiles
Revises: 0002_dataset_ingestion
Create Date: 2026-07-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003_create_dataset_profiles"
down_revision: str | None = "0002_dataset_ingestion"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_SAMPLING_FLAG_VALUES = ("full", "sampled")


def upgrade() -> None:
    """Create immutable profile runs plus per-column JSONB metrics."""

    bind = op.get_bind()
    sampling_flag = postgresql.ENUM(*_SAMPLING_FLAG_VALUES, name="column_sampling_flag")
    sampling_flag.create(bind, checkfirst=False)

    op.create_table(
        "dataset_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("dataset_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("dataset_version_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sample_size", sa.BigInteger(), nullable=False),
        sa.Column(
            "sampled",
            postgresql.ENUM(*_SAMPLING_FLAG_VALUES, name="column_sampling_flag", create_type=False),
            nullable=False,
        ),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "completed_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("duration_ms", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["dataset_id"],
            ["datasets.id"],
            name=op.f("fk_dataset_profiles_dataset_id_datasets"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["dataset_version_id"],
            ["dataset_versions.id"],
            name=op.f("fk_dataset_profiles_dataset_version_id_dataset_versions"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_dataset_profiles")),
    )
    op.create_index(
        "ix_dataset_profiles_dataset",
        "dataset_profiles",
        ["dataset_id"],
        unique=False,
    )
    op.create_index(
        "ix_dataset_profiles_version_created",
        "dataset_profiles",
        ["dataset_version_id", "created_at"],
        unique=False,
    )

    op.create_table(
        "column_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("dataset_profile_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("ordinal_position", sa.Integer(), nullable=False),
        sa.Column("metrics", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.ForeignKeyConstraint(
            ["dataset_profile_id"],
            ["dataset_profiles.id"],
            name=op.f("fk_column_profiles_dataset_profile_id_dataset_profiles"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_column_profiles")),
        sa.UniqueConstraint(
            "dataset_profile_id", "ordinal_position", name="uq_column_profiles_ordinal"
        ),
        sa.UniqueConstraint("dataset_profile_id", "name", name="uq_column_profiles_name"),
    )
    op.create_index(
        "ix_column_profiles_dataset_profile",
        "column_profiles",
        ["dataset_profile_id"],
        unique=False,
    )


def downgrade() -> None:
    """Remove profile artifacts and the sampling flag enum."""

    op.drop_index("ix_column_profiles_dataset_profile", table_name="column_profiles")
    op.drop_table("column_profiles")
    op.drop_index("ix_dataset_profiles_version_created", table_name="dataset_profiles")
    op.drop_index("ix_dataset_profiles_dataset", table_name="dataset_profiles")
    op.drop_table("dataset_profiles")

    bind = op.get_bind()
    postgresql.ENUM(name="column_sampling_flag").drop(bind, checkfirst=False)
