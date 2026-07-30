"""Persistence queries for history comparison artifacts (Task 6)."""

from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models.history_comparison import HistoryComparison


class HistoryComparisonRepository:
    """Wrap SQLAlchemy details so the service layer can stay framework-light."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, comparison: HistoryComparison) -> None:
        self.session.add(comparison)

    def get(self, comparison_id: UUID) -> HistoryComparison | None:
        return self.session.get(HistoryComparison, comparison_id)

    def list_for_dataset(
        self,
        dataset_id: UUID,
        *,
        offset: int,
        limit: int,
    ) -> tuple[Sequence[HistoryComparison], int]:
        base_filter = HistoryComparison.dataset_id == dataset_id
        total = (
            self.session.scalar(
                select(func.count()).select_from(HistoryComparison).where(base_filter)
            )
            or 0
        )
        statement = (
            select(HistoryComparison)
            .where(base_filter)
            .order_by(HistoryComparison.created_at.desc(), HistoryComparison.id.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(self.session.scalars(statement).unique()), total


__all__ = ["HistoryComparison", "HistoryComparisonRepository"]
