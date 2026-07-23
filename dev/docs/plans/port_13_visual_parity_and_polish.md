# Reference Visual Parity and Presentation Polish

Roadmap: [Tickstrike Web Port Roadmap](tickstrike_full_port_roadmap.md)
Reference baseline: [port-ref/tickstrike](../../../port-ref/tickstrike)

## Goal

Close the remaining visual and presentation gap between the Web Tick Arena and the shipped reference project. This plan turns the reference project's actual board, terrain, entity, HUD, feedback, and audio surface into an audited Web-native presentation target instead of relying on screenshots or placeholder geometry alone.

## Requirements

1. Audit the reference project before implementation and record every shipped visual surface, asset dependency, animation state, audio event, and user-facing overlay with a Web parity status and an observable acceptance target.
2. Replace placeholder arena geometry with a reference-aligned layered tile presentation, including the board footprint, land and water treatment, edges, transitions, decorations, depth ordering, camera framing, and cell-scale behavior.
3. Replace placeholder entity cards with authored player, enemy, and boss presentation profiles that preserve role identity, facing, footprint, shadow, animation state, and terminal feedback without moving gameplay ownership into presentation.
4. Present movement, attack preparation, Telegraphs, projectiles, impacts, damage, Guard, Stagger, death, drowning, spawn, reward, and terminal events with coherent timing and feedback driven by semantic snapshots and events.
5. Rebuild the player-facing HUD, wave and reward surfaces, run result overlays, debug boundary, and input affordances around the existing runtime while preserving the separation between React UI and Pixi combat rendering.
6. Validate the resulting presentation against the reference at supported desktop and narrow viewport sizes, including reduced motion, focus loss, reset, route replacement, visibility changes, renderer teardown, and a reliable idle boundary.

## Design

Port 13 starts with a reference audit rather than asset implementation. The audit must inspect the reference project's actual source and packaged dependencies, including:

- Arena composition: the reference 12 by 12 board and 10 by 10 land region are the audited baseline. By product decision the Web target diverges to a widescreen 18 by 12 grid holding a 14 by 8 centered land island with a 2-cell water ring, plus land and water layers, tile transitions, edge treatment, decorative props, camera framing, and grid readability. The board-shape change is a core geometry change, not presentation alone.
- Entity surface: Ninja, Viking, Thrust, Slash, Ranged, Charge, Bomb, Mode, and Mode Boss identity, directional views, animation states, shadows, health or Guard indicators, and terminal states.
- Combat feedback: aim previews, attack cells, locked Telegraphs, movement trails, projectile or charge feedback, impacts, Guard break, Stagger, damage numbers, drowning, and spawn warnings.
- Shell surface: player resource bars, wave state, artifact strip, reward cards, build inspection, demo completion, death/restart results, settings, and debug affordances.
- Audio surface: player actions, enemy feedback, Mobility windup and impact, reward and terminal feedback, browser unlock, rate limits, volume control, and teardown.

The audit separates four decisions for every reference item: preserve as parity behavior, reproduce as Web-native presentation, intentionally omit with a documented reason, or defer behind an approved product decision. Godot scenes, node ownership, lifecycle callbacks, resource paths, and engine-specific APIs are evidence sources only; they are not porting contracts.

### Presentation priorities

1. Match the board silhouette, tile layering, camera scale, and overall color/value composition before tuning individual effects.
2. Match player and enemy silhouette, scale, anchor, facing, and state readability before adding secondary particles.
3. Match Telegraph, attack, damage, death, and reward timing before adding decorative polish.
4. Match HUD hierarchy and responsive behavior before adding optional settings or debug decoration.

Every priority must retain the same deterministic scenario and semantic event stream. Visual timing may be tuned independently, but it must not alter command acceptance, damage, occupancy, Telegraph lifetime, Tick advancement, or terminal cleanup.

### Locked pre-audit decisions

The following product decisions were resolved in conversation before the audit and enter the parity matrix as pre-approved rows. Child 13.1 records them; it must not reopen them.

1. Externally approved polished pixel-game references set the quality bar for arena framing, edge decoration, and color composition; the reference project remains the only parity source for behavior, layout, and timing.
2. The ranged enemy currently renders visibly larger than the other small enemies and its side-facing frames are too thin to read. Child 13.3 rescales it to the shared small-enemy presentation scale and replaces its base sheet with a programmatically drafted redraw; every redrawn base sheet requires human visual approval before it ships.
3. Every enemy role receives a Mobility-kill terminal animation in which the body is cut in half, authored per direction through the offline sprite animation pipeline as a recipe over that role's existing base sheet. This lands in child 13.3 on the existing terminal animation lifecycle (moved from 13.4 by the later entity-versus-world ownership decision; the decision content is unchanged).
4. The knockback-into-water drowning animation is already shipped for every current enemy role; the audit records it as satisfied rather than re-scoping it.
5. Chain Dash lightning and Speed-funded free-Dash aura effects are excluded from the parity target and tracked as a future draft, because Chain Dash itself is deferred content awaiting its route rework.
6. The wave reward choice surface is placeholder quality and is rebuilt in child 13.5. All other shipped HUD surfaces are audited but pre-decided as preserve-as-is for the parity target; restyling them is out of scope for this plan.

