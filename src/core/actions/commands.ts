import type { Cell, EntityId } from "../model/types";

export type GameCommand =
  | {
      readonly type: "move";
      readonly actorId: EntityId;
      readonly direction: Cell;
    }
  | {
      readonly type: "smash";
      readonly actorId: EntityId;
      readonly target: Cell;
    }
  | {
      readonly type: "attack";
      readonly actorId: EntityId;
      readonly direction: Cell;
    }
  | {
      readonly type: "dash";
      readonly actorId: EntityId;
      readonly direction: Cell;
      /** Optional distance for pointer-selected landings; omitted means full range. */
      readonly distance?: number;
    };

export function commandConsumesTime(command: GameCommand): boolean {
  return command.type === "move" || command.type === "smash" || command.type === "attack" || command.type === "dash";
}
