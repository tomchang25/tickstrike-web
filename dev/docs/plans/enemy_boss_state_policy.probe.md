**Enemy and Boss State Policy**

Status: Draft probe.

Decision: deferred until a concrete Boss design is approved.

Tickstrike's turn resolver is deterministic and shared across enemies. The current activity model and pure enemy decision function are sufficient for the supported roster. Future Boss work must preserve this shared ownership rather than introducing a Godot-style state Node, a separate Boss loop, or presentation-owned combat state.

- **Shared phase authority** — `enemy-phase.ts` collects per-enemy decisions, arbitrates contested movement, applies the accepted results in stable order, and emits semantic events. It owns cross-enemy coordination, not role-specific combo logic.

- **World authority** — `World` is the sole canonical-state writer and validates movement, occupancy, attack commitment, damage, landing, recovery, death, and cleanup. State behavior must declare an intent instead of mutating World directly.

- **Standard enemy policy** — Existing enemies retain data-owned `activity` lifecycle state and a pure decision that returns `move`, `attack`, or `wait`. Small, typed conditional logic is preferable to a general Decision Tree while behavior remains shallow and fixed.

- **Charge boundary** — Charge is an attack kind on the shared lifecycle. Its attack identity and maximum range are committed, while its legal live target/path may refresh during warning; detonation then resolves its displacement and landing before recovery. It is not a persistent `charging` state or an independent runtime.

- **Future Boss state** — A Boss with combos, phase transitions, interrupts, or persistent tactical memory should use a Boss-specific discriminated mode with only the payload required by that mode, such as combo ID and step, warning/recovery ticks, phase target, or last-known player cell. A mode handler determines its next transition or tactical intent.

- **Intent boundary** — A Boss mode handler may request an attack, ranked movement candidates, wait, or a new mode. The shared phase validates and commits that request. This preserves deterministic reservation handling when several enemies request the same destination.

- **Decision Tree boundary** — A data-driven Decision Tree is appropriate only if the Boss's ready-state choice develops many reusable, designer-tunable priorities. It selects a tactic; it does not replace the FSM that tracks combo order, warning, recovery, cancellation, or phase transition.

The future implementation should begin from a concrete Boss encounter and author a standalone implementation spec. That spec must define its combat phases, attacks, interrupt rules, content, deterministic scenario, unit assertions, and browser-visible presentation outcome before changing runtime code.

Open question: Which concrete Boss encounter and phase behaviors should be the first implementation target?

Open question: Does the first Boss require multiple enemies to remain active during its encounter, and therefore exercise contested-movement interaction with normal enemies?
