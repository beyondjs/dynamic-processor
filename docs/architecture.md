# Dynamic Processor architecture

## Purpose and public surface

A processor owns derived state and collaborators that determine when it can recompute. The public Beyond module is declared by [main/module.json](../src/modules/main/module.json). Its named marked exports include `DynamicProcessor`, `DynamicProcessorImplementation`, `IRequest`, `IProcessResponse`, `Listener`, `RequireType` and `ChildrenType`. Internal children, monitor and logging files are not independent public modules. The required-child implementation also carries a marked default export; consumers should use the named lifecycle API rather than rely on that incidental default without checking generated output.

[DynamicProcessor](../src/modules/main/index.ts) is a mixin factory; [DynamicProcessorImplementation](../src/modules/main/dp.ts) owns the actual lifecycle. The factory allocates one implementation object in a symbol slot on the outer object, forwards prototype members, and redirects identity and lifecycle hooks to the outer subclass. It preserves a supplied base constructor's arguments. It does not inherit from DynamicProcessorImplementation: an outer mixin object is not its `instanceof` instance.

The Node `events` EventEmitter supplies notifications; PendingPromise supplies externally settled readiness; the logger imports Node filesystem/path and colors. Importing the module constructs a logger and starts creating a file under the process working directory. This is not a side-effect-free browser utility even though its types describe a broadly reusable object model.

## Lifecycle and state

| Member | Meaning |
| --- | --- |
| `dp`, `id`, `autoincremented` | Nonempty processor-kind string required from subclass; default ID derives from a process-local counter. These are diagnostic identities, not source revisions or persisted cache keys. |
| `initialising`, `initialised` | `_begin` in progress; `_begin` completed and child monitoring started. Initialised does not mean first output completed. |
| `ready` | Starts initialization when needed and returns a pending promise until processing completes. A processed or destroyed object returns a newly resolved Promise. |
| `preparing`, `processing`, `processed` | Preparation active; preprocess has begun; latest accepted processing completed. Processing can remain true while preparation waits or after failure. |
| `_request`, `cancelled(request)` | Current request object and identity comparison for stale work. Numeric request values are process-local counters. |
| `tu`, `first` | Last accepted completion timestamp; whether first completion notification has yet occurred. |
| `children` | Named registered dependencies plus per-preparation required dependencies and their monitor. |
| `on`, `off` | EventEmitter subscriptions; return the implementation's emitter, not the outer processor. |
| `_invalidate`, `destroy`, `destroyed` | Request recomputation after initialization; release child subscriptions and invalidate pending work; terminal flag. |

Initialization validates `dp`, sets initialising, awaits `_begin`, then sets initialised and starts the child monitor. Reading ready initiates this asynchronously. Calling `initialise` while already starting/started returns without joining first processing; use ready for output availability.

Preprocess marks output unprocessed and processing true. Preparation clears dynamic requirements, invokes `_prepared(require)`, reconciles the monitor and reruns preparation if the dependency set changed. Processing begins only when preparation permits it and all monitored children are processed or destroyed. Returning undefined from `_prepared` permits processing, false holds, and a string holds with a diagnostic reason. The callback `require(child, id?)` registers that child for the current pass and reports its `processed` flag; the monitor starts newly required children through their ready getter.

Each processing attempt receives a fresh request object. `_process(request)` may return synchronously or return a native Promise. A thenable that is not `instanceof Promise` is treated as a synchronous response object, not awaited. Invalidation can start overlapping attempts; it does not abort I/O. Once a newer processing attempt allocates its request, completion of the older request is ignored. Invalidation alone does not allocate that new request: if preparation or a child blocks the new attempt, the previous request remains current. Its pending asynchronous work can still pass `cancelled(request)` and its completion can be accepted despite changed inputs. User code must check `cancelled(request)` after awaits and before mutating shared derived state, but that guard alone does not close this blocked-preparation race; integration needs an invalidation-generation or equivalent freshness contract.

```ts
async _process(request) {
    const next = await this.readInput();
    if (this.cancelled(request)) return false;
    this.replaceValue(next);
    return { changed: true, notify: true };
}
```

This hook fragment assumes the subclass defines readInput/replaceValue. It illustrates the available request guard, which only detects request replacement or destruction. It does not address the blocked-preparation race and is not a built-in queue or rollback mechanism.

## Completion and event order

A response of undefined defaults both changed/notify to true. A boolean sets both flags. An object can specify either flag independently; missing values default true. Returning null is not a supported object response: the implementation then accesses its properties and throws.

Accepted completion sets the timestamp, marks processing false and processed true unless destroyed, resolves the stored readiness promise, emits `change` when changed or on first completion, invokes `_notify` if notify is enabled and the first-notification policy allows it, then clears first. Promise callbacks run later as microtasks; synchronous change listeners run before their awaiting consumer resumes.

First completion always emits `change`, even for false. `_notify` skips first completion unless the implementation's notifyOnFirst is true. Destruction also emits `change`, so change is not an unconditional guarantee that usable output exists. No `initialised` event is emitted. Event listener and `_notify` exceptions can interrupt completion bookkeeping; async `_notify` returns are not awaited.

## Registered, required and monitored children

