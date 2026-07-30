"""Create history comparisons table (Task 6).

Revision ID: 0006_create_history_comparisons
Revises: 0005_create_dataset_quality_scores
Create Date: 2026-07-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006_create_history_comparisons"
down_revision: str | None = "0005_create_dataset_quality_scores"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create the history_comparisons table with three JSONB payload columns."""

    op.create_table(
        "history_comparisons",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("dataset_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("base_version_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("target_version_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("schema_diff", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("distribution_drift", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("score_drift", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
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
            name=op.f("fk_history_comparisons_dataset_id_datasets"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["base_version_id"],
            ["dataset_versions.id"],
            name=op.f("fk_history_comparisons_base_version_id_dataset_versions"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["target_version_id"],
            ["dataset_versions.id"],
            name=op.f("fk_history_comparisons_target_version_id_dataset_versions"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_history_comparisons")),
    )
    op.create_index(
        "ix_history_comparisons_dataset_created",
        "history_comparisons",
        ["dataset_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_history_comparisons_versions",
        "history_comparisons",
        ["base_version_id", "target_version_id"],
        unique=False,
    )
    op.create_index(
        "ix_history_comparisons_formula",
        "history_comparisons",
        ["formula_version"],
        unique=False,
    )


def downgrade() -> None:
    """Remove the history_comparisons table."""

    op.drop_index("ix_history_comparisons_formula", table_name="history_comparisons")
    op.drop_index("ix_history_comparisons_versions", table_name="history_comparisons")
    op.drop_index("ix_history_comparisons_dataset_created", table_name="history_comparisons")
    op.drop_table("history_comparisons")
