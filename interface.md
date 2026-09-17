# Dynamic processor child contract

A compatible child exposes `dp`, `on/off`, `initialise`, `ready`, `processed`, `destroyed` and `_request`. The registration validator only checks part of that surface; the monitor uses the remaining members. Readiness starts computation when needed. A fresh request object distinguishes recomputation for parent deduplication.

Subscribe to `change` for completed output or destruction, then check processed/destroyed before reading usable data. The first completion emits change. There is no initialised event. `initialised` describes completed setup, not necessarily completed processing.

A child owns its resources. Removing it from a parent detaches the parent's subscription but does not destroy it. Mixin processors are structurally compatible; they are not instanceof DynamicProcessorImplementation.

See [architecture](docs/architecture.md) for exact preparation, event, error and lifetime behavior.
