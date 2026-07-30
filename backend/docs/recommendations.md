# Recommendations engine (Task 8)

## Status

Task 8 is **implemented**. The recommendations engine consumes the
immutable Task 4 finding rows bound to the latest profile and produces
a small set of structured, **preview-only** recommendations. The
mapping is a deterministic rule engine; the engine never re-profiles
data, never executes code on the dataset, and never calls an LLM.
Recommendations are persisted as immutable ``recommendations`` rows
bound to a profile and are exposed via ``POST/GET
/datasets/{id}/recommendations``.

The Task 8 **apply** step is intentionally **out of scope** — every
recommendation carries ``preview_only=True`` and lands in Task 9
(validation) which will add a deterministic preview and side-effect
check before any change creates a new immutable dataset version.

## Inputs

The service reads the following persisted artifacts for a dataset:

* ``DatasetProfile`` rows for the latest profile (Task 3).
* ``Finding`` rows for that profile (Task 4).
* ``QualityScore`` row for the same version (Task 5) — used only to
  enrich the JSONB ``components`` breakdown.
* ``AIInterpretation`` row for the same profile (Task 7) — used only
  to enrich the JSONB ``components`` breakdown with the interpretation
  id; the engine does **not** consume the interpretation output.

The rule engine is intentionally **stateless**. It maps each persisted
finding to exactly one structured recommendation; no extra artifacts
are required.

## Rule engine

The mapping is a deterministic per-finding rule. The taxonomy mirrors
the Task 4 finding kinds plus a small handful of advisory categories.

| Task 4 finding kind | Task 8 recommendation kind | Operation (preview-only) | Severity bucket |
|---|---|---|---|
| ``missingness`` (severity ``critical`` / ``high`` or value ``>= 0.80``) | ``missingness_treatment`` | ``drop_column`` | ``critical`` / ``high`` |
| ``missingness`` (severity ``medium``) | ``missingness_treatment`` | ``impute_missing`` (strategy ``mean`` for numeric, ``mode`` otherwise) | ``medium`` |
| ``missingness`` (severity ``low`` / ``info``) | ``missingness_treatment`` | ``review`` | ``low`` / ``info`` |
| ``duplicates`` | ``duplicate_removal`` | ``drop_duplicates`` | mirrors finding severity |
| ``invalid_values`` | ``data_quality_fix`` | ``cast_type`` | mirrors finding severity |
| ``outlier`` (severity ``critical`` / ``high``) | ``outlier_treatment`` | ``cap_outliers`` (at finding threshold) | ``critical`` / ``high`` |
| ``outlier`` (severity ``medium`` or lower) | ``outlier_treatment`` | ``review`` | ``medium`` or lower |
| ``cardinality`` | ``cardinality_reduction`` | ``group_rare_categorical`` | mirrors finding severity |

## Severity weights and priority

Severity weights mirror the Task 5 scoring weights so the priority
signal is consistent with the existing 0–100 score:

| Severity | Weight |
|---|---|
| ``critical`` | 100 |
| ``high`` | 75 |
| ``medium`` | 45 |
| ``low`` | 20 |
| ``info`` | 5 |

``priority = round(severity_weight * confidence)`` where
``confidence = clamp(detection_confidence * data_error_confidence, 0, 1)``
uses the documented Task 5 helpers. Recommendations whose priority
exceeds ``recommendation_max_per_run`` are trimmed in descending
priority order; the default cap is 50 rows.

## Persistence

Each rule produces a fresh immutable ``Recommendation`` row carrying:

* ``kind``, ``severity``, ``title``, ``rationale``
* ``affected_columns``, ``supporting_finding_ids``
* ``confidence``, ``priority``
* ``operation_kind``, ``operation_params``, ``preview_only`` (always
  ``True`` in Task 8)
* ``formula_version`` (``task8-1.0``)
* ``components`` JSONB with the by-kind / by-severity counts plus
  the latest score and AI interpretation id (if any) and a list of
  the source finding summaries

The new ``0008_create_recommendations`` migration adds the table
with FKs to ``datasets`` and ``dataset_profiles`` (both
``ON DELETE CASCADE``) plus four indexes (dataset/created, profile,
kind/severity, formula version).

## Safety path

```text
RecommendationService.recommend
  -> load latest profile and its findings
  -> load latest score (Task 5) and AI interpretation id (Task 7)
  -> compute_recommendation_run (pure rule engine)
  -> for every recommendation:
       insert immutable Recommendation row (single transaction)
  -> database failure rolls back the inserts only
```

The rule engine never reads raw dataset rows; it never executes SQL,
Python, or shell; and it never calls an LLM. Recommendations are
``preview_only=True`` so the apply step requires Task 9 validation
before any change can create a new immutable dataset version.

## Limitations

* The rule engine is intentionally simple and explainable. A later
  task may extend it with evidence-backed thresholds per column type
  or per industry vertical, but the current ``task8-1.0`` formula
  must remain deterministic.
* The default ``recommendation_max_per_run`` cap is 50 rows; rows
  above the cap are trimmed by descending priority. Consumers that
  need the full set can paginate the ``GET /datasets/{id}/recommendations``
  list, which always returns the underlying rows without trimming.
* No apply endpoint exists yet. Every recommendation carries
  ``preview_only=True`` and is **advisory**; the actual transformation
  requires explicit approval and lands in Task 9 (validation).
* The recommendations service does not consume the Task 7 AI
  interpretation text. It only records the latest interpretation id
  in the JSONB ``components`` payload so consumers can correlate a
  recommendation with the human-readable rationale.