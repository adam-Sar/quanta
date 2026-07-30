"""Persistence queries for dataset ingestion and retrieval."""

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.db.models.dataset import Dataset, DatasetVersion


class DatasetRepository:
    """Keep SQLAlchemy query details out of ingestion and HTTP layers."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, dataset: "Dataset") -> None:
        self.session.add(dataset)

    def get(self, dataset_id: UUID) -> "Dataset | None":
        statement = (
            select(Dataset)
            .where(Dataset.id == dataset_id)
            .options(selectinload(Dataset.versions).selectinload(DatasetVersion.columns))
        )
        return self.session.scalar(statement)

    def exists(self, dataset_id: UUID) -> bool:
        statement = select(Dataset.id).where(Dataset.id == dataset_id).limit(1)
        return self.session.scalar(statement) is not None

    def list_datasets(self, *, offset: int, limit: int) -> "tuple[list[Dataset], int]":
        total = self.session.scalar(select(func.count()).select_from(Dataset)) or 0
        statement = (
            select(Dataset)
            .options(selectinload(Dataset.versions).selectinload(DatasetVersion.columns))
            .order_by(Dataset.created_at.desc(), Dataset.id.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(self.session.scalars(statement).unique()), total

    def list_dataset_versions(
        self,
        dataset_id: UUID,
        *,
        offset: int,
        limit: int,
    ) -> "tuple[list[DatasetVersion], int]":
        base_filter = DatasetVersion.dataset_id == dataset_id
        total = (
            self.session.scalar(select(func.count()).select_from(DatasetVersion).where(base_filter))
            or 0
        )
        statement = (
            select(DatasetVersion)
            .where(base_filter)
            .options(selectinload(DatasetVersion.columns))
            .order_by(DatasetVersion.version_number.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(self.session.scalars(statement).unique()), total
