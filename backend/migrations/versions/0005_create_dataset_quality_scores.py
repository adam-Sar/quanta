"""Create dataset quality scores table (Task 5).

Revision ID: 0005_create_dataset_quality_scores
Revises: 0004_create_dataset_findings
Create Date: 2026-07-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0005_create_dataset_quality_scores"
down_revision: str | None = "0004_create_dataset_findings"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_QUALITY_GRADE_VALUES = ("A", "B", "C", "D", "F")


def upgrade() -> None:
    """Create the quality_scores table plus the PostgreSQL quality_grade enum."""

    bind = op.get_bind()
    quality_grade = postgresql.ENUM(*_QUALITY_GRADE_VALUES, name="quality_grade")
    quality_grade.create(bind, checkfirst=False)

    op.create_table(
        "quality_scores",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("dataset_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("dataset_version_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("profile_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("finding_count", sa.Integer(), nullable=False),
        sa.Column("score", sa.Float(), nullable=False),
        sa.Column(
            "grade",
            postgresql.ENUM(*_QUALITY_GRADE_VALUES, name="quality_grade", create_type=False),
            nullable=False,
        ),
        sa.Column("formula_version", sa.String(length=64), nullable=False),
        sa.Column("components", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["dataset_id"],
            ["datasets.id"],
            name=op.f("fk_quality_scores_dataset_id_datasets"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["dataset_version_id"],
            ["dataset_versions.id"],
            name=op.f("fk_quality_scores_dataset_version_id_dataset_versions"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["profile_id"],
            ["dataset_profiles.id"],
            name=op.f("fk_quality_scores_profile_id_dataset_profiles"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_quality_scores")),
    )
    op.create_index(
        "ix_quality_scores_dataset_created",
        "quality_scores",
        ["dataset_id", "created_at"],
        unique=False,
    )
    op.create_index("ix_quality_scores_profile", "quality_scores", ["profile_id"], unique=False)
    op.create_index("ix_quality_scores_grade", "quality_scores", ["grade"], unique=False)


def downgrade() -> None:
    """Remove the quality_scores table and drop the quality_grade enum."""

    op.drop_index("ix_quality_scores_grade", table_name="quality_scores")
    op.drop_index("ix_quality_scores_profile", table_name="quality_scores")
    op.drop_index("ix_quality_scores_dataset_created", table_name="quality_scores")
    op.drop_table("quality_scores")

    bind = op.get_bind()
    postgresql.ENUM(name="quality_grade").drop(bind, checkfirst=False)
