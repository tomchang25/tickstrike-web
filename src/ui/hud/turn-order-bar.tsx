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
  return parts.join(", ");
}

export function TurnOrderBar({ state, onHoveredEntityChange }: TurnOrderBarProps) {
  if (state.tokens.length === 0) {
    return null;
  }

  return (
    <nav className="turn-order-rail" aria-label="Turn order" data-testid="turn-order-rail">
      <span className="turn-order-title" aria-hidden="true">
        Turn Order
      </span>
      <ol className="turn-order-list">
        {state.tokens.map((token, index) => {
          const active = token.entityId === state.activeEntityId;
          const hovered = token.entityId === state.hoveredEntityId;
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
                <span className="turn-order-portrait" aria-hidden="true">
                  {token.shortLabel}
                </span>
                {token.status ? (
                  <span
                    className={`turn-order-status turn-order-status-${token.status.toLowerCase()}`}
                    title={STATUS_LABELS[token.status]}
                  >
                    {token.status === "ATTACK" ? "⚠" : token.status}
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
