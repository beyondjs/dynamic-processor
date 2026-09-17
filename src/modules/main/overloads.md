# Mixin types and runtime forwarding

DynamicProcessor accepts an optional base constructor. Its overload with a base returns a constructor with ConstructorParameters<Base> and an instance intersection of InstanceType<Base> and the lifecycle implementation. Without a base it returns a parameterless lifecycle constructor. This preserves constructor inference that would otherwise be lost when the implementation selects Base or EmptyBase.

```ts
import { DynamicProcessor } from '@beyond-js/dynamic-processor/main';
class Named {
    constructor(readonly name: string) {}
}
class Processor extends DynamicProcessor(Named) {
    get dp() { return 'named'; }
}
const processor = new Processor('example');
```

The runtime allocates a separate implementation object and forwards its prototype methods/accessors. It redirects dp/id and lifecycle hooks to outer overrides. Instance fields are not automatically forwarded, even though the intersection type includes them. In particular setMaxListeners/removeAllListeners and notifyOnFirst have runtime differences documented in [architecture](../../../docs/architecture.md#mixin-compatibility-limits).

The outer object extends the chosen Base, not DynamicProcessorImplementation. An instanceof test against the latter does not identify mixin objects. Base methods with overlapping names can be replaced by forwarding; base cleanup is not automatically invoked. `_invalidate` alone receives an explicit outer bound function so it can be used as a callback.
