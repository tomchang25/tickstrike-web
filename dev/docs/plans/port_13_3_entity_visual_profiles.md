# Port 13.3 Entity Visual Profiles

Parent plan: [Reference Visual Parity and Presentation Polish](port_13_visual_parity_and_polish.md)
Acceptance-target authority: [Port 13 Reference Parity Matrix](port_13_reference_parity_matrix.md), "Entity presentation (13.3)"

## Goal

Own every entity-attached animation surface of Port 13: the uniform drop shadow (P2), the ranged rescale and redraw (L2), the player attack/weapon and dash states (P5), the Bomb and Charge prepare/execute body animations (P6), and the per-role Mobility-kill body-split terminals (L3, moved here from 13.4). The boundary with child 13.4 is entity versus world: animation on an entity's own body belongs here; effects over telegraph cells, movement paths, or the board belong to 13.4.

## Requirements

1. Every player and enemy entity casts a soft elliptical drop shadow beneath its footprint, produced by one shared implementation rather than per-role art, because P2 mandates a single uniform shadow node per entity.
2. The shadow is hidden while an entity plays its in-water drowning animation, because the authored splash frames sit on the waterline and a ground-contact shadow would contradict them.
3. The ranged enemy renders at the same presentation scale as every other small enemy, visually equal in footprint, removing its current oversize override.
4. The ranged enemy's base sprite sheet is redrawn so its left and right silhouettes read clearly at the shared scale. The redraw is drafted programmatically through a deterministic offline script and requires human visual approval before it ships, per L2.
5. The drowning animation sheet derived from the redrawn base sheet is regenerated through its already-approved recipe and receives a fresh human visual review before shipping, because a new source produces new visuals even under a frozen recipe.
6. The player's attack presents the reference's character attack animation together with a synchronized weapon slash animated sprite, reopening the earlier preserve-as-is decision by product choice (P5).
7. Dash prepare (active while the player aims in the alternate input mode) and dash execute each present their own authored player state built on a sword-draw concept — a held, ready-to-draw stance for prepare and the draw-cut for execute — with the weapon possibly authored as a separate synchronized sheet like the attack weapon. This is new content above the reference, which has no dash-specific sprites.
8. Bomb presents an authored looping self-destruct-prepare animation and a detonation-execute body animation; Charge presents an authored looping charge-prepare animation and a charge-execute body animation (P6). These replace the plain squash/pop poses for those states on those two roles only; the shared action-feedback tweens stay untouched everywhere else.
9. Every enemy role presents a per-direction Mobility-kill body-split terminal animation through the existing terminal lifecycle (L3), and the semantic event stream gains the minimal death-cause distinction presentation needs, because presentation must never infer a Mobility kill from damage values, artifact state, or timing.
10. The shipped knockback-into-water drowning animation is confirmed present and unchanged for every role (L4); no new drowning work.
11. All preserve rows of the 13.3 matrix section stay intact: Thrust/Slash/Charge/Bomb identity, directional facing, the remaining action-feedback poses, and enemy status bars.

## Design

The shadow is a uniform dark ellipse seated at each entity's ground-contact line, identical in shape and opacity across roles. It lives inside the entity's animated presentation node, so it inherits the role's squash-and-stretch action poses and stays glued to the body during move, prepare, and commit feedback — a decision resolved in conversation, chosen for consistency with the player's existing shadow. Entities rendered by the placeholder fallback card (no authored presentation) receive no shadow.

The rescale and the redraw land together as one child, never separately: shrinking the current sheet first would make the already-thin side frames even harder to read, and shipping a redraw at the oversize scale would misstate the approved footprint. The redraw keeps the sheet's four-direction, four-pose layout, the existing palette identity, and binary transparency; its content goal is a thicker, readable side silhouette and an effective body footprint that matches the other small enemies at the shared scale.

Animated states: the presentation layer currently plays single frames per pose plus the frame-played drowning sheets. Children 13.3c and 13.3d introduce authored multi-frame body states — looping prepare loops and finite execute animations — so whichever of the two lands first builds the shared frame-playback capability and the other reuses it. Every new or derived sheet goes through the deterministic offline pipeline with human visual approval before shipping, the same gate discipline as the ranged redraw.

