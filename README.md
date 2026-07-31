# Quanta — AI Data Reliability Platform

Quanta is a production-oriented data quality and reliability system. Deterministic data engineering and statistical methods establish **what happened**; a provider-independent AI layer interprets meaning, likely causes, importance, and safe next actions. Recommendations, validation previews, and durable analysis jobs are first-class resources; the durable apply step and worker hardening land in later tasks.

## Current implementation

**Tasks 1 (foundation), 2 (dataset ingestion), 3 (dataset profiling), 4 (deterministic detection), 5 (quality scoring), 6 (history), 7 (AI reasoning), 8 (recommendations), 9 (validation), and 10 (durable analysis jobs) are complete.**

What is implemented today:

- Modular FastAPI backend with typed Pydantic settings, JSON/console structured logging, request correlation, sanitized error envelope, SQLAlchemy 2.x/PostgreSQL 3.13, Alembic with `0001_foundation`, `0002_dataset_ingestion`, `0003_create_dataset_profiles`, `0004_create_dataset_findings`, `0005_create_dataset_quality_scores`, `0006_create_history_comparisons`, `0007_create_ai_interpretations`, `0008_create_recommendations`, `0009_create_validations`, and `0010_create_jobs` revisions, health/readiness endpoints, Docker Compose, a non-root API image, repository hygiene, and an isolated Python 3.12 development environment.
- Dataset ingestion: safe local streaming storage with size/SHA-256/chunking, deterministic content validators (CSV UTF-8 header, Parquet `PAR1` magic), and format-aware metadata readers (Polars lazy CSV, PyArrow Parquet). Persists `datasets`, `dataset_versions`, and `dataset_columns` with immutable originals and atomic file promotion. Tests cover positive, negative, empty, oversize, unsupported, rollback, and pagination paths.
- Dataset profiling (Task 3): deterministic Polars-based column metrics over a bounded sample (default 100 000 rows) of the original upload. Per-column JSONB metrics (null counts/rates, distinct counts/rates, numeric min/max/mean/median/std/sum, temporal min/max, string-length min/max/mean, top values, sampling flag). Persisted as immutable `dataset_profiles` and `column_profiles` rows. Exposed via `POST /datasets/{id}/profile`, `GET /datasets/{id}/profile`, `GET /datasets/{id}/versions/{version_id}/profile`, and `GET /datasets/{id}/profiles`.
- Dataset detection (Task 4): five threshold-driven deterministic detectors (missingness, duplicates, invalid values, outliers, cardinality) that produce immutable `findings` rows bound to the latest profile. Exposed via `POST /datasets/{id}/detections` (201) and `GET /datasets/{id}/detections` (200 paginated list).
- Dataset scoring (Task 5): deterministic, explainable quality scoring that aggregates the Task 4 findings into a 0–100 score and an A–F grade, with a JSONB breakdown by kind / severity / column and per-finding `detection_confidence` and `data_error_confidence`. Persisted as immutable `quality_scores` rows. Exposed via `POST /datasets/{id}/scores` (201), `GET /datasets/{id}/score` (200), `GET /datasets/{id}/versions/{version_id}/score` (200), and `GET /datasets/{id}/scores` (200 paginated list). Full formula in `backend/docs/scoring.md`.
- Dataset history (Task 6): deterministic history comparisons and lineage between dataset versions. Reads the immutable Task 2-5 rows for two versions, computes a decomposable `DatasetComparison` (schema diff + numeric/categorical drift + score drift), and persists an immutable `history_comparisons` row. Lineage is computed on demand by walking the version chain. Exposed via `POST /datasets/{id}/comparisons` (201), `GET /datasets/{id}/comparisons/{comparison_id}` (200), `GET /datasets/{id}/comparisons` (200 paginated list), and `GET /datasets/{id}/lineage` (200). Full formula in `backend/docs/history.md`.
- AI reasoning (Task 7): provider-independent reasoning layer that consumes the Task 4 findings bound to the latest profile, builds a bounded prompt, calls the configured `LLMProvider` (default offline `NoopProvider`), validates the structured `InterpretationResponseSchema` response, and persists a fresh immutable `ai_interpretations` row. Exposed via `POST /datasets/{id}/interpretations` (201), `GET /datasets/{id}/interpretations/{interpretation_id}` (200), and `GET /datasets/{id}/interpretations` (200 paginated list). Full protocol in `backend/docs/ai-layer.md`.
- Recommendations (Task 8): deterministic rule engine that consumes the same Task 4 findings (optionally with the latest Task 5 score and Task 7 AI interpretation id) and produces structured, **preview-only** recommendations. Every recommendation is a constrained operation (`impute_missing`, `drop_column`, `drop_duplicates`, `cap_outliers`, `cast_type`, `group_rare_categorical`, `review`) with severity, confidence, priority, and supporting finding ids. The apply step is intentionally **out of scope** for Task 8 and lands in Task 9. Persisted as immutable `recommendations` rows. Exposed via `POST /datasets/{id}/recommendations` (201), `GET /datasets/{id}/recommendations/{recommendation_id}` (200), and `GET /datasets/{id}/recommendations` (200 paginated list). Full rule engine in `backend/docs/recommendations.md`.
- Validation (Task 9): deterministic recommendation preview engine that consumes a Task 8 recommendation, reads the source file via `FileStorage.path_for`, runs a bounded Polars/PyArrow preview, and persists a fresh immutable `validations` row with a structured `impact` payload. The apply step (which would create a new immutable dataset version) remains out of scope and lands in a later task. Exposed via `POST /datasets/{id}/recommendations/{recommendation_id}/validate` (201), `GET .../validations` (200 paginated list), and `GET .../validations/{validation_id}` (200). Full preview engine in `backend/docs/validation.md`.
- Durable analysis jobs (Task 10): durable, queryable, auditable wrapper around the Task 2-9 analysis operations. Each `Job` row records the requested `kind` (`profile`, `detect`, `score`, `history`, `recommendations`, `validations`), the persisted `parameters`, the lifecycle status (`pending` → `running` → `succeeded` / `failed`), and the structured `result` / `error` JSONB payload. Execution is **synchronous** in Task 10; worker infrastructure lands in Task 11. Exposed via `POST /datasets/{id}/jobs` (201), `GET /datasets/{id}/jobs` (200 paginated list), and `GET /datasets/jobs/{job_id}` (200). Full dispatcher in `backend/docs/jobs.md`.
- Tests pass (opt-in integration tests skip without `RUN_DATABASE_TESTS=1`); coverage ≥ 85% on the non-omitted code; Ruff, strict mypy, and Alembic are clean.

