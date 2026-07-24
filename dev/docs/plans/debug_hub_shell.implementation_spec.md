# Debug Hub Shell

Parent Plan: none (standalone spec)

## Goal

Unify the dev-only Lab and testbed pages — the game scenario testbed, wall testbed, entity presentation lab, and action lab — behind one `/debug` hub with a shared route catalog, header shell, and dev-only guard. This keeps developer tooling from accumulating as hand-written route conditionals and separates it clearly from the unrelated in-game debug actions work.

## Summary

Today `src/app/app.tsx` dispatches four dev-only pages through hand-written `window.location.pathname` conditionals, each page duplicates its own `<main className="app-shell"><header>` frame, there is no navigation between tools, and the bare `/debug` path is the game scenario testbed rather than an index. That last point is why the tooling hub keeps being confused with the separate in-game debug actions item.

This change introduces a small dev-only route catalog as the single source of tool routes: each entry carries an id, path, title, subtitle, and lazy component loader. `/debug` becomes a hub index page that lists and links every registered tool. The game scenario testbed moves from `/debug` to `/debug/game` (keeping its `?scenario=` behavior), while `/debug/wall`, `/debug/entity`, and `/debug/action` keep their paths. A shared shell component renders the common header (tool title, subtitle, navigation back to the hub) so each tool stops duplicating the frame; everything inside the frame — mount, state, validation, endpoint access, and cleanup — stays owned by the individual tool. The production bundle continues to ship none of this: the catalog and all tool chunks stay behind the existing `import.meta.env.DEV` tree-shaking guard, and production visitors to any `/debug` path still get the game app exactly as today.

Because the whole Playwright e2e suite enters through `page.goto("/debug?scenario=…")`, this change also rewrites those entry URLs to `/debug/game?scenario=…` in the same commit. Adding a later tool (for example a future sprite lab) becomes one catalog entry instead of another conditional and another copied header.

## Requirements

1. `/debug` in development builds is a hub index that lists every registered dev tool with working navigation; it no longer mounts the scenario testbed directly.
2. The game scenario testbed lives at `/debug/game` and preserves its current `?scenario=` selection, default scenario fallback, and URL rewrite on scenario change.
3. `/debug/wall`, `/debug/entity`, and `/debug/action` keep their current paths and their current tool behavior.
4. The shared surface is limited to the route catalog, the header/navigation shell, responsive shell styling, and the dev-only guard; each tool keeps its own mount, state, validation, and cleanup, because the tools have intentionally independent lifecycles.
5. The production bundle ships no hub, catalog, or tool code, and production routing behavior is unchanged.
6. The Playwright e2e suite reaches the scenario testbed at its new path; specs that pass before the change still pass after it.

## Relational Context

- `src/app/app.tsx` is the only router and must stay the single dispatch point deciding between `GameApp` and dev tooling; the catalog is consulted there, not from a second router. The production path (`GameApp` for every URL when `import.meta.env.DEV` is false) is a preserved contract.
- Tree-shaking depends on the current shape: tool components are created by `import.meta.env.DEV ? lazy(() => import(…)) : undefined`. The catalog must keep its lazy loaders behind the same DEV guard. Wrong shape to avoid: a catalog module that statically imports tool components — it would pull every lab into the production bundle.
- Route matching is exact-pathname today; the hub must match bare `/debug` only, so `/debug/game` and the other tool paths cannot shadow it.
- Each tool currently renders its own outer `<main className="app-shell"><header>…` frame with tool-specific title text (see `testbed-app.tsx`, `wall-testbed-app.tsx`). The shared shell takes over that outer frame; a converted tool must not keep a second nested `app-shell` main or the `styles.css` layout rules double-apply.
- `TestbedApp` owns scenario selection: it reads `?scenario=` on mount and rewrites the URL with `history.replaceState` on scenario change. That stays tool-owned; hub navigation must not intercept or strip query parameters.
- The entire e2e suite (`test/e2e/*.spec.ts`) enters via `page.goto("/debug?scenario=…")`; `action-lab.spec.ts` already uses `/debug/action`. The goto rewrite to `/debug/game?scenario=…` must land in the same change or every spec fails on an index page. Seven specs already fail for unrelated harness reasons (see the `[e2e_regression]` Bug entry); this change must not widen that set.
- The `/__debug/*` catalog writer endpoints used by the entity and action labs are Vite dev-server middleware, independent of page routes; they are untouched.
- The in-game debug actions item (`[debug_actions]` in `TODO.md`: god modes, instant kills) is a different feature that will live inside the game HUD/session, not in this hub; nothing in this change should reserve or occupy that surface.

