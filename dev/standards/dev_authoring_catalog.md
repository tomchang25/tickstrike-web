# Dev Authoring Catalog Standard

Read this before adding, changing, or reviewing a dev-authored presentation catalog — a JSON document that a `/debug` Lab tunes and the gameplay runtime consumes (e.g. `entity-presentation-profile-catalog.json`, `action-presentation-catalog.json`). It exists because the Lab and the runtime are two consumers of the same authored data, and a half-wired pipeline lets the Lab look correct while the running game silently uses stale values.

## The failure this prevents

A dev authoring catalog is edited in the Lab, written to disk by a Vite endpoint, and read by the runtime. Two real defects came from wiring only part of that loop:

- The Lab showed a newly authored weapon and tuned offsets; the running game showed neither.
- Root causes, compounding: (1) HMR for the catalog JSON is intentionally suppressed so a Lab `Apply` does not tear down the Lab scene, so the game module graph never sees the new JSON; (2) the runtime presenter captured the catalog once at construction and closed over it; (3) the runtime had no live-refresh listener — only the Lab side was wired.

The general shape: **the same authored data has two read paths (Lab and runtime), and the refresh was connected to only one.** A second, quieter shape is **two rendering implementations** of the same content (the Lab drawing it one way, the runtime another) that must be kept in sync by hand.

## Contract

Every dev authoring catalog MUST satisfy all of the following.

1. **Single source of truth, one resolver.** The catalog JSON is the only truth. Lab and runtime both read it through the same `resolve*` / `parse*` function. Neither embeds a divergent copy or a parallel default.
2. **Per-render resolution in the runtime — never capture-once.** A presenter resolves the catalog on each render (or per frame), so a runtime refresh takes effect without recreating the object. Do not read authored data into a constructor closure.
3. **All three ends land in the same change.** An authoring pipeline is complete only when it has: (a) the Vite writer endpoint (GET/PUT + validation + `*-updated` ws event), (b) the Lab live preview, and (c) the runtime live-refresh — a `use-game-session` listener on the `*-updated` event that calls `setRuntime*Catalog(...)` and a runtime refresh hook that re-applies the affected presentation. Shipping (a)+(b) without (c) is an incomplete pipeline, not a smaller feature.
4. **Prefer one renderer for Lab and runtime.** The Lab SHOULD drive the same runtime presenter it is calibrating (mount the real sprite/presenter and feed it the draft catalog), so "correct in the Lab" means "correct in the game" by construction. If a second rendering implementation is genuinely unavoidable, record it here as a known duplication with its exact sync points (frame layout, offset convention, scale, layer order); an unrecorded second renderer is a latent desync bug.
5. **On a discovered divergence, stop and ask — never delete to force consistency.** When the Lab and the runtime behave differently (e.g. one shows an afterimage or a toggle the other lacks), pause and ask the user which way to converge. The default is to lift the richer behavior into the shared path so both gain it, not to strip it from one side. Unilaterally deleting the fuller behavior to make the two match discards intent and is not allowed.

## Reference implementation

`entity-presentation-profile-catalog` is the complete, correct template — schema + writer plugin in `vite.config.ts`, Lab at `/debug/entity`, and the runtime refresh in `use-game-session.ts` (`entity-presentation-catalog-updated` → `setRuntimeEntityPresentationProfileCatalog` → `runtime.refreshEntityPresentationProfiles()`). Mirror it end to end. `action-presentation-catalog` (`/debug/action`) is the second consumer; keep both in step when the pattern changes.

## Checklist for a new authoring catalog

- [ ] Pixi-free schema module (`parse*`, validation) so `vite.config.ts` can import it without pulling the renderer into the config graph.
- [ ] Catalog JSON + a loader exposing `parse*`, the bundled catalog, `resolve*`, and `setRuntime*Catalog`.
- [ ] Vite writer plugin: GET/PUT to `/__debug/<name>`, validate on write, emit the `*-updated` ws event, and suppress HMR for the JSON.
- [ ] Lab route that reads/writes through the endpoint and (per contract 4) drives the real runtime presenter.
- [ ] Runtime presenter resolves the catalog per render (contract 2).
- [ ] `use-game-session` listener on `*-updated` → `setRuntime*Catalog` → runtime refresh hook (contract 3).
- [ ] Runtime + renderer refresh hook that re-applies the live presentation without touching deterministic world state.

## Verify against the runtime, not only the Lab

A Lab renders authored data in isolation and gives false confidence. Confirm the actual game reflects an edit — trivially true when contract 4 holds, and a required manual check otherwise.
