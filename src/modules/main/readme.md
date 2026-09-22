# Main module

The public `@beyond-js/dynamic-processor/main` module combines the mixin factory ([index.ts](index.ts)), the lifecycle implementation ([dp.ts](dp.ts)), the types of its public contract ([types.ts](types.ts)) and its collaborators: the attempts, their state and readiness ([attempts.ts](attempts.ts)), the completion announcement ([announcer.ts](announcer.ts)), the failure ([failure.ts](failure.ts)), the subscriptions ([subscriptions.ts](subscriptions.ts)), the response flags ([response.ts](response.ts)), the registry of live processors ([registry.ts](registry.ts)), the children with their monitor and checkpoint ([children/](children)) and the log ([logs/](logs)). Internal files do not define separate public module identities.

Read [architecture and lifecycle](../../../docs/architecture.md) and [mixin forwarding](overloads.md) before extending hooks or changing notification timing, and [the instructions of this directory](AGENTS.md) for the invariants a change must keep.