## Scope

### Included

- Dev-only route catalog, hub index page, and shared header/navigation shell.
- Moving the scenario testbed route to `/debug/game` and converting the four existing tools to the shared shell.
- e2e entry-URL updates and any doc line that names the scenario testbed at bare `/debug`.

### Excluded

- The in-game debug actions feature (`[debug_actions]`).
- Any new tool, tool-internal restyling, or tool behavior change.
- Fixing the seven already-failing e2e specs.

## Files to Change

| File                                      | Change Size | Purpose                                                                    |
| ----------------------------------------- | ----------- | -------------------------------------------------------------------------- |
| `src/app/debug/debug-tool-catalog.ts`     | Small (new) | Route catalog: id, path, title, subtitle, DEV-guarded lazy loader per tool |
| `src/app/debug/debug-shell.tsx`           | Small (new) | Shared header/navigation frame wrapping each tool                          |
| `src/app/debug/debug-hub-app.tsx`         | Small (new) | Hub index page listing catalog entries                                     |
| `src/app/app.tsx`                         | Medium      | Replace hand-written conditionals with catalog dispatch; hub at `/debug`   |
| `src/app/testbed-app.tsx`                 | Medium      | Serve `/debug/game`; yield outer frame to the shared shell                 |
| `src/app/wall-testbed-app.tsx`            | Small       | Yield outer frame to the shared shell                                      |
| `src/app/entity-presentation-lab-app.tsx` | Small       | Yield outer frame to the shared shell                                      |
| `src/app/action-lab-app.tsx`              | Small       | Yield outer frame to the shared shell                                      |
| `src/app/styles.css`                      | Small       | Hub index and shell navigation styles                                      |
| `test/e2e/*.spec.ts`                      | Small, wide | Rewrite `goto("/debug?scenario=…")` to `/debug/game?scenario=…`            |

## Execution Outline

1. Add the catalog, shell, and hub modules with the DEV guard preserved, leaving `app.tsx` untouched so nothing breaks while the pieces land.
2. Rewire `app.tsx` to dispatch from the catalog, mounting the hub at bare `/debug` and the scenario testbed at `/debug/game`.
3. Convert the four tool apps to render inside the shared shell, deleting each duplicated outer frame; verify the entity/action lab writer endpoints still round-trip.
4. Rewrite the e2e entry URLs, then run the targeted currently-green Playwright specs (never the unfiltered full suite) plus unit tests, lint, and format per `dev/agent_rules/test_operations.md`.
5. Update any governance/doc line that names the scenario testbed at bare `/debug`.

## Implementation Notes

- Keep the catalog entry type plain data plus a loader thunk; per-tool props do not belong in the catalog. If a tool needs configuration, it reads it itself.
- The shell should accept title/subtitle from the catalog entry so tool components stop carrying their own header copy.
- Follow the triggered standards at implementation time: `react_component_standard.md` for the new components, `project_structure_standard.md` plus the local addendum before adding the `src/app/debug/` directory, and `verification_tiers.md` for the verification depth.

## Edge Cases

| Case                                          | Expected Handling                                         |
| --------------------------------------------- | --------------------------------------------------------- |
| Unknown `/debug/<something>` path in dev      | Fall back to the hub index so a typo never white-screens  |
| Any `/debug` path in a production build       | `GameApp` renders, exactly as today                       |
| `/debug/game` with no or invalid `?scenario=` | Default scenario loads, matching current testbed fallback |

## Acceptance Criteria

1. In development, visiting the hub route shows an index of all four tools and each link opens the correct tool with its shared header and working back-navigation.
2. The scenario testbed works at its new path with scenario query selection, default fallback, and URL rewrite on scenario change behaving as before.
3. The wall, entity, and action tools behave as before at their existing paths, including the entity and action catalog save round-trips.
4. A production build serves the game on every path and contains no hub, catalog, or tool code.
5. Every Playwright spec that passed before the change passes after it, entering through the new testbed path.
