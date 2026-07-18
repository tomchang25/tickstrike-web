# Player Verbs and the One-Action Tick

Roadmap: [Tickstrike Web Port Roadmap](tickstrike_full_port_roadmap.md)
Reference baseline: [port-ref/tickstrike](../../../port-ref/tickstrike)

## Goal

Put the player on the shared Tick Arena command path. The player must move, perform a one-cell Normal Attack, and Dash before any enemy AI is added, so enemy behavior later consumes a stable action contract.

## Requirements

1. Support cardinal Move, Normal Attack, and cardinal Dash commands from the same arena screen.
2. Consume one action and advance one world tick for each accepted command; rejected commands do neither.
3. Make Normal Attack resolve against the selected adjacent cell and make Dash travel up to a fixed short range through legal cells.
4. Emit a small ordered result for command acceptance, player outcome, and tick advancement.
5. Keep aim/command interpretation outside the deterministic combat rules so the same commands can be driven by tests or browser input.

## Design

The command boundary is deliberately narrow:

```text
receive command -> validate -> apply player result -> advance tick -> publish snapshot/events
```

Move changes one cardinal cell. Normal Attack targets one adjacent cardinal cell and consumes its action even when the cell is empty. Dash moves the player through up to three legal cells in one cardinal direction, stops before an occupied or illegal cell, and consumes one action. Damage and enemy responses are added by the next plans, but the player result already contains the event seam they will use.

### Child Implementation Specs

| Child | Focus | Current document |
| --- | --- | --- |
| 03.1 | Pointer-driven Normal Attack aiming and Mobility preview without changing the command boundary | [Implementation Spec](port_03_1_pointer_input.implementation_spec.md) |
| 03.2 | Mobility selection, Dash traversal through enemies, and two-stage Smash preview/action | [Implementation Spec](port_03_2_mobility_switch_and_smash_preview.implementation_spec.md) |

## Non-Goals

1. Do not add Speed, class selection, artifacts, or advanced aiming to the deterministic Port 03 command contract; pointer aiming is owned by the separately scoped Port 03.1 child.
2. Do not add enemy decisions, telegraphs, or enemy damage in this plan.
3. Do not add production key repeat, settings, or modal input ownership.
4. Do not create separate Move, Attack, or Dash demo screens.

## Acceptance Criteria

1. The fixed scenario visibly supports Move, Normal Attack, and Dash from the same screen.
2. Legal commands advance the tick once; rejected commands leave the snapshot unchanged.
3. Dash never occupies an illegal or occupied cell and always produces a deterministic landing.
4. The focused logic assertions and one browser scenario observe the same command result and event order.
