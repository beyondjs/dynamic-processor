# Dynamic processor child contract

A child is any object that a processor registers with `setup()` or requires from `_prepared(require)`. Registration validates `dp`, `on`, `off` and `initialise`; the monitor then uses `ready`, `processed`, `destroyed`, `error`, `initialised` and `_request`. Every object built with `DynamicProcessor()` and every direct subclass of `DynamicProcessorImplementation` satisfies the contract; a mixin object is structurally compatible and is **not** an `instanceof DynamicProcessorImplementation`.

| Member | What the parent does with it |
| --- | --- |
| `ready` | Read once when the child is first monitored, which starts it. The promise is not awaited by the parent: a rejection is delivered to whoever awaits it and is not an unhandled rejection. |
| `change` event | Re-evaluates the parent. The parent processes when every monitored child is processed or destroyed and the set of child requests differs from the previous processing. |
| `processed`, `destroyed` | A child that is either counts as ready for the parent. |
| `error` | Named in the checkpoint report of a parent that waits for a failed child. |
| `_request` | Compared by identity with the previous processing, so a parent whose children did not process again is not reprocessed through a second path of the graph. |

A child owns its resources. Removing it from a parent releases the parent's subscription and does not destroy it. A parent that requires itself is refused at registration, on the implementation and on the outer object of a mixin.

There is no `initialised` event. `initialised` means `_begin` completed and the children were started, not that a result exists; subscribe to `change` and read `processed` before using a value.

See [architecture](docs/architecture.md) for the exact preparation, event, failure and lifetime behaviour.
