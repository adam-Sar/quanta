"""Persistence queries for validation artifacts (Task 9)."""

from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models.validation import Validation


class ValidationRepository:
    """Wrap SQLAlchemy details so the service layer can stay framework-light."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, validation: Validation) -> None:
        self.session.add(validation)

    def get(self, validation_id: UUID) -> Validation | None:
        return self.session.get(Validation, validation_id)

    def list_for_recommendation(
        self,
        recommendation_id: UUID,
        *,
        offset: int,
        limit: int,
    ) -> tuple[Sequence[Validation], int]:
        base_filter = Validation.recommendation_id == recommendation_id
        total = (
            self.session.scalar(
                select(func.count()).select_from(Validation).where(base_filter)
            )
            or 0
        )
        statement = (
            select(Validation)
            .where(base_filter)
            .order_by(Validation.created_at.desc(), Validation.id.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(self.session.scalars(statement).unique()), total

    def list_for_dataset(
        self,
        dataset_id: UUID,
        *,
        offset: int,
        limit: int,
    ) -> tuple[Sequence[Validation], int]:
        base_filter = Validation.dataset_id == dataset_id
        total = (
            self.session.scalar(
                select(func.count()).select_from(Validation).where(base_filter)
            )
            or 0
        )
        statement = (
            select(Validation)
            .where(base_filter)
            .order_by(Validation.created_at.desc(), Validation.id.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(self.session.scalars(statement).unique()), total


__all__ = ["Validation", "ValidationRepository"]