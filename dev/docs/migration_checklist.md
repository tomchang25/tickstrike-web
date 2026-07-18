# Tickstrike Migration Checklist

## Freeze the reference build

- Record the Godot alpha version and commit.
- Stop adding large features to the Godot branch.
- Capture fixed scenarios for movement, Smash, drowning, Chain Dash, Execute, enemy intent, wave completion, and rewards.
- Record exact tick order, costs, damage, occupancy, status duration, and event order.

## Vertical replacement policy

Do not translate the Godot project file by file. Migrate one behavior-complete slice at a time:

1. Define a deterministic initial world.
2. Execute the same command in the Godot reference and Web runtime.
3. Match logical results and event order.
4. Implement presentation from semantic events.
5. Add Playwright acceptance.
6. Freeze that slice and move to the next one.

## First Web vertical slice

- Arena loads from content data.
- Player movement works.
- One enemy archetype works.
- Smash resolves center crush, knockback, and drowning.
- Presentation finishes without controlling gameplay state.
- Scenario can be opened directly by URL.
- Debug API can read state and entity bounds.
- Unit test and Playwright acceptance both pass.
- Tauri development window launches.

## Recommended migration order

1. Player verbs: Move, Attack, Dash, Smash, Chain Dash, Execute.
2. Enemy archetypes, one complete archetype at a time.
3. Intent preview and telegraphs.
4. Wave spawning and completion.
5. Reward selection and class modifiers.
6. HUD, pause, settings, save, and run summary.
7. Tauri packaging, Steamworks bridge, achievements, and release pipeline.

## Never use these as progress metrics

- Number of translated `.gd` files.
- Number of recreated `.tscn` files.
- Percentage of old folder names reproduced.
- Number of interfaces or abstract base classes added.
