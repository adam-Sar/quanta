"""Durable analysis job resource (Task 10).

The jobs layer wraps the Task 2-9 analysis operations (profile,
detect, score, history, AI interpretation, recommendations,
validation) as a durable, queryable resource. Each ``Job`` row
records the requested operation, the persisted parameters, the
operation status, and the result (or error). Job execution is
**synchronous** in this task: the request handler runs the pipeline
inline and persists the outcome. The Task 11 hardening task may
introduce a real worker, but Task 10 deliberately keeps the
implementation boring and deterministic.
"""