# Tickstrike Web Implementation Spec Addendum

Canonical owner: `dev/foundation/core/workflows/implementation_spec_standard.md`

This project-local addendum refines the shared implementation-spec artifact for Batch Plans that are intentionally prepared before their earlier children land. It does not copy or replace the shared structure.

## Draft Status

An implementation spec may be authored as a draft when the product behavior is locked but its code coordinates may be invalidated by earlier child implementations.

- Put `Status: Draft implementation spec` immediately after `Parent Plan: ...`.
- Keep the full shared sections: Goal, Summary, Relational Context, Scope, Files to Change, Execution Outline, Implementation Notes, Edge Cases, and Acceptance Criteria.
- Use current codebase evidence for the draft instead of copying coordinates from the sketch.
- State the expected dependency on earlier children in Relational Context and Execution Outline.
- Do not include an `Open Questions` section. Technical remapping is expected during promotion; unresolved behavior decisions are not allowed.
- Mark the parent child overview link as `Draft Implementation Spec` while the file remains draft.

Promotion removes the draft status, rechecks every file and relationship against the live codebase, updates changed coordinates, and changes the parent link to `Implementation Spec`. A draft file is not an authorization to implement and must not be treated as the current executable handoff.
