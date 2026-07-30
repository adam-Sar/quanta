"""Persistence queries for quality score artifacts (Task 5)."""

from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models.quality_score import QualityScore


class QualityScoreRepository:
    """Wrap SQLAlchemy details so the service layer can stay framework-light."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, score: QualityScore) -> None:
        self.session.add(score)

    def list_for_dataset(
        self,
        dataset_id: UUID,
        *,
        offset: int,
        limit: int,
    ) -> tuple[Sequence[QualityScore], int]:
        base_filter = QualityScore.dataset_id == dataset_id
        total = (
            self.session.scalar(select(func.count()).select_from(QualityScore).where(base_filter))
            or 0
        )
        statement = (
            select(QualityScore)
            .where(base_filter)
            .order_by(QualityScore.created_at.desc(), QualityScore.id.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(self.session.scalars(statement).unique()), total

    def get_latest_for_profile(self, profile_id: UUID) -> QualityScore | None:
        statement = (
            select(QualityScore)
            .where(QualityScore.profile_id == profile_id)
            .order_by(QualityScore.created_at.desc(), QualityScore.id.desc())
            .limit(1)
        )
        return self.session.scalar(statement)


__all__ = ["QualityScore", "QualityScoreRepository"]
