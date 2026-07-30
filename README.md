# Quanta — AI Data Reliability Platform

Quanta is a production-oriented data quality and reliability system. Deterministic data engineering and statistical methods establish **what happened**; a provider-independent AI layer interprets meaning, likely causes, importance, and safe next actions. Recommendations, validation, and durable analysis jobs land in later tasks.

## Current implementation

**Tasks 1 (foundation), 2 (dataset ingestion), 3 (dataset profiling), 4 (deterministic detection), 5 (quality scoring), 6 (history), and 7 (AI reasoning) are complete.**

What is implemented today:

- Modular FastAPI backend with typed Pydantic settings, JSON/console structured logging, request correlation, sanitized error envelope, SQLAlchemy 2.x/PostgreSQL 3.13, Alembic with `0001_foundation`, `0002_dataset_ingestion`, `0003_create_dataset_profiles`, `0004_create_dataset_findings`, `0005_create_dataset_quality_scores`, `0006_create_history_comparisons`, and `0007_create_ai_interpretations` revisions, health/readiness endpoints, Docker Compose, a non-root API image, repository hygiene, and an isolated Python 3.12 development environment.
- Dataset ingestion: safe local streaming storage with size/SHA-256/chunking, deterministic content validators (CSV UTF-8 header, Parquet `PAR1` magic), and format-aware metadata readers (Polars lazy CSV, PyArrow Parquet). Persists `datasets`, `dataset_versions`, and `dataset_columns` with immutable originals and atomic file promotion. Tests cover positive, negative, empty, oversize, unsupported, rollback, and pagination paths.
- Dataset profiling (Task 3): deterministic Polars-based column metrics over a bounded sample (default 100 000 rows) of the original upload. Per-column JSONB metrics (null counts/rates, distinct counts/rates, numeric min/max/mean/median/std/sum, temporal min/max, string-length min/max/mean, top values, sampling flag). Persisted as immutable `dataset_profiles` and `column_profiles` rows. Exposed via `POST /datasets/{id}/profile`, `GET /datasets/{id}/profile`, `GET /datasets/{id}/versions/{version_id}/profile`, and `GET /datasets/{id}/profiles`.
- Dataset detection (Task 4): five threshold-driven deterministic detectors (missingness, duplicates, invalid values, outliers, cardinality) that produce immutable `findings` rows bound to the latest profile. Exposed via `POST /datasets/{id}/detections` (201) and `GET /datasets/{id}/detections` (200 paginated list).
- Dataset scoring (Task 5): deterministic, explainable quality scoring that aggregates the Task 4 findings into a 0–100 score and an A–F grade, with a JSONB breakdown by kind / severity / column and per-finding `detection_confidence` and `data_error_confidence`. Persisted as immutable `quality_scores` rows. Exposed via `POST /datasets/{id}/scores` (201), `GET /datasets/{id}/score` (200), `GET /datasets/{id}/versions/{version_id}/score` (200), and `GET /datasets/{id}/scores` (200 paginated list). Full formula in `backend/docs/scoring.md`.
- Dataset history (Task 6): deterministic history comparisons and lineage between dataset versions. Reads the immutable Task 2-5 rows for two versions, computes a decomposable `DatasetComparison` (schema diff + numeric/categorical drift + score drift), and persists an immutable `history_comparisons` row. Lineage is computed on demand by walking the version chain. Exposed via `POST /datasets/{id}/comparisons` (201), `GET /datasets/{id}/comparisons/{comparison_id}` (200), `GET /datasets/{id}/comparisons` (200 paginated list), and `GET /datasets/{id}/lineage` (200). Full formula in `backend/docs/history.md`.
- AI reasoning (Task 7): provider-independent reasoning layer that consumes the Task 4 findings bound to the latest profile, builds a bounded prompt, calls the configured `LLMProvider` (default offline `NoopProvider`), validates the structured `InterpretationResponseSchema` response, and persists a fresh immutable `ai_interpretations` row. Exposed via `POST /datasets/{id}/interpretations` (201), `GET /datasets/{id}/interpretations/{interpretation_id}` (200), and `GET /datasets/{id}/interpretations` (200 paginated list). Full protocol in `backend/docs/ai-layer.md`.
- Tests pass (opt-in integration tests skip without `RUN_DATABASE_TESTS=1`); coverage ≥ 85% on the non-omitted code; Ruff, strict mypy, and Alembic are clean.

What is **not** implemented:

- Recommendations, validation, frontend work, and durable analysis jobs.
- `recommendations/`, `validation/`, `analysis/` packages remain intentionally unimplemented; they will be added with behavior in later tasks.

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

No frontend is included.

## Repository layout

```text
backend/
  app/        FastAPI service, ingestion, profiling, detection, scoring, history, ai, storage, services
  migrations/ Alembic environment and revisions
  tests/      unit, API, opt-in PostgreSQL integration
  docs/       architecture, backend, api, data-model, detection-engine, ai-layer, frontend-integration, development, scoring, history
docker-compose.yml
.env.example
```

## Development

See [`backend/docs/backend.md`](backend/docs/backend.md) and [`backend/docs/development.md`](backend/docs/development.md) for setup, the agreed task sequence, and the definition of done.
