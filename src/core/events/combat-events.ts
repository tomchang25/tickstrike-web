import type { Cell, EntityId } from "../model/types";

export type CombatEvent =
  | {
      readonly type: "actor_moved";
      readonly entityId: EntityId;
      readonly from: Cell;
      readonly to: Cell;
    }
  | {
      readonly type: "smash_impact";
      readonly cell: Cell;
    }
  | {
      readonly type: "enemy_crushed";
      readonly enemyId: EntityId;
      readonly cell: Cell;
    }
  | {
      readonly type: "enemy_knocked";
      readonly enemyId: EntityId;
      readonly from: Cell;
      readonly to: Cell;
    }
  | {
      readonly type: "enemy_entered_water";
      readonly enemyId: EntityId;
      readonly from: Cell;
      readonly waterCell: Cell;
    };
