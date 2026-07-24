# Tick Arena Action Points And Relative Timing

## Goal

Replace the Speed-meter free-action exception with explicit player rounds and Action Points so faster builds combine movement, attacks, and Mobility actions inside one readable decision window. Keep the arena's shared Tick and locked-Telegraph identity while making player input immediate, enemy timing round-relative, and bonus-action effects finite and auditable.

## Requirements

1. Every player round must begin with current AP equal to Max AP, with a base Max AP of one; legal movement, normal attacks, Dash, Smash preparation, and Smash release each cost one AP and resolve immediately, while aim changes, legal cancellation, and illegal inputs cost none.
2. The world must advance exactly once when AP reaches zero or the player explicitly ends the round, because AP actions are subdivisions of one player decision window rather than independent enemy-time advances.
3. Enemy attack warnings, enemy status and recovery, spawn timing, and player Mobility cooldowns must advance in completed player rounds rather than individual AP spends, so extra AP never accelerates or silently skips unrelated clocks.
4. The Speed meter and its periodic free move or attack must be removed; the same HUD region must instead show current AP, Max AP, and visually distinct overflow AP so the player always knows how many immediate actions remain before enemy time advances.
5. A stackable Action Point Major must grant one Max AP per stack, allow at most two stacks, and occupy one Legendary identity slot regardless of stack count; generic reward acquisition must enforce every artifact's authored stack cap so the two-stack limit is authoritative rather than presentational.
6. Chain Dash must trigger at most once per player round as one indivisible effect: the first qualifying Dash clears Dash cooldown and adds current Max AP to current AP without clamping, while later Dashes in that round receive neither benefit.
7. Player multi-stage actions must use the same explicit AP lifecycle as ordinary verbs: Smash preparation and release each cost one AP, preparation persists across rounds when necessary, and enough AP may complete both phases before the enemy phase.

## Design

### Player round lifecycle

A player round is an immediate, input-by-input sequence rather than a queued plan. Each legal verb resolves before the next input, allowing the player to react to movement, damage, Guard Break, death, and reward triggers without committing a speculative action script.

| Player input       |          AP cost | Round result                                                                   |
| ------------------ | ---------------: | ------------------------------------------------------------------------------ |
| Move one cell      |                1 | Resolve immediately; continue while AP remains.                                |
| Normal Attack      |                1 | Resolve immediately; continue while AP remains.                                |
| Dash               |                1 | Resolve movement and hits immediately; continue while AP remains.              |
| Smash Prepare      |                1 | Lock the target and preserve the prepared state until release or cancellation. |
| Smash Release      |                1 | Resolve the locked payload immediately; continue while AP remains.             |
| Aim or mode change |                0 | Never advances the round.                                                      |
| Legal cancellation |                0 | Clears the cancellable preparation without advancing the round.                |
| Illegal input      |                0 | Changes no combat state.                                                       |
| End Round / Wait   | All remaining AP | Discard the remainder and advance the world once.                              |

When AP reaches zero, the round ends automatically. A manual End Round discards all normal and overflow AP. Wave completion may close the round immediately once no encounter work remains, without running a meaningless enemy phase.

At the end of a player round, the final player position is published first, pending enemy attacks detonate against that position, enemy status and recovery advance, and each enabled enemy receives its enemy-phase opportunity. Attacks committed during that enemy phase begin their warning but cannot detonate until a later player-round ending. The next player round then advances existing player cooldowns once, resets per-round trigger gates, and restores current AP to Max AP.

### Relative clocks and Telegraph truth

An enemy warning value means the number of complete player-round endings before impact. A warning of one therefore grants the player the whole current AP budget to evade or counterattack, remains one throughout that round, and resolves only when the player ends the round or spends the last AP.

Moving onto or away from a Telegraph cell must refresh player-position-dependent presentation immediately even though the warning countdown does not change. Danger cells and locked footprints remain authoritative throughout the round; extra AP supplies more choices inside the warning window but never retargets a committed attack.

Player Mobility cooldowns count completed rounds, not AP actions. A cooldown created during a round remains at its authored value for the rest of that round and first decreases when the following player round opens after one enemy phase has passed.

### AP capacity, overflow, and the Action Point Major

All initial classes begin at one Max AP. The Action Point Major grants +1 Max AP per stack and has a hard stack limit of two, producing a maximum of three Max AP.

| Major stacks | Max AP | Newly enabled examples                                                             |
| ------------ | -----: | ---------------------------------------------------------------------------------- |
| 0            |      1 | Existing one-action rhythm; Smash Prepare and Release occupy separate rounds.      |
| 1            |      2 | Move then Attack, Attack then retreat, or Smash Prepare then Release in one round. |
| 2            |      3 | Three-step movement or a Move, Attack, retreat sequence.                           |

