"""Scoring orchestration over a stored detection batch (Task 5).

The service reads the latest immutable detection batch for a dataset
(or a specific profile's batch) and persists a fresh
``QualityScore`` row. The original file, profile rows, and finding
rows are never mutated; a database failure rolls back the insert only.
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.models.dataset import DatasetVersion
from app.db.models.finding import Finding as FindingModel
from app.db.models.quality_score import QualityScore
from app.db.repositories.findings import FindingRepository
from app.db.repositories.quality_scores import QualityScoreRepository
from app.detection.types import (
    Finding as DomainFinding,
)
from app.detection.types import (
    FindingKind,
    FindingSeverity,
)
from app.scoring.exceptions import ScoringNotProfileableError
from app.scoring.formula import compute_quality_score
from app.scoring.types import (
    DatasetQualityScore,
    PersistedQualityScore,
    QualityGrade,
)
from app.services.exceptions import DatasetNotFoundError

logger = logging.getLogger(__name__)


class ScoringService:
    """Run the deterministic scoring formula over an immutable finding batch."""

    def __init__(
        self,
        *,
        session: Session,
        repository: QualityScoreRepository,
        finding_repository: FindingRepository,
        settings: Settings,
    ) -> None:
        self.session = session
        self.repository = repository
        self.finding_repository = finding_repository
        self.settings = settings

    # ------------------------------------------------------------------
    # Public surface
    # ------------------------------------------------------------------

    def score_latest(self, dataset_id: UUID) -> QualityScore:
        """Compute a fresh score for the dataset's latest detection batch."""

        if not self._dataset_exists(dataset_id):
            raise DatasetNotFoundError(dataset_id)
        latest_profile_id = self._latest_profile_id(dataset_id)
        if latest_profile_id is None:
            raise ScoringNotProfileableError()
        return self._score_profile(latest_profile_id)

    def score_profile(self, profile_id: UUID) -> QualityScore:
        """Compute a fresh score for a specific persisted profile."""

        return self._score_profile(profile_id)

    def get_latest(self, dataset_id: UUID) -> QualityScore:
        """Return the most recently created score row for the dataset."""

        if not self._dataset_exists(dataset_id):
            raise DatasetNotFoundError(dataset_id)
        latest_profile_id = self._latest_profile_id(dataset_id)
        if latest_profile_id is None:
            raise ScoringNotProfileableError()
        return self._get_latest_for_profile(latest_profile_id)

    def get_for_version(self, dataset_id: UUID, version_id: UUID) -> QualityScore:
        """Return the most recently created score row for a specific version."""

        if not self._dataset_exists(dataset_id):
            raise DatasetNotFoundError(dataset_id)
        if not self._version_belongs(dataset_id, version_id):
            raise DatasetNotFoundError(dataset_id)
        latest_profile_id = self._latest_profile_id_for_version(version_id)
        if latest_profile_id is None:
            raise ScoringNotProfileableError()
        return self._get_latest_for_profile(latest_profile_id)

    def list_for_dataset(
        self,
        dataset_id: UUID,
        *,
        offset: int,
        limit: int,
    ) -> tuple[list[QualityScore], int]:
        """List score rows for a dataset (newest first)."""

        if not self._dataset_exists(dataset_id):
            raise DatasetNotFoundError(dataset_id)
        items, total = self.repository.list_for_dataset(dataset_id, offset=offset, limit=limit)
        return list(items), total

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _dataset_exists(self, dataset_id: UUID) -> bool:
        statement = (
            select(DatasetVersion.id).where(DatasetVersion.dataset_id == dataset_id).limit(1)
        )
        return self.session.scalar(statement) is not None

    def _version_belongs(self, dataset_id: UUID, version_id: UUID) -> bool:
        statement = select(DatasetVersion.id).where(
            DatasetVersion.id == version_id,
            DatasetVersion.dataset_id == dataset_id,
        )
        return self.session.scalar(statement) is not None

    def _latest_profile_id(self, dataset_id: UUID) -> UUID | None:
        from app.db.models.profile import DatasetProfile

        statement = (
            select(DatasetProfile.id)
            .where(DatasetProfile.dataset_id == dataset_id)
            .order_by(DatasetProfile.created_at.desc(), DatasetProfile.id.desc())
            .limit(1)
        )
        return self.session.scalar(statement)

    def _latest_profile_id_for_version(self, version_id: UUID) -> UUID | None:
        from app.db.models.profile import DatasetProfile

        statement = (
            select(DatasetProfile.id)
            .where(DatasetProfile.dataset_version_id == version_id)
            .order_by(DatasetProfile.created_at.desc(), DatasetProfile.id.desc())
            .limit(1)
        )
        return self.session.scalar(statement)

    def _column_count_for_version(self, version_id: UUID) -> int:
        from app.db.models.dataset import DatasetColumn

        statement = (
            select(DatasetColumn.id)
            .where(DatasetColumn.dataset_version_id == version_id)
            .limit(1000)
        )
        return len(list(self.session.scalars(statement)))

    def _score_profile(self, profile_id: UUID) -> QualityScore:
        from app.db.models.profile import DatasetProfile

        profile = self.session.get(DatasetProfile, profile_id)
        if profile is None:
            raise ScoringNotProfileableError()
        findings_rows = self.finding_repository.list_for_profile(profile_id)
        if not findings_rows:
            raise ScoringNotProfileableError()
        column_count = self._column_count_for_version(profile.dataset_version_id)
        domain_findings = tuple(_row_to_domain(row) for row in findings_rows)
        score = compute_quality_score(
            dataset_id=profile.dataset_id,
            dataset_version_id=profile.dataset_version_id,
            profile_id=profile.id,
            findings=domain_findings,
            column_count=column_count,
        )
        row = self._persist(score)
        logger.info(
            "scoring_run_completed",
            extra={
                "dataset_id": str(profile.dataset_id),
                "profile_id": str(profile.id),
                "score_id": str(row.id),
                "score": score.score,
                "grade": score.grade.value,
                "finding_count": score.finding_count,
            },
        )
        return row

    def _get_latest_for_profile(self, profile_id: UUID) -> QualityScore:
        row = self.repository.get_latest_for_profile(profile_id)
        if row is None:
            raise ScoringNotProfileableError()
        return row

    def _persist(self, score: DatasetQualityScore) -> QualityScore:
        components = score.components.to_dict()
        # Augment the persisted components with the per-finding confidence
        # breakdown so the API layer can surface it without recomputing.
        per_finding = [
            {
                "kind": sf.finding.kind.value,
                "severity": sf.finding.severity.value,
                "column_name": sf.finding.column_name,
                "metric": sf.finding.metric,
                "value": sf.finding.value,
                "threshold": sf.finding.threshold,
                "detection_confidence": round(sf.confidence.detection_confidence, 4),
                "data_error_confidence": round(sf.confidence.data_error_confidence, 4),
                "penalty": round(sf.penalty, 6),
            }
            for sf in score.scored_findings
        ]
        components["per_finding"] = per_finding
        row = QualityScore(
            dataset_id=score.dataset_id,
            dataset_version_id=score.dataset_version_id,
            profile_id=score.profile_id,
            finding_count=score.finding_count,
            score=score.score,
            grade=score.grade,
            formula_version=score.formula_version,
            components=components,
        )
        try:
            self.repository.add(row)
            self.session.commit()
        except Exception:
            self.session.rollback()
            raise
        self.session.refresh(row)
        return row


