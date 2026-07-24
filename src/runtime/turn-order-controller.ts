import type { TurnPlayback } from "@core/actions/action-resolver";
import type { CombatEvent } from "@core/events/combat-events";
import type { EntityId, EntityState, WorldSnapshot } from "@core/model/types";
import type { SlotPresentation } from "@presentation/timelines/presentation-director";
import type { TurnOrderPacing } from "./settings-store";

const STAGGER_MS = 100;

export type TurnOrderStatus = "STG" | "REC" | "REST" | "ATTACK";

export interface TurnOrderToken {
  readonly entityId: EntityId;
  readonly kind: EntityState["kind"];
  readonly label: string;
  readonly shortLabel: string;
  readonly archetype: string;
  readonly presentationId?: string;
  readonly status?: TurnOrderStatus;
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
    return [
      {
        entityId: entity.id,
        kind: entity.kind,
        label: entity.kind === "player" ? "Player" : readableName(entity.archetype),
        shortLabel: entity.kind === "player" ? "P" : `E${enemyNumber}`,
        archetype: entity.archetype,
        presentationId: entity.presentationId,
        status: statusFromEntity(entity),
      },
    ];
  });
}

/**
 * Owns the session-local projection and pacing of a resolved turn. Gameplay has already settled;
 * this controller only walks the resolver's explicit actor batches through presentation.
 */
export class TurnOrderController {
  private readonly listeners = new Set<TurnOrderListener>();
  private state: TurnOrderState = { tokens: [], playing: false };
  private pacing: TurnOrderPacing = "staggered";
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
      if (slot.postSlotState) {
        this.applyPostSlotState(slot.postSlotState);
      }

      if (this.finishRequested) {
        this.presentation.finishActive();
        await visual.done;
      } else if (visual.hasVisualWork && this.pacing === "staggered") {
        inFlight.push(visual.done);
        await this.waitForHandoff();
      } else if (visual.hasVisualWork) {
        await visual.done;
      } else {
        await Promise.resolve();
      }

      this.completeSlot(slot.actorId);
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
      }, STAGGER_MS);
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
          tokens = this.withStatus(tokens, event.enemyId, "STG");
          break;
        case "enemy_attack_interrupted":
        case "enemy_recovering":
          tokens = this.withStatus(tokens, event.enemyId, "REC");
          break;
        case "enemy_recovered":
        case "enemy_stagger_ended":
          tokens = this.withStatus(tokens, event.enemyId, undefined);
          break;
        case "enemy_attack_committed":
          tokens = this.withStatus(tokens, event.enemyId, "ATTACK");
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
      tokens: this.withStatus([...this.state.tokens], entity.id, statusFromEntity(entity)),
    });
  }

  private completeSlot(actorId: EntityId): void {
    this.removeToken(actorId);
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

  private withStatus(
    tokens: TurnOrderToken[],
    entityId: EntityId,
    status: TurnOrderStatus | undefined,
  ): TurnOrderToken[] {
    return tokens.map((token) => (token.entityId === entityId ? { ...token, status } : token));
  }

  private publish(state: TurnOrderState): void {
    this.state = state;
    this.highlights.setTurnOrderHighlights(state.activeEntityId, state.hoveredEntityId);
    for (const listener of this.listeners) {
      listener(state);
    }
  }
}
