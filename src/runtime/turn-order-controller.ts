import type { TurnPlayback } from "@core/actions/action-resolver";
import type { CombatEvent } from "@core/events/combat-events";
import type { EntityId, EntityState, WorldSnapshot } from "@core/model/types";
import type { SlotPresentation } from "@presentation/timelines/presentation-director";
import type { TurnOrderPacing } from "./settings-store";

const HANDOFF_DELAY_MS: Readonly<Record<TurnOrderPacing, number>> = {
  fast: 100,
  normal: 250,
};

export type TurnOrderStatus = "STG" | "REC" | "REST" | "ATTACK";
export type TurnOrderSpritePose = "idle" | "move" | "prepare" | "attack";

export interface TurnOrderToken {
  readonly entityId: EntityId;
  readonly kind: EntityState["kind"];
  readonly label: string;
  readonly shortLabel: string;
  readonly archetype: string;
  readonly presentationId?: string;
  readonly facing?: EntityState["facing"];
  /** The best runtime-derived pose available to the DOM rail; idle is the safe fallback. */
  readonly spritePose: TurnOrderSpritePose;
  readonly status?: TurnOrderStatus;
  /** Remaining telegraph ticks, shown only beside an ATTACK warning. */
  readonly warningTicks?: number;
}

export interface TurnOrderState {
  readonly tokens: readonly TurnOrderToken[];
  readonly activeEntityId?: EntityId;
  readonly hoveredEntityId?: EntityId;
  readonly playing: boolean;
}

interface TurnOrderPresentation {
  playSlot(events: readonly CombatEvent[], generation: number): SlotPresentation;
  finishActive(): void;
}

interface TurnOrderHighlights {
  setTurnOrderHighlights(activeEntityId?: EntityId, hoveredEntityId?: EntityId): void;
}

type TurnOrderListener = (state: TurnOrderState) => void;

function statusFromEntity(entity: EntityState): TurnOrderStatus | undefined {
  if (entity.activity === "staggered") {
    return "STG";
  }
  if (entity.activity === "recovering") {
    return "REC";
  }
  if (entity.activity === "resting") {
    return "REST";
  }
  if (entity.activity === "telegraphing" || entity.committedAttack) {
    return "ATTACK";
  }
  return undefined;
}

