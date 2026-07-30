"""Persistence queries for profile artifacts."""

from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.db.models.profile import ColumnProfile, DatasetProfile


class ProfileRepository:
    """Wrap SQLAlchemy details so services can stay framework-light."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, profile: DatasetProfile) -> None:
        self.session.add(profile)

    def get_latest_for_version(self, dataset_version_id: UUID) -> DatasetProfile | None:
        statement = (
            select(DatasetProfile)
            .where(DatasetProfile.dataset_version_id == dataset_version_id)
            .options(selectinload(DatasetProfile.columns))
            .order_by(DatasetProfile.created_at.desc(), DatasetProfile.id.desc())
            .limit(1)
        )
        return self.session.scalar(statement)

    def list_for_dataset(
        self,
        dataset_id: UUID,
        *,
        offset: int,
        limit: int,
    ) -> tuple[Sequence[DatasetProfile], int]:
        base_filter = DatasetProfile.dataset_id == dataset_id
        total = (
            self.session.scalar(select(func.count()).select_from(DatasetProfile).where(base_filter))
            or 0
        )
        statement = (
            select(DatasetProfile)
            .where(base_filter)
            .options(selectinload(DatasetProfile.columns))
            .order_by(DatasetProfile.created_at.desc(), DatasetProfile.id.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(self.session.scalars(statement).unique()), total

    def delete_columns(self, profile: DatasetProfile) -> None:
        for column in list(profile.columns):
            self.session.delete(column)

    def add_columns(self, profile: DatasetProfile, columns: list[ColumnProfile]) -> None:
        profile.columns.extend(columns)