Repeated acquisition of the same Major consumes another Major reward opportunity but continues to occupy one Legendary identity slot in the run-wide cap. A third acquisition is never eligible and must also be rejected by authoritative acquisition even if a caller bypasses reward filtering.

Current AP may exceed Max AP when an explicit effect grants overflow. Overflow is fully usable during the current round, is shown separately from normal AP, and is discarded rather than carried into the next round.

### Chain Dash

Chain Dash qualifies only when the current Dash produces a kill, newly breaks Guard, or lands a back hit against a target that was not already Staggered. Merely hitting an already-Staggered target is not a fresh qualification, even if its static facing would otherwise label the hit as a back attack.

The first qualifying Dash in a player round applies the whole effect once: clear Dash cooldown and add Max AP to current AP after the Dash has paid its one AP cost. Multiple qualifying victims fold into the same single trigger. Every later Dash that round resolves normally and cannot clear cooldown or add AP through Chain Dash.

| Before Dash | After Dash cost | After Chain Dash |
| ----------- | --------------: | ---------------: |
| 1 / 1       |           0 / 1 |            1 / 1 |
| 2 / 2       |           1 / 2 |            3 / 2 |
| 3 / 3       |           2 / 3 |            5 / 3 |

The once-per-round gate resets only when the next player round begins. Manual round ending, death, run reset, and wave transition discard overflow and cannot carry a consumed or unconsumed Chain Dash trigger into another combat round.

### Presentation and action state

The former Energy HUD region becomes the AP truth display. Normal pips represent Max AP, differently colored overflow pips represent current AP above the cap, and the numeric fallback always permits values such as `3 / 2` or `5 / 3` without clipping or pretending the excess was clamped.

An optional afterimage may mark the player's round-start cell and an action trail may show cells already traversed, but these are history and orientation aids rather than a speculative queue or undo system. Input remains immediate and irreversible after each legal AP spend.

Player-round state, remaining AP, per-round trigger gates, and multi-stage commitments form one explicit action lifecycle. The implementation must not distribute round truth across unrelated hidden flags whose reset boundaries can disagree.

### Child overview

| Child | Focus                                                                                   | Current document |
| ----- | --------------------------------------------------------------------------------------- | ---------------- |
| 01    | Player round boundary, AP costs, and round-relative clocks                              | Not started      |
| 02    | AP HUD, Speed reward retirement, stack-cap enforcement, and Action Point Major          | Not started      |
| 03    | Chain Dash AP overflow and once-per-round behavior                                      | Not started      |
| 04    | Cross-system regression coverage for Smash, cooldowns, Telegraphs, waves, and run reset | Not started      |

Recommended landing order: establish the player-round and AP clock first; then land the separate enemy action commitment work against that stable round boundary; replace the Speed reward and HUD next; convert Chain Dash after AP and reward-stack truth exist; finish with cross-system regression coverage and balance observation rather than tuning unrelated stats during the cutover.

## Non-Goals

1. Do not replace the shared Tick with an initiative bar, continuous-time scheduler, or independently interleaved actor turns.
2. Do not add queued action planning, undo, speculative full-round simulation, or mandatory ghost-path confirmation.
3. Do not add a separate Preparation perk in this plan; Max AP is the first authored way to complete Smash preparation and release in one round.
4. Do not redesign normal attack footprints, Dash or Smash damage, enemy attack footprints, wave composition, or general player-versus-enemy balance.
5. Do not let ordinary rewards refund AP or create overflow unless a later named effect defines its own bounded trigger and reset contract.
6. Do not redefine the shipped enemy in-phase resolution order, Turn Order rail, or slot playback pacing; this plan's player round remains the Player slot at the head of the canonical sequence, followed by living action-capable enemies in stable spawn order.

## Acceptance Criteria

1. At one Max AP, every legal action ends the player round and preserves the existing one-action rhythm without any Speed-meter free action.
2. At two or three Max AP, the player may immediately combine movement, attacks, and Mobility phases until AP reaches zero, and enemies advance exactly once afterward.
3. A one-round enemy warning remains visually stable through every AP spend, updates its player-occupied presentation after movement, and detonates only at the player-round boundary.
4. Smash requires separate rounds at one Max AP but may Prepare and Release in one round when at least two AP are available.
5. Mobility cooldowns, enemy status and recovery, spawn timing, and other world clocks advance once per completed player round regardless of how much AP was spent.
6. The Action Point Major stops at two stacks, produces a maximum of three Max AP, and consumes one Legendary identity slot across both stacks.
7. A first qualifying Chain Dash produces the exact unclamped AP overflow and cooldown clear, while every later Dash in the same round receives neither effect.
8. Already-Staggered targets cannot sustain Chain Dash through their persistent state or facing, while kills, new Guard Breaks, and qualifying non-Staggered back hits still trigger it.
9. Round end, death, wave transition, and run reset discard overflow, restore the correct next-round AP, and clear every per-round trigger without leaking state.
