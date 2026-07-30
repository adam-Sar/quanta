"""Deterministic AI reasoning layer (Task 7).

The AI layer consumes the immutable Task 4 finding rows bound to
the latest profile and produces a structured, schema-validated
interpretation. It does not re-profile data, recompute statistics,
or invoke unconstrained code. The output is persisted as an
immutable ``ai_interpretations`` row whose ``provider_name`` and
``model_name`` are recorded for audit.

The layer is provider-independent: the ``LLMProvider`` protocol is
implemented by an offline ``NoopProvider`` and can be extended with
real adapters (OpenAI-compatible, local inference, etc.) without
changing the rest of the service.

No new dependencies are introduced in Task 7. Real provider SDKs
land in a later task.
"""
