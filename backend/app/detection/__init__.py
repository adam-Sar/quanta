"""Detection domain package.

Task 4 introduces deterministic, threshold-based quality findings
derived from the immutable profiling artifacts produced in Task 3.
Each finding is a small structured record (kind, severity, column,
metric, observed value, threshold, details) persisted alongside the
profile that triggered it.

This package contains only the deterministic scoring layer. AI,
recommendations, scoring aggregation, and history comparison live in
later tasks and must not be added here.
"""

__version__ = "0.4.0"
