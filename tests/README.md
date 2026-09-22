# Tests

Ordinary `node:test` files that import the compiled public module `@beyond-js/dynamic-processor/main` exactly as a consumer does. They need the module served: an Engine development server compiles this package, BEE Node resolves the specifier to it, and the process resolves the installed dependencies of the compiled module (`@beyond-js/kernel/bundle`, `@beyond-js/pending-promise/main`, `colors`) from its working directory.

```sh
# From a directory whose node_modules resolves those dependencies:
BEE_URL=<engine server of this package>[,<server of @beyond-js/pending-promise>] BEE_ADAPTER=engine \
  node --import "$BEE_NODE_DIR/register.mjs" --test tests/*.test.mjs
```

Inside the Beyond Suite, `node utils/validation/run.mjs dynamic-processor` stages this checkout with the other utilities, serves them and runs every file here; [the validation guide](../docs/validation.md) maps each file to the contracts it establishes.


## Conventions

These files follow the normative conventions of the Beyond Suite testing guide (testing v1): Node's own test runner, one process per file; the public specifier a consumer imports and never a source file; readiness, events and answers awaited rather than time, with the runner's timeout bounding every wait; whatever a test creates (a directory, a process, a service) removed with `t.after`, on failure as well; and outcomes asserted, error paths by their diagnostic code where the object reports one. They are not run by `beyond test`: that command tests the packages Packages compiles, and this one is compiled by Engine, so the runner is given the loader and the servers instead. For the same reason the files sit in `tests/` and not beside the module sources, since Engine takes every file of a module directory as an input.

`support.mjs` holds what these files share: gates a hook awaits and the test opens, a turn of the event loop, a wait for observed state, and `Counter`, a processor that counts its runs and notifications. None of them waits for a length of time.

| File | Establishes |
| --- | --- |
| `lifecycle.test.mjs` | Readiness, first completion, invalidation, response flags, asynchronous and thenable processing, superseded attempts |
| `children.test.mjs` | Registered and required children, hold reasons, a child shared by two parents |
| `composition.test.mjs` | The mixin with a base class and with `Map`, the emitter of the outer object, forwarded listener members, `notifyOnFirst`, the detached `_invalidate`, the `change` payload, hook order, child validation |
| `failures.test.mjs` | Rejected `_begin`, missing `dp`, throwing and rejecting `_process`, unobserved failures, throwing subscribers and `_notify`, a failed child in the checkpoint report, destruction with a pending readiness and during `_begin` |
| `resources.test.mjs` | The lazy log, timers and subscriptions after repeated creation and destruction, the checkpoint timer |
