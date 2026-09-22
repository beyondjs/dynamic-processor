# Dynamic Processor

Dynamic Processor gives an object a processing lifecycle whose completed state is read synchronously: it waits for the child processors it registers or requires, recomputes after an invalidation, publishes only the newest result, and announces change. It is a Beyond-authored Node utility, and it is the lifecycle almost every object of the Beyond compiler inherits.

Import the public module `@beyond-js/dynamic-processor/main`. The `DynamicProcessor()` factory returns a class with the lifecycle surface; supply a base constructor to compose that lifecycle with an existing class.

```ts
import { DynamicProcessor } from '@beyond-js/dynamic-processor/main';

class Counter extends DynamicProcessor() {
    get dp() { return 'counter'; }
    #value = 0;
    get value() { return this.#value; }
    _process() { this.#value++; }
}

const counter = new Counter();
await counter.ready;                       // starts initialisation and the first processing
console.log(counter.value);                // 1
const changed = () => counter.processed && console.log(counter.value);
counter.on('change', changed);
counter._invalidate();                     // processes again and announces change
await counter.ready;
counter.off('change', changed);
counter.destroy();
```

What a consumer relies on:

- `ready` starts the object and resolves once its processing completed. It **rejects** when the object failed to initialise or to process, with a `ProcessorFailure` that names the processor, the phase and the original error as its `cause`; `error` exposes the same failure on the object, and a later `ready` or invalidation is a new attempt. A destroyed object resolves it.
- `change` is announced to the subscribers of the object itself, after the first completion, after a changed result and after destruction. Its argument is the object the subscribers registered on.
- `_notify()` is the object's own reaction to a completion. It is skipped on the first completion unless `notifyOnFirst` is set, which a subclass may do with a class field or by assignment.
- A completion of an attempt that a newer invalidation superseded is dropped, even when the newer attempt is still waiting for a child. The work itself is not cancelled: `cancelled(request)` is what an implementation checks before publishing side effects of its own.
- A processor whose required child failed waits, and after five seconds writes a checkpoint to the log of the dynamic processors naming the child and its failure; `children.monitor.checkpoint.report` is that text on demand.

Read [architecture and lifecycle](docs/architecture.md) for the state model, the ownership rules, the event order and the diagnostics, [the child contract](interface.md) for what a child must expose, [mixin forwarding and types](src/modules/main/overloads.md) for what the composed object does and does not expose, and [validation](docs/validation.md) for how each contract is tested and what remains unverified.

Source lives under [src/package.json](src/package.json), selected by [beyond.json](beyond.json); the root package holds development tooling only. The tests under [tests/](tests/README.md) are ordinary `node:test` files that import the compiled public module under BEE Node from an Engine server; the validation guide states the prerequisites.
