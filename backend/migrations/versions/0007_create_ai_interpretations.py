"""Create AI interpretations table (Task 7).

Revision ID: 0007_create_ai_interpretations
Revises: 0006_create_history_comparisons
Create Date: 2026-07-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0007_create_ai_interpretations"
down_revision: str | None = "0006_create_history_comparisons"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create the AI interpretations table with two JSONB payload columns."""

    op.create_table(
        "ai_interpretations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("dataset_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("profile_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("provider_name", sa.String(length=64), nullable=False),
        sa.Column("model_name", sa.String(length=128), nullable=False),
        sa.Column("formula_version", sa.String(length=64), nullable=False),
        sa.Column("summary", sa.String(length=2000), nullable=False),
        sa.Column("overall_confidence", sa.Float(), nullable=False),
        sa.Column("input_finding_ids", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("hypotheses", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["dataset_id"],
            ["datasets.id"],
            name=op.f("fk_ai_interpretations_dataset_id_datasets"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["profile_id"],
            ["dataset_profiles.id"],
            name=op.f("fk_ai_interpretations_profile_id_dataset_profiles"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ai_interpretations")),
    )
    op.create_index(
        "ix_ai_interpretations_dataset_created",
        "ai_interpretations",
        ["dataset_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_ai_interpretations_profile",
        "ai_interpretations",
        ["profile_id"],
        unique=False,
    )
    op.create_index(
        "ix_ai_interpretations_formula",
        "ai_interpretations",
        ["formula_version"],
        unique=False,
    )


def downgrade() -> None:
    """Remove the AI interpretations table."""

    op.drop_index("ix_ai_interpretations_formula", table_name="ai_interpretations")
    op.drop_index("ix_ai_interpretations_profile", table_name="ai_interpretations")
    op.drop_index("ix_ai_interpretations_dataset_created", table_name="ai_interpretations")
    op.drop_table("ai_interpretations")
