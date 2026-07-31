"""Validation domain types (Task 9).

Frozen dataclasses describe the structured validation result that the
``ValidationService`` produces from a Task 8 recommendation. The
service never mutates the source dataset; the ``impact`` field is a
projected summary, not an applied effect.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import UUID

# Documented schema version. Bump when the validation payload
# shape or the preview engine changes in a non-backward-compatible way.
VALIDATION_FORMULA_VERSION: str = "task9-1.0"


class ValidationStatus(StrEnum):
    """Documented outcome of a validation preview."""

    VALID = "valid"
    WARNING = "warning"
    INVALID = "invalid"


@dataclass(frozen=True, slots=True)
class ValidationImpact:
    """Projected impact of the recommendation's constrained operation.

    Every field is optional; only the fields that the operation kind
    actually projects are populated. ``affected_rows`` is the
    estimated count of rows that would be changed (or removed) by the
    operation. ``affected_columns`` is the list of column names that
    would be modified. ``unexpected_side_effects`` is the deterministic
    list of risks the preview discovered (for example, "drops the
    only integer column" or "reduces row count to zero").
    """

    affected_rows: int | None = None
    affected_columns: tuple[str, ...] = field(default_factory=tuple)
    summary: str = ""
    unexpected_side_effects: tuple[str, ...] = field(default_factory=tuple)


@dataclass(frozen=True, slots=True)
class Validation:
    """A single validation preview result for one recommendation.

    The fields are deliberately self-contained so consumers can
    render them without re-reading the source rows. The ``status`` is
    deterministic and bounded to the documented ``ValidationStatus``
    enum; ``impact`` is a structured summary; ``components`` carries
    the source pointers (recommendation id, finding ids, latest score
    id, latest interpretation id, dataset version id) so the
    validation can be audited.
    """

    validation_id: UUID
    dataset_id: UUID
    dataset_version_id: UUID
    profile_id: UUID
    recommendation_id: UUID
    operation_kind: str
    status: ValidationStatus
    title: str
    rationale: str
    impact: ValidationImpact
    components: dict[str, Any] = field(default_factory=dict)
    formula_version: str = VALIDATION_FORMULA_VERSION
    created_at: datetime = field(
        default_factory=lambda: datetime.now(__import__("datetime").timezone.utc)
    )


@dataclass(frozen=True, slots=True)
class PersistedValidation:
    """Domain shape of a ``validations`` row loaded from PostgreSQL."""

    validation_id: UUID
    dataset_id: UUID
    dataset_version_id: UUID
    profile_id: UUID
    recommendation_id: UUID
    operation_kind: str
    status: str
    title: str
    rationale: str
    impact: dict[str, Any]
    components: dict[str, Any]
    formula_version: str
    created_at: datetime


__all__ = [
    "VALIDATION_FORMULA_VERSION",
    "PersistedValidation",
    "Validation",
    "ValidationImpact",
    "ValidationStatus",
]