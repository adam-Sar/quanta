"""Deterministic validation layer (Task 9).

The validation layer consumes the Task 8 recommendation rows (bound
to a profile and therefore to a dataset version) and runs a bounded,
deterministic preview against the persisted source file. The
preview never mutates the source file and never executes arbitrary
code; it reads the file through ``FileStorage.path_for`` and
``polars.scan_csv`` / ``pyarrow``, then computes the projected impact
of the recommendation's constrained operation.

A validation is persisted as an immutable ``Validation`` row with a
deterministic ``status`` (``valid`` / ``invalid`` / ``warning``) and a
JSONB ``impact`` payload that summarises the projected effect (for
example, "1 column would be dropped, 12 remaining" or "~847 nulls
would be imputed with mean"). The actual apply call, which would
create a new immutable dataset version, is **explicitly out of scope**
and lands in a later task (Task 10 durable analysis jobs).
"""