function readableName(value: string): string {
  return value.replace(/[._-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function spritePoseFromEntity(entity: EntityState): TurnOrderSpritePose {
  return entity.kind === "enemy" && entity.activity === "telegraphing" ? "prepare" : "idle";
}

function tokenFromEntity(entity: EntityState, shortLabel: string): TurnOrderToken {
  return {
    entityId: entity.id,
    kind: entity.kind,
    label: entity.kind === "player" ? "Player" : readableName(entity.archetype),
    shortLabel,
    archetype: entity.archetype,
    presentationId: entity.presentationId,
    facing: entity.facing,
    spritePose: spritePoseFromEntity(entity),
    status: statusFromEntity(entity),
    warningTicks: entity.committedAttack?.warningTicks,
  };
}

function orderTokens(snapshot: WorldSnapshot): readonly TurnOrderToken[] {
  let enemyNumber = 0;
  return snapshot.entities.flatMap((entity) => {
    const enabled =
      entity.phase === "alive" &&
      (entity.kind === "player" || (entity.kind === "enemy" && entity.enemyAction !== undefined));
    if (!enabled) {
      return [];
    }
    if (entity.kind === "enemy") {
      enemyNumber += 1;
    }
    return [tokenFromEntity(entity, entity.kind === "player" ? "P" : `E${enemyNumber}`)];
  });
}

/**
 * Owns the session-local projection and pacing of a resolved turn. Gameplay has already settled;
 * this controller only walks the resolver's explicit actor batches through presentation.
 */
export class TurnOrderController {
  private readonly listeners = new Set<TurnOrderListener>();
  private state: TurnOrderState = { tokens: [], playing: false };
  private pacing: TurnOrderPacing = "fast";
  private finishRequested = false;
  private delayTimer: ReturnType<typeof setTimeout> | undefined;
  private releaseDelay: (() => void) | undefined;
  private runId = 0;

  constructor(
    private readonly presentation: TurnOrderPresentation,
    private readonly highlights: TurnOrderHighlights,
  ) {}

  get isIdle(): boolean {
    return !this.state.playing;
  }

  get(): TurnOrderState {
    return this.state;
  }

  subscribe(listener: TurnOrderListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  setPacing(pacing: TurnOrderPacing): void {
    this.pacing = pacing;
  }

  setHoveredEntity(entityId?: EntityId): void {
    const next = entityId && this.state.tokens.some((token) => token.entityId === entityId) ? entityId : undefined;
    if (next === this.state.hoveredEntityId) {
      return;
    }
    this.publish({ ...this.state, hoveredEntityId: next });
  }

  reset(snapshot?: WorldSnapshot): void {
    this.runId += 1;
    this.finishActive();
    this.finishRequested = false;
    this.publish({
      tokens: snapshot ? orderTokens(snapshot) : [],
      playing: false,
    });
  }

  finishActive(): void {
    if (!this.state.playing) {
      return;
    }
    this.finishRequested = true;
    this.presentation.finishActive();
    if (this.delayTimer !== undefined) {
      clearTimeout(this.delayTimer);
      this.delayTimer = undefined;
    }
    this.releaseDelay?.();
    this.releaseDelay = undefined;
  }

  async play(playback: TurnPlayback, before: WorldSnapshot, settled: WorldSnapshot, generation: number): Promise<void> {
    const runId = ++this.runId;
    this.finishRequested = false;
    this.publish({
      tokens: orderTokens(before),
      activeEntityId: playback.player.actorId,
      playing: true,
    });

    const inFlight: Promise<void>[] = [];
    const slots = [
      { actorId: playback.player.actorId, events: playback.player.events, postSlotState: undefined },
      ...playback.enemies,
    ];

    for (const slot of slots) {
      if (runId !== this.runId) {
        return;
      }

      const actorVisible = this.state.tokens.some((token) => token.entityId === slot.actorId);
      this.publish({
        ...this.state,
        activeEntityId: actorVisible ? slot.actorId : undefined,
      });
      this.reduceEvents(slot.events);

      const visual = this.presentation.playSlot(slot.events, generation);

      if (this.finishRequested) {
        this.presentation.finishActive();
        await visual.done;
      } else if (visual.hasVisualWork) {
        inFlight.push(visual.done);
        await this.waitForHandoff();
      } else {
        await Promise.resolve();
      }

      if (slot.postSlotState) {
        this.applyPostSlotState(slot.postSlotState);
      }
    }

    const trailing = this.presentation.playSlot(playback.trailingEvents, generation);
    if (this.finishRequested) {
      this.presentation.finishActive();
    }
    await trailing.done;
    await Promise.all(inFlight);
    if (runId !== this.runId) {
      return;
    }

    this.finishRequested = false;
    this.publish({
      tokens: orderTokens(settled),
      playing: false,
    });
  }

  private waitForHandoff(): Promise<void> {
    if (this.finishRequested) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      let settled = false;
      const release = () => {
        if (settled) {
          return;
        }
        settled = true;
        this.releaseDelay = undefined;
        resolve();
      };
      this.releaseDelay = release;
      this.delayTimer = setTimeout(() => {
        this.delayTimer = undefined;
        release();
      }, HANDOFF_DELAY_MS[this.pacing]);
    });
  }

  private reduceEvents(events: readonly CombatEvent[]): void {
    let tokens = [...this.state.tokens];
    for (const event of events) {
      switch (event.type) {
        case "enemy_died":
        case "enemy_self_destructed":
        case "enemy_crushed":
        case "enemy_entered_water":
          tokens = tokens.filter((token) => token.entityId !== event.enemyId);
          break;
        case "player_died":
          tokens = tokens.filter((token) => token.entityId !== event.playerId);
          break;
        case "enemy_staggered":
          tokens = this.updateToken(tokens, event.enemyId, { status: "STG", warningTicks: undefined });
          break;
        case "enemy_attack_interrupted":
        case "enemy_recovering":
          tokens = this.updateToken(tokens, event.enemyId, { status: "REC", warningTicks: undefined });
          break;
        case "enemy_recovered":
        case "enemy_stagger_ended":
          tokens = this.updateToken(tokens, event.enemyId, { status: undefined, warningTicks: undefined });
          break;
        case "enemy_attack_committed":
          tokens = this.updateToken(tokens, event.enemyId, {
            status: "ATTACK",
            warningTicks: event.attack.warningTicks,
            spritePose: "prepare",
          });
          break;
        case "enemy_moved":
          tokens = this.updateToken(tokens, event.enemyId, {
            facing: {
              x: Math.sign(event.to.x - event.from.x),
              y: Math.sign(event.to.y - event.from.y),
            },
            spritePose: "move",
          });
          break;
        case "actor_moved":
          tokens = this.updateToken(tokens, event.entityId, {
            facing: {
              x: Math.sign(event.to.x - event.from.x),
              y: Math.sign(event.to.y - event.from.y),
            },
            spritePose: "move",
          });
          break;
        case "player_dashed":
          tokens = this.updateToken(tokens, event.actorId, {
            facing: {
              x: Math.sign(event.to.x - event.from.x),
              y: Math.sign(event.to.y - event.from.y),
            },
            spritePose: "move",
          });
          break;
        case "player_attacked":
          tokens = this.updateToken(tokens, event.actorId, { facing: event.direction, spritePose: "attack" });
          break;
        default:
          break;
      }
    }
    this.publish({
      ...this.state,
      tokens,
      activeEntityId: tokens.some((token) => token.entityId === this.state.activeEntityId)
        ? this.state.activeEntityId
        : undefined,
      hoveredEntityId: tokens.some((token) => token.entityId === this.state.hoveredEntityId)
        ? this.state.hoveredEntityId
        : undefined,
    });
  }

  private applyPostSlotState(entity: EntityState): void {
    if (entity.phase !== "alive") {
      this.removeToken(entity.id);
      return;
    }
    this.publish({
      ...this.state,
      tokens: this.updateToken([...this.state.tokens], entity.id, {
        facing: entity.facing,
        spritePose: spritePoseFromEntity(entity),
        status: statusFromEntity(entity),
        warningTicks: entity.committedAttack?.warningTicks,
      }),
    });
  }

  private removeToken(entityId: EntityId): void {
    const tokens = this.state.tokens.filter((token) => token.entityId !== entityId);
    this.publish({
      ...this.state,
      tokens,
      activeEntityId: this.state.activeEntityId === entityId ? undefined : this.state.activeEntityId,
      hoveredEntityId: this.state.hoveredEntityId === entityId ? undefined : this.state.hoveredEntityId,
    });
  }

  private updateToken(
    tokens: TurnOrderToken[],
    entityId: EntityId,
    update: Partial<Pick<TurnOrderToken, "facing" | "spritePose" | "status" | "warningTicks">>,
  ): TurnOrderToken[] {
    return tokens.map((token) => (token.entityId === entityId ? { ...token, ...update } : token));
  }

  private publish(state: TurnOrderState): void {
    this.state = state;
    this.highlights.setTurnOrderHighlights(state.activeEntityId, state.hoveredEntityId);
    for (const listener of this.listeners) {
      listener(state);
    }
  }
}
