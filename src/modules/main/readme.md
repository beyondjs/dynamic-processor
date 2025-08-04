# Dynamic Processor Module

This module implements a dynamic, reactive processing system where each unit ("Dynamic Processor") can register
dependencies, react to changes, and automatically re-process its state. It's designed for modular, extensible, and
asynchronous workflows such as compilers, build pipelines, or reactive graph structures.

## Architecture Overview

At its core, a **Dynamic Processor** (`DP`) is an object that:

-   Has an identity (`dp`, `id`)
-   Can register children (dependencies)
-   Monitors changes in children
-   Reacts to changes through automatic re-processing
-   Emits events for observers
-   Logs activity for debugging and performance analysis

It behaves like a **reactive node in a dependency graph**, automatically recalculating when its inputs (children)
change.

---

## Core Components

### `DynamicProcessor` (Factory Function)

Creates a dynamic class that can extend any base. You must implement:

-   `dp: string` — Identifier of the processor.
-   `_prepared(require): boolean | string` — Called before processing; must declare required children.
-   `_process(request): Promise | void` — Actual async processing logic.
-   `_notify()` — Called when changes occur and the DP is ready.

Optional lifecycle:

-   `initialise()`, `destroy()`, `ready`, `waiting`, `processing`, etc.

### `Children`

Manages registered and required children of a `DynamicProcessor`. Includes:

-   `Registered`: Map of named children.
-   `Required`: Track children needed during `_prepared()`.
-   `Monitor`: Observes state and triggers reprocessing.

### `Registered`

Handles actual storage and conflict detection of children.

```ts
children.register(Map<string, { child: DynamicProcessorInstance }>);
```

🔹 Required

Stores temporary required children during the preparation phase.

🔹 Monitor

Observes children’s status and notifies when all are ready for the parent to process.

🔹 validate-child.ts

Ensures that any registered child adheres to the expected DynamicProcessor shape.

🔹 logs.ts

Appends structured log entries to .beyond/dps/ for debugging. Automatically buffers until stream is ready.

## Processing Lifecycle

```ts
flowchart TD
    A[Initialise DP] --> B[_prepared()]
    B --> C{All children ready?}
    C -- No --> D[Wait for children]
    C -- Yes --> E[_process(request)]
    E --> F[_notify()]
    F --> G[Emit 'change' event]
```

    •	require(dp, id) is used in _prepared() to declare dependencies.
    •	Children call the parent back when ready.
    •	Parent re-processes once all required nodes are ready.

## Usage Example

```ts
class MyProcessor extends DynamicProcessor() {
	get dp() {
		return 'my-processor';
	}

	_prepared(require) {
		require(otherProcessor, 'other-id');
		return true;
	}

	async _process() {
		// Your processing logic here
	}

	_notify() {
		console.log('MyProcessor has changed');
	}
}
```

Use Cases • Dependency-aware task runners • Build tools and bundlers (like BeyondJS) • Asynchronous pipelines • Modular
system orchestration

Development Notes • All components are written in TypeScript. • Strict typing is enforced. • Avoid using require(...) —
prefer import. • Logs are written to disk by default, under .beyond/dps/.

## Folder Structure

```ts
modules/
└── main/
    ├── dynamic-processor/     # Entry point (index.ts)
    ├── children/
    │   ├── registered.ts
    │   ├── required.ts
    │   ├── monitor/
    │   └── validate-child.ts
    └── logs/
        └── logs.ts
```

⸻

📜 License

MIT
