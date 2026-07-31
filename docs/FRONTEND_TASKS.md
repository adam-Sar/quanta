# Quanta Frontend Tasks

## Status

- **Current task:** TASK 2 — Dataset Explorer
- **Overall progress:** 1 / 11
- **Last updated:** 2026-07-31
- **Status:** TASK 1 complete; waiting for approval to start the next task

## Tasks

- [x] TASK 1 — Foundation
- [ ] TASK 2 — Dataset Explorer
- [ ] TASK 3 — Dataset Overview
- [ ] TASK 4 — Profiling
- [ ] TASK 5 — Findings
- [ ] TASK 6 — Historical Analysis
- [ ] TASK 7 — AI Analysis
- [ ] TASK 8 — Recommendations
- [ ] TASK 9 — Validation
- [ ] TASK 10 — Jobs
- [ ] TASK 11 — Polish

## Task 1 Scope

### Goal

Create the frontend foundation only: React + TypeScript + Vite, Tailwind CSS, React Router, TanStack Query, centralized API transport, typed health connectivity, global design tokens, reusable base states, and the application shell. Do not implement dataset, profiling, findings, history, AI, recommendation, validation, or jobs workflows in this task.

### Backend endpoints involved

- `GET /health` — public process liveness. Response fields: `status`, `service`, `version`, `environment`, `timestamp`.
- `GET /health/ready` — public infrastructure readiness. Response fields: `status`, `checks.database`, `timestamp`; failures use the standard error envelope.

The frontend API layer is designed around the documented backend base URL `http://localhost:8000` (overridable with `VITE_API_BASE_URL`). The backend includes `X-Request-ID` on every response and accepts a safe caller-provided request ID. The client will generate a request ID per call and preserve returned request IDs in typed errors.

### Backend integration notes

- API routes are mounted at the root path; there is no `/api` prefix.
- JSON timestamps are RFC 3339 UTC strings and domain identifiers are UUID strings.
- Collection responses use `{ items, pagination }` with `page`, `page_size`, `total_items`, and `total_pages`.
- Errors use `{ error: { code, message, details, request_id } }`; raw server errors must not be shown.
- Health is the only backend resource consumed by Task 1. Dataset and analysis resources will be integrated in their dedicated tasks using the exact schemas in `backend/app/schemas` and `backend/docs/api.md`.
- Authentication is not implemented by the backend. The frontend does not fake login or bearer-token behavior.
- CORS is not enabled in the current backend because no trusted frontend origin was previously defined. Local development may require enabling the frontend origin in a later backend integration change or using a development proxy.
- Recommendation apply is not implemented. The future recommendation UI must remain preview-only and must not render a fake Apply action.
- Jobs are synchronous in the current backend despite their durable status model. The future Jobs UI must not invent progress percentages.
- `/metrics` and `/limits` exist for a future operator/settings surface; they are not consumed in Task 1.

## Architecture

- `frontend/` is the standalone Vite application within the existing repository.
- `src/api/client.ts` owns base URL resolution, request IDs, JSON parsing, error normalization, and transport behavior.
- `src/api/health.ts` owns typed health endpoint functions.
- `src/types/api.ts` owns shared transport and health contracts for this task.
- TanStack Query owns server state and query lifecycle; no global client store is needed.
- React Router owns page-level navigation and URL state.
- Tailwind utility classes are backed by CSS variables in `src/index.css` so the palette is coherent and can evolve without scattering raw colors.
- Shared UI primitives live in `src/components/ui`; shell-specific components live in `src/components/layout`.

## Implementation notes

### Files/components created

- `frontend/package.json`, `package-lock.json`, Vite, TypeScript, Tailwind, and PostCSS configuration.
- `frontend/src/api/client.ts` — typed transport wrapper with base URL selection, per-request `X-Request-ID`, sanitized error normalization, and network failure handling.
- `frontend/src/api/health.ts` — typed liveness and readiness functions.
- `frontend/src/types/api.ts` — health and standard error envelope contracts.
- `frontend/src/components/layout/AppShell.tsx`, `Sidebar.tsx`, and `Topbar.tsx` — responsive application shell and navigation.
- `frontend/src/components/ui/{Badge,Button,EmptyState,ErrorState,LoadingSkeleton,Metric,PageHeader,Panel}.tsx` — reusable foundation primitives.
- `frontend/src/pages/OverviewPage.tsx` — live service overview and foundation state.
- `frontend/src/pages/PlaceholderPage.tsx` — explicit, non-fake staged surfaces for future routes.
- `frontend/src/App.tsx`, `main.tsx`, `index.css`, `index.html`, and Tailwind/Vite support files.
- Root `.gitignore` entries for frontend dependency and build output directories.

