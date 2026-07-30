"""Persistence queries for finding artifacts (Task 4)."""

from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models.finding import Finding


class FindingRepository:
    """Wrap SQLAlchemy details so services can stay framework-light."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, finding: Finding) -> None:
        self.session.add(finding)

    def add_many(self, findings: list[Finding]) -> None:
        for finding in findings:
            self.session.add(finding)

    def list_for_dataset(
        self,
        dataset_id: UUID,
        *,
        offset: int,
        limit: int,
    ) -> tuple[Sequence[Finding], int]:
        base_filter = Finding.dataset_id == dataset_id
        total = (
            self.session.scalar(select(func.count()).select_from(Finding).where(base_filter)) or 0
        )
        statement = (
            select(Finding)
            .where(base_filter)
            .order_by(Finding.created_at.desc(), Finding.id.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(self.session.scalars(statement).unique()), total

    def list_for_profile(
        self,
        profile_id: UUID,
    ) -> list[Finding]:
        statement = (
            select(Finding)
            .where(Finding.profile_id == profile_id)
            .order_by(Finding.created_at.desc(), Finding.id.desc())
        )
        return list(self.session.scalars(statement).unique())

    def count_by_kind(self, dataset_id: UUID) -> dict[str, int]:
        statement = (
            select(Finding.kind, func.count())
            .where(Finding.dataset_id == dataset_id)
            .group_by(Finding.kind)
        )
        return {key.value: int(count) for key, count in self.session.execute(statement).all()}


__all__ = ["Finding", "FindingRepository"]
