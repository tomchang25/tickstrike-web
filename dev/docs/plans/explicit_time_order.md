# Explicit Time Order

## Goal

Make the within-tick resolution order an explicit, player-visible contract: one canonical actor sequence per tick, resolved linearly and displayed as an order bar. Interrupt mechanics (a charge push cancelling another enemy's windup) currently expose the hidden intra-tick order as apparent randomness — "the interrupt sometimes works" — and any fix built on priority tiers nests indefinitely once interrupters can interrupt each other. A single visible order dissolves both problems: an interrupt simply affects whatever has not yet resolved, and the player can read that from the bar.

## Requirements

1. Exactly one canonical actor order per tick: the Player first, then every living, action-capable enemy in stable spawn order. This order is the only intra-tick ordering truth. It supersedes the "wound up first hits first" simultaneous-detonation rule introduced by the charge enemy rework, because a displayed order and a different resolution order would make the bar lie.
2. Every enemy resolves all of its per-tick activity at its own slot — warning countdown, retargeting, detonation, stagger/protection/recovery/rest advancement, decision, and movement — against the live state produced by earlier slots. An entity displaced, interrupted, or killed by an earlier slot simply is that changed thing when its own slot arrives; there is no lookahead and no priority tier, so interrupt chains are well-founded by construction.
3. The order bar shows a single segment: a Player icon at the head, then one icon per living enabled enemy in slot order. Membership is unconditional — an enemy with nothing visible to do this tick still holds its slot, shown dimmed with a status badge — because conditional membership would require predicting outcomes. A second forecast segment is deliberately omitted: with unconditional membership and stable order it would repeat the same cast and carry no information.
4. The bar states order, never predicted outcomes, and updates only reactively as resolved events play back: the active slot highlights both the bar icon and the arena entity, a finished slot pops, death removes icons, an interruption re-badges the victim's icon the moment the interrupting event plays, and the emptied bar refills with the current living cast at the tick boundary. Hovering an enemy in the arena highlights its bar icon and vice versa.
5. Logic resolves instantly at the player-round boundary; the bar and all per-slot animation are playback of the already-resolved event stream, so determinism, replay, and input fast-forward are unaffected by any pacing choice.
6. Slot playback pacing is a player setting: the default staggers slot starts by 0.1 s with animations allowed to overlap, and an alternative waits for each slot's VFX to finish. Player input fast-forwards all remaining playback. No-op slots consume near-zero playback time so idle-heavy casts do not drag the segment.

## Design

### Canonical order and slot resolution

The order for a tick is the Player followed by the living enabled enemies in spawn order. Death is the only thing that removes a slot mid-tick; a newly spawned enemy joins the order at the next tick boundary.

Interrupts need no special ordering rule. A charge that detonates at slot N pushes and cancels victims regardless of their slot; a victim whose slot already resolved this tick has simply already acted, and a victim whose slot is still pending resolves from its interrupted state (recovering, no telegraph). If a future enemy can interrupt the charger, it is the same rule applied from an earlier slot — nothing nests.

Worked example — a Bomb ordered after a Charge, both due to detonate the same tick, with the Charge's path crossing the Bomb:

- The bar shows `[Player][Charge][Bomb]` in both branches and predicts neither.
- Player kills the Charge: its icons vanish when the kill resolves; the Bomb detonates at its own slot.
- Player does not kill the Charge: the Charge detonates at its slot, the push interrupts the Bomb, whose icon re-badges to recovering immediately; when the Bomb's slot arrives it plays a recovery beat instead of an explosion.

Reasoning about that difference — "kill the Charge to let the Bomb go off" — is exactly the tactical read this system exists to give the player; the bar supplies the order, the arena telegraphs supply the intent, and the deduction stays with the player.

### Order bar behavior

The active slot is highlighted in both the bar and the arena while its events play, then pops. Icons carry live state: dimmed plus a badge for recovering, resting, staggered, or mid-windup enemies (including the remaining warning count, which ticks down during that enemy's own slot playback, not in a batch at the segment end). When the segment empties and control returns to the Player, the tick counter updates and the bar refills from the current living cast — this refill is the visible tick boundary.

### Pacing

| Setting             | Behavior                                                               |
| ------------------- | ---------------------------------------------------------------------- |
| Staggered (default) | Each slot's playback starts 0.1 s after the previous one; VFX overlap. |
| Wait for VFX        | The next slot starts only after the previous slot's VFX completes.     |

In both modes player input fast-forwards every remaining slot instantly, and no-op slots (nothing visible happened) flash through in near-zero time while keeping their icon in the bar.

### Child overview

| Child | Focus                                                                                       | Current document                                                       |
| ----- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 01    | Linear slot resolution: one canonical order, per-slot enemy resolution, retire commit-order | `explicit_time_order_01_linear_slot_resolution.implementation_spec.md` |
| 02    | Order bar UI, per-slot staggered playback, pacing setting, hover cross-highlight            | Not started (spec after 01 ships)                                      |

Landing order: 01 before 02 — the bar can only display a truthful order after the logic holds exactly one. Baseline: the charge enemy rework (uniform side push, displacement interrupt, claimed targets) lands before child 01; its displacement interrupt is the mechanic this plan makes legible, and its commit-order detonation rule is what child 01 replaces.

## Non-Goals

1. No Speed or initiative system and no reorder mechanics; the order is stable spawn order. If reordering is ever added, it must come from discrete evented causes and committed warnings must stay round-denominated, but none of that is designed here.
2. No interleaved player slots (the original Godot-style timeline). The Player acts once, at the head of the sequence; multiple player actions per round belong to the Action Points plan.
3. No forecast segment and no outcome prediction anywhere in the bar.
4. No changes to windup durations, damage, movement rules, or any authored balance numbers.
5. No changes to what any enemy decides or does — only to when within the tick it resolves and how that is shown.

## Acceptance Criteria

1. Same-seed runs remain byte-identical, and within a tick every enemy's events resolve grouped at its own slot in the canonical order.
2. Simultaneous detonations resolve in bar order; the displayed order and the resolution order can never disagree.
3. The Bomb-after-Charge worked example resolves as specified in both player branches, and the outcome difference is readable from the bar plus arena telegraphs alone.
4. Bar membership is unconditional with reactive updates only: pops on completion, removal on death, re-badging on interruption, refill at the tick boundary, hover cross-highlighting in both directions.
5. The pacing setting switches between staggered and wait-for-VFX playback, input fast-forward works in both, and no-op slots do not visibly stall the segment.
6. Existing per-enemy transition rules — which activity transitions allow acting in the same tick — are preserved exactly.