### Child decomposition

| Child | Focus                                                          | Current document form                                                                                                                                                                  |
| ----- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 13.1  | Reference inventory and parity matrix                          | Shipped — port_13_01_reference_inventory_and_parity_matrix.implementation_spec.md; acceptance targets live in [port_13_reference_parity_matrix.md](port_13_reference_parity_matrix.md) |
| 13.2  | Layered arena and tile presentation                            | Shipped — port_13_2_layered_arena.md; optional water ripple and decoration-quality rework remain in the Port Draft                                                                     |
| 13.3  | Player and enemy visual profiles                               | Sub-plan: [port_13_3_entity_visual_profiles.md](port_13_3_entity_visual_profiles.md) (children 13.3a–13.3d shipped; 13.3e remains)                                                     |
| 13.4  | Combat feedback, audio, and terminal presentation              | Sketch: [port_13_04_combat_feedback_and_terminal.sketch.md](port_13_04_combat_feedback_and_terminal.sketch.md)                                                                         |
| 13.5  | Reward surface, responsive layout, and visual regression gates | Sketch: [port_13_05_reward_surface_and_regression.sketch.md](port_13_05_reward_surface_and_regression.sketch.md)                                                                       |

Recommended landing order is 13.1, 13.2, 13.3, 13.4, then 13.5. Child 13.1 may update the scope and acceptance targets of later children, but it must not introduce a second runtime or alter deterministic gameplay rules.

Child 13.2 shipped the 18×12 geometry, layered terrain, scale-to-fit camera, world-space decorative frame, subsequent walled-contour shore and static wall reflections, and actor-to-grid alignment correction. The optional water ripple and further decoration-quality rework remain deferred in the Port Draft rather than keeping the completed sub-plan active.

Child 13.3 is promoted to its own sub-plan, [port_13_3_entity_visual_profiles.md](port_13_3_entity_visual_profiles.md), owning every entity-attached animation surface across five children: 13.3a shared drop shadow and 13.3b ranged redraw plus rescale (pre-authored specs), 13.3c player attack/weapon and dash states, 13.3d Bomb and Charge prepare/execute body animations, and 13.3e Mobility-kill body-split terminals with the minimal death-cause semantics. The ownership boundary with 13.4 is entity versus world: animation on an entity's own body belongs to 13.3, effects over cells, paths, or the board to 13.4. Authored and derived sheets carry mandatory human approval gates.

Interior obstacle cells (water-obstacle and rock-obstacle, with attack-passability and drown semantics) are a new gameplay feature, not part of 13.2; they are tracked under the Future Draft Stable-Base Obstacles item and land the clean 14×8 island first.

The parity matrix owns the observable acceptance target for every audited surface across children 13.2–13.5. Four post-audit product decisions recorded there raise several targets above literal reproduction: telegraph danger cells use authored sprite markers rather than tile-color fills, entities gain a shared-node drop shadow, a decorative outer frame is added, and all combat feedback is authored as sprite animation or industry-grade VFX rather than a port of the reference's grey-box tweens.

## Non-Goals

1. Do not add new gameplay mechanics, balance changes, enemy behaviors, reward effects, or progression systems as part of visual parity.
2. Do not reproduce Godot scene inheritance, NodePath lookups, engine lifecycle callbacks, resource syntax, or engine-specific ownership patterns.
3. Do not treat screenshots as the sole source of truth when the reference project contains more precise authored data or presentation behavior.
4. Do not claim mobile, touch, gamepad, unsupported browser, or platform compatibility without a separate validated release decision.
5. Do not keep placeholder `P`/`E` entity cards or flat color-only terrain in the final parity target unless the audit explicitly marks the corresponding reference surface as unavailable and approves a replacement.

## Acceptance Criteria

1. The reference audit accounts for every in-scope board, terrain, entity, effect, HUD, overlay, and audio surface with a parity decision and an observable acceptance target.
2. The browser-visible arena matches the approved reference composition in board footprint, layered terrain, camera framing, cell alignment, entity scale, and major color/value relationships at the supported viewport sizes.
3. Every enabled player and enemy role has a distinguishable presentation profile and all active combat states remain readable without debug labels or placeholder letters.
4. Telegraphs, attacks, impacts, damage, Guard, Stagger, death, drowning, rewards, and terminal outcomes are driven by semantic state and events, and their completion leaves no pending timeline, callback, audio source, or orphan visual.
5. The production HUD and overlays expose the same runtime state as the deterministic scenario without calculating gameplay outcomes or creating a second state owner.
6. Reduced motion preserves all gameplay information, reset and route replacement cancel presentation work, and browser screenshot or visual regression checks cover the approved parity scenarios.
