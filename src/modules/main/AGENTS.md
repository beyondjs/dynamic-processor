# Lifecycle implementation instructions

These apply to this directory and its descendants, together with the repository's root [AGENTS.md](../../../AGENTS.md). This directory is the lifecycle every Beyond compiler object inherits: a change here changes the behaviour of every processor, so the invariants below are checked by [the tests](../../../tests/README.md) and must survive any edit.

- **A member the outer object must expose is a prototype member of `DynamicProcessorImplementation`.** The mixin forwards `Object.getOwnPropertyNames` of the prototype and nothing else; an instance field is invisible on the outer object. `_events` is an accessor for this reason. A member the outer object must *own* instead (`notifyOnFirst`, `self`) is listed in the mixin, which redirects the implementation to read it there.
- **Readiness settles.** Every path that ends an attempt settles the current `ready` promise exactly once: a completion resolves it, a failure rejects it with a `ProcessorFailure`, destruction resolves it. A readiness promise is created with a no-op rejection handler, so a processor nobody awaits never ends the process; do not replace that with a bare `PendingPromise`.
- **A superseded attempt publishes nothing.** `#preprocess` clears `#request` before preparation, so a completion of an earlier attempt is dropped even when the new attempt is blocked on a child. Do not move that reset after the request allocation.
- **Announcements never corrupt state.** `processed`, `first` and the readiness promise are recorded before `change` and `_notify` are announced, and a subscriber or hook that throws is reported through `failure.ts`, not propagated. Keep the announcement in `announcer.ts` after the bookkeeping.
- **The checkpoint is released with the monitor** and its timer is unreferenced: a waiting processor keeps no process alive and leaves no timer behind after `destroy()`.
- **The log is lazy.** Nothing under `logs/` touches the filesystem until the first `append`.
- Keep `dp.ts` within the file-length limit by extracting a collaborator, as `announcer.ts`, `failure.ts` and `subscriptions.ts` were; do not compress it.

Run the tests of this repository after any change here, with the validation prerequisites of [docs/validation.md](../../../docs/validation.md).
