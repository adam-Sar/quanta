"""Validation orchestration (Task 9).

The service consumes a Task 8 recommendation row, runs the
deterministic preview engine over the persisted source file, and
persists a fresh immutable ``Validation`` row in a single transaction.
The service never mutates the source file; the ``impact`` field is a
projected summary, not an applied effect. The actual apply call,
which would create a new immutable dataset version, is **explicitly
out of scope** and lands in a later task.
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.models.dataset import DatasetVersion
from app.db.models.profile import DatasetProfile
from app.db.models.recommendation import Recommendation
from app.db.repositories.recommendations import RecommendationRepository
from app.db.repositories.validations import ValidationRepository
from app.ingestion.types import DatasetFormat
from app.recommendations.service import RecommendationService
from app.services.exceptions import DatasetNotFoundError
from app.storage.files import FileStorage
from app.validation.exceptions import (
    InvalidValidationStateError,
    ValidationNotFoundError,
)
from app.validation.formula import (
    VALIDATION_FORMULA_VERSION,
    preview_recommendation,
)
from app.validation.types import (
    PersistedValidation,
    ValidationImpact,
)

logger = logging.getLogger(__name__)


class ValidationService:
    """Run the deterministic preview engine and persist the result."""

    def __init__(
        self,
        *,
        session: Session,
        repository: ValidationRepository,
        recommendation_repository: RecommendationRepository,
        recommendation_service: RecommendationService,
        storage: FileStorage,
        settings: Settings,
    ) -> None:
        self.session = session
        self.repository = repository
        self.recommendation_repository = recommendation_repository
        self.recommendation_service = recommendation_service
        self.storage = storage
        self.settings = settings

    # ------------------------------------------------------------------
    # Public surface
    # ------------------------------------------------------------------

    def validate_recommendation(self, recommendation_id: UUID) -> Any:
        """Run the deterministic preview against the source file and persist."""

        recommendation = self._load_recommendation(recommendation_id)
        version = self._load_dataset_version(recommendation.dataset_id)
        if version is None:
            raise InvalidValidationStateError("missing_dataset_version")
        path = self._resolve_path(version)
        preview = preview_recommendation(
            self._to_domain_recommendation(recommendation),
            path=path,
            fmt=DatasetFormat(version.format),
            sample_size=self.settings.profile_default_sample_rows,
        )
        row = self._persist(
            recommendation=recommendation,
            version=version,
            preview=preview,
        )
        logger.info(
            "validation_run_completed",
            extra={
                "dataset_id": str(recommendation.dataset_id),
                "profile_id": str(recommendation.profile_id),
                "recommendation_id": str(recommendation.id),
                "validation_id": str(row.id),
                "status": preview.status.value,
            },
        )
        return row

    def get_validation(self, validation_id: UUID) -> Any:
        row = self.repository.get(validation_id)
        if row is None:
            raise ValidationNotFoundError(validation_id)
        return row

    def list_for_recommendation(
        self,
        recommendation_id: UUID,
        *,
        offset: int,
        limit: int,
    ) -> tuple[list[Any], int]:
        if not self._recommendation_exists(recommendation_id):
            raise ValidationNotFoundError(recommendation_id)
        items, total = self.repository.list_for_recommendation(
            recommendation_id, offset=offset, limit=limit
        )
        return list(items), total

    def list_for_dataset(
        self,
        dataset_id: UUID,
        *,
        offset: int,
        limit: int,
    ) -> tuple[list[Any], int]:
        if not self._dataset_exists(dataset_id):
            raise DatasetNotFoundError(dataset_id)
        items, total = self.repository.list_for_dataset(dataset_id, offset=offset, limit=limit)
        return list(items), total

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _load_recommendation(self, recommendation_id: UUID) -> Recommendation:
        recommendation = self.recommendation_repository.get(recommendation_id)
        if recommendation is None:
            raise ValidationNotFoundError(recommendation_id)
        return recommendation

    def _load_dataset_version(self, dataset_id: UUID) -> DatasetVersion | None:
        statement = (
            select(DatasetVersion)
            .where(DatasetVersion.dataset_id == dataset_id)
            .order_by(DatasetVersion.version_number.desc())
            .limit(1)
        )
        return self.session.scalar(statement)

    def _resolve_path(self, version: DatasetVersion) -> Any:
        try:
            return self.storage.path_for(version.storage_key)
        except ValueError as exc:
            raise InvalidValidationStateError("invalid_storage_key") from exc

    def _recommendation_exists(self, recommendation_id: UUID) -> bool:
        statement = (
            select(Recommendation.id)
            .where(Recommendation.id == recommendation_id)
            .limit(1)
        )
        return self.session.scalar(statement) is not None

    def _dataset_exists(self, dataset_id: UUID) -> bool:
        return (
            self.session.scalar(
                select(DatasetVersion.id).where(DatasetVersion.dataset_id == dataset_id).limit(1)
            )
            is not None
        )

    def _to_domain_recommendation(self, row: Recommendation) -> Any:
        from app.recommendations.types import (
            OperationKind as RecOperationKind,
            Recommendation as DomainRecommendation,
            RecommendationOperation,
            RecommendationSeverity as DomainSeverity,
        )

        severity_value = (
            row.severity.value if hasattr(row.severity, "value") else row.severity
        )
        return DomainRecommendation(
            kind=row.kind,
            severity=DomainSeverity(severity_value),
            title=row.title,
            rationale=row.rationale,
            affected_columns=tuple(row.affected_columns or ()),
            supporting_finding_ids=tuple(
                uuid_value
                for uuid_value in (row.supporting_finding_ids or ())
                if uuid_value
            ),
            confidence=float(row.confidence),
            priority=int(row.priority),
            operation=(
                RecommendationOperation(
                    kind=RecOperationKind(
                        row.operation_kind.value
                        if hasattr(row.operation_kind, "value")
                        else row.operation_kind
                    )
                    if row.operation_kind is not None
                    else RecOperationKind.REVIEW,
                    params=dict(row.operation_params or {}),
                    preview_only=bool(row.preview_only),
                )
                if row.operation_kind is not None
                else None
            ),
        )

    def _persist(
        self,
        *,
        recommendation: Recommendation,
        version: DatasetVersion,
        preview: Any,
    ) -> Any:
        profile_id = self._resolve_profile_id(version, recommendation)
        components = self._build_components(
            recommendation=recommendation,
            version=version,
            profile_id=profile_id,
            preview=preview,
        )
        row = self.repository.__class__.__init__.__globals__["Validation"](  # type: ignore[attr-defined]
            dataset_id=recommendation.dataset_id,
            dataset_version_id=version.id,
            profile_id=profile_id,
            recommendation_id=recommendation.id,
            operation_kind=(
                recommendation.operation_kind
                if hasattr(recommendation.operation_kind, "value")
                else str(recommendation.operation_kind)
            ),
            status=preview.status,
            title=self._title_for(recommendation, preview),
            rationale=preview.impact.summary,
            impact=self._impact_to_payload(preview.impact),
            components=components,
            formula_version=VALIDATION_FORMULA_VERSION,
        )
        try:
            self.repository.add(row)
            self.session.commit()
        except Exception:
            self.session.rollback()
            raise
        self.session.refresh(row)
        return row

    def _resolve_profile_id(
        self, version: DatasetVersion, recommendation: Recommendation
    ) -> UUID:
        profile_id = recommendation.profile_id
        existing = self.session.get(DatasetProfile, profile_id)
        if existing is not None:
            return existing.id
        statement = (
            select(DatasetProfile)
            .where(DatasetProfile.dataset_version_id == version.id)
            .order_by(DatasetProfile.created_at.desc(), DatasetProfile.id.desc())
            .limit(1)
        )
        latest = self.session.scalar(statement)
        if latest is not None:
            return latest.id
        return profile_id

    def _title_for(self, recommendation: Recommendation, preview: Any) -> str:
        op = recommendation.operation_kind
        op_value = op if isinstance(op, str) else getattr(op, "value", str(op))
        return f"Validation preview for {op_value} on '{recommendation.title}'"

    def _impact_to_payload(self, impact: ValidationImpact) -> dict[str, Any]:
        return {
            "affected_rows": impact.affected_rows,
            "affected_columns": list(impact.affected_columns),
            "summary": impact.summary,
            "unexpected_side_effects": list(impact.unexpected_side_effects),
        }

    def _build_components(
        self,
        *,
        recommendation: Recommendation,
        version: DatasetVersion,
        profile_id: UUID,
        preview: Any,
    ) -> dict[str, Any]:
        return {
            "dataset_id": str(recommendation.dataset_id),
            "dataset_version_id": str(version.id),
            "profile_id": str(profile_id),
            "recommendation_id": str(recommendation.id),
            "operation_kind": (
                recommendation.operation_kind
                if isinstance(recommendation.operation_kind, str)
                else recommendation.operation_kind.value
            ),
            "supporting_finding_ids": list(recommendation.supporting_finding_ids or []),
            "preview_status": preview.status.value,
            "formula_version": VALIDATION_FORMULA_VERSION,
        }


def to_persisted_validation(row: Any) -> PersistedValidation:
    """Translate an ORM ``Validation`` row into a domain ``PersistedValidation``."""

    return PersistedValidation(
        validation_id=row.id,
        dataset_id=row.dataset_id,
        dataset_version_id=row.dataset_version_id,
        profile_id=row.profile_id,
        recommendation_id=row.recommendation_id,
        operation_kind=row.operation_kind,
        status=row.status,
        title=row.title,
        rationale=row.rationale,
        impact=dict(row.impact or {}),
        components=dict(row.components or {}),
        formula_version=row.formula_version,
        created_at=row.created_at,
    )


def validation_to_dict(row: Any) -> dict[str, Any]:
    """Render a persisted ``Validation`` row to an API-friendly dict."""

    impact = dict(row.impact or {})
    return {
        "validation_id": row.id,
        "dataset_id": row.dataset_id,
        "dataset_version_id": row.dataset_version_id,
        "profile_id": row.profile_id,
        "recommendation_id": row.recommendation_id,
        "operation_kind": row.operation_kind,
        "status": row.status if isinstance(row.status, str) else row.status.value,
        "title": row.title,
        "rationale": row.rationale,
        "impact": {
            "affected_rows": impact.get("affected_rows"),
            "affected_columns": list(impact.get("affected_columns") or []),
            "summary": impact.get("summary", ""),
            "unexpected_side_effects": list(impact.get("unexpected_side_effects") or []),
        },
        "components": dict(row.components or {}),
        "formula_version": row.formula_version,
        "created_at": row.created_at,
    }


__all__ = [
    "DatasetNotFoundError",
    "ValidationService",
    "to_persisted_validation",
    "validation_to_dict",
]