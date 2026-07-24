// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "./harness";
import { TurnOrderBar } from "@ui/hud/turn-order-bar";
import type { TurnOrderState, TurnOrderToken } from "@runtime/turn-order-controller";

function token(overrides: Partial<TurnOrderToken> & Pick<TurnOrderToken, "entityId">): TurnOrderToken {
  return {
    kind: "enemy",
    label: overrides.entityId,
    shortLabel: overrides.entityId.slice(0, 2).toUpperCase(),
    archetype: "grunt",
    spritePose: "idle",
    ...overrides,
  };
}

function state(overrides: Partial<TurnOrderState> = {}): TurnOrderState {
  return {
    tokens: [
      token({ entityId: "player", kind: "player", label: "Player", shortLabel: "P", archetype: "ninja" }),
      token({ entityId: "enemy-a", label: "Thrust", status: "ATTACK", warningTicks: 2, spritePose: "prepare" }),
      token({ entityId: "enemy-b", label: "Slash", status: "STG" }),
    ],
    activeEntityId: "player",
    hoveredEntityId: "enemy-a",
    playing: true,
    ...overrides,
  };
}

function railOrder(): string[] {
  return [...document.querySelectorAll<HTMLElement>(".turn-order-token")].map(
    (element) => element.dataset.entityId ?? "",
  );
}

describe("TurnOrderBar", () => {
  it("renders one token per state entry in canonical order", () => {
    render(<TurnOrderBar state={state()} onHoveredEntityChange={vi.fn()} />);

    expect(railOrder()).toEqual(["player", "enemy-a", "enemy-b"]);
  });

  it("marks the active and hovered tokens", () => {
    render(<TurnOrderBar state={state()} onHoveredEntityChange={vi.fn()} />);

    expect(screen.getByTestId("turn-order-token-player")).toHaveAttribute("data-active", "true");
    expect(screen.getByTestId("turn-order-token-enemy-a")).toHaveAttribute("data-hovered", "true");
    expect(screen.getByTestId("turn-order-token-enemy-b")).toHaveAttribute("data-active", "false");
  });

  it("shows an attack warning badge with its remaining tick count and an accessible name", () => {
    render(<TurnOrderBar state={state()} onHoveredEntityChange={vi.fn()} />);

    const attacker = screen.getByTestId("turn-order-token-enemy-a");
    expect(attacker).toHaveTextContent("⚠ 2");
    expect(attacker).toHaveAccessibleName(/Attack warning/);
    expect(attacker).toHaveAccessibleName(/2 turns remaining/);
    expect(screen.getByTestId("turn-order-token-enemy-b")).toHaveTextContent("STG");
  });

  it("renders no status badge for an ordinary token", () => {
    render(<TurnOrderBar state={state()} onHoveredEntityChange={vi.fn()} />);

    expect(screen.getByTestId("turn-order-token-player").querySelector(".turn-order-status")).toBeNull();
  });

  it("reports hover enter and leave to the owner", () => {
    const onHoveredEntityChange = vi.fn();
    render(<TurnOrderBar state={state()} onHoveredEntityChange={onHoveredEntityChange} />);

    const token = screen.getByTestId("turn-order-token-enemy-b");
    fireEvent.pointerEnter(token);
    expect(onHoveredEntityChange).toHaveBeenLastCalledWith("enemy-b");
    fireEvent.pointerLeave(token);
    expect(onHoveredEntityChange).toHaveBeenLastCalledWith();
  });
});
