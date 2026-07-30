"""Persistence queries for AI interpretation artifacts (Task 7)."""

from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models.ai_interpretation import AIInterpretation


class AIInterpretationRepository:
    """Wrap SQLAlchemy details so the service layer can stay framework-light."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, interpretation: AIInterpretation) -> None:
        self.session.add(interpretation)

    def get(self, interpretation_id: UUID) -> AIInterpretation | None:
        return self.session.get(AIInterpretation, interpretation_id)

    def list_for_dataset(
        self,
        dataset_id: UUID,
        *,
        offset: int,
        limit: int,
    ) -> tuple[Sequence[AIInterpretation], int]:
        base_filter = AIInterpretation.dataset_id == dataset_id
        total = (
            self.session.scalar(
                select(func.count()).select_from(AIInterpretation).where(base_filter)
            )
            or 0
        )
        statement = (
            select(AIInterpretation)
            .where(base_filter)
            .order_by(AIInterpretation.created_at.desc(), AIInterpretation.id.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(self.session.scalars(statement).unique()), total


__all__ = ["AIInterpretation", "AIInterpretationRepository"]
