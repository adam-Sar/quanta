"""Recommendation orchestration (Task 8).

The service reads the immutable Task 4 finding rows bound to the
latest profile (optionally the latest Task 5 score and Task 7 AI
interpretation), runs the deterministic rule engine, and persists a
fresh immutable ``Recommendation`` row in a single transaction. The
service never re-profiles data, never executes code on the dataset,
and never calls an LLM directly.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.models.ai_interpretation import AIInterpretation
from app.db.models.dataset import DatasetVersion
from app.db.models.finding import Finding
from app.db.models.profile import DatasetProfile
from app.db.models.quality_score import QualityScore
from app.db.models.recommendation import Recommendation
from app.db.repositories.ai_interpretations import AIInterpretationRepository
from app.db.repositories.findings import FindingRepository
from app.db.repositories.quality_scores import QualityScoreRepository
from app.db.repositories.recommendations import RecommendationRepository
from app.detection.types import Finding as DomainFinding
from app.detection.types import FindingKind, FindingSeverity
from app.recommendations.exceptions import (
    RecommendationNotFoundError,
    RecommendationsNotAvailableError,
)
from app.recommendations.formula import compute_recommendation_run
from app.recommendations.types import (
    RECOMMENDATION_FORMULA_VERSION,
    RecommendationRun,
)
from app.recommendations.types import (
    Recommendation as DomainRecommendation,
)
from app.services.exceptions import DatasetNotFoundError

logger = logging.getLogger(__name__)


class RecommendationService:
    """Run the deterministic rule engine and persist the result."""

    def __init__(
        self,
        *,
        session: Session,
        repository: RecommendationRepository,
        finding_repository: FindingRepository,
        score_repository: QualityScoreRepository,
        interpretation_repository: AIInterpretationRepository,
        settings: Settings,
    ) -> None:
        self.session = session
        self.repository = repository
        self.finding_repository = finding_repository
        self.score_repository = score_repository
        self.interpretation_repository = interpretation_repository
        self.settings = settings

    # ------------------------------------------------------------------
    # Public surface
    # ------------------------------------------------------------------

    def recommend(self, dataset_id: UUID) -> Sequence[Recommendation]:
        """Recommend against the latest detection batch for a dataset."""

        if not self._dataset_exists(dataset_id):
            raise DatasetNotFoundError(dataset_id)
        latest_profile_id = self._latest_profile_id(dataset_id)
        if latest_profile_id is None:
            raise RecommendationsNotAvailableError()
        return self.recommend_profile(latest_profile_id)

    def recommend_profile(self, profile_id: UUID) -> Sequence[Recommendation]:
        """Recommend against the findings bound to a specific profile."""

        profile = self.session.get(DatasetProfile, profile_id)
        if profile is None:
            raise RecommendationsNotAvailableError()
        finding_rows = self._findings(profile_id)
        if not finding_rows:
            raise RecommendationsNotAvailableError()
        domain_findings = tuple(_row_to_domain(row) for row in finding_rows)
        score = self._latest_score(profile.dataset_version_id)
        interpretation = self._latest_interpretation(profile.id)
        run = compute_recommendation_run(
            dataset_id=profile.dataset_id,
            profile_id=profile.id,
            findings=domain_findings,
            max_recommendations=self.settings.recommendation_max_per_run,
        )
        rows = self._persist(
            run=run,
            score=score,
            interpretation=interpretation,
            findings=finding_rows,
        )
        logger.info(
            "recommendation_run_completed",
            extra={
                "dataset_id": str(profile.dataset_id),
                "profile_id": str(profile.id),
                "recommendation_count": len(rows),
                "by_kind": run.by_kind,
                "by_severity": run.by_severity,
            },
        )
        return list(rows)

    def get_recommendation(self, recommendation_id: UUID) -> Recommendation:
        row = self.repository.get(recommendation_id)
        if row is None:
            raise RecommendationNotFoundError(recommendation_id)
        return row

    def list_for_dataset(
        self,
        dataset_id: UUID,
        *,
        offset: int,
        limit: int,
    ) -> tuple[list[Recommendation], int]:
        if not self._dataset_exists(dataset_id):
            raise DatasetNotFoundError(dataset_id)
        items, total = self.repository.list_for_dataset(dataset_id, offset=offset, limit=limit)
        return list(items), total

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _dataset_exists(self, dataset_id: UUID) -> bool:
        return (
            self.session.scalar(
                select(DatasetVersion.id)
                .where(DatasetVersion.dataset_id == dataset_id)
                .limit(1)
            )
            is not None
        )

    def _latest_profile_id(self, dataset_id: UUID) -> UUID | None:
        statement = (
            select(DatasetProfile.id)
            .where(DatasetProfile.dataset_id == dataset_id)
            .order_by(DatasetProfile.created_at.desc(), DatasetProfile.id.desc())
            .limit(1)
        )
        return self.session.scalar(statement)

    def _findings(self, profile_id: UUID) -> list[Finding]:
        statement = (
            select(Finding)
            .where(Finding.profile_id == profile_id)
            .order_by(Finding.created_at.desc(), Finding.id.desc())
        )
        return list(self.session.scalars(statement).all())

    def _latest_score(self, version_id: UUID) -> QualityScore | None:
        statement = (
            select(QualityScore)
            .where(QualityScore.dataset_version_id == version_id)
            .order_by(QualityScore.created_at.desc(), QualityScore.id.desc())
            .limit(1)
        )
        return self.session.scalar(statement)

    def _latest_interpretation(self, profile_id: UUID) -> AIInterpretation | None:
        statement = (
            select(AIInterpretation)
            .where(AIInterpretation.profile_id == profile_id)
            .order_by(AIInterpretation.created_at.desc(), AIInterpretation.id.desc())
            .limit(1)
        )
        return self.session.scalar(statement)

    def _persist(
        self,
        *,
        run: RecommendationRun,
        score: QualityScore | None,
        interpretation: AIInterpretation | None,
        findings: Sequence[Finding],
    ) -> list[Recommendation]:
        rows: list[Recommendation] = []
        try:
            for recommendation in run.recommendations:
                components = _build_components(
                    recommendation=recommendation,
                    run=run,
                    score=score,
                    interpretation=interpretation,
                    findings=findings,
                )
                row = Recommendation(
                    dataset_id=run.dataset_id,
                    profile_id=run.profile_id,
                    kind=recommendation.kind,
                    severity=recommendation.severity,
                    title=recommendation.title,
                    rationale=recommendation.rationale,
                    affected_columns=list(recommendation.affected_columns),
                    supporting_finding_ids=[
                        str(item) for item in recommendation.supporting_finding_ids
                    ],
                    confidence=recommendation.confidence,
                    priority=recommendation.priority,
                    operation_kind=(
                        recommendation.operation.kind if recommendation.operation else None
                    ),
                    operation_params=(
                        dict(recommendation.operation.params)
                        if recommendation.operation
                        else {}
                    ),
                    preview_only=bool(
                        recommendation.operation.preview_only
                        if recommendation.operation
                        else True
                    ),
                    formula_version=RECOMMENDATION_FORMULA_VERSION,
                    components=components,
                )
                self.repository.add(row)
                rows.append(row)
            self.session.commit()
        except Exception:
            self.session.rollback()
            raise
        for row in rows:
            self.session.refresh(row)
        return rows


def _row_to_domain(row: Finding) -> DomainFinding:
    """Translate an ORM ``Finding`` row into the domain ``Finding`` dataclass."""

    return DomainFinding(
        id=row.id,
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


def _build_components(
    *,
    recommendation: DomainRecommendation,
    run: RecommendationRun,
    score: QualityScore | None,
    interpretation: AIInterpretation | None,
    findings: Sequence[Finding],
) -> dict[str, Any]:
    """Build the JSONB-safe ``components`` payload for a recommendation row."""

    finding_payload: list[dict[str, Any]] = []
    for row in findings:
        finding_payload.append(
            {
                "finding_id": str(row.id),
                "kind": row.kind.value if hasattr(row.kind, "value") else row.kind,
                "severity": row.severity.value
                if hasattr(row.severity, "value")
                else row.severity,
                "column_name": row.column_name,
                "metric": row.metric,
                "value": float(row.value),
                "threshold": float(row.threshold),
            }
        )
    return {
        "by_kind": dict(run.by_kind),
        "by_severity": dict(run.by_severity),
        "score": {
            "score": float(score.score) if score is not None else None,
            "grade": score.grade.value
            if score is not None and hasattr(score.grade, "value")
            else None,
        },
        "interpretation_id": str(interpretation.id)
        if interpretation is not None
        else None,
        "formula_version": run.formula_version,
        "generated_at": datetime.now(UTC).isoformat(),
        "findings": finding_payload,
    }


def recommendation_to_dict(row: Recommendation) -> dict[str, Any]:
    """Render a persisted ``Recommendation`` row to an API-friendly dict."""

    return {
        "recommendation_id": row.id,
        "dataset_id": row.dataset_id,
        "profile_id": row.profile_id,
        "kind": row.kind.value if hasattr(row.kind, "value") else row.kind,
        "severity": row.severity.value if hasattr(row.severity, "value") else row.severity,
        "title": row.title,
        "rationale": row.rationale,
        "affected_columns": list(row.affected_columns or []),
        "supporting_finding_ids": list(row.supporting_finding_ids or []),
        "confidence": float(row.confidence),
        "priority": int(row.priority),
        "operation_kind": row.operation_kind,
        "operation_params": dict(row.operation_params or {}),
        "preview_only": bool(row.preview_only),
        "formula_version": row.formula_version,
        "components": dict(row.components or {}),
        "created_at": row.created_at,
    }


__all__ = [
    "DatasetNotFoundError",
    "RecommendationService",
    "recommendation_to_dict",
]