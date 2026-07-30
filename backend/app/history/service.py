"""History orchestration over immutable Task 2-5 rows (Task 6).

The service reads the immutable dataset version, column, profile,
column-profile, and quality-score rows for two dataset versions and
persists a fresh ``HistoryComparison`` row in a single transaction.
Lineage is computed on demand and not persisted.
"""

from __future__ import annotations

import logging
from collections.abc import Iterable
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.models.dataset import DatasetVersion
from app.db.models.history_comparison import HistoryComparison
from app.db.models.profile import ColumnProfile, DatasetProfile
from app.db.models.quality_score import QualityScore
from app.db.repositories.history_comparisons import HistoryComparisonRepository
from app.history.comparison import compare_schema
from app.history.drift import (
    _CategoricalView,
    _NumericView,
    _ScoreView,
    compare_distribution,
    compare_scores,
)
from app.history.exceptions import SameVersionComparisonError, VersionNotFoundError
from app.history.lineage import lineage_chain
from app.history.types import (
    HISTORY_FORMULA_VERSION,
    DatasetComparison,
    DistributionDrift,
    LineageEdge,
    SchemaDiff,
    ScoreDrift,
)
from app.profiling.service import to_api_profile

logger = logging.getLogger(__name__)


class HistoryService:
    """Compute and persist deterministic history comparisons."""

    def __init__(
        self,
        *,
        session: Session,
        repository: HistoryComparisonRepository,
        settings: Settings,
    ) -> None:
        self.session = session
        self.repository = repository
        self.settings = settings

    # ------------------------------------------------------------------
    # Public surface
    # ------------------------------------------------------------------

    def compare_versions(
        self,
        dataset_id: UUID,
        base_version_id: UUID,
        target_version_id: UUID,
    ) -> HistoryComparison:
        """Compute a fresh comparison and persist it as a new row."""

        if base_version_id == target_version_id:
            raise SameVersionComparisonError()
        if not self._dataset_exists(dataset_id):
            raise VersionNotFoundError(dataset_id)
        base_version = self._version(dataset_id, base_version_id)
        target_version = self._version(dataset_id, target_version_id)
        base_columns = self._columns(base_version_id)
        target_columns = self._columns(target_version_id)
        base_profile, base_column_profiles = self._profile_views(base_version_id)
        target_profile, target_column_profiles = self._profile_views(target_version_id)
        base_score = self._latest_score(base_version_id)
        target_score = self._latest_score(target_version_id)
        comparison = self._build_comparison(
            dataset_id=dataset_id,
            base_version=base_version,
            target_version=target_version,
            base_columns=base_columns,
            target_columns=target_columns,
            base_profile=base_profile,
            target_profile=target_profile,
            base_column_profiles=base_column_profiles,
            target_column_profiles=target_column_profiles,
            base_score=base_score,
            target_score=target_score,
        )
        row = self._persist(comparison)
        logger.info(
            "history_comparison_completed",
            extra={
                "dataset_id": str(dataset_id),
                "base_version_id": str(base_version_id),
                "target_version_id": str(target_version_id),
                "comparison_id": str(row.id),
                "has_drift": comparison.has_drift,
            },
        )
        return row

    def get_comparison(self, comparison_id: UUID) -> HistoryComparison:
        row = self.repository.get(comparison_id)
        if row is None:
            raise VersionNotFoundError(comparison_id)
        return row

    def list_for_dataset(
        self,
        dataset_id: UUID,
        *,
        offset: int,
        limit: int,
    ) -> tuple[list[HistoryComparison], int]:
        if not self._dataset_exists(dataset_id):
            raise VersionNotFoundError(dataset_id)
        items, total = self.repository.list_for_dataset(dataset_id, offset=offset, limit=limit)
        return list(items), total

    def lineage(self, dataset_id: UUID) -> tuple[LineageEdge, ...]:
        if not self._dataset_exists(dataset_id):
            raise VersionNotFoundError(dataset_id)
        versions = list[Any](self.session.scalars(self._versions_query(dataset_id)).all())
        return lineage_chain(dataset_id, versions)

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

    def _versions_query(self, dataset_id: UUID) -> Select[tuple[DatasetVersion]]:
        return (
            select(DatasetVersion)
            .where(DatasetVersion.dataset_id == dataset_id)
            .order_by(DatasetVersion.version_number.asc())
        )

    def _version(self, dataset_id: UUID, version_id: UUID) -> DatasetVersion:
        version = self.session.get(DatasetVersion, version_id)
        if version is None or version.dataset_id != dataset_id:
            raise VersionNotFoundError(version_id)
        return version

    def _columns(self, version_id: UUID) -> list[Any]:
        from app.db.models.dataset import DatasetColumn

        statement = (
            select(DatasetColumn)
            .where(DatasetColumn.dataset_version_id == version_id)
            .order_by(DatasetColumn.ordinal_position.asc())
        )
        return list(self.session.scalars(statement).all())

    def _profile_views(self, version_id: UUID) -> tuple[DatasetProfile | None, list[ColumnProfile]]:
        statement = (
            select(DatasetProfile)
            .where(DatasetProfile.dataset_version_id == version_id)
            .order_by(DatasetProfile.created_at.desc(), DatasetProfile.id.desc())
            .limit(1)
        )
        profile = self.session.scalar(statement)
        if profile is None:
            return None, []
        column_rows = list(
            self.session.scalars(
                select(ColumnProfile)
                .where(ColumnProfile.dataset_profile_id == profile.id)
                .order_by(ColumnProfile.ordinal_position.asc())
            ).all()
        )
        return profile, column_rows

    def _latest_score(self, version_id: UUID) -> _ScoreView | None:
        statement = (
            select(QualityScore)
            .where(QualityScore.dataset_version_id == version_id)
            .order_by(QualityScore.created_at.desc(), QualityScore.id.desc())
            .limit(1)
        )
        score = self.session.scalar(statement)
        if score is None:
            return None
        grade = score.grade.value if hasattr(score.grade, "value") else score.grade
        return _ScoreView(score=float(score.score), grade=str(grade))

    def _build_comparison(
        self,
        *,
        dataset_id: UUID,
        base_version: DatasetVersion,
        target_version: DatasetVersion,
        base_columns: Iterable[Any],
        target_columns: Iterable[Any],
        base_profile: DatasetProfile | None,
        target_profile: DatasetProfile | None,
        base_column_profiles: Iterable[ColumnProfile],
        target_column_profiles: Iterable[ColumnProfile],
        base_score: _ScoreView | None,
        target_score: _ScoreView | None,
    ) -> DatasetComparison:
        schema_diff = compare_schema(base_columns, target_columns)
        base_views, target_views = self._projection(
            base_profile=base_profile,
            target_profile=target_profile,
            base_column_profiles=base_column_profiles,
            target_column_profiles=target_column_profiles,
        )
        distribution = compare_distribution(base_columns=base_views, target_columns=target_views)
        score_drift = compare_scores(base_score, target_score)
        return DatasetComparison(
            dataset_id=dataset_id,
            base_version_id=base_version.id,
            target_version_id=target_version.id,
            schema_diff=schema_diff,
            distribution_drift=distribution,
            score_drift=score_drift,
            formula_version=HISTORY_FORMULA_VERSION,
            created_at=datetime.now(UTC),
        )

    @staticmethod
    def _projection(
        *,
        base_profile: DatasetProfile | None,
        target_profile: DatasetProfile | None,
        base_column_profiles: Iterable[ColumnProfile],
        target_column_profiles: Iterable[ColumnProfile],
    ) -> tuple[list[_NumericView | _CategoricalView], list[_NumericView | _CategoricalView]]:
        base_views = _profile_to_views(base_profile, base_column_profiles)
        target_views = _profile_to_views(target_profile, target_column_profiles)
        return base_views, target_views

    def _persist(self, comparison: DatasetComparison) -> HistoryComparison:
        row = HistoryComparison(
            dataset_id=comparison.dataset_id,
            base_version_id=comparison.base_version_id,
            target_version_id=comparison.target_version_id,
            schema_diff=_schema_to_dict(comparison.schema_diff),
            distribution_drift=_distribution_to_dict(comparison.distribution_drift),
            score_drift=_score_to_dict(comparison.score_drift),
            formula_version=comparison.formula_version,
        )
        try:
            self.repository.add(row)
            self.session.commit()
        except Exception:
            self.session.rollback()
            raise
        self.session.refresh(row)
        return row


