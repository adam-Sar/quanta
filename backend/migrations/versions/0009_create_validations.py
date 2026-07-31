"""Create validations table (Task 9)."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0009_create_validations"
down_revision: str | None = "0008_create_recommendations"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create the validations table with two JSONB payload columns."""
    op.create_table(
        "validations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("dataset_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("dataset_version_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("profile_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("recommendation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("operation_kind", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("rationale", sa.String(length=2000), nullable=False),
        sa.Column("impact", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "components", postgresql.JSONB(astext_type=sa.Text()), nullable=False
        ),
        sa.Column("formula_version", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["dataset_id"],
            ["datasets.id"],
            name=op.f("fk_validations_dataset_id_datasets"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["dataset_version_id"],
            ["dataset_versions.id"],
            name=op.f("fk_validations_dataset_version_id_dataset_versions"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["profile_id"],
            ["dataset_profiles.id"],
            name=op.f("fk_validations_profile_id_dataset_profiles"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["recommendation_id"],
            ["recommendations.id"],
            name=op.f("fk_validations_recommendation_id_recommendations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_validations")),
    )
    op.create_index(
        "ix_validations_dataset_created", "validations", ["dataset_id", "created_at"]
    )
    op.create_index("ix_validations_recommendation", "validations", ["recommendation_id"])
    op.create_index("ix_validations_status", "validations", ["status"])
    op.create_index("ix_validations_formula", "validations", ["formula_version"])


def downgrade() -> None:
    """Remove the validations table."""
    op.drop_index("ix_validations_formula", table_name="validations")
    op.drop_index("ix_validations_status", table_name="validations")
    op.drop_index("ix_validations_recommendation", table_name="validations")
    op.drop_index("ix_validations_dataset_created", table_name="validations")
    op.drop_table("validations")
