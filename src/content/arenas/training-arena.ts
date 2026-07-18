import type { TileKind } from "../../core/model/types";
import { World } from "../../core/world/world";

const ROWS = [
  "##########",
  "#........#",
  "#........#",
  "#........#",
  "#........#",
  "#........#",
  "#...~....#",
  "##########",
] as const;

function parseTile(char: string): TileKind {
  switch (char) {
    case "#":
      return "wall";
    case "~":
      return "water";
    default:
      return "floor";
  }
}

export function createTrainingArena(): World {
  const width = ROWS[0].length;
  const height = ROWS.length;
  const tiles = ROWS.flatMap((row) => [...row].map(parseTile));
  return new World(width, height, tiles);
}
