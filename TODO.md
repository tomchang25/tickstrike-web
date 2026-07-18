# TODO

The single forward surface: open this file to see every open item and emerging idea. Each forward item lives in exactly one section here or, once it needs durable structure, in `dev/docs/plans/`. There is deliberately no Done tier: remove shipped lines and record their outcome in `CHANGELOG.md`.

> The actionable tiers (`Plan`, `Chore`, and `Bug`) contain one line per item: no paragraphs, tables, or rationale. An item that needs explanation belongs in `## Draft` under one `###` heading. When a Draft item gains sub-structure, becomes actionable, or needs a durable link, promote it to its own file in `dev/docs/plans/`.
>
> In `## Draft`, use no `####` headings or bold-label patterns. Use plain text and lists for sub-structure.
>
> Scope tags in actionable lines use short, lowercase `snake_case` identifiers, such as `[player_verbs]` or `[bugfix]`.

Actionable line format: `[scope] one sentence - [ref plans/<name>.md if any]`

`## Active` holds in-flight or implementation-ready work promoted from `## Plan`.

---

## Active

> Do not delete this reminder text.
> Flows currently being implemented or ready to implement. Each entry is a one-line pointer in the same format as `## Plan`.
> Phase detail and progress live in the linked `dev/docs/plans/` file.
> Ship a phase: remove it from that file and append its outcome to `CHANGELOG.md`, leaving this line until every phase ships.
> When every phase ships: archive the plan file and delete this line.

Nothing currently in progress.

---

## Plan

Queued work that has a plan in `dev/docs/plans/`. Promote a line to `## Active` when implementation starts. Retire stale work to `## Draft`.

No queued implementation plans.

---

## Chore

One line, no rationale, no backing document.

---

## Bug

One line, no rationale, no backing document.

---

## Draft

Preliminary concepts that need more than one line but are not necessarily actionable. Use one `###` heading per idea. When an idea becomes actionable, outgrows this section, or needs a stable link, move it to `dev/docs/plans/<name>.md` and remove it here. Delete stale ideas that do not grow.

### Player Verb Parity

The initial Web slice proves Smash, knockback, drowning, presentation completion, and browser-visible acceptance. Complete the remaining player verbs as separately deterministic vertical slices rather than translating Godot scripts or scene lifecycles.

- Migrate Move, Attack, Dash, Chain Dash, and Execute in the order supported by locked reference scenarios.
- For each verb, lock command costs, tick order, damage, occupancy, status duration, semantic-event order, and rejection behavior before implementation.
- Require deterministic scenario setup, unit assertions, Pixi/GSAP presentation, Playwright acceptance, and cleanup of every transient visual before the next verb starts.

### Enemy, Wave, And Reward Parity

After player verbs are established, migrate combat archetypes and run flow one behavior-complete slice at a time. The Web runtime must retain deterministic world ownership while presentation realizes events without delaying semantic resolution.

- Port enemy archetypes individually with intent preview and telegraphs, beginning with the reference behavior selected for the next scenario.
- Add wave spawning and completion only after enemy tick behavior is covered by deterministic scenarios.
- Add reward selection and class modifiers after wave progression is verified against the frozen reference behavior.

### Run Shell And Distribution

Defer low-frequency UI and platform integration until the core run loop is established. Preserve the Web-native boundary: React owns interface composition, adapters own browser and desktop integration, and core stays framework-independent.

- Add HUD, pause, settings, persistence, and run-summary behavior once their underlying runtime contracts exist.
- Complete Tauri packaging, Steamworks integration, achievements, and release pipeline after browser behavior is stable.
