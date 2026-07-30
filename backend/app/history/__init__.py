"""Deterministic dataset history, drift, and lineage (Task 6).

The history layer reads the immutable Task 2-5 rows for two dataset
versions and produces an explainable, decomposable comparison:

* ``SchemaDiff`` - columns added, removed, or with a changed physical
  type.
* ``DistributionDrift`` - per-column numeric and categorical drift
  signals computed from the persisted JSONB profile metrics.
* ``ScoreDrift`` - the change in the Task 5 0-100 score between two
  scoring runs and whether the letter grade changed.

Comparisons are persisted as immutable ``HistoryComparison`` rows.
Lineage is computed on demand by walking the version chain; no
separate table is required.

No ML, no LLM, no background jobs. The deterministic formula is
documented in ``backend/docs/history.md``; keep that file in sync
with this module.
"""
