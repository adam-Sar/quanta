# Quanta — AI Data Reliability Platform

Quanta is a production-oriented data quality and reliability system. Deterministic data engineering and statistical methods establish **what happened**; a later AI layer will interpret meaning, likely causes, importance, and safe next actions.

## Current implementation

**Task 1 (foundation), Task 2 (dataset ingestion), and Task 3 (dataset profiling) are complete.**

What is implemented today:

- Modular FastAPI backend with typed Pydantic settings, JSON/console structured logging, request correlation, sanitized error envelope, SQLAlchemy 2.x/PostgreSQL 3.13, Alembic with `0001_foundation`, `0002_dataset_ingestion`, and `0003_create_dataset_profiles` revisions, health/readiness endpoints, Docker Compose, a non-root API image, repository hygiene, and an isolated Python 3.12 development environment.
- Dataset ingestion: safe local streaming storage with size/SHA-256/chunking, deterministic content validators (CSV UTF-8 header, Parquet `PAR1` magic), and format-aware metadata readers (Polars lazy CSV, PyArrow Parquet). Persists `datasets`, `dataset_versions`, and `dataset_columns` with immutable originals and atomic file promotion. Tests cover positive, negative, empty, oversize, unsupported, rollback, and pagination paths.
- Dataset profiling (Task 3): deterministic Polars-based column metrics over a bounded sample (default 100 000 rows) of the original upload. Per-column JSONB metrics (null counts/rates, distinct counts/rates, numeric min/max/mean/median/std/sum, temporal min/max, string-length min/max/mean, top values, sampling flag). Persisted as immutable `dataset_profiles` and `column_profiles` rows. Exposed via `POST /datasets/{id}/profile`, `GET /datasets/{id}/profile`, `GET /datasets/{id}/versions/{version_id}/profile`, and `GET /datasets/{id}/profiles`.
- Tests pass (1 opt-in integration test skips without `RUN_DATABASE_TESTS=1`); coverage ≥ 85% on the non-omitted code; Ruff, strict mypy, and Alembic are clean.

What is **not** implemented:

- Quality detectors, scoring, drift detection, recommendation engine, AI layer, validation engine, distributed jobs/Redis, authentication/authorization, or any frontend.
- `quality/`, `analysis/`, `ai/`, `recommendations/`, `validation/` packages remain intentionally unimplemented; they will be added with behavior in later tasks.

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

No frontend is included.

## Repository layout

```text
backend/
  app/        FastAPI service, ingestion, profiling, storage, services
  migrations/ Alembic environment and revisions
  tests/      unit, API, opt-in PostgreSQL integration
  docs/       architecture, backend, api, data-model, detection-engine, ai-layer, frontend-integration, development
docker-compose.yml
.env.example
```

## Development

See [`backend/docs/backend.md`](backend/docs/backend.md) and [`backend/docs/development.md`](backend/docs/development.md) for setup, the agreed task sequence, and the definition of done.