[Registered](../src/modules/main/children/registered.ts) extends Map of names to `{child}`. Register accepts a Map, validates basic shape, ignores an existing identical name/child and throws for the same name with another child. Registration defaults `invalidate` to false; unregister defaults it to true. `setup` is registration without invalidation. Mutating the inherited Map directly bypasses these validations and invalidation.

[Required](../src/modules/main/children/required.ts) tracks child objects and diagnostic IDs for only the current preparation pass. [Children](../src/modules/main/children/index.ts) prevents requiring its implementation object itself, but that identity check does not reliably reject an outer mixin requiring itself. Validation checks only on/initialise and a truthy dp; later code additionally needs off, ready, processed, destroyed and request state.

[Monitor](../src/modules/main/children/monitor/index.ts) takes the union of registered and required child objects, subscribes once per identity and removes subscriptions no longer needed. A [child subscription](../src/modules/main/children/monitor/child.ts) accesses ready before binding change. Prepared accepts a destroyed child; pending still lists anything unprocessed. The [controller](../src/modules/main/children/monitor/controller.ts) compares child request object identities with its last snapshot to avoid duplicate recomputation through shared graph paths. It is not a content hash, topological sort or cycle detector. Dependency cycles can wait indefinitely; a changing dependency set during preparation can recurse without a bounded iteration guard.

Destruction detaches monitor listeners, removes the implementation from its global diagnostic registry, clears its request and emits change. It does not destroy children themselves, clear own EventEmitter listeners, settle an already-issued ready promise, clear monitor collections, close the logger or release checkpoint timers. A later ready access resolves because destroyed is true, while an earlier awaiting caller may still be stranded. Parent/child lifetime ownership must therefore be explicit.

## Mixin compatibility limits

Only own prototype members of DynamicProcessorImplementation are forwarded. Its instance fields `_events`, `removeAllListeners`, `setMaxListeners`, `waitToProcess` and `notifyOnFirst` are not forwarded. `_invalidate` is explicitly bound on the outer object. The declared intersection type exposes more than the generated mixin actually supplies: a typed setMaxListeners call can be missing at runtime, and setting outer notifyOnFirst does not change the inner implementation field. waitToProcess is unused by the lifecycle even on a direct implementation subclass; it does not debounce processing.

Prototype forwarding can override same-named methods/getters inherited from a supplied Base; base lifecycle methods are not automatically chained. Subclass hooks reach the outer object, but change payload is the inner implementation object. Consumers should capture their outer processor rather than assume the event argument retains subclass members. Code using instanceof DynamicProcessorImplementation for cleanup will miss mixin objects; structural lifecycle checks or an explicit identity contract are needed when integrating collections.

Preserve the recognizable composition and hooks when repairing these issues. Copying a type surface is not proof of runtime forwarding, and flattening the implementation into unrelated utilities is unnecessary.

## Errors, diagnostics and resource ownership

An `_begin` rejection can leave initialising true and ready pending; ready's automatic initialization catch logs rather than rejects readiness. Synchronous preparation/processing errors propagate through their caller, potentially leaving flags set. Native Promise rejection from `_process` is logged and does not reject ready or restore state. Destruction during an awaited `_begin` has no post-await destroyed check. There is no failure event, retry budget, timeout for readiness, automatic rollback or cancellation of work.

[Logs](../src/modules/main/logs/index.ts) opens `.beyond/dps/dp-<pid>-<time>.log`, buffers before initialization and reports slow processing above two seconds and high listener counts. Initialization failure only logs; subsequent messages can remain buffered indefinitely. There is no close method. [Checkpoints](../src/modules/main/children/monitor/checkpoint.ts) schedule five-second waiting diagnostics, but load the logging module through a namespace-style require while append is on its default export. That generated-module interop needs correction or explicit compatibility handling. Checkpoint cleanup is not part of monitor.destroy. The optional [monitor logger](../src/modules/main/children/monitor/logs.ts) is disabled and its selection filter never enables output as written.

## Build, examples and validation

[beyond.json](../beyond.json) selects [src/package.json](../src/package.json). That source manifest declares Node distributions on ports 1110/1111 and the public dependencies. Root [package.json](../package.json) declares development tooling. TypeScript [module configuration](../src/modules/main/tsconfig.json) requires Node types and no implicit any. Declaration files under source node_modules are generated support, not implementation authority; trash examples are historical material.

The [interval example](../tests/interval.js) owns and clears its own timer. The four `test-dp-*.js` runners exercise an interval, named children, dynamic requirements and an unconnected child. They use legacy BEE at fixed local ports and log observations rather than assert a full regression suite. They require a separately running compatible Beyond compiler/dev server and installed dependencies. No test script wires them into npm test; they do not establish error recovery, field forwarding, cancellation races or leak freedom.

The publication workflow builds an `npm` distribution, while the source manifest currently declares node/node-ts only. Do not treat that workflow as a standalone reproducible build recipe without resolving its distribution/toolchain contract. Build/publish is separate from testing and requires appropriate authorization.

Validation for changes should cover first/change/destroy event order, delayed children, dynamic graph replacement, overlapping requests and guarded assignments, failed begin/process and retry, pending-ready destruction, base class collisions, actual mixin fields, child cleanup and timer/logger lifecycle. Test through the generated public module as well as isolated implementation where output/interop matters.
