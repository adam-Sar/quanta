"""AI reasoning orchestration (Task 7).

The service reads the immutable Task 4 finding rows bound to the
latest profile, builds a bounded prompt, calls the configured
``LLMProvider``, validates the structured response, and persists a
fresh immutable ``ai_interpretations`` row in a single transaction.
It never re-profiles data, never computes statistics, and never
mutates the upstream Task 2-6 rows.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.exceptions import (
    InterpretationNotAvailableError,
    ProviderError,
)
from app.ai.prompts import (
    InterpretationResponseSchema,
    build_interpretation_prompt,
)
from app.ai.protocols import LLMProvider
from app.ai.types import (
    INTERPRETATION_FORMULA_VERSION,
    Hypothesis,
    InterpretationResult,
    PersistedInterpretation,
    ProviderKind,
)
from app.core.config import Settings
from app.db.models.ai_interpretation import AIInterpretation
from app.db.models.dataset import DatasetVersion
from app.db.models.finding import Finding
from app.db.models.profile import DatasetProfile
from app.db.models.quality_score import QualityScore
from app.db.repositories.ai_interpretations import AIInterpretationRepository

logger = logging.getLogger(__name__)


class ReasoningService:
    """Read findings, call the LLM provider, and persist the result."""

    def __init__(
        self,
        *,
        session: Session,
        repository: AIInterpretationRepository,
        provider: LLMProvider,
        settings: Settings,
    ) -> None:
        self.session = session
        self.repository = repository
        self.provider = provider
        self.settings = settings

    # ------------------------------------------------------------------
    # Public surface
    # ------------------------------------------------------------------

    def interpret(self, dataset_id: UUID) -> AIInterpretation:
        """Interpret the latest detection batch for a dataset."""

        if not self._dataset_exists(dataset_id):
            raise InterpretationNotAvailableError()
        latest_profile_id = self._latest_profile_id(dataset_id)
        if latest_profile_id is None:
            raise InterpretationNotAvailableError()
        return self.interpret_profile(latest_profile_id)

    def interpret_profile(self, profile_id: UUID) -> AIInterpretation:
        """Interpret a specific persisted profile."""

        profile = self.session.get(DatasetProfile, profile_id)
        if profile is None:
            raise InterpretationNotAvailableError()
        dataset = self._dataset_row(profile.dataset_id)
        if dataset is None:
            raise InterpretationNotAvailableError()
        findings_rows = self._findings(profile_id)
        if not findings_rows:
            raise InterpretationNotAvailableError()
        score = self._latest_score(profile.dataset_version_id)
        context_findings = self._build_finding_context(findings_rows)
        prompt = build_interpretation_prompt(
            dataset_name=dataset.name,
            profile_id=str(profile.id),
            score=score.score if score else None,
            grade=score.grade if score else None,
            findings=context_findings,
        )
        try:
            response = self.provider.complete(
                prompt=prompt,
                response_model=InterpretationResponseSchema,
                context={
                    "dataset_name": dataset.name,
                    "profile_id": str(profile.id),
                    "findings": context_findings,
                },
            )
        except ProviderError:
            raise
        except Exception as exc:
            raise ProviderError(str(exc)) from exc

        if not isinstance(response, InterpretationResponseSchema):
            raise ProviderError(f"Provider returned unexpected type: {type(response).__name__}")
        result = self._build_result(
            dataset_id=profile.dataset_id,
            profile_id=profile.id,
            response=response,
        )
        row = self._persist(result, context_findings)
        logger.info(
            "ai_interpretation_completed",
            extra={
                "dataset_id": str(profile.dataset_id),
                "profile_id": str(profile.id),
                "interpretation_id": str(row.id),
                "provider": result.provider_name.value,
                "hypothesis_count": len(result.hypotheses),
            },
        )
        return row

    def get_interpretation(self, interpretation_id: UUID) -> AIInterpretation:
        row = self.repository.get(interpretation_id)
        if row is None:
            raise InterpretationNotAvailableError()
        return row

    def list_for_dataset(
        self,
        dataset_id: UUID,
        *,
        offset: int,
        limit: int,
    ) -> tuple[list[AIInterpretation], int]:
        if not self._dataset_exists(dataset_id):
            raise InterpretationNotAvailableError()
        items, total = self.repository.list_for_dataset(dataset_id, offset=offset, limit=limit)
        return list(items), total

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _dataset_exists(self, dataset_id: UUID) -> bool:
        return (
            self.session.scalar(
                select(DatasetVersion.id).where(DatasetVersion.dataset_id == dataset_id).limit(1)
            )
            is not None
        )

    def _dataset_row(self, dataset_id: UUID) -> Any:
        from app.db.models.dataset import Dataset

        return self.session.get(Dataset, dataset_id)

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

    def _build_finding_context(self, findings: Sequence[Finding]) -> list[dict[str, Any]]:
        context: list[dict[str, Any]] = []
        for item in findings[:20]:  # bounded to a small slice
            severity = item.severity.value if hasattr(item.severity, "value") else item.severity
            context.append(
                {
                    "finding_id": str(item.id),
                    "kind": item.kind.value if hasattr(item.kind, "value") else item.kind,
                    "severity": severity,
                    "column": item.column_name,
                    "value": float(item.value),
                    "threshold": float(item.threshold),
                    "summary": item.description,
                }
            )
        return context

    def _build_result(
        self,
        *,
        dataset_id: UUID,
        profile_id: UUID,
        response: InterpretationResponseSchema,
    ) -> InterpretationResult:
        hypotheses = tuple(
            Hypothesis(
                category=h.category,
                summary=h.summary,
                affected_columns=tuple(h.affected_columns),
                supporting_finding_ids=tuple(UUID(value) for value in h.supporting_finding_ids),
                confidence=h.confidence,
            )
            for h in response.hypotheses
        )
        provider_name = ProviderKind(self.provider.name)
        model_name = getattr(self.provider, "model_name", "n/a")
        return InterpretationResult(
            dataset_id=dataset_id,
            profile_id=profile_id,
            provider_name=provider_name,
            model_name=model_name,
            formula_version=INTERPRETATION_FORMULA_VERSION,
            summary=response.summary,
            hypotheses=hypotheses,
            overall_confidence=response.overall_confidence,
            created_at=datetime.now(UTC),
        )

    def _persist(
        self,
        result: InterpretationResult,
        context_findings: list[dict[str, Any]],
    ) -> AIInterpretation:
        hypotheses_payload = [
            {
                "category": h.category.value,
                "summary": h.summary,
                "affected_columns": list(h.affected_columns),
                "supporting_finding_ids": [str(fid) for fid in h.supporting_finding_ids],
                "confidence": h.confidence,
            }
            for h in result.hypotheses
        ]
        row = AIInterpretation(
            dataset_id=result.dataset_id,
            profile_id=result.profile_id,
            provider_name=result.provider_name.value,
            model_name=result.model_name,
            formula_version=result.formula_version,
            summary=result.summary,
            overall_confidence=result.overall_confidence,
            input_finding_ids=[str(item["finding_id"]) for item in context_findings],
            hypotheses=hypotheses_payload,
        )
        try:
            self.repository.add(row)
            self.session.commit()
        except Exception:
            self.session.rollback()
            raise
        self.session.refresh(row)
        return row


def to_persisted_interpretation(row: AIInterpretation) -> PersistedInterpretation:
    """Translate an ORM ``AIInterpretation`` row into a domain object."""

    return PersistedInterpretation(
        interpretation_id=row.id,
        dataset_id=row.dataset_id,
        profile_id=row.profile_id,
        provider_name=row.provider_name,
        model_name=row.model_name,
        formula_version=row.formula_version,
        summary=row.summary,
        hypotheses=tuple(row.hypotheses or []),
        overall_confidence=float(row.overall_confidence),
        input_finding_ids=tuple(UUID(value) for value in (row.input_finding_ids or [])),
        created_at=row.created_at,
    )


__all__ = [
    "ReasoningService",
    "to_persisted_interpretation",
]