What is **not** implemented:

- Recommendation **apply** step (which would create a new immutable dataset version), frontend work, and worker infrastructure.
- The `jobs/` package is implemented in Task 10 (synchronous dispatcher). The Task 11 hardening task may swap the inline runner for a real worker (Celery, RQ, external queue, etc.) without changing the persisted `Job` shape.

## Quick start

```bash
cp .env.example .env
docker compose up --build
```

Then open:

- API docs: <http://localhost:8000/docs>
- Liveness: <http://localhost:8000/health>
- Readiness: <http://localhost:8000/health/ready>
- Dataset ingestion: `POST /datasets` (multipart with `file`, `name`, optional `description`)
- Dataset list/detail/versions: `GET /datasets`, `GET /datasets/{id}`, `GET /datasets/{id}/versions`
- Profile the latest version: `POST /datasets/{id}/profile`
- Get the latest profile: `GET /datasets/{id}/profile`
- Get the profile for a specific version: `GET /datasets/{id}/versions/{version_id}/profile`
- List profile runs: `GET /datasets/{id}/profiles`
- Run detection on the latest profile: `POST /datasets/{id}/detections`
- List detection findings: `GET /datasets/{id}/detections`
- Score the latest detection batch: `POST /datasets/{id}/scores`
- Get the latest score: `GET /datasets/{id}/score`
- Get the score for a specific version: `GET /datasets/{id}/versions/{version_id}/score`
- List score runs: `GET /datasets/{id}/scores`
- Compare two dataset versions: `POST /datasets/{id}/comparisons`
- Get a specific history comparison: `GET /datasets/{id}/comparisons/{comparison_id}`
- List history comparison runs: `GET /datasets/{id}/comparisons`
- Get the deterministic lineage of a dataset: `GET /datasets/{id}/lineage`
- Run an AI interpretation on the latest detection batch: `POST /datasets/{id}/interpretations`
- Get a specific AI interpretation: `GET /datasets/{id}/interpretations/{interpretation_id}`
- List AI interpretation runs: `GET /datasets/{id}/interpretations`
- Run the deterministic recommendation rule engine on the latest detection batch: `POST /datasets/{id}/recommendations`
- Get a specific recommendation: `GET /datasets/{id}/recommendations/{recommendation_id}`
- List recommendation rows: `GET /datasets/{id}/recommendations`
- Run a deterministic validation preview against the source file: `POST /datasets/{id}/recommendations/{recommendation_id}/validate`
- List validation rows for a recommendation: `GET /datasets/{id}/recommendations/{recommendation_id}/validations`
- Get a specific validation row: `GET /datasets/{id}/recommendations/{recommendation_id}/validations/{validation_id}`
- Create and run a durable analysis job (profile / detect / score / history / recommendations / validations): `POST /datasets/{id}/jobs`
- List durable analysis jobs for a dataset: `GET /datasets/{id}/jobs`
- Get a specific durable analysis job: `GET /datasets/jobs/{job_id}`

No frontend is included.

## Repository layout

```text
backend/
  app/        FastAPI service, ingestion, profiling, detection, scoring, history, ai, recommendations, validation, jobs, storage, services
  migrations/ Alembic environment and revisions
  tests/      unit, API, opt-in PostgreSQL integration
  docs/       architecture, backend, api, data-model, detection-engine, ai-layer, recommendations, validation, jobs, frontend-integration, development, scoring, history
docker-compose.yml
.env.example
```

## Development

See [`backend/docs/backend.md`](backend/docs/backend.md) and [`backend/docs/development.md`](backend/docs/development.md) for setup, the agreed task sequence, and the definition of done.
