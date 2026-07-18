import type { Cell, EntityId, Reservation, Telegraph } from "../model/types";

export type CombatEvent =
  | {
      readonly type: "command_resolved";
      readonly commandType: string;
      readonly accepted: boolean;
      readonly consumedTime: boolean;
    }
  | {
      readonly type: "world_advanced";
      readonly tick: number;
      readonly phases: readonly string[];
    }
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
    }
  | {
      readonly type: "reservation_changed";
      readonly reservation?: Reservation;
      readonly ownerId: string;
      readonly granted: boolean;
    }
  | {
      readonly type: "telegraph_changed";
      readonly telegraph?: Telegraph;
      readonly sourceId: string;
      readonly cleared: boolean;
    };
