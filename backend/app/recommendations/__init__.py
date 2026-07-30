"""Deterministic recommendations layer (Task 8).

The recommendations layer consumes the immutable Task 4 finding rows
bound to the latest profile (optionally the latest Task 5 score, Task 6
history comparison, and Task 7 AI interpretation) and produces a small
set of structured, explainable recommendations. Each recommendation is
a **constrained operation** — it never executes arbitrary code on the
dataset, never mutates the original file, and never reads raw row
content. Recommendations are preview-only; the apply step lands in a
later task (Task 9 validation).

The mapping from findings to recommendations is a deterministic rule
engine. It does not call an LLM, does not re-profile data, and does
not execute SQL, Python, or shell commands. The rule engine and all
constants live in :mod:`app.recommendations.formula` and are
documented in :mod:`app.recommendations.types`.
"""