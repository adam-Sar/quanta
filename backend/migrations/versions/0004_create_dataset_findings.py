"""Create dataset findings table (Task 4).

Revision ID: 0004_create_dataset_findings
Revises: 0003_create_dataset_profiles
Create Date: 2026-07-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004_create_dataset_findings"
down_revision: str | None = "0003_create_dataset_profiles"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_FINDING_KIND_VALUES = (
    "missingness",
    "duplicates",
    "invalid_values",
    "outlier",
    "cardinality",
)
_FINDING_SEVERITY_VALUES = (
    "info",
    "low",
    "medium",
    "high",
    "critical",
)


def upgrade() -> None:
    """Create the findings table plus the two PostgreSQL enums."""

    bind = op.get_bind()
    finding_kind = postgresql.ENUM(*_FINDING_KIND_VALUES, name="finding_kind")
    finding_severity = postgresql.ENUM(*_FINDING_SEVERITY_VALUES, name="finding_severity")
    finding_kind.create(bind, checkfirst=False)
    finding_severity.create(bind, checkfirst=False)

    op.create_table(
        "findings",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("dataset_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("dataset_version_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("profile_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "kind",
            postgresql.ENUM(*_FINDING_KIND_VALUES, name="finding_kind", create_type=False),
            nullable=False,
        ),
        sa.Column(
            "severity",
            postgresql.ENUM(*_FINDING_SEVERITY_VALUES, name="finding_severity", create_type=False),
            nullable=False,
        ),
        sa.Column("column_name", sa.String(length=255), nullable=True),
        sa.Column("metric", sa.String(length=64), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("threshold", sa.Float(), nullable=False),
        sa.Column("description", sa.String(length=1024), nullable=False),
        sa.Column("details", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["dataset_id"],
            ["datasets.id"],
            name=op.f("fk_findings_dataset_id_datasets"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["dataset_version_id"],
            ["dataset_versions.id"],
            name=op.f("fk_findings_dataset_version_id_dataset_versions"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["profile_id"],
            ["dataset_profiles.id"],
            name=op.f("fk_findings_profile_id_dataset_profiles"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_findings")),
    )
    op.create_index(
        "ix_findings_dataset_version",
        "findings",
        ["dataset_id", "dataset_version_id"],
        unique=False,
    )
    op.create_index("ix_findings_profile", "findings", ["profile_id"], unique=False)
    op.create_index("ix_findings_kind_severity", "findings", ["kind", "severity"], unique=False)


def downgrade() -> None:
    """Remove the findings table and drop the two enums."""

    op.drop_index("ix_findings_kind_severity", table_name="findings")
    op.drop_index("ix_findings_profile", table_name="findings")
    op.drop_index("ix_findings_dataset_version", table_name="findings")
    op.drop_table("findings")

    bind = op.get_bind()
    postgresql.ENUM(name="finding_severity").drop(bind, checkfirst=False)
    postgresql.ENUM(name="finding_kind").drop(bind, checkfirst=False)
