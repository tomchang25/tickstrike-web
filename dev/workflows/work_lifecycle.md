# Tickstrike Web Work Lifecycle Addendum

Canonical owner: `dev/foundation/core/workflows/work_lifecycle.md`

This project-local addendum refines the shared lifecycle for the ordered port plans. It does not replace the shared lifecycle or create a second lifecycle state machine.

## Draft Implementation Specs

For a parent plan with several ordered children, the project may prepare implementation specs for all children before the first child is implemented. These files are planning artifacts, not executable handoffs.

- A draft implementation spec uses the normal `.implementation_spec.md` filename and structure.
- The document must include `Status: Draft implementation spec` immediately after the parent marker.
- The parent plan links to the document as `Draft Implementation Spec`, not as an implementation-ready handoff.
- Draft specs do not receive TODO entries and do not make later children actionable before their landing order.
- A draft spec may be revised in place as earlier children change the live codebase.
- Before implementation, the next draft must be re-read against the live codebase, its status must be promoted to `Implementation spec`, and the parent link must identify it as the sole executable handoff.
- A draft may contain no unresolved product, compatibility, scope, or numerical decisions; draft status only records that later codebase verification and remapping remain required.

When a draft becomes executable, remove its `Status: Draft implementation spec` line, update the parent link, and search for stale sketch or competing-handoff references. The normal implementation, verification, and closeout gates remain unchanged.
