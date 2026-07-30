"""Deterministic quality scoring (Task 5).

The scoring layer reads the immutable Task 4 finding rows bound to the
latest profile and produces an explainable, decomposable quality score
with a documented formula. Severity is preserved verbatim from the
detectors; scoring adds a normalized 0-100 overall score, a letter
grade, per-finding detection / data-error confidences, and per-kind,
per-severity, and per-column breakdowns so consumers can understand
why the score is what it is.

No machine learning, no LLM, no recommendations, no transformations.
Re-running scoring over the same finding batch is deterministic and
idempotent at the formula level; each run persists a fresh row.
"""
