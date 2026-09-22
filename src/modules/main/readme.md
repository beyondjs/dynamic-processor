# Main module

The public `@beyond-js/dynamic-processor/main` module combines the mixin factory ([index.ts](index.ts)), the lifecycle implementation ([dp.ts](dp.ts)) and its collaborators: the completion announcement ([announcer.ts](announcer.ts)), the failure and its report ([failure.ts](failure.ts)), the subscriptions ([subscriptions.ts](subscriptions.ts)), the response flags ([response.ts](response.ts)), the registry of live processors ([registry.ts](registry.ts)), the children with their monitor and checkpoint ([children/](children)) and the log ([logs/](logs)). Internal files do not define separate public module identities.

Read [architecture and lifecycle](../../../docs/architecture.md) and [mixin forwarding](overloads.md) before extending hooks or changing notification timing, and [the instructions of this directory](AGENTS.md) for the invariants a change must keep.
