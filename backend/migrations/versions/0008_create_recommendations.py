"""Create recommendations table (Task 8).

Revision ID: 0008_create_recommendations
Revises: 0007_create_ai_interpretations
Create Date: 2026-07-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0008_create_recommendations"
down_revision: str | None = "0007_create_ai_interpretations"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create the recommendations table with two JSONB payload columns."""

    op.create_table(
        "recommendations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("dataset_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("profile_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("kind", sa.String(length=64), nullable=False),
        sa.Column("severity", sa.String(length=32), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("rationale", sa.String(length=2000), nullable=False),
        sa.Column(
            "affected_columns",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column(
            "supporting_finding_ids",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column("operation_kind", sa.String(length=64), nullable=True),
        sa.Column(
            "operation_params",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column("preview_only", sa.Boolean(), nullable=False),
        sa.Column("formula_version", sa.String(length=64), nullable=False),
        sa.Column(
            "components",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["dataset_id"],
            ["datasets.id"],
            name=op.f("fk_recommendations_dataset_id_datasets"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["profile_id"],
            ["dataset_profiles.id"],
            name=op.f("fk_recommendations_profile_id_dataset_profiles"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_recommendations")),
    )
    op.create_index(
        "ix_recommendations_dataset_created",
        "recommendations",
        ["dataset_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_recommendations_profile",
        "recommendations",
        ["profile_id"],
        unique=False,
    )
    op.create_index(
        "ix_recommendations_kind_severity",
        "recommendations",
        ["kind", "severity"],
        unique=False,
    )
    op.create_index(
        "ix_recommendations_formula",
        "recommendations",
        ["formula_version"],
        unique=False,
    )


def downgrade() -> None:
    """Remove the recommendations table."""

    op.drop_index("ix_recommendations_formula", table_name="recommendations")
    op.drop_index("ix_recommendations_kind_severity", table_name="recommendations")
    op.drop_index("ix_recommendations_profile", table_name="recommendations")
    op.drop_index("ix_recommendations_dataset_created", table_name="recommendations")
    op.drop_table("recommendations")