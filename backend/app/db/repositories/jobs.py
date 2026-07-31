"""Persistence queries for durable analysis jobs (Task 10)."""

from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models.job import Job


class JobRepository:
    """Wrap SQLAlchemy details so the service layer can stay framework-light."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, job: Job) -> None:
        self.session.add(job)

    def get(self, job_id: UUID) -> Job | None:
        return self.session.get(Job, job_id)

    def list_for_dataset(
        self,
        dataset_id: UUID,
        *,
        offset: int,
        limit: int,
    ) -> tuple[Sequence[Job], int]:
        base_filter = Job.dataset_id == dataset_id
        total = (
            self.session.scalar(
                select(func.count()).select_from(Job).where(base_filter)
            )
            or 0
        )
        statement = (
            select(Job)
            .where(base_filter)
            .order_by(Job.created_at.desc(), Job.id.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(self.session.scalars(statement).unique()), total


__all__ = ["Job", "JobRepository"]
