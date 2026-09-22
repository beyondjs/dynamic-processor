# Validation

How each public contract of Dynamic Processor is tested, with what the tests observe and what stays unverified. Evidence labels: **component test** is a `node:test` file of this repository executed against the compiled public module; **consumer** is a validation of the Beyond compiler that runs on these sources; **source** is a reading with no execution.

## Prerequisites and command

The tests import `@beyond-js/dynamic-processor/main` as a consumer does. They need an Engine development server that compiles this package (and one for `@beyond-js/pending-promise` unless the installed copy is acceptable), BEE Node registered with `BEE_URL` naming those servers and `BEE_ADAPTER=engine`, and a working directory whose `node_modules` resolves `@beyond-js/kernel`, `@beyond-js/pending-promise` and `colors`. Inside the Beyond Suite, `node utils/validation/run.mjs dynamic-processor` prepares all of that and prints the origin every utility module resolved to, which is what makes a result attributable.

Run directly, the files are `node --import "$BEE_NODE_DIR/register.mjs" --test tests/*.test.mjs` with that environment: Node's test runner, one process per file, as the Beyond Suite testing guide prescribes.

## Contract, risk and test

| Contract or risk | Test | Input | Observed |
| --- | --- | --- | --- |
| `ready` starts initialisation and resolves after the first processing | `lifecycle` 1 | A counter processor | initialised, processed, one run, `first` false, `tu` set |
| Subscribing starts nothing; first completion emits `change` and skips `_notify` | `lifecycle` 2 | A subscriber before `ready` | not initialised until `ready`; one `change` after processed; no notification |
| Invalidation reprocesses; unchanged results announce nothing; `false` means neither flag | `lifecycle` 3 | Responses `undefined`, `{changed:false,notify:false}`, `false` | one `change` and one notification for the changed result only |
| A `null` response does not throw | `lifecycle` 4 | `_process` returning `null` | processed |
| A promise and a non-native thenable are awaited | `lifecycle` 5 | `async _process`; an object with `then` | value set before adoption |
| A newer invalidation drops the older completion | `lifecycle` 6 | 60 ms and 5 ms attempts | only the newer published |
| A completion of an attempt superseded while preparation is blocked is dropped | `lifecycle` 7 | Parent invalidated while its required child is unprocessed | `_request` undefined while blocked; first completion not published; second published |
| Registered children start with the parent, reprocess it, and are released on unregister | `lifecycle` 8 | `setup(new Map([['child', …]]))` | child processed; one subscription; reprocessed on child change; zero subscriptions after unregister; child not destroyed |
| Required children are waited for; a string reason holds | `lifecycle` 9 | A dependency that completes on release; `_prepared` returning a string | pending names the child; held until the reason is gone |
| Two parents sharing a child are each reprocessed once | `lifecycle` 10 | Two parents requiring one child | both run twice |
| A base constructor keeps its arguments and members; `Map` composes | `composition` 1, 2 | `DynamicProcessor(Named)`, `DynamicProcessor(Map)` | base members and `instanceof Base` kept; not `instanceof` the implementation |
| The outer emitter is the one subscribers registered on | `composition` 3 | A subclass emitting through `_events` | the subscriber of the outer object hears it |
| `setMaxListeners`, `removeAllListeners`, `listenerCount` are forwarded | `composition` 4 | Calls on the outer object | applied to the implementation |
| `notifyOnFirst` as a class field or an assignment on the outer object | `composition` 5 | Both forms, and the default | honoured; default false |
| Detached `_invalidate`; the `change` argument is the outer object | `composition` 6 | `const fn = dp._invalidate; fn()` | reprocessed; payload identical to the outer object |
| Hook order | `composition` 7 | Hooks recording their order | begin, prepared, process, prepared, process, notify |
| Child validation | `composition` 8 | An object without the members; `undefined`; a non-Map | refused with a reason |
| A rejected `_begin` rejects `ready` with the cause, and the next `ready` retries | `failures` 1 | `_begin` throwing once | rejected `ProcessorFailure` with `cause`; `error` set; flags reset; second `ready` fulfils; `error` cleared |
| A missing `dp` rejects `ready` | `failures` 2 | A subclass without `dp` | rejected |
| A throwing or rejecting `_process` rejects `ready`, resets `processing`, recovers on invalidation | `failures` 3 | Three modes | rejected twice with causes; fulfilled after; three runs |
| An unobserved failure is not an unhandled rejection | `failures` 4 | Nobody awaiting `ready` | no `unhandledRejection`; `error` set |
| A throwing `change` subscriber leaves the bookkeeping intact | `failures` 5 | Two subscribers, the first throwing | processed, `first` cleared, the later `_notify` runs; the second subscriber is not called (Node emitter) |
| A throwing or rejecting `_notify` is reported, not unhandled | `failures` 6 | Both forms | processed; no `unhandledRejection` |
| A failed child holds its parent and is named in the checkpoint report | `failures` 7 | A child whose `_process` throws | parent pending after 200 ms; report names child and cause |
| `destroy` settles a pending `ready`, releases checkpoint and subscriptions, refuses a second call | `failures` 8 | A parent blocked on a never-completing child | awaiter released; `pending` false; zero child subscriptions; second call throws |
| Destruction during `_begin` starts no children | `failures` 9 | `destroy()` while `_begin` awaits | never processed; not initialised |
| Import creates no log directory | `resources` 1 | A fresh process and working directory | no `.beyond/dps` |
| Repeated creation and destruction leaves no timers or subscriptions | `resources` 2 | 500 parent/child pairs | active `Timeout` count unchanged; zero subscriptions |
| A waiting processor arms an unreferenced checkpoint, released on destroy | `resources` 3 | A blocked parent | `pending` true, no active `Timeout`, `pending` false after destroy |

## Consumer evidence

The Beyond compiler runs on these sources through its bootstrap (`BEYOND_LOCAL_PACKAGES`), and its own validations are the consumer evidence: the utilities validation of Packages (emitter ownership, deferred finder announcement, listener isolation, repeated edit, recovery, stylesheet and manifest-reload rounds) and its stage-1 validation. Their results belong to the suite's dated record, not to this repository; a run against the published `1.0.8` is a different run.

## Not established

- A real cycle of dependencies: it waits and is reported by the checkpoint; the tests do not construct one.
- The log file contents: the tests assert the report text through `checkpoint.report` and that no directory is created on import, not the written file.
- Behaviour under the published 1.0.8 artifact: that copy lacks every repair here, which the consumer validation shows by comparison.
- Timing under load: the timers of the tests are generous rather than measured, and no throughput was characterised.
- Policy: whether a parent should fail when a required child fails, instead of waiting with a diagnosed checkpoint, is an owner decision. The current behaviour is the waiting one.
