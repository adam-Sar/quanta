# AI reasoning layer

## Status and purpose

The AI layer is **planned for Task 7 and has no implementation or provider dependency in Task 2**. It exists to explain and connect deterministic findings, hypothesize root causes, communicate uncertainty, and propose structured next actions. It will not count nulls, compute statistics, inspect unrestricted raw files, assign objective severity, or execute changes.

## Provider boundary

A provider-independent `LLMProvider` protocol will accept typed prompt input and a Pydantic output type. Provider adapters (for example OpenAI-compatible or local inference) will own authentication, transport, retries, timeout, and provider response parsing. Domain services will not import provider SDKs. Configuration chooses the adapter through `LLM_PROVIDER`, `LLM_MODEL`, and secret injection.

## Input boundary

Default input is compact structured context such as dataset metadata, detector/version, aggregate metrics, bounded/redacted evidence, severity, and both confidence concepts. Sending complete datasets or million-row CSV payloads is prohibited. A later policy must define redaction, token budgets, data residency, and whether limited samples are permitted per deployment.

```json
{
  "dataset": { "name": "customers", "version_id": "...", "row_count": 329881 },
  "findings": [
    {
      "detector_type": "categorical_inconsistency",
      "column": "country",
      "metrics": { "US": 3921, "USA": 12423, "United States": 312123 },
      "severity": "medium",
      "detection_confidence": 0.98,
      "data_error_confidence": 0.72
    }
  ]
}
```

## Structured output

Dedicated, versioned prompt modules will cover explanation, prioritization, root-cause hypotheses, and transformation suggestions. Pydantic schemas will require fields such as explanation, likely causes, assumptions, uncertainty, and a constrained recommendation operation. Invalid provider output fails closed and is never treated as executable work.

## Safety path

```text
LLM structured recommendation
 -> schema validation
 -> operation allow-list and semantic validation
 -> deterministic impact preview
 -> human approval / explicit API execution request
 -> deterministic transformation engine
 -> post-transformation checks
 -> new immutable version
```

No provider can issue SQL, Python, shell, network calls, or arbitrary transformation expressions. Prompt injection in dataset values must be treated as untrusted data, and provider input/output must have audit metadata without logging sensitive row content.
