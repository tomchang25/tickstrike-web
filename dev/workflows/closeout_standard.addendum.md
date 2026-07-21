# Tickstrike Web Closeout Addendum

Canonical owner: `dev/foundation/core/workflows/closeout_standard.md`

This project-local addendum refines how a shipped plan child is recorded in its parent plan's child overview. It supersedes one specific instruction of the shared closeout standard; every other closeout obligation (history entry, spec archival, forward-work pointer, inbound-reference lifting) is unchanged.

## Superseded Rule

The shared Child Closeout step "Remove the child from the parent overview instead of retaining a checked row" (and the matching "Remove the shipped child from the parent overview" gate in `work_lifecycle.md`) is replaced for this project by the retention rule below. The equivalent flow-closeout instruction to strip shipped rows is likewise replaced.

## Retention Rule

When a plan child ships:

- Keep the child's row in the parent plan's child overview. Its Child and Scope columns stay verbatim, so the plan retains the durable record of what was delivered and against which spec.
- Remove only the ref link from the Handoff cell. Replace the `[label](location)` link with plain text that names the spec and marks it shipped (for example `Shipped — port_11_02_windup_cancel.implementation_spec.md`).
- Never re-point the Handoff link at the archived path. Archived specs may be moved or deleted at any time, so a link into the archive is a dead reference waiting to happen; the plain-text spec name carries the record without a breakable link.

The spec file is still archived per the shared standard; only the plan's presentation of the shipped row changes. A row that has not shipped keeps its normal live link to the executable handoff.
