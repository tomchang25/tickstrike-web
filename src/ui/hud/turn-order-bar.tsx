import ninjaSpriteSheetUrl from "@content/characters/assets/ninja/body-sprite-sheet.png";
import { enemyPresentationProfiles, enemySpriteSheetUrls } from "@content/enemies/features";
import type { CSSProperties } from "react";
import type { TurnOrderState, TurnOrderStatus, TurnOrderToken } from "@runtime/turn-order-controller";

export interface TurnOrderBarProps {
  readonly state: TurnOrderState;
  readonly onHoveredEntityChange: (entityId?: string) => void;
}

const STATUS_LABELS: Readonly<Record<TurnOrderStatus, string>> = {
  STG: "Staggered",
  REC: "Recovering",
  REST: "Resting",
  ATTACK: "Attack warning",
};

function tokenAccessibleName(token: TurnOrderToken, active: boolean): string {
  const parts = [token.label];
  if (active) {
    parts.push("active");
  }
  if (token.status) {
    parts.push(STATUS_LABELS[token.status]);
  }
  if (token.status === "ATTACK" && token.warningTicks !== undefined) {
    parts.push(`${token.warningTicks} turn${token.warningTicks === 1 ? "" : "s"} remaining`);
  }
  return parts.join(", ");
}

function directionColumn(token: TurnOrderToken): number {
  const facing = token.facing;
  if (!facing) {
    return token.kind === "player" ? 3 : 0;
  }
  if (facing.x < 0) {
    return 2;
  }
  if (facing.x > 0) {
    return 3;
  }
  if (facing.y < 0) {
    return 1;
  }
  return 0;
}

function poseRow(token: TurnOrderToken): { row: number; rows: number } {
  if (token.kind === "player") {
    return { row: token.spritePose === "attack" ? 5 : token.spritePose === "move" ? 1 : 0, rows: 7 };
  }
  return {
    row: token.spritePose === "move" ? 1 : token.spritePose === "prepare" ? 2 : token.spritePose === "attack" ? 3 : 0,
    rows: 4,
  };
}

function spriteStyle(token: TurnOrderToken): CSSProperties | undefined {
  const imageUrl =
    token.kind === "player"
      ? ninjaSpriteSheetUrl
      : token.presentationId
        ? enemySpriteSheetUrls[enemyPresentationProfiles.get(token.presentationId)?.sheet ?? ""]
        : undefined;
  if (!imageUrl) {
    return undefined;
  }

  const { row, rows } = poseRow(token);
  return {
    backgroundImage: `url(${imageUrl})`,
    backgroundPosition: `${(directionColumn(token) / 3) * 100}% ${(row / (rows - 1)) * 100}%`,
    backgroundSize: `400% ${rows * 100}%`,
  };
}

export function TurnOrderBar({ state, onHoveredEntityChange }: TurnOrderBarProps) {
  return (
    <nav className="turn-order-rail" aria-label="Turn order" data-testid="turn-order-rail">
      <span className="turn-order-title" aria-hidden="true">
        Turn Order
      </span>
      <ol className="turn-order-list">
        {state.tokens.map((token, index) => {
          const active = token.entityId === state.activeEntityId;
          const hovered = token.entityId === state.hoveredEntityId;
          const portraitStyle = spriteStyle(token);
          return (
            <li className="turn-order-entry" key={token.entityId}>
              {index > 0 ? (
                <span className="turn-order-chevron" aria-hidden="true">
                  ›
                </span>
              ) : null}
              <button
                type="button"
                className="turn-order-token"
                data-testid={`turn-order-token-${token.entityId}`}
                data-entity-id={token.entityId}
                data-active={active ? "true" : "false"}
                data-hovered={hovered ? "true" : "false"}
                data-kind={token.kind}
                aria-label={tokenAccessibleName(token, active)}
                aria-current={active ? "step" : undefined}
                onPointerEnter={() => onHoveredEntityChange(token.entityId)}
                onPointerLeave={() => onHoveredEntityChange()}
                onFocus={() => onHoveredEntityChange(token.entityId)}
                onBlur={() => onHoveredEntityChange()}
              >
                <span
                  className={`turn-order-portrait${portraitStyle ? "" : " turn-order-portrait-fallback"}`}
                  style={portraitStyle}
                  aria-hidden="true"
                >
                  {portraitStyle ? null : token.shortLabel}
                </span>
                {token.status ? (
                  <span
                    className={`turn-order-status turn-order-status-${token.status.toLowerCase()}`}
                    title={STATUS_LABELS[token.status]}
                  >
                    {token.status === "ATTACK" ? `⚠ ${token.warningTicks ?? "?"}` : token.status}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
