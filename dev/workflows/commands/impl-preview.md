# impl-preview — confirm the executor's implementation plan before coding

Have the executing agent re-read an approved implementation spec — or a sketch that is already spec-equivalent — against the live codebase and report the concrete implementation plan it intends to follow, so the user can catch problems while the work is still abstract before any code is written. This gate is most valuable for frontend, VFX, layout, motion, and other conceptual changes whose result a written spec cannot fully pin down. On confirmation, the same agent proceeds to implement.

This command is read-only until the user confirms. Do not edit source, stage changes, commit, run mutating formatters, or implement the work during the preview. It does not write, rewrite, or replace the spec; the spec is authority, not a draft to revise.

## Position In The Lifecycle

`impl-preview` runs after `/spec-build` — or after an equivalent approved sketch — and before implementation. It is the executor's pre-flight gate, not a spec-authoring step:

```text
Implementation Spec (or spec-equivalent sketch)
-> /impl-preview   (executor reports its plan; user confirms)
-> Implementation
```

It does not resolve product decisions (that is `/spec-discuss`) and does not produce the spec (that is `/spec-build`). The typical hand-off is one agent authoring the spec and a different agent executing it: `impl-preview` is where the executing agent earns a final human sign-off on its concrete plan before it touches code.

## Input

```text
/impl-preview <implementation spec, spec-equivalent sketch, or target>
```

The target is normally an approved `.implementation_spec.md`. A sketch is acceptable only when it is already detailed enough to serve as the executable handoff. Decisions confirmed earlier in the current conversation are part of the input.

## Required Reading

Before previewing, read:

1. `dev/agent_rules/agent_startup.md` and every trigger it fires for the target's domain.
2. `dev/foundation/core/workflows/implementation_spec_standard.md`, to know what the spec is contractually promising.
3. The target spec (or sketch) and its parent plan, when either exists.
4. `dev/standards/verification_tiers.md` and every request-relevant rule, standard, system doc, or skill discovered from the target, including the applicable gameplay/presentation, palette, or sprite-animation standards.

## Steps

1. Restate the work in one compact sentence and name the target document and its lifecycle type.
2. Confirm the target is an approved, decision-complete handoff. If it still carries open product, scope, compatibility, or numerical questions, stop and direct the user to `/spec-discuss` or `/spec-build` instead of previewing an implementation.
3. Re-read the live code across the full blast radius independently of the spec: current ownership, call direction, data flow, lifecycle and presentation hooks, cleanup paths, tests, and the surface the work will change. Treat any codebase coordinates written in the spec as provisional and verify each one.
4. Build the concrete implementation plan the executor intends to follow: the files it will touch and why, the shape it will produce and the wrong shapes it will avoid, the integration points and landing order, and the smallest verification that will prove the change per `dev/standards/verification_tiers.md`.
5. For abstract visual work — frontend, VFX, layout, motion — make the plan concrete enough to judge early: state the intended visual result in words, the reference it matches, the parameters and timings it will use, and how it will be validated (a targeted Playwright screenshot to the scratchpad, a unit test, or other evidence). Do not rely on the spec's prose alone when the result is judged by eye.
6. Surface every place the live code contradicts the spec, or where the spec underspecifies something that changes observable behavior. Present each as a blocking item for the user, never as a silent deviation.
7. Present the plan for confirmation. Do not begin implementation until the user confirms. On a confirmed conflict, route back to the spec — via `/spec-build` or conversation — rather than improvising a fix during implementation.

## Output

Unless the user specifies another language or level of detail, write the report in Traditional Chinese (繁體中文) and in plain, non-technical language (白話): explain what the change will do and where the risk is in terms a non-engineer can follow, rather than dumping API shapes, type signatures, or a file-by-file technical inventory. Keep code identifiers and file paths exact even inside the plain-language prose. Use only the sections needed from this shape:

1. **Target** — the spec or sketch under preview and its lifecycle type.
2. **Codebase Fit** — how the live code constrains the work, organized by system relationship rather than as a file inventory; call out every verified deviation from the spec's coordinates.
3. **Implementation Plan** — the concrete steps, files, shapes, ordering, and integration points the executor will follow, with the intended visual result and validation approach spelled out for abstract work.
4. **Risks & Open Conflicts** — spec-versus-code conflicts, underspecified visuals, or hazards the user should resolve before coding. Omit when none remain.
5. **Confirmation** — a plain request to confirm or adjust the plan before implementation begins.

## Guardrails

- Read-only until confirmed. Do not implement, stage, commit, or run mutating formatters during the preview.
- Do not rewrite, replace, or "improve" the spec. If it is wrong, surface the conflict and stop.
- Do not reopen decisions already locked by the spec or the conversation merely because another implementation is possible.
- Do not turn spec-author or executor technical choices into user questions; surface only conflicts and choices that change observable behavior, scope, or numerical meaning.
- Do not run the full browser suite. Use the targeted verification named by `dev/agent_rules/test_operations.md` when evidence is needed, and only when the preview genuinely requires it.
- Keep unrelated user changes untouched.

$ARGUMENTS
