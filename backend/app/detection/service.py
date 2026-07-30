"""Detection orchestration over a stored profile (Task 4)."""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.models.finding import Finding
from app.db.models.profile import DatasetProfile
from app.db.repositories.findings import FindingRepository
from app.db.repositories.profiles import ProfileRepository
from app.detection.detectors import run_all_detectors
from app.detection.exceptions import DetectionNotProfileableError
from app.detection.types import (
    Finding as DomainFinding,
)
from app.detection.types import (
    PersistedFinding,
)
from app.profiling.service import to_api_profile
from app.services.exceptions import DatasetNotFoundError

logger = logging.getLogger(__name__)


class DetectionService:
    """Run deterministic detectors against an existing profile.

    The service reads the latest immutable profile for a dataset (or a
    specific version's profile) and persists a fresh batch of Finding
    rows. A database failure rolls back the insert; the profile itself
    is not modified.
    """

    def __init__(
        self,
        *,
        session: Session,
        repository: FindingRepository,
        profile_repository: ProfileRepository,
        settings: Settings,
    ) -> None:
        self.session = session
        self.repository = repository
        self.profile_repository = profile_repository
        self.settings = settings

    def detect_latest(self, dataset_id: UUID) -> list[Finding]:
        """Run detection on the latest profile for the dataset."""

        if not self._dataset_exists(dataset_id):
            raise DatasetNotFoundError(dataset_id)
        profile = self.profile_repository.get_latest_for_dataset(dataset_id)
        if profile is None:
            raise DetectionNotProfileableError()
        return self._run_and_persist(profile)

    def detect_profile(self, profile_id: UUID) -> list[Finding]:
        """Run detection against a specific persisted profile."""

        profile = self.profile_repository.get(profile_id)
        if profile is None:
            raise DetectionNotProfileableError()
        return self._run_and_persist(profile)

    def list_for_dataset(
        self,
        dataset_id: UUID,
        *,
        offset: int,
        limit: int,
    ) -> tuple[list[Finding], int]:
        if not self._dataset_exists(dataset_id):
            raise DatasetNotFoundError(dataset_id)
        items, total = self.repository.list_for_dataset(dataset_id, offset=offset, limit=limit)
        return list(items), total

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _dataset_exists(self, dataset_id: UUID) -> bool:
        from app.db.models.dataset import DatasetVersion

        statement = (
            select(DatasetVersion.id).where(DatasetVersion.dataset_id == dataset_id).limit(1)
        )
        return self.session.scalar(statement) is not None

    def _run_and_persist(self, profile: DatasetProfile) -> list[Finding]:
        domain_profile = to_api_profile(profile)
        findings = run_all_detectors(
            domain_profile,
            missingness_threshold=self.settings.profile_null_threshold,
        )
        rows = [
            Finding(
                dataset_id=profile.dataset_id,
                dataset_version_id=profile.dataset_version_id,
                profile_id=profile.id,
                kind=finding.kind,
                severity=finding.severity,
                column_name=finding.column_name,
                metric=finding.metric,
                value=finding.value,
                threshold=finding.threshold,
                description=finding.description,
                details=finding.details,
            )
            for finding in findings
        ]
        try:
            self.repository.add_many(rows)
            self.session.commit()
        except Exception:
            self.session.rollback()
            raise
        for row in rows:
            self.session.refresh(row)
        logger.info(
            "detection_run_completed",
            extra={
                "dataset_id": str(profile.dataset_id),
                "profile_id": str(profile.id),
                "finding_count": len(rows),
            },
        )
        return rows


def to_persisted_finding(row: Finding) -> PersistedFinding:
    """Translate an ORM Finding into a domain PersistedFinding."""

    return PersistedFinding(
        finding_id=row.id,
        dataset_id=row.dataset_id,
        dataset_version_id=row.dataset_version_id,
        profile_id=row.profile_id,
        kind=row.kind,
        severity=row.severity,
        column_name=row.column_name,
        metric=row.metric,
        value=float(row.value),
        threshold=float(row.threshold),
        description=row.description,
        details=dict(row.details) if row.details else {},
    )


def finding_to_dict(finding: DomainFinding | PersistedFinding) -> dict[str, Any]:
    """Render a finding to a dict for API serialization."""

    if isinstance(finding, DomainFinding):
        return {
            "finding_id": getattr(finding, "finding_id", None),
            "kind": finding.kind.value,
            "severity": finding.severity.value,
            "column_name": finding.column_name,
            "metric": finding.metric,
            "value": finding.value,
            "threshold": finding.threshold,
            "description": finding.description,
            "details": finding.details,
        }
    return {
        "finding_id": finding.finding_id,
        "dataset_id": finding.dataset_id,
        "dataset_version_id": finding.dataset_version_id,
        "profile_id": finding.profile_id,
        "kind": finding.kind.value,
        "severity": finding.severity.value,
        "column_name": finding.column_name,
        "metric": finding.metric,
        "value": finding.value,
        "threshold": finding.threshold,
        "description": finding.description,
        "details": finding.details,
    }


# Re-export DatasetNotFoundError for the API surface.
__all__ = [
    "DatasetNotFoundError",
    "DetectionService",
    "finding_to_dict",
    "to_persisted_finding",
]
