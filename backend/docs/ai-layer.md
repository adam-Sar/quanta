# AI reasoning layer

## Status

The AI reasoning layer is **implemented in Task 7**. It consumes the
immutable Task 4 finding rows bound to the latest profile and
produces a structured, schema-validated interpretation. It does not
re-profile data, recompute statistics, or execute unconstrained
code on the dataset. The output is persisted as an immutable
`ai_interpretations` row whose `provider_name` and `model_name`
columns preserve the audit trail.

## Provider boundary

A provider-independent `LLMProvider` runtime-checkable Protocol
defines the single entry point:

```python
@runtime_checkable
class LLMProvider(Protocol):
    name: str
    def complete(
        self,
        *,
        prompt: str,
        response_model: type[BaseModel],
        context: dict[str, Any] | None = None,
    ) -> BaseModel: ...
```

The default offline `NoopProvider` implements the protocol with a
deterministic response and is the default when `LLM_PROVIDER` is
unset. Real provider adapters (OpenAI-compatible, local inference,
etc.) own authentication, transport, retries, timeout, and provider
response parsing. Domain services do not import provider SDKs.
Configuration chooses the adapter through `AI_FORMULA_VERSION` and
the operator-configurable `LLM_PROVIDER` / `LLM_MODEL` /
`LLM_API_KEY` settings (a real provider SDK lands in a later task).

## Input boundary

The reasoning service builds a bounded prompt from the persisted
Task 4 findings bound to the latest profile, plus the latest Task 5
score and grade:

```text
You are a deterministic data quality analyst. Read the structured
context below and produce a short, evidence-based interpretation.
Do not invent findings; only reference the finding ids provided.
Return JSON matching the InterpretationResponseSchema. Keep the
summary under 2000 characters. Prefer fewer, higher-confidence
hypotheses over many speculative ones.
```

The context payload carries, for every finding: the deterministic
finding id, the detector kind, severity, column, observed value,
threshold, and a short summary. Sending complete datasets or
million-row CSV payloads is prohibited. A later policy must define
redaction, token budgets, data residency, and whether limited
samples are permitted per deployment.

## Structured output

The expected response is a Pydantic model that the provider must
materialize; free-form text is rejected. The current schema is
`InterpretationResponseSchema`:

```json
{
  "summary": "<= 2000 chars",
  "overall_confidence": 0.0-1.0,
  "hypotheses": [
    {
      "category": "schema_drift | data_quality | pipeline | upstream_source | other",
      "summary": "<= 500 chars",
      "affected_columns": ["col1", "col2"],
      "supporting_finding_ids": ["uuid1"],
      "confidence": 0.0-1.0
    }
  ]
}
```

Invalid provider output fails closed; the service raises
`ProviderError` (502). The `INTERPRETATION_FORMULA_VERSION` is
persisted on every row so a future task can audit persisted rows
against the active code path.

## Safety path

```text
ReasoningService.interpret
  -> load latest profile and its findings
  -> build bounded prompt + context
  -> provider.complete(InterpretationResponseSchema)
  -> schema-validate the response
  -> persist ai_interpretations row (single transaction)
```

No provider can issue SQL, Python, shell, network calls, or arbitrary
transformation expressions. Prompt injection in dataset values must
be treated as untrusted data, and provider input/output must have
audit metadata without logging sensitive row content. Recommendations
belong to Task 8 (the deterministic, preview-only recommendation rule
engine described in `backend/docs/recommendations.md`); the actual
transformation of the dataset belongs to Task 9 (Validation). The AI
layer is strictly **advisory** and never mutates upstream rows. Task 8
may optionally record the latest `ai_interpretations` row id inside a
recommendation's JSONB `components` payload so consumers can
correlate the two, but the recommendation rule engine does not consume
the AI interpretation text.

## Limitations

- The default `NoopProvider` is deterministic and offline. It returns
  placeholder hypotheses built from the first three findings. A real
  provider SDK is not introduced in Task 7; it lands in a later task
  so we do not add a new dependency to `pyproject.toml`.
- The AI layer is read-only with respect to the original file,
  profile, score, and finding rows. A database failure rolls back
  the insert only.
- All reasoning is single-pass per call; multi-turn dialogue, tool
  use, and function calling are explicitly out of scope.