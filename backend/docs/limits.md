# Operator-facing limits (Task 11)

## Status

Task 11 ships an in-memory rate limiter, an in-process request
metrics recorder, security response headers, and a request-budget
guard. All four pieces are real behavior exercised by unit + API
tests, not empty scaffolding. The infrastructure layer is a single
``app/core/ratelimit.py`` + ``app/core/metrics.py`` pair; a future
task may swap them for a Redis-backed implementation without
changing the call sites.

## Rate limiting

The ``request_context_middleware`` enforces a sliding-window
``(client_key, scope)`` budget on every request. ``client_key`` is
the first ``X-Forwarded-For`` IP when present, otherwise the direct
client address (falling back to ``"anonymous"``). ``scope`` is the
route's path template (``"GET /health"``) so different paths have
independent budgets. When the budget is exhausted the middleware
returns a 429 envelope directly with a ``Retry-After`` header; the
exception handler chain is not on the hot path so the response
remains consistent even when the downstream chain is misbehaving.

The envelope is the standard error shape:

```json
{
  "error": {
    "code": "rate_limit_exceeded",
    "message": "Too many requests. Retry after the indicated delay.",
    "details": {
      "retry_after_seconds": 1,
      "scope": "GET /metrics"
    },
    "request_id": "..."
  }
}
```

Headers: ``X-Request-ID``, ``X-Content-Type-Options: nosniff``,
``X-Frame-Options: DENY``, ``Referrer-Policy: no-referrer``,
``Retry-After: 1``.

## Settings

| Variable | Default | Description |
|---|---|---|
| ``RATE_LIMIT_CAPACITY`` | 120 | Max requests per window per ``(client_key, scope)``. |
| ``RATE_LIMIT_WINDOW_SECONDS`` | 60.0 | Sliding-window length. |
| ``REQUEST_BUDGET_MS`` | 15 000 | Soft wall; a request that exceeds it logs ``request_budget_exceeded`` but is still served. |
| ``MAX_REQUEST_BYTES`` | 1 048 576 | Hard cap for JSON / file body sizes enforced by ``app.limits.enforce_max_request_bytes``. |
| ``MAX_UPLOAD_SIZE_MB`` | 250 | Streaming upload cap (pre-existing Task 2). |
| ``METRICS_BUFFER_CAPACITY`` | 256 | Size of the recent-observations ring buffer. |

All values are Pydantic-bounded (``ge=1, le=10_000`` for capacity,
etc.) so a misconfigured env var is rejected at startup.

## Metrics endpoint

``GET /metrics`` returns the in-process request recorder:

```json
{
  "capacity": 256,
  "size": 3,
  "summary": {
    "total_requests": 3,
    "average_ms": 1.5,
    "min_ms": 0.3,
    "max_ms": 4.1,
    "by_status": {200: 3},
    "by_path": {"/metrics": 2, "/limits": 1}
  },
  "recent": [
    { "method": "GET", "path": "/metrics", "status_code": 200, ... }
  ]
}
```

The middleware appends the observation *after* the response is built
so the status code and duration are correct. The trade-off is that
``GET /metrics`` always reports one observation behind; that is
documented in the OpenAPI summary.

## Limits endpoint

``GET /limits`` returns the active operator-facing limits so the
frontend can render a "what is enforced" page without parsing env
vars. The endpoint reads the live ``Settings`` instance so the
response always matches the running configuration.

## Test isolation

The rate limiter and metrics recorder are module-level singletons
so the middleware can read them without per-request dependency
injection. Tests share these singletons across the process, so
``tests/conftest.py`` exposes an ``autouse`` fixture that calls
``reset_limiter`` and ``RECORDER.reset`` before and after every
test. The fixture also imports ``app.core.middleware.reset_limiter``
explicitly so the import is a no-op rather than a surprise. Without
this fixture the rate-limit / metrics tests would race each other
and surface as spurious 429s or inflated recent-observation counts.

## Why in-memory?

The dependency policy forbids adding new packages in this task.
A real production deployment would back the limiter with Redis
(``REDIS_URL`` is already a config field). When the dependency
policy is relaxed, replace ``app.core.ratelimit.SlidingWindowRateLimiter``
with a Redis-backed implementation that exposes the same
``check(client_key, scope) -> RateLimitDecision`` method, and the
middleware contract does not change.