def _profile_to_views(
    profile: DatasetProfile | None,
    column_rows: Iterable[ColumnProfile],
) -> list[_NumericView | _CategoricalView]:
    if profile is None:
        return []
    api_profile = to_api_profile(profile)
    by_name = {api_column.name: api_column for api_column in api_profile.columns}
    views: list[_NumericView | _CategoricalView] = []
    for column_row in column_rows:
        api_column = by_name.get(column_row.name)
        if api_column is None:
            continue
        if api_column.metrics.get("numeric") is not None:
            stats = api_column.metrics.get("numeric") or {}
            views.append(
                _NumericView(
                    name=api_column.name,
                    metrics={
                        "mean": stats.get("mean"),
                        "median": stats.get("median"),
                        "std": stats.get("std"),
                        "min": stats.get("min"),
                        "max": stats.get("max"),
                    },
                )
            )
        else:
            top_values = api_column.metrics.get("top_values") or []
            views.append(
                _CategoricalView(
                    name=api_column.name,
                    top_values=tuple(
                        (str(item["value"]), int(item["count"])) for item in top_values
                    ),
                )
            )
    return views


def _schema_to_dict(diff: SchemaDiff) -> dict[str, Any]:
    return {
        "added": list(diff.added),
        "removed": list(diff.removed),
        "type_changes": [
            {
                "name": item.name,
                "change": item.change,
                "base_physical_type": item.base_physical_type,
                "target_physical_type": item.target_physical_type,
                "base_logical_type": item.base_logical_type,
                "target_logical_type": item.target_logical_type,
            }
            for item in diff.type_changes
        ],
    }


def _distribution_to_dict(drift: DistributionDrift) -> dict[str, Any]:
    return {
        "numeric": [
            {
                "column": item.column,
                "metric": item.metric,
                "base_value": item.base_value,
                "target_value": item.target_value,
                "absolute_change": item.absolute_change,
                "relative_change": item.relative_change,
            }
            for item in drift.numeric
        ],
        "categorical": [
            {
                "column": item.column,
                "metric": item.metric,
                "psi": item.psi,
                "base_top_values": [
                    {"value": value, "count": count} for value, count in item.base_top_values
                ],
                "target_top_values": [
                    {"value": value, "count": count} for value, count in item.target_top_values
                ],
            }
            for item in drift.categorical
        ],
    }


def _score_to_dict(score: ScoreDrift) -> dict[str, Any]:
    return {
        "base_score": score.base_score,
        "target_score": score.target_score,
        "delta": score.delta,
        "absolute_delta": score.absolute_delta,
        "base_grade": score.base_grade,
        "target_grade": score.target_grade,
        "grade_changed": score.grade_changed,
    }


__all__ = [
    "HistoryService",
]