def _row_to_domain(row: FindingModel) -> DomainFinding:
    """Translate an ORM ``Finding`` row into the domain ``Finding`` dataclass."""

    return DomainFinding(
        kind=FindingKind(row.kind.value if hasattr(row.kind, "value") else row.kind),
        severity=FindingSeverity(
            row.severity.value if hasattr(row.severity, "value") else row.severity
        ),
        column_name=row.column_name,
        metric=row.metric,
        value=float(row.value),
        threshold=float(row.threshold),
        description=row.description,
        details=dict(row.details) if row.details else {},
    )


def to_persisted_score(row: QualityScore) -> PersistedQualityScore:
    """Translate an ORM ``QualityScore`` into a ``PersistedQualityScore``."""

    return PersistedQualityScore(
        score_id=row.id,
        dataset_id=row.dataset_id,
        dataset_version_id=row.dataset_version_id,
        profile_id=row.profile_id,
        finding_count=row.finding_count,
        score=float(row.score),
        grade=QualityGrade(row.grade.value if hasattr(row.grade, "value") else row.grade),
        formula_version=row.formula_version,
        components=dict(row.components) if row.components else {},
    )


def score_to_dict(row: QualityScore) -> dict[str, Any]:
    """Render a persisted ``QualityScore`` row to an API-friendly dict."""

    return {
        "score_id": row.id,
        "dataset_id": row.dataset_id,
        "dataset_version_id": row.dataset_version_id,
        "profile_id": row.profile_id,
        "finding_count": row.finding_count,
        "score": float(row.score),
        "grade": row.grade.value,
        "formula_version": row.formula_version,
        "components": dict(row.components) if row.components else {},
        "created_at": row.created_at,
    }


__all__ = [
    "DatasetNotFoundError",
    "ScoringNotProfileableError",
    "ScoringService",
    "score_to_dict",
    "to_persisted_score",
]