### API endpoints integrated

- `GET /health` via TanStack Query for process liveness.
- `GET /health/ready` via TanStack Query for database readiness, with a 30-second refetch interval.
- The transport is ready for the documented root-mounted backend resources but no dataset or analysis endpoint is consumed before its dedicated task.

### Design decisions

- Deep navy-charcoal canvas and surfaces with a controlled teal accent, emerald success, amber warning, red danger, and blue information palette.
- Compact 248px desktop sidebar that becomes an overlay navigation on small screens; the content shell preserves density for future tables.
- Status meaning is always carried by text and icon as well as color.
- Navigation includes only Overview, Datasets, Jobs, and Settings; unimplemented routes explicitly explain their task boundary instead of presenting mock data.
- TanStack Query owns health server state; no Zustand store was needed because Task 1 has no global client state.
- Vite proxies health, datasets, metrics, and limits paths to `http://localhost:8000` in development, avoiding a frontend-origin CORS assumption.

## Testing status

- [x] Frontend TypeScript check: `npm run typecheck --prefix frontend`
- [x] Frontend production build: `npm run build --prefix frontend`
- [ ] Backend full suite: 275 passed, 3 skipped, 2 existing failures; see Known issues.
- [ ] Backend Ruff/mypy: existing backend lint/type issues remain; see Known issues.
- [x] Browser inspection at desktop resolution with Vite and the live FastAPI process. Liveness rendered Ready; readiness rendered Unavailable with the sanitized backend error/request ID while PostgreSQL was not running.

## Known issues

- The backend currently does not enable CORS for a frontend origin. The frontend uses a Vite development proxy for local development, and deployment configuration will need an explicit trusted-origin decision.
- There is no authentication/authorization contract yet; the frontend intentionally exposes no login or access-control fiction.
- The local backend full-suite run has two pre-existing failures unrelated to the frontend: `test_get_latest_returns_most_recent_profile` and `test_rate_limiter_window_resets`. The run still reports 275 passed, 3 skipped, and 89.94% coverage.
- The backend `ruff check .` and strict `mypy app tests` commands currently report pre-existing issues in backend routes, middleware, validation, and tests. No backend files were changed for Task 1.
- Direct local API inspection did not have PostgreSQL running, so `/health/ready` correctly returned the sanitized `database_unavailable` error. Dataset resources were not exercised in this task.
- `npm install` reported two moderate dependency audit findings. No automated audit fix was applied because it could change the dependency graph outside the foundation scope.

## Completed Work

### TASK 1 — Foundation (completed 2026-07-31)

- Added the first frontend project inside the existing repository at `frontend/`.
- Established the React + TypeScript + Vite + Tailwind + React Router + TanStack Query + Lucide React stack.
- Added the Quanta shell, responsive navigation, service-status header, design tokens, base UI primitives, staged routes, and a live overview page.
- Integrated the exact backend health contracts with generated request correlation IDs and standard error envelope handling.
- Verified the production bundle and inspected the UI in a browser against the running FastAPI process.
- Did not implement dataset ingestion/listing, profiling, findings, scoring, history, AI, recommendations, validation, or jobs pages; those remain in their assigned tasks.

## Next recommended task

After Task 1 is committed, stop and wait for approval to begin **TASK 2 — Dataset Explorer**. That task should integrate the exact `GET /datasets` and `POST /datasets` contracts, including pagination, multipart upload, and the backend error envelope.

## Change log

- 2026-07-31: Backend contract reconnaissance completed. Confirmed implemented resources through durable jobs, preview-only recommendations/validation behavior, root-mounted routes, pagination, request correlation, and current CORS/auth limitations.
- 2026-07-31: Task 1 tracker created before frontend implementation.
- 2026-07-31: Task 1 implemented, checked, browser-inspected, and documented. Next recommended work is Task 2 only after explicit approval.
