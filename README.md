# Quanta — AI Data Reliability Platform

Quanta is a production-oriented data quality and reliability system. Deterministic data engineering and statistical methods establish **what happened**; a later AI layer will interpret meaning, likely causes, importance, and safe next actions.

## Current implementation

**Task 1 (foundation) and Task 2 (dataset ingestion) are complete.**

What is implemented today:

- Modular FastAPI backend with typed Pydantic settings, JSON/console structured logging, request correlation, sanitized error envelope, SQLAlchemy 2.x/PostgreSQL 3.13, Alembic with a `0001_foundation` and a `0002_dataset_ingestion` revision, health/readiness endpoints, Docker Compose, a non-root API image, repository hygiene, and an isolated Python 3.12 development environment.
- Dataset ingestion: safe local streaming storage with size/SHA-256/chunking, deterministic content validators (CSV UTF-8 header, Parquet `PAR1` magic), and format-aware metadata readers (Polars lazy CSV, PyArrow Parquet). Persists `datasets`, `dataset_versions`, and `dataset_columns` with immutable originals and atomic file promotion. Tests cover positive, negative, empty, oversize, unsupported, rollback, and pagination paths.
- 66 tests pass (2 integration tests skip without `RUN_DATABASE_TESTS=1`); coverage ≥ 85% on the non-omitted code; Ruff, strict mypy, and Alembic are clean.

What is **not** implemented:

- Profiling engine, quality detectors, scoring, drift detection, recommendation engine, AI layer, validation engine, distributed jobs/Redis, authentication/authorization, or any frontend.
- `quality/`, `profiling/`, `analysis/`, `ai/`, `recommendations/`, `validation/` packages remain intentionally unimplemented; they will be added with behavior in later tasks.

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

No frontend is included.

## Repository layout

```text
backend/
  app/        FastAPI service, ingestion, storage, services
  migrations/ Alembic environment and revisions
  tests/      unit, API, opt-in PostgreSQL integration
  docs/       architecture, backend, api, data-model, detection-engine, ai-layer, frontend-integration, development
docker-compose.yml
.env.example
```

## Development

See [`backend/docs/backend.md`](backend/docs/backend.md) and [`backend/docs/development.md`](backend/docs/development.md) for setup, the agreed task sequence, and the definition of done.
