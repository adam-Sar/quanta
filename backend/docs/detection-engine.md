# Detection engine

## Status

The Task 4 deterministic detection engine is implemented: five threshold-driven detectors (missingness, duplicates, invalid values, robust outliers, cardinality) persist immutable `Finding` rows bound to the latest profile. Task 5 adds an explainable quality score on top of those rows. AI severity adjustment, drift detection, and history comparison remain planned for later tasks.

## Required detector contract

Each independent detector will consume a profile, rule configuration, and optional comparison context, and return standardized findings. It must not write directly to the database or invoke an LLM. The central finding will include dataset/version IDs, detector type/version, severity, anomaly-detection confidence, data-error confidence, affected scope, metrics, bounded evidence, title, description, and timestamp.

Detection confidence answers "how certain is the measured anomaly?" Data-error confidence separately answers "how certain is it actually wrong?" A statistically extreme value can score high on the first and low on the second.

## Planned deterministic order

Task 4 begins with missingness, exact/identifier duplicates, configurable invalid values, robust numeric outliers, and categorical inconsistencies. Schema change, distribution drift, referential integrity, and relationship discovery follow only with historical or multi-dataset context.

Algorithms will be selected by data type and assumptions, not run as an indiscriminate ensemble. Examples include IQR/median absolute deviation for robust univariate candidates, z-scores only for suitable distributions, Isolation Forest only where multivariate context and sample size justify it, and KS/PSI/Jensen–Shannon/Wasserstein measures chosen according to continuous/categorical drift requirements.

## Severity boundary

INFO through CRITICAL will be computed deterministically from affected proportion/count, deviation magnitude, schema/integrity impact, and explicit business rules. AI may suggest a separate priority adjustment but cannot overwrite objective severity or metrics.

## Testing expectations

Every detector needs synthetic positive, negative, boundary, null-heavy, constant-column, small-sample, and reproducibility tests. Tests must assert expected findings and metrics, not merely absence of exceptions. Algorithm versions, sampling behavior, complexity, and known false-positive modes will be documented as they are implemented.
