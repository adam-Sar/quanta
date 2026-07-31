# Durable analysis jobs (Task 10)

## Status

Task 10 is **implemented** as a **synchronous**, durable,
queryable wrapper around the existing Task 2-9 analysis operations.
Each ``Job`` row records one structured run: the requested
operation (``kind``), the persisted parameters, the lifecycle
status (``pending`` → ``running`` → ``succeeded`` / ``failed``),
the structured result, and any error. Job execution is **synchronous
in Task 10** — the request handler runs the wrapped pipeline inline
and persists the outcome before returning. The Task 11 hardening
task may introduce a real worker (Celery, RQ, an external queue,
etc.) without changing the persisted resource shape.

The jobs layer never mutates the original file, profile, finding,
score, history, recommendation, or validation rows. Every wrapped
service method already owns its own single-transaction persistence;
the jobs layer only records the outcome of the run.

## Job lifecycle

| Status | Meaning |
|---|---|
| ``pending`` | The ``Job`` row has been inserted but execution has not started. |
| ``running`` | The wrapped service method has been invoked. ``started_at`` is set. |
| ``succeeded`` | The wrapped service method completed; ``result`` carries the structured outcome and ``completed_at`` is set. |
| ``failed`` | The wrapped service method raised a recoverable error; ``error`` carries the sanitized envelope and ``completed_at`` is set. |

Re-running a job (Task 11 may add an explicit rerun endpoint) will
create a fresh ``Job`` row; existing rows are never mutated.

## Inputs

Each ``POST /datasets/{dataset_id}/jobs`` body carries:

```json
{
  "kind": "profile",
  "profile_id": null,
  "title": "optional human-readable title",
  "parameters": {}
}
```

The supported ``kind`` values and their ``parameters`` are:

| ``kind`` | Required parameters | Wrapped service |
|---|---|---|
| ``profile`` | none | ``ProfilingService.profile_latest_version`` |
| ``detect`` | none | ``DetectionService.detect_latest`` |
| ``score`` | none | ``ScoringService.score_latest`` |
| ``history`` | ``base_version_id``, ``target_version_id`` (UUID strings) | ``HistoryService.compare_versions`` |
| ``recommendations`` | none | ``RecommendationService.recommend`` |
| ``validations`` | ``recommendation_id`` (UUID string) | ``ValidationService.validate_recommendation`` |

## Persistence

Each run produces a fresh immutable ``Job`` row carrying:

* ``dataset_id`` (FK to ``datasets.id`` ON DELETE CASCADE)
* ``profile_id`` (FK to ``dataset_profiles.id`` ON DELETE SET NULL,
  nullable)
* ``kind`` (bounded string)
* ``status`` (bounded string)
* ``title`` (human-readable summary)
* ``parameters`` JSONB (raw inputs as posted)
* ``result`` JSONB (structured outcome: ``profile_id`` for profile,
  ``finding_count`` / ``finding_ids`` for detect, ``score_id`` /
  ``score`` / ``grade`` for score, ``comparison_id`` /
  ``has_drift`` for history, ``count`` / ``recommendation_ids``
  for recommendations, ``validation_id`` /
  ``recommendation_id`` / ``operation_kind`` for validations)
* ``error`` JSONB (sanitized envelope: ``code``, ``message``,
  ``details``; populated on failure only)
* ``formula_version`` (``task10-1.0``)
* ``created_at`` / ``started_at`` / ``completed_at`` timestamps

The new ``0010_create_jobs`` migration adds the ``jobs`` table
with FKs to ``datasets`` and ``dataset_profiles`` plus four indexes
(dataset/created, profile, status, kind).

## Safety path

```text
POST /datasets/{dataset_id}/jobs
  -> JobService.run
       -> JobRepository.add (status=pending, commit, refresh)
       -> set status=running, started_at=now(), commit, refresh
       -> run_job(kind, ...)  # dispatches to Task 2-9 service
            -> ApplicationError -> status=failed, error={...}
            -> DatasetNotFoundError -> status=failed, error={...}
            -> success -> status=succeeded, result={...}
       -> set status, result/error, completed_at=now(), commit, refresh
       -> return Job row
```

A database failure rolls back the insert only; a service-level
exception is captured as a structured ``failed`` outcome so the
caller can still poll ``GET /datasets/jobs/{job_id}`` for the
final state.

## Limitations

* Job execution is **synchronous**. A long-running pipeline
  (large detection batch, full comparison, etc.) blocks the
  request until completion. Task 11 may introduce a real worker.
* The runner catches ``ApplicationError`` and ``DatasetNotFoundError``;
  unexpected exceptions propagate and roll back the row insert.
  This is intentional: a job row should not exist in
  ``succeeded`` or ``failed`` state when the underlying service
  raised an unexpected error.
* The jobs layer never re-profiles, re-scores, re-derives history,
  re-runs the recommendation rule engine, or re-runs a validation
  preview; it always delegates to the existing Task 2-9 service
  methods.
* There is no cancel, retry, or requeue endpoint yet. Re-running a
  job creates a fresh row with the same ``kind`` and parameters.

## Why a separate ``Job`` row?

The existing Task 2-9 endpoints already return their persisted rows
directly. The jobs layer does not replace them. It exists so that:

1. A consumer can submit an analysis run and immediately receive
   a stable job id even if the wrapped service takes seconds or
   minutes to return.
2. A consumer can poll one endpoint to learn the final status and
   result of the run without re-running the service method.
3. Operators can audit which analysis runs were issued, by whom,
   and against which dataset version — independently of whether
   the run succeeded.

When Task 11 introduces a real worker, the same ``Job`` row shape
is preserved; only the implementation of ``JobService.run`` changes
from synchronous to enqueue + worker pickup.
