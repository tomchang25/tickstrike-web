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

- Arena composition: the 12 by 12 board, the 10 by 10 starting land region, land and water layers, tile transitions, edge treatment, decorative props, camera framing, and grid readability.
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

### Child decomposition

| Child | Focus                                               | Current document form                                                          |
| ----- | --------------------------------------------------- | ------------------------------------------------------------------------------ |
| 13.1  | Reference inventory and parity matrix               | Plan child; create a verified implementation spec immediately before execution |
| 13.2  | Layered arena and tile presentation                 | Plan child; create a sketch before implementation                              |
| 13.3  | Player and enemy visual profiles                    | Plan child; create a sketch before implementation                              |
| 13.4  | Combat feedback, audio, and terminal presentation   | Plan child; create a sketch before implementation                              |
| 13.5  | HUD, responsive layout, and visual regression gates | Plan child; create a verified implementation spec immediately before execution |

Recommended landing order is 13.1, 13.2, 13.3, 13.4, then 13.5. Child 13.1 may update the scope and acceptance targets of later children, but it must not introduce a second runtime or alter deterministic gameplay rules.

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
