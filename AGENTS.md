# dynamic-processor agent instructions

Canonical instructions for this independent repository and its descendants. Read the local README and relevant guides before changing code. This utility is authored with Beyond and must preserve its public package and module boundaries.

On 2026-09-22 the event emitter moved from an instance field to a prototype accessor. The mixin forwards prototype members only, so a subclass that emits an event of its own — `@beyond-js/finder` does — read `undefined` there and every such emit threw. Keep `_events` reachable through the prototype, and do not turn it back into an instance field.

**A repair here does not reach a consumer.** Packages resolves this package from the public registry, in its checkout and in an installation alike, and the toolchain installer does not pack it. Even the one path that copies a checkout into an image — the Packages bootstrap's prepack — serves the copy while the client that runs is still the published one. Delivering a change from here needs a new published version, which is an owner decision; until then, treat a fix in these sources as unexercised by anything that runs. The Beyond Suite record `docs/reviews/2026-09-22/packages-pages-editor-production-evidence.md` holds the evidence for that date; it is an optional external reference, not a link from here.
- Preserve the selected branch, existing changes and public identifiers. Do not commit, push, reset, deploy or publish without explicit authorization.
- Use English for first-party documentation, comments and explanatory text. Preserve functional strings and generated/vendor content.
- Keep documentation autonomous: relative links stay inside this repository; external packages are described as contracts with optional references.
- Preserve the existing module/object programming structure. Internal files are not automatically public modules. Keep bare public imports intact.
- Distinguish source behavior, known defects, proposed changes and executed validation. Documentation work does not authorize implementation changes, dependency installations or service startup.
- Validate links, anchors and formatting for documentation edits. Run tests appropriate to actual code changes only.
- Follow the [coding standards](docs/coding-standards.md); they are binding for new and modified code. Source files target 300 lines or fewer and must not exceed 400. Model each responsibility as a class that owns `#private` state and exposes simply named members, composed from collaborating objects. Avoid compound names in methods, properties, variables and parameters by giving the responsibility its own object: `client.register()`, not `registerClient()`. Compound names remain allowed in class definitions. Preserve public contracts, and do not rewrite untouched files only to comply.

Documentation follows [the local documentation standards](docs/AGENTS.md).

The coordinated working branch is `feature/next`. Its base preserves the selected TypeScript implementation; do not switch back to historical source branches for ordinary work.