Dash prepare is driven by the input-side aim state that already drives the aim preview, not by any new gameplay state; dash execute is driven by the accepted dash action. Prepare loops on Bomb and Charge are driven by the telegraphing activity already present in the snapshot; their execute animations are driven by the existing commit/detonation events. None of these change command acceptance, damage, occupancy, or timing.

The body-split terminals reuse each role's base sheet — for the ranged role the redrawn sheet from 13.3b, which must therefore land first — authored as recipes in the offline pipeline and routed through the existing terminal animation lifecycle. Because the live death event carries no cause, 13.3e also introduces the smallest semantic death-cause distinction; that is a core event-contract change, so it changes the recorded event stream deliberately (goldens regenerate with line-by-line review) and needs the stricter review tier the project reserves for event contracts, not a content-only pass.

Two human approval gates recur across the children and cannot be self-approved by an implementation agent: every redrawn or newly authored base sheet before it replaces or enters the runtime assets, and every regenerated derived sheet before its assets are swapped.

### Child decomposition

| Child | Focus                                                                                | Current document form                                                                                              |
| ----- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| 13.3a | Shared entity drop shadow                                                            | Shipped — port_13_3a_entity_drop_shadow.implementation_spec.md                                                     |
| 13.3b | Ranged base-sheet redraw and shared-scale alignment                                  | Shipped — port_13_3b_ranged_redraw_and_rescale.implementation_spec.md                                              |
| 13.3c | Player attack + weapon slash animation and dash prepare/execute states               | Shipped — delivered through the action-presentation catalog and dev Action Lab; no implementation spec             |
| 13.3d | Bomb and Charge prepare loops and execute body animations                            | Plan child; spec when next to implement                                                                            |
| 13.3e | Mobility-kill body-split terminals, death-cause semantics, and drowning confirmation | Plan child; spec when next to implement — requires 13.3b                                                           |

Recommended landing order is 13.3a, 13.3b, 13.3c, 13.3d, then 13.3e. Hard constraints: 13.3e requires the redrawn ranged base sheet from 13.3b; 13.3c and 13.3d share the new frame-playback capability, so whichever lands first builds it and the other must reuse it rather than fork it.

## Non-Goals

1. No world-space or telegraph-cell effects: telegraph markers, the ranged source-to-landing line, the bomb per-cell area explosions, charge movement VFX, hit-result bursts, Smash, Major triggers, deny/swing feedback, and audio all belong to child 13.4.
2. No reward surface or HUD restyling — that belongs to child 13.5 or is preserve-as-is.
3. No gameplay or balance changes. The single permitted core change is the minimal death-cause semantic in 13.3e, which must not alter damage, occupancy, command acceptance, or timing.
4. No palette system or fixed-palette variant changes; redraws keep their existing palette identities.
5. No Mode or Mode Boss presentation; that content stays omitted.
6. No Chain Dash lightning or free-Dash aura content; those remain deferred with their gameplay route (L5).

## Acceptance Criteria

1. Every live player and enemy on land shows a uniform drop shadow beneath its feet, and the shadow disappears during the drowning animation.
2. The ranged enemy is visually the same size as the other small enemies and its left/right facings are readable at gameplay zoom without debug labels.
3. Every redrawn base sheet, newly authored sheet, and regenerated derived sheet received explicit human visual approval before shipping.
4. Player attacks show the character attack animation with a synchronized weapon slash; aiming in the alternate mode shows the sword-draw prepare stance; an executed dash shows its draw-cut state.
5. Bomb visibly loops its self-destruct windup and plays a detonation body animation; Charge visibly loops its charge windup and plays an execute body animation; both remain distinguishable from their idle and move states.
6. Every enemy role killed by player Mobility plays its per-direction body-split terminal animation, selected from explicit death-cause semantics rather than presentation heuristics, and terminal cleanup leaves no pending timeline, callback, or orphan visual.
7. Drowning remains the shipped per-direction eight-frame animation for every role.
8. Thrust, Slash, Charge, and Bomb identity, facings, remaining action poses, and status bars are unchanged.
9. The same deterministic scenario produces the same accepted commands, damage, occupancy, and timing; the recorded event stream changes only by the deliberately added death-cause data, regenerated in the goldens with review.
