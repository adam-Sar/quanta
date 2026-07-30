"""Establish the Alembic revision chain without creating domain tables.

Revision ID: 0001_foundation
Revises: None
Create Date: 2026-07-30
"""

revision: str = "0001_foundation"
down_revision: str | None = None
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    """Mark databases as initialized for the first domain migration."""


def downgrade() -> None:
    """Return to an unversioned, still-empty application schema."""
