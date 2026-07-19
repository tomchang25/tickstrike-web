# Remove Deprecated Mode Enemy Content

Parent Plan: `port_07_complete_enemy_roster_and_navigation.md`

## Goal

Remove the unimplemented `mode_enemy` and `mode_boss` content, their dedicated attacks, and their only spawn path. The shipped catalog must expose only enemy roles with an implemented shared action lifecycle, leaving future Boss design to the standalone state-policy probe.

## Summary

Mode and Mode Boss are authored catalog placeholders rather than enabled implementations: the current enemy action resolver has no Mode selection, retaliation, or Boss policy behavior. Remove their data and every projection that treats them as shipped content. This is a content-contract cleanup, not a Boss implementation or a replacement Boss design.

The resulting catalog retains Thrust, Slash, Ranged, Charge, and Bomb. Removing the only Boss wave also removes `demo-10`; the existing content-inspection scenario remains read-only and continues to inspect supported catalog data only.

## Relational Context

- `src/content/enemies/enemy-definitions.ts` owns authored guards, attacks, and enemies; remove Mode-only entries together so no remaining definition references a deleted ID.
- `src/core/content/actor-schema.ts` owns the accepted enemy role and role-tuning schema. Remove the `mode` role and `ModeRoleTuning` branch instead of retaining a runtime type with no authored consumer.
- `src/core/content/content-schema.ts` owns strict catalog counts and ordered inventories. Its expected lengths and IDs must change with the removed content so validation continues to reject incomplete or reordered catalogs.
- `src/content/waves/wave-definitions.ts` owns the only `mode_boss` spawn reference. Remove the `boss` spawn group and `demo-10` atomically; no wave may retain a dangling group or enemy ID.
- `src/harness/content-inspection.ts` and `src/ui/TestbedPanel.tsx` project the removed Mode Boss and Boss-wave data for the read-only inspection scenario. Replace that projection rather than allowing a harness-only dependency on deleted catalog content.
- Unit and browser assertions are catalog-contract consumers. Update them to assert the reduced supported inventory and the revised inspection projection; do not retain Mode fixtures solely to preserve test coverage.
- This cleanup does not add a new Boss placeholder, Boss command path, combat state, presentation profile, or wave. Future Boss ownership remains deferred to `enemy_boss_state_policy.probe.md`.

## Scope

### Included

- Remove `mode_enemy`, `mode_boss`, their ten Mode-specific attack definitions, and their unused Elite and Boss guards.
- Remove the `mode` role and retaliation tuning schema.
- Remove the Boss spawn group and `demo-10` wave.
- Update strict catalog validation, content inspection, UI projection, and unit/browser catalog assertions.

### Excluded

- Implementing a replacement Boss, Mode attack selection, retaliation, combos, or a Boss FSM.
- Changing the behavior or authored values of Thrust, Slash, Ranged, Charge, Bomb, player actions, or remaining waves.
- Changing generic Charge attack-kind support, which remains owned by child C.

## Files to Change

| File | Change Size | Purpose |
| --- | --- | --- |
| `src/content/enemies/enemy-definitions.ts` | Medium | Remove Mode-only guards, attacks, and enemy definitions. |
| `src/core/content/actor-schema.ts` | Small | Remove the unused Mode role and retaliation tuning validation. |
| `src/core/content/content-schema.ts` | Small | Reduce strict inventory counts and ordered IDs. |
| `src/content/waves/wave-definitions.ts` | Small | Remove the Boss group and `demo-10`. |
| `src/harness/content-inspection.ts` | Medium | Remove Mode Boss and Boss-wave inspection fields and dependencies. |
| `src/ui/TestbedPanel.tsx` | Small | Remove the corresponding inspection UI. |
| `test/unit/content/actor-catalog.test.ts` | Medium | Assert the reduced guard, attack, and enemy inventory. |
| `test/unit/content/wave-catalog.test.ts` | Medium | Assert the reduced group and demo-wave inventory. |
| `test/unit/harness/content-catalog-inspection.scenario.test.ts` | Small | Remove obsolete inspection assertions. |
| `test/e2e/content-catalog-inspection.spec.ts` | Small | Remove obsolete browser-visible Mode and Boss-wave assertions. |

## Execution Outline

1. Remove the Mode-only definitions, role schema, and strict inventory entries together; add or update focused catalog assertions before changing consumers.
2. Remove the Boss group and `demo-10`, then simplify the content-inspection projection and its Testbed panel to supported data only.
3. Update unit and browser assertions, verify the content catalog validates, and run the focused content-inspection scenario to confirm it remains read-only and reset-safe.

## Implementation Notes

- Remove all ten attacks with IDs prefixed `mode_`, rather than retaining generic-looking geometry that has no supported owner.
- Remove Elite and Boss guards because their only authored consumers are the deprecated Mode enemies. A future Boss must introduce its required guard deliberately with its own content and behavior contract.
- Preserve the order and values of all remaining catalog entries. The strict inventory validator is intentionally ordered and should be updated, not weakened or removed.
- The content-inspection scenario must still expose supported catalog evidence and continue to reject commands; removing Boss fields must not turn it into an empty or mutable harness.

## Edge Cases

| Case | Expected Handling |
| --- | --- |
| A remaining catalog entry references a removed Mode ID | Content validation fails; no dangling reference is permitted. |
| A test still requests a Mode Boss inspection field | Update the consumer to supported inspection data; do not keep a hidden Mode definition. |
| A future Boss is added | It defines its own enemy, guard, attacks, wave usage, and tests through a new approved implementation spec. |

## Acceptance Criteria

1. The canonical actor catalog contains only supported enemy roles and has no Mode-specific attacks, guards, or role-tuning schema.
2. No wave, harness projection, UI surface, unit test, or browser assertion references `mode_enemy`, `mode_boss`, or a removed Mode attack ID.
3. The catalog validator accepts the reduced ordered inventory and still rejects invalid inventory changes.
4. The content-inspection browser scenario remains visible, read-only, reset-safe, and free of obsolete Mode/Boss data.
