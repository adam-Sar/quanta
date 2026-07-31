# Worker pattern (Task 11)

## Status

Task 11 does **not** introduce a real background worker. The
dependency policy forbids adding Celery, RQ, Redis client, or any
external queue, so the synchronous ``JobService.run`` is preserved.
This document captures the design pattern a future task would
implement to swap the inline runner for a real worker **without
changing the persisted ``Job`` shape** (the ``jobs`` table is already
worker-agnostic — every ``Job`` row carries ``status``, ``result``,
``error``, and three timestamp columns).

## Why deferred?

* The dependency policy has been a hard constraint since Task 1.
* The synchronous ``JobService.run`` is adequate for the local
  development and small-team deployment shapes documented in
  ``backend.md``.
* The ``jobs`` table is intentionally status-oriented; a future
  task can switch the executor from inline to enqueue+worker
  without a migration.

## Design

A real worker for Task 11+ would be a separate process that:

1. **Polls the jobs table** for rows where ``status = 'pending'``
   and ``created_at`` is older than the visibility timeout (for
   safety against crashes). Uses ``SELECT ... FOR UPDATE SKIP
   LOCKED`` to avoid double-pulling.

2. **Claims the row** by setting ``status = 'running'`` and
   ``started_at = now()`` in a single transaction, with
   ``WHERE id = :id AND status = 'pending'`` to keep the claim
   atomic.

3. **Runs the same ``run_job(kind, ...) -> JobOutcome``
   dispatcher** the inline service uses. The dispatcher is already
   function-pure (it takes a ``JobRequest`` plus the service
   collaborators and returns a ``JobOutcome``) so a worker just
   builds the ``JobRequest`` from the persisted row and calls
   ``run_job``.

4. **Persists the outcome** by updating the same row to
   ``status = 'succeeded' | 'failed'`` with the structured
   ``result`` / ``error`` JSONB and ``completed_at`` timestamp.
   This is the exact update ``JobService.run`` performs after the
   inline execution today.

5. **Observes the rate limiter and request-budget caps** so the
   worker can't run away. The same ``app.core.middleware._get_limiter``
   primitive and ``app.core.config.Settings.request_budget_ms``
   are exposed in the process. The worker reads (but does not
   increment) the limiter and respects the budget per call.

The HTTP API surface (``POST /datasets/{id}/jobs``) would gain an
optional ``?async=true`` query parameter: when set, the endpoint
inserts a ``pending`` row and returns ``202 Accepted`` with the job
id instead of running inline. The endpoint contract otherwise does
not change; ``GET /datasets/jobs/{id}`` and ``GET /datasets/{id}/jobs``
continue to return the persisted state.

## Migration

The first time the worker is enabled, the dispatcher is
extracted from ``JobService.run`` into a standalone function
(``run_job`` already exists, so this is just removing the inline
service). The inline path becomes ``asyncio.to_thread(run_job, ...)``
so the API request returns immediately while the worker-like
behaviour is achieved inside a single process. The persisted
``Job`` shape is unchanged; only the orchestration changes.

## Operator surface

The existing operator-facing endpoints already cover the worker
path:

* ``GET /datasets/{id}/jobs`` lists recent job rows so an
  operator can see whether a worker (or inline service) is making
  progress.
* ``GET /datasets/jobs/{id}`` returns the current ``status`` and
  ``result`` / ``error`` payload.
* ``GET /metrics`` (Task 11) and the existing structured logs
  surface worker throughput and request-budget hits.

When the worker is introduced, a new ``/admin/workers`` route can
expose worker pool size, in-flight claim count, and last error —
these are out of scope until Task 11+ adds the worker.
