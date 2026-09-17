# Dynamic Processor

Dynamic Processor coordinates asynchronous computation whose completed state is read synchronously. A processor waits for registered or dynamically required child processors, recomputes after invalidation, and exposes readiness plus change notifications. It is a Beyond-authored Node utility used by configuration and compilation objects.

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
await counter.ready;
console.log(counter.value);
const changed = () => {
    if (!counter.destroyed && counter.processed) console.log(counter.value);
};
counter.on('change', changed);
counter._invalidate();
counter.off('change', changed);
counter.destroy();
```

`ready` starts initialization, whereas subscribing alone does not. `initialise()` finishing is not the same as processing finishing. The first processing and destruction both emit `change`; inspect lifecycle flags in consumers. Processing failures can leave readiness pending, so the current implementation is not a complete error/retry scheduler.

Read [architecture and lifecycle](docs/architecture.md), [child compatibility interface](interface.md), and [mixin forwarding and types](src/modules/main/overloads.md). The architecture guide documents field-forwarding, cancellation, logging and teardown limitations that matter before extending the utility.

Source lives under [src/package.json](src/package.json), selected by [beyond.json](beyond.json). The root package contains development tooling, not the public utility definition. Build and example-runner requirements are described in the architecture guide; no standalone npm test script is configured.
