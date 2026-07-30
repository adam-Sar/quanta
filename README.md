# Quanta — AI Data Reliability Platform

Quanta is a production-oriented data quality and reliability system. Deterministic data engineering and statistical methods establish **what happened**; a later AI layer will interpret meaning, likely causes, importance, and safe next actions.

## Current implementation

**Tasks 1 (foundation), 2 (dataset ingestion), 3 (dataset profiling), 4 (deterministic detection), and 5 (quality scoring) are complete.**

What is implemented today:

- Modular FastAPI backend with typed Pydantic settings, JSON/console structured logging, request correlation, sanitized error envelope, SQLAlchemy 2.x/PostgreSQL 3.13, Alembic with `0001_foundation`, `0002_dataset_ingestion`, `0003_create_dataset_profiles`, `0004_create_dataset_findings`, and `0005_create_dataset_quality_scores` revisions, health/readiness endpoints, Docker Compose, a non-root API image, repository hygiene, and an isolated Python 3.12 development environment.
- Dataset ingestion: safe local streaming storage with size/SHA-256/chunking, deterministic content validators (CSV UTF-8 header, Parquet `PAR1` magic), and format-aware metadata readers (Polars lazy CSV, PyArrow Parquet). Persists `datasets`, `dataset_versions`, and `dataset_columns` with immutable originals and atomic file promotion. Tests cover positive, negative, empty, oversize, unsupported, rollback, and pagination paths.
- Dataset profiling (Task 3): deterministic Polars-based column metrics over a bounded sample (default 100 000 rows) of the original upload. Per-column JSONB metrics (null counts/rates, distinct counts/rates, numeric min/max/mean/median/std/sum, temporal min/max, string-length min/max/mean, top values, sampling flag). Persisted as immutable `dataset_profiles` and `column_profiles` rows. Exposed via `POST /datasets/{id}/profile`, `GET /datasets/{id}/profile`, `GET /datasets/{id}/versions/{version_id}/profile`, and `GET /datasets/{id}/profiles`.
- Dataset detection (Task 4): five threshold-driven deterministic detectors (missingness, duplicates, invalid values, outliers, cardinality) that produce immutable `findings` rows bound to the latest profile. Exposed via `POST /datasets/{id}/detections` (201) and `GET /datasets/{id}/detections` (200 paginated list).
- Dataset scoring (Task 5): deterministic, explainable quality scoring that aggregates the Task 4 findings into a 0–100 score and an A–F grade, with a JSONB breakdown by kind / severity / column and per-finding `detection_confidence` and `data_error_confidence`. Persisted as immutable `quality_scores` rows. Exposed via `POST /datasets/{id}/scores` (201), `GET /datasets/{id}/score` (200), `GET /datasets/{id}/versions/{version_id}/score` (200), and `GET /datasets/{id}/scores` (200 paginated list). Full formula in `backend/docs/scoring.md`.
- Tests pass (opt-in integration tests skip without `RUN_DATABASE_TESTS=1`); coverage ≥ 85% on the non-omitted code; Ruff, strict mypy, and Alembic are clean.

What is **not** implemented:

- History / drift detection, AI interpretation, recommendation engine, validation engine, distributed jobs/Redis, authentication/authorization, or any frontend.
- `history/`, `analysis/`, `ai/`, `recommendations/`, `validation/` packages remain intentionally unimplemented; they will be added with behavior in later tasks.

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

No frontend is included.

## Repository layout

```text
backend/
  app/        FastAPI service, ingestion, profiling, detection, storage, services
  migrations/ Alembic environment and revisions
  tests/      unit, API, opt-in PostgreSQL integration
  docs/       architecture, backend, api, data-model, detection-engine, ai-layer, frontend-integration, development
docker-compose.yml
.env.example
```

## Development

See [`backend/docs/backend.md`](backend/docs/backend.md) and [`backend/docs/development.md`](backend/docs/development.md) for setup, the agreed task sequence, and the definition of done.