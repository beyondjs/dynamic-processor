# Documentation instructions

These instructions apply to this directory and its descendants, together with the repository's root AGENTS.md.

- Write autonomous product and developer documentation. Explain purpose, responsibilities, public interfaces, setup where supported, execution flow, limitations and extension points directly. Keep source-review reports, session history, reviewer actions and temporary Git state out of maintained guides.
- Use English and the repository's established terminology. Distinguish implemented behavior, known limitations and proposed changes without narrating the investigation. Do not present a plan or source inspection as working runtime behavior.
- State the current meaning, responsibility and required action directly. When correcting terminology, replace the inaccurate wording in maintained explanations; remove correction narratives and obsolete synonyms from them. Use the established domain names consistently, verify them against public contracts and source, and distinguish packages, public modules and classes. Keep historical investigation details in evidence records only when they remain useful. Review the final text for clarity before reporting completion.
- Start with the reader's task and the component's role. Use consistent descriptive headings and filenames; link guides from the repository README or a local documentation index. Scale detail to the component rather than creating empty template sections.
- Keep every relative link inside this repository. A standalone clone must contain the explanations needed to understand and work on this component. Other repositories may be optional named references or verified external source links; never require a sibling checkout to read a guide, and never invent published links for local-only documents.
- Preserve public package/module identities and distinguish public modules from internal source files. Explain dependencies as contracts, not assumed directory layouts. Parameterize cross-repository execution examples with explicitly configured locations.
- Apply the root portability rule to guides and retained evidence; do not copy machine-specific paths from local diagnostics.
- Describe APIs and behavior with examples tied to source. Keep command prerequisites and expected results clear. Do not prescribe commands that are known not to work without stating the missing integration.
- Preserve useful legacy material and mark obsolete APIs or examples precisely. Leave generated/vendor material unchanged. Do not rewrite runtime code, install dependencies or run unrelated services for documentation cleanup.
- Validate local links, anchors and formatting for the actual edits. Keep external references accurate and treat tests as evidence only when actually executed. Required source-review provenance belongs in a separate review record, not repeated throughout architecture guides.

This directory contains durable maintained documentation only: contracts, architecture, reproducible guides, acceptance criteria and retained historical evidence. Put temporary handoffs, execution assignments, work queues and disposable session notes in a repository-root `docs-temp/` directory. Fixtures, builds and executable tests belong in their owning implementation or test directories, not in documentation.

Before a temporary document is retired, transfer decisions still in force, uncovered limitations and useful execution evidence to the appropriate maintained guide or review record, and repair references. Canonical guides must not require a removable handoff.

Historical review records belong under `reviews/`; preserve their evidence labels and separate them from maintained guides. Other repositories are optional external references, not relative links into sibling checkouts.
