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
    };
