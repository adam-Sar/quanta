"""Persistence queries for recommendation artifacts (Task 8)."""

from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models.recommendation import Recommendation


class RecommendationRepository:
    """Wrap SQLAlchemy details so the service layer can stay framework-light."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, recommendation: Recommendation) -> None:
        self.session.add(recommendation)

    def get(self, recommendation_id: UUID) -> Recommendation | None:
        return self.session.get(Recommendation, recommendation_id)

    def list_for_dataset(
        self,
        dataset_id: UUID,
        *,
        offset: int,
        limit: int,
    ) -> tuple[Sequence[Recommendation], int]:
        base_filter = Recommendation.dataset_id == dataset_id
        total = (
            self.session.scalar(
                select(func.count()).select_from(Recommendation).where(base_filter)
            )
            or 0
        )
        statement = (
            select(Recommendation)
            .where(base_filter)
            .order_by(
                Recommendation.created_at.desc(),
                Recommendation.id.desc(),
            )
            .offset(offset)
            .limit(limit)
        )
        return list(self.session.scalars(statement).unique()), total


__all__ = ["Recommendation", "RecommendationRepository"]