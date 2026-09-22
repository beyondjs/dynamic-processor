# Mixin types and runtime forwarding

`DynamicProcessor(Base?)` returns a constructor. With a base, the constructor keeps `ConstructorParameters<Base>` and its instances are typed as `InstanceType<Base> & DynamicProcessorImplementation`; without one, it is a parameterless lifecycle constructor. The overloads exist because the implementation selects `Base` or an empty class at runtime and TypeScript cannot infer the constructor otherwise.

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

At runtime the outer object holds one `DynamicProcessorImplementation` under a private symbol and forwards to it:

| Member of the implementation | On the outer object |
| --- | --- |
| Prototype methods and accessors (`ready`, `processed`, `on`, `off`, `listenerCount`, `removeAllListeners`, `setMaxListeners`, `children`, `error`, `identity`, `_events`, `destroy`, …) | Forwarded: the call or the read is applied to the implementation |
| `dp`, `id` | Redirected the other way: the implementation reads them from the outer object, which is where a subclass defines them |
| `self` | The outer object. It is what subscribers receive with `change`, and the implementation reads it from the outer object |
| `notifyOnFirst` | Owned by the outer object: a class field or an assignment there is what the implementation reads. It defaults to `false` |
| `_begin`, `_prepared`, `_process`, `_notify` | Hooked: the implementation calls the outer overrides |
| `_invalidate` | Assigned per instance on the outer object, so it can be passed as a bare function |
| `waitToProcess` | An instance field of the implementation, declared for compatibility, not applied by the lifecycle and not forwarded |

Instance fields of the implementation are never forwarded, because the forwarding loop reads the prototype. Any member the outer object must expose is therefore a prototype accessor or method of the implementation; `_events` is one for exactly that reason, and a subclass that emits an event of its own, as the finder does, relies on it.

The outer object extends the chosen base, not the implementation, so `instanceof DynamicProcessorImplementation` does not identify it; the [child contract](../../../interface.md) is structural. A base method whose name a forwarded member shares is replaced by the forwarding; base cleanup is not invoked by `destroy()`.
